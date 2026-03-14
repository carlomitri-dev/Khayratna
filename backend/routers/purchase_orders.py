"""
Purchase Orders Router
Full CRUD + workflow (draft → approved → sent → received → posted as Purchase Invoice)
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from core.database import db
from core.auth import get_current_user
from models.schemas import (
    PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderResponse
)

router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])


async def generate_po_number(organization_id: str) -> str:
    year = datetime.now().year
    prefix = f"PO-{year}-"
    last = await db.purchase_orders.find_one(
        {'organization_id': organization_id, 'order_number': {'$regex': f'^{prefix}'}},
        sort=[('order_number', -1)]
    )
    if last:
        num = int(last['order_number'].split('-')[-1]) + 1
    else:
        num = 1
    return f"{prefix}{num:05d}"


async def enrich_po(po: dict) -> dict:
    if po.get('created_by'):
        user = await db.users.find_one({'id': po['created_by']}, {'_id': 0, 'name': 1})
        po['created_by_name'] = user['name'] if user else None
    if po.get('purchase_invoice_id'):
        inv = await db.purchase_invoices.find_one({'id': po['purchase_invoice_id']}, {'_id': 0, 'invoice_number': 1})
        po['purchase_invoice_number'] = inv['invoice_number'] if inv else None
    return po


@router.get("", response_model=List[PurchaseOrderResponse])
async def list_purchase_orders(
    organization_id: str,
    status: Optional[str] = None,
    order_type: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    query = {'organization_id': organization_id}
    if status and status != 'all':
        query['status'] = status
    if order_type and order_type != 'all':
        query['order_type'] = order_type
    if search:
        query['$or'] = [
            {'order_number': {'$regex': search, '$options': 'i'}},
            {'supplier_name': {'$regex': search, '$options': 'i'}},
            {'notes': {'$regex': search, '$options': 'i'}}
        ]
    if date_from:
        query.setdefault('date', {})['$gte'] = date_from
    if date_to:
        query.setdefault('date', {})['$lte'] = date_to

    orders = await db.purchase_orders.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    enriched = []
    for o in orders:
        enriched.append(await enrich_po(o))
    return enriched


@router.get("/count")
async def count_purchase_orders(
    organization_id: str,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {'organization_id': organization_id}
    if status and status != 'all':
        query['status'] = status
    count = await db.purchase_orders.count_documents(query)
    return {'count': count}


@router.get("/low-stock-suggestions")
async def get_low_stock_suggestions(
    organization_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get inventory items with stock below reorder level for quick-add to PO."""
    items = await db.inventory_items.find(
        {
            'organization_id': organization_id,
            'is_active': {'$ne': False},
            '$expr': {'$lt': [
                {'$ifNull': ['$on_hand_qty', 0]},
                {'$ifNull': ['$reorder_level', 5]}
            ]}
        },
        {'_id': 0, 'id': 1, 'name': 1, 'name_ar': 1, 'barcode': 1, 'on_hand_qty': 1,
         'reorder_level': 1, 'cost': 1, 'price': 1, 'unit': 1, 'category': 1}
    ).sort('on_hand_qty', 1).to_list(100)
    return items


@router.get("/{order_id}", response_model=PurchaseOrderResponse)
async def get_purchase_order(
    order_id: str,
    current_user: dict = Depends(get_current_user)
):
    order = await db.purchase_orders.find_one({'id': order_id}, {'_id': 0})
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return await enrich_po(order)


@router.post("", response_model=PurchaseOrderResponse)
async def create_purchase_order(
    data: PurchaseOrderCreate,
    current_user: dict = Depends(get_current_user)
):
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")

    order_id = str(uuid.uuid4())
    order_number = await generate_po_number(data.organization_id)
    now = datetime.now(timezone.utc)

    lines = [line.model_dump() for line in data.lines]
    doc = {
        'id': order_id,
        'order_number': order_number,
        'date': data.date,
        'expected_delivery_date': data.expected_delivery_date,
        'order_type': data.order_type,
        'supplier_id': data.supplier_id,
        'supplier_name': data.supplier_name,
        'supplier_code': data.supplier_code,
        'lines': lines,
        'subtotal': data.subtotal,
        'discount_percent': data.discount_percent,
        'discount_amount': data.discount_amount,
        'tax_percent': data.tax_percent,
        'tax_amount': data.tax_amount,
        'total': data.total,
        'total_usd': data.total_usd,
        'currency': data.currency,
        'notes': data.notes,
        'status': 'draft',
        'purchase_invoice_id': None,
        'organization_id': data.organization_id,
        'created_at': now.isoformat(),
        'created_by': current_user['id'],
        'updated_at': None,
        'approved_at': None,
        'approved_by': None,
        'sent_at': None,
        'received_at': None,
        'posted_at': None
    }

    await db.purchase_orders.insert_one(doc)
    return await enrich_po({k: v for k, v in doc.items() if k != '_id'})


