"""
File Upload Router for KAIROS
Handles file uploads to AWS S3 for inventory images, organization logos, and documents
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
import logging
import uuid
import os

from services.s3_service import s3_service
from server import get_current_user, db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/files", tags=["files"])

# Allowed file types and their MIME types
ALLOWED_MIME_TYPES = {
    'image/jpeg': 'image',
    'image/png': 'image',
    'image/gif': 'image',
    'image/webp': 'image',
    'application/pdf': 'pdf',
}

MAX_FILE_SIZE_MB = 25
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


class PresignedUrlRequest(BaseModel):
    """Request model for presigned URL generation"""
    file_name: str
    content_type: str
    file_type: str  # 'inventory', 'logo', 'invoice', 'document'
    organization_id: str


class PresignedUrlResponse(BaseModel):
    """Response model for presigned URL"""
    upload_url: str
    file_key: str
    expiration: int
    public_url: str


class FileUploadConfirmation(BaseModel):
    """Request model for confirming file upload"""
    file_key: str
    file_name: str
    file_size: int
    content_type: str
    organization_id: str
    related_entity_type: Optional[str] = None  # 'inventory_item', 'invoice', 'organization'
    related_entity_id: Optional[str] = None


class FileMetadata(BaseModel):
    """Response model for file metadata"""
    id: str
    file_key: str
    file_name: str
    file_size: int
    content_type: str
    url: str
    created_at: str


@router.get("/config")
async def get_s3_config(current_user: dict = Depends(get_current_user)):
    """Check if S3 is configured and available"""
    return {
        "s3_enabled": s3_service.is_configured(),
        "bucket": s3_service.bucket_name if s3_service.is_configured() else None,
        "region": s3_service.region if s3_service.is_configured() else None,
        "max_file_size_mb": MAX_FILE_SIZE_MB
    }


@router.post("/presigned-upload-url", response_model=PresignedUrlResponse)
async def get_presigned_upload_url(
    request: PresignedUrlRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Generate a presigned URL for direct client upload to S3
    
    This allows the frontend to upload files directly to S3 without 
    passing through the backend, improving performance.
    """
    if not s3_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="S3 storage is not configured. Please contact administrator."
        )
    
    # Validate content type
    if request.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{request.content_type}' is not allowed. Allowed types: {', '.join(ALLOWED_MIME_TYPES.keys())}"
        )
    
    # Generate unique file key
    file_key = s3_service.generate_file_key(
        organization_id=request.organization_id,
        file_type=request.file_type,
        original_filename=request.file_name
    )
    
    # Generate presigned URL
    result = s3_service.generate_presigned_upload_url(
        file_key=file_key,
        content_type=request.content_type,
        expiration=3600  # 1 hour
    )
    
    if not result:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate upload URL"
        )
    
    logger.info(f"Generated presigned URL for {request.file_name} by user {current_user.get('email')}")
    
    return PresignedUrlResponse(
        upload_url=result['upload_url'],
        file_key=result['file_key'],
        expiration=result['expiration'],
        public_url=s3_service.get_public_url(file_key)
    )


@router.post("/confirm-upload")
async def confirm_file_upload(
    confirmation: FileUploadConfirmation,
    current_user: dict = Depends(get_current_user)
):
    """
    Confirm file upload completion and store metadata in database
    
    Called by frontend after successful S3 upload to register the file.
    """
    if not s3_service.is_configured():
        raise HTTPException(status_code=503, detail="S3 storage is not configured")
    
    # Validate file size
    if confirmation.file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File size exceeds maximum of {MAX_FILE_SIZE_MB}MB"
        )
    
    # Store file metadata in MongoDB
    file_doc = {
        'id': str(uuid.uuid4()),
        'file_key': confirmation.file_key,
        'file_name': confirmation.file_name,
        'file_size': confirmation.file_size,
        'content_type': confirmation.content_type,
        'organization_id': confirmation.organization_id,
        'uploaded_by': current_user.get('user_id'),
        'related_entity_type': confirmation.related_entity_type,
        'related_entity_id': confirmation.related_entity_id,
        'url': s3_service.get_public_url(confirmation.file_key),
        'created_at': datetime.utcnow(),
        'is_active': True
    }
    
    await db.files.insert_one(file_doc)
    
    logger.info(f"File upload confirmed: {confirmation.file_name} for org {confirmation.organization_id}")
    
    return {
        "status": "success",
        "file_id": file_doc['id'],
        "file_key": confirmation.file_key,
        "url": file_doc['url']
    }


