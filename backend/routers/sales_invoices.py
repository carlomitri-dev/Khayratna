"""
Sales Invoice Router - Handles all sales invoice endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from models.schemas import (
    SalesInvoiceCreate, SalesInvoiceUpdate, SalesInvoiceResponse
)

router = APIRouter(prefix="/sales-invoices", tags=["sales-invoices"])

# These will be injected from main app
db = None
get_current_user = None

def init_router(database, auth_dependency):
    """Initialize router with dependencies"""
    global db, get_current_user
    db = database
    get_current_user = auth_dependency


async def enrich_sales_invoice(invoice: dict) -> dict:
    """Enrich sales invoice with related data"""
    if invoice.get('debit_account_id'):
        customer = await db.accounts.find_one({'id': invoice['debit_account_id']}, {'_id': 0})
        if customer:
            invoice['customer_name'] = customer.get('name')
            invoice['customer_code'] = customer.get('code')
            # Check both top-level and contact_info for address/registration
            ci = customer.get('contact_info', {}) or {}
            invoice['customer_address'] = customer.get('address') or ci.get('address', '') or ''
            invoice['customer_registration_number'] = customer.get('registration_number') or customer.get('vat_number') or ci.get('registration_number', '') or ''
            invoice['customer_balance_usd'] = customer.get('balance_usd', 0) or 0
            # Fetch VAT mirror account balance (4111 → 4114)
            cust_code = customer.get('code', '')
            if cust_code.startswith('4111') and len(cust_code) > 4:
                vat_code = '4114' + cust_code[4:]
                vat_acc = await db.accounts.find_one({'code': vat_code, 'organization_id': invoice['organization_id']}, {'balance_usd': 1, '_id': 0})
                invoice['customer_vat_balance_usd'] = (vat_acc.get('balance_usd', 0) or 0) if vat_acc else 0
            else:
                invoice['customer_vat_balance_usd'] = 0
    
    if invoice.get('credit_account_id'):
        sales_account = await db.accounts.find_one({'id': invoice['credit_account_id']}, {'name': 1, 'code': 1, '_id': 0})
        if sales_account:
            invoice['sales_account_name'] = sales_account.get('name')
            invoice['sales_account_code'] = sales_account.get('code')
    
    return invoice


@router.get("", response_model=List[SalesInvoiceResponse])
async def get_sales_invoices(
    organization_id: str,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Get all sales invoices with optional filters"""
    query = {'organization_id': organization_id}
    
    if status:
        query['status'] = status
    if customer_id:
        query['debit_account_id'] = customer_id
    if date_from:
        query['date'] = {'$gte': date_from}
    if date_to:
        if 'date' in query:
            query['date']['$lte'] = date_to
        else:
            query['date'] = {'$lte': date_to}
    
    invoices = await db.sales_invoices.find(query, {'_id': 0}).sort('date', -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich with customer names
    for invoice in invoices:
        await enrich_sales_invoice(invoice)
    
    return invoices


@router.get("/count")
async def get_sales_invoices_count(
    organization_id: str,
    status: Optional[str] = None,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Get count of sales invoices"""
    query = {'organization_id': organization_id}
    if status:
        query['status'] = status
    
    total = await db.sales_invoices.count_documents(query)
    
    # Count by status
    draft_count = await db.sales_invoices.count_documents({**query, 'status': 'draft'})
    posted_count = await db.sales_invoices.count_documents({**query, 'status': 'posted'})
    
    return {
        'total': total,
        'draft': draft_count,
        'posted': posted_count
    }


@router.get("/last-price/{customer_account_id}/{item_id}")
async def get_last_price(
    customer_account_id: str,
    item_id: str,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Get last sale price for a specific customer and item"""
    # Find the most recent posted invoice for this customer with this item
    pipeline = [
        {'$match': {
            'debit_account_id': customer_account_id,
            'status': 'posted'
        }},
        {'$unwind': '$lines'},
        {'$match': {'lines.inventory_item_id': item_id}},
        {'$sort': {'date': -1, 'created_at': -1}},
        {'$limit': 1},
        {'$project': {
            'invoice_number': 1,
            'date': 1,
            'unit_price': '$lines.unit_price',
            'currency': '$lines.currency'
        }}
    ]
    
    results = await db.sales_invoices.aggregate(pipeline).to_list(1)
    
    if results:
        return {
            'found': True,
            'price': results[0]['unit_price'],
            'currency': results[0].get('currency', 'USD'),
            'date': results[0]['date'],
            'invoice_number': results[0]['invoice_number']
        }
    
    return {'found': False}


@router.get("/{invoice_id}", response_model=SalesInvoiceResponse)
async def get_sales_invoice(
    invoice_id: str,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Get a single sales invoice"""
    invoice = await db.sales_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Sales invoice not found")
    
    await enrich_sales_invoice(invoice)
    return invoice


@router.post("", response_model=SalesInvoiceResponse)
async def create_sales_invoice(
    invoice_data: SalesInvoiceCreate,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Create a new sales invoice"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Generate invoice number
    count = await db.sales_invoices.count_documents({'organization_id': invoice_data.organization_id})
    year = datetime.now().year
    invoice_number = f"SINV-{year}-{str(count + 1).zfill(5)}"
    
    invoice = {
        'id': str(uuid.uuid4()),
        'invoice_number': invoice_number,
        **invoice_data.model_dump(),
        'status': 'draft',
        'is_posted': False,
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': None,
        'posted_at': None,
        'posted_by': None
    }
    
    await db.sales_invoices.insert_one(invoice)
    
    # Remove MongoDB _id before returning
    invoice.pop('_id', None)
    await enrich_sales_invoice(invoice)
    return invoice


@router.put("/{invoice_id}", response_model=SalesInvoiceResponse)
async def update_sales_invoice(
    invoice_id: str,
    invoice_data: SalesInvoiceUpdate,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Update a sales invoice"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    invoice = await db.sales_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    if invoice.get('is_posted'):
        raise HTTPException(status_code=400, detail="Cannot edit posted invoice")
    
    update_data = {k: v for k, v in invoice_data.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    update_data['updated_by'] = current_user['id']
    
    await db.sales_invoices.update_one({'id': invoice_id}, {'$set': update_data})
    
    updated = await db.sales_invoices.find_one({'id': invoice_id}, {'_id': 0})
    await enrich_sales_invoice(updated)
    return updated


@router.delete("/{invoice_id}")
async def delete_sales_invoice(
    invoice_id: str,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Delete a sales invoice"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    invoice = await db.sales_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    if invoice.get('is_posted'):
        raise HTTPException(status_code=400, detail="Cannot delete posted invoice. Unpost first.")
    
    await db.sales_invoices.delete_one({'id': invoice_id})
    return {"message": "Sales invoice deleted successfully"}
