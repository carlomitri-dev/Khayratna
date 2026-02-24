"""
Currencies Router
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone
import uuid

from models.schemas import CurrencyCreate, CurrencyUpdate, CurrencyResponse
from utils.database import db
from utils.auth import get_current_user

router = APIRouter(prefix="/currencies", tags=["Currencies"])


@router.get("", response_model=List[CurrencyResponse])
async def get_currencies(current_user: dict = Depends(get_current_user)):
    """Get all currencies"""
    currencies = await db.currencies.find({}, {'_id': 0}).sort('code', 1).to_list(100)
    return [CurrencyResponse(**c) for c in currencies]


@router.get("/active", response_model=List[CurrencyResponse])
async def get_active_currencies(current_user: dict = Depends(get_current_user)):
    """Get active currencies for voucher entry"""
    currencies = await db.currencies.find({'is_active': True}, {'_id': 0}).sort('code', 1).to_list(100)
    return [CurrencyResponse(**c) for c in currencies]


@router.post("", response_model=CurrencyResponse)
async def create_currency(currency_data: CurrencyCreate, current_user: dict = Depends(get_current_user)):
    """Create a new currency"""
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can manage currencies")
    
    existing = await db.currencies.find_one({'code': currency_data.code.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="Currency code already exists")
    
    currency_id = str(uuid.uuid4())
    currency_doc = {
        'id': currency_id,
        'code': currency_data.code.upper(),
        'name': currency_data.name,
        'symbol': currency_data.symbol,
        'rate_to_usd': currency_data.rate_to_usd,
        'rate_to_lbp': currency_data.rate_to_lbp,
        'is_active': currency_data.is_active,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.currencies.insert_one(currency_doc)
    return CurrencyResponse(**currency_doc)


@router.put("/{currency_id}", response_model=CurrencyResponse)
async def update_currency(currency_id: str, currency_data: CurrencyUpdate, current_user: dict = Depends(get_current_user)):
    """Update a currency"""
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can manage currencies")
    
    currency = await db.currencies.find_one({'id': currency_id}, {'_id': 0})
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    
    update_doc = {}
    if currency_data.name is not None:
        update_doc['name'] = currency_data.name
    if currency_data.symbol is not None:
        update_doc['symbol'] = currency_data.symbol
    if currency_data.rate_to_usd is not None:
        update_doc['rate_to_usd'] = currency_data.rate_to_usd
    if currency_data.rate_to_lbp is not None:
        update_doc['rate_to_lbp'] = currency_data.rate_to_lbp
    if currency_data.is_active is not None:
        update_doc['is_active'] = currency_data.is_active
    
    if update_doc:
        update_doc['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.currencies.update_one({'id': currency_id}, {'$set': update_doc})
    
    updated = await db.currencies.find_one({'id': currency_id}, {'_id': 0})
    return CurrencyResponse(**updated)


@router.delete("/{currency_id}")
async def delete_currency(currency_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a currency"""
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can manage currencies")
    
    currency = await db.currencies.find_one({'id': currency_id}, {'_id': 0})
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    
    if currency['code'] in ['USD', 'LBP']:
        raise HTTPException(status_code=400, detail="Cannot delete base currencies (USD/LBP)")
    
    await db.currencies.delete_one({'id': currency_id})
    return {"message": "Currency deleted successfully"}


@router.post("/seed")
async def seed_currencies(current_user: dict = Depends(get_current_user)):
    """Seed common world currencies"""
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can seed currencies")
    
    existing_count = await db.currencies.count_documents({})
    if existing_count > 0:
        raise HTTPException(status_code=400, detail="Currencies already exist. Delete existing currencies first.")
    
    base_lbp_rate = 89500.0
    currencies = [
        {'code': 'USD', 'name': 'US Dollar', 'symbol': '$', 'rate_to_usd': 1.0, 'rate_to_lbp': base_lbp_rate},
        {'code': 'LBP', 'name': 'Lebanese Pound', 'symbol': 'ل.ل', 'rate_to_usd': 1/base_lbp_rate, 'rate_to_lbp': 1.0},
        {'code': 'EUR', 'name': 'Euro', 'symbol': '€', 'rate_to_usd': 1.08, 'rate_to_lbp': base_lbp_rate * 1.08},
        {'code': 'GBP', 'name': 'British Pound', 'symbol': '£', 'rate_to_usd': 1.27, 'rate_to_lbp': base_lbp_rate * 1.27},
        {'code': 'CHF', 'name': 'Swiss Franc', 'symbol': 'CHF', 'rate_to_usd': 1.12, 'rate_to_lbp': base_lbp_rate * 1.12},
        {'code': 'SAR', 'name': 'Saudi Riyal', 'symbol': 'ر.س', 'rate_to_usd': 0.27, 'rate_to_lbp': base_lbp_rate * 0.27},
        {'code': 'AED', 'name': 'UAE Dirham', 'symbol': 'د.إ', 'rate_to_usd': 0.27, 'rate_to_lbp': base_lbp_rate * 0.27},
        {'code': 'KWD', 'name': 'Kuwaiti Dinar', 'symbol': 'د.ك', 'rate_to_usd': 3.25, 'rate_to_lbp': base_lbp_rate * 3.25},
        {'code': 'JOD', 'name': 'Jordanian Dinar', 'symbol': 'د.أ', 'rate_to_usd': 1.41, 'rate_to_lbp': base_lbp_rate * 1.41},
        {'code': 'EGP', 'name': 'Egyptian Pound', 'symbol': 'ج.م', 'rate_to_usd': 0.032, 'rate_to_lbp': base_lbp_rate * 0.032},
        {'code': 'CAD', 'name': 'Canadian Dollar', 'symbol': 'C$', 'rate_to_usd': 0.74, 'rate_to_lbp': base_lbp_rate * 0.74},
        {'code': 'AUD', 'name': 'Australian Dollar', 'symbol': 'A$', 'rate_to_usd': 0.65, 'rate_to_lbp': base_lbp_rate * 0.65},
        {'code': 'JPY', 'name': 'Japanese Yen', 'symbol': '¥', 'rate_to_usd': 0.0067, 'rate_to_lbp': base_lbp_rate * 0.0067},
        {'code': 'CNY', 'name': 'Chinese Yuan', 'symbol': '¥', 'rate_to_usd': 0.14, 'rate_to_lbp': base_lbp_rate * 0.14},
        {'code': 'INR', 'name': 'Indian Rupee', 'symbol': '₹', 'rate_to_usd': 0.012, 'rate_to_lbp': base_lbp_rate * 0.012},
        {'code': 'TRY', 'name': 'Turkish Lira', 'symbol': '₺', 'rate_to_usd': 0.037, 'rate_to_lbp': base_lbp_rate * 0.037},
    ]
    
    inserted_count = 0
    for curr in currencies:
        currency_doc = {
            'id': str(uuid.uuid4()),
            'code': curr['code'],
            'name': curr['name'],
            'symbol': curr['symbol'],
            'rate_to_usd': curr['rate_to_usd'],
            'rate_to_lbp': curr['rate_to_lbp'],
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        await db.currencies.insert_one(currency_doc)
        inserted_count += 1
    
    return {"message": f"Successfully seeded {inserted_count} currencies", "count": inserted_count}
