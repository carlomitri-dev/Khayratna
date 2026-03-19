"""
Reports Router - Financial reports (Trial Balance, Income Statement, General Ledger)
Refactored from server.py for modularity
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone

from core.database import db
from core.auth import get_current_user

router = APIRouter(tags=["Reports"])



# ================== JOURNAL ==================

@router.get("/reports/journal")
async def get_journal(
    organization_id: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    fy_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all posted vouchers with full line details for the journal report."""
    query = {
        'organization_id': organization_id,
        'is_posted': True
    }

    # Date range
    date_filter = {}
    if fy_id:
        fy = await db.fiscal_years.find_one({'id': fy_id}, {'_id': 0})
        if fy:
            date_filter['$gte'] = fy['start_date']
            date_filter['$lte'] = fy['end_date']
    if from_date:
        date_filter['$gte'] = from_date
    if to_date:
        date_filter['$lte'] = to_date
    if date_filter:
        query['date'] = date_filter

    vouchers = await db.vouchers.find(
        query, {'_id': 0}
    ).sort('date', 1).to_list(None)

    # Enrich with balance check and account names
    all_codes = set()
    for v in vouchers:
        for line in v.get('lines', []):
            all_codes.add(line.get('account_code', ''))

    # Batch fetch account names
    accounts_map = {}
    if all_codes:
        accts = await db.accounts.find(
            {'organization_id': organization_id, 'code': {'$in': list(all_codes)}},
            {'_id': 0, 'code': 1, 'name': 1, 'name_ar': 1}
        ).to_list(None)
        accounts_map = {a['code']: a for a in accts}

    grand_debit_usd = 0
    grand_credit_usd = 0
    grand_debit_lbp = 0
    grand_credit_lbp = 0

    result_vouchers = []
    for v in vouchers:
        total_debit_usd = 0
        total_credit_usd = 0
        total_debit_lbp = 0
        total_credit_lbp = 0

        lines = []
        for line in v.get('lines', []):
            code = line.get('account_code', '')
            acct = accounts_map.get(code, {})
            dr_usd = line.get('debit_usd', line.get('debit', 0)) or 0
            cr_usd = line.get('credit_usd', line.get('credit', 0)) or 0
            dr_lbp = line.get('debit_lbp', 0) or 0
            cr_lbp = line.get('credit_lbp', 0) or 0

            total_debit_usd += dr_usd
            total_credit_usd += cr_usd
            total_debit_lbp += dr_lbp
            total_credit_lbp += cr_lbp

            lines.append({
                'account_code': code,
                'account_name': acct.get('name', ''),
                'account_name_ar': acct.get('name_ar', ''),
                'description': line.get('description', ''),
                'debit_usd': dr_usd,
                'credit_usd': cr_usd,
                'debit_lbp': dr_lbp,
                'credit_lbp': cr_lbp,
                'exchange_rate': line.get('exchange_rate', 1)
            })

        is_balanced_usd = abs(total_debit_usd - total_credit_usd) < 0.01
        is_balanced_lbp = abs(total_debit_lbp - total_credit_lbp) < 0.5

        grand_debit_usd += total_debit_usd
        grand_credit_usd += total_credit_usd
        grand_debit_lbp += total_debit_lbp
        grand_credit_lbp += total_credit_lbp

        result_vouchers.append({
            'id': v.get('id', ''),
            'voucher_number': v.get('voucher_number', ''),
            'voucher_type': v.get('voucher_type', ''),
            'date': v.get('date', ''),
            'description': v.get('description', ''),
            'reference': v.get('reference', ''),
            'lines': lines,
            'total_debit_usd': total_debit_usd,
            'total_credit_usd': total_credit_usd,
            'total_debit_lbp': total_debit_lbp,
            'total_credit_lbp': total_credit_lbp,
            'is_balanced_usd': is_balanced_usd,
            'is_balanced_lbp': is_balanced_lbp
        })

    return {
        'vouchers': result_vouchers,
        'total_vouchers': len(result_vouchers),
        'grand_total': {
            'debit_usd': grand_debit_usd,
            'credit_usd': grand_credit_usd,
            'debit_lbp': grand_debit_lbp,
            'credit_lbp': grand_credit_lbp
        },
        'from_date': from_date or (date_filter.get('$gte') if date_filter else None),
        'to_date': to_date or (date_filter.get('$lte') if date_filter else None)
    }


# ================== TRIAL BALANCE ==================

