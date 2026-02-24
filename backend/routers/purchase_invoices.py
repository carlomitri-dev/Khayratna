"""
Purchase Invoice Router - Handles all purchase invoice endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from models.schemas import (
    PurchaseInvoiceCreate, PurchaseInvoiceUpdate, PurchaseInvoiceResponse
)

router = APIRouter(prefix="/purchase-invoices", tags=["purchase-invoices"])

# These will be injected from main app
db = None
get_current_user = None

def init_router(database, auth_dependency):
    """Initialize router with dependencies"""
    global db, get_current_user
    db = database
    get_current_user = auth_dependency


async def enrich_purchase_invoice(invoice: dict) -> dict:
    """Enrich purchase invoice with related data"""
    if invoice.get('credit_account_id'):
        supplier = await db.accounts.find_one({'id': invoice['credit_account_id']}, {'name': 1, 'code': 1})
        if supplier:
            invoice['supplier_name'] = supplier.get('name')
            invoice['supplier_code'] = supplier.get('code')
    
    if invoice.get('debit_account_id'):
        purchase_account = await db.accounts.find_one({'id': invoice['debit_account_id']}, {'name': 1, 'code': 1})
        if purchase_account:
            invoice['purchase_account_name'] = purchase_account.get('name')
            invoice['purchase_account_code'] = purchase_account.get('code')
    
    return invoice


@router.get("", response_model=List[PurchaseInvoiceResponse])
async def get_purchase_invoices(
    organization_id: str,
    status: Optional[str] = None,
    supplier_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Get all purchase invoices with optional filters"""
    query = {'organization_id': organization_id}
    
    if status:
        query['status'] = status
    if supplier_id:
        query['credit_account_id'] = supplier_id
    if date_from:
        query['date'] = {'$gte': date_from}
    if date_to:
        if 'date' in query:
            query['date']['$lte'] = date_to
        else:
            query['date'] = {'$lte': date_to}
    
    invoices = await db.purchase_invoices.find(query, {'_id': 0}).sort('date', -1).skip(skip).limit(limit).to_list(limit)
    
    for invoice in invoices:
        await enrich_purchase_invoice(invoice)
    
    return invoices


@router.get("/count")
async def get_purchase_invoices_count(
    organization_id: str,
    status: Optional[str] = None,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Get count of purchase invoices"""
    query = {'organization_id': organization_id}
    if status:
        query['status'] = status
    
    total = await db.purchase_invoices.count_documents(query)
    draft_count = await db.purchase_invoices.count_documents({**query, 'status': 'draft'})
    posted_count = await db.purchase_invoices.count_documents({**query, 'status': 'posted'})
    
    return {
        'total': total,
        'draft': draft_count,
        'posted': posted_count
    }


@router.get("/{invoice_id}", response_model=PurchaseInvoiceResponse)
async def get_purchase_invoice(
    invoice_id: str,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Get a single purchase invoice"""
    invoice = await db.purchase_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")
    
    await enrich_purchase_invoice(invoice)
    return invoice


@router.post("", response_model=PurchaseInvoiceResponse)
async def create_purchase_invoice(
    invoice_data: PurchaseInvoiceCreate,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Create a new purchase invoice"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Generate invoice number
    count = await db.purchase_invoices.count_documents({'organization_id': invoice_data.organization_id})
    year = datetime.now().year
    invoice_number = f"PINV-{year}-{str(count + 1).zfill(5)}"
    
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
    
    await db.purchase_invoices.insert_one(invoice)
    invoice.pop('_id', None)
    await enrich_purchase_invoice(invoice)
    return invoice


@router.put("/{invoice_id}", response_model=PurchaseInvoiceResponse)
async def update_purchase_invoice(
    invoice_id: str,
    invoice_data: PurchaseInvoiceUpdate,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Update a purchase invoice"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    invoice = await db.purchase_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    if invoice.get('is_posted'):
        raise HTTPException(status_code=400, detail="Cannot edit posted invoice")
    
    update_data = {k: v for k, v in invoice_data.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    update_data['updated_by'] = current_user['id']
    
    await db.purchase_invoices.update_one({'id': invoice_id}, {'$set': update_data})
    
    updated = await db.purchase_invoices.find_one({'id': invoice_id}, {'_id': 0})
    await enrich_purchase_invoice(updated)
    return updated


@router.delete("/{invoice_id}")
async def delete_purchase_invoice(
    invoice_id: str,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Delete a purchase invoice"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    invoice = await db.purchase_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    if invoice.get('is_posted'):
        raise HTTPException(status_code=400, detail="Cannot delete posted invoice. Unpost first.")
    
    await db.purchase_invoices.delete_one({'id': invoice_id})
    return {"message": "Purchase invoice deleted successfully"}
