"""
Exchange Rates Router - Currency exchange rate management
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from typing import List, Optional
import uuid
import httpx

from models.schemas import ExchangeRateCreate, ExchangeRateResponse
from utils.database import db
from utils.auth import get_current_user

router = APIRouter(prefix="/exchange-rates", tags=["Exchange Rates"])


@router.post("", response_model=ExchangeRateResponse)
async def create_exchange_rate(rate_data: ExchangeRateCreate, current_user: dict = Depends(get_current_user)):
    """Create a new exchange rate entry"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    rate_id = str(uuid.uuid4())
    rate_doc = {
        'id': rate_id,
        'date': rate_data.date,
        'from_currency': rate_data.from_currency,
        'to_currency': rate_data.to_currency,
        'rate': rate_data.rate,
        'organization_id': rate_data.organization_id,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'created_by': current_user['id']
    }
    
    await db.exchange_rates.insert_one(rate_doc)
    return ExchangeRateResponse(**rate_doc)


@router.get("", response_model=List[ExchangeRateResponse])
async def get_exchange_rates(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Get all exchange rates for an organization"""
    rates = await db.exchange_rates.find(
        {'organization_id': organization_id}, 
        {'_id': 0}
    ).sort('date', -1).to_list(100)
    return [ExchangeRateResponse(**r) for r in rates]


@router.get("/latest")
async def get_latest_exchange_rate(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Get the latest exchange rate"""
    rate = await db.exchange_rates.find_one(
        {'organization_id': organization_id},
        {'_id': 0},
        sort=[('date', -1)]
    )
    
    if not rate:
        # Return default rate
        return {'rate': 89500, 'date': datetime.now().strftime('%Y-%m-%d')}
    
    return rate


@router.get("/live")
async def get_live_exchange_rate(current_user: dict = Depends(get_current_user)):
    """Fetch live exchange rate from external API"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                'https://api.exchangerate-api.com/v4/latest/USD',
                timeout=10.0
            )
            if response.status_code == 200:
                data = response.json()
                return {
                    'rate': data.get('rates', {}).get('LBP', 89500),
                    'source': 'exchangerate-api.com',
                    'fetched_at': datetime.now(timezone.utc).isoformat()
                }
    except Exception as e:
        pass
    
    # Return default if API fails
    return {
        'rate': 89500,
        'source': 'default',
        'fetched_at': datetime.now(timezone.utc).isoformat()
    }
