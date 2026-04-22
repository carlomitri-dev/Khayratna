"""
Purchase Expense Router - Handles purchase expense (landed cost) endpoints.
Purchase expenses are additional costs (shipping, customs, insurance, transport)
associated with a purchase invoice. When posted, these costs are distributed
proportionally across the invoice's line items and update inventory costs.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from models.schemas import (
    PurchaseExpenseCreate, PurchaseExpenseUpdate, PurchaseExpenseResponse
)
from core.auth import get_current_user
from core.database import db

router = APIRouter(prefix="/purchase-expenses", tags=["purchase-expenses"])


@router.get("", response_model=List[PurchaseExpenseResponse])
async def get_purchase_expenses(
    organization_id: str,
    purchase_invoice_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get purchase expenses, optionally filtered by purchase invoice."""
    query = {'organization_id': organization_id}
    if purchase_invoice_id:
        query['purchase_invoice_id'] = purchase_invoice_id
    
    expenses = await db.purchase_expenses.find(query, {'_id': 0}).sort('created_at', -1).to_list(500)
    
    # Enrich with invoice number
    for exp in expenses:
        inv = await db.purchase_invoices.find_one(
            {'id': exp.get('purchase_invoice_id')}, {'invoice_number': 1, '_id': 0}
        )
        if inv:
            exp['purchase_invoice_number'] = inv.get('invoice_number')
    
    return expenses


