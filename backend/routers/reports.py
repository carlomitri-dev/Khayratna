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
        # Reset all balances to 0, then compute from vouchers
        for acc in accounts:
            acc['balance_lbp'] = 0
            acc['balance_usd'] = 0
        
        # Build account lookup
        acc_lookup = {acc.get('code', ''): acc for acc in accounts}
        
        # Get all posted vouchers in FY range
        vouchers = await db.vouchers.find({
            'organization_id': organization_id,
            'is_posted': True,
            'date': {'$gte': fy_start, '$lte': fy_end}
        }, {'_id': 0}).to_list(None)
        
        for voucher in vouchers:
            for line in voucher.get('lines', []):
                code = line.get('account_code', '')
                if code in acc_lookup:
                    acc_lookup[code]['balance_lbp'] += (line.get('debit_lbp', 0) or 0) - (line.get('credit_lbp', 0) or 0)
                    acc_lookup[code]['balance_usd'] += (line.get('debit_usd', 0) or 0) - (line.get('credit_usd', 0) or 0)
    
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
    current_user: dict = Depends(get_current_user)
):
    """Get income statement (Profit & Loss)"""
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
    current_user: dict = Depends(get_current_user)
):
    """Get general ledger for a specific account"""
    account = await db.accounts.find_one(
        {'code': account_code, 'organization_id': organization_id},
        {'_id': 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Get all voucher lines for this account
    vouchers = await db.vouchers.find(
        {
            'organization_id': organization_id,
            'is_posted': True,
            'lines.account_code': account_code
        },
        {'_id': 0}
    ).sort('date', 1).to_list(None)
    
    entries = []
    running_balance_lbp = 0
    running_balance_usd = 0
    
    for voucher in vouchers:
        for line in voucher.get('lines', []):
            if line.get('account_code') == account_code:
                debit_lbp = line.get('debit_lbp', 0) or 0
                credit_lbp = line.get('credit_lbp', 0) or 0
                debit_usd = line.get('debit_usd', line.get('debit', 0)) or 0
                credit_usd = line.get('credit_usd', line.get('credit', 0)) or 0
                
                running_balance_lbp += debit_lbp - credit_lbp
                running_balance_usd += debit_usd - credit_usd
                entries.append({
                    'date': voucher.get('date', ''),
                    'voucher_id': voucher.get('id', ''),
                    'voucher_number': voucher.get('voucher_number', ''),
                    'voucher_type': voucher.get('voucher_type', ''),
                    'description': line.get('description') or voucher.get('description', ''),
                    'debit_lbp': debit_lbp,
                    'credit_lbp': credit_lbp,
                    'debit_usd': debit_usd,
                    'credit_usd': credit_usd,
                    'balance_lbp': running_balance_lbp,
                    'balance_usd': running_balance_usd,
                    'source_type': voucher.get('source_type', 'voucher'),
                    'source_id': voucher.get('source_id')
                })
    
    # Normalize account fields
    account['account_class'] = account.get('account_class') or (int(account.get('code', '1')[0]) if account.get('code', '1')[0].isdigit() else None)
    account['balance_lbp'] = account.get('balance_lbp', 0) or 0
    account['balance_usd'] = account.get('balance_usd', 0) or 0
    
    return {
        'account': account,
        'entries': entries,
        'closing_balance': {
            'lbp': running_balance_lbp,
            'usd': running_balance_usd
        }
    }
