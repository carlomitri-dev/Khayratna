"""
Accounts Router - Chart of Accounts and related endpoints
Refactored from server.py for modularity
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid
import io
import csv

from core.database import db
from core.auth import get_current_user, get_current_admin
from models.schemas import AccountCreate, AccountResponse, CSVImportResult


# Local schema for AccountUpdate (not in schemas.py)
class AccountUpdate(BaseModel):
    name: Optional[str] = None
    name_ar: Optional[str] = None
    account_class: Optional[int] = None
    account_type: Optional[str] = None
    parent_code: Optional[str] = None
    is_active: Optional[bool] = None
    balance_lbp: Optional[float] = None
    balance_usd: Optional[float] = None


# Local schema for rebuild result
class RebuildFromVouchersResult(BaseModel):
    vouchers_processed: int
    accounts_updated: int
    message: str

# Local schema for rebuild request
class RebuildFromVouchersRequest(BaseModel):
    organization_id: str


router = APIRouter(tags=["Accounts"])


# ================== ACCOUNT CRUD ==================

@router.post("/accounts", response_model=AccountResponse)
async def create_account(account_data: AccountCreate, current_user: dict = Depends(get_current_user)):
    """Create a new account"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    existing = await db.accounts.find_one({
        'code': account_data.code,
        'organization_id': account_data.organization_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Account code already exists")
    
    account_id = str(uuid.uuid4())
    account_doc = {
        'id': account_id,
        'code': account_data.code,
        'name': account_data.name,
        'name_ar': account_data.name_ar,
        'account_class': account_data.account_class,
        'account_type': account_data.account_type,
        'parent_code': account_data.parent_code,
        'is_active': account_data.is_active,
        'organization_id': account_data.organization_id,
        'balance_lbp': 0,
        'balance_usd': 0
    }
    await db.accounts.insert_one(account_doc)
    return AccountResponse(**account_doc)


