"""
Import Router - Import Chart of Accounts and Voucher History from Excel files
Supports Lebanese LCOA format with supplier/client detection
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from typing import Optional
import uuid
import json
from datetime import datetime, timezone
from collections import defaultdict
import io
import logging

from core.database import db
from core.auth import get_current_user

router = APIRouter(tags=["Import"])
logger = logging.getLogger(__name__)


# ================== PREVIEW HEADERS ==================

@router.post("/import/preview-headers")
async def preview_excel_headers(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Read Excel file headers and first few rows for field mapping preview"""
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not available")
    
    contents = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True)
    ws = wb.active
    
    rows = list(ws.iter_rows(min_row=1, max_row=4, values_only=True))
    wb.close()
    
    if not rows:
        raise HTTPException(status_code=400, detail="Empty file")
    
    headers = [str(h) if h else f'Column {i}' for i, h in enumerate(rows[0])]
    
    # Get sample data from first 3 rows
    sample_rows = []
    for row in rows[1:4]:
        sample_rows.append([str(v) if v is not None else '' for v in row])
    
    return {
        "headers": headers,
        "header_count": len(headers),
        "sample_rows": sample_rows,
        "filename": file.filename
    }

# Account type mapping based on LCOA class
ACCOUNT_CLASS_TYPES = {
    1: 'equity',      # Capital
    2: 'asset',       # Fixed Assets
    3: 'asset',       # Inventory
    4: 'liability',   # Receivables/Payables
    5: 'asset',       # Financial accounts
    6: 'expense',     # Expenses
    7: 'revenue',     # Revenue
    8: 'expense',     # Special results
}


