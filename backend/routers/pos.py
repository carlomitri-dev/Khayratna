"""
POS (Point of Sale) Router
Handles all POS transaction-related endpoints
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

# Import from main server (temporary until full refactor)
from server import (
    db, get_current_user, generate_voucher_number,
    POSLineItem, POSTransactionCreate, POSTransactionResponse
)

router = APIRouter(prefix="/pos", tags=["POS"])


async def generate_receipt_number(organization_id: str) -> str:
    """
    Generate next receipt number for POS based on organization's invoice_series settings.
    Falls back to default format if no custom settings exist.
    """
    year = datetime.now().year
    
    # Get organization settings
    org = await db.organizations.find_one({'id': organization_id}, {'invoice_series': 1})
    series_settings = org.get('invoice_series', {}).get('pos', {}) if org else {}
    
    # Get prefix from settings or use default
    prefix = series_settings.get('prefix', 'POS-')
    include_year = series_settings.get('include_year', True)
    
    # Build the full prefix with optional year
    if include_year:
        full_prefix = f"{prefix}{year}-"
    else:
        full_prefix = prefix
    
    # Check if there's a manually set next_number
    manual_next = series_settings.get('next_number')
    
    # Escape special regex characters in prefix
    escaped_prefix = full_prefix.replace('-', '\\-').replace('.', '\\.').replace('/', '\\/')
    
    # Find the last transaction with this prefix pattern
    last_transaction = await db.pos_transactions.find_one(
        {
            'organization_id': organization_id, 
            'receipt_number': {'$regex': f'^{escaped_prefix}'}
        },
        sort=[('receipt_number', -1)]
    )
    
    # Determine next number
    if last_transaction:
        try:
            last_num_str = last_transaction['receipt_number'].replace(full_prefix, '')
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


async def enrich_pos_transaction(transaction: dict) -> dict:
    """Enrich POS transaction with account names"""
    if transaction.get('debit_account_id'):
        debit_acc = await db.accounts.find_one({'id': transaction['debit_account_id']}, {'code': 1, 'name': 1})
        transaction['debit_account_code'] = debit_acc['code'] if debit_acc else None
        transaction['debit_account_name'] = debit_acc['name'] if debit_acc else None
    
    if transaction.get('credit_account_id'):
        credit_acc = await db.accounts.find_one({'id': transaction['credit_account_id']}, {'code': 1, 'name': 1})
        transaction['credit_account_code'] = credit_acc['code'] if credit_acc else None
        transaction['credit_account_name'] = credit_acc['name'] if credit_acc else None
    
    if transaction.get('voucher_id'):
        voucher = await db.vouchers.find_one({'id': transaction['voucher_id']}, {'voucher_number': 1})
        transaction['voucher_number'] = voucher['voucher_number'] if voucher else None
    
    if transaction.get('created_by'):
        user = await db.users.find_one({'id': transaction['created_by']}, {'name': 1})
        transaction['cashier_name'] = user['name'] if user else None
    
    return transaction


@router.get("/transactions", response_model=List[POSTransactionResponse])
async def get_pos_transactions(
    organization_id: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get POS transactions with filters"""
    query = {'organization_id': organization_id}
    
    if date_from:
        query['date'] = {'$gte': date_from}
    if date_to:
        query.setdefault('date', {})['$lte'] = date_to
    if search:
        query['$or'] = [
            {'receipt_number': {'$regex': search, '$options': 'i'}},
            {'customer_name': {'$regex': search, '$options': 'i'}}
        ]
    
    transactions = await db.pos_transactions.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    
    enriched = []
    for t in transactions:
        enriched.append(await enrich_pos_transaction(t))
    
    return enriched


