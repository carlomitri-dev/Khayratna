"""
Inventory Router - Complete inventory management endpoints
Refactored from server.py for modularity
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pathlib import Path
import uuid
import os
import logging
import httpx
import tempfile

from core.database import db
from core.auth import get_current_user
from models.schemas import (
    InventoryItemCreate, InventoryItemUpdate, InventoryItemResponse,
    InventoryCategoryCreate, InventoryCategoryUpdate, InventoryCategoryResponse,
    ServiceItemCreate, ServiceItemUpdate, ServiceItemResponse
)

router = APIRouter(tags=["Inventory"])
logger = logging.getLogger(__name__)

# Uploads directory for inventory images
UPLOADS_DIR = Path("/app/uploads")
INVENTORY_IMAGES_DIR = UPLOADS_DIR / "inventory"
INVENTORY_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# ================== NAFITHA ARABIC DECODER ==================
NAFITHA_TO_UNICODE = {
    0xAB: 'ا', 0xF5: 'ل', 0xE0: 'ا', 0xF6: 'و', 0xFD: 'ك',
    0xE7: 'ة', 0xFB: 'ق', 0xAD: 'ن', 0xAC: 'م', 0xF8: 'ع',
    0xE9: 'ث', 0xE3: 'آ', 0xE4: 'ء', 0xE5: 'ئ', 0xE6: 'ب',
    0xE8: 'ت', 0xEA: 'ج', 0xEB: 'ح', 0xEC: 'خ', 0xED: 'د',
    0xEE: 'ذ', 0xEF: 'ر', 0xF0: 'ز', 0xF1: 'س', 0xF2: 'ش',
    0xF3: 'ص', 0xF4: 'ض', 0xF9: 'غ', 0xFA: 'ـ', 0xFC: 'ف',
    0xA5: 'ه', 0xA6: 'ؤ', 0xA7: 'ي', 0xA8: 'ى', 0xAA: 'لا',
    0xA9: 'ﻻ', 0xE1: 'أ', 0xE2: 'إ', 0x98: 'ط', 0x81: '', 0x00: '',
}

def decode_nafitha_arabic(text: str) -> str:
    if not text:
        return ''
    try:
        raw_bytes = text.encode('latin-1')
        result = []
        for b in raw_bytes:
            if b in NAFITHA_TO_UNICODE:
                result.append(NAFITHA_TO_UNICODE[b])
            elif 0x20 <= b <= 0x7E:
                result.append(chr(b))
        return ''.join(result).strip()
    except Exception:
        return text.strip()

def detect_nafitha_encoding(text: str) -> bool:
    if not text:
        return False
    try:
        raw_bytes = text.encode('latin-1')
        nafitha_chars = sum(1 for b in raw_bytes if b in NAFITHA_TO_UNICODE and b > 0x7F)
        return nafitha_chars > len(raw_bytes) * 0.3
    except Exception:
        return False


# ================== BARCODE SPIDER API ==================

BARCODE_SPIDER_API_URL = "https://api.barcodespider.com/v1/lookup"
BARCODE_SPIDER_API_KEY = os.environ.get('BARCODE_SPIDER_API_KEY', '')

@router.get("/barcode-lookup/{barcode}")
async def lookup_barcode(
    barcode: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Lookup product information from Barcode Spider API.
    Returns product name, description, category, images, and other details.
    """
    if not BARCODE_SPIDER_API_KEY:
        raise HTTPException(
            status_code=503, 
            detail="Barcode Spider API key not configured. Please add BARCODE_SPIDER_API_KEY to environment."
        )
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                BARCODE_SPIDER_API_URL,
                params={
                    'token': BARCODE_SPIDER_API_KEY,
                    'upc': barcode
                }
            )
            
            if response.status_code != 200:
                logger.warning(f"Barcode Spider API returned status {response.status_code}")
                return {
                    "found": False,
                    "message": f"API returned status {response.status_code}",
                    "barcode": barcode
                }
            
            data = response.json()
            
            # Check if item was found
            item_response = data.get('item_response', {})
            if item_response.get('code') != 200:
                return {
                    "found": False,
                    "message": item_response.get('message', 'Product not found'),
                    "barcode": barcode
                }
            
            # Extract product attributes
            attributes = data.get('item_attributes', {})
            
            # Get all available images
            images = []
            if attributes.get('image'):
                images.append(attributes['image'])
            # Check for additional images in the response
            for key in ['image_2', 'image_3', 'image_4', 'image_5']:
                if attributes.get(key):
                    images.append(attributes[key])
            
            return {
                "found": True,
                "barcode": barcode,
                "name": attributes.get('title', ''),
                "description": attributes.get('description', ''),
                "category": attributes.get('category', ''),
                "brand": attributes.get('brand', ''),
                "manufacturer": attributes.get('manufacturer', ''),
                "mpn": attributes.get('mpn', ''),  # Manufacturer Part Number
                "model": attributes.get('model', ''),
                "color": attributes.get('color', ''),
                "size": attributes.get('size', ''),
                "weight": attributes.get('weight', ''),
                "images": images,
                "image": images[0] if images else None,
                # Additional details that might be useful
                "asin": attributes.get('asin', ''),
                "upc": attributes.get('upc', barcode),
                "ean": attributes.get('ean', ''),
                # Raw attributes for debugging/extensibility
                "raw_attributes": attributes
            }
            
    except httpx.TimeoutException:
        logger.error(f"Barcode Spider API timeout for barcode: {barcode}")
        return {
            "found": False,
            "message": "API request timed out",
            "barcode": barcode
        }
    except Exception as e:
        logger.error(f"Barcode Spider API error: {str(e)}")
        return {
            "found": False,
            "message": f"API error: {str(e)}",
            "barcode": barcode
        }


