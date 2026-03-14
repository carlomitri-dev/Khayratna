"""
Receipt Settings Router
Manages POS receipt customization per organization.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from typing import Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
import os
import uuid
import jwt
import base64
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter(prefix="/receipt-settings", tags=["Receipt Settings"])

mongo_url = os.environ.get('MONGO_URL')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME')]

JWT_SECRET = os.environ.get('JWT_SECRET', 'lebanese-accounting-secret-key-2024')
JWT_ALGORITHM = "HS256"
security = HTTPBearer()

UPLOAD_DIR = "/app/uploads/logos"
os.makedirs(UPLOAD_DIR, exist_ok=True)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({'id': payload['user_id']}, {'_id': 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


class ReceiptSettingsUpdate(BaseModel):
    store_name: Optional[str] = None
    store_name_ar: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    phone: Optional[str] = None
    vat_number: Optional[str] = None
    footer_message: Optional[str] = None
    footer_message_ar: Optional[str] = None
    printer_width: Optional[str] = "80mm"  # 58mm, 72mm, 80mm
    show_logo: Optional[bool] = True
    show_vat_number: Optional[bool] = True
    show_barcode: Optional[bool] = True
    show_qr: Optional[bool] = False
    font_size: Optional[str] = "12px"


DEFAULT_SETTINGS = {
    'store_name': '',
    'store_name_ar': '',
    'address_line1': '',
    'address_line2': '',
    'phone': '',
    'vat_number': '',
    'footer_message': 'Thank you for your business!',
    'footer_message_ar': '',
    'printer_width': '80mm',
    'show_logo': True,
    'show_vat_number': True,
    'show_barcode': True,
    'show_qr': False,
    'font_size': '12px',
    'logo_url': None,
}


@router.get("")
async def get_receipt_settings(
    organization_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get receipt settings for an organization."""
    settings = await db.receipt_settings.find_one(
        {'organization_id': organization_id},
        {'_id': 0}
    )
    if not settings:
        return {**DEFAULT_SETTINGS, 'organization_id': organization_id}
    return settings


@router.put("")
async def update_receipt_settings(
    organization_id: str,
    data: ReceiptSettingsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update receipt settings for an organization."""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Admin access required")

    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data['organization_id'] = organization_id
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    update_data['updated_by'] = current_user['id']

    existing = await db.receipt_settings.find_one({'organization_id': organization_id})
    if existing:
        await db.receipt_settings.update_one(
            {'organization_id': organization_id},
            {'$set': update_data}
        )
    else:
        update_data['id'] = str(uuid.uuid4())
        update_data['created_at'] = datetime.now(timezone.utc).isoformat()
        await db.receipt_settings.insert_one(update_data)

    result = await db.receipt_settings.find_one(
        {'organization_id': organization_id},
        {'_id': 0}
    )
    return result


@router.post("/logo")
async def upload_receipt_logo(
    organization_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a logo for the receipt header."""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Admin access required")

    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")

    content = await file.read()
    if len(content) > 500_000:  # 500KB max for receipt logo
        raise HTTPException(status_code=400, detail="Logo must be under 500KB")

    # Save as base64 data URI for easy embedding in receipt HTML
    b64 = base64.b64encode(content).decode('utf-8')
    logo_data_uri = f"data:{file.content_type};base64,{b64}"

    # Also save to disk as backup
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'png'
    filename = f"{organization_id}_logo.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, 'wb') as f:
        f.write(content)

    # Update settings
    existing = await db.receipt_settings.find_one({'organization_id': organization_id})
    if existing:
        await db.receipt_settings.update_one(
            {'organization_id': organization_id},
            {'$set': {
                'logo_url': logo_data_uri,
                'logo_filename': filename,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        await db.receipt_settings.insert_one({
            'id': str(uuid.uuid4()),
            'organization_id': organization_id,
            **DEFAULT_SETTINGS,
            'logo_url': logo_data_uri,
            'logo_filename': filename,
            'created_at': datetime.now(timezone.utc).isoformat()
        })

    return {'logo_url': logo_data_uri, 'filename': filename}


@router.delete("/logo")
async def delete_receipt_logo(
    organization_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove the logo from receipt settings."""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Admin access required")

    await db.receipt_settings.update_one(
        {'organization_id': organization_id},
        {'$set': {'logo_url': None, 'logo_filename': None}}
    )
    return {'message': 'Logo removed'}