@router.get("/transactions/count")
async def get_pos_transactions_count(
    organization_id: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get count of POS transactions"""
    query = {'organization_id': organization_id}
    if date_from:
        query['date'] = {'$gte': date_from}
    if date_to:
        query.setdefault('date', {})['$lte'] = date_to
    
    count = await db.pos_transactions.count_documents(query)
    return {"count": count}


@router.get("/transactions/{transaction_id}", response_model=POSTransactionResponse)
async def get_pos_transaction(transaction_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single POS transaction"""
    transaction = await db.pos_transactions.find_one({'id': transaction_id}, {'_id': 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    return await enrich_pos_transaction(transaction)


@router.post("/transactions", response_model=POSTransactionResponse)
async def create_pos_transaction(
    transaction_data: POSTransactionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new POS transaction and auto-post voucher"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant', 'cashier']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Debug: log the payment_adjustment value
    print(f"[POS DEBUG] Received payment_adjustment: {transaction_data.payment_adjustment}")
    
    transaction_id = str(uuid.uuid4())
    receipt_number = await generate_receipt_number(transaction_data.organization_id)
    now = datetime.now(timezone.utc)
    
    # Process lines
    lines_data = []
    for line in transaction_data.lines:
        line_dict = line.model_dump()
        if line_dict.get('line_total_usd') is None:
            exchange_rate = line_dict.get('exchange_rate', 1) or 1
            line_dict['line_total_usd'] = line_dict['line_total'] / exchange_rate if line_dict.get('currency', 'USD') != 'USD' else line_dict['line_total']
        lines_data.append(line_dict)
    
    # Create transaction document
    transaction_doc = {
        'id': transaction_id,
        'receipt_number': receipt_number,
        'date': now.strftime('%Y-%m-%d'),
        'time': now.strftime('%H:%M:%S'),
        'lines': lines_data,
        'subtotal_usd': transaction_data.subtotal_usd,
        'discount_percent': transaction_data.discount_percent,
        'discount_amount': transaction_data.discount_amount,
        'tax_percent': transaction_data.tax_percent,
        'tax_amount': transaction_data.tax_amount,
        'total_usd': transaction_data.total_usd,
        'total_lbp': transaction_data.total_lbp or (transaction_data.total_usd * transaction_data.lbp_rate),
        'payment_method': transaction_data.payment_method,
        'payment_amount': transaction_data.payment_amount,
        'payment_currency': transaction_data.payment_currency,
        'payment_exchange_rate': transaction_data.payment_exchange_rate,
        'change_amount': transaction_data.change_amount,
        'payment_adjustment': getattr(transaction_data, 'payment_adjustment', 0) or 0,
        'customer_id': transaction_data.customer_id,
        'customer_name': transaction_data.customer_name,
        'customer_code': transaction_data.customer_code,
        'notes': transaction_data.notes,
        'debit_account_id': transaction_data.debit_account_id,
        'credit_account_id': transaction_data.credit_account_id,
        'lbp_rate': transaction_data.lbp_rate,
        'organization_id': transaction_data.organization_id,
        'created_at': now.isoformat(),
        'created_by': current_user['id']
    }
    
    # Auto-create and post voucher (Sales Voucher)
    voucher_id = str(uuid.uuid4())
    year = now.year
    voucher_prefix = f"SV-{year}-"
    
    last_voucher = await db.vouchers.find_one(
        {'organization_id': transaction_data.organization_id, 'voucher_number': {'$regex': f'^{voucher_prefix}'}},
        sort=[('voucher_number', -1)]
    )
    if last_voucher:
        last_num = int(last_voucher['voucher_number'].split('-')[-1])
        voucher_number = f"{voucher_prefix}{last_num + 1:05d}"
    else:
        voucher_number = f"{voucher_prefix}00001"
    
    # Get account details
    debit_acc = await db.accounts.find_one({'id': transaction_data.debit_account_id})
    credit_acc = await db.accounts.find_one({'id': transaction_data.credit_account_id})
    
    if not debit_acc or not credit_acc:
        raise HTTPException(status_code=400, detail="Invalid account IDs")
    
    # Get Sales Discount account (72110001) if there's a payment adjustment
    discount_acc = None
    payment_adjustment = getattr(transaction_data, 'payment_adjustment', 0) or 0
    if payment_adjustment != 0:
        discount_acc = await db.accounts.find_one({
            'organization_id': transaction_data.organization_id,
            'code': '72110001'
        })
        if not discount_acc:
            discount_acc = await db.accounts.find_one({
                'organization_id': transaction_data.organization_id,
                'code': '7211'
            })
        if not discount_acc:
            discount_acc = await db.accounts.find_one({
                'organization_id': transaction_data.organization_id,
                'code': {'$regex': '^721'}
            })
        if not discount_acc:
            discount_acc_id = str(uuid.uuid4())
            discount_acc = {
                'id': discount_acc_id,
                'code': '72110001',
                'name': 'Sales Discount',
                'name_ar': 'خصم المبيعات',
                'account_type': 'expense',
                'parent_code': '7211',
                'is_active': True,
                'balance_usd': 0,
                'balance_lbp': 0,
                'organization_id': transaction_data.organization_id,
                'created_at': now.isoformat(),
                'created_by': current_user['id']
            }
            await db.accounts.insert_one(discount_acc)
    
    # Get VAT Payable account if there's tax
    vat_acc = None
    tax_amount = transaction_data.tax_amount or 0
    if tax_amount > 0:
        # Try standard VAT payable codes
        for vat_code in ['44210001', '4421', '44200001', '4420']:
            vat_acc = await db.accounts.find_one({
                'organization_id': transaction_data.organization_id,
                'code': vat_code
            })
            if vat_acc:
                break
        if not vat_acc:
            vat_acc = await db.accounts.find_one({
                'organization_id': transaction_data.organization_id,
                'code': {'$regex': '^442'}
            })
        if not vat_acc:
            vat_acc_id = str(uuid.uuid4())
            vat_acc = {
                'id': vat_acc_id,
                'code': '44210001',
                'name': 'VAT Payable',
                'name_ar': 'ضريبة القيمة المضافة',
                'account_type': 'liability',
                'parent_code': '4421',
                'is_active': True,
                'balance_usd': 0,
                'balance_lbp': 0,
                'organization_id': transaction_data.organization_id,
                'created_at': now.isoformat(),
                'created_by': current_user['id']
            }
            await db.accounts.insert_one(vat_acc)
    
    # Get line-level discount account if there's a discount_amount from the invoice
    line_discount_acc = None
    invoice_discount = transaction_data.discount_amount or 0
    if invoice_discount > 0:
        # Reuse the same discount account or find a different one
        line_discount_acc = discount_acc
        if not line_discount_acc:
            line_discount_acc = await db.accounts.find_one({
                'organization_id': transaction_data.organization_id,
                'code': '72110001'
            })
            if not line_discount_acc:
                line_discount_acc = await db.accounts.find_one({
                    'organization_id': transaction_data.organization_id,
                    'code': {'$regex': '^721'}
                })
            if not line_discount_acc:
                line_discount_acc_id = str(uuid.uuid4())
                line_discount_acc = {
                    'id': line_discount_acc_id,
                    'code': '72110001',
                    'name': 'Sales Discount',
                    'name_ar': 'خصم المبيعات',
                    'account_type': 'expense',
                    'parent_code': '7211',
                    'is_active': True,
                    'balance_usd': 0,
                    'balance_lbp': 0,
                    'organization_id': transaction_data.organization_id,
                    'created_at': now.isoformat(),
                    'created_by': current_user['id']
                }
                await db.accounts.insert_one(line_discount_acc)
    
    # Create voucher description based on payment method
    payment_desc = {
        'cash': 'Cash Sale',
        'card': 'Card/Bank Sale',
        'customer': f'Credit Sale to {transaction_data.customer_name or "Customer"}'
    }.get(transaction_data.payment_method, 'POS Sale')
    
    # Calculate actual amounts considering payment adjustment
    actual_received = transaction_data.total_usd - payment_adjustment
    actual_received_lbp = (transaction_data.total_lbp or 0) - (payment_adjustment * transaction_data.lbp_rate)
    
    # Net sales = subtotal - discount (before tax) — used for reference only
    
    # Build voucher lines
    # Proper accounting:
    #   Debit: Cash/Bank/Customer for total received
    #   Debit: Payment Adjustment (discount at register) if any
    #   Credit: Sales account for net sales (subtotal - discount, before tax)
    #   Credit: VAT Payable for tax amount
    #   Debit: Sales Discount for invoice discount if any
    voucher_lines = []
    
    # Line 1: Debit Cash/Bank/Customer - amount actually received
    voucher_lines.append({
        'account_id': debit_acc['id'],
        'account_code': debit_acc['code'],
        'account_name': debit_acc['name'],
        'description': f'POS Sale {receipt_number}',
        'currency': 'USD',
        'exchange_rate': 1.0,
        'debit': round(actual_received, 3),
        'credit': 0.0,
        'debit_usd': round(actual_received, 3),
        'credit_usd': 0.0,
        'debit_lbp': round(actual_received_lbp, 0),
        'credit_lbp': 0.0
    })
    
    # Line 2: If there's a payment adjustment discount, Debit Sales Discount
    if payment_adjustment > 0 and discount_acc:
        voucher_lines.append({
            'account_id': discount_acc['id'],
            'account_code': discount_acc['code'],
            'account_name': discount_acc['name'],
            'description': f'Sales Discount - {receipt_number}',
            'currency': 'USD',
            'exchange_rate': 1.0,
            'debit': round(payment_adjustment, 3),
            'credit': 0.0,
            'debit_usd': round(payment_adjustment, 3),
            'credit_usd': 0.0,
            'debit_lbp': round(payment_adjustment * transaction_data.lbp_rate, 0),
            'credit_lbp': 0.0
        })
    
    # Line 2 alt: If premium (negative adjustment), Credit Sales Discount
    if payment_adjustment < 0 and discount_acc:
        voucher_lines.append({
            'account_id': discount_acc['id'],
            'account_code': discount_acc['code'],
            'account_name': discount_acc['name'],
            'description': f'Sales Premium - {receipt_number}',
            'currency': 'USD',
            'exchange_rate': 1.0,
            'debit': 0.0,
            'credit': round(abs(payment_adjustment), 3),
            'debit_usd': 0.0,
            'credit_usd': round(abs(payment_adjustment), 3),
            'debit_lbp': 0.0,
            'credit_lbp': round(abs(payment_adjustment) * transaction_data.lbp_rate, 0)
        })
    
    # Line 3: If there's an invoice-level discount, Debit Sales Discount
    if invoice_discount > 0 and line_discount_acc:
        voucher_lines.append({
            'account_id': line_discount_acc['id'],
            'account_code': line_discount_acc['code'],
            'account_name': line_discount_acc['name'],
            'description': f'Discount {transaction_data.discount_percent}% - {receipt_number}',
            'currency': 'USD',
            'exchange_rate': 1.0,
            'debit': round(invoice_discount, 3),
            'credit': 0.0,
            'debit_usd': round(invoice_discount, 3),
            'credit_usd': 0.0,
            'debit_lbp': round(invoice_discount * transaction_data.lbp_rate, 0),
            'credit_lbp': 0.0
        })
    
    # Line 4: Credit Sales account for gross subtotal (before discount)
    voucher_lines.append({
        'account_id': credit_acc['id'],
        'account_code': credit_acc['code'],
        'account_name': credit_acc['name'],
        'description': f'POS Sale {receipt_number}',
        'currency': 'USD',
        'exchange_rate': 1.0,
        'debit': 0.0,
        'credit': round(transaction_data.subtotal_usd, 3),
        'debit_usd': 0.0,
        'credit_usd': round(transaction_data.subtotal_usd, 3),
        'debit_lbp': 0.0,
        'credit_lbp': round(transaction_data.subtotal_usd * transaction_data.lbp_rate, 0)
    })
    
    # Line 5: Credit VAT Payable for tax amount
    if tax_amount > 0 and vat_acc:
        voucher_lines.append({
            'account_id': vat_acc['id'],
            'account_code': vat_acc['code'],
            'account_name': vat_acc['name'],
            'description': f'VAT {transaction_data.tax_percent}% - {receipt_number}',
            'currency': 'USD',
            'exchange_rate': 1.0,
            'debit': 0.0,
            'credit': round(tax_amount, 3),
            'debit_usd': 0.0,
            'credit_usd': round(tax_amount, 3),
            'debit_lbp': 0.0,
            'credit_lbp': round(tax_amount * transaction_data.lbp_rate, 0)
        })
    
    # Calculate totals
    total_debit_usd = sum(line['debit_usd'] for line in voucher_lines)
    total_credit_usd = sum(line['credit_usd'] for line in voucher_lines)
    total_debit_lbp = sum(line['debit_lbp'] for line in voucher_lines)
    total_credit_lbp = sum(line['credit_lbp'] for line in voucher_lines)
    
    # Create voucher document
    voucher_doc = {
        'id': voucher_id,
        'voucher_number': voucher_number,
        'voucher_type': 'SV',
        'date': now.strftime('%Y-%m-%d'),
        'description': f'{payment_desc} - {receipt_number}',
        'lines': voucher_lines,
        'total_debit_usd': total_debit_usd,
        'total_credit_usd': total_credit_usd,
        'total_debit_lbp': total_debit_lbp,
        'total_credit_lbp': total_credit_lbp,
        'status': 'posted',
        'is_posted': True,
        'source_doc_type': 'pos_transaction',
        'source_doc_id': transaction_id,
        'organization_id': transaction_data.organization_id,
        'created_at': now.isoformat(),
        'created_by': current_user['id'],
        'posted_at': now.isoformat(),
        'posted_by': current_user['id']
    }
    
    # Update account balances
    await db.accounts.update_one(
        {'id': debit_acc['id']},
        {'$inc': {'balance_usd': actual_received}}
    )
    # Credit Sales for gross subtotal
    await db.accounts.update_one(
        {'id': credit_acc['id']},
        {'$inc': {'balance_usd': -transaction_data.subtotal_usd}}
    )
    
    # Update VAT Payable balance
    if tax_amount > 0 and vat_acc:
        await db.accounts.update_one(
            {'id': vat_acc['id']},
            {'$inc': {'balance_usd': -tax_amount}}
        )
    
    # Update invoice discount account balance (debit = increase expense)
    if invoice_discount > 0 and line_discount_acc:
        await db.accounts.update_one(
            {'id': line_discount_acc['id']},
            {'$inc': {'balance_usd': invoice_discount}}
        )
    
    # Update payment adjustment discount account balance if used
    if payment_adjustment != 0 and discount_acc:
        await db.accounts.update_one(
            {'id': discount_acc['id']},
            {'$inc': {'balance_usd': payment_adjustment}}
        )
    
    # Deduct inventory quantities
    for line in lines_data:
        if line.get('inventory_item_id'):
            await db.inventory_items.update_one(
                {'id': line['inventory_item_id']},
                {'$inc': {'on_hand_qty': -line['quantity']}}
            )
    
    # Save to database
    await db.vouchers.insert_one(voucher_doc)
    transaction_doc['voucher_id'] = voucher_id
    await db.pos_transactions.insert_one(transaction_doc)
    
    enriched = await enrich_pos_transaction(transaction_doc)
    return POSTransactionResponse(**enriched)


@router.get("/daily-summary")
async def get_pos_daily_summary(
    organization_id: str,
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get daily POS summary"""
    target_date = date or datetime.now().strftime('%Y-%m-%d')
    
    pipeline = [
        {'$match': {'organization_id': organization_id, 'date': target_date}},
        {'$group': {
            '_id': '$payment_method',
            'count': {'$sum': 1},
            'total': {'$sum': '$total_usd'}
        }}
    ]
    
    results = await db.pos_transactions.aggregate(pipeline).to_list(100)
    
    total_transactions = 0
    total_sales = 0
    by_payment_method = {}
    
    for r in results:
        total_transactions += r['count']
        total_sales += r['total']
        by_payment_method[r['_id']] = {'count': r['count'], 'total': r['total']}
    
    return {
        'date': target_date,
        'total_transactions': total_transactions,
        'total_sales': total_sales,
        'by_payment_method': by_payment_method
    }


@router.get("/inventory")
async def get_pos_inventory(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Get inventory items for POS - returns items with stock > 0 or all if configured"""
    items = await db.inventory_items.find({
        'organization_id': organization_id,
        'is_active': {'$ne': False}
    }, {
        '_id': 0,
        'id': 1,
        'barcode': 1,
        'sku': 1,
        'name': 1,
        'name_ar': 1,
        'price': 1,
        'cost': 1,
        'currency': 1,
        'unit': 1,
        'on_hand_qty': 1,
        'image_filename': 1,
        'image_url': 1,
        'is_taxable': 1,
        'is_pos_item': 1,
        'show_image_in_pos': 1,
        'show_in_pos_quick_items': 1,
        'category_id': 1
    }).sort('name', 1).to_list(1000)
    
    return items


@router.get("/cash-accounts")
async def get_pos_cash_accounts(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Get cash/bank accounts for POS (typically class 5, code length > 4)"""
    accounts = await db.accounts.find({
        'organization_id': organization_id,
        'code': {'$regex': '^5'},  # Cash & Bank accounts
        'is_active': True,
        '$expr': {'$gt': [{'$strLenCP': '$code'}, 4]}
    }, {'_id': 0, 'id': 1, 'code': 1, 'name': 1, 'name_ar': 1, 'balance_usd': 1}).sort('code', 1).to_list(100)
    
    return accounts


@router.get("/customer-history", response_model=List[POSTransactionResponse])
async def get_pos_customer_history(
    organization_id: str,
    customer_id: str,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get POS transaction history for a specific customer"""
    transactions = await db.pos_transactions.find({
        'organization_id': organization_id,
        '$or': [
            {'customer_id': customer_id},
            {'debit_account_id': customer_id}  # For customer debit payments
        ]
    }, {'_id': 0}).sort('created_at', -1).limit(limit).to_list(limit)
    
    enriched = []
    for t in transactions:
        enriched.append(await enrich_pos_transaction(t))
    
    return enriched


@router.delete("/invoices/{transaction_id}")
async def delete_pos_transaction(
    transaction_id: str,
    restore_inventory: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """Delete a POS transaction, its linked voucher, and optionally restore inventory."""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Admin access required")

    transaction = await db.pos_transactions.find_one({'id': transaction_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # 1. Reverse account balances from the linked voucher
    voucher_id = transaction.get('voucher_id')
    if voucher_id:
        voucher = await db.vouchers.find_one({'id': voucher_id})
        if voucher:
            for line in voucher.get('lines', []):
                net = line.get('debit_usd', 0) - line.get('credit_usd', 0)
                if net != 0:
                    await db.accounts.update_one(
                        {'id': line['account_id']},
                        {'$inc': {'balance_usd': -net}}
                    )
            # Delete the voucher
            await db.vouchers.delete_one({'id': voucher_id})

    # 2. Restore inventory quantities if requested
    if restore_inventory:
        for line in transaction.get('lines', []):
            inv_id = line.get('inventory_item_id')
            if inv_id:
                qty = line.get('quantity', 0)
                if qty > 0:
                    await db.inventory_items.update_one(
                        {'id': inv_id},
                        {'$inc': {'on_hand_qty': qty}}  # Add back qty that was sold
                    )

    # 3. Delete the POS transaction
    await db.pos_transactions.delete_one({'id': transaction_id})

    return {
        'message': f'Transaction {transaction.get("receipt_number", transaction_id)} deleted',
        'voucher_deleted': voucher_id is not None,
        'inventory_restored': restore_inventory
    }