@router.get("/accounts", response_model=List[AccountResponse])
async def get_accounts(organization_id: str, fy_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get all accounts for an organization, optionally filtered by fiscal year"""
    accounts = await db.accounts.find(
        {'organization_id': organization_id},
        {'_id': 0}
    ).sort('code', 1).to_list(None)
    
    # Normalize accounts
    for acc in accounts:
        code = acc.get('code', '')
        if not acc.get('account_class') and code:
            try:
                acc['account_class'] = int(code[0])
            except (ValueError, IndexError):
                acc['account_class'] = 0
        
        if 'balance_lbp' not in acc:
            acc['balance_lbp'] = 0
        if 'balance_usd' not in acc:
            acc['balance_usd'] = 0
        if 'is_active' not in acc:
            acc['is_active'] = True
        if 'name_ar' not in acc:
            acc['name_ar'] = ''
        if 'account_type' not in acc:
            acc['account_type'] = 'detail'
        if 'parent_code' not in acc:
            acc['parent_code'] = None
        acc['balance_lbp'] = acc.get('balance_lbp', 0) or 0
        acc['balance_usd'] = acc.get('balance_usd', 0) or 0
    
    # If FY filter, recompute balances from vouchers in that FY range
    if fy_id:
        from core.database import db as _db
        fy = await _db.fiscal_years.find_one({'id': fy_id}, {'_id': 0})
        if fy:
            # Reset all balances to 0
            for acc in accounts:
                acc['balance_lbp'] = 0
                acc['balance_usd'] = 0
            
            # Use aggregation to compute from vouchers in FY range
            acc_lookup = {acc.get('code', ''): acc for acc in accounts}
            pipeline = [
                {'$match': {
                    'organization_id': organization_id,
                    'is_posted': True,
                    'date': {'$gte': fy['start_date'], '$lte': fy['end_date']}
                }},
                {'$unwind': '$lines'},
                {'$group': {
                    '_id': '$lines.account_code',
                    'total_debit_lbp': {'$sum': {'$ifNull': ['$lines.debit_lbp', 0]}},
                    'total_credit_lbp': {'$sum': {'$ifNull': ['$lines.credit_lbp', 0]}},
                    'total_debit_usd': {'$sum': {'$ifNull': ['$lines.debit_usd', 0]}},
                    'total_credit_usd': {'$sum': {'$ifNull': ['$lines.credit_usd', 0]}}
                }}
            ]
            async for result in _db.vouchers.aggregate(pipeline):
                code = result['_id']
                if code in acc_lookup:
                    acc_lookup[code]['balance_lbp'] = result['total_debit_lbp'] - result['total_credit_lbp']
                    acc_lookup[code]['balance_usd'] = result['total_debit_usd'] - result['total_credit_usd']
    
    # Calculate parent account balances from children
    code_balances = {}
    for acc in accounts:
        code = acc.get('code', '')
        code_balances[code] = {'lbp': acc.get('balance_lbp', 0) or 0, 'usd': acc.get('balance_usd', 0) or 0}
    
    for acc in accounts:
        code = acc.get('code', '')
        if code and len(code) <= 4:
            child_lbp = 0
            child_usd = 0
            for other_code, bal in code_balances.items():
                if other_code.startswith(code) and len(other_code) > len(code):
                    child_lbp += bal['lbp']
                    child_usd += bal['usd']
            acc['balance_lbp'] = child_lbp
            acc['balance_usd'] = child_usd
    
    return [AccountResponse(**acc) for acc in accounts]


@router.get("/accounts/movable/list", response_model=List[AccountResponse])
async def get_movable_accounts(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Get accounts that can have transactions (non-parent accounts)"""
    accounts = await db.accounts.find(
        {
            'organization_id': organization_id,
            '$or': [
                {'account_type': 'detail'},
                {'account_type': {'$exists': False}}
            ]
        },
        {'_id': 0}
    ).sort('code', 1).to_list(None)
    
    for acc in accounts:
        if 'balance_lbp' not in acc:
            acc['balance_lbp'] = 0
        if 'balance_usd' not in acc:
            acc['balance_usd'] = 0
        if 'is_active' not in acc:
            acc['is_active'] = True
        if 'name_ar' not in acc:
            acc['name_ar'] = ''
        if 'account_type' not in acc:
            acc['account_type'] = 'detail'
        if 'parent_code' not in acc:
            acc['parent_code'] = None
        if not acc.get('account_class'):
            try:
                acc['account_class'] = int(acc.get('code', '0')[0])
            except:
                acc['account_class'] = 0
    
    return [AccountResponse(**acc) for acc in accounts]


@router.get("/accounts/template-csv")
async def get_accounts_template_csv():
    """Get CSV template for importing accounts"""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['code', 'name', 'name_ar', 'account_class', 'account_type', 'parent_code'])
    writer.writerow(['1', 'Assets', 'الأصول', '1', 'header', ''])
    writer.writerow(['11', 'Current Assets', 'الأصول المتداولة', '1', 'header', '1'])
    writer.writerow(['111', 'Cash', 'النقدية', '1', 'detail', '11'])
    writer.writerow(['1111', 'Cash in Hand', 'النقدية في الصندوق', '1', 'detail', '111'])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=accounts_template.csv"}
    )


