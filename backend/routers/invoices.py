"""
Invoices Router - Sales and Purchase Invoice endpoints
Refactored from server.py for modularity
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from core.database import db
from core.auth import get_current_user
from models.schemas import (
    SalesInvoiceCreate, SalesInvoiceUpdate, SalesInvoiceResponse,
    PurchaseInvoiceCreate, PurchaseInvoiceUpdate, PurchaseInvoiceResponse
)

router = APIRouter(tags=["Invoices"])


# ================== HELPER FUNCTIONS ==================

async def enrich_invoice(invoice: dict) -> dict:
    """Enrich invoice with account names"""
    if invoice.get('debit_account_id'):
        debit_acc = await db.accounts.find_one({'id': invoice['debit_account_id']}, {'code': 1, 'name': 1})
        invoice['debit_account_code'] = debit_acc['code'] if debit_acc else None
        invoice['debit_account_name'] = debit_acc['name'] if debit_acc else None
    
    if invoice.get('credit_account_id'):
        credit_acc = await db.accounts.find_one({'id': invoice['credit_account_id']}, {'code': 1, 'name': 1})
        invoice['credit_account_code'] = credit_acc['code'] if credit_acc else None
        invoice['credit_account_name'] = credit_acc['name'] if credit_acc else None
    
    if invoice.get('voucher_id'):
        voucher = await db.vouchers.find_one({'id': invoice['voucher_id']}, {'voucher_number': 1})
        invoice['voucher_number'] = voucher['voucher_number'] if voucher else None
    
    return invoice


async def generate_next_invoice_number(organization_id: str, doc_type: str = 'sales_invoice') -> str:
    """
    Generate the next invoice number based on organization's invoice_series settings.
    Falls back to default format if no custom settings exist.
    """
    from datetime import datetime
    year = datetime.now().year
    
    # Default prefixes
    default_prefixes = {
        'sales_invoice': 'INV-',
        'purchase_invoice': 'PUR-',
        'pos': 'POS-',
        'dbcr': 'DBCR-'
    }
    
    # Collection mapping
    collections = {
        'sales_invoice': 'sales_invoices',
        'purchase_invoice': 'purchase_invoices',
        'pos': 'pos_transactions',
        'dbcr': 'crdb_notes'
    }
    
    # Number field mapping
    number_fields = {
        'sales_invoice': 'invoice_number',
        'purchase_invoice': 'invoice_number',
        'pos': 'receipt_number',
        'dbcr': 'note_number'
    }
    
    # Get organization settings
    org = await db.organizations.find_one({'id': organization_id}, {'invoice_series': 1})
    series_settings = org.get('invoice_series', {}).get(doc_type, {}) if org else {}
    
    # Get prefix from settings or use default
    prefix = series_settings.get('prefix', default_prefixes.get(doc_type, 'DOC-'))
    include_year = series_settings.get('include_year', True)
    
    # Build the full prefix with optional year
    if include_year:
        full_prefix = f"{prefix}{year}-"
    else:
        full_prefix = prefix
    
    # Check if there's a manually set next_number
    manual_next = series_settings.get('next_number')
    
    # Get the collection name
    collection_name = collections.get(doc_type, 'sales_invoices')
    number_field = number_fields.get(doc_type, 'invoice_number')
    collection = db[collection_name]
    
    # Find the last document with this prefix pattern
    # Escape special regex characters in prefix
    escaped_prefix = full_prefix.replace('-', '\\-').replace('.', '\\.').replace('/', '\\/')
    last_doc = await collection.find_one(
        {
            'organization_id': organization_id,
            number_field: {'$regex': f'^{escaped_prefix}'}
        },
        {number_field: 1},
        sort=[(number_field, -1)]
    )
    
    # Determine next number
    if last_doc:
        try:
            last_num_str = last_doc[number_field].replace(full_prefix, '')
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


# ================== SALES INVOICES ==================

@router.get("/sales-invoices", response_model=List[SalesInvoiceResponse])
async def get_sales_invoices(
    organization_id: str,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    current_user: dict = Depends(get_current_user)
):
    """Get sales invoices with filters and pagination"""
    query = {'organization_id': organization_id}
    
    if status == 'posted':
        query['status'] = 'posted'
    elif status == 'draft':
        query['status'] = 'draft'
    
    if customer_id:
        query['customer_id'] = customer_id
    
    if date_from:
        query['date'] = {'$gte': date_from}
    if date_to:
        if 'date' in query:
            query['date']['$lte'] = date_to
        else:
            query['date'] = {'$lte': date_to}
    
    invoices = await db.sales_invoices.find(query, {'_id': 0}).sort('created_at', -1).to_list(10000)
    
    # Build customer name lookup for search
    customer_names = {}
    if search:
        customers = await db.accounts.find(
            {'organization_id': organization_id}, 
            {'_id': 0, 'id': 1, 'name': 1, 'code': 1}
        ).to_list(10000)
        for cust in customers:
            customer_names[cust['id']] = f"{cust.get('code', '')} {cust.get('name', '')}".lower()
    
    if search:
        search_lower = search.lower()
        filtered = []
        for inv in invoices:
            if search_lower in (inv.get('invoice_number') or '').lower():
                filtered.append(inv)
                continue
            if search_lower in (inv.get('notes') or '').lower():
                filtered.append(inv)
                continue
            debit_id = inv.get('debit_account_id')
            if debit_id and debit_id in customer_names:
                if search_lower in customer_names[debit_id]:
                    filtered.append(inv)
                    continue
            found_in_lines = False
            for line in inv.get('lines', []):
                if (search_lower in (line.get('item_name') or '').lower() or
                    search_lower in (line.get('barcode') or '').lower()):
                    found_in_lines = True
                    break
            if found_in_lines:
                filtered.append(inv)
        invoices = filtered
    
    total = len(invoices)
    invoices = invoices[skip:skip + limit]
    
    enriched = []
    for inv in invoices:
        enriched.append(await enrich_invoice(inv))
    
    return [SalesInvoiceResponse(**inv) for inv in enriched]


@router.get("/sales-invoices/count")
async def get_sales_invoices_count(
    organization_id: str,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get count of sales invoices"""
    query = {'organization_id': organization_id}
    
    if status == 'posted':
        query['status'] = 'posted'
    elif status == 'draft':
        query['status'] = 'draft'
    
    if customer_id:
        query['customer_id'] = customer_id
    
    if search:
        invoices = await db.sales_invoices.find(query, {'_id': 0, 'invoice_number': 1, 'notes': 1, 'lines': 1}).to_list(10000)
        search_lower = search.lower()
        count = sum(1 for inv in invoices if 
            search_lower in (inv.get('invoice_number') or '').lower() or
            search_lower in (inv.get('notes') or '').lower() or
            any(search_lower in (line.get('item_name') or '').lower() for line in inv.get('lines', []))
        )
        return {"count": count}
    
    count = await db.sales_invoices.count_documents(query)
    return {"count": count}


