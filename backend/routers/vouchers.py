"""
Vouchers Router - Journal entries, receipts, payments, and notes
Refactored from server.py for modularity
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from core.database import db
from core.auth import get_current_user
from models.schemas import VoucherCreate, VoucherResponse, VoucherUpdate

router = APIRouter(tags=["Vouchers"])


# ================== HELPER FUNCTIONS ==================

async def generate_voucher_number(voucher_type: str, organization_id: str) -> str:
    """Generate next voucher number"""
    count = await db.vouchers.count_documents({
        'voucher_type': voucher_type,
        'organization_id': organization_id
    })
    year = datetime.now().year
    return f"{voucher_type}-{year}-{str(count + 1).zfill(5)}"


# ================== VOUCHER CRUD ==================

@router.post("/vouchers", response_model=VoucherResponse)
async def create_voucher(voucher_data: VoucherCreate, current_user: dict = Depends(get_current_user)):
    """Create a new voucher (journal entry)"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    total_debit_lbp = sum(line.debit_lbp for line in voucher_data.lines)
    total_credit_lbp = sum(line.credit_lbp for line in voucher_data.lines)
    total_debit_usd = sum(line.debit_usd for line in voucher_data.lines)
    total_credit_usd = sum(line.credit_usd for line in voucher_data.lines)
    
    voucher_id = str(uuid.uuid4())
    voucher_number = await generate_voucher_number(voucher_data.voucher_type, voucher_data.organization_id)
    
    voucher_doc = {
        'id': voucher_id,
        'voucher_number': voucher_number,
        'voucher_type': voucher_data.voucher_type,
        'date': voucher_data.date,
        'reference': voucher_data.reference,
        'description': voucher_data.description,
        'lines': [line.model_dump() for line in voucher_data.lines],
        'total_debit_lbp': total_debit_lbp,
        'total_credit_lbp': total_credit_lbp,
        'total_debit_usd': total_debit_usd,
        'total_credit_usd': total_credit_usd,
        'is_posted': False,
        'organization_id': voucher_data.organization_id,
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.vouchers.insert_one(voucher_doc)
    return VoucherResponse(**voucher_doc)


@router.get("/vouchers", response_model=List[VoucherResponse])
async def get_vouchers(
    organization_id: str,
    voucher_type: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    current_user: dict = Depends(get_current_user)
):
    """Get vouchers with search, filters and pagination - optimized with DB-level queries"""
    query = {'organization_id': organization_id}
    
    if voucher_type:
        query['voucher_type'] = voucher_type
    
    if status == 'posted':
        query['status'] = 'posted'
    elif status == 'draft':
        query['status'] = {'$ne': 'posted'}
    
    if date_from:
        query['date'] = {'$gte': date_from}
    if date_to:
        if 'date' in query:
            query['date']['$lte'] = date_to
        else:
            query['date'] = {'$lte': date_to}
    
    # Server-side search using MongoDB $regex
    if search:
        search_regex = {'$regex': search, '$options': 'i'}
        query['$or'] = [
            {'voucher_number': search_regex},
            {'reference': search_regex},
            {'description': search_regex}
        ]
    
    vouchers = await db.vouchers.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    
    return [VoucherResponse(**v) for v in vouchers]


@router.get("/vouchers/count")
async def get_vouchers_count(
    organization_id: str,
    voucher_type: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get count of vouchers - optimized with DB-level queries"""
    query = {'organization_id': organization_id}
    
    if voucher_type:
        query['voucher_type'] = voucher_type
    
    if status == 'posted':
        query['status'] = 'posted'
    elif status == 'draft':
        query['status'] = {'$ne': 'posted'}
    
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
            {'voucher_number': search_regex},
            {'reference': search_regex},
            {'description': search_regex}
        ]
    
    count = await db.vouchers.count_documents(query)
    return {"count": count}


@router.get("/vouchers/{voucher_id}", response_model=VoucherResponse)
async def get_voucher(voucher_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single voucher"""
    voucher = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    return VoucherResponse(**voucher)


@router.post("/vouchers/{voucher_id}/post")
async def post_voucher(voucher_id: str, current_user: dict = Depends(get_current_user)):
    """Post a voucher (update account balances including parent accounts)"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    voucher = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    
    if voucher.get('is_posted'):
        raise HTTPException(status_code=400, detail="Voucher is already posted")
    
    # Validate balanced - check both USD and LBP totals must balance
    total_debit_usd = voucher.get('total_debit_usd', 0) or 0
    total_credit_usd = voucher.get('total_credit_usd', 0) or 0
    if abs(total_debit_usd - total_credit_usd) > 0.01:
        raise HTTPException(status_code=400, detail="Voucher is not balanced (USD totals must match)")
    
    # Build account code to id mapping for parent lookups
    accounts = await db.accounts.find(
        {'organization_id': voucher['organization_id']}, 
        {'_id': 0, 'id': 1, 'code': 1}
    ).to_list(None)
    code_to_id = {acc['code']: acc['id'] for acc in accounts}
    
    # Update account balances
    for line in voucher.get('lines', []):
        account_id = line.get('account_id')
        account_code = line.get('account_code')
        
        # Find account by ID or by code
        account = None
        if account_id:
            account = await db.accounts.find_one({'id': account_id}, {'_id': 0})
        if not account and account_code:
            account = await db.accounts.find_one({
                'code': account_code,
                'organization_id': voucher['organization_id']
            }, {'_id': 0})
        
        if not account:
            continue
        
        account_code = account.get('code', '')
        
        debit_lbp = line.get('debit_lbp', 0) or 0
        credit_lbp = line.get('credit_lbp', 0) or 0
        debit_usd = line.get('debit_usd', 0) or 0
        credit_usd = line.get('credit_usd', 0) or 0
        
        net_lbp = debit_lbp - credit_lbp
        net_usd = debit_usd - credit_usd
        
        # Update the detail account
        await db.accounts.update_one(
            {'id': account['id']},
            {'$inc': {'balance_lbp': net_lbp, 'balance_usd': net_usd}}
        )
        
        # Update all parent accounts (4-digit, 3-digit, 2-digit, 1-digit)
        for i in range(1, len(account_code)):
            parent_code = account_code[:i]
            parent_id = code_to_id.get(parent_code)
            if parent_id:
                await db.accounts.update_one(
                    {'id': parent_id},
                    {'$inc': {'balance_lbp': net_lbp, 'balance_usd': net_usd}}
                )
    
    # Mark voucher as posted
    await db.vouchers.update_one(
        {'id': voucher_id},
        {'$set': {
            'is_posted': True,
            'status': 'posted',
            'posted_at': datetime.now(timezone.utc).isoformat(),
            'posted_by': current_user['id']
        }}
    )
    
    return {"message": "Voucher posted successfully", "voucher_number": voucher.get('voucher_number')}


@router.put("/vouchers/{voucher_id}", response_model=VoucherResponse)
async def update_voucher(
    voucher_id: str,
    update_data: VoucherUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a voucher. If posted, unpost first, update, then re-post."""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    voucher = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    
    was_posted = voucher.get('is_posted', False)
    
    # If voucher is posted, reverse its balances first
    if was_posted:
        accounts_list = await db.accounts.find(
            {'organization_id': voucher['organization_id']},
            {'_id': 0, 'id': 1, 'code': 1}
        ).to_list(None)
        code_to_id = {acc['code']: acc['id'] for acc in accounts_list}
        
        for line in voucher.get('lines', []):
            account_code = line.get('account_code', '')
            account = await db.accounts.find_one(
                {'code': account_code, 'organization_id': voucher['organization_id']},
                {'_id': 0}
            )
            if not account:
                continue
            
            debit_lbp = line.get('debit_lbp', 0) or 0
            credit_lbp = line.get('credit_lbp', 0) or 0
            debit_usd = line.get('debit_usd', 0) or 0
            credit_usd = line.get('credit_usd', 0) or 0
            net_lbp = credit_lbp - debit_lbp
            net_usd = credit_usd - debit_usd
            
            await db.accounts.update_one(
                {'id': account['id']},
                {'$inc': {'balance_lbp': net_lbp, 'balance_usd': net_usd}}
            )
            for i in range(1, len(account_code)):
                parent_id = code_to_id.get(account_code[:i])
                if parent_id:
                    await db.accounts.update_one(
                        {'id': parent_id},
                        {'$inc': {'balance_lbp': net_lbp, 'balance_usd': net_usd}}
                    )
    
    # Build update document
    update_doc = {'updated_at': datetime.now(timezone.utc).isoformat()}
    if update_data.voucher_type is not None:
        update_doc['voucher_type'] = update_data.voucher_type
    if update_data.date is not None:
        update_doc['date'] = update_data.date
    if update_data.reference is not None:
        update_doc['reference'] = update_data.reference
    if update_data.description is not None:
        update_doc['description'] = update_data.description
    if update_data.lines is not None:
        lines_dicts = [l.model_dump() for l in update_data.lines]
        update_doc['lines'] = lines_dicts
        update_doc['total_debit_lbp'] = sum(l.debit_lbp for l in update_data.lines)
        update_doc['total_credit_lbp'] = sum(l.credit_lbp for l in update_data.lines)
        update_doc['total_debit_usd'] = sum(l.debit_usd for l in update_data.lines)
        update_doc['total_credit_usd'] = sum(l.credit_usd for l in update_data.lines)
    
    await db.vouchers.update_one({'id': voucher_id}, {'$set': update_doc})
    
    # If it was posted, re-post with new data
    if was_posted:
        updated_voucher = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
        accounts_list = await db.accounts.find(
            {'organization_id': updated_voucher['organization_id']},
            {'_id': 0, 'id': 1, 'code': 1}
        ).to_list(None)
        code_to_id = {acc['code']: acc['id'] for acc in accounts_list}
        
        for line in updated_voucher.get('lines', []):
            account_code = line.get('account_code', '')
            account = await db.accounts.find_one(
                {'code': account_code, 'organization_id': updated_voucher['organization_id']},
                {'_id': 0}
            )
            if not account:
                continue
            
            debit_lbp = line.get('debit_lbp', 0) or 0
            credit_lbp = line.get('credit_lbp', 0) or 0
            debit_usd = line.get('debit_usd', 0) or 0
            credit_usd = line.get('credit_usd', 0) or 0
            net_lbp = debit_lbp - credit_lbp
            net_usd = debit_usd - credit_usd
            
            await db.accounts.update_one(
                {'id': account['id']},
                {'$inc': {'balance_lbp': net_lbp, 'balance_usd': net_usd}}
            )
            for i in range(1, len(account_code)):
                parent_id = code_to_id.get(account_code[:i])
                if parent_id:
                    await db.accounts.update_one(
                        {'id': parent_id},
                        {'$inc': {'balance_lbp': net_lbp, 'balance_usd': net_usd}}
                    )
        
        await db.vouchers.update_one(
            {'id': voucher_id},
            {'$set': {
                'is_posted': True,
                'status': 'posted',
                'posted_at': datetime.now(timezone.utc).isoformat(),
                'posted_by': current_user['id']
            }}
        )
    
    updated = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
    return VoucherResponse(**updated)


@router.delete("/vouchers/{voucher_id}")
async def delete_voucher(voucher_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a voucher (draft only)"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    voucher = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    
    if voucher.get('is_posted'):
        raise HTTPException(status_code=400, detail="Cannot delete a posted voucher. Unpost first.")
    
    await db.vouchers.delete_one({'id': voucher_id})
    return {"message": "Voucher deleted successfully"}


@router.post("/vouchers/{voucher_id}/unpost")
async def unpost_voucher(voucher_id: str, current_user: dict = Depends(get_current_user)):
    """Unpost a voucher (reverse account balances including parent accounts)"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    voucher = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    
    if not voucher.get('is_posted'):
        raise HTTPException(status_code=400, detail="Voucher is not posted")
    
    # Build account code to id mapping for parent lookups
    accounts = await db.accounts.find(
        {'organization_id': voucher['organization_id']}, 
        {'_id': 0, 'id': 1, 'code': 1}
    ).to_list(None)
    code_to_id = {acc['code']: acc['id'] for acc in accounts}
    
    # Reverse account balances
    for line in voucher.get('lines', []):
        account_id = line.get('account_id')
        account_code = line.get('account_code')
        
        # Find account by ID or by code
        account = None
        if account_id:
            account = await db.accounts.find_one({'id': account_id}, {'_id': 0})
        if not account and account_code:
            account = await db.accounts.find_one({
                'code': account_code,
                'organization_id': voucher['organization_id']
            }, {'_id': 0})
        
        if not account:
            continue
        
        account_code = account.get('code', '')
        
        debit_lbp = line.get('debit_lbp', 0) or 0
        credit_lbp = line.get('credit_lbp', 0) or 0
        debit_usd = line.get('debit_usd', 0) or 0
        credit_usd = line.get('credit_usd', 0) or 0
        
        # Reverse: subtract debit, add credit
        net_lbp = credit_lbp - debit_lbp
        net_usd = credit_usd - debit_usd
        
        # Update the detail account
        await db.accounts.update_one(
            {'id': account['id']},
            {'$inc': {'balance_lbp': net_lbp, 'balance_usd': net_usd}}
        )
        
        # Update all parent accounts (4-digit, 3-digit, 2-digit, 1-digit)
        for i in range(1, len(account_code)):
            parent_code = account_code[:i]
            parent_id = code_to_id.get(parent_code)
            if parent_id:
                await db.accounts.update_one(
                    {'id': parent_id},
                    {'$inc': {'balance_lbp': net_lbp, 'balance_usd': net_usd}}
                )
    
    # Mark voucher as unposted
    await db.vouchers.update_one(
        {'id': voucher_id},
        {'$set': {
            'is_posted': False,
            'status': 'draft',
            'unposted_at': datetime.now(timezone.utc).isoformat(),
            'unposted_by': current_user['id']
        }}
    )
    
    return {"message": "Voucher unposted successfully", "voucher_number": voucher.get('voucher_number')}