@router.get("/accounts/{account_id}", response_model=AccountResponse)
async def get_account(account_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single account by ID"""
    account = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return AccountResponse(**account)


@router.put("/accounts/{account_id}", response_model=AccountResponse)
async def update_account(account_id: str, account_data: AccountUpdate, current_user: dict = Depends(get_current_user)):
    """Update an account"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    account = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    update_doc = {}
    for field, value in account_data.model_dump(exclude_unset=True).items():
        update_doc[field] = value
    
    if update_doc:
        await db.accounts.update_one({'id': account_id}, {'$set': update_doc})
    
    updated = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    return AccountResponse(**updated)


@router.post("/accounts/{account_id}/reset-balance")
async def reset_account_balance(account_id: str, current_user: dict = Depends(get_current_user)):
    """Reset an account's balance to zero"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    account = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    await db.accounts.update_one(
        {'id': account_id},
        {'$set': {'balance_lbp': 0, 'balance_usd': 0}}
    )
    
    return {"message": "Account balance reset successfully"}


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an account"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    account = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    await db.accounts.delete_one({'id': account_id})
    return {"message": "Account deleted successfully"}


# ================== CUSTOMER/SUPPLIER SHORTCUTS ==================

@router.get("/customers", response_model=List[AccountResponse])
async def get_customers(
    organization_id: str, 
    fy_id: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get customer accounts with pagination and search"""
    query = {
        'organization_id': organization_id,
        'code': {'$regex': '^41'},
        '$expr': {'$gt': [{'$strLenCP': '$code'}, 4]}
    }
    
    if search:
        search_regex = {'$regex': search, '$options': 'i'}
        query['$or'] = [
            {'name': search_regex},
            {'name_ar': search_regex},
            {'code': search_regex},
            {'mobile': search_regex},
            {'address': search_regex},
            {'contact_person': search_regex}
        ]
        # Remove the $expr when using $or at top level
        del query['$expr']
        query['code'] = {'$regex': '^41.{4,}'}  # Use regex instead of $expr
    
    total = await db.accounts.count_documents(query)
    accounts = await db.accounts.find(query, {'_id': 0}).sort('code', 1).skip(skip).limit(limit).to_list(limit)
    
    for acc in accounts:
        acc.setdefault('balance_lbp', 0)
        acc.setdefault('balance_usd', 0)
        acc.setdefault('is_active', True)
        acc.setdefault('name_ar', '')
        acc.setdefault('account_type', 'detail')
        acc['balance_lbp'] = acc.get('balance_lbp', 0) or 0
        acc['balance_usd'] = acc.get('balance_usd', 0) or 0
    
    # FY balance filter
    if fy_id:
        fy = await db.fiscal_years.find_one({'id': fy_id}, {'_id': 0})
        if fy:
            acc_lookup = {a['code']: a for a in accounts}
            for a in accounts:
                a['balance_lbp'] = 0
                a['balance_usd'] = 0
            codes = [a['code'] for a in accounts]
            pipeline = [
                {'$match': {'organization_id': organization_id, 'is_posted': True, 'date': {'$gte': fy['start_date'], '$lte': fy['end_date']}}},
                {'$unwind': '$lines'},
                {'$match': {'lines.account_code': {'$in': codes}}},
                {'$group': {'_id': '$lines.account_code', 'dr_lbp': {'$sum': {'$ifNull': ['$lines.debit_lbp', 0]}}, 'cr_lbp': {'$sum': {'$ifNull': ['$lines.credit_lbp', 0]}}, 'dr_usd': {'$sum': {'$ifNull': ['$lines.debit_usd', 0]}}, 'cr_usd': {'$sum': {'$ifNull': ['$lines.credit_usd', 0]}}}}
            ]
            async for r in db.vouchers.aggregate(pipeline):
                if r['_id'] in acc_lookup:
                    acc_lookup[r['_id']]['balance_lbp'] = r['dr_lbp'] - r['cr_lbp']
                    acc_lookup[r['_id']]['balance_usd'] = r['dr_usd'] - r['cr_usd']
    
    return accounts


@router.get("/customers/count")
async def get_customers_count(organization_id: str, search: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {'organization_id': organization_id, 'code': {'$regex': '^41.{4,}'}}
    if search:
        sr = {'$regex': search, '$options': 'i'}
        query['$or'] = [{'name': sr}, {'name_ar': sr}, {'code': sr}, {'mobile': sr}]
    return {"count": await db.accounts.count_documents(query)}


@router.get("/suppliers", response_model=List[AccountResponse])
async def get_suppliers(
    organization_id: str, 
    fy_id: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get supplier accounts with pagination and search"""
    query = {
        'organization_id': organization_id,
        'code': {'$regex': '^40'},
        '$expr': {'$gt': [{'$strLenCP': '$code'}, 4]}
    }
    
    if search:
        search_regex = {'$regex': search, '$options': 'i'}
        query['$or'] = [
            {'name': search_regex},
            {'name_ar': search_regex},
            {'code': search_regex},
            {'mobile': search_regex}
        ]
        del query['$expr']
        query['code'] = {'$regex': '^40.{4,}'}
    
    total = await db.accounts.count_documents(query)
    accounts = await db.accounts.find(query, {'_id': 0}).sort('code', 1).skip(skip).limit(limit).to_list(limit)
    
    for acc in accounts:
        acc.setdefault('balance_lbp', 0)
        acc.setdefault('balance_usd', 0)
        acc.setdefault('is_active', True)
        acc.setdefault('name_ar', '')
        acc.setdefault('account_type', 'detail')
        acc['balance_lbp'] = acc.get('balance_lbp', 0) or 0
        acc['balance_usd'] = acc.get('balance_usd', 0) or 0
    
    # FY balance filter
    if fy_id:
        fy = await db.fiscal_years.find_one({'id': fy_id}, {'_id': 0})
        if fy:
            acc_lookup = {a['code']: a for a in accounts}
            for a in accounts:
                a['balance_lbp'] = 0
                a['balance_usd'] = 0
            codes = [a['code'] for a in accounts]
            pipeline = [
                {'$match': {'organization_id': organization_id, 'is_posted': True, 'date': {'$gte': fy['start_date'], '$lte': fy['end_date']}}},
                {'$unwind': '$lines'},
                {'$match': {'lines.account_code': {'$in': codes}}},
                {'$group': {'_id': '$lines.account_code', 'dr_lbp': {'$sum': {'$ifNull': ['$lines.debit_lbp', 0]}}, 'cr_lbp': {'$sum': {'$ifNull': ['$lines.credit_lbp', 0]}}, 'dr_usd': {'$sum': {'$ifNull': ['$lines.debit_usd', 0]}}, 'cr_usd': {'$sum': {'$ifNull': ['$lines.credit_usd', 0]}}}}
            ]
            async for r in db.vouchers.aggregate(pipeline):
                if r['_id'] in acc_lookup:
                    acc_lookup[r['_id']]['balance_lbp'] = r['dr_lbp'] - r['cr_lbp']
                    acc_lookup[r['_id']]['balance_usd'] = r['dr_usd'] - r['cr_usd']
    
    return accounts


@router.get("/suppliers/count")
async def get_suppliers_count(organization_id: str, search: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {'organization_id': organization_id, 'code': {'$regex': '^40.{4,}'}}
    if search:
        sr = {'$regex': search, '$options': 'i'}
        query['$or'] = [{'name': sr}, {'name_ar': sr}, {'code': sr}, {'mobile': sr}]
    return {"count": await db.accounts.count_documents(query)}


@router.put("/accounts/{account_id}/contact-info", response_model=AccountResponse)
async def update_account_contact_info(
    account_id: str,
    contact_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update account contact information (mobile, email, address, contact_person, notes)"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    account = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Build update document from contact data
    update_doc = {}
    allowed_fields = ['mobile', 'phone', 'email', 'address', 'contact_person', 'notes', 'tax_id']
    
    for field in allowed_fields:
        if field in contact_data and contact_data[field] is not None:
            update_doc[field] = contact_data[field]
    
    if update_doc:
        await db.accounts.update_one({'id': account_id}, {'$set': update_doc})
    
    updated = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    
    # Ensure required fields have default values
    for key in ['balance_lbp', 'balance_usd']:
        if key not in updated:
            updated[key] = 0
    if 'is_active' not in updated:
        updated['is_active'] = True
    if 'name_ar' not in updated:
        updated['name_ar'] = ''
    if 'account_type' not in updated:
        updated['account_type'] = 'detail'
    
    return AccountResponse(**updated)


# ================== SEED CHART OF ACCOUNTS ==================

@router.post("/accounts/seed-coa")
async def seed_chart_of_accounts(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Seed the default Lebanese Chart of Accounts"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Check if accounts already exist
    existing = await db.accounts.count_documents({'organization_id': organization_id})
    if existing > 0:
        raise HTTPException(status_code=400, detail="Accounts already exist for this organization")
    
    # Lebanese Standard Chart of Accounts
    coa = [
        # Class 1 - Equity
        {'code': '1', 'name': 'Equity', 'name_ar': 'حقوق الملكية', 'account_class': 1, 'account_type': 'header'},
        {'code': '11', 'name': 'Share Capital', 'name_ar': 'رأس المال', 'account_class': 1, 'account_type': 'detail', 'parent_code': '1'},
        {'code': '12', 'name': 'Reserves', 'name_ar': 'الاحتياطيات', 'account_class': 1, 'account_type': 'detail', 'parent_code': '1'},
        {'code': '13', 'name': 'Retained Earnings', 'name_ar': 'الأرباح المحتجزة', 'account_class': 1, 'account_type': 'detail', 'parent_code': '1'},
        
        # Class 2 - Fixed Assets
        {'code': '2', 'name': 'Fixed Assets', 'name_ar': 'الأصول الثابتة', 'account_class': 2, 'account_type': 'header'},
        {'code': '21', 'name': 'Land', 'name_ar': 'الأراضي', 'account_class': 2, 'account_type': 'detail', 'parent_code': '2'},
        {'code': '22', 'name': 'Buildings', 'name_ar': 'المباني', 'account_class': 2, 'account_type': 'detail', 'parent_code': '2'},
        {'code': '23', 'name': 'Equipment', 'name_ar': 'المعدات', 'account_class': 2, 'account_type': 'detail', 'parent_code': '2'},
        {'code': '24', 'name': 'Vehicles', 'name_ar': 'السيارات', 'account_class': 2, 'account_type': 'detail', 'parent_code': '2'},
        {'code': '28', 'name': 'Accumulated Depreciation', 'name_ar': 'مجمع الاستهلاك', 'account_class': 2, 'account_type': 'detail', 'parent_code': '2'},
        
        # Class 3 - Current Assets (Customers)
        {'code': '3', 'name': 'Current Assets', 'name_ar': 'الأصول المتداولة', 'account_class': 3, 'account_type': 'header'},
        {'code': '31', 'name': 'Inventory', 'name_ar': 'المخزون', 'account_class': 3, 'account_type': 'detail', 'parent_code': '3'},
        {'code': '32', 'name': 'Trade Receivables', 'name_ar': 'الذمم التجارية', 'account_class': 3, 'account_type': 'header', 'parent_code': '3'},
        {'code': '321', 'name': 'Customer - General', 'name_ar': 'عميل عام', 'account_class': 3, 'account_type': 'detail', 'parent_code': '32'},
        {'code': '33', 'name': 'Notes Receivable', 'name_ar': 'أوراق القبض', 'account_class': 3, 'account_type': 'detail', 'parent_code': '3'},
        {'code': '34', 'name': 'Cash and Banks', 'name_ar': 'النقدية والبنوك', 'account_class': 3, 'account_type': 'header', 'parent_code': '3'},
        {'code': '341', 'name': 'Cash in Hand', 'name_ar': 'الصندوق', 'account_class': 3, 'account_type': 'detail', 'parent_code': '34'},
        {'code': '342', 'name': 'Bank Account', 'name_ar': 'الحساب البنكي', 'account_class': 3, 'account_type': 'detail', 'parent_code': '34'},
        
        # Class 4 - Liabilities (Suppliers)
        {'code': '4', 'name': 'Liabilities', 'name_ar': 'الالتزامات', 'account_class': 4, 'account_type': 'header'},
        {'code': '40', 'name': 'Trade Payables', 'name_ar': 'الذمم الدائنة', 'account_class': 4, 'account_type': 'header', 'parent_code': '4'},
        {'code': '401', 'name': 'Supplier - General', 'name_ar': 'مورد عام', 'account_class': 4, 'account_type': 'detail', 'parent_code': '40'},
        {'code': '42', 'name': 'Notes Payable', 'name_ar': 'أوراق الدفع', 'account_class': 4, 'account_type': 'detail', 'parent_code': '4'},
        {'code': '43', 'name': 'Taxes Payable', 'name_ar': 'الضرائب المستحقة', 'account_class': 4, 'account_type': 'header', 'parent_code': '4'},
        {'code': '431', 'name': 'VAT Payable', 'name_ar': 'ضريبة القيمة المضافة', 'account_class': 4, 'account_type': 'detail', 'parent_code': '43'},
        {'code': '44', 'name': 'Other Payables', 'name_ar': 'مصاريف مستحقة', 'account_class': 4, 'account_type': 'detail', 'parent_code': '4'},
        
        # Class 5 - Provisions
        {'code': '5', 'name': 'Provisions', 'name_ar': 'المخصصات', 'account_class': 5, 'account_type': 'header'},
        {'code': '51', 'name': 'Provision for Bad Debts', 'name_ar': 'مخصص الديون المشكوك فيها', 'account_class': 5, 'account_type': 'detail', 'parent_code': '5'},
        
        # Class 6 - Expenses
        {'code': '6', 'name': 'Expenses', 'name_ar': 'المصاريف', 'account_class': 6, 'account_type': 'header'},
        {'code': '60', 'name': 'Cost of Goods Sold', 'name_ar': 'تكلفة البضاعة المباعة', 'account_class': 6, 'account_type': 'detail', 'parent_code': '6'},
        {'code': '61', 'name': 'Purchases', 'name_ar': 'المشتريات', 'account_class': 6, 'account_type': 'detail', 'parent_code': '6'},
        {'code': '62', 'name': 'Salaries and Wages', 'name_ar': 'الرواتب والأجور', 'account_class': 6, 'account_type': 'detail', 'parent_code': '6'},
        {'code': '63', 'name': 'Rent Expense', 'name_ar': 'مصاريف الإيجار', 'account_class': 6, 'account_type': 'detail', 'parent_code': '6'},
        {'code': '64', 'name': 'Utilities', 'name_ar': 'المرافق', 'account_class': 6, 'account_type': 'detail', 'parent_code': '6'},
        {'code': '65', 'name': 'Depreciation Expense', 'name_ar': 'مصاريف الاستهلاك', 'account_class': 6, 'account_type': 'detail', 'parent_code': '6'},
        {'code': '66', 'name': 'Bank Charges', 'name_ar': 'مصاريف بنكية', 'account_class': 6, 'account_type': 'detail', 'parent_code': '6'},
        {'code': '67', 'name': 'Other Expenses', 'name_ar': 'مصاريف أخرى', 'account_class': 6, 'account_type': 'detail', 'parent_code': '6'},
        
        # Class 7 - Revenue
        {'code': '7', 'name': 'Revenue', 'name_ar': 'الإيرادات', 'account_class': 7, 'account_type': 'header'},
        {'code': '70', 'name': 'Sales Revenue', 'name_ar': 'إيرادات المبيعات', 'account_class': 7, 'account_type': 'detail', 'parent_code': '7'},
        {'code': '71', 'name': 'Service Revenue', 'name_ar': 'إيرادات الخدمات', 'account_class': 7, 'account_type': 'detail', 'parent_code': '7'},
        {'code': '72', 'name': 'Interest Income', 'name_ar': 'إيرادات الفوائد', 'account_class': 7, 'account_type': 'detail', 'parent_code': '7'},
        {'code': '73', 'name': 'Other Income', 'name_ar': 'إيرادات أخرى', 'account_class': 7, 'account_type': 'detail', 'parent_code': '7'},
        {'code': '74', 'name': 'Sales Discount', 'name_ar': 'خصم المبيعات', 'account_class': 7, 'account_type': 'detail', 'parent_code': '7'},
        {'code': '75', 'name': 'Purchase Discount', 'name_ar': 'خصم المشتريات', 'account_class': 7, 'account_type': 'detail', 'parent_code': '7'},
    ]
    
    # Insert all accounts
    accounts_to_insert = []
    for acc in coa:
        accounts_to_insert.append({
            'id': str(uuid.uuid4()),
            'organization_id': organization_id,
            'balance_lbp': 0,
            'balance_usd': 0,
            'is_active': True,
            **acc
        })
    
    if accounts_to_insert:
        await db.accounts.insert_many(accounts_to_insert)
    
    return {
        "message": f"Successfully seeded {len(accounts_to_insert)} accounts",
        "count": len(accounts_to_insert)
    }


# ================== CSV IMPORT ==================

@router.post("/accounts/import-csv/preview")
async def preview_csv_import(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Preview CSV file for account import"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
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
    
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    
    preview_rows = []
    for i, row in enumerate(reader):
        if i >= 20:
            break
        preview_rows.append(row)
    
    # Count total rows
    total_rows = sum(1 for _ in csv.DictReader(io.StringIO(text)))
    
    return {
        'headers': headers,
        'preview': preview_rows,
        'total_rows': total_rows
    }


@router.post("/accounts/import-csv", response_model=CSVImportResult)
async def import_accounts_csv(
    organization_id: str,
    file: UploadFile = File(...),
    field_mapping: str = None,
    skip_existing: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """Import accounts from CSV"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    import json
    
    mapping = {}
    if field_mapping:
        try:
            mapping = json.loads(field_mapping)
        except json.JSONDecodeError:
            pass
    
    content = await file.read()
    
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        try:
            text = content.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = content.decode('latin-1')
    
    reader = csv.DictReader(io.StringIO(text))
    
    imported = 0
    skipped = 0
    errors = []
    
    for row_num, row in enumerate(reader, start=2):
        try:
            code_field = mapping.get('code', 'code')
            name_field = mapping.get('name', 'name')
            
            code = row.get(code_field, '').strip()
            name = row.get(name_field, '').strip()
            
            if not code or not name:
                skipped += 1
                continue
            
            if skip_existing:
                existing = await db.accounts.find_one({
                    'code': code,
                    'organization_id': organization_id
                })
                if existing:
                    skipped += 1
                    continue
            
            name_ar_field = mapping.get('name_ar', 'name_ar')
            class_field = mapping.get('account_class', 'account_class')
            type_field = mapping.get('account_type', 'account_type')
            parent_field = mapping.get('parent_code', 'parent_code')
            
            try:
                account_class = int(row.get(class_field, code[0]) or code[0])
            except (ValueError, IndexError):
                account_class = 0
            
            account_doc = {
                'id': str(uuid.uuid4()),
                'code': code,
                'name': name,
                'name_ar': row.get(name_ar_field, '').strip(),
                'account_class': account_class,
                'account_type': row.get(type_field, 'detail').strip() or 'detail',
                'parent_code': row.get(parent_field, '').strip() or None,
                'organization_id': organization_id,
                'balance_lbp': 0,
                'balance_usd': 0,
                'is_active': True
            }
            
            await db.accounts.insert_one(account_doc)
            imported += 1
            
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
    
    return CSVImportResult(
        total_processed=imported + skipped + len(errors),
        imported=imported,
        skipped=skipped,
        errors=errors[:20]
    )


# ================== REBUILD FROM VOUCHERS ==================

@router.post("/accounts/rebuild-from-vouchers", response_model=RebuildFromVouchersResult)
async def rebuild_account_balances(
    request: RebuildFromVouchersRequest,
    current_user: dict = Depends(get_current_user)
):
    """Rebuild all account balances from posted vouchers, with proper parent hierarchy rollup"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    org_id = request.organization_id
    
    # Reset all balances to zero
    await db.accounts.update_many(
        {'organization_id': org_id},
        {'$set': {'balance_lbp': 0, 'balance_usd': 0}}
    )
    
    # Get all posted vouchers
    vouchers = await db.vouchers.find({
        'organization_id': org_id,
        'is_posted': True
    }, {'_id': 0}).to_list(None)
    
    # Build account code to id mapping for this org
    accounts = await db.accounts.find({'organization_id': org_id}, {'_id': 0, 'id': 1, 'code': 1}).to_list(None)
    code_to_id = {acc['code']: acc['id'] for acc in accounts}
    id_to_code = {acc['id']: acc['code'] for acc in accounts}
    all_codes = set(code_to_id.keys())
    
    # Track balance changes per account CODE
    balance_by_code = {}
    
    for voucher in vouchers:
        for line in voucher.get('lines', []):
            # Get account_code
            account_code = line.get('account_code')
            if not account_code:
                account_id = line.get('account_id')
                if account_id:
                    account_code = id_to_code.get(account_id)
            
            if not account_code:
                continue
            
            if account_code not in balance_by_code:
                balance_by_code[account_code] = {'lbp': 0, 'usd': 0}
            
            # Use debit_usd/credit_usd and debit_lbp/credit_lbp fields
            debit_usd = line.get('debit_usd', 0) or 0
            credit_usd = line.get('credit_usd', 0) or 0
            debit_lbp = line.get('debit_lbp', 0) or 0
            credit_lbp = line.get('credit_lbp', 0) or 0
            
            balance_by_code[account_code]['usd'] += (debit_usd - credit_usd)
            balance_by_code[account_code]['lbp'] += (debit_lbp - credit_lbp)
    
    # Apply balance changes to detail accounts first
    accounts_updated = 0
    for code, balance in balance_by_code.items():
        account_id = code_to_id.get(code)
        if account_id:
            await db.accounts.update_one(
                {'id': account_id},
                {'$set': {
                    'balance_lbp': balance['lbp'],
                    'balance_usd': balance['usd']
                }}
            )
            accounts_updated += 1
    
    # Build parent-child relationships
    # For each code, find its direct parent (longest code that is a prefix of this code)
    def find_direct_parent(code, all_codes):
        """Find the longest existing parent code"""
        for i in range(len(code) - 1, 0, -1):
            parent_code = code[:i]
            if parent_code in all_codes:
                return parent_code
        return None
    
    # Group accounts by their direct parent
    children_by_parent = {}
    for code in all_codes:
        parent = find_direct_parent(code, all_codes)
        if parent:
            if parent not in children_by_parent:
                children_by_parent[parent] = []
            children_by_parent[parent].append(code)
    
    # Get all unique code lengths and sort descending
    code_lengths = sorted(set(len(c) for c in all_codes), reverse=True)
    
    # Process from longest to shortest (bottom-up)
    # This ensures children are calculated before their parents
    for length in code_lengths:
        parent_codes = [c for c in all_codes if len(c) == length and c in children_by_parent]
        
        for parent_code in parent_codes:
            children = children_by_parent[parent_code]
            
            # Sum balances of direct children
            total_lbp = 0
            total_usd = 0
            
            for child_code in children:
                child_acc = await db.accounts.find_one(
                    {'organization_id': org_id, 'code': child_code},
                    {'_id': 0, 'balance_lbp': 1, 'balance_usd': 1}
                )
                if child_acc:
                    total_lbp += child_acc.get('balance_lbp', 0) or 0
                    total_usd += child_acc.get('balance_usd', 0) or 0
            
            # Update parent balance
            parent_id = code_to_id.get(parent_code)
            if parent_id:
                await db.accounts.update_one(
                    {'id': parent_id},
                    {'$set': {
                        'balance_lbp': total_lbp,
                        'balance_usd': total_usd
                    }}
                )
                accounts_updated += 1
    
    return RebuildFromVouchersResult(
        vouchers_processed=len(vouchers),
        accounts_updated=accounts_updated,
        message="Account balances rebuilt successfully (with proper parent hierarchy)"
    )