@router.get("/reports/trial-balance")
async def get_trial_balance(
    organization_id: str, 
    include_zero_balance: bool = False,
    level: str = None,
    fy_id: str = None,  # Optional fiscal year filter
    current_user: dict = Depends(get_current_user)
):
    """
    Get trial balance report with optional filtering.
    If fy_id is provided, calculates balances from vouchers within that FY's date range.
    """
    # If FY filter is specified, compute balances from vouchers in the FY date range
    fy_start = None
    fy_end = None
    if fy_id:
        fy = await db.fiscal_years.find_one({'id': fy_id}, {'_id': 0})
        if fy:
            fy_start = fy['start_date']
            fy_end = fy['end_date']
    
    # Get active accounts
    accounts = await db.accounts.find(
        {
            'organization_id': organization_id, 
            '$or': [
                {'is_active': True},
                {'is_active': {'$exists': False}},
                {'is_active': None}
            ]
        },
        {'_id': 0}
    ).sort('code', 1).to_list(None)
    
    # If FY filter, recalculate balances from vouchers in that period
    if fy_start and fy_end:
        # Reset all balances to 0
        for acc in accounts:
            acc['balance_lbp'] = 0
            acc['balance_usd'] = 0
        
        # Build account lookup
        acc_lookup = {acc.get('code', ''): acc for acc in accounts}
        
        # Use MongoDB aggregation for efficient balance computation
        pipeline = [
            {'$match': {
                'organization_id': organization_id,
                'is_posted': True,
                'date': {'$gte': fy_start, '$lte': fy_end}
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
        
        async for result in db.vouchers.aggregate(pipeline):
            code = result['_id']
            if code in acc_lookup:
                acc_lookup[code]['balance_lbp'] = result['total_debit_lbp'] - result['total_credit_lbp']
                acc_lookup[code]['balance_usd'] = result['total_debit_usd'] - result['total_credit_usd']
    
    # Build set of all codes for finding parent-child relationships
    all_codes = {acc.get('code', '') for acc in accounts}
    
    # Find leaf accounts (accounts with no children)
    def has_children(code):
        """Check if this account has any children"""
        for other_code in all_codes:
            if other_code != code and other_code.startswith(code) and len(other_code) > len(code):
                return True
        return False
    
    leaf_codes = {code for code in all_codes if not has_children(code)}
    
    # Normalize accounts
    for acc in accounts:
        code = acc.get('code', '')
        if not acc.get('account_class') and code:
            try:
                acc['account_class'] = int(code[0]) if code[0].isdigit() else None
            except (ValueError, IndexError):
                acc['account_class'] = None
        acc['balance_lbp'] = acc.get('balance_lbp', 0) or 0
        acc['balance_usd'] = acc.get('balance_usd', 0) or 0
        acc['is_leaf'] = code in leaf_codes
    
    # Filter by level if specified
    def matches_level(code, level_filter):
        if not level_filter or level_filter == 'all':
            return True
        code_len = len(code)
        if level_filter == 'leaf':
            return code in leaf_codes
        if level_filter == 'gt_4':
            return code_len > 4
        if level_filter == 'eq_4':
            return code_len == 4
        if level_filter == 'eq_3':
            return code_len == 3
        if level_filter == 'eq_2':
            return code_len == 2
        if level_filter == 'eq_1':
            return code_len == 1
        return True
    
    trial_balance = []
    total_debit_lbp = 0
    total_credit_lbp = 0
    total_debit_usd = 0
    total_credit_usd = 0
    
    # Cumulative trackers
    cumulative_debit_lbp = 0
    cumulative_credit_lbp = 0
    cumulative_debit_usd = 0
    cumulative_credit_usd = 0
    
    for acc in accounts:
        code = acc.get('code', '')
        
        # Skip if doesn't match level filter
        if not matches_level(code, level):
            continue
            
        balance_lbp = acc.get('balance_lbp', 0) or 0
        balance_usd = acc.get('balance_usd', 0) or 0
        
        # Skip zero balances unless include_zero_balance is True
        if not include_zero_balance and balance_lbp == 0 and balance_usd == 0:
            continue
        
        debit_lbp = balance_lbp if balance_lbp > 0 else 0
        credit_lbp = abs(balance_lbp) if balance_lbp < 0 else 0
        debit_usd = balance_usd if balance_usd > 0 else 0
        credit_usd = abs(balance_usd) if balance_usd < 0 else 0
        
        # Calculate net balances
        net_lbp = debit_lbp - credit_lbp
        net_usd = debit_usd - credit_usd
        
        # Update cumulative totals
        cumulative_debit_lbp += debit_lbp
        cumulative_credit_lbp += credit_lbp
        cumulative_debit_usd += debit_usd
        cumulative_credit_usd += credit_usd
        
        trial_balance.append({
            'code': code,
            'name': acc.get('name', 'Unknown'),
            'account_class': acc.get('account_class'),
            'is_leaf': acc.get('is_leaf', False),
            'debit_lbp': debit_lbp,
            'credit_lbp': credit_lbp,
            'debit_usd': debit_usd,
            'credit_usd': credit_usd,
            'net_lbp': net_lbp,
            'net_usd': net_usd,
            'balance_lbp': balance_lbp,
            'balance_usd': balance_usd,
            # Cumulative columns
            'cumulative_debit_lbp': cumulative_debit_lbp,
            'cumulative_credit_lbp': cumulative_credit_lbp,
            'cumulative_debit_usd': cumulative_debit_usd,
            'cumulative_credit_usd': cumulative_credit_usd
        })
        
        total_debit_lbp += debit_lbp
        total_credit_lbp += credit_lbp
        total_debit_usd += debit_usd
        total_credit_usd += credit_usd
    
    return {
        'accounts': trial_balance,
        'total_debit_lbp': total_debit_lbp,
        'total_credit_lbp': total_credit_lbp,
        'total_debit_usd': total_debit_usd,
        'total_credit_usd': total_credit_usd,
        'net_lbp': total_debit_lbp - total_credit_lbp,
        'net_usd': total_debit_usd - total_credit_usd,
        'totals': {
            'debit_lbp': total_debit_lbp,
            'credit_lbp': total_credit_lbp,
            'debit_usd': total_debit_usd,
            'credit_usd': total_credit_usd,
            'net_lbp': total_debit_lbp - total_credit_lbp,
            'net_usd': total_debit_usd - total_credit_usd
        },
        'level_filter': level or 'all',
        'total_accounts_shown': len(trial_balance)
    }


# ================== INCOME STATEMENT ==================

@router.get("/reports/income-statement")
async def get_income_statement(
    organization_id: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    fy_id: Optional[str] = None,  # Optional fiscal year filter
    current_user: dict = Depends(get_current_user)
):
    """Get income statement (Profit & Loss). If fy_id is provided, uses FY date range."""
    # If FY filter, use FY dates
    fy_start = None
    fy_end = None
    if fy_id:
        fy = await db.fiscal_years.find_one({'id': fy_id}, {'_id': 0})
        if fy:
            fy_start = fy['start_date']
            fy_end = fy['end_date']
    
    # Get revenue accounts (class 7) and expense accounts (class 6)
    accounts = await db.accounts.find(
        {
            'organization_id': organization_id,
            'account_class': {'$in': [6, 7]},
            '$or': [
                {'is_active': True},
                {'is_active': {'$exists': False}}
            ]
        },
        {'_id': 0}
    ).sort('code', 1).to_list(None)
    
    # Build set of all codes to determine leaf accounts (no children = no double counting)
    all_codes = {acc.get('code', '') for acc in accounts}
    
    def is_leaf(code):
        """Check if this account has no children (is a leaf account)"""
        for other_code in all_codes:
            if other_code != code and other_code.startswith(code) and len(other_code) > len(code):
                return False
        return True
    
    # If FY filter, recalculate balances from vouchers in that period
    if fy_start and fy_end:
        acc_lookup = {acc.get('code', ''): acc for acc in accounts}
        # Reset balances
        for acc in accounts:
            acc['balance_lbp'] = 0
            acc['balance_usd'] = 0
        
        # Use MongoDB aggregation for efficient balance computation
        pipeline = [
            {'$match': {
                'organization_id': organization_id,
                'is_posted': True,
                'date': {'$gte': fy_start, '$lte': fy_end}
            }},
            {'$unwind': '$lines'},
            {'$match': {'lines.account_code': {'$regex': '^[67]'}}},  # Only class 6 and 7
            {'$group': {
                '_id': '$lines.account_code',
                'total_debit_lbp': {'$sum': {'$ifNull': ['$lines.debit_lbp', 0]}},
                'total_credit_lbp': {'$sum': {'$ifNull': ['$lines.credit_lbp', 0]}},
                'total_debit_usd': {'$sum': {'$ifNull': ['$lines.debit_usd', 0]}},
                'total_credit_usd': {'$sum': {'$ifNull': ['$lines.credit_usd', 0]}}
            }}
        ]
        
        async for result in db.vouchers.aggregate(pipeline):
            code = result['_id']
            if code in acc_lookup:
                acc_lookup[code]['balance_lbp'] = result['total_debit_lbp'] - result['total_credit_lbp']
                acc_lookup[code]['balance_usd'] = result['total_debit_usd'] - result['total_credit_usd']
    
    revenue_accounts = []
    expense_accounts = []
    total_revenue_lbp = 0
    total_revenue_usd = 0
    total_expense_lbp = 0
    total_expense_usd = 0
    
    for acc in accounts:
        code = acc.get('code', '')
        
        # Only include leaf accounts (code length > 4) to avoid double counting parent accounts
        if len(code) <= 4 and not is_leaf(code):
            continue
            
        balance_lbp = acc.get('balance_lbp', 0) or 0
        balance_usd = acc.get('balance_usd', 0) or 0
        
        acc_data = {
            'code': code,
            'name': acc.get('name', ''),
            'balance_lbp': abs(balance_lbp),
            'balance_usd': abs(balance_usd)
        }
        
        if acc.get('account_class') == 7:
            revenue_accounts.append(acc_data)
            total_revenue_lbp += abs(balance_lbp)
            total_revenue_usd += abs(balance_usd)
        elif acc.get('account_class') == 6:
            expense_accounts.append(acc_data)
            total_expense_lbp += abs(balance_lbp)
            total_expense_usd += abs(balance_usd)
    
    net_income_lbp = total_revenue_lbp - total_expense_lbp
    net_income_usd = total_revenue_usd - total_expense_usd
    
    return {
        'revenue': {
            'accounts': revenue_accounts,
            'total_lbp': total_revenue_lbp,
            'total_usd': total_revenue_usd
        },
        'expenses': {
            'accounts': expense_accounts,
            'total_lbp': total_expense_lbp,
            'total_usd': total_expense_usd
        },
        'net_income': {
            'lbp': net_income_lbp,
            'usd': net_income_usd
        }
    }


# ================== GENERAL LEDGER ==================

@router.get("/reports/general-ledger/{account_code}")
async def get_general_ledger(
    account_code: str, 
    organization_id: str, 
    fy_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    skip: int = 0,
    limit: int = 50000,
    current_user: dict = Depends(get_current_user)
):
    """Get general ledger with date range, opening balance, and pagination."""
    account = await db.accounts.find_one(
        {'code': account_code, 'organization_id': organization_id},
        {'_id': 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Build base voucher query
    voucher_query = {
        'organization_id': organization_id,
        'is_posted': True,
        'lines.account_code': account_code
    }
    
    # Determine effective date range from FY or explicit dates
    effective_from = None
    effective_to = None
    
    if fy_id:
        fy = await db.fiscal_years.find_one({'id': fy_id}, {'_id': 0})
        if fy:
            effective_from = fy['start_date']
            effective_to = fy['end_date']
    
    # Explicit from_date/to_date override FY range
    if from_date:
        effective_from = from_date
    if to_date:
        effective_to = to_date
    
    # Calculate opening balance (all transactions BEFORE from_date)
    opening_lbp = 0
    opening_usd = 0
    if effective_from:
        opening_query = {
            **voucher_query,
            'date': {'$lt': effective_from}
        }
        opening_pipeline = [
            {'$match': opening_query},
            {'$unwind': '$lines'},
            {'$match': {'lines.account_code': account_code}},
            {'$group': {
                '_id': None,
                'total_debit_lbp': {'$sum': {'$ifNull': ['$lines.debit_lbp', 0]}},
                'total_credit_lbp': {'$sum': {'$ifNull': ['$lines.credit_lbp', 0]}},
                'total_debit_usd': {'$sum': {'$ifNull': [{'$ifNull': ['$lines.debit_usd', '$lines.debit']}, 0]}},
                'total_credit_usd': {'$sum': {'$ifNull': [{'$ifNull': ['$lines.credit_usd', '$lines.credit']}, 0]}}
            }}
        ]
        opening_result = await db.vouchers.aggregate(opening_pipeline).to_list(1)
        if opening_result:
            opening_lbp = opening_result[0]['total_debit_lbp'] - opening_result[0]['total_credit_lbp']
            opening_usd = opening_result[0]['total_debit_usd'] - opening_result[0]['total_credit_usd']
    
    # Apply date range filter for entries
    date_filter = {}
    if effective_from:
        date_filter['$gte'] = effective_from
    if effective_to:
        date_filter['$lte'] = effective_to
    if date_filter:
        voucher_query['date'] = date_filter
    
    # Use aggregation to get entries efficiently with pagination
    pipeline = [
        {'$match': voucher_query},
        {'$sort': {'date': 1}},
        {'$unwind': '$lines'},
        {'$match': {'lines.account_code': account_code}},
        {'$project': {
            'date': 1,
            'id': 1,
            'voucher_number': 1,
            'voucher_type': 1,
            'description': 1,
            'source_type': 1,
            'source_id': 1,
            'line_desc': '$lines.description',
            'debit_lbp': {'$ifNull': ['$lines.debit_lbp', 0]},
            'credit_lbp': {'$ifNull': ['$lines.credit_lbp', 0]},
            'debit_usd': {'$ifNull': [{'$ifNull': ['$lines.debit_usd', '$lines.debit']}, 0]},
            'credit_usd': {'$ifNull': [{'$ifNull': ['$lines.credit_usd', '$lines.credit']}, 0]},
        }}
    ]
    
    # Get total count
    count_pipeline = pipeline + [{'$count': 'total'}]
    count_result = await db.vouchers.aggregate(count_pipeline).to_list(1)
    total_entries = count_result[0]['total'] if count_result else 0
    
    # Get closing balance (sum of ALL entries, not just page)
    balance_pipeline = pipeline + [
        {'$group': {
            '_id': None,
            'total_debit_lbp': {'$sum': '$debit_lbp'},
            'total_credit_lbp': {'$sum': '$credit_lbp'},
            'total_debit_usd': {'$sum': '$debit_usd'},
            'total_credit_usd': {'$sum': '$credit_usd'}
        }}
    ]
    balance_result = await db.vouchers.aggregate(balance_pipeline).to_list(1)
    
    closing_lbp = 0
    closing_usd = 0
    if balance_result:
        closing_lbp = balance_result[0]['total_debit_lbp'] - balance_result[0]['total_credit_lbp']
        closing_usd = balance_result[0]['total_debit_usd'] - balance_result[0]['total_credit_usd']
    
    # Get paginated entries
    entries_pipeline = pipeline + [{'$skip': skip}, {'$limit': limit}]
    raw_entries = await db.vouchers.aggregate(entries_pipeline).to_list(limit)
    
    # Compute running balance starting from opening balance
    if skip > 0:
        pre_balance_pipeline = pipeline + [
            {'$limit': skip},
            {'$group': {
                '_id': None,
                'pre_debit_lbp': {'$sum': '$debit_lbp'},
                'pre_credit_lbp': {'$sum': '$credit_lbp'},
                'pre_debit_usd': {'$sum': '$debit_usd'},
                'pre_credit_usd': {'$sum': '$credit_usd'}
            }}
        ]
        pre_result = await db.vouchers.aggregate(pre_balance_pipeline).to_list(1)
        running_lbp = opening_lbp + ((pre_result[0]['pre_debit_lbp'] - pre_result[0]['pre_credit_lbp']) if pre_result else 0)
        running_usd = opening_usd + ((pre_result[0]['pre_debit_usd'] - pre_result[0]['pre_credit_usd']) if pre_result else 0)
    else:
        running_lbp = opening_lbp
        running_usd = opening_usd
    
    entries = []
    for e in raw_entries:
        dl = e.get('debit_lbp', 0)
        cl = e.get('credit_lbp', 0)
        du = e.get('debit_usd', 0)
        cu = e.get('credit_usd', 0)
        running_lbp += dl - cl
        running_usd += du - cu
        entries.append({
            'date': e.get('date', ''),
            'voucher_id': e.get('id', ''),
            'voucher_number': e.get('voucher_number', ''),
            'voucher_type': e.get('voucher_type', ''),
            'description': e.get('line_desc') or e.get('description', ''),
            'debit_lbp': dl, 'credit_lbp': cl,
            'debit_usd': du, 'credit_usd': cu,
            'balance_lbp': running_lbp,
            'balance_usd': running_usd,
            'source_type': e.get('source_type', 'voucher'),
            'source_id': e.get('source_id')
        })
    
    account['account_class'] = account.get('account_class') or (int(account.get('code', '1')[0]) if account.get('code', '1')[0].isdigit() else None)
    account['balance_lbp'] = account.get('balance_lbp', 0) or 0
    account['balance_usd'] = account.get('balance_usd', 0) or 0
    
    return {
        'account': account,
        'entries': entries,
        'total_entries': total_entries,
        'opening_balance': {
            'lbp': opening_lbp,
            'usd': opening_usd
        },
        'closing_balance': {
            'lbp': opening_lbp + closing_lbp,
            'usd': opening_usd + closing_usd
        },
        'from_date': effective_from,
        'to_date': effective_to
    }
