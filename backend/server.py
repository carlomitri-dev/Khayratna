from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import base64
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import httpx
from decimal import Decimal
import csv
import io

# Import models from schemas (for modularity)
from models.schemas import (
    UserCreate, UserUpdate, UserLogin, UserResponse, UserListResponse, TokenResponse,
    OrganizationCreate, OrganizationUpdate, OrganizationResponse,
    AccountCreate, AccountResponse, ContactInfoUpdate,
    InventoryCategoryCreate, InventoryCategoryUpdate, InventoryCategoryResponse,
    InventoryItemCreate, InventoryItemUpdate, InventoryItemResponse,
    ServiceItemCreate, ServiceItemUpdate, ServiceItemResponse,
    SalesInvoiceLineItem, SalesInvoiceCreate, SalesInvoiceUpdate, SalesInvoiceResponse,
    PurchaseInvoiceLineItem, PurchaseInvoiceCreate, PurchaseInvoiceUpdate, PurchaseInvoiceResponse,
    POSLineItem, POSTransactionCreate, POSTransactionResponse,
    CurrencyCreate, CurrencyUpdate, CurrencyResponse,
    VoucherLine, VoucherCreate, VoucherResponse,
    ExchangeRateCreate, ExchangeRateResponse,
    ImageArchiveResponse, CrDbNoteCreate, CrDbNoteResponse,
    BackupResponse, RestoreResponse, CSVPreviewRow, CSVPreviewResponse, CSVImportResult,
    FiscalYearCreate, FiscalYearUpdate, FiscalYearResponse, FiscalYearCloseResponse
)

# Create uploads directory
UPLOADS_DIR = Path("/app/uploads")
UPLOADS_DIR.mkdir(exist_ok=True)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'lebanese-accounting-secret-key-2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# ================== NAFITHA ARABIC DECODER ==================
# Nafitha was a DOS-based Arabic emulator used in Lebanon/Middle East
# This mapping converts Nafitha bytes to Unicode Arabic
# Based on frequency analysis of typical Arabic accounting data

NAFITHA_TO_UNICODE = {
    # High frequency letters (from frequency analysis)
    0xAB: 'ا',   # Alef - most common Arabic letter
    0xF5: 'ل',   # Lam - forms "ال" (al-) with alef
    0xE0: 'ا',   # Alternate Alef form
    0xF6: 'و',   # Waw
    0xFD: 'ك',   # Kaf
    0xE7: 'ة',   # Teh marbuta
    0xFB: 'ق',   # Qaf
    0xAD: 'ن',   # Noon
    0xAC: 'م',   # Meem
    0xF8: 'ع',   # Ain
    
    # Medium frequency letters
    0xE9: 'ث',   # Theh
    0xE3: 'آ',   # Alef with madda
    0xE4: 'ء',   # Hamza
    0xE5: 'ئ',   # Yeh with hamza
    0xE6: 'ب',   # Beh
    0xE8: 'ت',   # Teh
    0xEA: 'ج',   # Jeem
    0xEB: 'ح',   # Hah
    0xEC: 'خ',   # Khah
    0xED: 'د',   # Dal
    0xEE: 'ذ',   # Thal
    0xEF: 'ر',   # Reh
    0xF0: 'ز',   # Zain
    0xF1: 'س',   # Seen
    0xF2: 'ش',   # Sheen
    0xF3: 'ص',   # Sad
    0xF4: 'ض',   # Dad
    0xF9: 'غ',   # Ghain
    0xFA: 'ـ',   # Tatweel
    0xFC: 'ف',   # Feh
    
    # Additional mappings
    0xA5: 'ه',   # Heh
    0xA6: 'ؤ',   # Waw with hamza
    0xA7: 'ي',   # Yeh
    0xA8: 'ى',   # Alef maksura
    0xAA: 'لا',  # Lam-Alef ligature
    0xA9: 'ﻻ',   # Lam-Alef ligature variant
    0xE1: 'أ',   # Alef with hamza above
    0xE2: 'إ',   # Alef with hamza below
    0x98: 'ط',   # Tah
    
    # Padding characters to ignore
    0x81: '', 
    0x00: '',
}

def decode_nafitha_arabic(text: str) -> str:
    """Decode Nafitha Arabic encoding to Unicode Arabic text"""
    if not text:
        return ''
    try:
        # Convert string to raw bytes using latin-1 (preserves byte values)
        raw_bytes = text.encode('latin-1')
        result = []
        for b in raw_bytes:
            if b in NAFITHA_TO_UNICODE:
                result.append(NAFITHA_TO_UNICODE[b])
            elif 0x20 <= b <= 0x7E:  # ASCII printable characters
                result.append(chr(b))
            # Skip unknown bytes
        return ''.join(result).strip()
    except Exception:
        return text.strip()

def detect_nafitha_encoding(text: str) -> bool:
    """Detect if text appears to be in Nafitha Arabic encoding"""
    if not text:
        return False
    try:
        raw_bytes = text.encode('latin-1')
        nafitha_chars = sum(1 for b in raw_bytes if b in NAFITHA_TO_UNICODE and b > 0x7F)
        return nafitha_chars > len(raw_bytes) * 0.3  # More than 30% Nafitha chars
    except Exception:
        return False

# Create the main app
app = FastAPI(title="Lebanese Accounting System API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# NOTE: All Pydantic models are now imported from models.schemas
# This keeps the server.py cleaner and more maintainable

# ================== AUTHENTICATION ==================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({'id': payload['user_id']}, {'_id': 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ================== AUTH ROUTES ==================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({'email': user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        'id': user_id,
        'email': user_data.email,
        'password': hash_password(user_data.password),
        'name': user_data.name,
        'role': user_data.role,
        'organization_id': user_data.organization_id,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id, user_data.email, user_data.role)
    user_response = UserResponse(
        id=user_id,
        email=user_data.email,
        name=user_data.name,
        role=user_data.role,
        organization_id=user_data.organization_id,
        created_at=user_doc['created_at']
    )
    return TokenResponse(token=token, user=user_response)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({'email': credentials.email}, {'_id': 0})
    if not user or not verify_password(credentials.password, user['password']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user['id'], user['email'], user['role'])
    user_response = UserResponse(
        id=user['id'],
        email=user['email'],
        name=user['name'],
        role=user['role'],
        organization_id=user.get('organization_id'),
        created_at=user['created_at']
    )
    return TokenResponse(token=token, user=user_response)

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user['id'],
        email=current_user['email'],
        name=current_user['name'],
        role=current_user['role'],
        organization_id=current_user.get('organization_id'),
        is_active=current_user.get('is_active', True),
        created_at=current_user['created_at']
    )

# ================== USER MANAGEMENT ROUTES ==================