@router.get("/sales-invoices/{invoice_id}", response_model=SalesInvoiceResponse)
async def get_sales_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single sales invoice"""
    invoice = await db.sales_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice = await enrich_invoice(invoice)
    return SalesInvoiceResponse(**invoice)


@router.get("/sales-invoices/last-price/{customer_account_id}/{item_id}")
async def get_last_price_for_customer(
    customer_account_id: str, 
    item_id: str, 
    current_user: dict = Depends(get_current_user)
):
    """Get the last price for an item sold to a customer"""
    pipeline = [
        {'$match': {'debit_account_id': customer_account_id, 'is_posted': True}},
        {'$sort': {'date': -1, 'created_at': -1}},
        {'$unwind': '$lines'},
        {'$match': {'lines.inventory_item_id': item_id}},
        {'$limit': 1},
        {'$project': {
            'unit_price': '$lines.unit_price',
            'currency': '$lines.currency',
            'date': 1,
            'invoice_number': 1
        }}
    ]
    
    result = await db.sales_invoices.aggregate(pipeline).to_list(1)
    
    if result:
        return {
            'found': True,
            'unit_price': result[0].get('unit_price'),
            'currency': result[0].get('currency'),
            'date': result[0].get('date'),
            'invoice_number': result[0].get('invoice_number')
        }
    
    return {'found': False}


@router.post("/sales-invoices", response_model=SalesInvoiceResponse)
async def create_sales_invoice(
    invoice_data: SalesInvoiceCreate, 
    current_user: dict = Depends(get_current_user)
):
    """Create a new sales invoice"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Generate invoice number using configurable series
    invoice_number = await generate_next_invoice_number(invoice_data.organization_id, 'sales_invoice')
    
    invoice_id = str(uuid.uuid4())
    invoice_doc = {
        'id': invoice_id,
        'invoice_number': invoice_number,
        'date': invoice_data.date,
        'due_date': invoice_data.due_date,
        'debit_account_id': invoice_data.debit_account_id,
        'credit_account_id': invoice_data.credit_account_id,
        'lines': [line.model_dump() for line in invoice_data.lines],
        'subtotal': invoice_data.subtotal,
        'tax_amount': invoice_data.tax_amount,
        'discount_amount': invoice_data.discount_amount,
        'discount_percent': getattr(invoice_data, 'discount_percent', 0) or 0,
        'tax_percent': getattr(invoice_data, 'tax_percent', 0) or 0,
        'total': invoice_data.total,
        'total_usd': invoice_data.total_usd,
        'currency': invoice_data.currency,
        'notes': invoice_data.notes,
        'status': 'draft',
        'is_posted': False,
        'organization_id': invoice_data.organization_id,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'created_by': current_user['id']
    }
    
    await db.sales_invoices.insert_one(invoice_doc)
    
    invoice_doc = await enrich_invoice(invoice_doc)
    return SalesInvoiceResponse(**invoice_doc)


