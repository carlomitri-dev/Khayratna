"""
Sales Quotations Router
Handles sales quotation CRUD operations and conversion to invoices
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import logging

from models.schemas import (
    SalesQuotationCreate, 
    SalesQuotationUpdate, 
    SalesQuotationResponse,
    SalesInvoiceResponse
)
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

# Import db from server module
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env')

client = AsyncIOMotorClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
db = client[os.environ.get('DB_NAME', 'test_database')]

router = APIRouter(prefix="/api", tags=["quotations"])


async def generate_quotation_number(organization_id: str) -> str:
    """Generate next quotation number based on organization's invoice_series settings"""
    year = datetime.now().year
    
    # Get organization settings
    org = await db.organizations.find_one({'id': organization_id}, {'invoice_series': 1})
    series_settings = org.get('invoice_series', {}).get('quotation', {}) if org else {}
    
    # Get prefix from settings or use default
    prefix = series_settings.get('prefix', 'QUO-')
    include_year = series_settings.get('include_year', True)
    
    # Build the full prefix with optional year
    if include_year:
        full_prefix = f"{prefix}{year}-"
    else:
        full_prefix = prefix
    
    # Check if there's a manually set next_number
    manual_next = series_settings.get('next_number')
    
    # Escape special regex characters
    escaped_prefix = full_prefix.replace('-', r'\-').replace('.', r'\.').replace('/', r'\/')
    
    # Find the last quotation with this prefix
    last_quotation = await db.sales_quotations.find_one(
        {
            'organization_id': organization_id,
            'quotation_number': {'$regex': f'^{escaped_prefix}'}
        },
        sort=[('quotation_number', -1)]
    )
    
    if last_quotation:
        try:
            last_num_str = last_quotation['quotation_number'].replace(full_prefix, '')
            last_num = int(last_num_str)
            next_num = last_num + 1
        except (ValueError, KeyError):
            next_num = 1
    else:
        next_num = 1
    
    # Use the higher of DB sequence or manual setting
    if manual_next and manual_next > next_num:
        next_num = manual_next
    
    return f"{full_prefix}{next_num:05d}"


# ================== SALES QUOTATIONS ==================

