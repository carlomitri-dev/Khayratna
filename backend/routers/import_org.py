"""
Import data from one organization to another.
Super-admin only.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from core.database import db
from core.auth import get_current_user

router = APIRouter(prefix="/import-org", tags=["Import Org"])

IMPORTABLE_TABLES = [
    {"key": "accounts",             "label": "Chart of Accounts",    "has_date": False},
    {"key": "inventory_categories", "label": "Inventory Categories", "has_date": False},
    {"key": "inventory_items",      "label": "Inventory Items",      "has_date": False},
    {"key": "regions",              "label": "Regions",              "has_date": False},
    {"key": "services",             "label": "Services",             "has_date": False},
    {"key": "fiscal_years",         "label": "Fiscal Years",         "has_date": False},
    {"key": "exchange_rates",       "label": "Exchange Rates",       "has_date": True},
    {"key": "receipt_settings",     "label": "Receipt Settings",     "has_date": False},
    {"key": "document_series",      "label": "Document Series",      "has_date": False},
    {"key": "invoice_templates",    "label": "Invoice Templates",    "has_date": False},
    {"key": "vouchers",             "label": "Vouchers",             "has_date": True},
    {"key": "sales_invoices",       "label": "Sales Invoices",       "has_date": True},
    {"key": "sales_returns",        "label": "Sales Returns",        "has_date": True},
    {"key": "purchase_invoices",    "label": "Purchase Invoices",    "has_date": True},
    {"key": "purchase_returns",     "label": "Purchase Returns",     "has_date": True},
    {"key": "purchase_orders",      "label": "Purchase Orders",      "has_date": True},
    {"key": "sales_quotations",     "label": "Sales Quotations",     "has_date": True},
    {"key": "pos_transactions",     "label": "POS Transactions",     "has_date": True},
    {"key": "crdb_notes",           "label": "CR/DB Notes",          "has_date": True},
]

TABLE_KEYS = {t["key"] for t in IMPORTABLE_TABLES}
DATE_TABLES = {t["key"] for t in IMPORTABLE_TABLES if t["has_date"]}

PRIORITY_ORDER = [
    "accounts", "inventory_categories", "regions", "services",
    "fiscal_years", "exchange_rates", "receipt_settings",
    "document_series", "invoice_templates", "inventory_items",
    "vouchers", "sales_invoices", "sales_returns",
    "purchase_invoices", "purchase_returns", "purchase_orders",
    "sales_quotations", "pos_transactions", "crdb_notes"
]

DUP_CHECK = {
    "accounts": "code",
    "inventory_categories": "name",
    "inventory_items": "code",
    "regions": "name",
    "services": "name",
    "vouchers": "voucher_number",
    "sales_invoices": "invoice_number",
    "purchase_invoices": "invoice_number",
    "sales_returns": "return_number",
    "purchase_returns": "return_number",
    "purchase_orders": "order_number",
    "sales_quotations": "quotation_number",
}


class ImportRequest(BaseModel):
    source_org_id: str
    target_org_id: str
    tables: List[str]
    from_date: Optional[str] = None
    to_date: Optional[str] = None


def require_super_admin(user: dict):
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")


@router.get("/tables")
async def list_importable_tables(current_user: dict = Depends(get_current_user)):
    require_super_admin(current_user)
    return IMPORTABLE_TABLES


@router.post("/preview")
async def preview_import(req: ImportRequest, current_user: dict = Depends(get_current_user)):
    require_super_admin(current_user)

    source_org = await db.organizations.find_one({"id": req.source_org_id}, {"_id": 0})
    if not source_org:
        raise HTTPException(status_code=404, detail="Source organization not found")

    counts = {}
    for table_key in req.tables:
        if table_key not in TABLE_KEYS:
            continue
        query = {"organization_id": req.source_org_id}
        if table_key in DATE_TABLES and (req.from_date or req.to_date):
            date_filter = {}
            if req.from_date:
                date_filter["$gte"] = req.from_date
            if req.to_date:
                date_filter["$lte"] = req.to_date
            query["date"] = date_filter
        count = await db[table_key].count_documents(query)
        counts[table_key] = count

    return {"source_org": source_org.get("name", req.source_org_id), "counts": counts}


@router.post("/execute")
async def execute_import(req: ImportRequest, current_user: dict = Depends(get_current_user)):
    require_super_admin(current_user)

    if req.source_org_id == req.target_org_id:
        raise HTTPException(status_code=400, detail="Cannot import from the same organization")

    source_org = await db.organizations.find_one({"id": req.source_org_id}, {"_id": 0})
    if not source_org:
        raise HTTPException(status_code=404, detail="Source organization not found")

    target_org = await db.organizations.find_one({"id": req.target_org_id}, {"_id": 0})
    if not target_org:
        raise HTTPException(status_code=404, detail="Target organization not found")

    ordered = [t for t in PRIORITY_ORDER if t in req.tables and t in TABLE_KEYS]

    results = {}
    auto_created_accounts = []

    for table_key in ordered:
        query = {"organization_id": req.source_org_id}
        if table_key in DATE_TABLES and (req.from_date or req.to_date):
            date_filter = {}
            if req.from_date:
                date_filter["$gte"] = req.from_date
            if req.to_date:
                date_filter["$lte"] = req.to_date
            query["date"] = date_filter

        docs = await db[table_key].find(query, {"_id": 0}).to_list(None)
        if not docs:
            results[table_key] = {"imported": 0, "skipped": 0}
            continue

        imported = 0
        skipped = 0

        for doc in docs:
            new_doc = dict(doc)
            new_doc["organization_id"] = req.target_org_id

            # Duplicate check
            dup_field = DUP_CHECK.get(table_key)
            if dup_field and new_doc.get(dup_field):
                existing = await db[table_key].find_one({
                    "organization_id": req.target_org_id,
                    dup_field: new_doc[dup_field]
                })
                if existing:
                    skipped += 1
                    continue

            # New unique id
            if "id" in new_doc:
                new_doc["id"] = str(uuid.uuid4())

            # Auto-create missing accounts for transactional tables
            if table_key in ("vouchers", "sales_invoices", "purchase_invoices",
                             "sales_returns", "purchase_returns", "crdb_notes",
                             "purchase_orders", "sales_quotations"):
                account_codes = set()
                for line in new_doc.get("lines", []):
                    code = line.get("account_code")
                    if code:
                        account_codes.add(code)
                for field in ("debit_account_code", "credit_account_code"):
                    code = new_doc.get(field)
                    if code:
                        account_codes.add(code)

                for code in account_codes:
                    exists = await db.accounts.find_one({
                        "organization_id": req.target_org_id, "code": code
                    })
                    if not exists:
                        source_acct = await db.accounts.find_one({
                            "organization_id": req.source_org_id, "code": code
                        }, {"_id": 0})
                        if source_acct:
                            new_acct = dict(source_acct)
                            new_acct["organization_id"] = req.target_org_id
                            new_acct["id"] = str(uuid.uuid4())
                            new_acct["balance_usd"] = 0
                            new_acct["balance_lbp"] = 0
                            await db.accounts.insert_one(new_acct)
                            auto_created_accounts.append(code)

            now_str = datetime.now(timezone.utc).isoformat()
            new_doc["imported_at"] = now_str
            new_doc["imported_from_org"] = req.source_org_id

            await db[table_key].insert_one(new_doc)
            imported += 1

        results[table_key] = {"imported": imported, "skipped": skipped}

    return {
        "message": "Import completed",
        "results": results,
        "auto_created_accounts": list(set(auto_created_accounts)),
        "source_org": source_org.get("name", req.source_org_id),
        "target_org": target_org.get("name", req.target_org_id)
    }