@router.put("/sales-invoices/{invoice_id}", response_model=SalesInvoiceResponse)
async def update_sales_invoice(
    invoice_id: str, 
    invoice_data: SalesInvoiceUpdate, 
    current_user: dict = Depends(get_current_user)
):
    """Update a sales invoice (draft only)"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    invoice = await db.sales_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    if invoice.get('is_posted'):
        raise HTTPException(status_code=400, detail="Cannot update a posted invoice")
    
    update_doc = {}
    for field, value in invoice_data.model_dump(exclude_unset=True).items():
        if field == 'lines' and value is not None:
            update_doc['lines'] = [line if isinstance(line, dict) else line.model_dump() for line in value]
        else:
            update_doc[field] = value
    
    update_doc['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.sales_invoices.update_one({'id': invoice_id}, {'$set': update_doc})
    
    updated = await db.sales_invoices.find_one({'id': invoice_id}, {'_id': 0})
    updated = await enrich_invoice(updated)
    return SalesInvoiceResponse(**updated)


@router.delete("/sales-invoices/{invoice_id}")
async def delete_sales_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a sales invoice (draft only)"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    invoice = await db.sales_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    if invoice.get('is_posted'):
        raise HTTPException(status_code=400, detail="Cannot delete a posted invoice. Unpost first.")
    
    await db.sales_invoices.delete_one({'id': invoice_id})
    return {"message": "Invoice deleted successfully"}


@router.post("/sales-invoices/{invoice_id}/post")
async def post_sales_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Post a sales invoice - creates a sales voucher"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    invoice = await db.sales_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    if invoice.get('is_posted'):
        raise HTTPException(status_code=400, detail="Invoice is already posted")
    
    # Get account details
    debit_account = await db.accounts.find_one(
        {'$or': [{'id': invoice['debit_account_id']}, {'code': invoice.get('debit_account_code', '')}], 'organization_id': invoice['organization_id']},
        {'_id': 0}
    )
    credit_account = await db.accounts.find_one(
        {'$or': [{'id': invoice['credit_account_id']}, {'code': invoice.get('credit_account_code', '')}], 'organization_id': invoice['organization_id']},
        {'_id': 0}
    )
    
    if not debit_account or not credit_account:
        raise HTTPException(status_code=400, detail="Invalid account configuration")
    
    # Get exchange rate for LBP conversion
    rate_doc = await db.exchange_rates.find_one(
        {'organization_id': invoice['organization_id']},
        {'rate': 1},
        sort=[('date', -1)]
    )
    base_rate = rate_doc['rate'] if rate_doc else 89500
    
    # Get organization tax settings
    org = await db.organizations.find_one({'id': invoice['organization_id']}, {'tax_percent': 1, '_id': 0})
    tax_percent = org.get('tax_percent', 11) if org else 11
    
    # Calculate amounts
    total_usd = invoice.get('total_usd') or invoice.get('total', 0)
    tax_usd = invoice.get('tax_amount_usd') or invoice.get('tax_amount', 0)
    
    # If no separate tax amount, calculate from total and tax%
    if tax_usd == 0 and tax_percent > 0:
        subtotal_usd = invoice.get('subtotal_usd') or invoice.get('subtotal', 0)
        if subtotal_usd > 0:
            tax_usd = subtotal_usd * tax_percent / 100
        else:
            # Total includes tax, extract it
            tax_usd = total_usd * tax_percent / (100 + tax_percent)
    
    amount_without_vat_usd = total_usd - tax_usd
    
    amount_without_vat_lbp = amount_without_vat_usd * base_rate
    tax_lbp = tax_usd * base_rate
    total_lbp = total_usd * base_rate
    
    # Determine VAT customer account (4111xxxx → 4114xxxx)
    customer_code = debit_account['code']
    vat_customer_code = customer_code.replace('4111', '4114', 1) if customer_code.startswith('4111') else None
    
    # Find VAT accounts
    vat_customer_account = None
    if vat_customer_code:
        vat_customer_account = await db.accounts.find_one(
            {'code': vat_customer_code, 'organization_id': invoice['organization_id']}, {'_id': 0}
        )
    
    # VAT payable account (44270003)
    vat_payable_account = await db.accounts.find_one(
        {'code': '44270003', 'organization_id': invoice['organization_id']}, {'_id': 0}
    )
    
    # Generate voucher number
    year = datetime.now().year
    prefix = f"SV-{year}-"
    last_voucher = await db.vouchers.find_one(
        {'organization_id': invoice['organization_id'], 'voucher_number': {'$regex': f'^{prefix}'}},
        {'voucher_number': 1},
        sort=[('voucher_number', -1)]
    )
    if last_voucher:
        last_num = int(last_voucher['voucher_number'].split('-')[-1])
        voucher_number = f"{prefix}{last_num + 1:05d}"
    else:
        voucher_number = f"{prefix}00001"
    
    # Build voucher lines - 4 line pattern
    voucher_lines = []
    desc = f"Invoice {invoice.get('invoice_number', '')}"
    
    # Line 1: Debit Customer (amount without VAT)
    voucher_lines.append({
        'account_code': debit_account['code'],
        'account_name': debit_account['name'],
        'description': desc,
        'debit_lbp': amount_without_vat_lbp,
        'credit_lbp': 0,
        'debit_usd': amount_without_vat_usd,
        'credit_usd': 0,
        'exchange_rate': base_rate
    })
    
    # Line 2: Debit Customer VAT (VAT amount) - if VAT account exists
    if vat_customer_account and tax_usd > 0:
        voucher_lines.append({
            'account_code': vat_customer_code,
            'account_name': vat_customer_account['name'],
            'description': desc,
            'debit_lbp': tax_lbp,
            'credit_lbp': 0,
            'debit_usd': tax_usd,
            'credit_usd': 0,
            'exchange_rate': base_rate
        })
    
    # Line 3: Credit VAT Payable (VAT amount) - if VAT payable account exists
    if vat_payable_account and tax_usd > 0:
        voucher_lines.append({
            'account_code': '44270003',
            'account_name': vat_payable_account['name'],
            'description': desc,
            'debit_lbp': 0,
            'credit_lbp': tax_lbp,
            'debit_usd': 0,
            'credit_usd': tax_usd,
            'exchange_rate': base_rate
        })
    
    # Line 4: Credit Sales Revenue (amount without VAT)
    voucher_lines.append({
        'account_code': credit_account['code'],
        'account_name': credit_account['name'],
        'description': desc,
        'debit_lbp': 0,
        'credit_lbp': amount_without_vat_lbp,
        'debit_usd': 0,
        'credit_usd': amount_without_vat_usd,
        'exchange_rate': base_rate
    })
    
    total_debit_usd = sum(l['debit_usd'] for l in voucher_lines)
    total_credit_usd = sum(l['credit_usd'] for l in voucher_lines)
    total_debit_lbp = sum(l['debit_lbp'] for l in voucher_lines)
    total_credit_lbp = sum(l['credit_lbp'] for l in voucher_lines)
    
    # Create the sales voucher
    voucher_id = str(uuid.uuid4())
    voucher_doc = {
        'id': voucher_id,
        'voucher_number': voucher_number,
        'voucher_type': 'SV',
        'date': invoice['date'],
        'description': f"Sales Invoice {invoice['invoice_number']}",
        'reference': invoice['invoice_number'],
        'lines': voucher_lines,
        'total_debit_lbp': total_debit_lbp,
        'total_credit_lbp': total_credit_lbp,
        'total_debit_usd': total_debit_usd,
        'total_credit_usd': total_credit_usd,
        'currency': invoice.get('currency', 'USD'),
        'exchange_rate': base_rate,
        'is_posted': True,
        'status': 'posted',
        'source_type': 'sales_invoice',
        'source_id': invoice_id,
        'organization_id': invoice['organization_id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'posted_at': datetime.now(timezone.utc).isoformat(),
        'created_by': current_user['id'],
        'posted_by': current_user['id']
    }
    
    await db.vouchers.insert_one(voucher_doc)
    
    # Update ALL account balances from voucher lines
    for line in voucher_lines:
        net_usd = line['debit_usd'] - line['credit_usd']
        net_lbp = line['debit_lbp'] - line['credit_lbp']
        if net_usd != 0 or net_lbp != 0:
            await db.accounts.update_one(
                {'code': line['account_code'], 'organization_id': invoice['organization_id']},
                {'$inc': {'balance_usd': net_usd, 'balance_lbp': net_lbp}}
            )
    
    # Update inventory quantities (reduce stock) with batch handling
    for line in invoice.get('lines', []):
        if line.get('inventory_item_id'):
            item = await db.inventory_items.find_one({'id': line['inventory_item_id']}, {'_id': 0})
            if item:
                qty_to_deduct = line['quantity']
                batches = item.get('batches', [])
                
                # If batch_id is specified, deduct from that specific batch
                if line.get('batch_id'):
                    for batch in batches:
                        if batch.get('id') == line['batch_id']:
                            batch['quantity'] = max(0, batch.get('quantity', 0) - qty_to_deduct)
                            break
                # Otherwise, use FIFO (deduct from oldest batches first)
                elif batches:
                    sorted_batches = sorted(
                        batches,
                        key=lambda b: (b.get('expiry_date') or '9999-12-31', b.get('received_date') or '9999-12-31')
                    )
                    remaining = qty_to_deduct
                    for batch in sorted_batches:
                        if remaining <= 0:
                            break
                        batch_qty = batch.get('quantity', 0)
                        if batch_qty > 0:
                            deduct = min(batch_qty, remaining)
                            batch['quantity'] = batch_qty - deduct
                            remaining -= deduct
                    batches = sorted_batches
                
                await db.inventory_items.update_one(
                    {'id': line['inventory_item_id']},
                    {
                        '$inc': {'on_hand_qty': -qty_to_deduct},
                        '$set': {'batches': batches, 'updated_at': datetime.now(timezone.utc).isoformat()}
                    }
                )
        
        # Also deduct used_items (parts/materials used for services)
        for used_item in (line.get('used_items') or []):
            if used_item.get('inventory_item_id'):
                await db.inventory_items.update_one(
                    {'id': used_item['inventory_item_id']},
                    {'$inc': {'on_hand_qty': -used_item.get('quantity', 0)}}
                )
    
    # Update invoice status
    await db.sales_invoices.update_one(
        {'id': invoice_id},
        {'$set': {
            'status': 'posted',
            'is_posted': True,
            'voucher_id': voucher_id,
            'posted_at': datetime.now(timezone.utc).isoformat(),
            'posted_by': current_user['id']
        }}
    )
    
    return {
        "message": "Invoice posted successfully",
        "voucher_id": voucher_id,
        "voucher_number": voucher_number
    }


@router.post("/sales-invoices/{invoice_id}/unpost")
async def unpost_sales_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Unpost a sales invoice - reverses the voucher and restores inventory"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    invoice = await db.sales_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    if not invoice.get('is_posted'):
        raise HTTPException(status_code=400, detail="Invoice is not posted")
    
    voucher_id = invoice.get('voucher_id')
    
    # Reverse the voucher if it exists
    if voucher_id:
        voucher = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
        if voucher:
            # Reverse account balances
            for line in voucher.get('lines', []):
                account_id = line.get('account_id')
                if account_id:
                    await db.accounts.update_one(
                        {'id': account_id},
                        {'$inc': {
                            'balance_usd': -(line.get('debit_usd', 0) - line.get('credit_usd', 0)),
                            'balance_lbp': -(line.get('debit_lbp', 0) - line.get('credit_lbp', 0))
                        }}
                    )
            # Delete the voucher
            await db.vouchers.delete_one({'id': voucher_id})
    
    # Restore inventory quantities
    for line in invoice.get('lines', []):
        if line.get('inventory_item_id'):
            await db.inventory_items.update_one(
                {'id': line['inventory_item_id']},
                {'$inc': {'on_hand_qty': line['quantity']}}
            )
        
        # Restore used_items
        for used_item in (line.get('used_items') or []):
            if used_item.get('inventory_item_id'):
                await db.inventory_items.update_one(
                    {'id': used_item['inventory_item_id']},
                    {'$inc': {'on_hand_qty': used_item.get('quantity', 0)}}
                )
    
    # Update invoice status
    await db.sales_invoices.update_one(
        {'id': invoice_id},
        {'$set': {
            'status': 'draft',
            'is_posted': False,
            'voucher_id': None,
            'posted_at': None,
            'posted_by': None
        }}
    )
    
    return {"message": "Invoice unposted successfully"}


# ================== HELPER ACCOUNTS ==================

@router.get("/sales-accounts")
async def get_sales_accounts(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Get accounts for sales (class 7, detail accounts with code length > 4)"""
    accounts = await db.accounts.find(
        {
            'organization_id': organization_id, 
            'account_class': 7,
            '$expr': {'$gt': [{'$strLenCP': '$code'}, 4]}
        },
        {'_id': 0, 'id': 1, 'code': 1, 'name': 1, 'name_ar': 1}
    ).sort('code', 1).to_list(100)
    return accounts