@router.post("/inventory/{item_id}/upload-image-from-url")
async def upload_image_from_url(
    item_id: str,
    image_url: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Download an image from an external URL and upload it to S3 for an inventory item.
    Used for auto-importing product images from Barcode Spider.
    """
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    try:
        # Download image from external URL
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(image_url)
            
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail=f"Failed to download image: HTTP {response.status_code}")
            
            content = response.content
            content_type = response.headers.get('content-type', 'image/jpeg')
            
            # Validate it's an image
            if not content_type.startswith('image/'):
                raise HTTPException(status_code=400, detail="URL does not point to a valid image")
            
            # Determine file extension
            ext_map = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/gif': 'gif',
                'image/webp': 'webp'
            }
            file_ext = ext_map.get(content_type, 'jpg')
        
        # Try S3 upload first
        try:
            from services.s3_service import s3_service
            
            if s3_service.is_configured():
                organization_id = item.get('organization_id', 'default')
                
                # Delete old S3 image if exists
                if item.get('image_s3_key'):
                    s3_service.delete_object(item['image_s3_key'])
                
                # Generate S3 key
                file_key = s3_service.generate_file_key(
                    organization_id=organization_id,
                    file_type='inventory',
                    original_filename=f"{item_id}.{file_ext}"
                )
                
                # Upload to S3
                result = await s3_service.upload_file(
                    file_content=content,
                    file_key=file_key,
                    content_type=content_type
                )
                
                if result:
                    # Delete old local file if exists
                    if item.get('image_filename'):
                        old_filepath = INVENTORY_IMAGES_DIR / item['image_filename']
                        if old_filepath.exists():
                            old_filepath.unlink()
                    
                    # Update item with S3 URL
                    await db.inventory_items.update_one(
                        {'id': item_id},
                        {'$set': {
                            'image_url': result['url'],
                            'image_s3_key': file_key,
                            'image_filename': None,
                            'updated_at': datetime.now(timezone.utc).isoformat()
                        }}
                    )
                    
                    logger.info(f"Image downloaded from URL and uploaded to S3 for item {item_id}")
                    return {
                        "message": "Image uploaded to S3 successfully",
                        "image_url": result['url'],
                        "storage": "s3"
                    }
        except ImportError:
            logger.warning("S3 service not available, falling back to local storage")
        except Exception as e:
            logger.error(f"S3 upload failed, falling back to local: {str(e)}")
        
        # Fallback to local storage
        filename = f"{item_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}.{file_ext}"
        filepath = INVENTORY_IMAGES_DIR / filename
        
        with open(filepath, 'wb') as f:
            f.write(content)
        
        # Delete old local image if exists
        old_filename = item.get('image_filename')
        if old_filename:
            old_filepath = INVENTORY_IMAGES_DIR / old_filename
            if old_filepath.exists():
                old_filepath.unlink()
        
        image_url_local = f"/api/inventory/image/{filename}"
        await db.inventory_items.update_one(
            {'id': item_id},
            {'$set': {
                'image_url': image_url_local,
                'image_filename': filename,
                'image_s3_key': None,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }}
        )
        
        logger.info(f"Image downloaded from URL and saved locally for item {item_id}")
        return {"message": "Image uploaded successfully", "image_url": image_url_local, "storage": "local"}
        
    except httpx.TimeoutException:
        raise HTTPException(status_code=408, detail="Image download timed out")
    except Exception as e:
        logger.error(f"Error uploading image from URL: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {str(e)}")


# ================== INVENTORY ITEMS ==================

@router.get("/inventory")
async def get_inventory_items(
    organization_id: str,
    search: Optional[str] = None,
    category_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    low_stock: bool = False,
    expiring_soon: bool = False,
    page: int = 1,
    page_size: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get inventory items with optional filters and pagination"""
    query = {'organization_id': organization_id}
    
    if category_id:
        query['category_id'] = category_id
    if supplier_id:
        query['supplier_id'] = supplier_id
    
    if search:
        query['$or'] = [
            {'name': {'$regex': search, '$options': 'i'}},
            {'barcode': {'$regex': search, '$options': 'i'}},
            {'sku': {'$regex': search, '$options': 'i'}},
            {'name_ar': {'$regex': search, '$options': 'i'}}
        ]
    
    total_count = await db.inventory_items.count_documents(query)
    skip = (page - 1) * page_size
    items = await db.inventory_items.find(query, {'_id': 0}).sort('name', 1).skip(skip).limit(page_size).to_list(page_size)
    
    if low_stock:
        items = [item for item in items if item.get('on_hand_qty', 0) <= item.get('min_qty', 0)]
    
    if expiring_soon:
        threshold = (datetime.now() + timedelta(days=30)).isoformat()[:10]
        items = [item for item in items if item.get('expiry_date') and item['expiry_date'] <= threshold]
    
    # Enrich with category and supplier names
    for item in items:
        if item.get('category_id'):
            category = await db.inventory_categories.find_one({'$or': [{'id': item['category_id']}, {'cat_id': item['category_id']}]}, {'name': 1})
            item['category_name'] = category['name'] if category else None
        else:
            item['category_name'] = None
        if item.get('supplier_id'):
            supplier = await db.accounts.find_one({'$or': [{'id': item['supplier_id']}, {'code': item['supplier_id']}]}, {'name': 1})
            item['supplier_name'] = supplier['name'] if supplier else None
        else:
            item['supplier_name'] = None
    
    return {
        'items': items,
        'total': total_count,
        'page': page,
        'page_size': page_size,
        'total_pages': (total_count + page_size - 1) // page_size
    }


@router.get("/inventory/{item_id}", response_model=InventoryItemResponse)
async def get_inventory_item(item_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single inventory item by ID"""
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    if item.get('category_id'):
        category = await db.inventory_categories.find_one({'$or': [{'id': item['category_id']}, {'cat_id': item['category_id']}]}, {'name': 1})
        item['category_name'] = category['name'] if category else None
    else:
        item['category_name'] = None
    if item.get('supplier_id'):
        supplier = await db.accounts.find_one({'$or': [{'id': item['supplier_id']}, {'code': item['supplier_id']}]}, {'name': 1})
        item['supplier_name'] = supplier['name'] if supplier else None
    else:
        item['supplier_name'] = None
    
    return InventoryItemResponse(**item)


@router.post("/inventory", response_model=InventoryItemResponse)
async def create_inventory_item(item_data: InventoryItemCreate, current_user: dict = Depends(get_current_user)):
    """Create a new inventory item"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if item_data.barcode:
        existing = await db.inventory_items.find_one({
            'barcode': item_data.barcode,
            'organization_id': item_data.organization_id
        })
        if existing:
            raise HTTPException(status_code=400, detail="Barcode already exists")
    
    item_id = str(uuid.uuid4())
    item_doc = {
        'id': item_id,
        'barcode': item_data.barcode,
        'name': item_data.name,
        'name_ar': item_data.name_ar,
        'category_id': item_data.category_id,
        'supplier_id': item_data.supplier_id,
        'cost': item_data.cost,
        'price': item_data.price,
        'currency': item_data.currency,
        'min_qty': item_data.min_qty,
        'on_hand_qty': item_data.on_hand_qty,
        'initial_quantity': item_data.on_hand_qty,
        'unit': item_data.unit,
        'expiry_date': item_data.expiry_date,
        'description': item_data.description,
        'is_active': item_data.is_active,
        'organization_id': item_data.organization_id,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'created_by': current_user['id']
    }
    
    await db.inventory_items.insert_one(item_doc)
    
    item_doc['category_name'] = None
    item_doc['supplier_name'] = None
    
    if item_data.category_id:
        category = await db.inventory_categories.find_one({'$or': [{'id': item_data.category_id}, {'cat_id': item_data.category_id}]}, {'name': 1})
        item_doc['category_name'] = category['name'] if category else None
    if item_data.supplier_id:
        supplier = await db.accounts.find_one({'$or': [{'id': item_data.supplier_id}, {'code': item_data.supplier_id}]}, {'name': 1})
        item_doc['supplier_name'] = supplier['name'] if supplier else None
    
    return InventoryItemResponse(**item_doc)


@router.put("/inventory/{item_id}", response_model=InventoryItemResponse)
async def update_inventory_item(item_id: str, item_data: InventoryItemUpdate, current_user: dict = Depends(get_current_user)):
    """Update an inventory item"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    update_doc = {}
    for field, value in item_data.model_dump(exclude_unset=True).items():
        update_doc[field] = value
    
    update_doc['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    if update_doc:
        await db.inventory_items.update_one({'id': item_id}, {'$set': update_doc})
    
    updated = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    
    if updated.get('category_id'):
        category = await db.inventory_categories.find_one({'$or': [{'id': updated['category_id']}, {'cat_id': updated['category_id']}]}, {'name': 1})
        updated['category_name'] = category['name'] if category else None
    else:
        updated['category_name'] = None
    if updated.get('supplier_id'):
        supplier = await db.accounts.find_one({'$or': [{'id': updated['supplier_id']}, {'code': updated['supplier_id']}]}, {'name': 1})
        updated['supplier_name'] = supplier['name'] if supplier else None
    else:
        updated['supplier_name'] = None
    
    return InventoryItemResponse(**updated)


@router.delete("/inventory/{item_id}")
async def delete_inventory_item(item_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an inventory item"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    await db.inventory_items.delete_one({'id': item_id})
    return {"message": "Inventory item deleted successfully"}


# ================== INVENTORY CATEGORIES ==================

@router.get("/inventory-categories", response_model=List[InventoryCategoryResponse])
async def get_inventory_categories(
    organization_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all inventory categories for an organization"""
    query = {'organization_id': organization_id}
    categories = await db.inventory_categories.find(query, {'_id': 0}).sort('name', 1).to_list(1000)
    return [InventoryCategoryResponse(**cat) for cat in categories]


@router.post("/inventory-categories", response_model=InventoryCategoryResponse)
async def create_inventory_category(
    category_data: InventoryCategoryCreate, 
    current_user: dict = Depends(get_current_user)
):
    """Create a new inventory category"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    existing = await db.inventory_categories.find_one({
        'name': category_data.name,
        'organization_id': category_data.organization_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Category with this name already exists")
    
    category_id = str(uuid.uuid4())
    category_doc = {
        'id': category_id,
        'name': category_data.name,
        'name_ar': category_data.name_ar,
        'description': category_data.description,
        'organization_id': category_data.organization_id,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.inventory_categories.insert_one(category_doc)
    return InventoryCategoryResponse(**category_doc)


@router.put("/inventory-categories/{category_id}", response_model=InventoryCategoryResponse)
async def update_inventory_category(
    category_id: str,
    category_data: InventoryCategoryUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an inventory category"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    category = await db.inventory_categories.find_one({'id': category_id}, {'_id': 0})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    update_doc = {}
    for field, value in category_data.model_dump(exclude_unset=True).items():
        update_doc[field] = value
    
    if update_doc:
        await db.inventory_categories.update_one({'id': category_id}, {'$set': update_doc})
    
    updated = await db.inventory_categories.find_one({'id': category_id}, {'_id': 0})
    return InventoryCategoryResponse(**updated)


@router.delete("/inventory-categories/{category_id}")
async def delete_inventory_category(category_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an inventory category"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    category = await db.inventory_categories.find_one({'id': category_id}, {'_id': 0})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    items_using = await db.inventory_items.count_documents({'category_id': category_id})
    if items_using > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete category: {items_using} item(s) are using this category"
        )
    
    await db.inventory_categories.delete_one({'id': category_id})
    return {"message": "Category deleted successfully"}


# ================== SERVICE ITEMS ==================

@router.get("/service-items", response_model=List[ServiceItemResponse])
async def get_service_items(
    organization_id: str,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get service items"""
    query = {'organization_id': organization_id}
    if search:
        query['$or'] = [
            {'name': {'$regex': search, '$options': 'i'}},
            {'name_ar': {'$regex': search, '$options': 'i'}}
        ]
    items = await db.service_items.find(query, {'_id': 0}).sort('name', 1).to_list(1000)
    return [ServiceItemResponse(**item) for item in items]


@router.get("/service-items/{item_id}", response_model=ServiceItemResponse)
async def get_service_item(item_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single service item"""
    item = await db.service_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Service item not found")
    return ServiceItemResponse(**item)


@router.post("/service-items", response_model=ServiceItemResponse)
async def create_service_item(item_data: ServiceItemCreate, current_user: dict = Depends(get_current_user)):
    """Create a new service item"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item_id = str(uuid.uuid4())
    item_doc = {
        'id': item_id,
        **item_data.model_dump(),
        'created_at': datetime.now(timezone.utc).isoformat(),
        'created_by': current_user['id']
    }
    await db.service_items.insert_one(item_doc)
    return ServiceItemResponse(**item_doc)


@router.put("/service-items/{item_id}", response_model=ServiceItemResponse)
async def update_service_item(item_id: str, item_data: ServiceItemUpdate, current_user: dict = Depends(get_current_user)):
    """Update a service item"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.service_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Service item not found")
    
    update_doc = {k: v for k, v in item_data.model_dump(exclude_unset=True).items()}
    update_doc['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.service_items.update_one({'id': item_id}, {'$set': update_doc})
    updated = await db.service_items.find_one({'id': item_id}, {'_id': 0})
    return ServiceItemResponse(**updated)


@router.delete("/service-items/{item_id}")
async def delete_service_item(item_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a service item"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.service_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Service item not found")
    
    await db.service_items.delete_one({'id': item_id})
    return {"message": "Service item deleted successfully"}


# ================== INVENTORY SUPPLIERS ==================

@router.get("/inventory-suppliers")
async def get_inventory_suppliers(
    organization_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get accounts that can be suppliers (account_class 4)"""
    suppliers = await db.accounts.find(
        {'organization_id': organization_id, 'account_class': 4},
        {'_id': 0, 'id': 1, 'code': 1, 'name': 1, 'name_ar': 1}
    ).sort('code', 1).to_list(1000)
    return suppliers


# ================== INVENTORY STATS ==================

@router.get("/inventory/stats/summary")
async def get_inventory_stats(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Get inventory statistics summary"""
    pipeline = [
        {'$match': {'organization_id': organization_id}},
        {'$group': {
            '_id': None,
            'total_items': {'$sum': 1},
            'active_items': {'$sum': {'$cond': [{'$ne': ['$is_active', False]}, 1, 0]}},
            'low_stock_count': {'$sum': {'$cond': [{'$lte': ['$on_hand_qty', '$min_qty']}, 1, 0]}}
        }}
    ]
    
    stats_result = await db.inventory_items.aggregate(pipeline).to_list(1)
    stats = stats_result[0] if stats_result else {'total_items': 0, 'active_items': 0, 'low_stock_count': 0}
    
    total_count = await db.inventory_items.count_documents({'organization_id': organization_id})
    
    org = await db.organizations.find_one({'id': organization_id}, {'_id': 0})
    lbp_rate = org.get('lbp_rate', 89500) if org else 89500
    
    value_pipeline = [
        {'$match': {'organization_id': organization_id}},
        {'$project': {
            'cost_value': {'$multiply': [{'$ifNull': ['$cost', 0]}, {'$ifNull': ['$on_hand_qty', 0]}]},
            'retail_value': {'$multiply': [{'$ifNull': ['$price', 0]}, {'$ifNull': ['$on_hand_qty', 0]}]},
            'currency': {'$ifNull': ['$currency', 'USD']}
        }},
        {'$group': {
            '_id': '$currency',
            'total_cost': {'$sum': '$cost_value'},
            'total_retail': {'$sum': '$retail_value'}
        }}
    ]
    
    value_result = await db.inventory_items.aggregate(value_pipeline).to_list(10)
    
    total_cost_value = 0
    total_retail_value = 0
    for v in value_result:
        if v['_id'] == 'LBP':
            total_cost_value += v['total_cost'] / lbp_rate
            total_retail_value += v['total_retail'] / lbp_rate
        else:
            total_cost_value += v['total_cost']
            total_retail_value += v['total_retail']
    
    threshold = (datetime.now() + timedelta(days=30)).isoformat()[:10]
    expiring_count = await db.inventory_items.count_documents({
        'organization_id': organization_id,
        'expiry_date': {'$lte': threshold, '$ne': None}
    })
    
    return {
        'total_items': total_count,
        'active_items': stats.get('active_items', 0),
        'low_stock_items': stats.get('low_stock_count', 0),
        'expiring_items': expiring_count,
        'total_cost_value': round(total_cost_value, 2),
        'total_retail_value': round(total_retail_value, 2),
        'lbp_rate': lbp_rate
    }


# ================== INVENTORY MOVEMENTS ==================

@router.get("/inventory/{item_id}/movements")
async def get_inventory_movements(item_id: str, current_user: dict = Depends(get_current_user)):
    """Get inventory movement history (ledger) for an item"""
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    movements = []
    
    # Get all sales invoices containing this item (posted only)
    sales_pipeline = [
        {'$match': {
            'organization_id': item['organization_id'],
            'is_posted': True,
            '$or': [
                {'lines.inventory_item_id': item_id},
                {'lines.used_items.inventory_item_id': item_id}
            ]
        }},
        {'$sort': {'date': 1, 'created_at': 1}}
    ]
    
    sales_invoices = await db.sales_invoices.aggregate(sales_pipeline).to_list(1000)
    
    for inv in sales_invoices:
        for line in inv.get('lines', []):
            if line.get('inventory_item_id') == item_id:
                movements.append({
                    'date': inv['date'], 'type': 'sale', 'document_type': 'Sales Invoice',
                    'document_number': inv['invoice_number'], 'document_id': inv['id'],
                    'description': f"Sold to {inv.get('debit_account_name', 'Customer')}",
                    'qty_out': line['quantity'], 'qty_in': 0,
                    'unit_price': line.get('unit_price', 0), 'cost': item.get('cost', 0),
                    'currency': line.get('currency', 'USD')
                })
            for used in line.get('used_items', []):
                if used.get('inventory_item_id') == item_id:
                    movements.append({
                        'date': inv['date'], 'type': 'used', 'document_type': 'Sales Invoice (Used)',
                        'document_number': inv['invoice_number'], 'document_id': inv['id'],
                        'description': f"Used in service for {inv.get('debit_account_name', 'Customer')}",
                        'qty_out': used.get('quantity', 0), 'qty_in': 0,
                        'unit_price': 0, 'cost': item.get('cost', 0), 'currency': 'USD'
                    })
    
    # Get all purchase invoices containing this item (posted only)
    purchase_pipeline = [
        {'$match': {'organization_id': item['organization_id'], 'is_posted': True, 'lines.inventory_item_id': item_id}},
        {'$sort': {'date': 1, 'created_at': 1}}
    ]
    purchase_invoices = await db.purchase_invoices.aggregate(purchase_pipeline).to_list(1000)
    
    for inv in purchase_invoices:
        for line in inv.get('lines', []):
            if line.get('inventory_item_id') == item_id:
                movements.append({
                    'date': inv['date'], 'type': 'purchase', 'document_type': 'Purchase Invoice',
                    'document_number': inv['invoice_number'], 'document_id': inv['id'],
                    'description': f"Purchased from {inv.get('credit_account_name', 'Supplier')}",
                    'qty_out': 0, 'qty_in': line['quantity'],
                    'unit_price': line.get('unit_price', 0), 'cost': line.get('unit_price', 0),
                    'currency': line.get('currency', 'USD')
                })
    
    # Get POS transactions
    pos_pipeline = [
        {'$match': {'organization_id': item['organization_id'], 'lines.inventory_item_id': item_id}},
        {'$sort': {'date': 1, 'time': 1}}
    ]
    pos_transactions = await db.pos_transactions.aggregate(pos_pipeline).to_list(1000)
    
    for pos in pos_transactions:
        for line in pos.get('lines', []):
            if line.get('inventory_item_id') == item_id:
                movements.append({
                    'date': pos['date'], 'type': 'pos', 'document_type': 'POS Sale',
                    'document_number': pos['receipt_number'], 'document_id': pos['id'],
                    'description': f"POS Sale{' to ' + pos.get('customer_name') if pos.get('customer_name') else ''}",
                    'qty_out': line['quantity'], 'qty_in': 0,
                    'unit_price': line.get('unit_price', 0), 'cost': item.get('cost', 0),
                    'currency': line.get('currency', 'USD')
                })
    
    # Sort and calculate running balance
    movements.sort(key=lambda x: (x['date'], x.get('document_number', '')))
    
    current_qty = item.get('on_hand_qty', 0)
    total_in = sum(mov['qty_in'] for mov in movements)
    total_out = sum(mov['qty_out'] for mov in movements)
    initial_qty = item.get('initial_quantity', 0)
    calculated_opening = current_qty - total_in + total_out
    opening_qty = initial_qty if initial_qty > 0 else (calculated_opening if calculated_opening > 0 and len(movements) > 0 else 0)
    
    if opening_qty > 0:
        created_at = item.get('created_at', '')
        opening_date = created_at[:10] if created_at else '1900-01-01'
        movements.insert(0, {
            'date': opening_date, 'type': 'opening', 'document_type': 'Opening Balance',
            'document_number': 'OB-INIT', 'document_id': None,
            'description': 'Initial stock / Opening balance',
            'qty_out': 0, 'qty_in': opening_qty,
            'unit_price': item.get('cost', 0), 'cost': item.get('cost', 0), 'currency': 'USD'
        })
    
    running_qty = 0
    for mov in movements:
        running_qty += mov['qty_in'] - mov['qty_out']
        mov['balance'] = running_qty
    
    return {
        'item': {
            'id': item['id'], 'name': item['name'], 'barcode': item.get('barcode'),
            'current_qty': item.get('on_hand_qty', 0), 'cost': item.get('cost', 0), 'price': item.get('price', 0)
        },
        'movements': movements
    }


# ================== QUANTITY ADJUSTMENT ==================

@router.post("/inventory/{item_id}/adjust-quantity")
async def adjust_inventory_quantity(
    item_id: str,
    adjustment: float,
    reason: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Adjust inventory quantity (add or subtract)"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    new_qty = item.get('on_hand_qty', 0) + adjustment
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Cannot reduce quantity below zero")
    
    await db.inventory_items.update_one(
        {'id': item_id},
        {'$set': {'on_hand_qty': new_qty, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    adjustment_log = {
        'id': str(uuid.uuid4()),
        'item_id': item_id,
        'previous_qty': item.get('on_hand_qty', 0),
        'adjustment': adjustment,
        'new_qty': new_qty,
        'reason': reason,
        'adjusted_by': current_user['id'],
        'adjusted_at': datetime.now(timezone.utc).isoformat()
    }
    await db.inventory_adjustments.insert_one(adjustment_log)
    
    return {"message": "Quantity adjusted successfully", "new_qty": new_qty}


# ================== BATCH MANAGEMENT ==================

@router.get("/inventory/{item_id}/batches")
async def get_inventory_batches(item_id: str, current_user: dict = Depends(get_current_user)):
    """Get all batches for an inventory item"""
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item.get('batches', [])


@router.post("/inventory/{item_id}/batches")
async def add_inventory_batch(
    item_id: str,
    batch_number: str,
    quantity: float,
    expiry_date: str = None,
    cost: float = None,
    current_user: dict = Depends(get_current_user)
):
    """Add a new batch to an inventory item"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    batches = item.get('batches', [])
    existing = next((b for b in batches if b.get('batch_number') == batch_number), None)
    if existing:
        raise HTTPException(status_code=400, detail="Batch number already exists")
    
    new_batch = {
        'id': str(uuid.uuid4()),
        'batch_number': batch_number,
        'quantity': quantity,
        'original_quantity': quantity,
        'expiry_date': expiry_date,
        'cost': cost if cost is not None else item.get('cost', 0),
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    batches.append(new_batch)
    new_total = sum(b.get('quantity', 0) for b in batches)
    
    await db.inventory_items.update_one(
        {'id': item_id},
        {'$set': {'batches': batches, 'on_hand_qty': new_total, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    return new_batch


@router.put("/inventory/{item_id}/batches/{batch_id}")
async def update_inventory_batch(
    item_id: str,
    batch_id: str,
    batch_number: str = None,
    quantity: float = None,
    expiry_date: str = None,
    cost: float = None,
    current_user: dict = Depends(get_current_user)
):
    """Update a batch"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    batches = item.get('batches', [])
    batch_idx = next((i for i, b in enumerate(batches) if b.get('id') == batch_id), None)
    if batch_idx is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    batch = batches[batch_idx]
    if batch_number is not None:
        batch['batch_number'] = batch_number
    if quantity is not None:
        batch['quantity'] = quantity
    if expiry_date is not None:
        batch['expiry_date'] = expiry_date
    if cost is not None:
        batch['cost'] = cost
    batch['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    batches[batch_idx] = batch
    new_total = sum(b.get('quantity', 0) for b in batches)
    
    await db.inventory_items.update_one(
        {'id': item_id},
        {'$set': {'batches': batches, 'on_hand_qty': new_total, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    return batch


@router.delete("/inventory/{item_id}/batches/{batch_id}")
async def delete_inventory_batch(item_id: str, batch_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a batch"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    batches = item.get('batches', [])
    new_batches = [b for b in batches if b.get('id') != batch_id]
    if len(new_batches) == len(batches):
        raise HTTPException(status_code=404, detail="Batch not found")
    
    new_total = sum(b.get('quantity', 0) for b in new_batches)
    
    await db.inventory_items.update_one(
        {'id': item_id},
        {'$set': {'batches': new_batches, 'on_hand_qty': new_total, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Batch deleted successfully"}


@router.post("/inventory/{item_id}/batches/{batch_id}/deduct")
async def deduct_from_batch(
    item_id: str,
    batch_id: str,
    quantity: float,
    reason: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Deduct quantity from a specific batch"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    batches = item.get('batches', [])
    batch_idx = next((i for i, b in enumerate(batches) if b.get('id') == batch_id), None)
    if batch_idx is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    batch = batches[batch_idx]
    current_qty = batch.get('quantity', 0)
    if quantity > current_qty:
        raise HTTPException(status_code=400, detail=f"Cannot deduct {quantity} from batch with only {current_qty} available")
    
    batch['quantity'] = current_qty - quantity
    batch['updated_at'] = datetime.now(timezone.utc).isoformat()
    batches[batch_idx] = batch
    
    new_total = sum(b.get('quantity', 0) for b in batches)
    
    await db.inventory_items.update_one(
        {'id': item_id},
        {'$set': {'batches': batches, 'on_hand_qty': new_total, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Batch quantity deducted", "new_batch_qty": batch['quantity'], "new_total_qty": new_total}


# ================== IMAGE OPERATIONS ==================

@router.post("/inventory/{item_id}/upload-image")
async def upload_inventory_image(
    item_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload an image for an inventory item - uses S3 if configured, otherwise local storage"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Only JPEG, PNG, GIF, WEBP allowed")
    
    content = await file.read()
    
    # Try S3 upload first
    try:
        from services.s3_service import s3_service
        
        if s3_service.is_configured():
            organization_id = item.get('organization_id', 'default')
            
            # Delete old S3 image if exists
            if item.get('image_s3_key'):
                s3_service.delete_object(item['image_s3_key'])
            
            # Generate S3 key
            file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
            file_key = s3_service.generate_file_key(
                organization_id=organization_id,
                file_type='inventory',
                original_filename=f"{item_id}.{file_ext}"
            )
            
            # Upload to S3
            result = await s3_service.upload_file(
                file_content=content,
                file_key=file_key,
                content_type=file.content_type
            )
            
            if result:
                # Delete old local file if exists
                if item.get('image_filename'):
                    old_filepath = INVENTORY_IMAGES_DIR / item['image_filename']
                    if old_filepath.exists():
                        old_filepath.unlink()
                
                # Update item with S3 URL
                await db.inventory_items.update_one(
                    {'id': item_id},
                    {'$set': {
                        'image_url': result['url'],
                        'image_s3_key': file_key,
                        'image_filename': None,
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }}
                )
                
                logger.info(f"Image uploaded to S3 for item {item_id}: {result['url']}")
                return {
                    "message": "Image uploaded to S3 successfully",
                    "image_url": result['url'],
                    "storage": "s3"
                }
    except ImportError:
        logger.warning("S3 service not available, falling back to local storage")
    except Exception as e:
        logger.error(f"S3 upload failed, falling back to local: {str(e)}")
    
    # Fallback to local storage
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"{item_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}.{ext}"
    filepath = INVENTORY_IMAGES_DIR / filename
    
    with open(filepath, 'wb') as f:
        f.write(content)
    
    # Delete old local image if exists
    old_filename = item.get('image_filename')
    if old_filename:
        old_filepath = INVENTORY_IMAGES_DIR / old_filename
        if old_filepath.exists():
            old_filepath.unlink()
    
    image_url = f"/api/inventory/image/{filename}"
    await db.inventory_items.update_one(
        {'id': item_id},
        {'$set': {
            'image_url': image_url,
            'image_filename': filename,
            'image_s3_key': None,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"Image uploaded locally for item {item_id}: {filename}")
    return {"message": "Image uploaded successfully", "image_url": image_url, "storage": "local"}


@router.get("/inventory/image/{filename}")
async def get_inventory_image(filename: str):
    """Get an inventory item image"""
    filepath = INVENTORY_IMAGES_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    
    content_type = "image/jpeg"
    if filename.endswith('.png'):
        content_type = "image/png"
    elif filename.endswith('.gif'):
        content_type = "image/gif"
    elif filename.endswith('.webp'):
        content_type = "image/webp"
    
    return FileResponse(filepath, media_type=content_type)


@router.delete("/inventory/{item_id}/image")
async def delete_inventory_image(item_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an inventory item image - handles both S3 and local storage"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Delete from S3 if S3 key exists
    if item.get('image_s3_key'):
        try:
            from services.s3_service import s3_service
            if s3_service.is_configured():
                s3_service.delete_object(item['image_s3_key'])
                logger.info(f"Deleted S3 image for item {item_id}: {item['image_s3_key']}")
        except Exception as e:
            logger.error(f"Failed to delete S3 image: {str(e)}")
    
    # Delete local file if exists
    if item.get('image_filename'):
        filepath = INVENTORY_IMAGES_DIR / item['image_filename']
        if filepath.exists():
            filepath.unlink()
            logger.info(f"Deleted local image for item {item_id}: {item['image_filename']}")
    
    # Also try to delete from image_url path (backward compatibility)
    image_url = item.get('image_url')
    if image_url and image_url.startswith('/api/inventory/image/'):
        filename = image_url.split('/')[-1]
        filepath = INVENTORY_IMAGES_DIR / filename
        if filepath.exists():
            filepath.unlink()
    
    await db.inventory_items.update_one(
        {'id': item_id},
        {'$set': {
            'image_url': None,
            'image_filename': None,
            'image_s3_key': None,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Image deleted successfully"}


@router.post("/inventory/{item_id}/fetch-web-image")
async def fetch_web_product_image(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Fetch product image from web search"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    product_name = item.get('name', '')
    barcode = item.get('barcode', '')
    
    search_query = barcode if barcode else product_name
    if not search_query:
        raise HTTPException(status_code=400, detail="No product name or barcode available for search")
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            search_url = f"https://www.google.com/search?q={search_query}+product&tbm=isch&safe=active"
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            response = await client.get(search_url, headers=headers, follow_redirects=True)
            
            if response.status_code == 200:
                import re
                img_urls = re.findall(r'https://[^"\']+\.(?:jpg|jpeg|png|webp)', response.text)
                
                for img_url in img_urls[:10]:
                    if 'google' in img_url or 'gstatic' in img_url:
                        continue
                    try:
                        img_response = await client.get(img_url, headers=headers, timeout=10.0)
                        if img_response.status_code == 200 and img_response.headers.get('content-type', '').startswith('image/'):
                            ext = img_url.split('.')[-1].split('?')[0][:4]
                            filename = f"{item_id}_web_{datetime.now().strftime('%Y%m%d%H%M%S')}.{ext}"
                            filepath = INVENTORY_IMAGES_DIR / filename
                            
                            with open(filepath, 'wb') as f:
                                f.write(img_response.content)
                            
                            image_url = f"/api/inventory/image/{filename}"
                            await db.inventory_items.update_one(
                                {'id': item_id},
                                {'$set': {'image_url': image_url, 'updated_at': datetime.now(timezone.utc).isoformat()}}
                            )
                            
                            return {"message": "Image fetched successfully", "image_url": image_url, "source": img_url}
                    except Exception:
                        continue
    except Exception as e:
        logger.error(f"Web image fetch error: {str(e)}")
    
    raise HTTPException(status_code=404, detail="Could not find suitable product image")


# ================== CSV IMPORT ==================

@router.post("/inventory/csv/preview")
async def preview_csv_import(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Preview CSV file for inventory import"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    content = await file.read()
    
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        try:
            text = content.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = content.decode('latin-1')
    
    import csv
    from io import StringIO
    
    reader = csv.DictReader(StringIO(text))
    headers = reader.fieldnames or []
    
    preview_rows = []
    for i, row in enumerate(reader):
        if i >= 10:
            break
        preview_rows.append(row)
    
    return {
        'headers': headers,
        'preview': preview_rows,
        'row_count': len(text.split('\n')) - 1
    }


@router.post("/inventory/csv/import")
async def import_csv_inventory(
    organization_id: str,
    file: UploadFile = File(...),
    field_mapping: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """Import inventory items from CSV"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    import json
    import csv
    from io import StringIO
    
    try:
        mapping = json.loads(field_mapping)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid field mapping JSON")
    
    content = await file.read()
    
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        try:
            text = content.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = content.decode('latin-1')
    
    reader = csv.DictReader(StringIO(text))
    
    imported = 0
    skipped = 0
    errors = []
    new_categories = []
    
    for row_num, row in enumerate(reader, start=2):
        try:
            name = row.get(mapping.get('name', ''), '').strip()
            if not name:
                skipped += 1
                continue
            
            item_data = {
                'id': str(uuid.uuid4()),
                'name': name,
                'organization_id': organization_id,
                'created_at': datetime.now(timezone.utc).isoformat(),
                'created_by': current_user['id'],
                'is_active': True,
                'on_hand_qty': 0,
                'min_qty': 0
            }
            
            if 'barcode' in mapping and mapping['barcode']:
                item_data['barcode'] = row.get(mapping['barcode'], '').strip()
            if 'sku' in mapping and mapping['sku']:
                item_data['sku'] = row.get(mapping['sku'], '').strip()
            if 'name_ar' in mapping and mapping['name_ar']:
                item_data['name_ar'] = row.get(mapping['name_ar'], '').strip()
            if 'price' in mapping and mapping['price']:
                try:
                    item_data['price'] = float(row.get(mapping['price'], 0) or 0)
                except ValueError:
                    item_data['price'] = 0
            if 'cost' in mapping and mapping['cost']:
                try:
                    item_data['cost'] = float(row.get(mapping['cost'], 0) or 0)
                except ValueError:
                    item_data['cost'] = 0
            if 'quantity' in mapping and mapping['quantity']:
                try:
                    item_data['on_hand_qty'] = float(row.get(mapping['quantity'], 0) or 0)
                    item_data['initial_quantity'] = item_data['on_hand_qty']
                except ValueError:
                    pass
            if 'min_qty' in mapping and mapping['min_qty']:
                try:
                    item_data['min_qty'] = float(row.get(mapping['min_qty'], 0) or 0)
                except ValueError:
                    pass
            if 'category' in mapping and mapping['category']:
                category_name = row.get(mapping['category'], '').strip()
                if category_name:
                    item_data['category'] = category_name
                    existing_cat = await db.inventory_categories.find_one({
                        'organization_id': organization_id,
                        'name': {'$regex': f'^{category_name}$', '$options': 'i'}
                    })
                    if existing_cat:
                        item_data['category_id'] = existing_cat['id']
                    elif category_name not in new_categories:
                        new_cat = {
                            'id': str(uuid.uuid4()),
                            'name': category_name,
                            'organization_id': organization_id,
                            'created_at': datetime.now(timezone.utc).isoformat()
                        }
                        await db.inventory_categories.insert_one(new_cat)
                        item_data['category_id'] = new_cat['id']
                        new_categories.append(category_name)
            
            if item_data.get('barcode'):
                existing = await db.inventory_items.find_one({
                    'barcode': item_data['barcode'],
                    'organization_id': organization_id
                })
                if existing:
                    skipped += 1
                    continue
            
            await db.inventory_items.insert_one(item_data)
            imported += 1
            
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
    
    return {
        'message': 'Import completed',
        'imported': imported,
        'skipped': skipped,
        'new_categories': new_categories,
        'errors': errors[:20]
    }
