"""
Credit/Debit Notes Router - Handles all Cr/Db note endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from typing import List, Optional
from datetime import datetime, timezone
import uuid
from pathlib import Path

from models.schemas import (
    CrDbNoteCreate, CrDbNoteUpdate, CrDbNoteResponse
)

router = APIRouter(prefix="/crdb-notes", tags=["crdb-notes"])

# These will be injected from main app
db = None
get_current_user = None
UPLOADS_DIR = None

def init_router(database, auth_dependency, uploads_dir=None):
    """Initialize router with dependencies"""
    global db, get_current_user, UPLOADS_DIR
    db = database
    get_current_user = auth_dependency
    UPLOADS_DIR = uploads_dir


async def enrich_crdb_note(note: dict) -> dict:
    """Enrich Cr/Db note with related data"""
    if note.get('customer_account_id'):
        customer = await db.accounts.find_one({'id': note['customer_account_id']}, {'name': 1, 'code': 1})
        if customer:
            note['customer_name'] = customer.get('name')
            note['customer_code'] = customer.get('code')
    
    if note.get('supplier_account_id'):
        supplier = await db.accounts.find_one({'id': note['supplier_account_id']}, {'name': 1, 'code': 1})
        if supplier:
            note['supplier_name'] = supplier.get('name')
            note['supplier_code'] = supplier.get('code')
    
    # Get related invoice info
    if note.get('related_invoice_id'):
        if note.get('note_type') in ['credit_note_sales', 'debit_note_sales']:
            invoice = await db.sales_invoices.find_one({'id': note['related_invoice_id']}, {'invoice_number': 1})
        else:
            invoice = await db.purchase_invoices.find_one({'id': note['related_invoice_id']}, {'invoice_number': 1})
        if invoice:
            note['related_invoice_number'] = invoice.get('invoice_number')
    
    return note


@router.get("", response_model=List[CrDbNoteResponse])
async def get_crdb_notes(
    organization_id: str,
    note_type: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Get all Cr/Db notes with optional filters"""
    query = {'organization_id': organization_id}
    
    if note_type:
        query['note_type'] = note_type
    if status:
        query['status'] = status
    if date_from:
        query['date'] = {'$gte': date_from}
    if date_to:
        if 'date' in query:
            query['date']['$lte'] = date_to
        else:
            query['date'] = {'$lte': date_to}
    
    notes = await db.crdb_notes.find(query, {'_id': 0}).sort('date', -1).skip(skip).limit(limit).to_list(limit)
    
    for note in notes:
        await enrich_crdb_note(note)
    
    return notes


@router.get("/count")
async def get_crdb_notes_count(
    organization_id: str,
    note_type: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Get count of Cr/Db notes"""
    query = {'organization_id': organization_id}
    if note_type:
        query['note_type'] = note_type
    if status:
        query['status'] = status
    
    total = await db.crdb_notes.count_documents(query)
    draft_count = await db.crdb_notes.count_documents({**query, 'status': 'draft'})
    posted_count = await db.crdb_notes.count_documents({**query, 'status': 'posted'})
    
    return {
        'total': total,
        'draft': draft_count,
        'posted': posted_count
    }


@router.get("/{note_id}", response_model=CrDbNoteResponse)
async def get_crdb_note(
    note_id: str,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Get a single Cr/Db note"""
    note = await db.crdb_notes.find_one({'id': note_id}, {'_id': 0})
    if not note:
        raise HTTPException(status_code=404, detail="Cr/Db note not found")
    
    await enrich_crdb_note(note)
    return note


@router.post("", response_model=CrDbNoteResponse)
async def create_crdb_note(
    note_data: CrDbNoteCreate,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Create a new Cr/Db note"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Generate note number based on type
    count = await db.crdb_notes.count_documents({
        'organization_id': note_data.organization_id,
        'note_type': note_data.note_type
    })
    year = datetime.now().year
    
    prefix_map = {
        'credit_note_sales': 'CNS',
        'debit_note_sales': 'DNS',
        'credit_note_purchase': 'CNP',
        'debit_note_purchase': 'DNP'
    }
    prefix = prefix_map.get(note_data.note_type, 'NOTE')
    note_number = f"{prefix}-{year}-{str(count + 1).zfill(5)}"
    
    note = {
        'id': str(uuid.uuid4()),
        'note_number': note_number,
        **note_data.model_dump(),
        'status': 'draft',
        'is_posted': False,
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': None,
        'posted_at': None,
        'posted_by': None
    }
    
    await db.crdb_notes.insert_one(note)
    note.pop('_id', None)
    await enrich_crdb_note(note)
    return note


@router.put("/{note_id}", response_model=CrDbNoteResponse)
async def update_crdb_note(
    note_id: str,
    note_data: CrDbNoteUpdate,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Update a Cr/Db note"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    note = await db.crdb_notes.find_one({'id': note_id}, {'_id': 0})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    if note.get('is_posted'):
        raise HTTPException(status_code=400, detail="Cannot edit posted note")
    
    update_data = {k: v for k, v in note_data.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    update_data['updated_by'] = current_user['id']
    
    await db.crdb_notes.update_one({'id': note_id}, {'$set': update_data})
    
    updated = await db.crdb_notes.find_one({'id': note_id}, {'_id': 0})
    await enrich_crdb_note(updated)
    return updated


@router.delete("/{note_id}")
async def delete_crdb_note(
    note_id: str,
    current_user: dict = Depends(lambda: get_current_user)
):
    """Delete a Cr/Db note"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    note = await db.crdb_notes.find_one({'id': note_id}, {'_id': 0})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    if note.get('is_posted'):
        raise HTTPException(status_code=400, detail="Cannot delete posted note. Unpost first.")
    
    await db.crdb_notes.delete_one({'id': note_id})
    return {"message": "Cr/Db note deleted successfully"}