@api_router.get("/users", response_model=List[UserListResponse])
async def get_users(organization_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can manage users")
    
    query = {}
    if organization_id:
        query['organization_id'] = organization_id
    
    users = await db.users.find(query, {'_id': 0, 'password': 0}).to_list(1000)
    
    # Get organization names
    orgs = await db.organizations.find({}, {'_id': 0}).to_list(100)
    org_map = {org['id']: org['name'] for org in orgs}
    
    result = []
    for user in users:
        result.append(UserListResponse(
            id=user['id'],
            email=user['email'],
            name=user['name'],
            role=user['role'],
            organization_id=user.get('organization_id'),
            organization_name=org_map.get(user.get('organization_id')),
            is_active=user.get('is_active', True),
            created_at=user['created_at']
        ))
    
    return result

@api_router.post("/users", response_model=UserResponse)
async def create_user(user_data: UserCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can create users")
    
    existing = await db.users.find_one({'email': user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        'id': user_id,
        'email': user_data.email,
        'password': hash_password(user_data.password),
        'name': user_data.name,
        'role': user_data.role,
        'organization_id': user_data.organization_id,
        'is_active': True,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    
    return UserResponse(
        id=user_id,
        email=user_data.email,
        name=user_data.name,
        role=user_data.role,
        organization_id=user_data.organization_id,
        is_active=True,
        created_at=user_doc['created_at']
    )

@api_router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, user_data: UserUpdate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can update users")
    
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_doc = {}
    if user_data.name is not None:
        update_doc['name'] = user_data.name
    if user_data.role is not None:
        update_doc['role'] = user_data.role
    if user_data.organization_id is not None:
        update_doc['organization_id'] = user_data.organization_id
    if user_data.is_active is not None:
        update_doc['is_active'] = user_data.is_active
    
    if update_doc:
        update_doc['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one({'id': user_id}, {'$set': update_doc})
    
    updated = await db.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
    return UserResponse(
        id=updated['id'],
        email=updated['email'],
        name=updated['name'],
        role=updated['role'],
        organization_id=updated.get('organization_id'),
        is_active=updated.get('is_active', True),
        created_at=updated['created_at']
    )

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can delete users")
    
    if user_id == current_user['id']:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.delete_one({'id': user_id})
    return {"message": "User deleted successfully"}

@api_router.post("/users/{user_id}/reset-password")
async def reset_user_password(user_id: str, new_password: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can reset passwords")
    
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {'id': user_id},
        {'$set': {'password': hash_password(new_password)}}
    )
    return {"message": "Password reset successfully"}

# ================== ORGANIZATION ROUTES ==================

# Public endpoint for login page organization selection
@api_router.get("/organizations/public", response_model=List[OrganizationResponse])
async def get_organizations_public():
    orgs = await db.organizations.find({}, {'_id': 0}).to_list(100)
    return [OrganizationResponse(**org) for org in orgs]

@api_router.post("/organizations", response_model=OrganizationResponse)
async def create_organization(org_data: OrganizationCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    org_id = str(uuid.uuid4())
    org_doc = {
        'id': org_id,
        'name': org_data.name,
        'currency': org_data.currency,
        'base_exchange_rate': org_data.base_exchange_rate,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.organizations.insert_one(org_doc)
    return OrganizationResponse(**org_doc)

@api_router.get("/organizations", response_model=List[OrganizationResponse])
async def get_organizations(current_user: dict = Depends(get_current_user)):
    # Super admin can see all organizations
    if current_user['role'] == 'super_admin':
        orgs = await db.organizations.find({}, {'_id': 0}).to_list(100)
    else:
        # Other users only see their own organization
        user_org_id = current_user.get('organization_id')
        if user_org_id:
            orgs = await db.organizations.find({'id': user_org_id}, {'_id': 0}).to_list(1)
        else:
            orgs = []
    return [OrganizationResponse(**org) for org in orgs]

@api_router.get("/organizations/{org_id}", response_model=OrganizationResponse)
async def get_organization(org_id: str, current_user: dict = Depends(get_current_user)):
    org = await db.organizations.find_one({'id': org_id}, {'_id': 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrganizationResponse(**org)

@api_router.put("/organizations/{org_id}", response_model=OrganizationResponse)
async def update_organization(org_id: str, org_data: OrganizationUpdate, current_user: dict = Depends(get_current_user)):
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
    if org_data.phone is not None:
        update_doc['phone'] = org_data.phone
    if org_data.email is not None:
        update_doc['email'] = org_data.email
    if org_data.address is not None:
        update_doc['address'] = org_data.address
    if org_data.registration_number is not None:
        update_doc['registration_number'] = org_data.registration_number
    if org_data.enable_expiry_tracking is not None:
        update_doc['enable_expiry_tracking'] = org_data.enable_expiry_tracking
    if org_data.pos_quick_items_enabled is not None:
        update_doc['pos_quick_items_enabled'] = org_data.pos_quick_items_enabled
    if org_data.pos_quick_items is not None:
        update_doc['pos_quick_items'] = org_data.pos_quick_items
    if org_data.invoice_template is not None:
        update_doc['invoice_template'] = org_data.invoice_template
    if org_data.document_templates is not None:
        update_doc['document_templates'] = org_data.document_templates
    if org_data.invoice_series is not None:
        update_doc['invoice_series'] = org_data.invoice_series
    
    if update_doc:
        update_doc['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.organizations.update_one({'id': org_id}, {'$set': update_doc})
    
    updated = await db.organizations.find_one({'id': org_id}, {'_id': 0})
    return OrganizationResponse(**updated)

@api_router.delete("/organizations/{org_id}")
async def delete_organization(org_id: str, force: bool = False, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can delete organizations")
    
    org = await db.organizations.find_one({'id': org_id}, {'_id': 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Count dependent data
    users_count = await db.users.count_documents({'organization_id': org_id, 'role': {'$ne': 'super_admin'}})
    accounts_count = await db.accounts.count_documents({'organization_id': org_id})
    vouchers_count = await db.vouchers.count_documents({'organization_id': org_id})
    crdb_notes_count = await db.crdb_notes.count_documents({'organization_id': org_id})
    archive_count = await db.image_archive.count_documents({'organization_id': org_id})
    
    has_data = users_count > 0 or accounts_count > 0 or vouchers_count > 0 or crdb_notes_count > 0 or archive_count > 0
    
    if has_data and not force:
        # Return info about what will be deleted
        raise HTTPException(
            status_code=400, 
            detail=f"Organization has data: {users_count} user(s), {accounts_count} account(s), {vouchers_count} voucher(s), {crdb_notes_count} note(s), {archive_count} archived image(s). Use force=true to delete all."
        )
    
    if force and has_data:
        # Delete all related data
        await db.users.delete_many({'organization_id': org_id, 'role': {'$ne': 'super_admin'}})
        await db.accounts.delete_many({'organization_id': org_id})
        await db.vouchers.delete_many({'organization_id': org_id})
        await db.crdb_notes.delete_many({'organization_id': org_id})
        await db.exchange_rates.delete_many({'organization_id': org_id})
        
        # Delete image archive files
        archived_images = await db.image_archive.find({'organization_id': org_id}, {'filename': 1}).to_list(1000)
        for img in archived_images:
            filepath = ARCHIVE_DIR / img.get('filename', '')
            if filepath.exists():
                filepath.unlink()
        await db.image_archive.delete_many({'organization_id': org_id})
        
        # Delete attachment files from crdb_notes
        # (files are stored in UPLOADS_DIR / "attachments")
        attachments_dir = UPLOADS_DIR / "attachments"
        if attachments_dir.exists():
            import glob
            # Clean up orphaned attachment files
            pass
    
    await db.organizations.delete_one({'id': org_id})
    
    deleted_msg = f"Organization '{org['name']}' deleted successfully"
    if force and has_data:
        deleted_msg += f" along with all related data ({users_count} users, {accounts_count} accounts, {vouchers_count} vouchers, {crdb_notes_count} notes, {archive_count} archived images)"
    
    return {"message": deleted_msg}

# ================== CURRENCY ROUTES ==================

@api_router.get("/currencies", response_model=List[CurrencyResponse])
async def get_currencies(current_user: dict = Depends(get_current_user)):
    """Get all currencies"""
    currencies = await db.currencies.find({}, {'_id': 0}).sort('code', 1).to_list(100)
    return [CurrencyResponse(**c) for c in currencies]

@api_router.get("/currencies/active", response_model=List[CurrencyResponse])
async def get_active_currencies(current_user: dict = Depends(get_current_user)):
    """Get active currencies for voucher entry"""
    currencies = await db.currencies.find({'is_active': True}, {'_id': 0}).sort('code', 1).to_list(100)
    return [CurrencyResponse(**c) for c in currencies]

@api_router.post("/currencies", response_model=CurrencyResponse)
async def create_currency(currency_data: CurrencyCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can manage currencies")
    
    existing = await db.currencies.find_one({'code': currency_data.code.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="Currency code already exists")
    
    currency_id = str(uuid.uuid4())
    currency_doc = {
        'id': currency_id,
        'code': currency_data.code.upper(),
        'name': currency_data.name,
        'symbol': currency_data.symbol,
        'rate_to_usd': currency_data.rate_to_usd,
        'rate_to_lbp': currency_data.rate_to_lbp,
        'is_active': currency_data.is_active,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.currencies.insert_one(currency_doc)
    return CurrencyResponse(**currency_doc)

@api_router.put("/currencies/{currency_id}", response_model=CurrencyResponse)
async def update_currency(currency_id: str, currency_data: CurrencyUpdate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can manage currencies")
    
    currency = await db.currencies.find_one({'id': currency_id}, {'_id': 0})
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    
    update_doc = {}
    if currency_data.name is not None:
        update_doc['name'] = currency_data.name
    if currency_data.symbol is not None:
        update_doc['symbol'] = currency_data.symbol
    if currency_data.rate_to_usd is not None:
        update_doc['rate_to_usd'] = currency_data.rate_to_usd
    if currency_data.rate_to_lbp is not None:
        update_doc['rate_to_lbp'] = currency_data.rate_to_lbp
    if currency_data.is_active is not None:
        update_doc['is_active'] = currency_data.is_active
    
    if update_doc:
        update_doc['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.currencies.update_one({'id': currency_id}, {'$set': update_doc})
    
    updated = await db.currencies.find_one({'id': currency_id}, {'_id': 0})
    return CurrencyResponse(**updated)

@api_router.delete("/currencies/{currency_id}")
async def delete_currency(currency_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can manage currencies")
    
    currency = await db.currencies.find_one({'id': currency_id}, {'_id': 0})
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    
    # Prevent deletion of base currencies
    if currency['code'] in ['USD', 'LBP']:
        raise HTTPException(status_code=400, detail="Cannot delete base currencies (USD/LBP)")
    
    await db.currencies.delete_one({'id': currency_id})
    return {"message": "Currency deleted successfully"}

@api_router.post("/currencies/seed")
async def seed_currencies(current_user: dict = Depends(get_current_user)):
    """Seed common world currencies"""
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can seed currencies")
    
    # Check if currencies already exist
    existing_count = await db.currencies.count_documents({})
    if existing_count > 0:
        raise HTTPException(status_code=400, detail="Currencies already exist. Delete existing currencies first.")
    
    # Common world currencies with approximate rates (USD base)
    base_lbp_rate = 89500.0  # LBP per USD
    currencies = [
        {'code': 'USD', 'name': 'US Dollar', 'symbol': '$', 'rate_to_usd': 1.0, 'rate_to_lbp': base_lbp_rate},
        {'code': 'LBP', 'name': 'Lebanese Pound', 'symbol': 'ل.ل', 'rate_to_usd': 1/base_lbp_rate, 'rate_to_lbp': 1.0},
        {'code': 'EUR', 'name': 'Euro', 'symbol': '€', 'rate_to_usd': 1.08, 'rate_to_lbp': base_lbp_rate * 1.08},
        {'code': 'GBP', 'name': 'British Pound', 'symbol': '£', 'rate_to_usd': 1.27, 'rate_to_lbp': base_lbp_rate * 1.27},
        {'code': 'CHF', 'name': 'Swiss Franc', 'symbol': 'CHF', 'rate_to_usd': 1.12, 'rate_to_lbp': base_lbp_rate * 1.12},
        {'code': 'SAR', 'name': 'Saudi Riyal', 'symbol': 'ر.س', 'rate_to_usd': 0.27, 'rate_to_lbp': base_lbp_rate * 0.27},
        {'code': 'AED', 'name': 'UAE Dirham', 'symbol': 'د.إ', 'rate_to_usd': 0.27, 'rate_to_lbp': base_lbp_rate * 0.27},
        {'code': 'KWD', 'name': 'Kuwaiti Dinar', 'symbol': 'د.ك', 'rate_to_usd': 3.25, 'rate_to_lbp': base_lbp_rate * 3.25},
        {'code': 'JOD', 'name': 'Jordanian Dinar', 'symbol': 'د.أ', 'rate_to_usd': 1.41, 'rate_to_lbp': base_lbp_rate * 1.41},
        {'code': 'EGP', 'name': 'Egyptian Pound', 'symbol': 'ج.م', 'rate_to_usd': 0.032, 'rate_to_lbp': base_lbp_rate * 0.032},
        {'code': 'CAD', 'name': 'Canadian Dollar', 'symbol': 'C$', 'rate_to_usd': 0.74, 'rate_to_lbp': base_lbp_rate * 0.74},
        {'code': 'AUD', 'name': 'Australian Dollar', 'symbol': 'A$', 'rate_to_usd': 0.65, 'rate_to_lbp': base_lbp_rate * 0.65},
        {'code': 'JPY', 'name': 'Japanese Yen', 'symbol': '¥', 'rate_to_usd': 0.0067, 'rate_to_lbp': base_lbp_rate * 0.0067},
        {'code': 'CNY', 'name': 'Chinese Yuan', 'symbol': '¥', 'rate_to_usd': 0.14, 'rate_to_lbp': base_lbp_rate * 0.14},
        {'code': 'INR', 'name': 'Indian Rupee', 'symbol': '₹', 'rate_to_usd': 0.012, 'rate_to_lbp': base_lbp_rate * 0.012},
        {'code': 'TRY', 'name': 'Turkish Lira', 'symbol': '₺', 'rate_to_usd': 0.037, 'rate_to_lbp': base_lbp_rate * 0.037},
    ]
    
    inserted_count = 0
    for curr in currencies:
        currency_doc = {
            'id': str(uuid.uuid4()),
            'code': curr['code'],
            'name': curr['name'],
            'symbol': curr['symbol'],
            'rate_to_usd': curr['rate_to_usd'],
            'rate_to_lbp': curr['rate_to_lbp'],
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        await db.currencies.insert_one(currency_doc)
        inserted_count += 1
    
    return {"message": f"Successfully seeded {inserted_count} currencies", "count": inserted_count}


# Helper function for voucher number generation (used by multiple endpoints)
async def generate_voucher_number(voucher_type: str, organization_id: str) -> str:
    count = await db.vouchers.count_documents({
        'voucher_type': voucher_type,
        'organization_id': organization_id
    })
    year = datetime.now().year
    return f"{voucher_type}-{year}-{str(count + 1).zfill(5)}"


# Helper function for document number generation with configurable series
async def generate_document_number(
    organization_id: str, 
    doc_type: str,  # 'sales_invoice', 'purchase_invoice', 'pos', 'dbcr'
    collection_name: str,
    number_field: str = 'invoice_number'
) -> str:
    """
    Generate document number based on organization's invoice_series settings.
    Falls back to default format if no custom settings exist.
    
    Settings format in organization.invoice_series:
    {
        "sales_invoice": {"prefix": "INV-", "next_number": 1, "include_year": true},
        "purchase_invoice": {"prefix": "PUR-", "next_number": 1, "include_year": true},
        "pos": {"prefix": "POS-", "next_number": 1, "include_year": true},
        "dbcr": {"prefix": "DBCR-", "next_number": 1, "include_year": true}
    }
    """
    year = datetime.now().year
    
    # Default prefixes
    default_prefixes = {
        'sales_invoice': 'INV-',
        'purchase_invoice': 'PUR-',
        'pos': 'POS-',
        'dbcr': 'DBCR-'
    }
    
    # Get organization settings
    org = await db.organizations.find_one({'id': organization_id}, {'invoice_series': 1})
    series_settings = org.get('invoice_series', {}).get(doc_type, {}) if org else {}
    
    # Get prefix from settings or use default
    prefix = series_settings.get('prefix', default_prefixes.get(doc_type, 'DOC-'))
    include_year = series_settings.get('include_year', True)
    
    # Build the full prefix with optional year
    if include_year:
        full_prefix = f"{prefix}{year}-"
    else:
        full_prefix = prefix
    
    # Check if there's a manually set next_number that's higher than the DB sequence
    manual_next = series_settings.get('next_number')
    
    # Get the collection
    collection = db[collection_name]
    
    # Escape special regex characters in prefix
    escaped_prefix = full_prefix.replace('-', r'\-').replace('.', r'\.').replace('/', r'\/')
    
    # Find the last document with this prefix pattern
    last_doc = await collection.find_one(
        {
            'organization_id': organization_id,
            number_field: {'$regex': f'^{escaped_prefix}'}
        },
        {number_field: 1},
        sort=[(number_field, -1)]
    )
    
    # Determine next number
    if last_doc:
        try:
            last_num_str = last_doc[number_field].replace(full_prefix, '')
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


# ================== CHART OF ACCOUNTS ROUTES (MOVED TO routers/accounts.py) ==================
'''
# NOTE: POST /accounts moved to routers/accounts.py (with VAT mirror auto-creation and contact fields)

@api_router.get("/accounts", response_model=List[AccountResponse])
async def get_accounts(organization_id: str, fy_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    accounts = await db.accounts.find(
        {'organization_id': organization_id},
        {'_id': 0}
    ).sort('code', 1).to_list(None)
    
    # Normalize accounts - ensure all required fields exist with defaults
    for acc in accounts:
        code = acc.get('code', '')
        if not acc.get('account_class') and code:
            try:
                acc['account_class'] = int(code[0]) if code[0].isdigit() else None
            except (ValueError, IndexError):
                acc['account_class'] = None
        
        if not acc.get('account_type') and acc.get('account_class'):
            account_class = acc['account_class']
            if account_class in [1, 2, 3]:
                acc['account_type'] = 'equity' if account_class == 1 else ('liability' if account_class == 2 else 'expense')
            elif account_class == 4:
                acc['account_type'] = 'asset'
            elif account_class == 5:
                acc['account_type'] = 'asset'
            elif account_class == 6:
                acc['account_type'] = 'expense'
            elif account_class == 7:
                acc['account_type'] = 'revenue'
        
        if 'is_active' not in acc:
            acc['is_active'] = True
        
        acc['balance_lbp'] = acc.get('balance_lbp', 0) or 0
        acc['balance_usd'] = acc.get('balance_usd', 0) or 0
    
    # If FY filter, recompute balances from vouchers in that FY range
    if fy_id:
        fy = await db.fiscal_years.find_one({'id': fy_id}, {'_id': 0})
        logger.info(f"FY filter: fy_id={fy_id}, found={fy is not None}, name={fy.get('name') if fy else 'N/A'}")
        if fy:
            # Reset all balances to 0
            for acc in accounts:
                acc['balance_lbp'] = 0
                acc['balance_usd'] = 0
            
            # Use aggregation to compute balances from vouchers in FY range
            acc_lookup = {acc.get('code', ''): acc for acc in accounts}
            pipeline = [
                {'$match': {
                    'organization_id': organization_id,
                    'is_posted': True,
                    'date': {'$gte': fy['start_date'], '$lte': fy['end_date']}
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
    
    # Calculate parent account balances from children
    code_balances = {}
    for acc in accounts:
        code = acc.get('code', '')
        code_balances[code] = {'lbp': acc.get('balance_lbp', 0) or 0, 'usd': acc.get('balance_usd', 0) or 0}
    
    for acc in accounts:
        code = acc.get('code', '')
        if code and len(code) <= 4:
            child_lbp = 0
            child_usd = 0
            prefix = code
            for other_code, bal in code_balances.items():
                if other_code.startswith(prefix) and len(other_code) > len(prefix):
                    child_lbp += bal['lbp']
                    child_usd += bal['usd']
            acc['balance_lbp'] = child_lbp
            acc['balance_usd'] = child_usd
    
    return [AccountResponse(**acc) for acc in accounts]

# NOTE: /accounts/movable/list endpoint moved to routers/accounts.py (with proper search/limit optimization)

@api_router.get("/accounts/template-csv")
async def get_csv_template(current_user: dict = Depends(get_current_user)):
    """Get a sample CSV template for account import"""
    template = """code,name,name_ar,account_class,account_type,parent_code
101,Capital,رأس المال,1,equity,
51201,Bank of Beirut - LBP,بنك بيروت - ليرة,5,asset,512
51301,Bank of Beirut - USD,بنك بيروت - دولار,5,asset,513
41101,Customer - Ahmad Trading,العميل - أحمد للتجارة,4,asset,411
61001,Salaries Expense,مصروف الرواتب,6,expense,610
71001,Sales Revenue,إيرادات المبيعات,7,revenue,710"""
    
    return {
        "template": template,
        "instructions": {
            "required_fields": ["code", "name"],
            "optional_fields": ["name_ar", "account_class", "account_type", "parent_code"],
            "account_class_values": "1-7 (auto-detected from first digit of code if omitted)",
            "account_type_values": "asset, liability, equity, revenue, expense (auto-detected from class if omitted)",
            "notes": [
                "CSV header row is required",
                "Field names are case-insensitive",
                "Existing accounts with same code will be updated",
                "New accounts will be created"
            ]
        }
    }

@api_router.get("/accounts/{account_id}", response_model=AccountResponse)
async def get_account(account_id: str, current_user: dict = Depends(get_current_user)):
    account = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return AccountResponse(**account)

@api_router.put("/accounts/{account_id}", response_model=AccountResponse)
async def update_account(account_id: str, account_data: AccountCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    result = await db.accounts.update_one(
        {'id': account_id},
        {'$set': {
            'code': account_data.code,
            'name': account_data.name,
            'name_ar': account_data.name_ar,
            'account_class': account_data.account_class,
            'account_type': account_data.account_type,
            'parent_code': account_data.parent_code,
            'is_active': account_data.is_active,
            'mobile': account_data.mobile,
            'address': account_data.address,
            'contact_person': account_data.contact_person,
            'email': account_data.email,
            'notes': account_data.notes
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    
    updated = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    return AccountResponse(**updated)

@api_router.post("/accounts/{account_id}/reset-balance")
async def reset_account_balance(account_id: str, current_user: dict = Depends(get_current_user)):
    """Reset an account's balance to zero. Only for super_admin/admin."""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    account = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    await db.accounts.update_one(
        {'id': account_id},
        {'$set': {'balance_usd': 0, 'balance_lbp': 0}}
    )
    
    updated = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    return {
        "message": f"Balance reset for account {account.get('code')} - {account.get('name')}",
        "account": AccountResponse(**updated)
    }

@api_router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    account = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Check if account has balance
    if account.get('balance_lbp', 0) != 0 or account.get('balance_usd', 0) != 0:
        raise HTTPException(status_code=400, detail="Cannot delete account with balance")
    
    await db.accounts.delete_one({'id': account_id})
    return {"message": "Account deleted successfully"}

# ================== CUSTOMERS & SUPPLIERS ==================
# NOTE: /customers, /suppliers, and /accounts/{account_id}/contact-info endpoints moved to routers/accounts.py

@api_router.post("/accounts/seed-coa")
async def seed_chart_of_accounts(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Seed standard Lebanese Chart of Accounts for an organization"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Check if accounts already exist
    existing_count = await db.accounts.count_documents({'organization_id': organization_id})
    if existing_count > 0:
        raise HTTPException(status_code=400, detail="Organization already has accounts. Delete existing accounts first or use a new organization.")
    
    # Standard Lebanese Chart of Accounts
    accounts = [
        # Class 1 - Capital Accounts
        {'code': '101', 'name': 'Capital', 'name_ar': 'رأس المال', 'account_class': 1, 'account_type': 'equity'},
        {'code': '106', 'name': 'Reserves', 'name_ar': 'الاحتياطيات', 'account_class': 1, 'account_type': 'equity'},
        {'code': '120', 'name': 'Retained Earnings', 'name_ar': 'الأرباح المحتجزة', 'account_class': 1, 'account_type': 'equity'},
        
        # Class 2 - Fixed Assets
        {'code': '211', 'name': 'Land', 'name_ar': 'الأراضي', 'account_class': 2, 'account_type': 'asset'},
        {'code': '213', 'name': 'Buildings', 'name_ar': 'المباني', 'account_class': 2, 'account_type': 'asset'},
        {'code': '215', 'name': 'Equipment', 'name_ar': 'المعدات', 'account_class': 2, 'account_type': 'asset'},
        {'code': '218', 'name': 'Vehicles', 'name_ar': 'المركبات', 'account_class': 2, 'account_type': 'asset'},
        
        # Class 3 - Inventory
        {'code': '310', 'name': 'Raw Materials', 'name_ar': 'المواد الخام', 'account_class': 3, 'account_type': 'asset'},
        {'code': '355', 'name': 'Finished Goods', 'name_ar': 'البضائع الجاهزة', 'account_class': 3, 'account_type': 'asset'},
        
        # Class 4 - Third Party Accounts
        {'code': '401', 'name': 'Suppliers', 'name_ar': 'الموردون', 'account_class': 4, 'account_type': 'liability'},
        {'code': '411', 'name': 'Customers', 'name_ar': 'العملاء', 'account_class': 4, 'account_type': 'asset'},
        {'code': '421', 'name': 'Employees', 'name_ar': 'الموظفون', 'account_class': 4, 'account_type': 'liability'},
        {'code': '442', 'name': 'VAT Collectible', 'name_ar': 'ضريبة القيمة المضافة المحصلة', 'account_class': 4, 'account_type': 'liability'},
        {'code': '443', 'name': 'VAT Deductible', 'name_ar': 'ضريبة القيمة المضافة القابلة للخصم', 'account_class': 4, 'account_type': 'asset'},
        
        # Class 5 - Financial Accounts
        {'code': '512', 'name': 'Bank - LBP', 'name_ar': 'البنك - ليرة', 'account_class': 5, 'account_type': 'asset'},
        {'code': '513', 'name': 'Bank - USD', 'name_ar': 'البنك - دولار', 'account_class': 5, 'account_type': 'asset'},
        {'code': '530', 'name': 'Cash - LBP', 'name_ar': 'الصندوق - ليرة', 'account_class': 5, 'account_type': 'asset'},
        {'code': '531', 'name': 'Cash - USD', 'name_ar': 'الصندوق - دولار', 'account_class': 5, 'account_type': 'asset'},
        
        # Class 6 - Expenses
        {'code': '601', 'name': 'Purchases', 'name_ar': 'المشتريات', 'account_class': 6, 'account_type': 'expense'},
        {'code': '613', 'name': 'Transportation', 'name_ar': 'النقل', 'account_class': 6, 'account_type': 'expense'},
        {'code': '616', 'name': 'Insurance', 'name_ar': 'التأمين', 'account_class': 6, 'account_type': 'expense'},
        {'code': '626', 'name': 'Telecommunications', 'name_ar': 'الاتصالات', 'account_class': 6, 'account_type': 'expense'},
        {'code': '640', 'name': 'Salaries', 'name_ar': 'الرواتب', 'account_class': 6, 'account_type': 'expense'},
        {'code': '661', 'name': 'Interest Expense', 'name_ar': 'مصاريف الفوائد', 'account_class': 6, 'account_type': 'expense'},
        {'code': '681', 'name': 'Depreciation', 'name_ar': 'الإهلاك', 'account_class': 6, 'account_type': 'expense'},
        
        # Class 7 - Revenue
        {'code': '701', 'name': 'Sales', 'name_ar': 'المبيعات', 'account_class': 7, 'account_type': 'revenue'},
        {'code': '706', 'name': 'Service Revenue', 'name_ar': 'إيرادات الخدمات', 'account_class': 7, 'account_type': 'revenue'},
        {'code': '761', 'name': 'Interest Income', 'name_ar': 'إيرادات الفوائد', 'account_class': 7, 'account_type': 'revenue'},
        {'code': '771', 'name': 'Other Income', 'name_ar': 'إيرادات أخرى', 'account_class': 7, 'account_type': 'revenue'},
        
        # Movable Accounts (5+ digits) - Sub-accounts for transactions
        # Class 4 - Third Party Sub-accounts
        {'code': '40101', 'name': 'Supplier - ABC Corp', 'name_ar': 'مورد - شركة أ ب ج', 'account_class': 4, 'account_type': 'liability'},
        {'code': '40102', 'name': 'Supplier - XYZ Ltd', 'name_ar': 'مورد - شركة س ع ص', 'account_class': 4, 'account_type': 'liability'},
        {'code': '41101', 'name': 'Customer - Ahmad Trading', 'name_ar': 'عميل - أحمد للتجارة', 'account_class': 4, 'account_type': 'asset'},
        {'code': '41102', 'name': 'Customer - Beirut Services', 'name_ar': 'عميل - خدمات بيروت', 'account_class': 4, 'account_type': 'asset'},
        {'code': '42101', 'name': 'Employee - Salary Payable', 'name_ar': 'الموظفون - رواتب مستحقة', 'account_class': 4, 'account_type': 'liability'},
        
        # Class 5 - Financial Sub-accounts  
        {'code': '51201', 'name': 'Bank of Beirut - LBP', 'name_ar': 'بنك بيروت - ليرة', 'account_class': 5, 'account_type': 'asset'},
        {'code': '51202', 'name': 'Blom Bank - LBP', 'name_ar': 'بنك بلوم - ليرة', 'account_class': 5, 'account_type': 'asset'},
        {'code': '51301', 'name': 'Bank of Beirut - USD', 'name_ar': 'بنك بيروت - دولار', 'account_class': 5, 'account_type': 'asset'},
        {'code': '51302', 'name': 'Blom Bank - USD', 'name_ar': 'بنك بلوم - دولار', 'account_class': 5, 'account_type': 'asset'},
        {'code': '53001', 'name': 'Petty Cash - LBP', 'name_ar': 'صندوق المصروفات النثرية - ليرة', 'account_class': 5, 'account_type': 'asset'},
        {'code': '53101', 'name': 'Petty Cash - USD', 'name_ar': 'صندوق المصروفات النثرية - دولار', 'account_class': 5, 'account_type': 'asset'},
        
        # Class 6 - Expense Sub-accounts
        {'code': '60101', 'name': 'Purchases - Raw Materials', 'name_ar': 'مشتريات - مواد خام', 'account_class': 6, 'account_type': 'expense'},
        {'code': '60102', 'name': 'Purchases - Office Supplies', 'name_ar': 'مشتريات - لوازم مكتبية', 'account_class': 6, 'account_type': 'expense'},
        {'code': '61301', 'name': 'Local Transport', 'name_ar': 'نقل محلي', 'account_class': 6, 'account_type': 'expense'},
        {'code': '62601', 'name': 'Phone & Internet', 'name_ar': 'هاتف وانترنت', 'account_class': 6, 'account_type': 'expense'},
        {'code': '64001', 'name': 'Salaries - Staff', 'name_ar': 'رواتب - موظفين', 'account_class': 6, 'account_type': 'expense'},
        {'code': '64002', 'name': 'Salaries - Management', 'name_ar': 'رواتب - إدارة', 'account_class': 6, 'account_type': 'expense'},
        
        # Class 7 - Revenue Sub-accounts
        {'code': '70101', 'name': 'Sales - Products', 'name_ar': 'مبيعات - منتجات', 'account_class': 7, 'account_type': 'revenue'},
        {'code': '70102', 'name': 'Sales - Services', 'name_ar': 'مبيعات - خدمات', 'account_class': 7, 'account_type': 'revenue'},
        {'code': '70601', 'name': 'Consulting Revenue', 'name_ar': 'إيرادات استشارات', 'account_class': 7, 'account_type': 'revenue'},
    ]
    
    inserted_count = 0
    for acc in accounts:
        account_doc = {
            'id': str(uuid.uuid4()),
            'code': acc['code'],
            'name': acc['name'],
            'name_ar': acc['name_ar'],
            'account_class': acc['account_class'],
            'account_type': acc['account_type'],
            'parent_code': None,
            'is_active': True,
            'organization_id': organization_id,
            'balance_lbp': 0,
            'balance_usd': 0
        }
        await db.accounts.insert_one(account_doc)
        inserted_count += 1
    
    return {"message": f"Successfully seeded {inserted_count} accounts", "count": inserted_count}

# CSV Import Models
class CSVImportPreview(BaseModel):
    total_rows: int
    valid_rows: int
    invalid_rows: int
    new_accounts: int
    update_accounts: int
    preview_data: List[dict]
    errors: List[str]

class CSVImportResult(BaseModel):
    success: bool
    message: str
    created: int
    updated: int
    errors: List[str]

@api_router.post("/accounts/import-csv/preview")
async def preview_csv_import(
    organization_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Preview CSV import with field matching - shows what will be imported/updated"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    content = await file.read()
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        text = content.decode('utf-8-sig')  # Try with BOM
    
    reader = csv.DictReader(io.StringIO(text))
    
    # Get existing accounts for this organization
    existing_accounts = await db.accounts.find(
        {'organization_id': organization_id}, 
        {'_id': 0, 'code': 1}
    ).to_list(1000)
    existing_codes = {acc['code'] for acc in existing_accounts}
    
    preview_data = []
    errors = []
    valid_rows = 0
    invalid_rows = 0
    new_accounts = 0
    update_accounts = 0
    
    # Valid field mappings (CSV header -> DB field)
    valid_fields = ['code', 'name', 'name_ar', 'account_class', 'account_type', 'parent_code']
    valid_types = ['asset', 'liability', 'equity', 'revenue', 'expense']
    
    for row_num, row in enumerate(reader, start=2):  # Start at 2 (row 1 is header)
        row_errors = []
        
        # Map fields (case-insensitive matching)
        mapped_row = {}
        for csv_field, value in row.items():
            field_lower = csv_field.lower().strip().replace(' ', '_')
            if field_lower in valid_fields:
                mapped_row[field_lower] = value.strip() if value else ''
            # Handle common aliases
            elif field_lower in ['arabic_name', 'ar_name', 'arabic']:
                mapped_row['name_ar'] = value.strip() if value else ''
            elif field_lower in ['class', 'acc_class']:
                mapped_row['account_class'] = value.strip() if value else ''
            elif field_lower in ['type', 'acc_type']:
                mapped_row['account_type'] = value.strip() if value else ''
        
        # Validate required fields
        if not mapped_row.get('code'):
            row_errors.append(f"Row {row_num}: Missing code")
        if not mapped_row.get('name'):
            row_errors.append(f"Row {row_num}: Missing name")
        
        # Validate account_class
        account_class = mapped_row.get('account_class', '')
        if account_class:
            try:
                class_num = int(account_class)
                if class_num < 1 or class_num > 7:
                    row_errors.append(f"Row {row_num}: account_class must be 1-7")
                mapped_row['account_class'] = class_num
            except ValueError:
                row_errors.append(f"Row {row_num}: Invalid account_class '{account_class}'")
        else:
            # Auto-detect class from code
            code = mapped_row.get('code', '')
            if code and code[0].isdigit():
                mapped_row['account_class'] = int(code[0])
            else:
                mapped_row['account_class'] = 1
        
        # Validate account_type
        acc_type = mapped_row.get('account_type', '').lower()
        if acc_type and acc_type not in valid_types:
            row_errors.append(f"Row {row_num}: Invalid account_type '{acc_type}'. Must be one of: {', '.join(valid_types)}")
        elif not acc_type:
            # Auto-detect type from class
            class_num = mapped_row.get('account_class', 1)
            if class_num in [1]:
                mapped_row['account_type'] = 'equity'
            elif class_num in [2, 3, 5]:
                mapped_row['account_type'] = 'asset'
            elif class_num in [4]:
                mapped_row['account_type'] = 'liability'
            elif class_num in [6]:
                mapped_row['account_type'] = 'expense'
            elif class_num in [7]:
                mapped_row['account_type'] = 'revenue'
            else:
                mapped_row['account_type'] = 'asset'
        else:
            mapped_row['account_type'] = acc_type
        
        if row_errors:
            errors.extend(row_errors)
            invalid_rows += 1
        else:
            valid_rows += 1
            code = mapped_row['code']
            is_update = code in existing_codes
            if is_update:
                update_accounts += 1
            else:
                new_accounts += 1
            
            preview_data.append({
                **mapped_row,
                'action': 'update' if is_update else 'create'
            })
    
    return CSVImportPreview(
        total_rows=valid_rows + invalid_rows,
        valid_rows=valid_rows,
        invalid_rows=invalid_rows,
        new_accounts=new_accounts,
        update_accounts=update_accounts,
        preview_data=preview_data[:50],  # Limit preview to 50 rows
        errors=errors[:20]  # Limit errors to 20
    )

@api_router.post("/accounts/import-csv", response_model=CSVImportResult)
async def import_csv_accounts(
    organization_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Import accounts from CSV - creates new and updates existing accounts"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    content = await file.read()
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        text = content.decode('utf-8-sig')
    
    reader = csv.DictReader(io.StringIO(text))
    
    # Get existing accounts
    existing_accounts = await db.accounts.find(
        {'organization_id': organization_id}, 
        {'_id': 0}
    ).to_list(1000)
    existing_by_code = {acc['code']: acc for acc in existing_accounts}
    
    created = 0
    updated = 0
    errors = []
    
    valid_fields = ['code', 'name', 'name_ar', 'account_class', 'account_type', 'parent_code']
    valid_types = ['asset', 'liability', 'equity', 'revenue', 'expense']
    
    for row_num, row in enumerate(reader, start=2):
        try:
            # Map fields
            mapped_row = {}
            for csv_field, value in row.items():
                field_lower = csv_field.lower().strip().replace(' ', '_')
                if field_lower in valid_fields:
                    mapped_row[field_lower] = value.strip() if value else ''
                elif field_lower in ['arabic_name', 'ar_name', 'arabic']:
                    mapped_row['name_ar'] = value.strip() if value else ''
                elif field_lower in ['class', 'acc_class']:
                    mapped_row['account_class'] = value.strip() if value else ''
                elif field_lower in ['type', 'acc_type']:
                    mapped_row['account_type'] = value.strip() if value else ''
            
            code = mapped_row.get('code', '').strip()
            name = mapped_row.get('name', '').strip()
            
            if not code or not name:
                errors.append(f"Row {row_num}: Missing code or name")
                continue
            
            # Parse account_class
            account_class = mapped_row.get('account_class', '')
            if account_class:
                try:
                    account_class = int(account_class)
                except ValueError:
                    account_class = int(code[0]) if code[0].isdigit() else 1
            else:
                account_class = int(code[0]) if code[0].isdigit() else 1
            
            # Parse account_type
            account_type = mapped_row.get('account_type', '').lower()
            if account_type not in valid_types:
                if account_class in [1]:
                    account_type = 'equity'
                elif account_class in [2, 3, 5]:
                    account_type = 'asset'
                elif account_class in [4]:
                    account_type = 'liability'
                elif account_class in [6]:
                    account_type = 'expense'
                elif account_class in [7]:
                    account_type = 'revenue'
                else:
                    account_type = 'asset'
            
            if code in existing_by_code:
                # Update existing account
                await db.accounts.update_one(
                    {'code': code, 'organization_id': organization_id},
                    {'$set': {
                        'name': name,
                        'name_ar': mapped_row.get('name_ar', ''),
                        'account_class': account_class,
                        'account_type': account_type,
                        'parent_code': mapped_row.get('parent_code', ''),
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }}
                )
                updated += 1
            else:
                # Create new account
                account_doc = {
                    'id': str(uuid.uuid4()),
                    'code': code,
                    'name': name,
                    'name_ar': mapped_row.get('name_ar', ''),
                    'account_class': account_class,
                    'account_type': account_type,
                    'parent_code': mapped_row.get('parent_code', ''),
                    'is_active': True,
                    'organization_id': organization_id,
                    'balance_lbp': 0,
                    'balance_usd': 0,
                    'created_at': datetime.now(timezone.utc).isoformat()
                }
                await db.accounts.insert_one(account_doc)
                created += 1
                
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
    
    return CSVImportResult(
        success=True,
        message=f"Import completed: {created} created, {updated} updated",
        created=created,
        updated=updated,
        errors=errors[:20]
    )

# Rebuild/Update accounts from historical vouchers
class RebuildFromVouchersRequest(BaseModel):
    organization_id: str

class RebuildFromVouchersResult(BaseModel):
    success: bool
    message: str
    created: int = 0
    updated: int = 0
    total_vouchers_scanned: int = 0
    accounts_found: int = 0

@api_router.post("/accounts/rebuild-from-vouchers", response_model=RebuildFromVouchersResult)
async def rebuild_accounts_from_vouchers(
    request: RebuildFromVouchersRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Scan all vouchers and create/update accounts based on voucher line data.
    This is useful when accounts are missing but voucher data exists.
    Also resets all account balances to zero first, then recalculates from vouchers.
    """
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    organization_id = request.organization_id
    
    # STEP 1: Reset ALL account balances to zero first
    # This ensures accounts without any voucher entries get their balances cleared
    reset_result = await db.accounts.update_many(
        {'organization_id': organization_id},
        {'$set': {'balance_usd': 0, 'balance_lbp': 0}}
    )
    accounts_reset = reset_result.modified_count
    
    # Get all POSTED vouchers for this organization (only posted vouchers affect account balances)
    vouchers = await db.vouchers.find(
        {'organization_id': organization_id, 'is_posted': True},
        {'_id': 0, 'lines': 1}
    ).to_list(None)  # Get ALL vouchers
    
    # Get existing accounts
    existing_accounts = await db.accounts.find(
        {'organization_id': organization_id},
        {'_id': 0}
    ).to_list(None)  # Get ALL accounts
    existing_by_code = {acc['code']: acc for acc in existing_accounts}
    existing_by_id = {acc['id']: acc for acc in existing_accounts}
    
    # Extract unique accounts from voucher lines
    accounts_from_vouchers = {}
    
    for voucher in vouchers:
        for line in voucher.get('lines', []):
            account_id = line.get('account_id')
            account_code = line.get('account_code')
            account_name = line.get('account_name')
            
            if account_code and account_code not in accounts_from_vouchers:
                accounts_from_vouchers[account_code] = {
                    'id': account_id,
                    'code': account_code,
                    'name': account_name or f'Account {account_code}',
                    'name_ar': line.get('account_name_ar', ''),
                    'currency': line.get('currency', 'USD'),
                    # Calculate totals from this line
                    'debit_usd': line.get('debit_usd', 0) or line.get('debit', 0) or 0,
                    'credit_usd': line.get('credit_usd', 0) or line.get('credit', 0) or 0,
                    'debit_lbp': line.get('debit_lbp', 0) or 0,
                    'credit_lbp': line.get('credit_lbp', 0) or 0
                }
            elif account_code:
                # Accumulate balances
                accounts_from_vouchers[account_code]['debit_usd'] += line.get('debit_usd', 0) or line.get('debit', 0) or 0
                accounts_from_vouchers[account_code]['credit_usd'] += line.get('credit_usd', 0) or line.get('credit', 0) or 0
                accounts_from_vouchers[account_code]['debit_lbp'] += line.get('debit_lbp', 0) or 0
                accounts_from_vouchers[account_code]['credit_lbp'] += line.get('credit_lbp', 0) or 0
    
    created = 0
    updated = 0
    now = datetime.now(timezone.utc).isoformat()
    
    for code, acc_data in accounts_from_vouchers.items():
        # Calculate net balance
        balance_usd = acc_data['debit_usd'] - acc_data['credit_usd']
        balance_lbp = acc_data['debit_lbp'] - acc_data['credit_lbp']
        
        # Determine account class and type from code
        account_class = int(code[0]) if code and code[0].isdigit() else 1
        account_type_map = {
            1: 'equity',
            2: 'asset',
            3: 'asset',  # inventory
            4: 'liability',
            5: 'asset',  # cash/bank
            6: 'expense',
            7: 'revenue'
        }
        account_type = account_type_map.get(account_class, 'asset')
        
        if code in existing_by_code:
            # Update existing account - update balance
            existing_acc = existing_by_code[code]
            await db.accounts.update_one(
                {'id': existing_acc['id']},
                {'$set': {
                    'balance_usd': balance_usd,
                    'balance_lbp': balance_lbp,
                    'updated_at': now
                }}
            )
            updated += 1
        else:
            # Create new account
            new_account = {
                'id': acc_data.get('id') or str(uuid.uuid4()),
                'code': code,
                'name': acc_data.get('name', f'Account {code}'),
                'name_ar': acc_data.get('name_ar', ''),
                'account_class': account_class,
                'account_type': account_type,
                'parent_code': code[:len(code)-2] if len(code) > 2 else '',
                'is_active': True,
                'balance_usd': balance_usd,
                'balance_lbp': balance_lbp,
                'organization_id': organization_id,
                'created_at': now,
                'created_by': current_user['id']
            }
            await db.accounts.insert_one(new_account)
            created += 1
    
    return RebuildFromVouchersResult(
        success=True,
        message=f"Rebuild completed: {accounts_reset} accounts reset, {updated} updated with balances from {len(vouchers)} vouchers",
        created=created,
        updated=updated,
        total_vouchers_scanned=len(vouchers),
        accounts_found=len(accounts_from_vouchers)
    )


'''

'''
# ================== VOUCHER ROUTES (MOVED TO routers/vouchers.py) ==================

@api_router.post("/vouchers", response_model=VoucherResponse)
async def create_voucher(voucher_data: VoucherCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Validate fiscal year (if FYs are defined for this org)
    await get_open_fy_for_date(voucher_data.organization_id, voucher_data.date)
    
    # Calculate totals from lines (each line has its own currency conversion)
    total_debit_lbp = sum(line.debit_lbp for line in voucher_data.lines)
    total_credit_lbp = sum(line.credit_lbp for line in voucher_data.lines)
    total_debit_usd = sum(line.debit_usd for line in voucher_data.lines)
    total_credit_usd = sum(line.credit_usd for line in voucher_data.lines)
    
    voucher_id = str(uuid.uuid4())
    voucher_number = await generate_voucher_number(voucher_data.voucher_type, voucher_data.organization_id)
    
    voucher_doc = {
        'id': voucher_id,
        'voucher_number': voucher_number,
        'voucher_type': voucher_data.voucher_type,
        'date': voucher_data.date,
        'reference': voucher_data.reference,
        'description': voucher_data.description,
        'lines': [line.model_dump() for line in voucher_data.lines],
        'total_debit_lbp': total_debit_lbp,
        'total_credit_lbp': total_credit_lbp,
        'total_debit_usd': total_debit_usd,
        'total_credit_usd': total_credit_usd,
        'is_posted': False,
        'organization_id': voucher_data.organization_id,
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.vouchers.insert_one(voucher_doc)
    return VoucherResponse(**voucher_doc)

@api_router.get("/vouchers", response_model=List[VoucherResponse])
async def get_vouchers(
    organization_id: str,
    voucher_type: Optional[str] = None,
    status: Optional[str] = None,  # 'posted', 'draft', 'all'
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    current_user: dict = Depends(get_current_user)
):
    """Get vouchers with search, filters and pagination"""
    query = {'organization_id': organization_id}
    
    if voucher_type:
        query['voucher_type'] = voucher_type
    
    if status == 'posted':
        query['status'] = 'posted'
    elif status == 'draft':
        query['status'] = {'$ne': 'posted'}
    
    if date_from:
        query['date'] = {'$gte': date_from}
    if date_to:
        if 'date' in query:
            query['date']['$lte'] = date_to
        else:
            query['date'] = {'$lte': date_to}
    
    # Apply search filter at DB level using regex for performance
    if search:
        search_regex = {'$regex': search, '$options': 'i'}
        query['$or'] = [
            {'voucher_number': search_regex},
            {'reference': search_regex},
            {'description': search_regex},
            {'lines.account_code': search_regex},
            {'lines.description': search_regex}
        ]
    
    # Use DB-level skip/limit for efficiency (no loading all into memory)
    vouchers = await db.vouchers.find(query, {'_id': 0}).sort('date', -1).skip(skip).limit(limit).to_list(limit)
    
    return [VoucherResponse(**v) for v in vouchers]

@api_router.get("/vouchers/count")
async def get_vouchers_count(
    organization_id: str,
    voucher_type: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get total count of vouchers matching filters"""
    query = {'organization_id': organization_id}
    
    if voucher_type:
        query['voucher_type'] = voucher_type
    
    if status == 'posted':
        query['status'] = 'posted'
    elif status == 'draft':
        query['status'] = {'$ne': 'posted'}
    
    if date_from:
        query['date'] = {'$gte': date_from}
    if date_to:
        if 'date' in query:
            query['date']['$lte'] = date_to
        else:
            query['date'] = {'$lte': date_to}
    
    if search:
        search_regex = {'$regex': search, '$options': 'i'}
        query['$or'] = [
            {'voucher_number': search_regex},
            {'reference': search_regex},
            {'description': search_regex},
            {'lines.account_code': search_regex},
            {'lines.description': search_regex}
        ]
    
    count = await db.vouchers.count_documents(query)
    return {"count": count}

@api_router.get("/vouchers/{voucher_id}", response_model=VoucherResponse)
async def get_voucher(voucher_id: str, current_user: dict = Depends(get_current_user)):
    voucher = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    return VoucherResponse(**voucher)

@api_router.post("/vouchers/{voucher_id}/post")
async def post_voucher(voucher_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    voucher = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    
    if voucher['is_posted']:
        raise HTTPException(status_code=400, detail="Voucher already posted")
    
    # Validate fiscal year before posting
    await get_open_fy_for_date(voucher['organization_id'], voucher['date'])
    
    # Validate balanced - check both USD and LBP totals must balance
    if abs(voucher['total_debit_usd'] - voucher['total_credit_usd']) > 0.01:
        raise HTTPException(status_code=400, detail="Voucher is not balanced (USD totals must match)")
    
    # Update account balances
    for line in voucher['lines']:
        account = await db.accounts.find_one({
            'code': line['account_code'],
            'organization_id': voucher['organization_id']
        })
        if account:
            new_balance_lbp = account.get('balance_lbp', 0) + line.get('debit_lbp', 0) - line.get('credit_lbp', 0)
            new_balance_usd = account.get('balance_usd', 0) + line.get('debit_usd', 0) - line.get('credit_usd', 0)
            await db.accounts.update_one(
                {'id': account['id']},
                {'$set': {'balance_lbp': new_balance_lbp, 'balance_usd': new_balance_usd}}
            )
    
    # Mark voucher as posted
    await db.vouchers.update_one(
        {'id': voucher_id},
        {'$set': {'is_posted': True, 'posted_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Voucher posted successfully", "voucher_number": voucher['voucher_number']}

# Voucher Update Model
class VoucherUpdate(BaseModel):
    voucher_type: Literal['JV', 'RV', 'PV', 'SV', 'PAYV', 'DC']
    date: str
    reference: Optional[str] = None
    description: str
    lines: List[VoucherLine]

@api_router.put("/vouchers/{voucher_id}", response_model=VoucherResponse)
async def update_voucher(voucher_id: str, voucher_data: VoucherUpdate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    voucher = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    
    # Only super_admin can edit posted vouchers
    if voucher['is_posted'] and current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can edit posted vouchers")
    
    # If editing a posted voucher, reverse the old entries first
    if voucher['is_posted']:
        for line in voucher['lines']:
            account = await db.accounts.find_one({
                'code': line['account_code'],
                'organization_id': voucher['organization_id']
            })
            if account:
                new_balance_lbp = account.get('balance_lbp', 0) - line.get('debit_lbp', 0) + line.get('credit_lbp', 0)
                new_balance_usd = account.get('balance_usd', 0) - line.get('debit_usd', 0) + line.get('credit_usd', 0)
                await db.accounts.update_one(
                    {'id': account['id']},
                    {'$set': {'balance_lbp': new_balance_lbp, 'balance_usd': new_balance_usd}}
                )
    
    # Calculate new totals
    total_debit_lbp = sum(line.debit_lbp for line in voucher_data.lines)
    total_credit_lbp = sum(line.credit_lbp for line in voucher_data.lines)
    total_debit_usd = sum(line.debit_usd for line in voucher_data.lines)
    total_credit_usd = sum(line.credit_usd for line in voucher_data.lines)
    
    update_doc = {
        'voucher_type': voucher_data.voucher_type,
        'date': voucher_data.date,
        'reference': voucher_data.reference,
        'description': voucher_data.description,
        'lines': [line.model_dump() for line in voucher_data.lines],
        'total_debit_lbp': total_debit_lbp,
        'total_credit_lbp': total_credit_lbp,
        'total_debit_usd': total_debit_usd,
        'total_credit_usd': total_credit_usd,
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'updated_by': current_user['id']
    }
    
    # If was posted, apply new entries
    if voucher['is_posted']:
        for line in voucher_data.lines:
            account = await db.accounts.find_one({
                'code': line.account_code,
                'organization_id': voucher['organization_id']
            })
            if account:
                new_balance_lbp = account.get('balance_lbp', 0) + line.debit_lbp - line.credit_lbp
                new_balance_usd = account.get('balance_usd', 0) + line.debit_usd - line.credit_usd
                await db.accounts.update_one(
                    {'id': account['id']},
                    {'$set': {'balance_lbp': new_balance_lbp, 'balance_usd': new_balance_usd}}
                )
    
    await db.vouchers.update_one({'id': voucher_id}, {'$set': update_doc})
    updated = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
    return VoucherResponse(**updated)

@api_router.delete("/vouchers/{voucher_id}")
async def delete_voucher(voucher_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    voucher = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    
    # If voucher was posted, reverse the entries
    if voucher['is_posted']:
        for line in voucher['lines']:
            account = await db.accounts.find_one({
                'code': line['account_code'],
                'organization_id': voucher['organization_id']
            })
            if account:
                new_balance_lbp = account.get('balance_lbp', 0) - line['debit_lbp'] + line['credit_lbp']
                new_balance_usd = account.get('balance_usd', 0) - line['debit_usd'] + line['credit_usd']
                await db.accounts.update_one(
                    {'id': account['id']},
                    {'$set': {'balance_lbp': new_balance_lbp, 'balance_usd': new_balance_usd}}
                )
    
    await db.vouchers.delete_one({'id': voucher_id})
    return {"message": "Voucher deleted successfully", "voucher_number": voucher['voucher_number']}

@api_router.post("/vouchers/{voucher_id}/unpost")
async def unpost_voucher(voucher_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can unpost vouchers")
    
    voucher = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    
    if not voucher['is_posted']:
        raise HTTPException(status_code=400, detail="Voucher is not posted")
    
    # Reverse the entries
    for line in voucher['lines']:
        account = await db.accounts.find_one({
            'code': line['account_code'],
            'organization_id': voucher['organization_id']
        })
        if account:
            new_balance_lbp = account.get('balance_lbp', 0) - line['debit_lbp'] + line['credit_lbp']
            new_balance_usd = account.get('balance_usd', 0) - line['debit_usd'] + line['credit_usd']
            await db.accounts.update_one(
                {'id': account['id']},
                {'$set': {'balance_lbp': new_balance_lbp, 'balance_usd': new_balance_usd}}
            )
    
    # Mark voucher as unposted
    await db.vouchers.update_one(
        {'id': voucher_id},
        {'$set': {'is_posted': False}, '$unset': {'posted_at': ''}}
    )
    
    return {"message": "Voucher unposted successfully", "voucher_number": voucher['voucher_number']}

'''
# ================== EXCHANGE RATE ROUTES ==================

@api_router.post("/exchange-rates", response_model=ExchangeRateResponse)
async def create_exchange_rate(rate_data: ExchangeRateCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    rate_id = str(uuid.uuid4())
    rate_doc = {
        'id': rate_id,
        'date': rate_data.date,
        'rate': rate_data.rate,
        'source': rate_data.source,
        'organization_id': rate_data.organization_id,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    # Upsert - update if exists for same date and org
    await db.exchange_rates.update_one(
        {'date': rate_data.date, 'organization_id': rate_data.organization_id},
        {'$set': rate_doc},
        upsert=True
    )
    
    return ExchangeRateResponse(**rate_doc)

@api_router.get("/exchange-rates", response_model=List[ExchangeRateResponse])
async def get_exchange_rates(organization_id: str, current_user: dict = Depends(get_current_user)):
    rates = await db.exchange_rates.find(
        {'organization_id': organization_id},
        {'_id': 0}
    ).sort('date', -1).to_list(100)
    return [ExchangeRateResponse(**r) for r in rates]

@api_router.get("/exchange-rates/latest")
async def get_latest_exchange_rate(organization_id: str, current_user: dict = Depends(get_current_user)):
    rate = await db.exchange_rates.find_one(
        {'organization_id': organization_id},
        {'_id': 0},
        sort=[('date', -1)]
    )
    if not rate:
        org = await db.organizations.find_one({'id': organization_id}, {'_id': 0})
        if org:
            return {"rate": org.get('base_exchange_rate', 89500), "source": "default", "date": datetime.now().strftime('%Y-%m-%d')}
        return {"rate": 89500, "source": "default", "date": datetime.now().strftime('%Y-%m-%d')}
    return rate

@api_router.get("/exchange-rates/live")
async def fetch_live_exchange_rate(current_user: dict = Depends(get_current_user)):
    """Fetch live exchange rate from external API"""
    try:
        # Using exchangerate.host free API
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get("https://api.exchangerate.host/latest?base=USD&symbols=LBP")
            if response.status_code == 200:
                data = response.json()
                if data.get('success', True) and 'rates' in data:
                    rate = data['rates'].get('LBP', 89500)
                    return {"rate": rate, "source": "api", "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        logger.error(f"Failed to fetch live rate: {e}")
    
    # Fallback - return approximate market rate
    return {"rate": 89500, "source": "fallback", "timestamp": datetime.now(timezone.utc).isoformat()}

# ================== FINANCIAL REPORTS (MOVED TO routers/reports.py) ==================
'''
@api_router.get("/reports/trial-balance")
async def get_trial_balance(
    organization_id: str, 
    include_zero_balance: bool = False,
    current_user: dict = Depends(get_current_user)
):
    # Get accounts - include those where is_active is True OR not set (None)
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
    ).sort('code', 1).to_list(None)  # Get ALL accounts, no limit
    
    # Normalize accounts - ensure all fields exist with defaults
    for acc in accounts:
        code = acc.get('code', '')
        # Auto-detect account_class from first digit of code if missing
        if not acc.get('account_class') and code:
            try:
                acc['account_class'] = int(code[0]) if code[0].isdigit() else None
            except (ValueError, IndexError):
                acc['account_class'] = None
        acc['balance_lbp'] = acc.get('balance_lbp', 0) or 0
        acc['balance_usd'] = acc.get('balance_usd', 0) or 0
    
    # Calculate parent account balances from children first
    for acc in accounts:
        code = acc.get('code', '')
        if code and len(code) <= 4:  # Parent/summary account
            child_balance_lbp = 0
            child_balance_usd = 0
            for child_acc in accounts:
                child_code = child_acc.get('code', '')
                if child_code and child_code.startswith(code) and len(child_code) > len(code):
                    child_balance_lbp += child_acc.get('balance_lbp', 0) or 0
                    child_balance_usd += child_acc.get('balance_usd', 0) or 0
            acc['balance_lbp'] = child_balance_lbp
            acc['balance_usd'] = child_balance_usd
    
    trial_balance = []
    total_debit_lbp = 0
    total_credit_lbp = 0
    total_debit_usd = 0
    total_credit_usd = 0
    
    for acc in accounts:
        balance_lbp = acc.get('balance_lbp', 0) or 0
        balance_usd = acc.get('balance_usd', 0) or 0
        
        debit_lbp = balance_lbp if balance_lbp > 0 else 0
        credit_lbp = abs(balance_lbp) if balance_lbp < 0 else 0
        debit_usd = balance_usd if balance_usd > 0 else 0
        credit_usd = abs(balance_usd) if balance_usd < 0 else 0
        
        # Include accounts with balances OR if include_zero_balance is True
        if balance_lbp != 0 or balance_usd != 0 or include_zero_balance:
            trial_balance.append({
                'code': acc.get('code', ''),
                'name': acc.get('name', 'Unknown'),
                'account_class': acc.get('account_class'),
                'debit_lbp': debit_lbp,
                'credit_lbp': credit_lbp,
                'debit_usd': debit_usd,
                'credit_usd': credit_usd,
                'net_lbp': balance_lbp,
                'net_usd': balance_usd
            })
            # Only count movable accounts (5+ digits) in totals to avoid double counting
            code = acc.get('code', '')
            if len(code) >= 5:
                total_debit_lbp += debit_lbp
                total_credit_lbp += credit_lbp
                total_debit_usd += debit_usd
                total_credit_usd += credit_usd
    
    return {
        'accounts': trial_balance,
        'totals': {
            'debit_lbp': total_debit_lbp,
            'credit_lbp': total_credit_lbp,
            'debit_usd': total_debit_usd,
            'credit_usd': total_credit_usd
        }
    }

@api_router.get("/reports/income-statement")
async def get_income_statement(organization_id: str, current_user: dict = Depends(get_current_user)):
    # Class 7 = Revenue, Class 6 = Expenses
    # Use $and to properly combine multiple $or conditions
    revenue_accounts = await db.accounts.find(
        {
            'organization_id': organization_id,
            '$and': [
                # Account class filter - class 7 OR code starts with 7
                {'$or': [
                    {'account_class': 7},
                    {'code': {'$regex': '^7'}}  # Fallback for accounts without account_class
                ]},
                # Active status filter
                {'$or': [
                    {'is_active': True},
                    {'is_active': {'$exists': False}},
                    {'is_active': None}
                ]}
            ]
        },
        {'_id': 0}
    ).to_list(None)  # No limit
    
    expense_accounts = await db.accounts.find(
        {
            'organization_id': organization_id,
            '$and': [
                # Account class filter - class 6 OR code starts with 6
                {'$or': [
                    {'account_class': 6},
                    {'code': {'$regex': '^6'}}  # Fallback for accounts without account_class
                ]},
                # Active status filter
                {'$or': [
                    {'is_active': True},
                    {'is_active': {'$exists': False}},
                    {'is_active': None}
                ]}
            ]
        },
        {'_id': 0}
    ).to_list(None)  # No limit
    
    # Filter to only include movable accounts (5+ digits) to avoid double counting parent accounts
    revenue_accounts = [a for a in revenue_accounts if len(a.get('code', '')) >= 5]
    expense_accounts = [a for a in expense_accounts if len(a.get('code', '')) >= 5]
    
    total_revenue_lbp = sum(abs(acc.get('balance_lbp', 0) or 0) for acc in revenue_accounts)
    total_revenue_usd = sum(abs(acc.get('balance_usd', 0) or 0) for acc in revenue_accounts)
    total_expenses_lbp = sum(abs(acc.get('balance_lbp', 0) or 0) for acc in expense_accounts)
    total_expenses_usd = sum(abs(acc.get('balance_usd', 0) or 0) for acc in expense_accounts)
    
    net_income_lbp = total_revenue_lbp - total_expenses_lbp
    net_income_usd = total_revenue_usd - total_expenses_usd
    
    return {
        'revenue': {
            'accounts': [{'code': a.get('code', ''), 'name': a.get('name', 'Unknown'), 'balance_lbp': abs(a.get('balance_lbp', 0) or 0), 'balance_usd': abs(a.get('balance_usd', 0) or 0)} for a in revenue_accounts],
            'total_lbp': total_revenue_lbp,
            'total_usd': total_revenue_usd
        },
        'expenses': {
            'accounts': [{'code': a.get('code', ''), 'name': a.get('name', 'Unknown'), 'balance_lbp': abs(a.get('balance_lbp', 0) or 0), 'balance_usd': abs(a.get('balance_usd', 0) or 0)} for a in expense_accounts],
            'total_lbp': total_expenses_lbp,
            'total_usd': total_expenses_usd
        },
        'net_income': {
            'lbp': net_income_lbp,
            'usd': net_income_usd
        }
    }

@api_router.get("/reports/general-ledger/{account_code}")
async def get_general_ledger(account_code: str, organization_id: str, current_user: dict = Depends(get_current_user)):
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
    ).sort('date', 1).to_list(None)  # Get ALL vouchers for accurate ledger
    
    entries = []
    running_balance_lbp = 0
    running_balance_usd = 0
    
    for voucher in vouchers:
        for line in voucher.get('lines', []):
            if line.get('account_code') == account_code:
                # Use .get() with defaults for robust handling of different voucher formats
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
                    'source_type': voucher.get('source_type', 'voucher'),  # 'voucher' or 'crdb_note'
                    'source_id': voucher.get('source_id')  # for crdb notes
                })
    
    # Normalize account fields for response
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

'''

# ================== FISCAL YEAR MANAGEMENT ==================

async def validate_fy_no_overlap(org_id: str, start_date: str, end_date: str, exclude_fy_id: str = None):
    """Check that no other FY for this org overlaps the given date range"""
    query = {
        'organization_id': org_id,
        '$or': [
            {'start_date': {'$lte': end_date}, 'end_date': {'$gte': start_date}},
        ]
    }
    if exclude_fy_id:
        query['id'] = {'$ne': exclude_fy_id}
    overlap = await db.fiscal_years.find_one(query)
    if overlap:
        raise HTTPException(
            status_code=400, 
            detail=f"Date range overlaps with existing fiscal year '{overlap['name']}' ({overlap['start_date']} to {overlap['end_date']})"
        )

async def get_open_fy_for_date(org_id: str, date_str: str):
    """Find an open FY that contains the given date. Returns None if no FY exists (backward compat) or raises if FY exists but date outside open FY."""
    # Check if org has any fiscal years at all
    fy_count = await db.fiscal_years.count_documents({'organization_id': org_id})
    if fy_count == 0:
        return None  # No FY defined yet - allow posting (backward compatibility)
    
    # Find FY containing this date
    fy = await db.fiscal_years.find_one({
        'organization_id': org_id,
        'start_date': {'$lte': date_str},
        'end_date': {'$gte': date_str}
    })
    
    if not fy:
        raise HTTPException(
            status_code=400, 
            detail=f"Date {date_str} does not fall within any defined fiscal year for this organization."
        )
    
    if fy['status'] == 'closed':
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot post to closed fiscal year '{fy['name']}' ({fy['start_date']} to {fy['end_date']}). The fiscal year is locked."
        )
    
    return fy

@api_router.post("/fiscal-years", response_model=FiscalYearResponse)
async def create_fiscal_year(fy_data: FiscalYearCreate, current_user: dict = Depends(get_current_user)):
    """Create a new fiscal year for an organization"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Only admins can manage fiscal years")
    
    # Validate dates
    try:
        start = datetime.strptime(fy_data.start_date, '%Y-%m-%d')
        end = datetime.strptime(fy_data.end_date, '%Y-%m-%d')
        if end <= start:
            raise HTTPException(status_code=400, detail="End date must be after start date")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Check for overlapping fiscal years
    await validate_fy_no_overlap(fy_data.organization_id, fy_data.start_date, fy_data.end_date)
    
    fy_id = str(uuid.uuid4())
    fy_doc = {
        'id': fy_id,
        'name': fy_data.name,
        'start_date': fy_data.start_date,
        'end_date': fy_data.end_date,
        'status': 'open',
        'organization_id': fy_data.organization_id,
        'closed_at': None,
        'closed_by': None,
        'closing_voucher_id': None,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.fiscal_years.insert_one(fy_doc)
    return FiscalYearResponse(**fy_doc)

@api_router.get("/fiscal-years", response_model=List[FiscalYearResponse])
async def get_fiscal_years(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Get all fiscal years for an organization"""
    fiscal_years = await db.fiscal_years.find(
        {'organization_id': organization_id},
        {'_id': 0}
    ).sort('start_date', -1).to_list(100)
    return [FiscalYearResponse(**fy) for fy in fiscal_years]

@api_router.get("/fiscal-years/{fy_id}", response_model=FiscalYearResponse)
async def get_fiscal_year(fy_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single fiscal year"""
    fy = await db.fiscal_years.find_one({'id': fy_id}, {'_id': 0})
    if not fy:
        raise HTTPException(status_code=404, detail="Fiscal year not found")
    return FiscalYearResponse(**fy)

@api_router.put("/fiscal-years/{fy_id}", response_model=FiscalYearResponse)
async def update_fiscal_year(fy_id: str, fy_data: FiscalYearUpdate, current_user: dict = Depends(get_current_user)):
    """Update a fiscal year (only if open)"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Only admins can manage fiscal years")
    
    fy = await db.fiscal_years.find_one({'id': fy_id}, {'_id': 0})
    if not fy:
        raise HTTPException(status_code=404, detail="Fiscal year not found")
    
    if fy['status'] == 'closed':
        raise HTTPException(status_code=400, detail="Cannot edit a closed fiscal year")
    
    update_data = {k: v for k, v in fy_data.model_dump().items() if v is not None}
    
    if update_data:
        # If dates are changing, validate no overlap
        new_start = update_data.get('start_date', fy['start_date'])
        new_end = update_data.get('end_date', fy['end_date'])
        
        if 'start_date' in update_data or 'end_date' in update_data:
            try:
                s = datetime.strptime(new_start, '%Y-%m-%d')
                e = datetime.strptime(new_end, '%Y-%m-%d')
                if e <= s:
                    raise HTTPException(status_code=400, detail="End date must be after start date")
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
            
            await validate_fy_no_overlap(fy['organization_id'], new_start, new_end, exclude_fy_id=fy_id)
        
        await db.fiscal_years.update_one({'id': fy_id}, {'$set': update_data})
    
    updated_fy = await db.fiscal_years.find_one({'id': fy_id}, {'_id': 0})
    return FiscalYearResponse(**updated_fy)

@api_router.delete("/fiscal-years/{fy_id}")
async def delete_fiscal_year(fy_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a fiscal year (only if open and no posted vouchers in range)"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Only admins can manage fiscal years")
    
    fy = await db.fiscal_years.find_one({'id': fy_id}, {'_id': 0})
    if not fy:
        raise HTTPException(status_code=404, detail="Fiscal year not found")
    
    if fy['status'] == 'closed':
        raise HTTPException(status_code=400, detail="Cannot delete a closed fiscal year")
    
    # Check if any posted vouchers exist in this FY range
    voucher_count = await db.vouchers.count_documents({
        'organization_id': fy['organization_id'],
        'is_posted': True,
        'date': {'$gte': fy['start_date'], '$lte': fy['end_date']}
    })
    
    if voucher_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete fiscal year with {voucher_count} posted voucher(s). Unpost or move vouchers first."
        )
    
    await db.fiscal_years.delete_one({'id': fy_id})
    return {"message": "Fiscal year deleted successfully"}

@api_router.post("/fiscal-years/{fy_id}/close", response_model=FiscalYearCloseResponse)
async def close_fiscal_year(fy_id: str, current_user: dict = Depends(get_current_user)):
    """Close a fiscal year - generates closing entries and locks the FY"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Only admins can close fiscal years")
    
    fy = await db.fiscal_years.find_one({'id': fy_id}, {'_id': 0})
    if not fy:
        raise HTTPException(status_code=404, detail="Fiscal year not found")
    
    if fy['status'] == 'closed':
        raise HTTPException(status_code=400, detail="Fiscal year is already closed")
    
    org_id = fy['organization_id']
    
    # Use MongoDB aggregation to compute P&L account movements efficiently
    pipeline = [
        {'$match': {
            'organization_id': org_id,
            'is_posted': True,
            'date': {'$gte': fy['start_date'], '$lte': fy['end_date']}
        }},
        {'$unwind': '$lines'},
        {'$match': {'lines.account_code': {'$regex': '^[67]'}}},
        {'$group': {
            '_id': '$lines.account_code',
            'total_debit_lbp': {'$sum': {'$ifNull': ['$lines.debit_lbp', 0]}},
            'total_credit_lbp': {'$sum': {'$ifNull': ['$lines.credit_lbp', 0]}},
            'total_debit_usd': {'$sum': {'$ifNull': ['$lines.debit_usd', 0]}},
            'total_credit_usd': {'$sum': {'$ifNull': ['$lines.credit_usd', 0]}}
        }}
    ]
    
    account_movements = {}
    revenue_totals_lbp = 0
    revenue_totals_usd = 0
    expense_totals_lbp = 0
    expense_totals_usd = 0
    
    async for result in db.vouchers.aggregate(pipeline):
        code = result['_id']
        net_lbp = result['total_debit_lbp'] - result['total_credit_lbp']
        net_usd = result['total_debit_usd'] - result['total_credit_usd']
        account_movements[code] = {'lbp': net_lbp, 'usd': net_usd}
        
        if code.startswith('7'):
            revenue_totals_lbp += result['total_credit_lbp'] - result['total_debit_lbp']
            revenue_totals_usd += result['total_credit_usd'] - result['total_debit_usd']
        elif code.startswith('6'):
            expense_totals_lbp += result['total_debit_lbp'] - result['total_credit_lbp']
            expense_totals_usd += result['total_debit_usd'] - result['total_credit_usd']
    
    net_income_lbp = revenue_totals_lbp - expense_totals_lbp
    net_income_usd = revenue_totals_usd - expense_totals_usd
    
    closing_voucher_id = None
    
    # Only create closing voucher if there are P&L amounts to close
    if revenue_totals_lbp != 0 or revenue_totals_usd != 0 or expense_totals_lbp != 0 or expense_totals_usd != 0:
        # Create closing voucher
        closing_voucher_id = str(uuid.uuid4())
        closing_voucher_number = await generate_voucher_number('JV', org_id)
        
        closing_lines = []
        
        # Create lines to zero out each P&L account (using aggregated movements)
        for code, movement in account_movements.items():
            if movement['lbp'] != 0 or movement['usd'] != 0:
                # Reverse the movement to zero it out
                closing_lines.append({
                    'account_code': code,
                    'description': f'Year-end closing - {fy["name"]}',
                    'debit_lbp': abs(movement['lbp']) if movement['lbp'] < 0 else 0,
                    'credit_lbp': movement['lbp'] if movement['lbp'] > 0 else 0,
                    'debit_usd': abs(movement['usd']) if movement['usd'] < 0 else 0,
                    'credit_usd': movement['usd'] if movement['usd'] > 0 else 0,
                    'exchange_rate': 89500
                })
        
        # Add Retained Earnings (120) line to balance
        re_debit_lbp = 0
        re_credit_lbp = 0
        re_debit_usd = 0
        re_credit_usd = 0
        
        for line in closing_lines:
            re_debit_lbp += line['credit_lbp']
            re_credit_lbp += line['debit_lbp']
            re_debit_usd += line['credit_usd']
            re_credit_usd += line['debit_usd']
        
        net_re_lbp = re_debit_lbp - re_credit_lbp
        net_re_usd = re_debit_usd - re_credit_usd
        
        if net_re_lbp != 0 or net_re_usd != 0:
            closing_lines.append({
                'account_code': '120',
                'description': f'Year-end closing to Retained Earnings - {fy["name"]}',
                'debit_lbp': net_re_lbp if net_re_lbp > 0 else 0,
                'credit_lbp': abs(net_re_lbp) if net_re_lbp < 0 else 0,
                'debit_usd': net_re_usd if net_re_usd > 0 else 0,
                'credit_usd': abs(net_re_usd) if net_re_usd < 0 else 0,
                'exchange_rate': 89500
            })
        
        # Calculate totals
        total_debit_lbp = sum(l['debit_lbp'] for l in closing_lines)
        total_credit_lbp = sum(l['credit_lbp'] for l in closing_lines)
        total_debit_usd = sum(l['debit_usd'] for l in closing_lines)
        total_credit_usd = sum(l['credit_usd'] for l in closing_lines)
        
        closing_voucher_doc = {
            'id': closing_voucher_id,
            'voucher_number': closing_voucher_number,
            'voucher_type': 'JV',
            'date': fy['end_date'],
            'reference': f'FY-CLOSE-{fy["name"]}',
            'description': f'Year-end closing entries for {fy["name"]}',
            'lines': closing_lines,
            'total_debit_lbp': total_debit_lbp,
            'total_credit_lbp': total_credit_lbp,
            'total_debit_usd': total_debit_usd,
            'total_credit_usd': total_credit_usd,
            'is_posted': True,
            'status': 'posted',
            'organization_id': org_id,
            'source_type': 'fy_closing',
            'source_id': fy_id,
            'created_by': current_user['id'],
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        await db.vouchers.insert_one(closing_voucher_doc)
        
        # Update account balances for closing entries
        for line in closing_lines:
            debit_lbp = line.get('debit_lbp', 0) or 0
            credit_lbp = line.get('credit_lbp', 0) or 0
            debit_usd = line.get('debit_usd', 0) or 0
            credit_usd = line.get('credit_usd', 0) or 0
            net_lbp = debit_lbp - credit_lbp
            net_usd = debit_usd - credit_usd
            
            if net_lbp != 0 or net_usd != 0:
                await db.accounts.update_one(
                    {'code': line['account_code'], 'organization_id': org_id},
                    {'$inc': {'balance_lbp': net_lbp, 'balance_usd': net_usd}}
                )
    
    # Mark FY as closed
    await db.fiscal_years.update_one({'id': fy_id}, {'$set': {
        'status': 'closed',
        'closed_at': datetime.now(timezone.utc).isoformat(),
        'closed_by': current_user['id'],
        'closing_voucher_id': closing_voucher_id
    }})
    
    return FiscalYearCloseResponse(
        message=f"Fiscal year '{fy['name']}' closed successfully",
        fiscal_year_id=fy_id,
        closing_voucher_id=closing_voucher_id,
        net_income_lbp=net_income_lbp,
        net_income_usd=net_income_usd,
        revenue_total_lbp=revenue_totals_lbp,
        revenue_total_usd=revenue_totals_usd,
        expense_total_lbp=expense_totals_lbp,
        expense_total_usd=expense_totals_usd
    )

@api_router.post("/fiscal-years/{fy_id}/reopen")
async def reopen_fiscal_year(fy_id: str, current_user: dict = Depends(get_current_user)):
    """Reopen a closed fiscal year (super_admin only) - reverses closing entries"""
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can reopen fiscal years")
    
    fy = await db.fiscal_years.find_one({'id': fy_id}, {'_id': 0})
    if not fy:
        raise HTTPException(status_code=404, detail="Fiscal year not found")
    
    if fy['status'] != 'closed':
        raise HTTPException(status_code=400, detail="Fiscal year is not closed")
    
    # Remove closing voucher and reverse account updates
    if fy.get('closing_voucher_id'):
        closing_voucher = await db.vouchers.find_one({'id': fy['closing_voucher_id']}, {'_id': 0})
        if closing_voucher:
            # Reverse account balance changes
            for line in closing_voucher.get('lines', []):
                debit_lbp = line.get('debit_lbp', 0) or 0
                credit_lbp = line.get('credit_lbp', 0) or 0
                debit_usd = line.get('debit_usd', 0) or 0
                credit_usd = line.get('credit_usd', 0) or 0
                net_lbp = -(debit_lbp - credit_lbp)
                net_usd = -(debit_usd - credit_usd)
                
                if net_lbp != 0 or net_usd != 0:
                    await db.accounts.update_one(
                        {'code': line['account_code'], 'organization_id': fy['organization_id']},
                        {'$inc': {'balance_lbp': net_lbp, 'balance_usd': net_usd}}
                    )
            
            await db.vouchers.delete_one({'id': fy['closing_voucher_id']})
    
    # Mark FY as open
    await db.fiscal_years.update_one({'id': fy_id}, {'$set': {
        'status': 'open',
        'closed_at': None,
        'closed_by': None,
        'closing_voucher_id': None
    }})
    
    return {"message": f"Fiscal year '{fy['name']}' reopened successfully"}


# ================== SEED DATA ==================

@api_router.post("/seed")
async def seed_demo_data():
    """Seed database with initial super admin user. Creates admin if no users exist."""
    
    # Check if any users exist
    user_count = await db.users.count_documents({})
    
    if user_count > 0:
        # Users exist - try to find/update the super admin
        admin = await db.users.find_one({'email': 'carlo.mitri@gmail.com'})
        if admin:
            # Update password to ensure it matches
            await db.users.update_one(
                {'email': 'carlo.mitri@gmail.com'},
                {'$set': {'password': hash_password('Carinemi@28')}}
            )
            return {
                "message": "Admin account updated",
                "admin_email": "carlo.mitri@gmail.com",
                "admin_password": "Carinemi@28"
            }
        
        # Also check for old admin email and update it
        old_admin = await db.users.find_one({'role': 'super_admin'})
        if old_admin:
            await db.users.update_one(
                {'id': old_admin['id']},
                {'$set': {
                    'email': 'carlo.mitri@gmail.com',
                    'password': hash_password('Carinemi@28'),
                    'name': 'Super Admin'
                }}
            )
            return {
                "message": "Admin account updated",
                "admin_email": "carlo.mitri@gmail.com",
                "admin_password": "Carinemi@28"
            }
    
    # No users exist - create fresh super admin + default org
    org_id = str(uuid.uuid4())
    org_doc = {
        'id': org_id,
        'name': 'My Organization',
        'currency': 'USD',
        'base_exchange_rate': 89500,
        'tax_percent': 11,
        'tax_name': 'VAT',
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.organizations.insert_one(org_doc)
    
    admin_id = str(uuid.uuid4())
    admin_user = {
        'id': admin_id,
        'email': 'carlo.mitri@gmail.com',
        'password': hash_password('Carinemi@28'),
        'name': 'Super Admin',
        'role': 'super_admin',
        'organization_id': org_id,
        'is_active': True,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(admin_user)
    
    return {
        "message": "Super admin created successfully",
        "admin_email": "carlo.mitri@gmail.com",
        "admin_password": "Carinemi@28"
    }
    
    # Create organizations
    org1_id = str(uuid.uuid4())
    org2_id = str(uuid.uuid4())
    
    orgs = [
        {
            'id': org1_id,
            'name': 'Beirut Trading Co.',
            'currency': 'LBP',
            'base_exchange_rate': 89500,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': org2_id,
            'name': 'Mount Lebanon Services',
            'currency': 'USD',
            'base_exchange_rate': 89500,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.organizations.insert_many(orgs)
    
    # Create super admin user
    admin_id = str(uuid.uuid4())
    admin_user = {
        'id': admin_id,
        'email': 'carlo.mitri@gmail.com',
        'password': hash_password('Carinemi@28'),
        'name': 'Super Admin',
        'role': 'super_admin',
        'organization_id': org1_id,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(admin_user)
    
    # Create additional users
    users = [
        {
            'id': str(uuid.uuid4()),
            'email': 'accountant@lebfinance.com',
            'password': hash_password('accountant123'),
            'name': 'Ahmad Khalil',
            'role': 'accountant',
            'organization_id': org1_id,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'email': 'viewer@lebfinance.com',
            'password': hash_password('viewer123'),
            'name': 'Sara Haddad',
            'role': 'viewer',
            'organization_id': org1_id,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.users.insert_many(users)
    
    # Lebanese Chart of Accounts (LCOA) - Classes 1-7
    accounts = [
        # Class 1 - Capital Accounts
        {'id': str(uuid.uuid4()), 'code': '101', 'name': 'Capital', 'name_ar': 'رأس المال', 'account_class': 1, 'account_type': 'equity', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '106', 'name': 'Reserves', 'name_ar': 'الاحتياطيات', 'account_class': 1, 'account_type': 'equity', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '120', 'name': 'Retained Earnings', 'name_ar': 'الأرباح المحتجزة', 'account_class': 1, 'account_type': 'equity', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        
        # Class 2 - Fixed Assets
        {'id': str(uuid.uuid4()), 'code': '211', 'name': 'Land', 'name_ar': 'الأراضي', 'account_class': 2, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '213', 'name': 'Buildings', 'name_ar': 'المباني', 'account_class': 2, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '215', 'name': 'Equipment', 'name_ar': 'المعدات', 'account_class': 2, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '218', 'name': 'Vehicles', 'name_ar': 'المركبات', 'account_class': 2, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        
        # Class 3 - Inventory
        {'id': str(uuid.uuid4()), 'code': '310', 'name': 'Raw Materials', 'name_ar': 'المواد الخام', 'account_class': 3, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '355', 'name': 'Finished Goods', 'name_ar': 'البضائع الجاهزة', 'account_class': 3, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        
        # Class 4 - Third Party Accounts
        {'id': str(uuid.uuid4()), 'code': '401', 'name': 'Suppliers', 'name_ar': 'الموردون', 'account_class': 4, 'account_type': 'liability', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '411', 'name': 'Customers', 'name_ar': 'العملاء', 'account_class': 4, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '421', 'name': 'Employees', 'name_ar': 'الموظفون', 'account_class': 4, 'account_type': 'liability', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '442', 'name': 'VAT Collectible', 'name_ar': 'ضريبة القيمة المضافة المحصلة', 'account_class': 4, 'account_type': 'liability', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '443', 'name': 'VAT Deductible', 'name_ar': 'ضريبة القيمة المضافة القابلة للخصم', 'account_class': 4, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        
        # Class 5 - Financial Accounts
        {'id': str(uuid.uuid4()), 'code': '512', 'name': 'Bank - LBP', 'name_ar': 'البنك - ليرة', 'account_class': 5, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '513', 'name': 'Bank - USD', 'name_ar': 'البنك - دولار', 'account_class': 5, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '530', 'name': 'Cash - LBP', 'name_ar': 'الصندوق - ليرة', 'account_class': 5, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '531', 'name': 'Cash - USD', 'name_ar': 'الصندوق - دولار', 'account_class': 5, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        
        # Class 6 - Expenses
        {'id': str(uuid.uuid4()), 'code': '601', 'name': 'Purchases', 'name_ar': 'المشتريات', 'account_class': 6, 'account_type': 'expense', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '613', 'name': 'Transportation', 'name_ar': 'النقل', 'account_class': 6, 'account_type': 'expense', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '616', 'name': 'Insurance', 'name_ar': 'التأمين', 'account_class': 6, 'account_type': 'expense', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '626', 'name': 'Telecommunications', 'name_ar': 'الاتصالات', 'account_class': 6, 'account_type': 'expense', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '640', 'name': 'Salaries', 'name_ar': 'الرواتب', 'account_class': 6, 'account_type': 'expense', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '661', 'name': 'Interest Expense', 'name_ar': 'مصاريف الفوائد', 'account_class': 6, 'account_type': 'expense', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '681', 'name': 'Depreciation', 'name_ar': 'الإهلاك', 'account_class': 6, 'account_type': 'expense', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        
        # Class 7 - Revenue
        {'id': str(uuid.uuid4()), 'code': '701', 'name': 'Sales', 'name_ar': 'المبيعات', 'account_class': 7, 'account_type': 'revenue', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '706', 'name': 'Service Revenue', 'name_ar': 'إيرادات الخدمات', 'account_class': 7, 'account_type': 'revenue', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '761', 'name': 'Interest Income', 'name_ar': 'إيرادات الفوائد', 'account_class': 7, 'account_type': 'revenue', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '771', 'name': 'Other Income', 'name_ar': 'إيرادات أخرى', 'account_class': 7, 'account_type': 'revenue', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        
        # Movable Accounts (5+ digits) - Sub-accounts for transactions
        {'id': str(uuid.uuid4()), 'code': '40101', 'name': 'Supplier - ABC Corp', 'name_ar': 'مورد - شركة أ ب ج', 'account_class': 4, 'account_type': 'liability', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '40102', 'name': 'Supplier - XYZ Ltd', 'name_ar': 'مورد - شركة س ع ص', 'account_class': 4, 'account_type': 'liability', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '41101', 'name': 'Customer - Ahmad Trading', 'name_ar': 'عميل - أحمد للتجارة', 'account_class': 4, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '41102', 'name': 'Customer - Beirut Services', 'name_ar': 'عميل - خدمات بيروت', 'account_class': 4, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '51201', 'name': 'Bank of Beirut - LBP', 'name_ar': 'بنك بيروت - ليرة', 'account_class': 5, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '51301', 'name': 'Bank of Beirut - USD', 'name_ar': 'بنك بيروت - دولار', 'account_class': 5, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '53001', 'name': 'Petty Cash - LBP', 'name_ar': 'صندوق النثرية - ليرة', 'account_class': 5, 'account_type': 'asset', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '60101', 'name': 'Purchases - Raw Materials', 'name_ar': 'مشتريات - مواد خام', 'account_class': 6, 'account_type': 'expense', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '64001', 'name': 'Salaries - Staff', 'name_ar': 'رواتب - موظفين', 'account_class': 6, 'account_type': 'expense', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '70101', 'name': 'Sales - Products', 'name_ar': 'مبيعات - منتجات', 'account_class': 7, 'account_type': 'revenue', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
        {'id': str(uuid.uuid4()), 'code': '70102', 'name': 'Sales - Services', 'name_ar': 'مبيعات - خدمات', 'account_class': 7, 'account_type': 'revenue', 'organization_id': org1_id, 'balance_lbp': 0, 'balance_usd': 0, 'is_active': True},
    ]
    
    # Insert accounts (without _id to let MongoDB generate new ones)
    for acc in accounts:
        acc_copy = {k: v for k, v in acc.items() if k != '_id'}
        await db.accounts.insert_one(acc_copy)
    
    # Copy accounts to second organization
    for acc in accounts:
        new_acc = {k: v for k, v in acc.items() if k != '_id'}
        new_acc['id'] = str(uuid.uuid4())
        new_acc['organization_id'] = org2_id
        await db.accounts.insert_one(new_acc)
    
    # Add sample exchange rates
    exchange_rates = [
        {'id': str(uuid.uuid4()), 'date': '2024-12-01', 'rate': 89500, 'source': 'manual', 'organization_id': org1_id, 'created_at': datetime.now(timezone.utc).isoformat()},
        {'id': str(uuid.uuid4()), 'date': '2024-12-15', 'rate': 89750, 'source': 'manual', 'organization_id': org1_id, 'created_at': datetime.now(timezone.utc).isoformat()},
        {'id': str(uuid.uuid4()), 'date': '2024-12-20', 'rate': 89500, 'source': 'api', 'organization_id': org1_id, 'created_at': datetime.now(timezone.utc).isoformat()},
    ]
    await db.exchange_rates.insert_many(exchange_rates)
    
    # Create sample vouchers
    voucher1_id = str(uuid.uuid4())
    voucher1 = {
        'id': voucher1_id,
        'voucher_number': 'JV-2024-00001',
        'voucher_type': 'JV',
        'date': '2024-12-01',
        'reference': 'INIT-001',
        'description': 'Initial capital contribution',
        'currency': 'LBP',
        'exchange_rate': 89500,
        'lines': [
            {'account_code': '512', 'account_name': 'Bank - LBP', 'debit_lbp': 500000000, 'credit_lbp': 0, 'debit_usd': 0, 'credit_usd': 0},
            {'account_code': '101', 'account_name': 'Capital', 'debit_lbp': 0, 'credit_lbp': 500000000, 'debit_usd': 0, 'credit_usd': 0}
        ],
        'total_debit_lbp': 500000000,
        'total_credit_lbp': 500000000,
        'total_debit_usd': 0,
        'total_credit_usd': 0,
        'is_posted': True,
        'organization_id': org1_id,
        'created_by': admin_id,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.vouchers.insert_one(voucher1)
    
    voucher2_id = str(uuid.uuid4())
    voucher2 = {
        'id': voucher2_id,
        'voucher_number': 'RV-2024-00001',
        'voucher_type': 'RV',
        'date': '2024-12-05',
        'reference': 'INV-1001',
        'description': 'Sales revenue collection',
        'currency': 'USD',
        'exchange_rate': 89500,
        'lines': [
            {'account_code': '513', 'account_name': 'Bank - USD', 'debit_lbp': 0, 'credit_lbp': 0, 'debit_usd': 5000, 'credit_usd': 0},
            {'account_code': '701', 'account_name': 'Sales', 'debit_lbp': 0, 'credit_lbp': 0, 'debit_usd': 0, 'credit_usd': 5000}
        ],
        'total_debit_lbp': 0,
        'total_credit_lbp': 0,
        'total_debit_usd': 5000,
        'total_credit_usd': 5000,
        'is_posted': True,
        'organization_id': org1_id,
        'created_by': admin_id,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.vouchers.insert_one(voucher2)
    
    voucher3_id = str(uuid.uuid4())
    voucher3 = {
        'id': voucher3_id,
        'voucher_number': 'PV-2024-00001',
        'voucher_type': 'PV',
        'date': '2024-12-10',
        'reference': 'PAY-001',
        'description': 'Office rent payment',
        'currency': 'USD',
        'exchange_rate': 89500,
        'lines': [
            {'account_code': '616', 'account_name': 'Insurance', 'debit_lbp': 0, 'credit_lbp': 0, 'debit_usd': 500, 'credit_usd': 0},
            {'account_code': '513', 'account_name': 'Bank - USD', 'debit_lbp': 0, 'credit_lbp': 0, 'debit_usd': 0, 'credit_usd': 500}
        ],
        'total_debit_lbp': 0,
        'total_credit_lbp': 0,
        'total_debit_usd': 500,
        'total_credit_usd': 500,
        'is_posted': True,
        'organization_id': org1_id,
        'created_by': admin_id,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.vouchers.insert_one(voucher3)
    
    # Update account balances for posted vouchers
    await db.accounts.update_one({'code': '512', 'organization_id': org1_id}, {'$set': {'balance_lbp': 500000000}})
    await db.accounts.update_one({'code': '101', 'organization_id': org1_id}, {'$set': {'balance_lbp': -500000000}})
    await db.accounts.update_one({'code': '513', 'organization_id': org1_id}, {'$set': {'balance_usd': 4500}})
    await db.accounts.update_one({'code': '701', 'organization_id': org1_id}, {'$set': {'balance_usd': -5000}})
    await db.accounts.update_one({'code': '616', 'organization_id': org1_id}, {'$set': {'balance_usd': 500}})
    
    return {
        "message": "Demo data seeded successfully",
        "organizations": [org1_id, org2_id],
        "admin_email": "carlo.mitri@gmail.com",
        "admin_password": "Carinemi@28"
    }

# ================== IMAGE ARCHIVE ==================

class ImageArchiveCreate(BaseModel):
    title: str
    description: Optional[str] = None
    date: str
    time: str
    organization_id: str

class ImageArchiveUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None

class ImageArchiveResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    description: Optional[str] = None
    date: str
    time: str
    filename: str
    original_filename: str
    content_type: str
    file_size: int
    organization_id: str
    created_by: str
    created_at: str
    updated_at: Optional[str] = None

# Create uploads subdirectory for archive
ARCHIVE_DIR = UPLOADS_DIR / "archive"
ARCHIVE_DIR.mkdir(exist_ok=True)

@api_router.get("/image-archive", response_model=List[ImageArchiveResponse])
async def get_image_archive(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Get all archived images for an organization"""
    images = await db.image_archive.find(
        {'organization_id': organization_id},
        {'_id': 0}
    ).sort('date', -1).to_list(1000)
    return [ImageArchiveResponse(**img) for img in images]

@api_router.get("/image-archive/{image_id}", response_model=ImageArchiveResponse)
async def get_archive_image(image_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single archived image"""
    image = await db.image_archive.find_one({'id': image_id}, {'_id': 0})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    return ImageArchiveResponse(**image)

@api_router.post("/image-archive", response_model=ImageArchiveResponse)
async def create_archive_image(
    title: str = Form(...),
    date: str = Form(...),
    time: str = Form(...),
    organization_id: str = Form(...),
    description: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload and archive a new image"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Validate file type
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: JPEG, PNG, GIF, WebP, PDF")
    
    # Generate unique filename
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'bin'
    image_id = str(uuid.uuid4())
    filename = f"{image_id}.{ext}"
    filepath = ARCHIVE_DIR / filename
    
    # Save file
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    
    # Create database record
    image_doc = {
        'id': image_id,
        'title': title,
        'description': description,
        'date': date,
        'time': time,
        'filename': filename,
        'original_filename': file.filename,
        'content_type': file.content_type,
        'file_size': len(content),
        'organization_id': organization_id,
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.image_archive.insert_one(image_doc)
    return ImageArchiveResponse(**image_doc)

@api_router.put("/image-archive/{image_id}", response_model=ImageArchiveResponse)
async def update_archive_image(
    image_id: str,
    update_data: ImageArchiveUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update archived image details"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    image = await db.image_archive.find_one({'id': image_id}, {'_id': 0})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    update_doc = {}
    if update_data.title is not None:
        update_doc['title'] = update_data.title
    if update_data.description is not None:
        update_doc['description'] = update_data.description
    if update_data.date is not None:
        update_doc['date'] = update_data.date
    if update_data.time is not None:
        update_doc['time'] = update_data.time
    
    if update_doc:
        update_doc['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.image_archive.update_one({'id': image_id}, {'$set': update_doc})
    
    updated = await db.image_archive.find_one({'id': image_id}, {'_id': 0})
    return ImageArchiveResponse(**updated)

@api_router.delete("/image-archive/{image_id}")
async def delete_archive_image(image_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an archived image"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    image = await db.image_archive.find_one({'id': image_id}, {'_id': 0})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Delete the file
    filepath = ARCHIVE_DIR / image['filename']
    if filepath.exists():
        filepath.unlink()
    
    await db.image_archive.delete_one({'id': image_id})
    return {"message": "Image deleted successfully"}


class TransferToCrDbRequest(BaseModel):
    note_type: Literal['credit', 'debit', 'dbcr']
    debit_account_code: str
    debit_account_name: str
    credit_account_code: str
    credit_account_name: str
    currency: str = 'USD'
    amount: float
    exchange_rate: float = 1.0
    description: str
    date: Optional[str] = None
    delete_from_archive: bool = True


@api_router.post("/image-archive/{image_id}/transfer-to-crdb")
async def transfer_image_to_crdb(
    image_id: str, 
    transfer_data: TransferToCrDbRequest,
    current_user: dict = Depends(get_current_user)
):
    """Transfer an image from archive to a Cr/Db Note as attachment"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Get the archived image
    image = await db.image_archive.find_one({'id': image_id}, {'_id': 0})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Get organization ID from image
    organization_id = image.get('organization_id')
    if not organization_id:
        raise HTTPException(status_code=400, detail="Image has no organization")
    
    # Generate note number based on type
    year = datetime.now().year
    if transfer_data.note_type == 'credit':
        prefix = f"CN-{year}-"
    elif transfer_data.note_type == 'dbcr':
        prefix = f"DBCR-{year}-"
    else:
        prefix = f"DN-{year}-"
    
    last_note = await db.crdb_notes.find_one(
        {'organization_id': organization_id, 'note_number': {'$regex': f'^{prefix}'}},
        {'note_number': 1},
        sort=[('note_number', -1)]
    )
    if last_note:
        last_num = int(last_note['note_number'].split('-')[-1])
        note_number = f"{prefix}{last_num + 1:05d}"
    else:
        note_number = f"{prefix}00001"
    
    # Copy image file to crdb_attachments folder
    source_path = ARCHIVE_DIR / image['filename']
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
    
    # Create crdb attachments directory if not exists
    crdb_attachments_dir = Path("/app/uploads/crdb_attachments")
    crdb_attachments_dir.mkdir(exist_ok=True)
    
    # Generate new filename for attachment
    import shutil
    new_filename = f"{note_number}_{image['filename']}"
    dest_path = crdb_attachments_dir / new_filename
    shutil.copy2(source_path, dest_path)
    
    # Create the Cr/Db note
    note_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    note_date = transfer_data.date or now.strftime('%Y-%m-%d')
    
    # Calculate amounts in both currencies
    if transfer_data.currency == 'USD':
        amount_usd = transfer_data.amount
        amount_lbp = transfer_data.amount * transfer_data.exchange_rate
    else:
        amount_lbp = transfer_data.amount
        amount_usd = transfer_data.amount / transfer_data.exchange_rate
    
    note_doc = {
        'id': note_id,
        'note_number': note_number,
        'note_type': transfer_data.note_type,
        'date': note_date,
        'account_id': '',  # Will be set based on note type
        'account_code': transfer_data.debit_account_code if transfer_data.note_type == 'debit' else transfer_data.credit_account_code,
        'account_name': transfer_data.debit_account_name if transfer_data.note_type == 'debit' else transfer_data.credit_account_name,
        'debit_account_code': transfer_data.debit_account_code,
        'debit_account_name': transfer_data.debit_account_name,
        'credit_account_code': transfer_data.credit_account_code,
        'credit_account_name': transfer_data.credit_account_name,
        'currency': transfer_data.currency,
        'amount': transfer_data.amount,
        'amount_usd': amount_usd,
        'amount_lbp': amount_lbp,
        'exchange_rate': transfer_data.exchange_rate,
        'reason': transfer_data.description,
        'description': transfer_data.description,
        'reference': f"Transferred from Image Archive",
        'status': 'draft',
        'attachments': [{
            'id': str(uuid.uuid4()),
            'filename': new_filename,
            'original_filename': image.get('original_filename', image['filename']),
            'content_type': image.get('content_type', 'application/octet-stream'),
            'size': image.get('size', 0),
            'uploaded_at': now.isoformat(),
            'uploaded_by': current_user['id'],
            'source': 'image_archive',
            'source_id': image_id
        }],
        'is_posted': False,
        'organization_id': organization_id,
        'created_at': now.isoformat(),
        'created_by': current_user['id']
    }
    
    await db.crdb_notes.insert_one(note_doc)
    
    # Delete from archive if requested
    if transfer_data.delete_from_archive:
        # Delete the file from archive
        if source_path.exists():
            source_path.unlink()
        await db.image_archive.delete_one({'id': image_id})
    
    return {
        "message": "Cr/Db Note created successfully",
        "note_id": note_id,
        "note_number": note_number,
        "delete_from_archive": transfer_data.delete_from_archive
    }


@api_router.delete("/image-archive/{image_id}/after-crdb-post")
async def delete_archive_after_crdb_post(
    image_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an archived image after its Cr/Db note has been posted"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    image = await db.image_archive.find_one({'id': image_id}, {'_id': 0})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Delete the file from archive
    filepath = ARCHIVE_DIR / image['filename']
    if filepath.exists():
        filepath.unlink()
    
    await db.image_archive.delete_one({'id': image_id})
    return {"message": "Image deleted from archive successfully"}

@api_router.get("/image-archive/file/{filename}")
async def get_archive_file(filename: str):
    """Get the archived image file (public endpoint for img tags)"""
    from urllib.parse import unquote
    import mimetypes
    import hashlib
    
    decoded_filename = unquote(filename)
    filepath = ARCHIVE_DIR / decoded_filename
    
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine media type
    media_type, _ = mimetypes.guess_type(str(filepath))
    if not media_type:
        media_type = "application/octet-stream"
    
    # Generate ETag for caching
    file_stat = filepath.stat()
    etag = hashlib.md5(f"{filepath}{file_stat.st_mtime}".encode()).hexdigest()
    
    return FileResponse(
        filepath, 
        media_type=media_type,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": f"inline; filename=\"{decoded_filename}\"",
            "ETag": f'"{etag}"',
            "X-Content-Type-Options": "nosniff"
        }
    )

@api_router.get("/image-archive/download/{image_id}")
async def download_archive_image(image_id: str, current_user: dict = Depends(get_current_user)):
    """Download an archived image with original filename"""
    image = await db.image_archive.find_one({'id': image_id}, {'_id': 0})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    filepath = ARCHIVE_DIR / image['filename']
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        filepath,
        filename=image['original_filename'],
        media_type=image['content_type']
    )

# ================== CREDIT/DEBIT NOTES ==================

class CrDbNoteCreate(BaseModel):
    note_type: Literal['credit', 'debit', 'dbcr']
    date: str
    debit_account_code: str
    debit_account_name: str
    credit_account_code: str
    credit_account_name: str
    currency: str
    amount: float
    exchange_rate: float = 1.0
    description: str
    organization_id: str

class CrDbNoteUpdate(BaseModel):
    note_type: Literal['credit', 'debit', 'dbcr']
    date: str
    debit_account_id: str
    credit_account_id: str
    currency: str
    amount: float
    exchange_rate: float = 1.0
    description: str
    organization_id: str

class CrDbNoteResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    note_number: str
    note_type: str
    date: str
    debit_account_code: str
    debit_account_name: str
    credit_account_code: str
    credit_account_name: str
    currency: str
    amount: float
    amount_lbp: float
    amount_usd: float
    exchange_rate: float
    description: str
    attachments: List[dict] = []
    is_posted: bool
    organization_id: str
    created_by: str
    created_at: str
    voucher_id: Optional[str] = None

async def generate_note_number(note_type: str, organization_id: str) -> str:
    """
    Generate next note number for DBCR based on organization's invoice_series settings.
    Falls back to default format if no custom settings exist.
    """
    year = datetime.now().year
    
    # Determine default prefix based on note_type
    if note_type == 'credit':
        default_prefix = 'CN-'
    elif note_type == 'dbcr':
        default_prefix = 'DC-'
    else:
        default_prefix = 'DN-'
    
    # Get organization settings
    org = await db.organizations.find_one({'id': organization_id}, {'invoice_series': 1})
    series_settings = org.get('invoice_series', {}).get('dbcr', {}) if org else {}
    
    # Get prefix from settings or use default based on note_type
    # If custom prefix is set, use it; otherwise use default based on type
    custom_prefix = series_settings.get('prefix')
    if custom_prefix:
        prefix = custom_prefix
    else:
        prefix = default_prefix
    
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
    
    # Find the last note with this prefix pattern
    last_note = await db.crdb_notes.find_one(
        {
            'organization_id': organization_id,
            'note_number': {'$regex': f'^{escaped_prefix}'}
        },
        sort=[('note_number', -1)]
    )
    
    # Determine next number
    if last_note:
        try:
            last_num_str = last_note['note_number'].replace(full_prefix, '')
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

@api_router.get("/crdb-notes", response_model=List[CrDbNoteResponse])
async def get_crdb_notes(
    organization_id: str,
    note_type: Optional[str] = None,  # 'debit', 'credit', 'dbcr'
    status: Optional[str] = None,  # 'posted', 'draft', 'all'
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    current_user: dict = Depends(get_current_user)
):
    """Get credit/debit notes with search, filters and pagination"""
    query = {'organization_id': organization_id}
    
    if note_type:
        query['note_type'] = note_type
    
    if status == 'posted':
        query['status'] = 'posted'
    elif status == 'draft':
        query['status'] = {'$ne': 'posted'}
    
    if date_from:
        query['date'] = {'$gte': date_from}
    if date_to:
        if 'date' in query:
            query['date']['$lte'] = date_to
        else:
            query['date'] = {'$lte': date_to}
    
    # Server-side search using MongoDB $regex
    if search:
        search_regex = {'$regex': search, '$options': 'i'}
        query['$or'] = [
            {'note_number': search_regex},
            {'description': search_regex},
            {'debit_account_code': search_regex},
            {'debit_account_name': search_regex},
            {'credit_account_code': search_regex},
            {'credit_account_name': search_regex}
        ]
    
    notes = await db.crdb_notes.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    
    # Convert notes to response format, handling missing fields
    result = []
    for note in notes:
        try:
            # Ensure required fields exist with defaults
            if 'amount_usd' not in note:
                note['amount_usd'] = note.get('amount', 0) if note.get('currency') == 'USD' else 0
            if 'amount_lbp' not in note:
                note['amount_lbp'] = note.get('amount', 0) if note.get('currency') == 'LBP' else 0
            if 'account_id' not in note:
                note['account_id'] = ''
            if 'reason' not in note:
                note['reason'] = note.get('description', '')
            if 'status' not in note:
                note['status'] = 'draft'
            
            result.append(CrDbNoteResponse(**note))
        except Exception as e:
            # Skip invalid notes
            logger.warning(f"Skipping invalid note {note.get('id', 'unknown')}: {str(e)}")
            continue
    
    return result

@api_router.get("/crdb-notes/count")
async def get_crdb_notes_count(
    organization_id: str,
    note_type: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get total count of crdb notes matching filters"""
    query = {'organization_id': organization_id}
    
    if note_type:
        query['note_type'] = note_type
    
    if status == 'posted':
        query['status'] = 'posted'
    elif status == 'draft':
        query['status'] = {'$ne': 'posted'}
    
    if date_from:
        query['date'] = {'$gte': date_from}
    if date_to:
        if 'date' in query:
            query['date']['$lte'] = date_to
        else:
            query['date'] = {'$lte': date_to}
    
    if search:
        search_regex = {'$regex': search, '$options': 'i'}
        query['$or'] = [
            {'note_number': search_regex},
            {'description': search_regex},
            {'debit_account_code': search_regex},
            {'credit_account_code': search_regex}
        ]
    
    count = await db.crdb_notes.count_documents(query)
    return {"count": count}

@api_router.post("/crdb-notes", response_model=CrDbNoteResponse)
async def create_crdb_note(note_data: CrDbNoteCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Get exchange rate for currency conversion
    base_rate = 89500  # Default LBP/USD rate
    try:
        rate_doc = await db.exchange_rates.find_one(
            {'organization_id': note_data.organization_id},
            sort=[('date', -1)]
        )
        if rate_doc:
            base_rate = rate_doc.get('rate', 89500)
    except:
        pass
    
    # Calculate amounts in both currencies
    if note_data.currency == 'LBP':
        amount_lbp = note_data.amount
        amount_usd = note_data.amount / base_rate
    elif note_data.currency == 'USD':
        amount_usd = note_data.amount
        amount_lbp = note_data.amount * base_rate
    else:
        # For other currencies, use the provided exchange rate
        amount_usd = note_data.amount * note_data.exchange_rate
        amount_lbp = amount_usd * base_rate
    
    note_id = str(uuid.uuid4())
    note_number = await generate_note_number(note_data.note_type, note_data.organization_id)
    
    note_doc = {
        'id': note_id,
        'note_number': note_number,
        'note_type': note_data.note_type,
        'date': note_data.date,
        'debit_account_code': note_data.debit_account_code,
        'debit_account_name': note_data.debit_account_name,
        'credit_account_code': note_data.credit_account_code,
        'credit_account_name': note_data.credit_account_name,
        'currency': note_data.currency,
        'amount': note_data.amount,
        'amount_lbp': amount_lbp,
        'amount_usd': amount_usd,
        'exchange_rate': note_data.exchange_rate,
        'description': note_data.description,
        'attachments': [],
        'is_posted': False,
        'organization_id': note_data.organization_id,
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.crdb_notes.insert_one(note_doc)
    return CrDbNoteResponse(**note_doc)

@api_router.post("/crdb-notes/{note_id}/attachment")
async def upload_note_attachment(
    note_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload an attachment (image or document) to a Cr/Db note"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    note = await db.crdb_notes.find_one({'id': note_id}, {'_id': 0})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Validate file type
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 
                     'application/pdf', 'application/msword',
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: images, PDF, Word documents")
    
    # Generate unique filename
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'bin'
    filename = f"{note_id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = UPLOADS_DIR / filename
    
    # Save file
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    
    # Update note with attachment info
    attachment = {
        'id': str(uuid.uuid4()),
        'filename': filename,
        'original_name': file.filename,
        'content_type': file.content_type,
        'size': len(content),
        'uploaded_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.crdb_notes.update_one(
        {'id': note_id},
        {'$push': {'attachments': attachment}}
    )
    
    return {"message": "Attachment uploaded successfully", "attachment": attachment}

@api_router.delete("/crdb-notes/{note_id}/attachment/{attachment_id}")
async def delete_note_attachment(
    note_id: str,
    attachment_id: str,
    current_user: dict = Depends(get_current_user)
):
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    note = await db.crdb_notes.find_one({'id': note_id}, {'_id': 0})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Find and remove attachment
    attachment = next((a for a in note.get('attachments', []) if a['id'] == attachment_id), None)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Delete file
    filepath = UPLOADS_DIR / attachment['filename']
    if filepath.exists():
        filepath.unlink()
    
    # Update note
    await db.crdb_notes.update_one(
        {'id': note_id},
        {'$pull': {'attachments': {'id': attachment_id}}}
    )
    
    return {"message": "Attachment deleted successfully"}

@api_router.get("/crdb-notes/attachment/{filename}")
async def get_attachment(filename: str):
    """Get attachment file (public endpoint for img tags)"""
    from urllib.parse import unquote
    import mimetypes
    import hashlib
    
    decoded_filename = unquote(filename)
    filepath = UPLOADS_DIR / decoded_filename
    
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine media type
    media_type, _ = mimetypes.guess_type(str(filepath))
    if not media_type:
        media_type = "application/octet-stream"
    
    # Generate ETag for caching
    file_stat = filepath.stat()
    etag = hashlib.md5(f"{filepath}{file_stat.st_mtime}".encode()).hexdigest()
    
    return FileResponse(
        filepath, 
        media_type=media_type,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": f"inline; filename=\"{decoded_filename}\"",
            "ETag": f'"{etag}"',
            "X-Content-Type-Options": "nosniff"
        }
    )

@api_router.post("/crdb-notes/{note_id}/post")
async def post_crdb_note(note_id: str, current_user: dict = Depends(get_current_user)):
    """Post a Cr/Db note - creates a voucher and updates account balances"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    note = await db.crdb_notes.find_one({'id': note_id}, {'_id': 0})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    if note['is_posted']:
        raise HTTPException(status_code=400, detail="Note already posted")
    
    # Create a voucher from the note
    voucher_type = 'DC'  # Debit/Credit Note voucher type
    voucher_number = await generate_voucher_number(voucher_type, note['organization_id'])
    voucher_id = str(uuid.uuid4())
    
    voucher_doc = {
        'id': voucher_id,
        'voucher_number': voucher_number,
        'voucher_type': voucher_type,
        'date': note['date'],
        'reference': note['note_number'],
        'description': f"{note['note_type'].upper()} NOTE: {note['description']}",
        'lines': [
            {
                'account_code': note['debit_account_code'],
                'account_name': note['debit_account_name'],
                'description': note['description'],
                'currency': note['currency'],
                'exchange_rate': note['exchange_rate'],
                'debit': note['amount'],
                'credit': 0,
                'debit_lbp': note['amount_lbp'],
                'credit_lbp': 0,
                'debit_usd': note['amount_usd'],
                'credit_usd': 0
            },
            {
                'account_code': note['credit_account_code'],
                'account_name': note['credit_account_name'],
                'description': note['description'],
                'currency': note['currency'],
                'exchange_rate': note['exchange_rate'],
                'debit': 0,
                'credit': note['amount'],
                'debit_lbp': 0,
                'credit_lbp': note['amount_lbp'],
                'debit_usd': 0,
                'credit_usd': note['amount_usd']
            }
        ],
        'total_debit_lbp': note['amount_lbp'],
        'total_credit_lbp': note['amount_lbp'],
        'total_debit_usd': note['amount_usd'],
        'total_credit_usd': note['amount_usd'],
        'is_posted': True,
        'organization_id': note['organization_id'],
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'posted_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.vouchers.insert_one(voucher_doc)
    
    # Update account balances
    # Debit account
    debit_account = await db.accounts.find_one({
        'code': note['debit_account_code'],
        'organization_id': note['organization_id']
    })
    if debit_account:
        new_balance_lbp = debit_account.get('balance_lbp', 0) + note['amount_lbp']
        new_balance_usd = debit_account.get('balance_usd', 0) + note['amount_usd']
        await db.accounts.update_one(
            {'id': debit_account['id']},
            {'$set': {'balance_lbp': new_balance_lbp, 'balance_usd': new_balance_usd}}
        )
    
    # Credit account
    credit_account = await db.accounts.find_one({
        'code': note['credit_account_code'],
        'organization_id': note['organization_id']
    })
    if credit_account:
        new_balance_lbp = credit_account.get('balance_lbp', 0) - note['amount_lbp']
        new_balance_usd = credit_account.get('balance_usd', 0) - note['amount_usd']
        await db.accounts.update_one(
            {'id': credit_account['id']},
            {'$set': {'balance_lbp': new_balance_lbp, 'balance_usd': new_balance_usd}}
        )
    
    # Update note status
    await db.crdb_notes.update_one(
        {'id': note_id},
        {'$set': {
            'is_posted': True,
            'voucher_id': voucher_id,
            'posted_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Note posted successfully", "voucher_number": voucher_number}

@api_router.post("/crdb-notes/{note_id}/unpost")
async def unpost_crdb_note(note_id: str, current_user: dict = Depends(get_current_user)):
    """Unpost a Cr/Db note - reverses the voucher and account balance changes"""
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can unpost notes")
    
    note = await db.crdb_notes.find_one({'id': note_id}, {'_id': 0})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    if not note['is_posted']:
        raise HTTPException(status_code=400, detail="Note is not posted")
    
    # Reverse account balances
    # Debit account - subtract what was added
    debit_account = await db.accounts.find_one({
        'code': note['debit_account_code'],
        'organization_id': note['organization_id']
    })
    if debit_account:
        new_balance_lbp = debit_account.get('balance_lbp', 0) - note['amount_lbp']
        new_balance_usd = debit_account.get('balance_usd', 0) - note['amount_usd']
        await db.accounts.update_one(
            {'id': debit_account['id']},
            {'$set': {'balance_lbp': new_balance_lbp, 'balance_usd': new_balance_usd}}
        )
    
    # Credit account - add back what was subtracted
    credit_account = await db.accounts.find_one({
        'code': note['credit_account_code'],
        'organization_id': note['organization_id']
    })
    if credit_account:
        new_balance_lbp = credit_account.get('balance_lbp', 0) + note['amount_lbp']
        new_balance_usd = credit_account.get('balance_usd', 0) + note['amount_usd']
        await db.accounts.update_one(
            {'id': credit_account['id']},
            {'$set': {'balance_lbp': new_balance_lbp, 'balance_usd': new_balance_usd}}
        )
    
    # Delete the associated voucher
    if note.get('voucher_id'):
        await db.vouchers.delete_one({'id': note['voucher_id']})
    
    # Update note status back to draft
    await db.crdb_notes.update_one(
        {'id': note_id},
        {'$set': {
            'is_posted': False,
            'voucher_id': None,
            'posted_at': None
        }}
    )
    
    return {"message": "Note unposted successfully"}

@api_router.put("/crdb-notes/{note_id}")
async def update_crdb_note(note_id: str, note_data: CrDbNoteUpdate, current_user: dict = Depends(get_current_user)):
    """Update a draft Cr/Db note"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    note = await db.crdb_notes.find_one({'id': note_id}, {'_id': 0})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    if note['is_posted']:
        raise HTTPException(status_code=400, detail="Cannot edit posted note. Unpost first.")
    
    # Get account details for the updated accounts
    debit_account = await db.accounts.find_one({
        'id': note_data.debit_account_id,
        'organization_id': note_data.organization_id
    }, {'_id': 0})
    credit_account = await db.accounts.find_one({
        'id': note_data.credit_account_id,
        'organization_id': note_data.organization_id
    }, {'_id': 0})
    
    if not debit_account:
        raise HTTPException(status_code=400, detail="Debit account not found")
    if not credit_account:
        raise HTTPException(status_code=400, detail="Credit account not found")
    
    # Calculate amounts
    amount = note_data.amount
    exchange_rate = note_data.exchange_rate
    currency = note_data.currency
    
    if currency == 'LBP':
        amount_lbp = amount
        amount_usd = amount / exchange_rate if exchange_rate > 0 else 0
    else:  # USD or other
        amount_usd = amount
        amount_lbp = amount * exchange_rate
    
    # Update the note
    update_doc = {
        'note_type': note_data.note_type,
        'date': note_data.date,
        'description': note_data.description,
        'currency': currency,
        'exchange_rate': exchange_rate,
        'amount': amount,
        'amount_lbp': amount_lbp,
        'amount_usd': amount_usd,
        'debit_account_id': note_data.debit_account_id,
        'debit_account_code': debit_account['code'],
        'debit_account_name': debit_account['name'],
        'credit_account_id': note_data.credit_account_id,
        'credit_account_code': credit_account['code'],
        'credit_account_name': credit_account['name'],
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'updated_by': current_user['id']
    }
    
    await db.crdb_notes.update_one({'id': note_id}, {'$set': update_doc})
    
    updated_note = await db.crdb_notes.find_one({'id': note_id}, {'_id': 0})
    return CrDbNoteResponse(**updated_note)

@api_router.delete("/crdb-notes/{note_id}")
async def delete_crdb_note(note_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    note = await db.crdb_notes.find_one({'id': note_id}, {'_id': 0})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    if note['is_posted']:
        raise HTTPException(status_code=400, detail="Cannot delete posted note")
    
    # Delete attachments
    for attachment in note.get('attachments', []):
        filepath = UPLOADS_DIR / attachment['filename']
        if filepath.exists():
            filepath.unlink()
    
    await db.crdb_notes.delete_one({'id': note_id})
    return {"message": "Note deleted successfully"}

# ================== BACKUP & RESTORE ==================

class BackupResponse(BaseModel):
    success: bool
    message: str
    filename: str
    timestamp: str
    collections: dict
    data: Optional[dict] = None

class RestoreResponse(BaseModel):
    success: bool
    message: str
    restored_counts: dict

@api_router.post("/backup")
async def create_backup(organization_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Create a backup of the database. Super admin can backup all data, others only their organization."""
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can create backups")
    
    backup_data = {
        'metadata': {
            'created_at': datetime.now(timezone.utc).isoformat(),
            'created_by': current_user['email'],
            'version': '1.0',
            'organization_id': organization_id
        },
        'collections': {}
    }
    
    # Collections to backup
    collections_to_backup = ['organizations', 'users', 'accounts', 'vouchers', 'exchange_rates', 'currencies']
    collection_counts = {}
    
    for collection_name in collections_to_backup:
        collection = db[collection_name]
        
        # Filter by organization if specified (except for organizations and currencies which are global)
        if organization_id and collection_name not in ['organizations', 'currencies']:
            if collection_name == 'users':
                query = {'$or': [{'organization_id': organization_id}, {'role': 'super_admin'}]}
            else:
                query = {'organization_id': organization_id}
        else:
            query = {}
        
        documents = await collection.find(query, {'_id': 0}).to_list(10000)
        backup_data['collections'][collection_name] = documents
        collection_counts[collection_name] = len(documents)
    
    # Generate filename
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    org_suffix = f"_{organization_id[:8]}" if organization_id else "_full"
    filename = f"kairos_backup_{timestamp}{org_suffix}.json"
    
    # Store backup data in response (frontend will handle download)
    return {
        'success': True,
        'message': 'Backup created successfully',
        'filename': filename,
        'timestamp': backup_data['metadata']['created_at'],
        'collections': collection_counts,
        'data': backup_data  # Include full backup data for download
    }

@api_router.post("/restore")
async def restore_backup(
    file: UploadFile = File(...),
    mode: str = 'merge',  # 'merge' or 'replace'
    current_user: dict = Depends(get_current_user)
):
    """Restore database from backup file. Mode: 'merge' adds/updates, 'replace' clears and restores."""
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can restore backups")
    
    if not file.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="Backup file must be JSON format")
    
    try:
        content = await file.read()
        import json
        backup_data = json.loads(content.decode('utf-8'))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid backup file: {str(e)}")
    
    # Validate backup structure
    if 'metadata' not in backup_data or 'collections' not in backup_data:
        raise HTTPException(status_code=400, detail="Invalid backup file structure")
    
    restored_counts = {}
    errors = []
    
    # Order matters for foreign key relationships
    restore_order = ['organizations', 'currencies', 'users', 'accounts', 'exchange_rates', 'vouchers']
    
    for collection_name in restore_order:
        if collection_name not in backup_data['collections']:
            continue
            
        documents = backup_data['collections'][collection_name]
        if not documents:
            restored_counts[collection_name] = 0
            continue
        
        collection = db[collection_name]
        
        try:
            if mode == 'replace':
                # Clear existing data (be careful!)
                org_id = backup_data['metadata'].get('organization_id')
                if org_id and collection_name not in ['organizations', 'currencies']:
                    # Only delete data for specific organization
                    if collection_name == 'users':
                        await collection.delete_many({'organization_id': org_id, 'role': {'$ne': 'super_admin'}})
                    else:
                        await collection.delete_many({'organization_id': org_id})
                elif not org_id:
                    # Full restore - clear everything except current super admin
                    if collection_name == 'users':
                        await collection.delete_many({'id': {'$ne': current_user['id']}})
                    else:
                        await collection.delete_many({})
            
            # Insert/update documents
            inserted = 0
            updated = 0
            for doc in documents:
                # Skip restoring current user to avoid lockout
                if collection_name == 'users' and doc.get('id') == current_user['id']:
                    continue
                    
                existing = await collection.find_one({'id': doc['id']})
                if existing:
                    await collection.update_one({'id': doc['id']}, {'$set': doc})
                    updated += 1
                else:
                    await collection.insert_one(doc)
                    inserted += 1
            
            restored_counts[collection_name] = {'inserted': inserted, 'updated': updated}
            
        except Exception as e:
            errors.append(f"{collection_name}: {str(e)}")
            restored_counts[collection_name] = {'error': str(e)}
    
    return RestoreResponse(
        success=len(errors) == 0,
        message='Restore completed' + (f' with {len(errors)} errors' if errors else ' successfully'),
        restored_counts=restored_counts
    )

@api_router.get("/backup/info")
async def get_backup_info(current_user: dict = Depends(get_current_user)):
    """Get information about what would be backed up"""
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can access backup info")
    
    collections_to_backup = ['organizations', 'users', 'accounts', 'vouchers', 'exchange_rates', 'currencies']
    info = {}
    
    for collection_name in collections_to_backup:
        count = await db[collection_name].count_documents({})
        info[collection_name] = count
    
    return {
        'collections': info,
        'total_documents': sum(info.values())
    }

# ================== INVENTORY MODULE (MOVED TO routers/inventory.py) ==================
# NOTE: These endpoints are now handled by routers/inventory.py
# The code below is kept commented for reference
'''
@api_router.get("/inventory", response_model=InventoryResponse)
async def get_inventory(
    organization_id: str,
    search: Optional[str] = None,
    category_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    low_stock: bool = False,
    expiring_soon: bool = False,
    page: int = 1,
    page_size: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get inventory items with optional filters and pagination"""
    query = {'organization_id': organization_id}
    
    # Filter by category
    if category_id:
        query['category_id'] = category_id
    
    # Filter by supplier
    if supplier_id:
        query['supplier_id'] = supplier_id
    
    # Apply search filter at DB level for better performance
    if search:
        query['$or'] = [
            {'name': {'$regex': search, '$options': 'i'}},
            {'barcode': {'$regex': search, '$options': 'i'}},
            {'sku': {'$regex': search, '$options': 'i'}},
            {'name_ar': {'$regex': search, '$options': 'i'}}
        ]
    
    # Get total count for pagination
    total_count = await db.inventory_items.count_documents(query)
    
    # Calculate skip
    skip = (page - 1) * page_size
    
    # Fetch items with pagination
    items = await db.inventory_items.find(query, {'_id': 0}).sort('name', 1).skip(skip).limit(page_size).to_list(page_size)
    
    # Filter low stock items (on_hand <= min_qty)
    if low_stock:
        items = [item for item in items if item.get('on_hand_qty', 0) <= item.get('min_qty', 0)]
    
    # Filter expiring soon (within 30 days)
    if expiring_soon:
        from datetime import timedelta
        threshold = (datetime.now() + timedelta(days=30)).isoformat()[:10]
        items = [
            item for item in items
            if item.get('expiry_date') and item['expiry_date'] <= threshold
        ]
    
    # Enrich with category and supplier names
    for item in items:
        if item.get('category_id'):
            category = await db.inventory_categories.find_one(
                {'$or': [{'id': item['category_id']}, {'cat_id': item['category_id']}], 'organization_id': organization_id},
                {'name': 1}
            )
            item['category_name'] = category['name'] if category else item.get('category', None)
        else:
            item['category_name'] = item.get('category', None)
            
        if item.get('supplier_id'):
            supplier = await db.accounts.find_one(
                {'$or': [{'id': item['supplier_id']}, {'code': item['supplier_id']}], 'organization_id': organization_id},
                {'name': 1}
            )
            item['supplier_name'] = supplier['name'] if supplier else None
        else:
            item['supplier_name'] = None
    
    return {
        'items': items,
        'total': total_count,
        'page': page,
        'page_size': page_size,
        'total_pages': (total_count + page_size - 1) // page_size
    }

@api_router.get("/inventory/{item_id}", response_model=InventoryItemResponse)
async def get_inventory_item(item_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single inventory item by ID"""
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    # Enrich with category and supplier names
    org_id = item.get('organization_id', '')
    if item.get('category_id'):
        category = await db.inventory_categories.find_one(
            {'$or': [{'id': item['category_id']}, {'cat_id': item['category_id']}], 'organization_id': org_id},
            {'name': 1}
        )
        item['category_name'] = category['name'] if category else item.get('category', None)
    else:
        item['category_name'] = item.get('category', None)
        
    if item.get('supplier_id'):
        supplier = await db.accounts.find_one(
            {'$or': [{'id': item['supplier_id']}, {'code': item['supplier_id']}], 'organization_id': org_id},
            {'name': 1}
        )
        item['supplier_name'] = supplier['name'] if supplier else None
    else:
        item['supplier_name'] = None
    
    return InventoryItemResponse(**item)

@api_router.get("/inventory/{item_id}/movements")
async def get_inventory_movements(item_id: str, current_user: dict = Depends(get_current_user)):
    """Get inventory movement history (ledger) for an item"""
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    movements = []
    
    # Get all sales invoices containing this item (posted only for actual stock movements)
    sales_pipeline = [
        {
            '$match': {
                'organization_id': item['organization_id'],
                'is_posted': True,
                '$or': [
                    {'lines.inventory_item_id': item_id},
                    {'lines.used_items.inventory_item_id': item_id}
                ]
            }
        },
        {'$sort': {'date': 1, 'created_at': 1}}
    ]
    
    sales_invoices = await db.sales_invoices.aggregate(sales_pipeline).to_list(1000)
    
    for inv in sales_invoices:
        # Check regular line items
        for line in inv.get('lines', []):
            if line.get('inventory_item_id') == item_id:
                movements.append({
                    'date': inv['date'],
                    'type': 'sale',
                    'document_type': 'Sales Invoice',
                    'document_number': inv['invoice_number'],
                    'document_id': inv['id'],
                    'description': f"Sold to {inv.get('debit_account_name', 'Customer')}",
                    'qty_out': line['quantity'],
                    'qty_in': 0,
                    'unit_price': line.get('unit_price', 0),
                    'cost': item.get('cost', 0),
                    'currency': line.get('currency', 'USD')
                })
            
            # Check used items within lines
            for used in line.get('used_items', []):
                if used.get('inventory_item_id') == item_id:
                    movements.append({
                        'date': inv['date'],
                        'type': 'used',
                        'document_type': 'Sales Invoice (Used)',
                        'document_number': inv['invoice_number'],
                        'document_id': inv['id'],
                        'description': f"Used in service for {inv.get('debit_account_name', 'Customer')}",
                        'qty_out': used.get('quantity', 0),
                        'qty_in': 0,
                        'unit_price': 0,
                        'cost': item.get('cost', 0),
                        'currency': 'USD'
                    })
    
    # Get all purchase invoices containing this item (posted only)
    purchase_pipeline = [
        {
            '$match': {
                'organization_id': item['organization_id'],
                'is_posted': True,
                'lines.inventory_item_id': item_id
            }
        },
        {'$sort': {'date': 1, 'created_at': 1}}
    ]
    
    purchase_invoices = await db.purchase_invoices.aggregate(purchase_pipeline).to_list(1000)
    
    for inv in purchase_invoices:
        for line in inv.get('lines', []):
            if line.get('inventory_item_id') == item_id:
                movements.append({
                    'date': inv['date'],
                    'type': 'purchase',
                    'document_type': 'Purchase Invoice',
                    'document_number': inv['invoice_number'],
                    'document_id': inv['id'],
                    'description': f"Purchased from {inv.get('credit_account_name', 'Supplier')}",
                    'qty_out': 0,
                    'qty_in': line['quantity'],
                    'unit_price': line.get('unit_price', 0),
                    'cost': line.get('unit_price', 0),
                    'currency': line.get('currency', 'USD')
                })
    
    # Get POS transactions (all are posted)
    pos_pipeline = [
        {
            '$match': {
                'organization_id': item['organization_id'],
                'lines.inventory_item_id': item_id
            }
        },
        {'$sort': {'date': 1, 'time': 1}}
    ]
    
    pos_transactions = await db.pos_transactions.aggregate(pos_pipeline).to_list(1000)
    
    for pos in pos_transactions:
        for line in pos.get('lines', []):
            if line.get('inventory_item_id') == item_id:
                movements.append({
                    'date': pos['date'],
                    'type': 'pos',
                    'document_type': 'POS Sale',
                    'document_number': pos['receipt_number'],
                    'document_id': pos['id'],
                    'description': f"POS Sale{' to ' + pos.get('customer_name') if pos.get('customer_name') else ''}",
                    'qty_out': line['quantity'],
                    'qty_in': 0,
                    'unit_price': line.get('unit_price', 0),
                    'cost': item.get('cost', 0),
                    'currency': line.get('currency', 'USD')
                })
    
    # Get inventory adjustments
    adjustments = item.get('adjustments', [])
    for adj in adjustments:
        qty = adj.get('quantity', 0)
        movements.append({
            'date': adj.get('date', ''),
            'type': 'adjustment',
            'document_type': 'Adjustment',
            'document_number': f"ADJ-{adj.get('date', '')}",
            'document_id': None,
            'description': adj.get('reason', 'Stock Adjustment'),
            'qty_out': abs(qty) if qty < 0 else 0,
            'qty_in': qty if qty > 0 else 0,
            'unit_price': 0,
            'cost': item.get('cost', 0),
            'currency': 'USD'
        })
    
    # Sort all movements by date
    movements.sort(key=lambda x: (x['date'], x.get('document_number', '')))
    
    # Calculate the opening balance
    # Opening balance = current on_hand_qty + total_out - total_in
    # This gives us what the starting balance must have been
    current_qty = item.get('on_hand_qty', 0)
    total_in = sum(mov['qty_in'] for mov in movements)
    total_out = sum(mov['qty_out'] for mov in movements)
    
    # Calculate what the opening balance should be
    # Current = Opening + In - Out
    # Opening = Current - In + Out
    calculated_opening = current_qty - total_in + total_out
    
    # Only add opening balance if it's positive and there are transactions
    # or if the item has initial_quantity set
    initial_qty = item.get('initial_quantity', 0)
    opening_qty = initial_qty if initial_qty > 0 else (calculated_opening if calculated_opening > 0 and len(movements) > 0 else 0)
    
    if opening_qty > 0:
        # Get the item creation date
        created_at = item.get('created_at', '')
        if created_at:
            opening_date = created_at[:10] if isinstance(created_at, str) else str(created_at)[:10]
        else:
            opening_date = '1900-01-01'
        
        opening_entry = {
            'date': opening_date,
            'type': 'opening',
            'document_type': 'Opening Balance',
            'document_number': 'OB-INIT',
            'document_id': None,
            'description': 'Initial stock / Opening balance',
            'qty_out': 0,
            'qty_in': opening_qty,
            'unit_price': item.get('cost', 0),
            'cost': item.get('cost', 0),
            'currency': 'USD'
        }
        
        # Insert opening at the beginning
        movements.insert(0, opening_entry)
    
    # Calculate running balance
    running_qty = 0
    for mov in movements:
        running_qty += mov['qty_in'] - mov['qty_out']
        mov['balance'] = running_qty
    
    return {
        'item': {
            'id': item['id'],
            'name': item['name'],
            'barcode': item.get('barcode'),
            'current_qty': item.get('on_hand_qty', 0),
            'cost': item.get('cost', 0),
            'price': item.get('price', 0)
        },
        'movements': movements
    }

@api_router.post("/inventory", response_model=InventoryItemResponse)
async def create_inventory_item(item_data: InventoryItemCreate, current_user: dict = Depends(get_current_user)):
    """Create a new inventory item"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Check for duplicate barcode if provided
    if item_data.barcode:
        existing = await db.inventory_items.find_one({
            'barcode': item_data.barcode,
            'organization_id': item_data.organization_id
        })
        if existing:
            raise HTTPException(status_code=400, detail="Barcode already exists")
    
    item_id = str(uuid.uuid4())
    item_doc = {
        'id': item_id,
        'barcode': item_data.barcode,
        'name': item_data.name,
        'name_ar': item_data.name_ar,
        'category_id': item_data.category_id,
        'supplier_id': item_data.supplier_id,
        'cost': item_data.cost,
        'price': item_data.price,
        'currency': item_data.currency,
        'min_qty': item_data.min_qty,
        'on_hand_qty': item_data.on_hand_qty,
        'initial_quantity': item_data.on_hand_qty,  # Track initial quantity for ledger opening balance
        'unit': item_data.unit,
        'expiry_date': item_data.expiry_date,
        'description': item_data.description,
        'is_active': item_data.is_active,
        'organization_id': item_data.organization_id,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'created_by': current_user['id']
    }
    
    await db.inventory_items.insert_one(item_doc)
    
    # Enrich response with category and supplier names
    item_doc['category_name'] = None
    item_doc['supplier_name'] = None
    
    if item_data.category_id:
        category = await db.inventory_categories.find_one({'id': item_data.category_id}, {'name': 1})
        item_doc['category_name'] = category['name'] if category else None
    
    if item_data.supplier_id:
        supplier = await db.accounts.find_one({'id': item_data.supplier_id}, {'name': 1})
        item_doc['supplier_name'] = supplier['name'] if supplier else None
    
    return InventoryItemResponse(**item_doc)

@api_router.put("/inventory/{item_id}", response_model=InventoryItemResponse)
async def update_inventory_item(item_id: str, item_data: InventoryItemUpdate, current_user: dict = Depends(get_current_user)):
    """Update an inventory item"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    # Check for duplicate barcode if changing
    if item_data.barcode and item_data.barcode != item.get('barcode'):
        existing = await db.inventory_items.find_one({
            'barcode': item_data.barcode,
            'organization_id': item['organization_id'],
            'id': {'$ne': item_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Barcode already exists")
    
    update_doc = {}
    for field, value in item_data.model_dump(exclude_unset=True).items():
        if value is not None:
            update_doc[field] = value
    
    if update_doc:
        update_doc['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.inventory_items.update_one({'id': item_id}, {'$set': update_doc})
    
    updated = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    
    # Enrich with category and supplier names
    if updated.get('category_id'):
        category = await db.inventory_categories.find_one({'id': updated['category_id']}, {'name': 1})
        updated['category_name'] = category['name'] if category else None
    else:
        updated['category_name'] = None
        
    if updated.get('supplier_id'):
        supplier = await db.accounts.find_one({'id': updated['supplier_id']}, {'name': 1})
        updated['supplier_name'] = supplier['name'] if supplier else None
    else:
        updated['supplier_name'] = None
    
    return InventoryItemResponse(**updated)

@api_router.delete("/inventory/{item_id}")
async def delete_inventory_item(item_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an inventory item"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    # Delete image if exists
    if item.get('image_filename'):
        filepath = UPLOADS_DIR / "inventory" / item['image_filename']
        if filepath.exists():
            filepath.unlink()
    
    await db.inventory_items.delete_one({'id': item_id})
    return {"message": "Inventory item deleted successfully"}

@api_router.post("/inventory/{item_id}/adjust-quantity")
async def adjust_inventory_quantity(
    item_id: str,
    adjustment: float,
    reason: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Adjust inventory quantity (add or subtract)"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    new_qty = item.get('on_hand_qty', 0) + adjustment
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Cannot reduce quantity below zero")
    
    await db.inventory_items.update_one(
        {'id': item_id},
        {'$set': {
            'on_hand_qty': new_qty,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Log the adjustment
    adjustment_log = {
        'id': str(uuid.uuid4()),
        'item_id': item_id,
        'previous_qty': item.get('on_hand_qty', 0),
        'adjustment': adjustment,
        'new_qty': new_qty,
        'reason': reason,
        'adjusted_by': current_user['id'],
        'adjusted_at': datetime.now(timezone.utc).isoformat()
    }
    await db.inventory_adjustments.insert_one(adjustment_log)
    
    return {"message": "Quantity adjusted successfully", "new_qty": new_qty}

# ================== INVENTORY BATCH MANAGEMENT ==================

@api_router.get("/inventory/{item_id}/batches")
async def get_inventory_batches(item_id: str, current_user: dict = Depends(get_current_user)):
    """Get all batches for an inventory item"""
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    return item.get('batches', [])

@api_router.post("/inventory/{item_id}/batches")
async def add_inventory_batch(
    item_id: str,
    batch_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Add a new batch to an inventory item"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    batch_number = batch_data.get('batch_number')
    quantity = batch_data.get('quantity', 0)
    expiry_date = batch_data.get('expiry_date')
    cost = batch_data.get('cost_per_unit') or batch_data.get('cost')
    notes = batch_data.get('notes')
    
    if not batch_number:
        raise HTTPException(status_code=400, detail="Batch number is required")
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    batches = item.get('batches', [])
    
    # Check for duplicate batch number
    if any(b['batch_number'] == batch_number for b in batches):
        raise HTTPException(status_code=400, detail="Batch number already exists for this item")
    
    new_batch = {
        'id': str(uuid.uuid4()),
        'batch_number': batch_number,
        'expiry_date': expiry_date,
        'quantity': quantity,
        'cost': cost or item.get('cost', 0),
        'received_date': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        'notes': notes,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    batches.append(new_batch)
    
    # Update total on_hand_qty
    total_qty = sum(b.get('quantity', 0) for b in batches)
    
    await db.inventory_items.update_one(
        {'id': item_id},
        {'$set': {
            'batches': batches,
            'on_hand_qty': total_qty,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Batch added successfully", "batch": new_batch, "total_qty": total_qty}

@api_router.put("/inventory/{item_id}/batches/{batch_id}")
async def update_inventory_batch(
    item_id: str,
    batch_id: str,
    batch_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update a batch for an inventory item"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    batches = item.get('batches', [])
    batch_index = next((i for i, b in enumerate(batches) if b.get('id') == batch_id), None)
    
    if batch_index is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Update batch fields from request body
    if batch_data.get('batch_number') is not None:
        batches[batch_index]['batch_number'] = batch_data['batch_number']
    if batch_data.get('quantity') is not None:
        batches[batch_index]['quantity'] = batch_data['quantity']
    if batch_data.get('expiry_date') is not None:
        batches[batch_index]['expiry_date'] = batch_data['expiry_date']
    if batch_data.get('cost') is not None or batch_data.get('cost_per_unit') is not None:
        batches[batch_index]['cost'] = batch_data.get('cost') or batch_data.get('cost_per_unit')
    if batch_data.get('notes') is not None:
        batches[batch_index]['notes'] = batch_data['notes']
    
    batches[batch_index]['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Update total on_hand_qty
    total_qty = sum(b.get('quantity', 0) for b in batches)
    
    await db.inventory_items.update_one(
        {'id': item_id},
        {'$set': {
            'batches': batches,
            'on_hand_qty': total_qty,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Batch updated successfully", "batch": batches[batch_index], "total_qty": total_qty}

@api_router.delete("/inventory/{item_id}/batches/{batch_id}")
async def delete_inventory_batch(
    item_id: str,
    batch_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a batch from an inventory item"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    batches = item.get('batches', [])
    new_batches = [b for b in batches if b.get('id') != batch_id]
    
    if len(new_batches) == len(batches):
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Update total on_hand_qty
    total_qty = sum(b.get('quantity', 0) for b in new_batches)
    
    await db.inventory_items.update_one(
        {'id': item_id},
        {'$set': {
            'batches': new_batches,
            'on_hand_qty': total_qty,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Batch deleted successfully", "total_qty": total_qty}

@api_router.post("/inventory/{item_id}/batches/{batch_id}/deduct")
async def deduct_from_batch(
    item_id: str,
    batch_id: str,
    quantity: float,
    reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Deduct quantity from a specific batch (for sales/POS)"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant', 'cashier']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    batches = item.get('batches', [])
    batch_index = next((i for i, b in enumerate(batches) if b.get('id') == batch_id), None)
    
    if batch_index is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    current_qty = batches[batch_index].get('quantity', 0)
    if quantity > current_qty:
        raise HTTPException(status_code=400, detail=f"Insufficient quantity in batch. Available: {current_qty}")
    
    batches[batch_index]['quantity'] = current_qty - quantity
    batches[batch_index]['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Update total on_hand_qty
    total_qty = sum(b.get('quantity', 0) for b in batches)
    
    await db.inventory_items.update_one(
        {'id': item_id},
        {'$set': {
            'batches': batches,
            'on_hand_qty': total_qty,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Log the deduction
    deduction_log = {
        'id': str(uuid.uuid4()),
        'item_id': item_id,
        'batch_id': batch_id,
        'batch_number': batches[batch_index]['batch_number'],
        'quantity_deducted': quantity,
        'reason': reason,
        'performed_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.batch_deductions.insert_one(deduction_log)
    
    return {"message": "Quantity deducted successfully", "remaining_batch_qty": batches[batch_index]['quantity'], "total_qty": total_qty}

# ================== CSV IMPORT FOR INVENTORY ==================

@api_router.post("/inventory/csv/preview")
async def preview_csv_import(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """Preview CSV file and detect columns for mapping"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    import csv
    import io
    
    content = await file.read()
    try:
        # Try UTF-8 first, then fallback to latin-1
        try:
            text = content.decode('utf-8')
        except UnicodeDecodeError:
            text = content.decode('latin-1')
        
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
        
        if not rows:
            raise HTTPException(status_code=400, detail="CSV file is empty")
        
        # Get column headers
        headers = list(rows[0].keys())
        
        # Get existing categories and suppliers for suggestions
        categories = await db.inventory_categories.find({'organization_id': organization_id}, {'_id': 0}).to_list(1000)
        suppliers = await db.accounts.find({
            'organization_id': organization_id,
            'account_type': 'supplier'
        }, {'_id': 0}).to_list(1000)
        
        # Suggest next supplier account code (4xxxx range for suppliers)
        supplier_codes = [s['code'] for s in suppliers if s.get('code', '').startswith('4')]
        if supplier_codes:
            # Find the max 5-digit code in 4xxxx range
            valid_codes = [c for c in supplier_codes if len(c) == 5 and c.isdigit()]
            if valid_codes:
                max_code = max(valid_codes)
                next_code = str(int(max_code) + 1)
            else:
                next_code = '40001'
        else:
            next_code = '40001'  # Default starting code for suppliers in 4xxxx range
        
        # Auto-detect field mappings based on header names
        auto_mappings = {}
        header_lower_map = {h.lower().replace(' ', '_').replace('-', '_'): h for h in headers}
        
        mapping_hints = {
            'name': ['name', 'item_name', 'product_name', 'product', 'item', 'description'],
            'name_ar': ['name_ar', 'arabic_name', 'arabic', 'اسم'],
            'barcode': ['barcode', 'sku', 'code', 'item_code', 'product_code', 'upc'],
            'category': ['category', 'category_name', 'type', 'group'],
            'supplier': ['supplier', 'supplier_name', 'vendor', 'vendor_name'],
            'cost': ['cost', 'cost_price', 'purchase_price', 'buy_price'],
            'price': ['price', 'sell_price', 'selling_price', 'retail_price', 'unit_price'],
            'quantity': ['quantity', 'qty', 'stock', 'on_hand', 'on_hand_qty', 'stock_qty'],
            'unit': ['unit', 'uom', 'unit_of_measure'],
            'min_qty': ['min_qty', 'minimum', 'reorder_level', 'min_stock'],
            'expiry_date': ['expiry_date', 'expiry', 'exp_date', 'expiration', 'best_before'],
            'batch_number': ['batch', 'batch_number', 'lot', 'lot_number'],
        }
        
        for field, hints in mapping_hints.items():
            for hint in hints:
                if hint in header_lower_map:
                    auto_mappings[field] = header_lower_map[hint]
                    break
        
        # Sample data (first 5 rows)
        sample_data = rows[:5]
        
        return {
            'headers': headers,
            'auto_mappings': auto_mappings,
            'sample_data': sample_data,
            'total_rows': len(rows),
            'existing_categories': [{'id': c['id'], 'name': c['name']} for c in categories],
            'existing_suppliers': [{'id': s['id'], 'code': s['code'], 'name': s['name']} for s in suppliers],
            'next_supplier_code': next_code
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")

@api_router.post("/inventory/csv/import")
async def import_csv_inventory(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    field_mappings: str = Form(...),  # JSON string of mappings
    create_categories: bool = Form(False),
    create_suppliers: bool = Form(False),
    supplier_start_code: str = Form('40001'),  # Default to 4xxxx range for suppliers
    current_user: dict = Depends(get_current_user)
):
    """Import inventory from CSV with field mappings"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    import csv
    import io
    import json
    
    try:
        mappings = json.loads(field_mappings)
    except:
        raise HTTPException(status_code=400, detail="Invalid field mappings JSON")
    
    content = await file.read()
    try:
        try:
            text = content.decode('utf-8')
        except UnicodeDecodeError:
            text = content.decode('latin-1')
        
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")
    
    # Get existing data
    existing_items = await db.inventory.find({'organization_id': organization_id}, {'_id': 0}).to_list(10000)
    existing_barcodes = {item['barcode']: item for item in existing_items if item.get('barcode')}
    
    categories = await db.inventory_categories.find({'organization_id': organization_id}, {'_id': 0}).to_list(1000)
    category_map = {c['name'].lower(): c for c in categories}
    
    suppliers = await db.accounts.find({
        'organization_id': organization_id,
        'account_type': 'supplier'
    }, {'_id': 0}).to_list(1000)
    supplier_map = {s['name'].lower(): s for s in suppliers}
    
    # Check org settings for expiry tracking
    org = await db.organizations.find_one({'id': organization_id}, {'_id': 0})
    enable_expiry = org.get('enable_expiry_tracking', False)
    
    results = {
        'created': 0,
        'updated': 0,
        'skipped': 0,
        'errors': [],
        'new_categories': [],
        'new_suppliers': []
    }
    
    next_supplier_code = int(supplier_start_code)
    
    for i, row in enumerate(rows):
        try:
            # Get mapped values
            def get_mapped_value(field):
                csv_col = mappings.get(field)
                if csv_col and csv_col in row:
                    return row[csv_col].strip() if row[csv_col] else None
                return None
            
            name = get_mapped_value('name')
            if not name:
                results['skipped'] += 1
                results['errors'].append(f"Row {i+2}: Missing item name")
                continue
            
            barcode = get_mapped_value('barcode')
            category_name = get_mapped_value('category')
            supplier_name = get_mapped_value('supplier')
            
            # Handle category
            category_id = None
            if category_name:
                cat = category_map.get(category_name.lower())
                if cat:
                    category_id = cat['id']
                elif create_categories:
                    # Create new category
                    new_cat = {
                        'id': str(uuid.uuid4()),
                        'name': category_name,
                        'organization_id': organization_id,
                        'created_at': datetime.now(timezone.utc).isoformat()
                    }
                    await db.inventory_categories.insert_one(new_cat)
                    category_map[category_name.lower()] = new_cat
                    category_id = new_cat['id']
                    results['new_categories'].append(category_name)
            
            # Handle supplier
            supplier_id = None
            if supplier_name:
                sup = supplier_map.get(supplier_name.lower())
                if sup:
                    supplier_id = sup['id']
                elif create_suppliers:
                    # Create new supplier account (4xxxx range)
                    new_sup = {
                        'id': str(uuid.uuid4()),
                        'code': str(next_supplier_code),
                        'name': supplier_name,
                        'name_ar': None,
                        'account_type': 'supplier',
                        'account_class': 4,  # 4 = Accounts Payable/Supplier
                        'parent_code': '40',  # Parent for supplier accounts in 4xxxx range
                        'level': 2,
                        'is_group': False,
                        'is_active': True,
                        'balance_lbp': 0,
                        'balance_usd': 0,
                        'organization_id': organization_id,
                        'created_at': datetime.now(timezone.utc).isoformat()
                    }
                    await db.accounts.insert_one(new_sup)
                    supplier_map[supplier_name.lower()] = new_sup
                    supplier_id = new_sup['id']
                    results['new_suppliers'].append({'name': supplier_name, 'code': str(next_supplier_code)})
                    next_supplier_code += 1
            
            # Parse numeric values
            try:
                cost = float(get_mapped_value('cost') or 0)
            except:
                cost = 0
            try:
                price = float(get_mapped_value('price') or 0)
            except:
                price = 0
            try:
                quantity = float(get_mapped_value('quantity') or 0)
            except:
                quantity = 0
            try:
                min_qty = float(get_mapped_value('min_qty') or 0)
            except:
                min_qty = 0
            
            unit = get_mapped_value('unit') or 'piece'
            expiry_date = get_mapped_value('expiry_date')
            batch_number = get_mapped_value('batch_number')
            
            # Check if item exists by barcode
            if barcode and barcode in existing_barcodes:
                # Update existing item
                existing_item = existing_barcodes[barcode]
                update_data = {
                    'name': name,
                    'cost': cost,
                    'price': price,
                    'on_hand_qty': existing_item.get('on_hand_qty', 0) + quantity,
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }
                if category_id:
                    update_data['category_id'] = category_id
                if supplier_id:
                    update_data['supplier_id'] = supplier_id
                
                await db.inventory_items.update_one({'id': existing_item['id']}, {'$set': update_data})
                results['updated'] += 1
            else:
                # Create new item
                new_item = {
                    'id': str(uuid.uuid4()),
                    'barcode': barcode,
                    'name': name,
                    'name_ar': get_mapped_value('name_ar'),
                    'category_id': category_id,
                    'supplier_id': supplier_id,
                    'cost': cost,
                    'price': price,
                    'currency': 'USD',
                    'min_qty': min_qty,
                    'on_hand_qty': quantity,
                    'unit': unit,
                    'is_taxable': True,
                    'is_active': True,
                    'organization_id': organization_id,
                    'created_at': datetime.now(timezone.utc).isoformat()
                }
                
                # Handle expiry/batch if enabled
                if enable_expiry and (expiry_date or batch_number):
                    new_item['batches'] = [{
                        'id': str(uuid.uuid4()),
                        'batch_number': batch_number or f"BATCH-{datetime.now().strftime('%Y%m%d')}-001",
                        'expiry_date': expiry_date,
                        'quantity': quantity,
                        'cost': cost,
                        'received_date': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
                        'created_at': datetime.now(timezone.utc).isoformat()
                    }]
                else:
                    new_item['expiry_date'] = expiry_date
                
                await db.inventory_items.insert_one(new_item)
                if barcode:
                    existing_barcodes[barcode] = new_item
                results['created'] += 1
                
        except Exception as e:
            results['errors'].append(f"Row {i+2}: {str(e)}")
            results['skipped'] += 1
    
    return results

# ================== SERVICE ITEMS CRUD (Non-stock items) ==================

@api_router.get("/service-items", response_model=List[ServiceItemResponse])
async def get_service_items(
    organization_id: str,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get service items (non-stock items) for an organization"""
    query = {'organization_id': organization_id}
    items = await db.service_items.find(query, {'_id': 0}).sort('name', 1).to_list(1000)
    
    if search:
        search_lower = search.lower()
        items = [
            item for item in items
            if search_lower in item.get('name', '').lower()
            or (item.get('name_ar') and search_lower in item['name_ar'])
            or (item.get('description') and search_lower in item['description'].lower())
        ]
    
    return [ServiceItemResponse(**item) for item in items]

@api_router.get("/service-items/{item_id}", response_model=ServiceItemResponse)
async def get_service_item(item_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single service item by ID"""
    item = await db.service_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Service item not found")
    return ServiceItemResponse(**item)

@api_router.post("/service-items", response_model=ServiceItemResponse)
async def create_service_item(item_data: ServiceItemCreate, current_user: dict = Depends(get_current_user)):
    """Create a new service item"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Check for duplicate name in same organization
    existing = await db.service_items.find_one({
        'name': item_data.name,
        'organization_id': item_data.organization_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Service item with this name already exists")
    
    item_doc = {
        'id': str(uuid.uuid4()),
        **item_data.model_dump(),
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.service_items.insert_one(item_doc)
    return ServiceItemResponse(**item_doc)

@api_router.put("/service-items/{item_id}", response_model=ServiceItemResponse)
async def update_service_item(item_id: str, item_data: ServiceItemUpdate, current_user: dict = Depends(get_current_user)):
    """Update a service item"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.service_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Service item not found")
    
    update_doc = {k: v for k, v in item_data.model_dump().items() if v is not None}
    if update_doc:
        update_doc['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.service_items.update_one({'id': item_id}, {'$set': update_doc})
    
    updated = await db.service_items.find_one({'id': item_id}, {'_id': 0})
    return ServiceItemResponse(**updated)

@api_router.delete("/service-items/{item_id}")
async def delete_service_item(item_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a service item"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.service_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Service item not found")
    
    await db.service_items.delete_one({'id': item_id})
    return {"message": "Service item deleted successfully"}

# ================== INVENTORY CATEGORIES CRUD ==================

@api_router.get("/inventory-categories", response_model=List[InventoryCategoryResponse])
async def get_inventory_categories(
    organization_id: str, 
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get inventory categories with optional search"""
    query = {'organization_id': organization_id}
    categories = await db.inventory_categories.find(query, {'_id': 0}).sort('name', 1).to_list(1000)
    
    if search:
        search_lower = search.lower()
        categories = [
            cat for cat in categories
            if search_lower in cat.get('name', '').lower()
            or (cat.get('name_ar') and search_lower in cat['name_ar'])
        ]
    
    return [InventoryCategoryResponse(**cat) for cat in categories]

@api_router.post("/inventory-categories", response_model=InventoryCategoryResponse)
async def create_inventory_category(
    category_data: InventoryCategoryCreate, 
    current_user: dict = Depends(get_current_user)
):
    """Create a new inventory category"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Check for duplicate name
    existing = await db.inventory_categories.find_one({
        'name': category_data.name,
        'organization_id': category_data.organization_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Category name already exists")
    
    category_id = str(uuid.uuid4())
    category_doc = {
        'id': category_id,
        'name': category_data.name,
        'name_ar': category_data.name_ar,
        'description': category_data.description,
        'organization_id': category_data.organization_id,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.inventory_categories.insert_one(category_doc)
    return InventoryCategoryResponse(**category_doc)

@api_router.put("/inventory-categories/{category_id}", response_model=InventoryCategoryResponse)
async def update_inventory_category(
    category_id: str,
    category_data: InventoryCategoryUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an inventory category"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    category = await db.inventory_categories.find_one({'id': category_id}, {'_id': 0})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    update_doc = {}
    for field, value in category_data.model_dump(exclude_unset=True).items():
        if value is not None:
            update_doc[field] = value
    
    if update_doc:
        update_doc['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.inventory_categories.update_one({'id': category_id}, {'$set': update_doc})
    
    updated = await db.inventory_categories.find_one({'id': category_id}, {'_id': 0})
    return InventoryCategoryResponse(**updated)

@api_router.delete("/inventory-categories/{category_id}")
async def delete_inventory_category(category_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an inventory category"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    category = await db.inventory_categories.find_one({'id': category_id}, {'_id': 0})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check if category is in use
    items_using = await db.inventory_items.count_documents({'category_id': category_id})
    if items_using > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete category: {items_using} item(s) are using this category"
        )
    
    await db.inventory_categories.delete_one({'id': category_id})
    return {"message": "Category deleted successfully"}

# ================== INVENTORY SUPPLIERS SEARCH ==================

@api_router.get("/inventory-suppliers")
async def get_inventory_suppliers(
    organization_id: str, 
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get supplier accounts for inventory linking with optional search"""
    # Suppliers are accounts starting with '40'
    accounts = await db.accounts.find({
        'organization_id': organization_id,
        'code': {'$regex': '^40'},
        'is_active': True,
        '$expr': {'$gte': [{'$strLenCP': '$code'}, 5]}  # Only movable accounts
    }, {'_id': 0, 'id': 1, 'code': 1, 'name': 1, 'name_ar': 1}).sort('code', 1).to_list(1000)
    
    if search:
        search_lower = search.lower()
        accounts = [
            acc for acc in accounts
            if search_lower in acc.get('name', '').lower()
            or search_lower in acc.get('code', '').lower()
            or (acc.get('name_ar') and search_lower in acc['name_ar'])
        ]
    
    return accounts

# ================== INVENTORY IMAGE HANDLING ==================

# Create inventory images directory
INVENTORY_IMAGES_DIR = UPLOADS_DIR / "inventory"
INVENTORY_IMAGES_DIR.mkdir(exist_ok=True)

@api_router.post("/inventory/{item_id}/upload-image")
async def upload_inventory_image(
    item_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload an image for an inventory item - uses S3 if configured, otherwise local storage"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    # Validate file type
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Only JPEG, PNG, GIF, WEBP allowed")
    
    content = await file.read()
    
    # Try S3 upload first
    try:
        from services.s3_service import s3_service
        
        if s3_service.is_configured():
            # Get organization_id from item
            organization_id = item.get('organization_id', 'default')
            
            # Delete old S3 image if exists
            if item.get('image_s3_key'):
                s3_service.delete_object(item['image_s3_key'])
            
            # Generate S3 key
            file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
            file_key = s3_service.generate_file_key(
                organization_id=organization_id,
                file_type='inventory',
                original_filename=f"{item_id}.{file_ext}"
            )
            
            # Upload to S3
            result = await s3_service.upload_file(
                file_content=content,
                file_key=file_key,
                content_type=file.content_type
            )
            
            if result:
                # Update item with S3 URL
                await db.inventory_items.update_one(
                    {'id': item_id},
                    {'$set': {
                        'image_url': result['url'],
                        'image_s3_key': file_key,
                        'image_filename': None,  # Clear local filename
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }}
                )
                
                return {
                    "message": "Image uploaded to S3 successfully",
                    "url": result['url'],
                    "storage": "s3"
                }
    except ImportError:
        pass  # S3 service not available, fall back to local storage
    except Exception as e:
        logger.error(f"S3 upload failed, falling back to local: {str(e)}")
    
    # Fallback to local storage
    # Delete old image if exists
    if item.get('image_filename'):
        old_filepath = INVENTORY_IMAGES_DIR / item['image_filename']
        if old_filepath.exists():
            old_filepath.unlink()
    
    # Save new image locally
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"{item_id}_{str(uuid.uuid4())[:8]}.{file_ext}"
    filepath = INVENTORY_IMAGES_DIR / filename
    
    with open(filepath, 'wb') as f:
        f.write(content)
    
    # Update item with image filename
    await db.inventory_items.update_one(
        {'id': item_id},
        {'$set': {
            'image_filename': filename,
            'image_url': None,  # Clear S3 URL
            'image_s3_key': None,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Image uploaded successfully", "filename": filename, "storage": "local"}

@api_router.get("/inventory/image/{filename}")
async def get_inventory_image(filename: str):
    """Get inventory item image (public endpoint)"""
    from urllib.parse import unquote
    import mimetypes
    import hashlib
    
    decoded_filename = unquote(filename)
    filepath = INVENTORY_IMAGES_DIR / decoded_filename
    
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Determine content type
    ext = decoded_filename.split('.')[-1].lower() if '.' in decoded_filename else 'jpg'
    content_types = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
    }
    content_type = content_types.get(ext, 'image/jpeg')
    
    # Generate ETag for caching
    file_stat = filepath.stat()
    etag = hashlib.md5(f"{filepath}{file_stat.st_mtime}".encode()).hexdigest()
    
    return FileResponse(
        filepath,
        media_type=content_type,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": f"inline; filename=\"{decoded_filename}\"",
            "ETag": f'"{etag}"',
            "X-Content-Type-Options": "nosniff"
        }
    )

@api_router.delete("/inventory/{item_id}/image")
async def delete_inventory_image(item_id: str, current_user: dict = Depends(get_current_user)):
    """Delete inventory item image - handles both S3 and local storage"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    # Delete from S3 if exists
    if item.get('image_s3_key'):
        try:
            from services.s3_service import s3_service
            if s3_service.is_configured():
                s3_service.delete_object(item['image_s3_key'])
        except Exception as e:
            logger.error(f"Failed to delete S3 image: {str(e)}")
    
    # Delete local file if exists
    if item.get('image_filename'):
        filepath = INVENTORY_IMAGES_DIR / item['image_filename']
        if filepath.exists():
            filepath.unlink()
    
    # Update item - clear all image fields
    await db.inventory_items.update_one(
        {'id': item_id},
        {'$set': {
            'image_filename': None, 
            'image_url': None,
            'image_s3_key': None,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Image deleted successfully"}

@api_router.post("/inventory/{item_id}/generate-ai-image")
async def generate_ai_product_image(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Generate product image using AI based on item name and description"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    # Get API key
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    try:
        from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
        
        # Build prompt from item details
        product_name = item.get('name', 'Product')
        product_desc = item.get('description', '')
        product_unit = item.get('unit', 'piece')
        
        prompt = f"Professional product photography of {product_name}"
        if product_desc:
            prompt += f", {product_desc}"
        prompt += f". Clean white background, studio lighting, commercial product shot, high quality, {product_unit} packaging visible"
        
        # Generate image
        image_gen = OpenAIImageGeneration(api_key=api_key)
        images = await image_gen.generate_images(
            prompt=prompt,
            model="gpt-image-1",
            number_of_images=1
        )
        
        if not images or len(images) == 0:
            raise HTTPException(status_code=500, detail="No image was generated")
        
        # Delete old image if exists
        if item.get('image_filename'):
            old_filepath = INVENTORY_IMAGES_DIR / item['image_filename']
            if old_filepath.exists():
                old_filepath.unlink()
        
        # Save generated image
        filename = f"{item_id}_ai_{str(uuid.uuid4())[:8]}.png"
        filepath = INVENTORY_IMAGES_DIR / filename
        
        with open(filepath, 'wb') as f:
            f.write(images[0])
        
        # Update item with image filename
        await db.inventory_items.update_one(
            {'id': item_id},
            {'$set': {
                'image_filename': filename,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {"message": "AI image generated successfully", "filename": filename}
        
    except ImportError:
        raise HTTPException(status_code=500, detail="AI integration not available")
    except Exception as e:
        logger.error(f"AI image generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate image: {str(e)}")

@api_router.post("/inventory/{item_id}/fetch-web-image")
async def fetch_web_product_image(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Fetch product image from web based on barcode or product name/description"""
    import urllib.parse
    
    if current_user['role'] not in ['super_admin', 'admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    item = await db.inventory_items.find_one({'id': item_id}, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    barcode = item.get('barcode')
    product_name = item.get('name', '')
    product_desc = item.get('description', '')
    
    if not barcode and not product_name and not product_desc:
        raise HTTPException(status_code=400, detail="Item needs barcode, name, or description to search")
    
    try:
        image_url = None
        search_source = None
        
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            # Try barcode-based search first if available
            if barcode:
                try:
                    # Try Open Food Facts
                    response = await client.get(f"https://world.openfoodfacts.org/api/v0/product/{barcode}.json")
                    if response.status_code == 200:
                        data = response.json()
                        if data.get('status') == 1 and data.get('product', {}).get('image_url'):
                            image_url = data['product']['image_url']
                            search_source = 'openfoodfacts_barcode'
                except Exception as e:
                    logger.warning(f"Open Food Facts barcode search failed: {e}")
                
                # If not found, try UPC Item DB
                if not image_url:
                    try:
                        response = await client.get(f"https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}")
                        if response.status_code == 200:
                            data = response.json()
                            items = data.get('items', [])
                            if items and items[0].get('images'):
                                image_url = items[0]['images'][0]
                                search_source = 'upcitemdb'
                    except Exception as e:
                        logger.warning(f"UPC Item DB search failed: {e}")
            
            # If no barcode or barcode search failed, search by name/description
            if not image_url:
                # Use description if available, otherwise use name
                search_term = product_desc.strip() if product_desc else product_name.strip()
                if search_term:
                    encoded_term = urllib.parse.quote(search_term)
                    
                    # Search Open Food Facts by name
                    try:
                        response = await client.get(
                            f"https://world.openfoodfacts.org/cgi/search.pl?search_terms={encoded_term}&search_simple=1&action=process&json=1&page_size=5",
                            timeout=10.0
                        )
                        if response.status_code == 200:
                            data = response.json()
                            products = data.get('products', [])
                            for product in products:
                                if product.get('image_url'):
                                    image_url = product['image_url']
                                    search_source = 'openfoodfacts_name'
                                    break
                    except Exception as e:
                        logger.warning(f"Open Food Facts name search failed: {e}")
                    
                    # If still not found, use Lorem Picsum for a placeholder image
                    if not image_url:
                        # Use Lorem Picsum - reliable placeholder image service
                        # Generate a seeded random image based on item name for consistency
                        seed = hash(search_term) % 1000
                        image_url = f"https://picsum.photos/seed/{seed}/400/400"
                        search_source = 'placeholder'
        
        if not image_url:
            return {
                "message": "No image found in product databases. Try AI generation instead.",
                "found": False
            }
        
        # Download the image
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            response = await client.get(image_url)
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to download image")
            
            content = response.content
            content_type = response.headers.get('content-type', 'image/jpeg')
            
            # Determine extension
            ext = 'jpg'
            if 'png' in content_type:
                ext = 'png'
            elif 'gif' in content_type:
                ext = 'gif'
            elif 'webp' in content_type:
                ext = 'webp'
        
        # Delete old image if exists
        if item.get('image_filename'):
            old_filepath = INVENTORY_IMAGES_DIR / item['image_filename']
            if old_filepath.exists():
                old_filepath.unlink()
        
        # Save image
        filename = f"{item_id}_web_{str(uuid.uuid4())[:8]}.{ext}"
        filepath = INVENTORY_IMAGES_DIR / filename
        
        with open(filepath, 'wb') as f:
            f.write(content)
        
        # Update item
        await db.inventory_items.update_one(
            {'id': item_id},
            {'$set': {
                'image_filename': filename,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {
            "message": "Image fetched successfully", 
            "filename": filename, 
            "found": True,
            "source": search_source,
            "search_term": product_desc if product_desc else product_name if not barcode else barcode
        }
        
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Request timed out. Please try again.")
    except Exception as e:
        logger.error(f"Web image fetch error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch image: {str(e)}")

@api_router.get("/inventory/stats/summary")
async def get_inventory_stats(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Get inventory statistics summary"""
    # Use aggregation for better performance with large datasets
    pipeline = [
        {'$match': {'organization_id': organization_id}},
        {'$group': {
            '_id': None,
            'total_items': {'$sum': 1},
            'active_items': {'$sum': {'$cond': [{'$ne': ['$is_active', False]}, 1, 0]}},
            'low_stock_count': {'$sum': {'$cond': [{'$lte': ['$on_hand_qty', '$min_qty']}, 1, 0]}}
        }}
    ]
    
    stats_result = await db.inventory_items.aggregate(pipeline).to_list(1)
    stats = stats_result[0] if stats_result else {'total_items': 0, 'active_items': 0, 'low_stock_count': 0}
    
    # Get items for value calculation (sample for large datasets)
    total_count = await db.inventory_items.count_documents({'organization_id': organization_id})
    
    # Get current LBP rate for currency conversion
    org = await db.organizations.find_one({'id': organization_id}, {'_id': 0})
    lbp_rate = org.get('lbp_rate', 89500) if org else 89500
    
    # Calculate total value using aggregation
    value_pipeline = [
        {'$match': {'organization_id': organization_id}},
        {'$project': {
            'cost_value': {'$multiply': [{'$ifNull': ['$cost', 0]}, {'$ifNull': ['$on_hand_qty', 0]}]},
            'retail_value': {'$multiply': [{'$ifNull': ['$price', 0]}, {'$ifNull': ['$on_hand_qty', 0]}]},
            'currency': {'$ifNull': ['$currency', 'USD']}
        }},
        {'$group': {
            '_id': '$currency',
            'total_cost': {'$sum': '$cost_value'},
            'total_retail': {'$sum': '$retail_value'}
        }}
    ]
    
    value_result = await db.inventory_items.aggregate(value_pipeline).to_list(10)
    
    total_cost_value = 0
    total_retail_value = 0
    for v in value_result:
        if v['_id'] == 'LBP':
            total_cost_value += v['total_cost'] / lbp_rate
            total_retail_value += v['total_retail'] / lbp_rate
        else:
            total_cost_value += v['total_cost']
            total_retail_value += v['total_retail']
    
    # Expiring items (within 30 days) - count only
    from datetime import datetime, timedelta
    threshold = (datetime.now() + timedelta(days=30)).isoformat()[:10]
    expiring_count = await db.inventory_items.count_documents({
        'organization_id': organization_id,
        'expiry_date': {'$lte': threshold, '$ne': None}
    })
    
    return {
        'total_items': total_count,
        'active_items': stats.get('active_items', 0),
        'low_stock_items': stats.get('low_stock_count', 0),
        'expiring_items': expiring_count,
        'total_cost_value': round(total_cost_value, 2),
        'total_retail_value': round(total_retail_value, 2),
        'lbp_rate': lbp_rate
    }

'''

@api_router.post("/inventory/import-dbf")
async def import_inventory_from_dbf(
    file: UploadFile = File(...),
    organization_id: str = None,
    field_mapping: str = Form(None),
    create_suppliers: str = Form('true'),
    supplier_parent_code: str = Form('401'),
    update_existing: str = Form('false'),  # NEW: Update existing items instead of skipping
    current_user: dict = Depends(get_current_user)
):
    """Import inventory items from a DBF file with manual field mapping - optimized for large files"""
    from dbfread import DBF
    import tempfile
    import os
    import json as json_module
    
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if not organization_id:
        raise HTTPException(status_code=400, detail="organization_id is required")
    
    if not file.filename.lower().endswith('.dbf'):
        raise HTTPException(status_code=400, detail="File must be a .dbf file")
    
    # Parse field mapping from JSON string
    custom_mapping = {}
    if field_mapping:
        try:
            custom_mapping = json_module.loads(field_mapping)
        except:
            pass
    
    # Parse update_existing boolean
    should_update_existing = update_existing.lower() in ('true', '1', 'yes')
    
    tmp_path = None
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.dbf') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        # Try multiple encodings - DBF files from different regions use different encodings
        # Include encodings that handle 0xff byte (common in Arabic/ME files)
        encodings_to_try = [
            'cp1256',      # Arabic Windows encoding (handles 0xff)
            'cp1252',      # Western European Windows
            'latin-1',     # ISO-8859-1 (handles all bytes 0x00-0xff)
            'iso-8859-6',  # Arabic ISO encoding
            'cp850',       # DOS Latin-1
            'cp437',       # DOS US
            'utf-8',       # Unicode (try last as it's strict)
        ]
        table = None
        used_encoding = None
        last_error = None
        
        for encoding in encodings_to_try:
            try:
                table = DBF(tmp_path, encoding=encoding, ignore_missing_memofile=True)
                # Try to iterate first 10 records to verify encoding works
                test_count = 0
                for record in table:
                    # Also try to access record data to fully test encoding
                    _ = dict(record)
                    test_count += 1
                    if test_count >= 10:
                        break
                used_encoding = encoding
                logger.info(f"DBF Import: Successfully opened file with encoding: {encoding}")
                break
            except Exception as e:
                last_error = str(e)
                table = None
                continue
        
        if table is None or used_encoding is None:
            raise HTTPException(
                status_code=400, 
                detail=f"Could not decode DBF file. Last error: {last_error}. The file may be corrupted or use an unsupported encoding."
            )
        
        # Re-open with the working encoding for fresh iteration
        table = DBF(tmp_path, encoding=used_encoding, ignore_missing_memofile=True)
        
        # Get field names for reference
        field_names = table.field_names
        
        # Count total records first (quick pass)
        total_records = sum(1 for _ in table)
        logger.info(f"DBF Import: Found {total_records} records to process")
        
        # Re-open for fresh iteration
        table = DBF(tmp_path, encoding=used_encoding, ignore_missing_memofile=True)
        
        # Detect if this file uses Nafitha Arabic encoding (check first 10 records only)
        is_nafitha = False
        sample_count = 0
        for record in table:
            sample_count += 1
            if sample_count > 10:
                break
            for k, v in dict(record).items():
                if isinstance(v, str) and detect_nafitha_encoding(v):
                    is_nafitha = True
                    break
            if is_nafitha:
                break
        
        # Re-open for fresh iteration
        table = DBF(tmp_path, encoding=used_encoding, ignore_missing_memofile=True)
        
        # Use custom mapping provided by user (manual mapping is required)
        mapped_fields = custom_mapping if custom_mapping else {}
        
        # Validate that name field is mapped
        if 'name' not in mapped_fields:
            raise HTTPException(status_code=400, detail="Name field mapping is required")
        
        # Parse create_suppliers boolean
        should_create_suppliers = create_suppliers.lower() in ('true', '1', 'yes')
        
        # Helper function to get and optionally decode field value
        def get_field_value(record, field_name, decode_arabic=False):
            value = record.get(field_name, '')
            if value is None:
                return ''
            value = str(value).strip()
            if decode_arabic and is_nafitha:
                value = decode_nafitha_arabic(value)
            return value
        
        # Prepare supplier tracking
        suppliers_created = {}
        new_suppliers = []
        existing_codes = set()
        next_supplier_num = 1
        parent_account = None
        
        # If supplier mapping exists and we should create suppliers, get existing suppliers
        if 'supplier' in mapped_fields and should_create_suppliers:
            # Get parent account for suppliers
            parent_account = await db.accounts.find_one({
                'organization_id': organization_id,
                'code': supplier_parent_code
            })
            
            if not parent_account:
                # Create default supplier parent if it doesn't exist
                parent_account = {
                    'id': str(uuid.uuid4()),
                    'organization_id': organization_id,
                    'code': supplier_parent_code,
                    'name': 'Suppliers',
                    'name_ar': 'الموردون',
                    'account_class': 4,
                    'account_type': 'liability',
                    'is_active': True,
                    'balance_lbp': 0,
                    'balance_usd': 0,
                    'created_at': datetime.now(timezone.utc).isoformat()
                }
                await db.accounts.insert_one(parent_account)
            
            # Get existing suppliers under this parent
            existing_suppliers = await db.accounts.find({
                'organization_id': organization_id,
                'code': {'$regex': f'^{supplier_parent_code}'}
            }).to_list(None)
            
            # Map supplier names to their accounts
            for sup in existing_suppliers:
                suppliers_created[sup.get('name', '').lower()] = sup['id']
            
            # Find next available code
            existing_codes = set(sup['code'] for sup in existing_suppliers)
            next_supplier_num = 1
            for code in existing_codes:
                if len(code) > len(supplier_parent_code):
                    try:
                        num = int(code[len(supplier_parent_code):])
                        if num >= next_supplier_num:
                            next_supplier_num = num + 1
                    except ValueError:
                        pass
        
        # Pre-fetch existing items for duplicate checking and updating
        existing_barcodes = {}  # barcode -> item_id
        existing_skus = {}  # sku -> item_id
        
        existing_items = await db.inventory_items.find(
            {'organization_id': organization_id},
            {'_id': 0, 'id': 1, 'barcode': 1, 'sku': 1}
        ).to_list(None)
        
        for item in existing_items:
            if item.get('barcode'):
                existing_barcodes[item['barcode']] = item['id']
            if item.get('sku'):
                existing_skus[item['sku']] = item['id']
        
        logger.info(f"DBF Import: Found {len(existing_barcodes)} existing barcodes, {len(existing_skus)} existing SKUs")
        
        # Fetch organization's tax rate for TTC->HT conversion
        org = await db.organizations.find_one({'id': organization_id}, {'_id': 0, 'tax_percent': 1})
        org_tax_rate = (org.get('tax_percent', 11.0) if org else 11.0) / 100  # Convert 11 to 0.11
        logger.info(f"DBF Import: Using organization tax rate: {org_tax_rate * 100}%")
        
        # Import records in batches
        BATCH_SIZE = 500  # Insert 500 items at a time
        imported = 0
        updated = 0
        skipped = 0
        errors = []
        categories_created = {}
        items_batch = []
        updates_batch = []  # For updating existing items
        suppliers_batch = []
        
        for record in table:
            try:
                # Extract data using mapped fields
                item_data = {
                    'organization_id': organization_id,
                    'is_active': True,
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                    'batches': []
                }
                
                # Map fields - decode Arabic for text fields
                if 'code' in mapped_fields:
                    item_data['sku'] = get_field_value(record, mapped_fields['code']) or None
                
                if 'barcode' in mapped_fields:
                    item_data['barcode'] = get_field_value(record, mapped_fields['barcode']) or None
                
                if 'moh_code' in mapped_fields:
                    item_data['moh_code'] = get_field_value(record, mapped_fields['moh_code']) or None
                
                if 'name' in mapped_fields:
                    item_data['name'] = get_field_value(record, mapped_fields['name'], decode_arabic=True)
                else:
                    # Try to use code as name if no name field
                    item_data['name'] = item_data.get('sku') or f"Item-{imported + 1}"
                
                if 'name_ar' in mapped_fields:
                    item_data['name_ar'] = get_field_value(record, mapped_fields['name_ar'], decode_arabic=True) or None
                
                if 'unit' in mapped_fields:
                    unit = str(record.get(mapped_fields['unit'], '')).strip().lower()
                    valid_units = ['piece', 'kg', 'gram', 'liter', 'ml', 'box', 'pack', 'carton', 'bottle', 'can', 'tube', 'strip']
                    item_data['unit'] = unit if unit in valid_units else 'piece'
                else:
                    item_data['unit'] = 'piece'
                
                # First, determine if item is taxable based on TVA field
                # TVA = '0' means not taxable, TVA = '11' (or any non-zero value) means taxable
                # Use organization's configured tax rate for TTC->HT conversion
                is_taxable = False
                if 'tva' in mapped_fields:
                    try:
                        tva_value = str(record.get(mapped_fields['tva'], '0') or '0').strip()
                        # Check if value is non-zero (handles '11', '11.0', etc.)
                        tva_numeric = float(tva_value) if tva_value else 0
                        is_taxable = tva_numeric > 0
                    except (ValueError, TypeError):
                        is_taxable = False
                
                item_data['is_taxable'] = is_taxable
                
                # Price and Cost - Prices in DBF are TTC (Tax Included)
                # We need to convert to HT (Excluding Tax) using org's tax rate if item is taxable
                price_ttc = 0
                cost_ttc = 0
                
                if 'price' in mapped_fields:
                    try:
                        price_ttc = float(record.get(mapped_fields['price'], 0) or 0)
                    except (ValueError, TypeError):
                        price_ttc = 0
                
                if 'cost' in mapped_fields:
                    try:
                        cost_ttc = float(record.get(mapped_fields['cost'], 0) or 0)
                    except (ValueError, TypeError):
                        cost_ttc = 0
                
                # Convert TTC to HT if taxable using organization's tax rate
                if is_taxable and org_tax_rate > 0:
                    # Price HT = Price TTC / (1 + org_tax_rate)
                    item_data['price'] = round(price_ttc / (1 + org_tax_rate), 2)
                    item_data['cost'] = round(cost_ttc / (1 + org_tax_rate), 2)
                else:
                    item_data['price'] = price_ttc
                    item_data['cost'] = cost_ttc
                
                # Currency mapping
                if 'currency' in mapped_fields:
                    currency_val = get_field_value(record, mapped_fields['currency']).upper()
                    if currency_val in ['USD', 'LBP', '$', 'L.L', 'LL']:
                        item_data['currency'] = 'USD' if currency_val in ['USD', '$'] else 'LBP'
                    else:
                        item_data['currency'] = 'USD'
                else:
                    item_data['currency'] = 'USD'
                
                # Category mapping - Create category in database if it doesn't exist
                if 'category' in mapped_fields:
                    category_name = get_field_value(record, mapped_fields['category'], decode_arabic=True)
                    if category_name:
                        category_key = category_name.lower().strip()
                        
                        # Check if we've already processed this category
                        if category_key not in categories_created:
                            # Check if category exists in database (using inventory_categories collection)
                            existing_cat = await db.inventory_categories.find_one({
                                'organization_id': organization_id,
                                'name': {'$regex': f'^{category_name}$', '$options': 'i'}
                            })
                            
                            if existing_cat:
                                categories_created[category_key] = existing_cat['id']
                            else:
                                # Create new category with just the name
                                new_category = {
                                    'id': str(uuid.uuid4()),
                                    'organization_id': organization_id,
                                    'name': category_name,
                                    'created_at': datetime.now(timezone.utc).isoformat()
                                }
                                await db.inventory_categories.insert_one(new_category)
                                categories_created[category_key] = new_category['id']
                                logger.info(f"DBF Import: Created category '{category_name}'")
                        
                        # Set both category name and ID
                        item_data['category'] = category_name
                        item_data['category_id'] = categories_created.get(category_key)
                
                # Country of origin mapping
                if 'country_of_origin' in mapped_fields or 'origine' in mapped_fields:
                    origin_field = mapped_fields.get('country_of_origin') or mapped_fields.get('origine')
                    country = get_field_value(record, origin_field, decode_arabic=True)
                    if country:
                        item_data['country_of_origin'] = country
                
                # Discount percent mapping
                if 'discount' in mapped_fields or 'disc' in mapped_fields:
                    disc_field = mapped_fields.get('discount') or mapped_fields.get('disc')
                    try:
                        item_data['discount_percent'] = float(record.get(disc_field, 0) or 0)
                    except (ValueError, TypeError):
                        item_data['discount_percent'] = 0
                
                if 'on_hand_qty' in mapped_fields:
                    try:
                        item_data['on_hand_qty'] = float(record.get(mapped_fields['on_hand_qty'], 0) or 0)
                    except (ValueError, TypeError):
                        item_data['on_hand_qty'] = 0
                else:
                    item_data['on_hand_qty'] = 0
                
                if 'min_stock' in mapped_fields or 'min_qty' in mapped_fields:
                    try:
                        min_field = 'min_qty' if 'min_qty' in mapped_fields else 'min_stock'
                        item_data['min_qty'] = float(record.get(mapped_fields[min_field], 0) or 0)
                    except (ValueError, TypeError):
                        item_data['min_qty'] = 0
                
                # Handle supplier
                if 'supplier' in mapped_fields and should_create_suppliers and parent_account:
                    supplier_name = get_field_value(record, mapped_fields['supplier'], decode_arabic=True)
                    if supplier_name:
                        supplier_key = supplier_name.lower()
                        
                        if supplier_key not in suppliers_created:
                            # Create new supplier account
                            new_code = f"{supplier_parent_code}{next_supplier_num:04d}"
                            while new_code in existing_codes:
                                next_supplier_num += 1
                                new_code = f"{supplier_parent_code}{next_supplier_num:04d}"
                            
                            new_supplier = {
                                'id': str(uuid.uuid4()),
                                'organization_id': organization_id,
                                'code': new_code,
                                'name': supplier_name,
                                'name_ar': supplier_name if is_nafitha else None,
                                'parent_id': parent_account['id'],
                                'account_class': 4,
                                'account_type': 'liability',
                                'is_active': True,
                                'balance_lbp': 0,
                                'balance_usd': 0,
                                'created_at': datetime.now(timezone.utc).isoformat()
                            }
                            
                            suppliers_batch.append(new_supplier)
                            suppliers_created[supplier_key] = new_supplier['id']
                            new_suppliers.append({'code': new_code, 'name': supplier_name})
                            existing_codes.add(new_code)
                            next_supplier_num += 1
                        
                        if supplier_key in suppliers_created:
                            item_data['supplier_id'] = suppliers_created[supplier_key]
                
                # Skip items without a name
                if not item_data.get('name') or not item_data['name'].strip():
                    skipped += 1
                    continue
                
                # Check for existing items by barcode or SKU
                existing_item_id = None
                if item_data.get('barcode') and item_data['barcode'] in existing_barcodes:
                    existing_item_id = existing_barcodes[item_data['barcode']]
                elif item_data.get('sku') and item_data['sku'] in existing_skus:
                    existing_item_id = existing_skus[item_data['sku']]
                
                if existing_item_id:
                    if should_update_existing:
                        # Update existing item instead of skipping
                        item_data.pop('organization_id', None)  # Don't change org
                        item_data.pop('batches', None)  # Don't overwrite batches
                        updates_batch.append({
                            'filter': {'id': existing_item_id},
                            'update': {'$set': item_data}
                        })
                        updated += 1
                    else:
                        skipped += 1
                    continue
                
                # New item - add to batch
                item_data['id'] = str(uuid.uuid4())
                item_data['created_at'] = datetime.now(timezone.utc).isoformat()
                item_data['created_by'] = current_user['id']
                items_batch.append(item_data)
                
                # Track as existing to prevent duplicates within the import
                if item_data.get('barcode'):
                    existing_barcodes[item_data['barcode']] = item_data['id']
                if item_data.get('sku'):
                    existing_skus[item_data['sku']] = item_data['id']
                imported += 1
                
                # Insert/update batch when it reaches BATCH_SIZE
                if len(items_batch) >= BATCH_SIZE or len(updates_batch) >= BATCH_SIZE:
                    if suppliers_batch:
                        await db.accounts.insert_many(suppliers_batch)
                        suppliers_batch = []
                    if items_batch:
                        await db.inventory_items.insert_many(items_batch)
                        logger.info(f"DBF Import: Inserted batch of {len(items_batch)} items. Total imported: {imported}")
                        items_batch = []
                    if updates_batch:
                        # Use bulk_write for efficient batch updates
                        from pymongo import UpdateOne
                        bulk_ops = [UpdateOne(op['filter'], op['update']) for op in updates_batch]
                        await db.inventory_items.bulk_write(bulk_ops, ordered=False)
                        logger.info(f"DBF Import: Updated batch of {len(updates_batch)} items. Total updated: {updated}")
                        updates_batch = []
                
            except Exception as e:
                errors.append(str(e))
                if len(errors) > 100:  # Allow more errors for large imports
                    break
        
        # Insert/update remaining items in final batch
        if suppliers_batch:
            await db.accounts.insert_many(suppliers_batch)
        if items_batch:
            await db.inventory_items.insert_many(items_batch)
            logger.info(f"DBF Import: Inserted final batch of {len(items_batch)} items. Total imported: {imported}")
        if updates_batch:
            # Use bulk_write for efficient batch updates
            from pymongo import UpdateOne
            bulk_ops = [UpdateOne(op['filter'], op['update']) for op in updates_batch]
            await db.inventory_items.bulk_write(bulk_ops, ordered=False)
            logger.info(f"DBF Import: Updated final batch of {len(updates_batch)} items. Total updated: {updated}")
            logger.info(f"DBF Import: Updated final batch of {len(updates_batch)} items. Total updated: {updated}")
        
        return {
            'message': f'Import completed successfully',
            'total_records': total_records,
            'imported': imported,
            'updated': updated,
            'skipped': skipped,
            'categories_created': len(categories_created),
            'suppliers_created': len(new_suppliers),
            'new_suppliers': new_suppliers[:20],  # Return first 20
            'field_mapping': {k: v for k, v in mapped_fields.items()},
            'available_fields': field_names,
            'errors': errors[:10] if errors else [],
            'detected_encoding': used_encoding
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"DBF import error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to import DBF file: {str(e)}")
    finally:
        # Clean up temp file
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except:
                pass

@api_router.post("/inventory/preview-dbf")
async def preview_dbf_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Preview DBF file structure and sample data"""
    from dbfread import DBF
    import tempfile
    import os
    
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if not file.filename.lower().endswith('.dbf'):
        raise HTTPException(status_code=400, detail="File must be a .dbf file")
    
    tmp_path = None
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.dbf') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        # Try multiple encodings - DBF files from different regions use different encodings
        # Include encodings that handle 0xff byte (common in Arabic/ME files)
        encodings_to_try = [
            'cp1256',      # Arabic Windows encoding (handles 0xff)
            'cp1252',      # Western European Windows
            'latin-1',     # ISO-8859-1 (handles all bytes 0x00-0xff)
            'iso-8859-6',  # Arabic ISO encoding
            'cp850',       # DOS Latin-1
            'cp437',       # DOS US
            'utf-8',       # Unicode (try last as it's strict)
        ]
        table = None
        used_encoding = None
        last_error = None
        
        for encoding in encodings_to_try:
            try:
                table = DBF(tmp_path, encoding=encoding, ignore_missing_memofile=True)
                # Try to iterate first 50 records to verify encoding works
                test_count = 0
                for record in table:
                    _ = dict(record)
                    test_count += 1
                    if test_count >= 50:
                        break
                used_encoding = encoding
                logger.info(f"DBF Preview: Successfully opened file with encoding: {encoding}")
                break
            except Exception as e:
                last_error = str(e)
                table = None
                continue
        
        if table is None or used_encoding is None:
            raise HTTPException(
                status_code=400, 
                detail=f"Could not decode DBF file. Last error: {last_error}. The file may be corrupted or use an unsupported encoding."
            )
        
        # Re-open with the working encoding for fresh iteration
        table = DBF(tmp_path, encoding=used_encoding, ignore_missing_memofile=True)
        
        # Get field info
        fields = []
        for field in table.fields:
            fields.append({
                'name': field.name,
                'type': field.type,
                'length': field.length
            })
        
        # Get all records for count and sample
        all_records = list(table)
        total_records = len(all_records)
        
        # Detect if this file uses Nafitha Arabic encoding
        is_nafitha = False
        for record in all_records[:10]:
            for k, v in dict(record).items():
                if isinstance(v, str) and detect_nafitha_encoding(v):
                    is_nafitha = True
                    break
            if is_nafitha:
                break
        
        # Get sample records (first 5)
        sample_records = []
        for i, record in enumerate(all_records):
            if i >= 5:
                break
            # Convert record values to strings to avoid serialization issues
            clean_record = {}
            for k, v in dict(record).items():
                if v is None:
                    clean_record[k] = None
                elif isinstance(v, bytes):
                    clean_record[k] = v.decode(used_encoding, errors='replace')
                elif isinstance(v, str):
                    # Apply Nafitha decoding if detected
                    if is_nafitha:
                        clean_record[k] = decode_nafitha_arabic(v)
                    else:
                        clean_record[k] = v
                else:
                    clean_record[k] = str(v) if not isinstance(v, (int, float, bool)) else v
            sample_records.append(clean_record)
        
        return {
            'filename': file.filename,
            'total_records': total_records,
            'fields': fields,
            'sample_data': sample_records,
            'detected_encoding': used_encoding,
            'is_nafitha_arabic': is_nafitha
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"DBF preview error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to read DBF file: {str(e)}")
    finally:
        # Clean up temp file
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except:
                pass


# ================== SUPPLIER DBF IMPORT ==================

@api_router.post("/suppliers/preview-dbf")
async def preview_supplier_dbf_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Preview DBF file for supplier import"""
    from dbfread import DBF
    import tempfile
    import os
    
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if not file.filename.lower().endswith('.dbf'):
        raise HTTPException(status_code=400, detail="File must be a .dbf file")
    
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.dbf') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        encodings_to_try = ['utf-8', 'latin-1', 'cp1252', 'cp850', 'iso-8859-1', 'cp437', 'ascii']
        table = None
        used_encoding = None
        
        for encoding in encodings_to_try:
            try:
                table = DBF(tmp_path, encoding=encoding, ignore_missing_memofile=True)
                _ = list(table)
                used_encoding = encoding
                break
            except (UnicodeDecodeError, Exception):
                continue
        
        if table is None:
            raise HTTPException(status_code=400, detail="Could not decode DBF file")
        
        table = DBF(tmp_path, encoding=used_encoding, ignore_missing_memofile=True)
        
        fields = [{'name': f.name, 'type': f.type, 'length': f.length} for f in table.fields]
        all_records = list(table)
        
        # Detect Nafitha encoding
        is_nafitha = False
        for record in all_records[:10]:
            for k, v in dict(record).items():
                if isinstance(v, str) and detect_nafitha_encoding(v):
                    is_nafitha = True
                    break
            if is_nafitha:
                break
        
        # Get sample records
        sample_records = []
        for i, record in enumerate(all_records[:5]):
            clean_record = {}
            for k, v in dict(record).items():
                if v is None:
                    clean_record[k] = None
                elif isinstance(v, str):
                    clean_record[k] = decode_nafitha_arabic(v) if is_nafitha else v
                else:
                    clean_record[k] = str(v) if not isinstance(v, (int, float, bool)) else v
            sample_records.append(clean_record)
        
        return {
            'filename': file.filename,
            'total_records': len(all_records),
            'fields': fields,
            'sample_data': sample_records,
            'detected_encoding': used_encoding,
            'is_nafitha_arabic': is_nafitha
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Supplier DBF preview error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to read DBF file: {str(e)}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except:
                pass


@api_router.post("/suppliers/import-dbf")
async def import_suppliers_from_dbf(
    file: UploadFile = File(...),
    organization_id: str = None,
    parent_account_code: str = Form(...),  # Starting account code (e.g., '401' for Suppliers)
    field_mapping: str = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """Import suppliers from a DBF file into Chart of Accounts"""
    from dbfread import DBF
    import tempfile
    import os
    import json as json_module
    
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if not organization_id:
        raise HTTPException(status_code=400, detail="organization_id is required")
    
    if not file.filename.lower().endswith('.dbf'):
        raise HTTPException(status_code=400, detail="File must be a .dbf file")
    
    # Parse field mapping
    custom_mapping = {}
    if field_mapping:
        try:
            custom_mapping = json_module.loads(field_mapping)
        except:
            pass
    
    if 'name' not in custom_mapping:
        raise HTTPException(status_code=400, detail="Name field mapping is required")
    
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.dbf') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        encodings_to_try = ['utf-8', 'latin-1', 'cp1252', 'cp850', 'iso-8859-1', 'cp437', 'ascii']
        table = None
        used_encoding = None
        
        for encoding in encodings_to_try:
            try:
                table = DBF(tmp_path, encoding=encoding, ignore_missing_memofile=True)
                _ = list(table)
                used_encoding = encoding
                break
            except (UnicodeDecodeError, Exception):
                continue
        
        if table is None:
            raise HTTPException(status_code=400, detail="Could not decode DBF file")
        
        table = DBF(tmp_path, encoding=used_encoding, ignore_missing_memofile=True)
        
        # Detect Nafitha encoding
        all_records_list = list(table)
        is_nafitha = False
        for record in all_records_list[:10]:
            for k, v in dict(record).items():
                if isinstance(v, str) and detect_nafitha_encoding(v):
                    is_nafitha = True
                    break
            if is_nafitha:
                break
        
        table = DBF(tmp_path, encoding=used_encoding, ignore_missing_memofile=True)
        
        # Helper function
        def get_field_value(record, field_name, decode_arabic=False):
            value = record.get(field_name, '')
            if value is None:
                return ''
            value = str(value).strip()
            if decode_arabic and is_nafitha:
                value = decode_nafitha_arabic(value)
            return value
        
        # Find the parent account
        parent_account = await db.accounts.find_one({
            'organization_id': organization_id,
            'code': parent_account_code
        })
        
        if not parent_account:
            raise HTTPException(status_code=400, detail=f"Parent account with code '{parent_account_code}' not found")
        
        # Find the next available code under this parent
        existing_codes = await db.accounts.find({
            'organization_id': organization_id,
            'code': {'$regex': f'^{parent_account_code}'}
        }, {'code': 1}).to_list(None)
        
        existing_code_set = set(acc['code'] for acc in existing_codes)
        
        # Determine starting code
        base_code_len = len(parent_account_code)
        next_code_num = 1
        
        # Find highest existing sub-code
        for code in existing_code_set:
            if len(code) > base_code_len:
                try:
                    sub_num = int(code[base_code_len:])
                    if sub_num >= next_code_num:
                        next_code_num = sub_num + 1
                except ValueError:
                    pass
        
        # Import records
        imported = 0
        skipped = 0
        errors = []
        created_suppliers = []
        
        for record in table:
            try:
                name = get_field_value(record, custom_mapping['name'], decode_arabic=True)
                
                if not name:
                    skipped += 1
                    continue
                
                # Check if supplier already exists by name
                existing = await db.accounts.find_one({
                    'organization_id': organization_id,
                    'name': {'$regex': f'^{name}$', '$options': 'i'}
                })
                
                if existing:
                    skipped += 1
                    continue
                
                # Generate code
                new_code = f"{parent_account_code}{next_code_num:03d}"
                while new_code in existing_code_set:
                    next_code_num += 1
                    new_code = f"{parent_account_code}{next_code_num:03d}"
                
                existing_code_set.add(new_code)
                
                # Build supplier account data
                supplier_data = {
                    'id': str(uuid.uuid4()),
                    'organization_id': organization_id,
                    'code': new_code,
                    'name': name,
                    'account_class': parent_account.get('account_class', 4),  # Default to liability
                    'account_type': parent_account.get('account_type', 'liability'),
                    'is_active': True,
                    'balance_lbp': 0,
                    'balance_usd': 0,
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'created_by': current_user['id']
                }
                
                # Map optional fields
                if 'name_ar' in custom_mapping:
                    supplier_data['name_ar'] = get_field_value(record, custom_mapping['name_ar'], decode_arabic=True) or None
                
                if 'mobile' in custom_mapping:
                    supplier_data['mobile'] = get_field_value(record, custom_mapping['mobile']) or None
                
                if 'address' in custom_mapping:
                    supplier_data['address'] = get_field_value(record, custom_mapping['address'], decode_arabic=True) or None
                
                if 'email' in custom_mapping:
                    supplier_data['email'] = get_field_value(record, custom_mapping['email']) or None
                
                if 'contact_person' in custom_mapping:
                    supplier_data['contact_person'] = get_field_value(record, custom_mapping['contact_person'], decode_arabic=True) or None
                
                if 'notes' in custom_mapping:
                    supplier_data['notes'] = get_field_value(record, custom_mapping['notes'], decode_arabic=True) or None
                
                # Handle opening balance
                if 'balance' in custom_mapping:
                    try:
                        balance = float(record.get(custom_mapping['balance'], 0) or 0)
                        supplier_data['balance_usd'] = balance
                    except:
                        pass
                
                if 'balance_lbp' in custom_mapping:
                    try:
                        balance = float(record.get(custom_mapping['balance_lbp'], 0) or 0)
                        supplier_data['balance_lbp'] = balance
                    except:
                        pass
                
                await db.accounts.insert_one(supplier_data)
                created_suppliers.append({'name': name, 'code': new_code})
                imported += 1
                next_code_num += 1
                
            except Exception as e:
                errors.append(str(e))
                if len(errors) > 10:
                    break
        
        return {
            'message': 'Import completed',
            'imported': imported,
            'skipped': skipped,
            'parent_account': parent_account_code,
            'created_suppliers': created_suppliers[:20],  # Return first 20
            'field_mapping': custom_mapping,
            'errors': errors[:10] if errors else [],
            'is_nafitha_arabic': is_nafitha
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Supplier DBF import error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to import suppliers: {str(e)}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except:
                pass


# ================== SALES INVOICE MODULE ==================

async def generate_invoice_number(organization_id: str) -> str:
    """Generate sequential invoice number for the organization"""
    year = datetime.now().year
    prefix = f"INV-{year}-"
    
    # Find the highest invoice number for this year
    last_invoice = await db.sales_invoices.find_one(
        {
            'organization_id': organization_id,
            'invoice_number': {'$regex': f'^{prefix}'}
        },
        {'invoice_number': 1},
        sort=[('invoice_number', -1)]
    )
    
    if last_invoice:
        last_num = int(last_invoice['invoice_number'].split('-')[-1])
        new_num = last_num + 1
    else:
        new_num = 1
    
    return f"{prefix}{new_num:05d}"

# ================== INVOICES (MOVED TO routers/invoices.py) ==================
# NOTE: All sales-invoices and purchase-invoices endpoints are in routers/invoices.py

# ================== POS ENDPOINTS ==================

@api_router.get("/pos/inventory")
async def get_pos_inventory(
    organization_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all inventory items for POS with minimal fields for fast loading"""
    # Only fetch essential fields for POS display
    projection = {
        '_id': 0,
        'id': 1,
        'barcode': 1,
        'sku': 1,
        'moh_code': 1,
        'name': 1,
        'name_ar': 1,
        'price': 1,
        'cost': 1,
        'currency': 1,
        'on_hand_qty': 1,
        'unit': 1,
        'image_filename': 1,
        'image_url': 1,  # S3 URL for images
        'image_s3_key': 1,  # S3 key for image reference
        'is_taxable': 1,
        'is_pos_item': 1,
        'show_image_in_pos': 1,
        'batches': 1
    }
    
    items = await db.inventory_items.find(
        {'organization_id': organization_id, 'is_active': True},
        projection
    ).sort('name', 1).to_list(None)  # Get all items
    
    return items

async def generate_receipt_number(organization_id: str) -> str:
    """Generate next receipt number for POS"""
    year = datetime.now().year
    prefix = f"POS-{year}-"
    
    last_transaction = await db.pos_transactions.find_one(
        {'organization_id': organization_id, 'receipt_number': {'$regex': f'^{prefix}'}},
        sort=[('receipt_number', -1)]
    )
    
    if last_transaction:
        last_num = int(last_transaction['receipt_number'].split('-')[-1])
        next_num = last_num + 1
    else:
        next_num = 1
    
    return f"{prefix}{next_num:05d}"

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

@api_router.get("/pos/transactions", response_model=List[POSTransactionResponse])
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

@api_router.get("/pos/transactions/count")
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

@api_router.get("/pos/transactions/{transaction_id}", response_model=POSTransactionResponse)
async def get_pos_transaction(transaction_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single POS transaction"""
    transaction = await db.pos_transactions.find_one({'id': transaction_id}, {'_id': 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    return await enrich_pos_transaction(transaction)

@api_router.delete("/pos/invoices/{transaction_id}")
async def delete_pos_transaction(
    transaction_id: str,
    restore_inventory: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """Delete a POS transaction and its connected voucher, optionally restore inventory"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Only admins can delete POS transactions")
    
    # Find the transaction
    transaction = await db.pos_transactions.find_one({'id': transaction_id}, {'_id': 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    voucher_id = transaction.get('voucher_id')
    receipt_number = transaction.get('receipt_number', 'Unknown')
    voucher_number = None
    
    # Delete connected voucher if exists
    if voucher_id:
        voucher = await db.vouchers.find_one({'id': voucher_id}, {'_id': 0})
        if voucher:
            voucher_number = voucher.get('voucher_number')
            
            # Reverse the account balances from the voucher
            for line in voucher.get('lines', []):
                account_id = line.get('account_id')
                debit_usd = line.get('debit_usd', 0) or 0
                credit_usd = line.get('credit_usd', 0) or 0
                debit_lbp = line.get('debit_lbp', 0) or 0
                credit_lbp = line.get('credit_lbp', 0) or 0
                
                # Reverse: subtract what was added
                await db.accounts.update_one(
                    {'id': account_id},
                    {'$inc': {
                        'balance_usd': -(debit_usd - credit_usd),
                        'balance_lbp': -(debit_lbp - credit_lbp)
                    }}
                )
            
            # Delete the voucher
            await db.vouchers.delete_one({'id': voucher_id})
    
    # Restore inventory if requested
    if restore_inventory:
        for line in transaction.get('lines', []):
            if line.get('inventory_item_id'):
                await db.inventory_items.update_one(
                    {'id': line['inventory_item_id']},
                    {'$inc': {'on_hand_qty': line.get('quantity', 0)}}
                )
    
    # Delete the transaction
    await db.pos_transactions.delete_one({'id': transaction_id})
    
    return {
        "message": f"Transaction {receipt_number} deleted successfully",
        "voucher_deleted": voucher_number,
        "inventory_restored": restore_inventory
    }

@api_router.post("/pos/transactions", response_model=POSTransactionResponse)
async def create_pos_transaction(
    transaction_data: POSTransactionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new POS transaction and auto-post voucher"""
    if current_user['role'] not in ['super_admin', 'admin', 'accountant', 'cashier']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
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
    payment_adjustment = getattr(transaction_data, 'payment_adjustment', 0) or 0
    
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
        'payment_adjustment': payment_adjustment,
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
    # Use SV prefix for sales vouchers to track with sales invoices
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
    if payment_adjustment != 0:
        # Try to find discount account by code 72110001 first, then fallbacks
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
            # Try to find any discount account starting with 721
            discount_acc = await db.accounts.find_one({
                'organization_id': transaction_data.organization_id,
                'code': {'$regex': '^721'}
            })
        
        # If discount account doesn't exist and we have an adjustment, create it with correct code
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
    
    # Create voucher description based on payment method
    payment_desc = {
        'cash': 'Cash Sale',
        'card': 'Card/Bank Sale',
        'customer': f'Credit Sale to {transaction_data.customer_name or "Customer"}'
    }.get(transaction_data.payment_method, 'POS Sale')
    
    # Calculate actual amounts considering adjustment
    # If adjustment > 0 (discount), we received less than total
    # If adjustment < 0 (premium), we received more than total
    
    # Get LBP rate - ensure it's valid
    lbp_rate = transaction_data.lbp_rate or 89500
    
    # Calculate total_lbp if not provided
    total_lbp = transaction_data.total_lbp or (transaction_data.total_usd * lbp_rate)
    
    # Handle payment currency
    if transaction_data.payment_currency == 'LBP':
        # Payment was in LBP - convert adjustment to proper amounts
        # The adjustment should be calculated based on LBP difference
        payment_in_usd = (transaction_data.payment_amount or 0) / lbp_rate
        actual_received = payment_in_usd
        actual_received_lbp = transaction_data.payment_amount or total_lbp
        
        # Recalculate adjustment based on actual payment in USD vs total
        if payment_adjustment == 0:
            # Calculate adjustment from payment amount
            payment_adjustment = transaction_data.total_usd - payment_in_usd
    else:
        # Payment was in USD
        actual_received = transaction_data.total_usd - payment_adjustment
        actual_received_lbp = total_lbp - (payment_adjustment * lbp_rate)
    
    # Ensure positive LBP values
    actual_received_lbp = max(0, actual_received_lbp)
    
    # Build voucher lines - use consistent field names
    # Structure:
    # - Discount (+): Debit Cash, Debit 7211, Credit Sales
    # - Premium (-): Debit Cash, Credit Sales, Credit 7211
    voucher_lines = []
    
    # Line 1: Debit Cash/Bank/Customer - amount actually received
    voucher_lines.append({
        'account_id': debit_acc['id'],
        'account_code': debit_acc['code'],
        'account_name': debit_acc['name'],
        'description': f'POS Sale {receipt_number}',
        'currency': transaction_data.payment_currency,
        'exchange_rate': lbp_rate if transaction_data.payment_currency == 'LBP' else 1.0,
        'debit': round(actual_received, 2),
        'credit': 0.0,
        'debit_usd': round(actual_received, 2),
        'credit_usd': 0.0,
        'debit_lbp': round(actual_received_lbp, 0),
        'credit_lbp': 0.0
    })
    
    # Line 2: If there's a discount (positive adjustment), Debit Sales Discount (7211)
    if payment_adjustment > 0 and discount_acc:
        adjustment_lbp = round(payment_adjustment * lbp_rate, 0)
        voucher_lines.append({
            'account_id': discount_acc['id'],
            'account_code': discount_acc['code'],
            'account_name': discount_acc['name'],
            'description': f'Sales Discount - {receipt_number}',
            'currency': 'USD',
            'exchange_rate': 1.0,
            'debit': round(payment_adjustment, 2),
            'credit': 0.0,
            'debit_usd': round(payment_adjustment, 2),
            'credit_usd': 0.0,
            'debit_lbp': adjustment_lbp,
            'credit_lbp': 0.0
        })
    
    # Line 2 alt: If there's a premium (negative adjustment), Credit Sales Discount (7211)
    if payment_adjustment < 0 and discount_acc:
        adjustment_lbp = round(abs(payment_adjustment) * lbp_rate, 0)
        voucher_lines.append({
            'account_id': discount_acc['id'],
            'account_code': discount_acc['code'],
            'account_name': discount_acc['name'],
            'description': f'Sales Premium - {receipt_number}',
            'currency': 'USD',
            'exchange_rate': 1.0,
            'debit': 0.0,
            'credit': round(abs(payment_adjustment), 2),
            'debit_usd': 0.0,
            'credit_usd': round(abs(payment_adjustment), 2),
            'debit_lbp': 0.0,
            'credit_lbp': adjustment_lbp
        })
    
    # Line 3: Credit Sales account for full sale amount
    sales_lbp = round(total_lbp, 0)
    voucher_lines.append({
        'account_id': credit_acc['id'],
        'account_code': credit_acc['code'],
        'account_name': credit_acc['name'],
        'description': f'POS Sale {receipt_number}',
        'currency': 'USD',
        'exchange_rate': 1.0,
        'debit': 0.0,
        'credit': round(transaction_data.total_usd, 2),
        'debit_usd': 0.0,
        'credit_usd': round(transaction_data.total_usd, 2),
        'debit_lbp': 0.0,
        'credit_lbp': sales_lbp
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
    await db.accounts.update_one(
        {'id': credit_acc['id']},
        {'$inc': {'balance_usd': -transaction_data.total_usd}}
    )
    
    # Update discount account balance if used
    if payment_adjustment != 0 and discount_acc:
        # Discount: debit increases, Premium: credit decreases
        await db.accounts.update_one(
            {'id': discount_acc['id']},
            {'$inc': {'balance_usd': payment_adjustment}}  # positive for discount, negative for premium
        )
    
    # Deduct inventory quantities with batch handling (FEFO - First Expiry First Out)
    for line in lines_data:
        if line.get('inventory_item_id'):
            item = await db.inventory_items.find_one({'id': line['inventory_item_id']}, {'_id': 0})
            if item:
                qty_to_deduct = line['quantity']
                batches = item.get('batches', [])
                
                # If batch_id is specified, deduct from that specific batch
                if line.get('batch_id'):
                    for batch in batches:
                        if batch.get('id') == line['batch_id']:
                            batch['quantity'] = max(0, batch.get('quantity', 0) - qty_to_deduct)
                            break
                # Otherwise, use FEFO (deduct from earliest expiring batches first)
                elif batches:
                    sorted_batches = sorted(
                        batches,
                        key=lambda b: (b.get('expiry_date') or '9999-12-31', b.get('received_date') or '9999-12-31')
                    )
                    remaining = qty_to_deduct
                    for batch in sorted_batches:
                        if remaining <= 0:
                            break
                        batch_qty = batch.get('quantity', 0)
                        if batch_qty > 0:
                            deduct = min(batch_qty, remaining)
                            batch['quantity'] = batch_qty - deduct
                            remaining -= deduct
                    batches = sorted_batches
                
                await db.inventory_items.update_one(
                    {'id': line['inventory_item_id']},
                    {
                        '$inc': {'on_hand_qty': -qty_to_deduct},
                        '$set': {'batches': batches, 'updated_at': datetime.now(timezone.utc).isoformat()}
                    }
                )
    
    # Save to database
    await db.vouchers.insert_one(voucher_doc)
    transaction_doc['voucher_id'] = voucher_id
    await db.pos_transactions.insert_one(transaction_doc)
    
    enriched = await enrich_pos_transaction(transaction_doc)
    return POSTransactionResponse(**enriched)

@api_router.get("/pos/daily-summary")
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

@api_router.get("/pos/cash-accounts")
async def get_pos_cash_accounts(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Get cash/bank accounts for POS (class 5 - only leaf accounts to avoid double counting)"""
    # Get all class 5 accounts
    all_accounts = await db.accounts.find({
        'organization_id': organization_id,
        'code': {'$regex': '^5'},  # Cash & Bank accounts
        'is_active': True
    }, {'_id': 0, 'id': 1, 'code': 1, 'name': 1, 'name_ar': 1, 'balance_usd': 1}).sort('code', 1).to_list(100)
    
    # Filter to only leaf accounts (accounts without children)
    all_codes = {a['code'] for a in all_accounts}
    
    def is_leaf(code):
        """Check if this account has no children"""
        for other_code in all_codes:
            if other_code != code and other_code.startswith(code) and len(other_code) > len(code):
                return False
        return True
    
    # Return only leaf accounts (prefer longer codes, but include 3-digit if no children)
    leaf_accounts = [a for a in all_accounts if is_leaf(a['code'])]
    return leaf_accounts

@api_router.get("/pos/customer-history", response_model=List[POSTransactionResponse])
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


# ================== ROOT ==================

@api_router.get("/")
async def root():
    return {"message": "KAIROS Digital Invoicing API", "version": "1.0.0"}

# Import and include routers (direct file import to avoid __init__.py issues)
import importlib.util

# Cashier router
spec = importlib.util.spec_from_file_location("cashier", "/app/backend/routers/cashier.py")
cashier_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cashier_module)
api_router.include_router(cashier_module.router)

# Inventory router (refactored module) - ENABLED
spec = importlib.util.spec_from_file_location("inventory_router", "/app/backend/routers/inventory.py")
inventory_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory_module)
api_router.include_router(inventory_module.router)

# Accounts router (refactored module) - ENABLED
spec = importlib.util.spec_from_file_location("accounts_router", "/app/backend/routers/accounts.py")
accounts_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(accounts_module)
api_router.include_router(accounts_module.router)

# Invoices router (refactored module) - ENABLED
spec = importlib.util.spec_from_file_location("invoices_router", "/app/backend/routers/invoices.py")
invoices_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(invoices_module)
api_router.include_router(invoices_module.router)

# Vouchers router (refactored module) - ENABLED
spec = importlib.util.spec_from_file_location("vouchers_router", "/app/backend/routers/vouchers.py")
vouchers_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vouchers_module)
api_router.include_router(vouchers_module.router)

# Reports router (refactored module) - ENABLED
spec = importlib.util.spec_from_file_location("reports_router", "/app/backend/routers/reports.py")
reports_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reports_module)
api_router.include_router(reports_module.router)

# Files router (S3 uploads) - ENABLED
spec = importlib.util.spec_from_file_location("files_router", "/app/backend/routers/files.py")
files_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(files_module)
api_router.include_router(files_module.router)

# Import router (Excel COA + Voucher import) - ENABLED
spec = importlib.util.spec_from_file_location("imports_router", "/app/backend/routers/imports.py")
imports_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imports_module)
api_router.include_router(imports_module.router)

# Quotations router - ENABLED
spec = importlib.util.spec_from_file_location("quotations_router", "/app/backend/routers/quotations.py")
quotations_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quotations_module)
app.include_router(quotations_module.router)

# Include router and configure app

# Sales Returns router - ENABLED
spec = importlib.util.spec_from_file_location("sales_returns_router", "/app/backend/routers/sales_returns.py")
sales_returns_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sales_returns_module)
api_router.include_router(sales_returns_module.router)

# Purchase Returns router - ENABLED
spec = importlib.util.spec_from_file_location("purchase_returns_router", "/app/backend/routers/purchase_returns.py")
purchase_returns_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(purchase_returns_module)
api_router.include_router(purchase_returns_module.router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ================== DATABASE INDEXES (Performance Optimization) ==================
@app.on_event("startup")
async def create_indexes():
    """Create MongoDB indexes for optimal query performance with large datasets"""
    try:
        # Accounts indexes
        await db.accounts.create_index([("organization_id", 1), ("code", 1)], unique=True)
        await db.accounts.create_index([("organization_id", 1), ("account_class", 1)])
        await db.accounts.create_index([("organization_id", 1), ("is_active", 1)])
        await db.accounts.create_index([("organization_id", 1), ("account_type", 1)])
        await db.accounts.create_index("code")
        
        # Vouchers indexes
        await db.vouchers.create_index([("organization_id", 1), ("date", -1)])
        await db.vouchers.create_index([("organization_id", 1), ("is_posted", 1), ("date", -1)])
        await db.vouchers.create_index([("organization_id", 1), ("voucher_type", 1), ("date", -1)])
        await db.vouchers.create_index([("organization_id", 1), ("status", 1)])
        await db.vouchers.create_index("voucher_number")
        await db.vouchers.create_index([("organization_id", 1), ("is_posted", 1), ("lines.account_code", 1)])
        await db.vouchers.create_index("source_id")
        
        # Fiscal Years indexes
        await db.fiscal_years.create_index([("organization_id", 1), ("start_date", 1), ("end_date", 1)])
        await db.fiscal_years.create_index([("organization_id", 1), ("status", 1)])
        
        # Users indexes
        await db.users.create_index("email", unique=True)
        await db.users.create_index("organization_id")
        
        # Organizations indexes
        await db.organizations.create_index("id", unique=True)
        
        # Sales/Purchase invoices indexes
        await db.sales_invoices.create_index([("organization_id", 1), ("date", -1)])
        await db.purchase_invoices.create_index([("organization_id", 1), ("date", -1)])
        
        # Exchange rates
        await db.exchange_rates.create_index([("organization_id", 1), ("date", -1)])
        
        # Customer/Supplier specific indexes (for fast code-prefix queries)
        await db.accounts.create_index([("organization_id", 1), ("code", 1), ("is_active", 1)])
        await db.accounts.create_index([("organization_id", 1), ("name", 1)])
        
        # Inventory indexes
        await db.inventory_items.create_index([("organization_id", 1), ("item_code", 1)], unique=True, sparse=True)
        await db.inventory_items.create_index([("organization_id", 1), ("name", 1)])
        await db.inventory_items.create_index([("organization_id", 1), ("category_id", 1)])
        await db.inventory_items.create_index([("organization_id", 1), ("supplier_id", 1)])
        
        # Categories & Regions indexes
        await db.inventory_categories.create_index([("organization_id", 1), ("cat_id", 1)], unique=True, sparse=True)
        await db.regions.create_index([("organization_id", 1), ("reg_id", 1)], unique=True, sparse=True)
        
        # Voucher source_id for duplicate detection on reimport
        await db.vouchers.create_index([("organization_id", 1), ("source_id", 1)])
        
        # Sales Returns indexes
        await db.sales_returns.create_index([("organization_id", 1), ("date", -1)])
        await db.sales_returns.create_index([("organization_id", 1), ("status", 1)])
        await db.sales_returns.create_index("return_number")
        
        # Purchase Returns indexes
        await db.purchase_returns.create_index([("organization_id", 1), ("date", -1)])
        await db.purchase_returns.create_index([("organization_id", 1), ("status", 1)])
        await db.purchase_returns.create_index("return_number")
        
        logger.info("Database indexes created successfully")
    except Exception as e:
        logger.warning(f"Index creation warning (may already exist): {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