@router.get("/{expense_id}", response_model=PurchaseExpenseResponse)
async def get_purchase_expense(
    expense_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single purchase expense."""
    expense = await db.purchase_expenses.find_one({'id': expense_id}, {'_id': 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Purchase expense not found")
    
    inv = await db.purchase_invoices.find_one(
        {'id': expense.get('purchase_invoice_id')}, {'invoice_number': 1, '_id': 0}
    )
    if inv:
        expense['purchase_invoice_number'] = inv.get('invoice_number')
    
    return expense


@router.post("", response_model=PurchaseExpenseResponse)
async def create_purchase_expense(
    data: PurchaseExpenseCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new purchase expense (draft)."""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Validate purchase invoice exists
    invoice = await db.purchase_invoices.find_one(
        {'id': data.purchase_invoice_id, 'organization_id': data.organization_id}, {'_id': 0}
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")
    
    # Validate debit == credit
    total_debit_usd = sum(dl_item.amount_usd for dl_item in data.debit_lines)
    total_credit_usd = sum(cl_item.amount_usd for cl_item in data.credit_lines)
    if abs(total_debit_usd - total_credit_usd) > 0.01:
        raise HTTPException(status_code=400, detail=f"Debit total ({total_debit_usd:.2f}) must equal credit total ({total_credit_usd:.2f})")
    
    # Generate expense number using configurable series
    year = datetime.now().year
    org = await db.organizations.find_one({'id': data.organization_id}, {'invoice_series': 1, '_id': 0})
    series = (org or {}).get('invoice_series', {}).get('purchase_expense', {})
    prefix = series.get('prefix', 'PEXP-')
    include_year = series.get('include_year', True)
    full_prefix = f"{prefix}{year}-" if include_year else prefix
    
    # Find last expense with this prefix
    escaped_prefix = full_prefix.replace('-', r'\-').replace('.', r'\.')
    last_exp = await db.purchase_expenses.find_one(
        {'organization_id': data.organization_id, 'expense_number': {'$regex': f'^{escaped_prefix}'}},
        {'expense_number': 1}, sort=[('expense_number', -1)]
    )
    if last_exp:
        try:
            last_num = int(last_exp['expense_number'].replace(full_prefix, ''))
            next_num = last_num + 1
        except ValueError:
            next_num = 1
    else:
        next_num = 1
    manual_next = series.get('next_number')
    if manual_next and manual_next > next_num:
        next_num = manual_next
    expense_number = f"{full_prefix}{next_num:05d}"
    
    expense = {
        'id': str(uuid.uuid4()),
        'expense_number': expense_number,
        'purchase_invoice_id': data.purchase_invoice_id,
        'date': data.date,
        'exchange_rate': data.exchange_rate,
        'debit_lines': [dl_item.model_dump() for dl_item in data.debit_lines],
        'credit_lines': [cl_item.model_dump() for cl_item in data.credit_lines],
        'total_usd': total_debit_usd,
        'total_lbp': sum(dl_item.amount_lbp for dl_item in data.debit_lines),
        'notes': data.notes,
        'is_posted': False,
        'status': 'draft',
        'distribution': None,
        'organization_id': data.organization_id,
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'posted_at': None,
        'posted_by': None,
        'voucher_id': None,
    }
    
    await db.purchase_expenses.insert_one(expense)
    expense.pop('_id', None)
    expense['purchase_invoice_number'] = invoice.get('invoice_number')
    return expense


@router.put("/{expense_id}", response_model=PurchaseExpenseResponse)
async def update_purchase_expense(
    expense_id: str,
    data: PurchaseExpenseUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a draft purchase expense."""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    expense = await db.purchase_expenses.find_one({'id': expense_id}, {'_id': 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Purchase expense not found")
    if expense.get('is_posted'):
        raise HTTPException(status_code=400, detail="Cannot edit posted expense")
    
    update_data = {}
    if data.date is not None:
        update_data['date'] = data.date
    if data.exchange_rate is not None:
        update_data['exchange_rate'] = data.exchange_rate
    if data.notes is not None:
        update_data['notes'] = data.notes
    if data.debit_lines is not None:
        update_data['debit_lines'] = [dl_item.model_dump() for dl_item in data.debit_lines]
    if data.credit_lines is not None:
        update_data['credit_lines'] = [cl_item.model_dump() for cl_item in data.credit_lines]
    
    # Recalculate totals if lines changed
    if data.debit_lines is not None or data.credit_lines is not None:
        d_lines = [ln.model_dump() for ln in data.debit_lines] if data.debit_lines else expense.get('debit_lines', [])
        c_lines = [ln.model_dump() for ln in data.credit_lines] if data.credit_lines else expense.get('credit_lines', [])
        
        total_debit_usd = sum(ln.get('amount_usd', 0) for ln in d_lines)
        total_credit_usd = sum(ln.get('amount_usd', 0) for ln in c_lines)
        
        if abs(total_debit_usd - total_credit_usd) > 0.01:
            raise HTTPException(status_code=400, detail=f"Debit total ({total_debit_usd:.2f}) must equal credit total ({total_credit_usd:.2f})")
        
        update_data['total_usd'] = total_debit_usd
        update_data['total_lbp'] = sum(ln.get('amount_lbp', 0) for ln in d_lines)
    
    if data.total_usd is not None:
        update_data['total_usd'] = data.total_usd
    if data.total_lbp is not None:
        update_data['total_lbp'] = data.total_lbp
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.purchase_expenses.update_one({'id': expense_id}, {'$set': update_data})
    
    updated = await db.purchase_expenses.find_one({'id': expense_id}, {'_id': 0})
    inv = await db.purchase_invoices.find_one(
        {'id': updated.get('purchase_invoice_id')}, {'invoice_number': 1, '_id': 0}
    )
    if inv:
        updated['purchase_invoice_number'] = inv.get('invoice_number')
    return updated


@router.delete("/{expense_id}")
async def delete_purchase_expense(
    expense_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a draft purchase expense."""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    expense = await db.purchase_expenses.find_one({'id': expense_id}, {'_id': 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Purchase expense not found")
    if expense.get('is_posted'):
        raise HTTPException(status_code=400, detail="Cannot delete posted expense. Unpost first.")
    
    await db.purchase_expenses.delete_one({'id': expense_id})
    return {"message": "Purchase expense deleted successfully"}


@router.get("/{expense_id}/distribution-preview")
async def preview_distribution(
    expense_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Preview how expenses will be distributed across invoice line items."""
    expense = await db.purchase_expenses.find_one({'id': expense_id}, {'_id': 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Purchase expense not found")
    
    invoice = await db.purchase_invoices.find_one(
        {'id': expense['purchase_invoice_id']}, {'_id': 0}
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")
    
    return _calculate_distribution(expense, invoice)


@router.post("/{expense_id}/post")
async def post_purchase_expense(
    expense_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Post a purchase expense: create voucher, distribute costs, update inventory."""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    expense = await db.purchase_expenses.find_one({'id': expense_id}, {'_id': 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Purchase expense not found")
    if expense.get('is_posted'):
        raise HTTPException(status_code=400, detail="Expense already posted")
    
    invoice = await db.purchase_invoices.find_one(
        {'id': expense['purchase_invoice_id']}, {'_id': 0}
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")
    
    org_id = expense['organization_id']
    ex_rate = expense.get('exchange_rate', 89500)
    
    # --- 1. Create the journal voucher ---
    voucher_lines = []
    desc = f"Purchase Expense {expense.get('expense_number', '')} for {invoice.get('invoice_number', '')}"
    
    # Helper to resolve account_code from account_id if needed
    async def resolve_account(line_data):
        code = line_data.get('account_code', '')
        name = line_data.get('account_name', '')
        if not code and line_data.get('account_id'):
            acc = await db.accounts.find_one({'id': line_data['account_id']}, {'_id': 0, 'code': 1, 'name': 1})
            if acc:
                code = acc['code']
                name = name or acc['name']
        return code, name
    
    # Debit lines (expenses)
    for dl in expense.get('debit_lines', []):
        if dl.get('amount_usd', 0) == 0 and dl.get('amount_lbp', 0) == 0:
            continue
        acct_code, acct_name = await resolve_account(dl)
        if not acct_code:
            continue
        amt_usd = dl.get('amount_usd', 0)
        amt_lbp = dl.get('amount_lbp', 0) or (amt_usd * ex_rate)
        voucher_lines.append({
            'account_code': acct_code,
            'account_name': acct_name,
            'description': dl.get('description') or desc,
            'debit_usd': amt_usd,
            'credit_usd': 0,
            'debit_lbp': amt_lbp,
            'credit_lbp': 0,
            'exchange_rate': ex_rate,
        })
    
    # Credit lines (payables)
    for cl in expense.get('credit_lines', []):
        if cl.get('amount_usd', 0) == 0 and cl.get('amount_lbp', 0) == 0:
            continue
        acct_code, acct_name = await resolve_account(cl)
        if not acct_code:
            continue
        amt_usd = cl.get('amount_usd', 0)
        amt_lbp = cl.get('amount_lbp', 0) or (amt_usd * ex_rate)
        voucher_lines.append({
            'account_code': acct_code,
            'account_name': acct_name,
            'description': cl.get('description') or desc,
            'debit_usd': 0,
            'credit_usd': amt_usd,
            'debit_lbp': 0,
            'credit_lbp': amt_lbp,
            'exchange_rate': ex_rate,
        })
    
    total_debit_usd = sum(l['debit_usd'] for l in voucher_lines)
    total_credit_usd = sum(l['credit_usd'] for l in voucher_lines)
    total_debit_lbp = sum(l['debit_lbp'] for l in voucher_lines)
    total_credit_lbp = sum(l['credit_lbp'] for l in voucher_lines)
    
    if not voucher_lines:
        raise HTTPException(status_code=400, detail="No valid lines to post. Ensure all lines have account codes and amounts.")
    
    # Generate voucher number
    year = datetime.now().year
    prefix = f"PEXP-V-{year}-"
    last_v = await db.vouchers.find_one(
        {'organization_id': org_id, 'voucher_number': {'$regex': f'^{prefix}'}},
        {'voucher_number': 1}, sort=[('voucher_number', -1)]
    )
    if last_v:
        last_num = int(last_v['voucher_number'].split('-')[-1])
        voucher_number = f"{prefix}{last_num + 1:05d}"
    else:
        voucher_number = f"{prefix}00001"
    
    voucher_id = str(uuid.uuid4())
    voucher_doc = {
        'id': voucher_id,
        'voucher_number': voucher_number,
        'voucher_type': 'JV',
        'date': expense['date'],
        'description': desc,
        'reference': expense.get('expense_number', ''),
        'lines': voucher_lines,
        'total_debit_lbp': total_debit_lbp,
        'total_credit_lbp': total_credit_lbp,
        'total_debit_usd': total_debit_usd,
        'total_credit_usd': total_credit_usd,
        'currency': 'USD',
        'exchange_rate': ex_rate,
        'is_posted': True,
        'status': 'posted',
        'source_type': 'purchase_expense',
        'source_id': expense_id,
        'organization_id': org_id,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'posted_at': datetime.now(timezone.utc).isoformat(),
        'created_by': current_user['id'],
        'posted_by': current_user['id'],
    }
    await db.vouchers.insert_one(voucher_doc)
    
    # Update account balances
    for line in voucher_lines:
        net_usd = line['debit_usd'] - line['credit_usd']
        net_lbp = line['debit_lbp'] - line['credit_lbp']
        if net_usd != 0 or net_lbp != 0:
            await db.accounts.update_one(
                {'code': line['account_code'], 'organization_id': org_id},
                {'$inc': {'balance_usd': net_usd, 'balance_lbp': net_lbp}}
            )
    
    # --- 2. Distribute costs and update inventory ---
    distribution = _calculate_distribution(expense, invoice)
    
    for dist_item in distribution.get('items', []):
        inv_item_id = dist_item.get('inventory_item_id')
        if not inv_item_id:
            continue
        
        added_cost = dist_item.get('expense_per_unit_usd', 0)
        if added_cost <= 0:
            continue
        
        item = await db.inventory_items.find_one({'id': inv_item_id}, {'_id': 0})
        if item:
            old_cost = item.get('cost', 0)
            new_cost = old_cost + added_cost
            await db.inventory_items.update_one(
                {'id': inv_item_id},
                {'$set': {
                    'cost': round(new_cost, 4),
                    'landed_cost_applied': True,
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }}
            )
    
    # --- 3. Update expense status ---
    await db.purchase_expenses.update_one(
        {'id': expense_id},
        {'$set': {
            'is_posted': True,
            'status': 'posted',
            'voucher_id': voucher_id,
            'distribution': distribution.get('items', []),
            'posted_at': datetime.now(timezone.utc).isoformat(),
            'posted_by': current_user['id'],
        }}
    )
    
    return {
        "message": "Purchase expense posted successfully",
        "voucher_id": voucher_id,
        "voucher_number": voucher_number,
        "distribution": distribution
    }


@router.post("/{expense_id}/unpost")
async def unpost_purchase_expense(
    expense_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Unpost a purchase expense: reverse voucher, restore inventory costs."""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    expense = await db.purchase_expenses.find_one({'id': expense_id}, {'_id': 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Purchase expense not found")
    if not expense.get('is_posted'):
        raise HTTPException(status_code=400, detail="Expense is not posted")
    
    org_id = expense['organization_id']
    
    # Reverse voucher
    voucher_id = expense.get('voucher_id')
    if voucher_id:
        voucher = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
        if voucher:
            for line in voucher.get('lines', []):
                net_usd = line.get('debit_usd', 0) - line.get('credit_usd', 0)
                net_lbp = line.get('debit_lbp', 0) - line.get('credit_lbp', 0)
                if net_usd != 0 or net_lbp != 0:
                    await db.accounts.update_one(
                        {'code': line['account_code'], 'organization_id': org_id},
                        {'$inc': {'balance_usd': -net_usd, 'balance_lbp': -net_lbp}}
                    )
            await db.vouchers.delete_one({'id': voucher_id})
    
    # Reverse inventory cost changes
    for dist_item in (expense.get('distribution') or []):
        inv_item_id = dist_item.get('inventory_item_id')
        added_cost = dist_item.get('expense_per_unit_usd', 0)
        if inv_item_id and added_cost > 0:
            item = await db.inventory_items.find_one({'id': inv_item_id}, {'_id': 0})
            if item:
                old_cost = item.get('cost', 0)
                new_cost = max(0, old_cost - added_cost)
                await db.inventory_items.update_one(
                    {'id': inv_item_id},
                    {'$set': {
                        'cost': round(new_cost, 4),
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }}
                )
    
    await db.purchase_expenses.update_one(
        {'id': expense_id},
        {'$set': {
            'is_posted': False,
            'status': 'draft',
            'voucher_id': None,
            'distribution': None,
            'posted_at': None,
            'posted_by': None,
        }}
    )
    
    return {"message": "Purchase expense unposted successfully"}


def _calculate_distribution(expense: dict, invoice: dict) -> dict:
    """Calculate proportional distribution of expenses across invoice line items."""
    lines = invoice.get('lines', [])
    total_expense_usd = expense.get('total_usd', 0)
    
    # Calculate total invoice value (sum of line totals)
    invoice_total = sum(
        (l.get('line_total_usd') or l.get('line_total', 0)) for l in lines
    )
    
    if invoice_total == 0:
        return {"items": [], "total_expense_usd": total_expense_usd, "invoice_total_usd": 0}
    
    distribution_items = []
    for i, line in enumerate(lines):
        line_value = line.get('line_total_usd') or line.get('line_total', 0)
        proportion = line_value / invoice_total if invoice_total > 0 else 0
        expense_share = total_expense_usd * proportion
        qty = line.get('quantity', 1) or 1
        expense_per_unit = expense_share / qty if qty > 0 else 0
        
        distribution_items.append({
            'line_index': i,
            'item_name': line.get('item_name', ''),
            'item_name_ar': line.get('item_name_ar', ''),
            'inventory_item_id': line.get('inventory_item_id'),
            'quantity': qty,
            'line_value_usd': round(line_value, 4),
            'proportion': round(proportion, 6),
            'expense_share_usd': round(expense_share, 4),
            'expense_per_unit_usd': round(expense_per_unit, 4),
            'original_unit_cost': line.get('unit_price', 0),
            'new_unit_cost': round((line.get('unit_price', 0) + expense_per_unit), 4),
        })
    
    return {
        "items": distribution_items,
        "total_expense_usd": round(total_expense_usd, 4),
        "invoice_total_usd": round(invoice_total, 4),
    }