@router.get("/sales-quotations", response_model=List[SalesQuotationResponse])
async def get_sales_quotations(
    organization_id: str,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get all sales quotations with optional filters"""
    query = {'organization_id': organization_id}
    
    if status:
        query['status'] = status
    if customer_id:
        query['debit_account_id'] = customer_id
    
    skip = (page - 1) * page_size
    
    quotations = await db.sales_quotations.find(
        query, {'_id': 0}
    ).sort('created_at', -1).skip(skip).limit(page_size).to_list(None)
    
    # Enrich with account info
    for quotation in quotations:
        if quotation.get('debit_account_id'):
            account = await db.accounts.find_one(
                {'id': quotation['debit_account_id']},
                {'code': 1, 'name': 1}
            )
            if account:
                quotation['debit_account_code'] = account.get('code')
                quotation['debit_account_name'] = account.get('name')
        
        # Add defaults
        quotation.setdefault('discount_percent', 0)
        quotation.setdefault('discount_amount', 0)
        quotation.setdefault('tax_percent', 0)
        quotation.setdefault('tax_amount', 0)
    
    return quotations


@router.get("/sales-quotations/{quotation_id}", response_model=SalesQuotationResponse)
async def get_sales_quotation(
    quotation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single sales quotation by ID"""
    quotation = await db.sales_quotations.find_one({'id': quotation_id}, {'_id': 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    # Enrich with account info
    if quotation.get('debit_account_id'):
        account = await db.accounts.find_one(
            {'id': quotation['debit_account_id']},
            {'code': 1, 'name': 1}
        )
        if account:
            quotation['debit_account_code'] = account.get('code')
            quotation['debit_account_name'] = account.get('name')
    
    quotation.setdefault('discount_percent', 0)
    quotation.setdefault('discount_amount', 0)
    quotation.setdefault('tax_percent', 0)
    quotation.setdefault('tax_amount', 0)
    
    return SalesQuotationResponse(**quotation)


@router.post("/sales-quotations", response_model=SalesQuotationResponse)
async def create_sales_quotation(
    quotation_data: SalesQuotationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new sales quotation"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Generate quotation number
    quotation_number = await generate_quotation_number(quotation_data.organization_id)
    
    quotation_id = str(uuid.uuid4())
    quotation_doc = {
        'id': quotation_id,
        'quotation_number': quotation_number,
        'date': quotation_data.date,
        'valid_until': quotation_data.valid_until,
        'lines': [line.model_dump() for line in quotation_data.lines],
        'subtotal': quotation_data.subtotal,
        'discount_percent': quotation_data.discount_percent or 0,
        'discount_amount': quotation_data.discount_amount or 0,
        'tax_percent': quotation_data.tax_percent or 0,
        'tax_amount': quotation_data.tax_amount or 0,
        'total': quotation_data.total,
        'total_usd': quotation_data.total_usd,
        'currency': quotation_data.currency,
        'notes': quotation_data.notes,
        'terms': quotation_data.terms,
        'debit_account_id': quotation_data.debit_account_id,
        'status': 'draft',
        'converted_to_invoice_id': None,
        'converted_to_invoice_number': None,
        'organization_id': quotation_data.organization_id,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': None,
        'created_by': current_user.get('name', current_user.get('email'))
    }
    
    await db.sales_quotations.insert_one(quotation_doc)
    
    # Enrich response with account info
    if quotation_doc.get('debit_account_id'):
        account = await db.accounts.find_one(
            {'id': quotation_doc['debit_account_id']},
            {'code': 1, 'name': 1}
        )
        if account:
            quotation_doc['debit_account_code'] = account.get('code')
            quotation_doc['debit_account_name'] = account.get('name')
    
    return SalesQuotationResponse(**quotation_doc)


@router.put("/sales-quotations/{quotation_id}", response_model=SalesQuotationResponse)
async def update_sales_quotation(
    quotation_id: str,
    quotation_data: SalesQuotationUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an existing sales quotation"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    quotation = await db.sales_quotations.find_one({'id': quotation_id}, {'_id': 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    # Cannot edit converted quotations
    if quotation.get('converted_to_invoice_id'):
        raise HTTPException(status_code=400, detail="Cannot edit a quotation that has been converted to an invoice")
    
    update_doc = {'updated_at': datetime.now(timezone.utc).isoformat()}
    
    if quotation_data.date is not None:
        update_doc['date'] = quotation_data.date
    if quotation_data.valid_until is not None:
        update_doc['valid_until'] = quotation_data.valid_until
    if quotation_data.lines is not None:
        update_doc['lines'] = [line.model_dump() for line in quotation_data.lines]
    if quotation_data.subtotal is not None:
        update_doc['subtotal'] = quotation_data.subtotal
    if quotation_data.discount_percent is not None:
        update_doc['discount_percent'] = quotation_data.discount_percent
    if quotation_data.discount_amount is not None:
        update_doc['discount_amount'] = quotation_data.discount_amount
    if quotation_data.tax_percent is not None:
        update_doc['tax_percent'] = quotation_data.tax_percent
    if quotation_data.tax_amount is not None:
        update_doc['tax_amount'] = quotation_data.tax_amount
    if quotation_data.total is not None:
        update_doc['total'] = quotation_data.total
    if quotation_data.total_usd is not None:
        update_doc['total_usd'] = quotation_data.total_usd
    if quotation_data.currency is not None:
        update_doc['currency'] = quotation_data.currency
    if quotation_data.notes is not None:
        update_doc['notes'] = quotation_data.notes
    if quotation_data.terms is not None:
        update_doc['terms'] = quotation_data.terms
    if quotation_data.debit_account_id is not None:
        update_doc['debit_account_id'] = quotation_data.debit_account_id
    if quotation_data.status is not None:
        update_doc['status'] = quotation_data.status
    
    await db.sales_quotations.update_one({'id': quotation_id}, {'$set': update_doc})
    
    updated = await db.sales_quotations.find_one({'id': quotation_id}, {'_id': 0})
    
    # Enrich with account info
    if updated.get('debit_account_id'):
        account = await db.accounts.find_one(
            {'id': updated['debit_account_id']},
            {'code': 1, 'name': 1}
        )
        if account:
            updated['debit_account_code'] = account.get('code')
            updated['debit_account_name'] = account.get('name')
    
    updated.setdefault('discount_percent', 0)
    updated.setdefault('discount_amount', 0)
    updated.setdefault('tax_percent', 0)
    updated.setdefault('tax_amount', 0)
    
    return SalesQuotationResponse(**updated)


@router.delete("/sales-quotations/{quotation_id}")
async def delete_sales_quotation(
    quotation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a sales quotation"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    quotation = await db.sales_quotations.find_one({'id': quotation_id}, {'_id': 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    # Cannot delete converted quotations
    if quotation.get('converted_to_invoice_id'):
        raise HTTPException(status_code=400, detail="Cannot delete a quotation that has been converted to an invoice")
    
    await db.sales_quotations.delete_one({'id': quotation_id})
    
    return {"message": "Quotation deleted successfully"}


@router.post("/sales-quotations/{quotation_id}/convert-to-invoice")
async def convert_quotation_to_invoice(
    quotation_id: str,
    credit_account_id: str,  # Sales account for the invoice
    current_user: dict = Depends(get_current_user)
):
    """Convert a sales quotation to a sales invoice"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    quotation = await db.sales_quotations.find_one({'id': quotation_id}, {'_id': 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    # Check if already converted
    if quotation.get('converted_to_invoice_id'):
        raise HTTPException(
            status_code=400, 
            detail=f"Quotation already converted to invoice {quotation.get('converted_to_invoice_number')}"
        )
    
    # Import invoice generation function
    from routers.invoices import generate_next_invoice_number
    
    # Generate invoice number
    invoice_number = await generate_next_invoice_number(quotation['organization_id'], 'sales_invoice')
    
    invoice_id = str(uuid.uuid4())
    invoice_doc = {
        'id': invoice_id,
        'invoice_number': invoice_number,
        'date': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        'due_date': quotation.get('valid_until'),
        'lines': quotation['lines'],
        'subtotal': quotation['subtotal'],
        'discount_percent': quotation.get('discount_percent', 0),
        'discount_amount': quotation.get('discount_amount', 0),
        'tax_percent': quotation.get('tax_percent', 0),
        'tax_amount': quotation.get('tax_amount', 0),
        'total': quotation['total'],
        'total_usd': quotation['total_usd'],
        'currency': quotation['currency'],
        'notes': quotation.get('notes'),
        'debit_account_id': quotation['debit_account_id'],  # Customer
        'credit_account_id': credit_account_id,  # Sales account
        'status': 'draft',
        'is_posted': False,
        'voucher_id': None,
        'voucher_number': None,
        'organization_id': quotation['organization_id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': None,
        'posted_at': None,
        'posted_by': None,
        'source_quotation_id': quotation_id,
        'source_quotation_number': quotation['quotation_number']
    }
    
    # Insert the invoice
    await db.sales_invoices.insert_one(invoice_doc)
    
    # Update the quotation to mark it as converted
    await db.sales_quotations.update_one(
        {'id': quotation_id},
        {'$set': {
            'status': 'converted',
            'converted_to_invoice_id': invoice_id,
            'converted_to_invoice_number': invoice_number,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Enrich response with account info
    debit_acc = await db.accounts.find_one({'id': invoice_doc['debit_account_id']}, {'code': 1, 'name': 1})
    credit_acc = await db.accounts.find_one({'id': credit_account_id}, {'code': 1, 'name': 1})
    
    invoice_doc['debit_account_code'] = debit_acc.get('code') if debit_acc else None
    invoice_doc['debit_account_name'] = debit_acc.get('name') if debit_acc else None
    invoice_doc['credit_account_code'] = credit_acc.get('code') if credit_acc else None
    invoice_doc['credit_account_name'] = credit_acc.get('name') if credit_acc else None
    
    return {
        "message": "Quotation converted to invoice successfully",
        "invoice_id": invoice_id,
        "invoice_number": invoice_number,
        "invoice": invoice_doc
    }


@router.post("/sales-quotations/{quotation_id}/update-status")
async def update_quotation_status(
    quotation_id: str,
    status: str,
    current_user: dict = Depends(get_current_user)
):
    """Update quotation status (draft, sent, accepted, rejected, expired)"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    valid_statuses = ['draft', 'sent', 'accepted', 'rejected', 'expired']
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    quotation = await db.sales_quotations.find_one({'id': quotation_id}, {'_id': 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    # Cannot change status of converted quotations
    if quotation.get('converted_to_invoice_id'):
        raise HTTPException(status_code=400, detail="Cannot change status of a converted quotation")
    
    await db.sales_quotations.update_one(
        {'id': quotation_id},
        {'$set': {
            'status': status,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": f"Quotation status updated to {status}"}


@router.post("/sales-quotations/{quotation_id}/duplicate")
async def duplicate_quotation(
    quotation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Duplicate an existing quotation"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    quotation = await db.sales_quotations.find_one({'id': quotation_id}, {'_id': 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    # Generate new quotation number
    quotation_number = await generate_quotation_number(quotation['organization_id'])
    
    new_id = str(uuid.uuid4())
    new_quotation = {
        'id': new_id,
        'quotation_number': quotation_number,
        'date': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        'valid_until': None,
        'lines': quotation['lines'],
        'subtotal': quotation['subtotal'],
        'discount_percent': quotation.get('discount_percent', 0),
        'discount_amount': quotation.get('discount_amount', 0),
        'tax_percent': quotation.get('tax_percent', 0),
        'tax_amount': quotation.get('tax_amount', 0),
        'total': quotation['total'],
        'total_usd': quotation['total_usd'],
        'currency': quotation['currency'],
        'notes': quotation.get('notes'),
        'terms': quotation.get('terms'),
        'debit_account_id': quotation['debit_account_id'],
        'status': 'draft',
        'converted_to_invoice_id': None,
        'converted_to_invoice_number': None,
        'organization_id': quotation['organization_id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': None,
        'created_by': current_user.get('name', current_user.get('email'))
    }
    
    await db.sales_quotations.insert_one(new_quotation)
    
    return {
        "message": "Quotation duplicated successfully",
        "quotation_id": new_id,
        "quotation_number": quotation_number
    }
