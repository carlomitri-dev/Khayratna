"""
Sales Returns Router - Handles all sales return endpoints
Standalone returns with partial quantity support, reversed VAT posting, inventory add-back
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from models.schemas import (
    SalesReturnCreate, SalesReturnUpdate, SalesReturnResponse
)
from core.auth import get_current_user
from core.database import db

router = APIRouter(prefix="/sales-returns", tags=["sales-returns"])


async def enrich_sales_return(ret: dict) -> dict:
    """Enrich sales return with related account data"""
    if ret.get('debit_account_id'):
        acc = await db.accounts.find_one({'id': ret['debit_account_id']}, {'name': 1, 'code': 1, '_id': 0})
        if acc:
            ret['debit_account_name'] = acc.get('name')
            ret['debit_account_code'] = acc.get('code')
    if ret.get('credit_account_id'):
        acc = await db.accounts.find_one({'id': ret['credit_account_id']}, {'name': 1, 'code': 1, 'registration_number': 1, 'address': 1, 'vat_number': 1, 'balance_usd': 1, '_id': 0})
        if acc:
            ret['credit_account_name'] = acc.get('name')
            ret['credit_account_code'] = acc.get('code')
            ret['customer_address'] = acc.get('address', '')
            ret['customer_registration_number'] = acc.get('registration_number') or acc.get('vat_number', '')
            ret['customer_balance_usd'] = acc.get('balance_usd', 0)
    return ret


@router.get("", response_model=List[SalesReturnResponse])
async def get_sales_returns(
    organization_id: str,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    query = {'organization_id': organization_id}
    if status:
        query['status'] = status
    if customer_id:
        query['credit_account_id'] = customer_id
    if date_from:
        query['date'] = {'$gte': date_from}
    if date_to:
        if 'date' in query:
            query['date']['$lte'] = date_to
        else:
            query['date'] = {'$lte': date_to}
    if search:
        search_regex = {'$regex': search, '$options': 'i'}
        query['$or'] = [
            {'return_number': search_regex},
            {'reason': search_regex},
            {'notes': search_regex}
        ]
    returns = await db.sales_returns.find(query, {'_id': 0}).sort('date', -1).skip(skip).limit(limit).to_list(limit)
    for ret in returns:
        await enrich_sales_return(ret)
    return returns


@router.get("/count")
async def get_sales_returns_count(
    organization_id: str,
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {'organization_id': organization_id}
    if status:
        query['status'] = status
    if search:
        search_regex = {'$regex': search, '$options': 'i'}
        query['$or'] = [{'return_number': search_regex}, {'reason': search_regex}]
    total = await db.sales_returns.count_documents(query)
    draft_count = await db.sales_returns.count_documents({**query, 'status': 'draft'})
    posted_count = await db.sales_returns.count_documents({**query, 'status': 'posted'})
    return {'total': total, 'draft': draft_count, 'posted': posted_count}


@router.get("/{return_id}", response_model=SalesReturnResponse)
async def get_sales_return(return_id: str, current_user: dict = Depends(get_current_user)):
    ret = await db.sales_returns.find_one({'id': return_id}, {'_id': 0})
    if not ret:
        raise HTTPException(status_code=404, detail="Sales return not found")
    await enrich_sales_return(ret)
    return ret


@router.post("", response_model=SalesReturnResponse)
async def create_sales_return(return_data: SalesReturnCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    count = await db.sales_returns.count_documents({'organization_id': return_data.organization_id})
    year = datetime.now().year
    return_number = f"SR-{year}-{str(count + 1).zfill(5)}"
    ret = {
        'id': str(uuid.uuid4()),
        'return_number': return_number,
        **return_data.model_dump(),
        'status': 'draft',
        'is_posted': False,
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': None,
        'posted_at': None,
        'posted_by': None,
        'voucher_id': None,
        'voucher_number': None
    }
    await db.sales_returns.insert_one(ret)
    ret.pop('_id', None)
    await enrich_sales_return(ret)
    return ret


@router.put("/{return_id}", response_model=SalesReturnResponse)
async def update_sales_return(return_id: str, return_data: SalesReturnUpdate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    ret = await db.sales_returns.find_one({'id': return_id}, {'_id': 0})
    if not ret:
        raise HTTPException(status_code=404, detail="Sales return not found")
    if ret.get('is_posted'):
        raise HTTPException(status_code=400, detail="Cannot edit posted return")
    update_data = {k: v for k, v in return_data.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    await db.sales_returns.update_one({'id': return_id}, {'$set': update_data})
    updated = await db.sales_returns.find_one({'id': return_id}, {'_id': 0})
    await enrich_sales_return(updated)
    return updated


@router.delete("/{return_id}")
async def delete_sales_return(return_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    ret = await db.sales_returns.find_one({'id': return_id}, {'_id': 0})
    if not ret:
        raise HTTPException(status_code=404, detail="Sales return not found")
    if ret.get('is_posted'):
        raise HTTPException(status_code=400, detail="Cannot delete posted return. Unpost first.")
    await db.sales_returns.delete_one({'id': return_id})
    return {"message": "Sales return deleted successfully"}


@router.post("/{return_id}/post")
async def post_sales_return(return_id: str, current_user: dict = Depends(get_current_user)):
    """Post a sales return - creates reversed voucher and adds inventory back"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    ret = await db.sales_returns.find_one({'id': return_id}, {'_id': 0})
    if not ret:
        raise HTTPException(status_code=404, detail="Sales return not found")
    if ret.get('is_posted'):
        raise HTTPException(status_code=400, detail="Return is already posted")
    
    debit_account = await db.accounts.find_one({'id': ret['debit_account_id']}, {'_id': 0})
    credit_account = await db.accounts.find_one({'id': ret['credit_account_id']}, {'_id': 0})
    if not debit_account or not credit_account:
        raise HTTPException(status_code=400, detail="Invalid account configuration")
    
    rate_doc = await db.exchange_rates.find_one(
        {'organization_id': ret['organization_id']}, {'rate': 1}, sort=[('date', -1)]
    )
    base_rate = rate_doc['rate'] if rate_doc else 89500
    amount_usd = ret['total_usd']
    amount_lbp = amount_usd * base_rate
    
    year = datetime.now().year
    prefix = f"SRV-{year}-"
    last_voucher = await db.vouchers.find_one(
        {'organization_id': ret['organization_id'], 'voucher_number': {'$regex': f'^{prefix}'}},
        {'voucher_number': 1}, sort=[('voucher_number', -1)]
    )
    if last_voucher:
        last_num = int(last_voucher['voucher_number'].split('-')[-1])
        voucher_number = f"{prefix}{last_num + 1:05d}"
    else:
        voucher_number = f"{prefix}00001"
    
    voucher_id = str(uuid.uuid4())
    voucher_doc = {
        'id': voucher_id,
        'voucher_number': voucher_number,
        'voucher_type': 'SRV',
        'date': ret['date'],
        'description': f"Sales Return {ret['return_number']}",
        'reference': ret['return_number'],
        'lines': [
            {
                'account_id': ret['debit_account_id'],
                'account_code': debit_account['code'],
                'account_name': debit_account['name'],
                'description': f"Sales Return - {debit_account['name']}",
                'debit_lbp': amount_lbp, 'credit_lbp': 0,
                'debit_usd': amount_usd, 'credit_usd': 0
            },
            {
                'account_id': ret['credit_account_id'],
                'account_code': credit_account['code'],
                'account_name': credit_account['name'],
                'description': f"Reduce receivable from {credit_account['name']}",
                'debit_lbp': 0, 'credit_lbp': amount_lbp,
                'debit_usd': 0, 'credit_usd': amount_usd
            }
        ],
        'total_debit_lbp': amount_lbp, 'total_credit_lbp': amount_lbp,
        'total_debit_usd': amount_usd, 'total_credit_usd': amount_usd,
        'currency': ret.get('currency', 'USD'), 'exchange_rate': base_rate,
        'is_posted': True, 'status': 'posted',
        'source_type': 'sales_return', 'source_id': return_id,
        'organization_id': ret['organization_id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'posted_at': datetime.now(timezone.utc).isoformat(),
        'created_by': current_user['id'], 'posted_by': current_user['id']
    }
    await db.vouchers.insert_one(voucher_doc)
    
    # Update account balances
    await db.accounts.update_one({'id': ret['debit_account_id']}, {'$inc': {'balance_usd': amount_usd, 'balance_lbp': amount_lbp}})
    await db.accounts.update_one({'id': ret['credit_account_id']}, {'$inc': {'balance_usd': -amount_usd, 'balance_lbp': -amount_lbp}})
    
    # Update parent account balances
    all_accounts = await db.accounts.find({'organization_id': ret['organization_id']}, {'_id': 0, 'id': 1, 'code': 1}).to_list(None)
    code_to_id = {acc['code']: acc['id'] for acc in all_accounts}
    for acc_data in [{'code': debit_account['code'], 'net_usd': amount_usd, 'net_lbp': amount_lbp},
                     {'code': credit_account['code'], 'net_usd': -amount_usd, 'net_lbp': -amount_lbp}]:
        for i in range(1, len(acc_data['code'])):
            parent_code = acc_data['code'][:i]
            parent_id = code_to_id.get(parent_code)
            if parent_id:
                await db.accounts.update_one({'id': parent_id}, {'$inc': {'balance_usd': acc_data['net_usd'], 'balance_lbp': acc_data['net_lbp']}})
    
    # Add inventory back
    for line in ret.get('lines', []):
        if line.get('inventory_item_id'):
            await db.inventory_items.update_one(
                {'id': line['inventory_item_id']},
                {'$inc': {'on_hand_qty': line['quantity']}, '$set': {'updated_at': datetime.now(timezone.utc).isoformat()}}
            )
    
    await db.sales_returns.update_one({'id': return_id}, {'$set': {
        'status': 'posted', 'is_posted': True,
        'voucher_id': voucher_id, 'voucher_number': voucher_number,
        'posted_at': datetime.now(timezone.utc).isoformat(), 'posted_by': current_user['id']
    }})
    return {"message": "Sales return posted successfully", "voucher_id": voucher_id, "voucher_number": voucher_number}


@router.post("/{return_id}/unpost")
async def unpost_sales_return(return_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can unpost returns")
    ret = await db.sales_returns.find_one({'id': return_id}, {'_id': 0})
    if not ret:
        raise HTTPException(status_code=404, detail="Sales return not found")
    if not ret.get('is_posted'):
        raise HTTPException(status_code=400, detail="Return is not posted")
    
    debit_account = await db.accounts.find_one({'id': ret['debit_account_id']}, {'_id': 0})
    credit_account = await db.accounts.find_one({'id': ret['credit_account_id']}, {'_id': 0})
    voucher = await db.vouchers.find_one({'id': ret.get('voucher_id')}, {'_id': 0})
    base_rate = voucher.get('exchange_rate', 89500) if voucher else 89500
    amount_usd = ret['total_usd']
    amount_lbp = amount_usd * base_rate
    
    if debit_account:
        await db.accounts.update_one({'id': ret['debit_account_id']}, {'$inc': {'balance_usd': -amount_usd, 'balance_lbp': -amount_lbp}})
    if credit_account:
        await db.accounts.update_one({'id': ret['credit_account_id']}, {'$inc': {'balance_usd': amount_usd, 'balance_lbp': amount_lbp}})
    
    all_accounts = await db.accounts.find({'organization_id': ret['organization_id']}, {'_id': 0, 'id': 1, 'code': 1}).to_list(None)
    code_to_id = {acc['code']: acc['id'] for acc in all_accounts}
    for acc, mult in [(debit_account, -1), (credit_account, 1)]:
        if acc:
            for i in range(1, len(acc['code'])):
                parent_id = code_to_id.get(acc['code'][:i])
                if parent_id:
                    await db.accounts.update_one({'id': parent_id}, {'$inc': {'balance_usd': mult * amount_usd, 'balance_lbp': mult * amount_lbp}})
    
    for line in ret.get('lines', []):
        if line.get('inventory_item_id'):
            await db.inventory_items.update_one(
                {'id': line['inventory_item_id']},
                {'$inc': {'on_hand_qty': -line['quantity']}, '$set': {'updated_at': datetime.now(timezone.utc).isoformat()}}
            )
    
    if ret.get('voucher_id'):
        await db.vouchers.delete_one({'id': ret['voucher_id']})
    
    await db.sales_returns.update_one({'id': return_id}, {'$set': {
        'status': 'draft', 'is_posted': False,
        'voucher_id': None, 'voucher_number': None,
        'posted_at': None, 'posted_by': None
    }})
    return {"message": "Sales return unposted successfully"}