@router.post("/import/chart-of-accounts")
async def import_chart_of_accounts(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    fiscal_year_id: str = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Import Chart of Accounts from Excel file.
    Columns expected: كود الحساب, كود, اسم الحساب, النوع, ...
    Accounts starting with 40 (len>4) are also added as suppliers.
    Accounts starting with 41 (len>4) are also added as customers.
    """
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Only admins can import data")
    
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl library not available")
    
    # Read the file
    contents = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True)
    ws = wb.active
    
    accounts_created = 0
    accounts_updated = 0
    suppliers_created = 0
    customers_created = 0
    errors = []
    
    # Track unique codes to avoid duplicates in the file
    seen_codes = set()
    
    accounts_to_insert = []
    
    row_num = 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        row_num += 1
        try:
            code = str(row[0]).strip() if row[0] else ''
            if not code or not code[0].isdigit():
                continue
            
            # Skip duplicate codes in file
            if code in seen_codes:
                continue
            seen_codes.add(code)
            
            account_name = str(row[2]).strip() if row[2] else ''
            account_type_ar = str(row[3]).strip() if row[3] else ''
            
            # Determine account class from first digit
            account_class = int(code[0]) if code[0].isdigit() else None
            account_type = ACCOUNT_CLASS_TYPES.get(account_class, 'asset')
            
            # Special handling for class 4 sub-types
            if code.startswith('40'):
                account_type = 'liability'  # Suppliers/payables
            elif code.startswith('41'):
                account_type = 'asset'  # Customers/receivables
            elif code.startswith('44'):
                account_type = 'liability'  # Tax accounts
            elif code.startswith('45'):
                account_type = 'liability'  # Other payables
            
            # Contact info for suppliers/customers
            name_field = str(row[13]).strip() if len(row) > 13 and row[13] else ''
            address_field = str(row[14]).strip() if len(row) > 14 and row[14] else ''
            phone_field = str(row[15]).strip() if len(row) > 15 and row[15] else ''
            regno_field = str(row[27]).strip() if len(row) > 27 and row[27] else ''
            
            account_doc = {
                'id': str(uuid.uuid4()),
                'code': code,
                'name': account_name,
                'name_ar': account_name,
                'account_class': account_class,
                'account_type': account_type,
                'organization_id': organization_id,
                'balance_lbp': 0,
                'balance_usd': 0,
                'is_active': True,
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            
            # Add contact info for suppliers and customers
            is_supplier = code.startswith('40') and len(code) > 4
            is_customer = code.startswith('41') and len(code) > 4
            
            # Region ID for customers (col 18 = REG_ID)
            region_id = str(row[18]).strip() if len(row) > 18 and row[18] else ''
            
            if is_supplier or is_customer:
                # Store contact fields as TOP-LEVEL fields (matching existing app schema)
                account_doc['mobile'] = phone_field
                account_doc['address'] = address_field
                account_doc['contact_person'] = name_field or account_name
                if regno_field and regno_field != '0':
                    account_doc['registration_number'] = regno_field
                if is_customer and region_id and region_id != '0':
                    account_doc['region_id'] = region_id
                # Also keep contact_info for backward compat
                account_doc['contact_info'] = {
                    'name': name_field or account_name,
                    'address': address_field,
                    'phone': phone_field,
                    'is_supplier': is_supplier,
                    'is_customer': is_customer,
                    'registration_number': regno_field if (regno_field and regno_field != '0') else '',
                    'region_id': region_id if (is_customer and region_id and region_id != '0') else ''
                }
            
            accounts_to_insert.append(account_doc)
            
        except Exception as e:
            errors.append(f"Row {row_num + 1}: {str(e)}")
            if len(errors) > 50:
                break
    
    wb.close()
    
    # Batch insert/update accounts
    if accounts_to_insert:
        # Check for existing accounts by code
        existing_codes = set()
        existing_accounts = await db.accounts.find(
            {'organization_id': organization_id, 'code': {'$in': [a['code'] for a in accounts_to_insert]}},
            {'code': 1, '_id': 0}
        ).to_list(None)
        existing_codes = {a['code'] for a in existing_accounts}
        
        new_accounts = []
        for acc in accounts_to_insert:
            if acc['code'] in existing_codes:
                # Update existing account
                update_data = {
                    'name': acc['name'],
                    'name_ar': acc['name_ar'],
                    'account_class': acc['account_class'],
                    'account_type': acc['account_type'],
                }
                if acc.get('contact_info'):
                    update_data['contact_info'] = acc['contact_info']
                # Also update top-level contact fields
                for field in ['mobile', 'address', 'contact_person', 'registration_number', 'region_id']:
                    if field in acc:
                        update_data[field] = acc[field]
                await db.accounts.update_one(
                    {'code': acc['code'], 'organization_id': organization_id},
                    {'$set': update_data}
                )
                accounts_updated += 1
            else:
                new_accounts.append(acc)
                accounts_created += 1
                
                # Count suppliers/customers
                if acc.get('contact_info', {}).get('is_supplier'):
                    suppliers_created += 1
                if acc.get('contact_info', {}).get('is_customer'):
                    customers_created += 1
        
        # Batch insert new accounts
        if new_accounts:
            # Insert in batches of 500
            for i in range(0, len(new_accounts), 500):
                batch = new_accounts[i:i+500]
                await db.accounts.insert_many(batch)
    
    return {
        "message": "Chart of Accounts imported successfully",
        "accounts_created": accounts_created,
        "accounts_updated": accounts_updated,
        "suppliers_detected": suppliers_created,
        "customers_detected": customers_created,
        "total_processed": len(accounts_to_insert),
        "errors": errors[:20],  # Return first 20 errors
        "error_count": len(errors)
    }


@router.post("/import/vouchers")
async def import_vouchers(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    fiscal_year_id: str = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Import voucher transactions from Excel file.
    Groups rows by TRAN column to form complete vouchers.
    Auto-posts all imported vouchers with new sequence numbers.
    
    Columns: TRAN, TRAN1, TRAN2, كود(Account Code), TP, DATE, VDATE,
             TOTCD, TOTCL(Cr LBP), TOTDD, TOTDL(Dr LBP), TOTCU(Cr USD), TOTDU(Dr USD),
             النوع(Type), الوصف(Desc), VALUEL, اسم الحساب, CUR, VALUED
    """
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Only admins can import data")
    
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl library not available")
    
    # Read the file
    contents = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True)
    ws = wb.active
    
    # Step 1: Group all rows by TRAN (voucher ID)
    voucher_groups = defaultdict(list)
    row_count = 0
    
    for row in ws.iter_rows(min_row=2, values_only=True):
        row_count += 1
        tran_id = row[0]
        if tran_id is None:
            continue
        voucher_groups[tran_id].append(row)
    
    wb.close()
    
    logger.info(f"Import: {row_count} rows, {len(voucher_groups)} vouchers to process")
    
    # Step 1b: Load fiscal year date range if specified
    fy_start = None
    fy_end = None
    if fiscal_year_id and fiscal_year_id != 'none':
        fy = await db.fiscal_years.find_one({'id': fiscal_year_id}, {'_id': 0})
        if fy:
            fy_start = fy['start_date']
            fy_end = fy['end_date']
            logger.info(f"FY filter active: {fy['name']} ({fy_start} to {fy_end})")
    
    # Step 2: Get current voucher sequence number
    last_voucher = await db.vouchers.find(
        {'organization_id': organization_id, 'voucher_type': 'JV'},
        {'voucher_number': 1}
    ).sort('created_at', -1).limit(1).to_list(1)
    
    # Generate sequence starting point
    seq_num = 1
    if last_voucher:
        try:
            last_num = last_voucher[0].get('voucher_number', 'JV-0000-00000')
            parts = last_num.split('-')
            seq_num = int(parts[-1]) + 1 if len(parts) > 1 else 1
        except (ValueError, IndexError):
            seq_num = 1
    
    vouchers_created = 0
    vouchers_failed = 0
    vouchers_skipped = 0
    lines_processed = 0
    errors = []
    
    # Step 3: Process each voucher group
    voucher_docs = []
    
    for tran_id, rows in voucher_groups.items():
        try:
            # Parse date from first row
            date_raw = str(rows[0][5]) if rows[0][5] else ''
            if len(date_raw) == 8:  # YYYYMMDD
                date_str = f"{date_raw[:4]}-{date_raw[4:6]}-{date_raw[6:8]}"
            elif len(date_raw) == 10:  # YYYY-MM-DD already
                date_str = date_raw
            else:
                date_str = '2016-01-01'  # Fallback
            
            # Skip vouchers outside the selected fiscal year
            if fy_start and fy_end:
                if date_str < fy_start or date_str > fy_end:
                    vouchers_skipped += 1
                    continue
            
            # Get description from first line
            description = str(rows[0][14]).strip() if rows[0][14] else f'Import TRAN-{tran_id}'
            
            voucher_lines = []
            total_debit_lbp = 0
            total_credit_lbp = 0
            total_debit_usd = 0
            total_credit_usd = 0
            
            for line_row in rows:
                account_code = str(line_row[3]).strip() if line_row[3] else ''
                if not account_code:
                    continue
                
                # Extract amounts
                cr_lbp = float(line_row[8] or 0)
                dr_lbp = float(line_row[10] or 0)
                cr_usd = float(line_row[11] or 0)
                dr_usd = float(line_row[12] or 0)
                
                line_desc = str(line_row[14]).strip() if line_row[14] else ''
                cur = str(line_row[17]) if line_row[17] else '1'
                
                # Exchange rate - 89500 for USD since 2023, 1507.5 before
                if cur == '2':
                    year = int(date_str[:4]) if len(date_str) >= 4 else 2016
                    exchange_rate = 89500.0 if year >= 2023 else 1507.5
                else:
                    exchange_rate = 1.0
                
                voucher_line = {
                    'account_code': account_code,
                    'description': line_desc,
                    'debit_lbp': dr_lbp,
                    'credit_lbp': cr_lbp,
                    'debit_usd': dr_usd,
                    'credit_usd': cr_usd,
                    'exchange_rate': exchange_rate
                }
                
                voucher_lines.append(voucher_line)
                total_debit_lbp += dr_lbp
                total_credit_lbp += cr_lbp
                total_debit_usd += dr_usd
                total_credit_usd += cr_usd
                lines_processed += 1
            
            if not voucher_lines:
                continue
            
            # Generate voucher number
            year = date_str[:4]
            voucher_number = f"JV-{year}-{seq_num:05d}"
            seq_num += 1
            
            voucher_doc = {
                'id': str(uuid.uuid4()),
                'voucher_number': voucher_number,
                'voucher_type': 'JV',
                'date': date_str,
                'reference': f'IMPORT-{tran_id}',
                'description': description,
                'lines': voucher_lines,
                'total_debit_lbp': total_debit_lbp,
                'total_credit_lbp': total_credit_lbp,
                'total_debit_usd': total_debit_usd,
                'total_credit_usd': total_credit_usd,
                'is_posted': True,
                'status': 'posted',
                'posted_at': datetime.now(timezone.utc).isoformat(),
                'organization_id': organization_id,
                'source_type': 'excel_import',
                'source_id': str(tran_id),
                'created_by': current_user['id'],
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            
            voucher_docs.append(voucher_doc)
            vouchers_created += 1
            
        except Exception as e:
            vouchers_failed += 1
            errors.append(f"TRAN {tran_id}: {str(e)}")
            if len(errors) > 50:
                break
    
    # Step 4: Batch insert vouchers
    if voucher_docs:
        for i in range(0, len(voucher_docs), 500):
            batch = voucher_docs[i:i+500]
            await db.vouchers.insert_many(batch)
    
    # Step 5: Update account balances from posted vouchers
    # Aggregate balance changes per account
    balance_updates = defaultdict(lambda: {'lbp': 0, 'usd': 0})
    for voucher in voucher_docs:
        for line in voucher['lines']:
            code = line['account_code']
            balance_updates[code]['lbp'] += line['debit_lbp'] - line['credit_lbp']
            balance_updates[code]['usd'] += line['debit_usd'] - line['credit_usd']
    
    # Apply balance updates
    accounts_updated = 0
    for code, deltas in balance_updates.items():
        if deltas['lbp'] != 0 or deltas['usd'] != 0:
            result = await db.accounts.update_one(
                {'code': code, 'organization_id': organization_id},
                {'$inc': {'balance_lbp': deltas['lbp'], 'balance_usd': deltas['usd']}}
            )
            if result.modified_count > 0:
                accounts_updated += 1
    
    return {
        "message": "Voucher history imported successfully",
        "vouchers_created": vouchers_created,
        "vouchers_skipped": vouchers_skipped,
        "vouchers_failed": vouchers_failed,
        "lines_processed": lines_processed,
        "accounts_balance_updated": accounts_updated,
        "total_rows": row_count,
        "errors": errors[:20],
        "error_count": len(errors)
    }


# ================== CATEGORIES IMPORT ==================

@router.post("/import/categories")
async def import_categories(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Import product categories from Excel.
    Columns: CAT_ID, NAME
    """
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Only admins can import data")
    
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not available")
    
    contents = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True)
    ws = wb.active
    
    created = 0
    updated = 0
    errors = []
    
    for row in ws.iter_rows(min_row=2, values_only=True):
        try:
            cat_id = str(row[0]).strip() if row[0] else ''
            name = str(row[1]).strip() if row[1] else ''
            if not cat_id or not name:
                continue
            
            existing = await db.inventory_categories.find_one({
                'organization_id': organization_id,
                'cat_id': cat_id
            })
            
            if existing:
                await db.inventory_categories.update_one(
                    {'_id': existing['_id']},
                    {'$set': {'name': name}}
                )
                updated += 1
            else:
                await db.inventory_categories.insert_one({
                    'id': str(uuid.uuid4()),
                    'cat_id': cat_id,
                    'name': name,
                    'organization_id': organization_id,
                    'created_at': datetime.now(timezone.utc).isoformat()
                })
                created += 1
        except Exception as e:
            errors.append(str(e))
    
    wb.close()
    
    return {
        "message": "Categories imported successfully",
        "created": created,
        "updated": updated,
        "errors": errors[:20],
        "error_count": len(errors)
    }


# ================== REGIONS IMPORT ==================

@router.post("/import/regions")
async def import_regions(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Import regions from Excel.
    Columns: REG_ID, NAME
    """
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Only admins can import data")
    
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not available")
    
    contents = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True)
    ws = wb.active
    
    created = 0
    updated = 0
    errors = []
    
    for row in ws.iter_rows(min_row=2, values_only=True):
        try:
            reg_id = str(row[0]).strip() if row[0] else ''
            name = str(row[1]).strip() if row[1] else ''
            if not reg_id or not name:
                continue
            
            existing = await db.regions.find_one({
                'organization_id': organization_id,
                'reg_id': reg_id
            })
            
            if existing:
                await db.regions.update_one(
                    {'_id': existing['_id']},
                    {'$set': {'name': name}}
                )
                updated += 1
            else:
                await db.regions.insert_one({
                    'id': str(uuid.uuid4()),
                    'reg_id': reg_id,
                    'name': name,
                    'organization_id': organization_id,
                    'created_at': datetime.now(timezone.utc).isoformat()
                })
                created += 1
        except Exception as e:
            errors.append(str(e))
    
    wb.close()
    
    return {
        "message": "Regions imported successfully",
        "created": created,
        "updated": updated,
        "errors": errors[:20],
        "error_count": len(errors)
    }


# ================== INVENTORY ITEMS IMPORT ==================

@router.post("/import/inventory")
async def import_inventory(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Import inventory items from Excel.
    Columns: كود(code), الوصف, ADESC(Arabic name), CAT_ID, SUP_ID(supplier account code),
             PAK, PACK, PRICE, COST, ...
    Links items to supplier (SUP_ID = account code like 40110001) and category (CAT_ID).
    """
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Only admins can import data")
    
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not available")
    
    contents = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True)
    ws = wb.active
    
    # Pre-load categories and suppliers for lookup
    categories = {}
    async for cat in db.inventory_categories.find({'organization_id': organization_id}, {'_id': 0}):
        categories[cat.get('cat_id', '')] = cat
    
    created = 0
    updated = 0
    errors = []
    items_batch = []
    
    for row in ws.iter_rows(min_row=2, values_only=True):
        try:
            item_code = str(row[0]).strip() if row[0] else ''
            if not item_code:
                continue
            
            # Column mapping from ITEMS file
            description = str(row[1]).strip() if row[1] else ''
            name_ar = str(row[2]).strip() if row[2] else ''
            cat_id = str(row[3]).strip() if row[3] else ''
            sup_id = str(row[4]).strip() if row[4] else ''  # Supplier account code (e.g., 40110001)
            pak = int(row[5]) if row[5] else 0
            pack_desc = str(row[6]).strip() if row[6] else ''
            price = float(row[7] or 0)
            cost = float(row[8] or 0)
            
            # Get category name
            cat_name = categories.get(cat_id, {}).get('name', '')
            
            item_name = name_ar or description or f'Item {item_code}'
            
            item_doc = {
                'id': str(uuid.uuid4()),
                'item_code': item_code,
                'name': item_name,
                'name_ar': name_ar,
                'description': description,
                'category_id': cat_id,
                'category': cat_name,
                'category_name': cat_name,
                'supplier_id': sup_id,
                'supplier_name': '',
                'package': pak,
                'pack_description': pack_desc,
                'price': price,
                'cost': cost,
                'currency': 'USD',
                'unit': 'piece',
                'min_qty': 0,
                'on_hand_qty': 0,
                'is_active': True,
                'is_taxable': True,
                'organization_id': organization_id,
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            
            items_batch.append(item_doc)
            
        except Exception as e:
            errors.append(f"Item {row[0] if row else '?'}: {str(e)}")
            if len(errors) > 50:
                break
    
    wb.close()
    
    # Check for existing items and insert/update
    if items_batch:
        existing_codes = set()
        existing = await db.inventory_items.find(
            {'organization_id': organization_id, 'item_code': {'$in': [i['item_code'] for i in items_batch]}},
            {'item_code': 1, '_id': 0}
        ).to_list(None)
        existing_codes = {e['item_code'] for e in existing}
        
        new_items = []
        for item in items_batch:
            if item['item_code'] in existing_codes:
                await db.inventory_items.update_one(
                    {'item_code': item['item_code'], 'organization_id': organization_id},
                    {'$set': {
                        'name': item['name'],
                        'name_ar': item['name_ar'],
                        'category_id': item['category_id'],
                        'category': item['category'],
                        'category_name': item['category_name'],
                        'supplier_id': item['supplier_id'],
                        'price': item['price'],
                        'cost': item['cost'],
                        'package': item['package'],
                        'pack_description': item['pack_description']
                    }}
                )
                updated += 1
            else:
                new_items.append(item)
                created += 1
        
        if new_items:
            for i in range(0, len(new_items), 500):
                batch = new_items[i:i+500]
                await db.inventory_items.insert_many(batch)
    
    return {
        "message": "Inventory imported successfully",
        "items_created": created,
        "items_updated": updated,
        "total_processed": len(items_batch),
        "errors": errors[:20],
        "error_count": len(errors)
    }


# ================== GET REGIONS & CATEGORIES ==================

@router.get("/regions")
async def get_regions(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Get all regions for an organization"""
    regions = await db.regions.find(
        {'organization_id': organization_id}, {'_id': 0}
    ).sort('reg_id', 1).to_list(100)
    return regions

@router.get("/categories")
async def get_categories(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Get all categories for an organization"""
    categories = await db.inventory_categories.find(
        {'organization_id': organization_id}, {'_id': 0}
    ).sort('cat_id', 1).to_list(100)
    return categories

