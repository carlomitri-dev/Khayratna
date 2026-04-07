"""
Import data from one organization to another.
Super-admin only. Uses background tasks to avoid HTTP timeouts on large datasets.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict
import uuid
import asyncio
import logging
from datetime import datetime, timezone

from core.database import db
from core.auth import get_current_user

router = APIRouter(prefix="/import-org", tags=["Import Org"])
logger = logging.getLogger(__name__)

# In-memory job status store
_import_jobs: Dict[str, dict] = {}

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
TABLE_LABELS = {t["key"]: t["label"] for t in IMPORTABLE_TABLES}

PRIORITY_ORDER = [
    "accounts", "inventory_categories", "regions", "services",
    "fiscal_years", "exchange_rates", "receipt_settings",
    "document_series", "invoice_templates", "inventory_items",
    "vouchers", "sales_invoices", "sales_returns",
    "purchase_invoices", "purchase_returns", "purchase_orders",
    "sales_quotations", "pos_transactions", "crdb_notes"
]

DUP_FIELD = {
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

TRANSACTIONAL_TABLES = {
    "vouchers", "sales_invoices", "purchase_invoices",
    "sales_returns", "purchase_returns", "crdb_notes",
    "purchase_orders", "sales_quotations"
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


def build_query(source_org_id: str, table_key: str, from_date=None, to_date=None):
    query = {"organization_id": source_org_id}
    if table_key in DATE_TABLES and (from_date or to_date):
        date_filter = {}
        if from_date:
            date_filter["$gte"] = from_date
        if to_date:
            date_filter["$lte"] = to_date
        query["date"] = date_filter
    return query


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
        query = build_query(req.source_org_id, table_key, req.from_date, req.to_date)
        count = await db[table_key].count_documents(query)
        counts[table_key] = count

    return {"source_org": source_org.get("name", req.source_org_id), "counts": counts}


@router.post("/execute")
async def execute_import(req: ImportRequest, current_user: dict = Depends(get_current_user)):
    """Start import as a background job. Returns job_id for polling."""
    require_super_admin(current_user)

    if req.source_org_id == req.target_org_id:
        raise HTTPException(status_code=400, detail="Cannot import from the same organization")

    source_org = await db.organizations.find_one({"id": req.source_org_id}, {"_id": 0})
    if not source_org:
        raise HTTPException(status_code=404, detail="Source organization not found")
    target_org = await db.organizations.find_one({"id": req.target_org_id}, {"_id": 0})
    if not target_org:
        raise HTTPException(status_code=404, detail="Target organization not found")

    job_id = str(uuid.uuid4())
    _import_jobs[job_id] = {
        "status": "running",
        "current_table": "",
        "progress": {},
        "results": {},
        "auto_created_accounts": [],
        "error": None,
        "source_org": source_org.get("name"),
        "target_org": target_org.get("name"),
    }

    # Launch background task
    asyncio.ensure_future(_run_import(job_id, req))

    return {"job_id": job_id, "status": "started"}


@router.get("/status/{job_id}")
async def get_import_status(job_id: str, current_user: dict = Depends(get_current_user)):
    require_super_admin(current_user)
    job = _import_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


async def _run_import(job_id: str, req: ImportRequest):
    """Background import worker."""
    job = _import_jobs[job_id]
    try:
        ordered = [t for t in PRIORITY_ORDER if t in req.tables and t in TABLE_KEYS]
        now_str = datetime.now(timezone.utc).isoformat()

        # Pre-fetch target account codes
        target_account_codes = set()
        async for acct in db.accounts.find({"organization_id": req.target_org_id}, {"code": 1, "_id": 0}):
            if acct.get("code"):
                target_account_codes.add(acct["code"])

        # Pre-fetch source accounts map for auto-creation
        source_accounts_map = {}
        if any(t in TRANSACTIONAL_TABLES for t in ordered):
            source_accts = await db.accounts.find({"organization_id": req.source_org_id}, {"_id": 0}).to_list(None)
            for sa in source_accts:
                if sa.get("code"):
                    source_accounts_map[sa["code"]] = sa

        auto_created = []

        for table_key in ordered:
            job["current_table"] = TABLE_LABELS.get(table_key, table_key)
            logger.info(f"Import job {job_id}: processing {table_key}")

            query = build_query(req.source_org_id, table_key, req.from_date, req.to_date)
            docs = await db[table_key].find(query, {"_id": 0}).to_list(None)

            if not docs:
                job["results"][table_key] = {"imported": 0, "skipped": 0}
                job["progress"][table_key] = "done"
                continue

            # Pre-fetch existing keys for duplicate detection
            dup_field = DUP_FIELD.get(table_key)
            existing_keys = set()
            if dup_field:
                async for doc in db[table_key].find({"organization_id": req.target_org_id}, {dup_field: 1, "_id": 0}):
                    val = doc.get(dup_field)
                    if val:
                        existing_keys.add(val)

            # Auto-create missing accounts (batch)
            if table_key in TRANSACTIONAL_TABLES:
                needed_codes = set()
                for doc in docs:
                    for line in doc.get("lines", []):
                        code = line.get("account_code")
                        if code and code not in target_account_codes:
                            needed_codes.add(code)
                    for field in ("debit_account_code", "credit_account_code"):
                        code = doc.get(field)
                        if code and code not in target_account_codes:
                            needed_codes.add(code)

                if needed_codes:
                    accounts_to_insert = []
                    for code in needed_codes:
                        source_acct = source_accounts_map.get(code)
                        if source_acct:
                            new_acct = dict(source_acct)
                            new_acct["organization_id"] = req.target_org_id
                            new_acct["id"] = str(uuid.uuid4())
                            new_acct["balance_usd"] = 0
                            new_acct["balance_lbp"] = 0
                            new_acct["imported_at"] = now_str
                            new_acct["imported_from_org"] = req.source_org_id
                            accounts_to_insert.append(new_acct)
                            target_account_codes.add(code)
                            auto_created.append(code)
                    if accounts_to_insert:
                        await db.accounts.insert_many(accounts_to_insert)

            # Filter duplicates and prepare batch
            to_insert = []
            skipped = 0
            for doc in docs:
                if dup_field and doc.get(dup_field) in existing_keys:
                    skipped += 1
                    continue
                new_doc = dict(doc)
                new_doc["organization_id"] = req.target_org_id
                if "id" in new_doc:
                    new_doc["id"] = str(uuid.uuid4())
                new_doc["imported_at"] = now_str
                new_doc["imported_from_org"] = req.source_org_id
                to_insert.append(new_doc)

            # Batch insert in chunks
            imported = 0
            BATCH_SIZE = 500
            for i in range(0, len(to_insert), BATCH_SIZE):
                batch = to_insert[i:i + BATCH_SIZE]
                await db[table_key].insert_many(batch)
                imported += len(batch)

            job["results"][table_key] = {"imported": imported, "skipped": skipped}
            job["progress"][table_key] = "done"
            logger.info(f"Import job {job_id}: {table_key} done - {imported} imported, {skipped} skipped")

        job["auto_created_accounts"] = list(set(auto_created))
        job["status"] = "completed"
        job["current_table"] = ""
        logger.info(f"Import job {job_id}: completed successfully")

    except Exception as e:
        logger.error(f"Import job {job_id} failed: {str(e)}", exc_info=True)
        job["status"] = "failed"
        job["error"] = str(e)