@router.get("/customer-accounts")
async def get_customer_accounts(organization_id: str, search: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get customer accounts (codes starting with '41' and length > 4, for debit on sales invoices)"""
    query = {
        'organization_id': organization_id, 
        'code': {'$regex': '^41'},
        'account_type': {'$ne': 'header'},
        '$expr': {'$gt': [{'$strLenCP': '$code'}, 4]}
    }
    if search:
        query = {
            '$and': [
                query,
                {'$or': [
                    {'code': {'$regex': search, '$options': 'i'}},
                    {'name': {'$regex': search, '$options': 'i'}},
                    {'name_ar': {'$regex': search}}
                ]}
            ]
        }
    accounts = await db.accounts.find(
        query,
        {'_id': 0, 'id': 1, 'code': 1, 'name': 1, 'name_ar': 1, 'balance_usd': 1, 'balance_lbp': 1, 'address': 1, 'mobile': 1, 'contact_person': 1, 'registration_number': 1, 'region_id': 1}
    ).sort('code', 1).to_list(100)
    return accounts


@router.get("/supplier-accounts")
async def get_supplier_accounts(organization_id: str, search: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get supplier accounts (codes starting with '40' and length > 4, for credit on purchase invoices)"""
    query = {
        'organization_id': organization_id, 
        'code': {'$regex': '^40'},
        'account_type': {'$ne': 'header'},
        '$expr': {'$gt': [{'$strLenCP': '$code'}, 4]}
    }
    if search:
        query = {
            '$and': [
                query,
                {'$or': [
                    {'code': {'$regex': search, '$options': 'i'}},
                    {'name': {'$regex': search, '$options': 'i'}},
                    {'name_ar': {'$regex': search}}
                ]}
            ]
        }
    accounts = await db.accounts.find(
        query,
        {'_id': 0, 'id': 1, 'code': 1, 'name': 1, 'name_ar': 1, 'balance_usd': 1, 'balance_lbp': 1, 'address': 1, 'mobile': 1, 'contact_person': 1, 'registration_number': 1}
    ).sort('code', 1).to_list(100)
    return accounts


@router.get("/purchase-accounts")
async def get_purchase_accounts(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Get accounts for purchases (class 6, detail accounts with code length > 4)"""
    accounts = await db.accounts.find(
        {
            'organization_id': organization_id, 
            'account_class': 6,
            '$expr': {'$gt': [{'$strLenCP': '$code'}, 4]}
        },
        {'_id': 0, 'id': 1, 'code': 1, 'name': 1, 'name_ar': 1}
    ).sort('code', 1).to_list(100)
    return accounts


# ================== PURCHASE INVOICES ==================

@router.get("/purchase-invoices", response_model=List[PurchaseInvoiceResponse])
async def get_purchase_invoices(
    organization_id: str,
    status: Optional[str] = None,
    supplier_id: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    current_user: dict = Depends(get_current_user)
):
    """Get purchase invoices with filters and pagination"""
    query = {'organization_id': organization_id}
    
    if status == 'posted':
        query['status'] = 'posted'
    elif status == 'draft':
        query['status'] = 'draft'
    
    if supplier_id:
        query['supplier_id'] = supplier_id
    
    invoices = await db.purchase_invoices.find(query, {'_id': 0}).sort('created_at', -1).to_list(10000)
    
    if search:
        search_lower = search.lower()
        invoices = [inv for inv in invoices if 
            search_lower in (inv.get('invoice_number') or '').lower() or
            search_lower in (inv.get('notes') or '').lower() or
            any(search_lower in (line.get('item_name') or '').lower() for line in inv.get('lines', []))
        ]
    
    total = len(invoices)
    invoices = invoices[skip:skip + limit]
    
    enriched = []
    for inv in invoices:
        enriched.append(await enrich_invoice(inv))
    
    return [PurchaseInvoiceResponse(**inv) for inv in enriched]


@router.get("/purchase-invoices/count")
async def get_purchase_invoices_count(
    organization_id: str,
    status: Optional[str] = None,
    supplier_id: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get count of purchase invoices"""
    query = {'organization_id': organization_id}
    
    if status == 'posted':
        query['status'] = 'posted'
    elif status == 'draft':
        query['status'] = 'draft'
    
    if supplier_id:
        query['supplier_id'] = supplier_id
    
    if search:
        invoices = await db.purchase_invoices.find(query, {'_id': 0, 'invoice_number': 1, 'notes': 1, 'lines': 1}).to_list(10000)
        search_lower = search.lower()
        count = sum(1 for inv in invoices if 
            search_lower in (inv.get('invoice_number') or '').lower() or
            search_lower in (inv.get('notes') or '').lower() or
            any(search_lower in (line.get('item_name') or '').lower() for line in inv.get('lines', []))
        )
        return {"count": count}
    
    count = await db.purchase_invoices.count_documents(query)
    return {"count": count}


@router.get("/purchase-invoices/{invoice_id}", response_model=PurchaseInvoiceResponse)
async def get_purchase_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single purchase invoice"""
    invoice = await db.purchase_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice = await enrich_invoice(invoice)
    return PurchaseInvoiceResponse(**invoice)


@router.post("/purchase-invoices", response_model=PurchaseInvoiceResponse)
async def create_purchase_invoice(
    invoice_data: PurchaseInvoiceCreate, 
    current_user: dict = Depends(get_current_user)
):
    """Create a new purchase invoice"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Generate invoice number using configurable series
    invoice_number = await generate_next_invoice_number(invoice_data.organization_id, 'purchase_invoice')
    
    invoice_id = str(uuid.uuid4())
    invoice_doc = {
        'id': invoice_id,
        'invoice_number': invoice_number,
        'date': invoice_data.date,
        'due_date': invoice_data.due_date,
        'debit_account_id': invoice_data.debit_account_id,
        'credit_account_id': invoice_data.credit_account_id,
        'lines': [line.model_dump() for line in invoice_data.lines],
        'subtotal': invoice_data.subtotal,
        'tax_amount': invoice_data.tax_amount,
        'discount_amount': invoice_data.discount_amount,
        'discount_percent': getattr(invoice_data, 'discount_percent', 0) or 0,
        'tax_percent': getattr(invoice_data, 'tax_percent', 0) or 0,
        'total': invoice_data.total,
        'total_usd': invoice_data.total_usd,
        'currency': invoice_data.currency,
        'notes': invoice_data.notes,
        'status': 'draft',
        'is_posted': False,
        'organization_id': invoice_data.organization_id,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'created_by': current_user['id']
    }
    
    await db.purchase_invoices.insert_one(invoice_doc)
    
    invoice_doc = await enrich_invoice(invoice_doc)
    return PurchaseInvoiceResponse(**invoice_doc)


@router.put("/purchase-invoices/{invoice_id}", response_model=PurchaseInvoiceResponse)
async def update_purchase_invoice(
    invoice_id: str, 
    invoice_data: PurchaseInvoiceUpdate, 
    current_user: dict = Depends(get_current_user)
):
    """Update a purchase invoice (draft only)"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    invoice = await db.purchase_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    if invoice.get('is_posted'):
        raise HTTPException(status_code=400, detail="Cannot update a posted invoice")
    
    update_doc = {}
    for field, value in invoice_data.model_dump(exclude_unset=True).items():
        if field == 'lines' and value is not None:
            update_doc['lines'] = [line if isinstance(line, dict) else line.model_dump() for line in value]
        else:
            update_doc[field] = value
    
    update_doc['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.purchase_invoices.update_one({'id': invoice_id}, {'$set': update_doc})
    
    updated = await db.purchase_invoices.find_one({'id': invoice_id}, {'_id': 0})
    updated = await enrich_invoice(updated)
    return PurchaseInvoiceResponse(**updated)


@router.delete("/purchase-invoices/{invoice_id}")
async def delete_purchase_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a purchase invoice (draft only)"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    invoice = await db.purchase_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    if invoice.get('is_posted'):
        raise HTTPException(status_code=400, detail="Cannot delete a posted invoice. Unpost first.")
    
    await db.purchase_invoices.delete_one({'id': invoice_id})
    return {"message": "Invoice deleted successfully"}


@router.post("/purchase-invoices/{invoice_id}/post")
async def post_purchase_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Post a purchase invoice - creates a purchase voucher and ADDS inventory"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    invoice = await db.purchase_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    if invoice.get('is_posted'):
        raise HTTPException(status_code=400, detail="Invoice is already posted")
    
    # Get account details  
    debit_account = await db.accounts.find_one(
        {'$or': [{'id': invoice['debit_account_id']}, {'code': invoice.get('debit_account_code', '')}], 'organization_id': invoice['organization_id']},
        {'_id': 0}
    )
    credit_account = await db.accounts.find_one(
        {'$or': [{'id': invoice['credit_account_id']}, {'code': invoice.get('credit_account_code', '')}], 'organization_id': invoice['organization_id']},
        {'_id': 0}
    )
    
    if not debit_account or not credit_account:
        raise HTTPException(status_code=400, detail="Invalid account configuration")
    
    # Get exchange rate for LBP conversion
    rate_doc = await db.exchange_rates.find_one(
        {'organization_id': invoice['organization_id']},
        {'rate': 1},
        sort=[('date', -1)]
    )
    base_rate = rate_doc['rate'] if rate_doc else 89500
    
    # Get organization tax settings
    org = await db.organizations.find_one({'id': invoice['organization_id']}, {'tax_percent': 1, '_id': 0})
    tax_percent = org.get('tax_percent', 11) if org else 11
    
    # Calculate amounts
    total_usd = invoice.get('total_usd') or invoice.get('total', 0)
    tax_usd = invoice.get('tax_amount_usd') or invoice.get('tax_amount', 0)
    
    if tax_usd == 0 and tax_percent > 0:
        subtotal_usd = invoice.get('subtotal_usd') or invoice.get('subtotal', 0)
        if subtotal_usd > 0:
            tax_usd = subtotal_usd * tax_percent / 100
        else:
            tax_usd = total_usd * tax_percent / (100 + tax_percent)
    
    amount_without_vat_usd = total_usd - tax_usd
    amount_without_vat_lbp = amount_without_vat_usd * base_rate
    tax_lbp = tax_usd * base_rate
    
    # Determine VAT supplier account (4011xxxx → 4014xxxx)
    supplier_code = credit_account['code']
    vat_supplier_code = supplier_code.replace('4011', '4014', 1) if supplier_code.startswith('4011') else None
    
    vat_supplier_account = None
    if vat_supplier_code:
        vat_supplier_account = await db.accounts.find_one(
            {'code': vat_supplier_code, 'organization_id': invoice['organization_id']}, {'_id': 0}
        )
    
    # VAT input/receivable account (44260006)
    vat_input_account = await db.accounts.find_one(
        {'code': '44260006', 'organization_id': invoice['organization_id']}, {'_id': 0}
    )
    
    # Generate voucher number
    year = datetime.now().year
    prefix = f"PV-{year}-"
    last_voucher = await db.vouchers.find_one(
        {'organization_id': invoice['organization_id'], 'voucher_number': {'$regex': f'^{prefix}'}},
        {'voucher_number': 1},
        sort=[('voucher_number', -1)]
    )
    if last_voucher:
        last_num = int(last_voucher['voucher_number'].split('-')[-1])
        voucher_number = f"{prefix}{last_num + 1:05d}"
    else:
        voucher_number = f"{prefix}00001"
    
    # Build voucher lines - 4 line pattern for purchases
    voucher_lines = []
    desc = f"Purchase Invoice {invoice.get('invoice_number', '')}"
    
    # Line 1: Debit Expense/Purchase (amount without VAT)
    voucher_lines.append({
        'account_code': debit_account['code'],
        'account_name': debit_account['name'],
        'description': desc,
        'debit_lbp': amount_without_vat_lbp,
        'credit_lbp': 0,
        'debit_usd': amount_without_vat_usd,
        'credit_usd': 0,
        'exchange_rate': base_rate
    })
    
    # Line 2: Debit VAT Input/Receivable (VAT amount)
    if vat_input_account and tax_usd > 0:
        voucher_lines.append({
            'account_code': '44260006',
            'account_name': vat_input_account['name'],
            'description': desc,
            'debit_lbp': tax_lbp,
            'credit_lbp': 0,
            'debit_usd': tax_usd,
            'credit_usd': 0,
            'exchange_rate': base_rate
        })
    
    # Line 3: Credit Supplier (amount without VAT)
    voucher_lines.append({
        'account_code': credit_account['code'],
        'account_name': credit_account['name'],
        'description': desc,
        'debit_lbp': 0,
        'credit_lbp': amount_without_vat_lbp,
        'debit_usd': 0,
        'credit_usd': amount_without_vat_usd,
        'exchange_rate': base_rate
    })
    
    # Line 4: Credit Supplier VAT (VAT amount)
    if vat_supplier_account and tax_usd > 0:
        voucher_lines.append({
            'account_code': vat_supplier_code,
            'account_name': vat_supplier_account['name'],
            'description': desc,
            'debit_lbp': 0,
            'credit_lbp': tax_lbp,
            'debit_usd': 0,
            'credit_usd': tax_usd,
            'exchange_rate': base_rate
        })
    
    total_debit_usd = sum(l['debit_usd'] for l in voucher_lines)
    total_credit_usd = sum(l['credit_usd'] for l in voucher_lines)
    total_debit_lbp = sum(l['debit_lbp'] for l in voucher_lines)
    total_credit_lbp = sum(l['credit_lbp'] for l in voucher_lines)
    
    voucher_id = str(uuid.uuid4())
    voucher_doc = {
        'id': voucher_id,
        'voucher_number': voucher_number,
        'voucher_type': 'PV',
        'date': invoice['date'],
        'description': desc,
        'reference': invoice['invoice_number'],
        'lines': voucher_lines,
        'total_debit_lbp': total_debit_lbp,
        'total_credit_lbp': total_credit_lbp,
        'total_debit_usd': total_debit_usd,
        'total_credit_usd': total_credit_usd,
        'currency': invoice.get('currency', 'USD'),
        'exchange_rate': base_rate,
        'is_posted': True,
        'status': 'posted',
        'source_type': 'purchase_invoice',
        'source_id': invoice_id,
        'organization_id': invoice['organization_id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'posted_at': datetime.now(timezone.utc).isoformat(),
        'created_by': current_user['id'],
        'posted_by': current_user['id']
    }
    
    await db.vouchers.insert_one(voucher_doc)
    
    # Update ALL account balances from voucher lines
    for line in voucher_lines:
        net_usd = line['debit_usd'] - line['credit_usd']
        net_lbp = line['debit_lbp'] - line['credit_lbp']
        if net_usd != 0 or net_lbp != 0:
            await db.accounts.update_one(
                {'code': line['account_code'], 'organization_id': invoice['organization_id']},
                {'$inc': {'balance_usd': net_usd, 'balance_lbp': net_lbp}}
            )
    
    # Update inventory quantities (ADD stock - opposite of sales)
    for line in invoice.get('lines', []):
        if line.get('inventory_item_id'):
            item = await db.inventory_items.find_one({'id': line['inventory_item_id']}, {'_id': 0})
            if item:
                update_ops = {'$inc': {'on_hand_qty': line['quantity']}}
                set_ops = {'updated_at': datetime.now(timezone.utc).isoformat()}
                
                # Update cost price if provided
                if line.get('unit_price'):
                    set_ops['cost'] = line['unit_price']
                
                # Update selling price if provided in purchase line
                if line.get('selling_price'):
                    set_ops['price'] = line['selling_price']
                
                # If batch number is provided, add to batches array
                if line.get('batch_number'):
                    batches = item.get('batches', [])
                    # Check if batch already exists
                    existing_batch = next((b for b in batches if b.get('batch_number') == line['batch_number']), None)
                    
                    if existing_batch:
                        # Update existing batch quantity
                        for b in batches:
                            if b.get('batch_number') == line['batch_number']:
                                b['quantity'] = b.get('quantity', 0) + line['quantity']
                                if line.get('expiry_date'):
                                    b['expiry_date'] = line['expiry_date']
                                break
                    else:
                        # Create new batch
                        new_batch = {
                            'id': str(uuid.uuid4()),
                            'batch_number': line['batch_number'],
                            'expiry_date': line.get('expiry_date'),
                            'quantity': line['quantity'],
                            'cost': line.get('unit_price') or item.get('cost', 0),
                            'received_date': invoice['date'],
                            'source_type': 'purchase_invoice',
                            'source_id': invoice_id,
                            'created_at': datetime.now(timezone.utc).isoformat()
                        }
                        batches.append(new_batch)
                    
                    set_ops['batches'] = batches
                
                update_ops['$set'] = set_ops
                await db.inventory_items.update_one(
                    {'id': line['inventory_item_id']},
                    update_ops
                )
    
    # Update invoice status
    await db.purchase_invoices.update_one(
        {'id': invoice_id},
        {'$set': {
            'status': 'posted',
            'is_posted': True,
            'voucher_id': voucher_id,
            'posted_at': datetime.now(timezone.utc).isoformat(),
            'posted_by': current_user['id']
        }}
    )
    
    return {
        "message": "Purchase invoice posted successfully",
        "voucher_id": voucher_id,
        "voucher_number": voucher_number
    }


@router.post("/purchase-invoices/{invoice_id}/unpost")
async def unpost_purchase_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Unpost a purchase invoice - reverses the voucher and REMOVES inventory"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    invoice = await db.purchase_invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    if not invoice.get('is_posted'):
        raise HTTPException(status_code=400, detail="Invoice is not posted")
    
    voucher_id = invoice.get('voucher_id')
    if voucher_id:
        voucher = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
        if voucher:
            # Reverse account balances
            for line in voucher.get('lines', []):
                debit_usd = line.get('debit_usd', 0)
                credit_usd = line.get('credit_usd', 0)
                debit_lbp = line.get('debit_lbp', 0)
                credit_lbp = line.get('credit_lbp', 0)
                
                await db.accounts.update_one(
                    {'id': line['account_id']},
                    {'$inc': {
                        'balance_usd': credit_usd - debit_usd,
                        'balance_lbp': credit_lbp - debit_lbp
                    }}
                )
            
            # Delete voucher
            await db.vouchers.delete_one({'id': voucher_id})
    
    # Reverse inventory quantities (REMOVE stock)
    for line in invoice.get('lines', []):
        if line.get('inventory_item_id'):
            await db.inventory_items.update_one(
                {'id': line['inventory_item_id']},
                {'$inc': {'on_hand_qty': -line['quantity']}}
            )
    
    # Update invoice status
    await db.purchase_invoices.update_one(
        {'id': invoice_id},
        {'$set': {
            'status': 'draft',
            'is_posted': False,
            'voucher_id': None,
            'posted_at': None,
            'posted_by': None
        }}
    )
    
    return {"message": "Purchase invoice unposted successfully"}