@router.post("/upload")
async def upload_file_direct(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    file_type: str = Form(...),  # 'inventory', 'logo', 'invoice', 'document'
    related_entity_type: Optional[str] = Form(None),
    related_entity_id: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Direct file upload through backend to S3
    
    Use this for smaller files or when presigned URLs are not suitable.
    For large files, prefer the presigned URL approach.
    """
    if not s3_service.is_configured():
        raise HTTPException(status_code=503, detail="S3 storage is not configured")
    
    # Validate content type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{file.content_type}' is not allowed"
        )
    
    # Read file content
    content = await file.read()
    
    # Validate file size
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File size exceeds maximum of {MAX_FILE_SIZE_MB}MB"
        )
    
    # Generate file key
    file_key = s3_service.generate_file_key(
        organization_id=organization_id,
        file_type=file_type,
        original_filename=file.filename or 'unnamed'
    )
    
    # Upload to S3
    result = await s3_service.upload_file(
        file_content=content,
        file_key=file_key,
        content_type=file.content_type
    )
    
    if not result:
        raise HTTPException(status_code=500, detail="Failed to upload file to S3")
    
    # Store metadata in MongoDB
    file_doc = {
        'id': str(uuid.uuid4()),
        'file_key': file_key,
        'file_name': file.filename,
        'file_size': len(content),
        'content_type': file.content_type,
        'organization_id': organization_id,
        'uploaded_by': current_user.get('user_id'),
        'related_entity_type': related_entity_type,
        'related_entity_id': related_entity_id,
        'url': result['url'],
        'created_at': datetime.utcnow(),
        'is_active': True
    }
    
    await db.files.insert_one(file_doc)
    
    logger.info(f"Direct upload completed: {file.filename} to {file_key}")
    
    return {
        "status": "success",
        "file_id": file_doc['id'],
        "file_key": file_key,
        "url": result['url'],
        "file_name": file.filename,
        "file_size": len(content)
    }


@router.get("/download/{file_id}")
async def get_download_url(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Generate a presigned URL for downloading a file
    """
    if not s3_service.is_configured():
        raise HTTPException(status_code=503, detail="S3 storage is not configured")
    
    # Get file metadata
    file_doc = await db.files.find_one({'id': file_id, 'is_active': True})
    
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Generate presigned download URL
    download_url = s3_service.generate_presigned_download_url(file_doc['file_key'])
    
    if not download_url:
        raise HTTPException(status_code=500, detail="Failed to generate download URL")
    
    return {
        "download_url": download_url,
        "file_name": file_doc['file_name'],
        "content_type": file_doc['content_type']
    }


@router.get("/list")
async def list_files(
    organization_id: str = Query(...),
    file_type: Optional[str] = Query(None),
    related_entity_type: Optional[str] = Query(None),
    related_entity_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """
    List files for an organization with optional filters
    """
    query = {
        'organization_id': organization_id,
        'is_active': True
    }
    
    if file_type:
        query['file_key'] = {'$regex': f'/{file_type}/'}
    
    if related_entity_type:
        query['related_entity_type'] = related_entity_type
    
    if related_entity_id:
        query['related_entity_id'] = related_entity_id
    
    files = await db.files.find(query, {'_id': 0}).sort('created_at', -1).to_list(100)
    
    return files


@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a file from S3 and mark as inactive in database
    """
    if not s3_service.is_configured():
        raise HTTPException(status_code=503, detail="S3 storage is not configured")
    
    # Get file metadata
    file_doc = await db.files.find_one({'id': file_id})
    
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Delete from S3
    s3_deleted = s3_service.delete_object(file_doc['file_key'])
    
    if not s3_deleted:
        logger.warning(f"Failed to delete S3 object {file_doc['file_key']}, marking as inactive anyway")
    
    # Mark as inactive in database (soft delete)
    await db.files.update_one(
        {'id': file_id},
        {
            '$set': {
                'is_active': False,
                'deleted_at': datetime.utcnow(),
                'deleted_by': current_user.get('user_id')
            }
        }
    )
    
    logger.info(f"File deleted: {file_id} by user {current_user.get('email')}")
    
    return {"status": "deleted", "file_id": file_id}


# Convenience endpoints for specific use cases

@router.post("/inventory-image")
async def upload_inventory_image(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    inventory_item_id: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload an image for an inventory item
    """
    if file.content_type not in ['image/jpeg', 'image/png', 'image/gif', 'image/webp']:
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    # Use the direct upload endpoint
    return await upload_file_direct(
        file=file,
        organization_id=organization_id,
        file_type='inventory',
        related_entity_type='inventory_item',
        related_entity_id=inventory_item_id,
        current_user=current_user
    )


@router.post("/organization-logo")
async def upload_organization_logo(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload a logo for an organization
    """
    if file.content_type not in ['image/jpeg', 'image/png', 'image/gif', 'image/webp']:
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    result = await upload_file_direct(
        file=file,
        organization_id=organization_id,
        file_type='logo',
        related_entity_type='organization',
        related_entity_id=organization_id,
        current_user=current_user
    )
    
    # Update organization with logo URL
    if result.get('status') == 'success':
        await db.organizations.update_one(
            {'id': organization_id},
            {'$set': {'logo_url': result['url']}}
        )
    
    return result


@router.post("/invoice-attachment")
async def upload_invoice_attachment(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    invoice_id: str = Form(...),
    invoice_type: str = Form(...),  # 'sales' or 'purchase'
    current_user: dict = Depends(get_current_user)
):
    """
    Upload an attachment (scan, PDF) for an invoice
    """
    result = await upload_file_direct(
        file=file,
        organization_id=organization_id,
        file_type='invoice',
        related_entity_type=f'{invoice_type}_invoice',
        related_entity_id=invoice_id,
        current_user=current_user
    )
    
    # Update invoice with attachment URL
    if result.get('status') == 'success':
        collection = 'sales_invoices' if invoice_type == 'sales' else 'purchase_invoices'
        await db[collection].update_one(
            {'id': invoice_id},
            {
                '$push': {
                    'attachments': {
                        'file_id': result['file_id'],
                        'url': result['url'],
                        'file_name': result['file_name'],
                        'uploaded_at': datetime.utcnow().isoformat()
                    }
                }
            }
        )
    
    return result


@router.post("/service-image")
async def upload_service_image(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    service_item_id: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload an image for a service item
    """
    if file.content_type not in ['image/jpeg', 'image/png', 'image/gif', 'image/webp']:
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    # Verify service item exists
    service = await db.service_items.find_one({'id': service_item_id}, {'_id': 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service item not found")
    
    result = await upload_file_direct(
        file=file,
        organization_id=organization_id,
        file_type='services',
        related_entity_type='service_item',
        related_entity_id=service_item_id,
        current_user=current_user
    )
    
    # Update service item with image URL
    if result.get('status') == 'success':
        await db.service_items.update_one(
            {'id': service_item_id},
            {'$set': {
                'image_url': result['url'],
                'image_s3_key': result.get('file_key', '')
            }}
        )
    
    return result