@router.put("/{order_id}", response_model=PurchaseOrderResponse)
async def update_purchase_order(
    order_id: str,
    data: PurchaseOrderUpdate,
    current_user: dict = Depends(get_current_user)
):
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")

    order = await db.purchase_orders.find_one({'id': order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if order['status'] not in ['draft']:
        raise HTTPException(status_code=400, detail="Only draft orders can be edited")

    update = {}
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            if field == 'lines':
                update['lines'] = [ln.model_dump() if hasattr(ln, 'model_dump') else ln for ln in value]
            else:
                update[field] = value

    update['updated_at'] = datetime.now(timezone.utc).isoformat()

    await db.purchase_orders.update_one({'id': order_id}, {'$set': update})
    result = await db.purchase_orders.find_one({'id': order_id}, {'_id': 0})
    return await enrich_po(result)


@router.put("/{order_id}/status")
async def update_po_status(
    order_id: str,
    action: str,
    current_user: dict = Depends(get_current_user)
):
    """Transition PO status: approve, send, receive, revert_to_draft"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")

    order = await db.purchase_orders.find_one({'id': order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    now = datetime.now(timezone.utc).isoformat()

    transitions = {
        'approve': {'from': ['draft'], 'to': 'approved', 'fields': {'approved_at': now, 'approved_by': current_user['id']}},
        'send': {'from': ['approved'], 'to': 'sent', 'fields': {'sent_at': now}},
        'receive': {'from': ['sent', 'approved'], 'to': 'received', 'fields': {'received_at': now}},
        'revert_to_draft': {'from': ['approved', 'sent'], 'to': 'draft', 'fields': {'approved_at': None, 'approved_by': None, 'sent_at': None}}
    }

    if action not in transitions:
        raise HTTPException(status_code=400, detail=f"Invalid action: {action}")

    t = transitions[action]
    if order['status'] not in t['from']:
        raise HTTPException(status_code=400, detail=f"Cannot {action} from status '{order['status']}'")

    update_fields = {'status': t['to'], 'updated_at': now, **t['fields']}
    await db.purchase_orders.update_one({'id': order_id}, {'$set': update_fields})

    result = await db.purchase_orders.find_one({'id': order_id}, {'_id': 0})
    return await enrich_po(result)


@router.post("/{order_id}/post", response_model=PurchaseOrderResponse)
async def post_purchase_order_as_invoice(
    order_id: str,
    debit_account_id: str,
    credit_account_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Convert a received PO to a Purchase Invoice and post the accounting voucher."""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")

    order = await db.purchase_orders.find_one({'id': order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if order['status'] == 'posted':
        raise HTTPException(status_code=400, detail="Order already posted")
    if order['status'] not in ['approved', 'sent', 'received']:
        raise HTTPException(status_code=400, detail="Order must be approved/sent/received before posting")

    now = datetime.now(timezone.utc)
    org_id = order['organization_id']

    # Validate accounts
    debit_acc = await db.accounts.find_one({'id': debit_account_id})
    credit_acc = await db.accounts.find_one({'id': credit_account_id})
    if not debit_acc or not credit_acc:
        raise HTTPException(status_code=400, detail="Invalid account IDs")

    # Generate Purchase Invoice number
    year = now.year
    inv_prefix = f"PUR-{year}-"
    last_inv = await db.purchase_invoices.find_one(
        {'organization_id': org_id, 'invoice_number': {'$regex': f'^{inv_prefix}'}},
        sort=[('invoice_number', -1)]
    )
    inv_num = int(last_inv['invoice_number'].split('-')[-1]) + 1 if last_inv else 1
    invoice_number = f"{inv_prefix}{inv_num:05d}"
    invoice_id = str(uuid.uuid4())

    # Create Purchase Invoice document
    invoice_doc = {
        'id': invoice_id,
        'invoice_number': invoice_number,
        'supplier_invoice_number': order.get('notes', ''),
        'date': order['date'],
        'due_date': order.get('expected_delivery_date'),
        'lines': order['lines'],
        'subtotal': order['subtotal'],
        'discount_percent': order.get('discount_percent', 0),
        'discount_amount': order.get('discount_amount', 0),
        'tax_percent': order.get('tax_percent', 0),
        'tax_amount': order.get('tax_amount', 0),
        'total': order['total'],
        'total_usd': order['total_usd'],
        'currency': order.get('currency', 'USD'),
        'notes': f"From PO: {order['order_number']}" + (f" - {order.get('notes', '')}" if order.get('notes') else ''),
        'debit_account_id': debit_account_id,
        'credit_account_id': credit_account_id,
        'status': 'posted',
        'is_posted': True,
        'source_po_id': order_id,
        'source_po_number': order['order_number'],
        'organization_id': org_id,
        'created_at': now.isoformat(),
        'created_by': current_user['id'],
        'posted_at': now.isoformat(),
        'posted_by': current_user['id']
    }

    # Create accounting voucher
    voucher_id = str(uuid.uuid4())
    v_prefix = f"PV-{year}-"
    last_voucher = await db.vouchers.find_one(
        {'organization_id': org_id, 'voucher_number': {'$regex': f'^{v_prefix}'}},
        sort=[('voucher_number', -1)]
    )
    v_num = int(last_voucher['voucher_number'].split('-')[-1]) + 1 if last_voucher else 1
    voucher_number = f"{v_prefix}{v_num:05d}"

    total_usd = order['total_usd']
    subtotal = order['subtotal']
    discount_amount = order.get('discount_amount', 0)
    tax_amount = order.get('tax_amount', 0)
    lbp_rate = 89500

    voucher_lines = []

    # Debit: Purchases/Inventory account
    voucher_lines.append({
        'account_id': debit_acc['id'],
        'account_code': debit_acc['code'],
        'account_name': debit_acc['name'],
        'description': f'Purchase from PO {order["order_number"]}',
        'currency': 'USD',
        'exchange_rate': 1.0,
        'debit': round(subtotal, 3),
        'credit': 0.0,
        'debit_usd': round(subtotal, 3),
        'credit_usd': 0.0,
        'debit_lbp': round(subtotal * lbp_rate, 0),
        'credit_lbp': 0.0
    })

    # Debit: VAT Input if tax
    if tax_amount > 0:
        vat_acc = await db.accounts.find_one({
            'organization_id': org_id,
            'code': {'$regex': '^443'}
        })
        if not vat_acc:
            vat_acc_id = str(uuid.uuid4())
            vat_acc = {
                'id': vat_acc_id, 'code': '44310001',
                'name': 'VAT Input', 'name_ar': 'ضريبة مدخلات',
                'account_type': 'asset', 'parent_code': '4431',
                'is_active': True, 'balance_usd': 0, 'balance_lbp': 0,
                'organization_id': org_id,
                'created_at': now.isoformat(), 'created_by': current_user['id']
            }
            await db.accounts.insert_one(vat_acc)
        voucher_lines.append({
            'account_id': vat_acc['id'],
            'account_code': vat_acc['code'],
            'account_name': vat_acc['name'],
            'description': f'VAT Input - PO {order["order_number"]}',
            'currency': 'USD', 'exchange_rate': 1.0,
            'debit': round(tax_amount, 3), 'credit': 0.0,
            'debit_usd': round(tax_amount, 3), 'credit_usd': 0.0,
            'debit_lbp': round(tax_amount * lbp_rate, 0), 'credit_lbp': 0.0
        })

    # Credit: Purchase Discount if discount
    if discount_amount > 0:
        disc_acc = await db.accounts.find_one({
            'organization_id': org_id, 'code': {'$regex': '^609'}
        })
        if not disc_acc:
            disc_acc_id = str(uuid.uuid4())
            disc_acc = {
                'id': disc_acc_id, 'code': '60900001',
                'name': 'Purchase Discount', 'name_ar': 'خصم مشتريات',
                'account_type': 'revenue', 'parent_code': '609',
                'is_active': True, 'balance_usd': 0, 'balance_lbp': 0,
                'organization_id': org_id,
                'created_at': now.isoformat(), 'created_by': current_user['id']
            }
            await db.accounts.insert_one(disc_acc)
        voucher_lines.append({
            'account_id': disc_acc['id'],
            'account_code': disc_acc['code'],
            'account_name': disc_acc['name'],
            'description': f'Purchase Discount - PO {order["order_number"]}',
            'currency': 'USD', 'exchange_rate': 1.0,
            'debit': 0.0, 'credit': round(discount_amount, 3),
            'debit_usd': 0.0, 'credit_usd': round(discount_amount, 3),
            'debit_lbp': 0.0, 'credit_lbp': round(discount_amount * lbp_rate, 0)
        })

    # Credit: Supplier account for total
    voucher_lines.append({
        'account_id': credit_acc['id'],
        'account_code': credit_acc['code'],
        'account_name': credit_acc['name'],
        'description': f'Purchase from PO {order["order_number"]}',
        'currency': 'USD', 'exchange_rate': 1.0,
        'debit': 0.0, 'credit': round(total_usd, 3),
        'debit_usd': 0.0, 'credit_usd': round(total_usd, 3),
        'debit_lbp': 0.0, 'credit_lbp': round(total_usd * lbp_rate, 0)
    })

    total_debit = sum(vl['debit_usd'] for vl in voucher_lines)
    total_credit = sum(vl['credit_usd'] for vl in voucher_lines)

    voucher_doc = {
        'id': voucher_id,
        'voucher_number': voucher_number,
        'voucher_type': 'PV',
        'date': order['date'],
        'description': f'Purchase Invoice from PO {order["order_number"]} - {order.get("supplier_name", "")}',
        'lines': voucher_lines,
        'total_debit_usd': total_debit,
        'total_credit_usd': total_credit,
        'total_debit_lbp': sum(vl['debit_lbp'] for vl in voucher_lines),
        'total_credit_lbp': sum(vl['credit_lbp'] for vl in voucher_lines),
        'status': 'posted', 'is_posted': True,
        'source_doc_type': 'purchase_order', 'source_doc_id': order_id,
        'organization_id': org_id,
        'created_at': now.isoformat(), 'created_by': current_user['id'],
        'posted_at': now.isoformat(), 'posted_by': current_user['id']
    }

    # Update account balances
    for line in voucher_lines:
        net = line['debit_usd'] - line['credit_usd']
        if net != 0:
            await db.accounts.update_one(
                {'id': line['account_id']},
                {'$inc': {'balance_usd': net}}
            )

    # Update inventory (cost + qty + selling_price)
    for line in order['lines']:
        if line.get('inventory_item_id'):
            update_fields = {'$inc': {'on_hand_qty': line['quantity']}}
            set_fields = {}
            if line.get('unit_price'):
                set_fields['cost'] = line['unit_price']
            if line.get('selling_price'):
                set_fields['price'] = line['selling_price']
            if set_fields:
                update_fields['$set'] = set_fields
            await db.inventory_items.update_one(
                {'id': line['inventory_item_id']},
                update_fields
            )

    # Save to DB
    await db.vouchers.insert_one(voucher_doc)
    invoice_doc['voucher_id'] = voucher_id
    invoice_doc['voucher_number'] = voucher_number
    await db.purchase_invoices.insert_one(invoice_doc)

    # Update PO status
    await db.purchase_orders.update_one(
        {'id': order_id},
        {'$set': {
            'status': 'posted',
            'purchase_invoice_id': invoice_id,
            'posted_at': now.isoformat(),
            'updated_at': now.isoformat()
        }}
    )

    result = await db.purchase_orders.find_one({'id': order_id}, {'_id': 0})
    return await enrich_po(result)


@router.delete("/{order_id}")
async def delete_purchase_order(
    order_id: str,
    current_user: dict = Depends(get_current_user)
):
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Admin access required")

    order = await db.purchase_orders.find_one({'id': order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if order['status'] == 'posted':
        raise HTTPException(status_code=400, detail="Cannot delete a posted order")

    await db.purchase_orders.delete_one({'id': order_id})
    return {'message': 'Purchase order deleted'}
