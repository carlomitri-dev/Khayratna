"""
Organizations Router
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone
import uuid

from models.schemas import OrganizationCreate, OrganizationUpdate, OrganizationResponse
from utils.database import db
from utils.auth import get_current_user

router = APIRouter(prefix="/organizations", tags=["Organizations"])


@router.get("/public", response_model=List[OrganizationResponse])
async def get_public_organizations():
    """Get organizations for login page (public endpoint)"""
    orgs = await db.organizations.find({}, {'_id': 0}).to_list(100)
    return [OrganizationResponse(**org) for org in orgs]


@router.post("", response_model=OrganizationResponse)
async def create_organization(org_data: OrganizationCreate, current_user: dict = Depends(get_current_user)):
    """Create a new organization"""
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can create organizations")
    
    org_id = str(uuid.uuid4())
    org_doc = {
        'id': org_id,
        'name': org_data.name,
        'currency': org_data.currency,
        'base_exchange_rate': org_data.base_exchange_rate,
        'tax_percent': org_data.tax_percent,
        'tax_name': org_data.tax_name,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.organizations.insert_one(org_doc)
    return OrganizationResponse(**org_doc)


@router.get("", response_model=List[OrganizationResponse])
async def get_organizations(current_user: dict = Depends(get_current_user)):
    """Get organizations - super_admin sees all, others see only their own"""
    if current_user['role'] == 'super_admin':
        orgs = await db.organizations.find({}, {'_id': 0}).to_list(100)
    else:
        user_org_id = current_user.get('organization_id')
        if user_org_id:
            orgs = await db.organizations.find({'id': user_org_id}, {'_id': 0}).to_list(1)
        else:
            orgs = []
    return [OrganizationResponse(**org) for org in orgs]


@router.get("/{org_id}", response_model=OrganizationResponse)
async def get_organization(org_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single organization"""
    org = await db.organizations.find_one({'id': org_id}, {'_id': 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrganizationResponse(**org)


@router.put("/{org_id}", response_model=OrganizationResponse)
async def update_organization(org_id: str, org_data: OrganizationUpdate, current_user: dict = Depends(get_current_user)):
    """Update an organization"""
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can update organizations")
    
    org = await db.organizations.find_one({'id': org_id}, {'_id': 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    update_doc = {}
    if org_data.name is not None:
        update_doc['name'] = org_data.name
    if org_data.currency is not None:
        update_doc['currency'] = org_data.currency
    if org_data.base_exchange_rate is not None:
        update_doc['base_exchange_rate'] = org_data.base_exchange_rate
    if org_data.tax_percent is not None:
        update_doc['tax_percent'] = org_data.tax_percent
    if org_data.tax_name is not None:
        update_doc['tax_name'] = org_data.tax_name
    
    if update_doc:
        update_doc['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.organizations.update_one({'id': org_id}, {'$set': update_doc})
    
    updated = await db.organizations.find_one({'id': org_id}, {'_id': 0})
    return OrganizationResponse(**updated)



@router.post("/{org_id}/purge")
async def purge_organization_data(org_id: str, current_user: dict = Depends(get_current_user)):
    """Purge all data for an organization but keep the organization itself."""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Only admins can purge organization data")

    org = await db.organizations.find_one({'id': org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    collections_to_purge = [
        'accounts', 'vouchers', 'fiscal_years', 'exchange_rates',
        'crdb_notes', 'image_archive', 'inventory_categories', 'inventory_items',
        'sales_invoices', 'sales_returns', 'purchase_invoices', 'purchase_returns',
        'purchase_orders', 'pos_transactions', 'regions', 'receipt_settings',
        'sales_quotations'
    ]

    deleted_counts = {}
    for coll_name in collections_to_purge:
        result = await db[coll_name].delete_many({'organization_id': org_id})
        if result.deleted_count > 0:
            deleted_counts[coll_name] = result.deleted_count

    total_deleted = sum(deleted_counts.values())
    return {
        "message": f"Purged {total_deleted} documents from {org['name']}. Organization kept.",
        "total_deleted": total_deleted,
        "deleted": deleted_counts
    }


@router.delete("/{org_id}")
async def delete_organization(org_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an organization (with all dependent data)"""
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can delete organizations")
    
    org = await db.organizations.find_one({'id': org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Count dependent data
    accounts_count = await db.accounts.count_documents({'organization_id': org_id})
    vouchers_count = await db.vouchers.count_documents({'organization_id': org_id})
    users_count = await db.users.count_documents({'organization_id': org_id})
    
    # Delete all dependent data
    await db.accounts.delete_many({'organization_id': org_id})
    await db.vouchers.delete_many({'organization_id': org_id})
    await db.fiscal_years.delete_many({'organization_id': org_id})
    await db.exchange_rates.delete_many({'organization_id': org_id})
    await db.crdb_notes.delete_many({'organization_id': org_id})
    await db.image_archive.delete_many({'organization_id': org_id})
    await db.inventory_categories.delete_many({'organization_id': org_id})
    await db.inventory_items.delete_many({'organization_id': org_id})
    await db.sales_invoices.delete_many({'organization_id': org_id})
    await db.sales_returns.delete_many({'organization_id': org_id})
    await db.purchase_invoices.delete_many({'organization_id': org_id})
    await db.purchase_returns.delete_many({'organization_id': org_id})
    await db.purchase_orders.delete_many({'organization_id': org_id})
    await db.pos_transactions.delete_many({'organization_id': org_id})
    await db.regions.delete_many({'organization_id': org_id})
    await db.receipt_settings.delete_many({'organization_id': org_id})
    await db.sales_quotations.delete_many({'organization_id': org_id})
    
    # Update users to remove organization reference
    await db.users.update_many(
        {'organization_id': org_id},
        {'$set': {'organization_id': None}}
    )
    
    # Delete organization
    await db.organizations.delete_one({'id': org_id})
    
    return {
        "message": "Organization and all data deleted",
        "deleted": {
            "accounts": accounts_count,
            "vouchers": vouchers_count,
            "users_updated": users_count
        }
    }
