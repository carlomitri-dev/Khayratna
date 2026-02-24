"""
Cashier POS Module - Session-based Point of Sale for Cashiers
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import uuid
import os
import jwt
import bcrypt

router = APIRouter(prefix="/cashier", tags=["Cashier POS"])

# MongoDB connection - reuse same connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'test_database')]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'lebanese-accounting-secret-key-2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer()


# ================== HELPERS ==================

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


# ================== SCHEMAS ==================

class CashierCreate(BaseModel):
    email: str
    password: str
    name: str
    pin: str = Field(..., min_length=4, max_length=6, description="4-6 digit PIN for quick login")
    organization_id: str


class CashierUpdate(BaseModel):
    name: Optional[str] = None
    pin: Optional[str] = None
    is_active: Optional[bool] = None


class CashierResponse(BaseModel):
    id: str
    email: str
    name: str
    organization_id: str
    is_active: bool
    created_at: str
    last_login: Optional[str] = None


class CashierLoginRequest(BaseModel):
    organization_id: str
    email: Optional[str] = None
    password: Optional[str] = None
    pin: Optional[str] = None


class SessionOpenRequest(BaseModel):
    cashier_id: str
    organization_id: str
    opening_cash_usd: float = 0
    opening_cash_lbp: float = 0
    drawer_id: Optional[str] = None
    notes: Optional[str] = None


class SessionCloseRequest(BaseModel):
    session_id: str
    closing_cash_usd: float
    closing_cash_lbp: float
    notes: Optional[str] = None


class CashierSessionResponse(BaseModel):
    id: str
    cashier_id: str
    cashier_name: str
    organization_id: str
    drawer_id: Optional[str] = None
    status: Literal['open', 'closed', 'suspended']
    opened_at: str
    closed_at: Optional[str] = None
    opening_cash_usd: float
    opening_cash_lbp: float
    closing_cash_usd: Optional[float] = None
    closing_cash_lbp: Optional[float] = None
    expected_cash_usd: Optional[float] = None
    expected_cash_lbp: Optional[float] = None
    difference_usd: Optional[float] = None
    difference_lbp: Optional[float] = None
    transaction_count: int = 0
    total_sales_usd: float = 0
    total_sales_lbp: float = 0
    total_cash_usd: float = 0
    total_card_usd: float = 0
    total_credit_usd: float = 0
    notes: Optional[str] = None


# ================== CASHIER MANAGEMENT ==================

@router.post("/cashiers", response_model=CashierResponse)
async def create_cashier(data: CashierCreate, current_user: dict = Depends(get_current_user)):
    """Create a new cashier (admin only)"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Only admins can create cashiers")
    
    existing = await db.users.find_one({'email': data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    cashier_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    cashier_doc = {
        'id': cashier_id,
        'email': data.email,
        'password': hash_password(data.password),
        'pin': hash_password(data.pin),
        'name': data.name,
        'role': 'cashier',
        'organization_id': data.organization_id,
        'is_active': True,
        'created_at': now,
        'last_login': None
    }
    
    await db.users.insert_one(cashier_doc)
    
    return CashierResponse(
        id=cashier_id,
        email=data.email,
        name=data.name,
        organization_id=data.organization_id,
        is_active=True,
        created_at=now
    )


@router.get("/cashiers", response_model=List[CashierResponse])
async def list_cashiers(organization_id: str, current_user: dict = Depends(get_current_user)):
    """List all cashiers for an organization (admin only)"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Only admins can view cashiers")
    
    cashiers = await db.users.find(
        {'organization_id': organization_id, 'role': 'cashier'},
        {'_id': 0, 'password': 0, 'pin': 0}
    ).to_list(100)
    
    return [CashierResponse(**c) for c in cashiers]


@router.put("/cashiers/{cashier_id}", response_model=CashierResponse)
async def update_cashier(cashier_id: str, data: CashierUpdate, current_user: dict = Depends(get_current_user)):
    """Update cashier details (admin only)"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Only admins can update cashiers")
    
    cashier = await db.users.find_one({'id': cashier_id, 'role': 'cashier'}, {'_id': 0})
    if not cashier:
        raise HTTPException(status_code=404, detail="Cashier not found")
    
    update_doc = {}
    if data.name is not None:
        update_doc['name'] = data.name
    if data.pin is not None:
        update_doc['pin'] = hash_password(data.pin)
    if data.is_active is not None:
        update_doc['is_active'] = data.is_active
    
    if update_doc:
        await db.users.update_one({'id': cashier_id}, {'$set': update_doc})
    
    updated = await db.users.find_one({'id': cashier_id}, {'_id': 0, 'password': 0, 'pin': 0})
    return CashierResponse(**updated)


@router.delete("/cashiers/{cashier_id}")
async def delete_cashier(cashier_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a cashier (admin only)"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Only admins can delete cashiers")
    
    cashier = await db.users.find_one({'id': cashier_id, 'role': 'cashier'}, {'_id': 0})
    if not cashier:
        raise HTTPException(status_code=404, detail="Cashier not found")
    
    open_session = await db.cashier_sessions.find_one({
        'cashier_id': cashier_id,
        'status': 'open'
    })
    if open_session:
        raise HTTPException(status_code=400, detail="Cashier has an open session. Close it first.")
    
    await db.users.delete_one({'id': cashier_id})
    return {"message": "Cashier deleted successfully"}


# ================== CASHIER LOGIN ==================

@router.post("/login")
async def cashier_login(data: CashierLoginRequest):
    """Login for cashiers or admins - supports email/password or PIN"""
    # First try to find a cashier
    query = {'organization_id': data.organization_id, 'role': 'cashier'}
    if data.email:
        query['email'] = data.email
    
    user = await db.users.find_one(query, {'_id': 0})
    
    # If no cashier found, try admin/super_admin
    if not user and data.email:
        admin_query = {'email': data.email, 'role': {'$in': ['admin', 'super_admin']}}
        user = await db.users.find_one(admin_query, {'_id': 0})
        if user:
            # Admin can access any org's POS
            pass
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.get('is_active', True):
        raise HTTPException(status_code=401, detail="Account is disabled")
    
    # Verify password or PIN
    if data.password:
        if not verify_password(data.password, user['password']):
            raise HTTPException(status_code=401, detail="Invalid password")
    elif data.pin:
        if not verify_password(data.pin, user.get('pin', '')):
            raise HTTPException(status_code=401, detail="Invalid PIN")
    else:
        raise HTTPException(status_code=400, detail="Password or PIN required")
    
    await db.users.update_one(
        {'id': user['id']},
        {'$set': {'last_login': datetime.now(timezone.utc).isoformat()}}
    )
    
    # For admins, use their role; for cashiers, use 'cashier'
    role = user['role'] if user['role'] in ['admin', 'super_admin'] else 'cashier'
    token = create_token(user['id'], user['email'], role)
    
    open_session = await db.cashier_sessions.find_one(
        {'cashier_id': user['id'], 'status': 'open'},
        {'_id': 0}
    )
    
    return {
        'token': token,
        'user': {
            'id': user['id'],
            'email': user['email'],
            'name': user['name'],
            'role': role,
            'organization_id': user.get('organization_id') or data.organization_id,
            'is_admin': role in ['admin', 'super_admin']
        },
        'active_session': open_session
    }


# ================== SESSION MANAGEMENT ==================

@router.post("/sessions/open", response_model=CashierSessionResponse)
async def open_session(data: SessionOpenRequest, current_user: dict = Depends(get_current_user)):
    """Open a new cashier session"""
    cashier = await db.users.find_one({'id': data.cashier_id, 'role': 'cashier'}, {'_id': 0})
    if not cashier:
        raise HTTPException(status_code=404, detail="Cashier not found")
    
    existing = await db.cashier_sessions.find_one({
        'cashier_id': data.cashier_id,
        'status': 'open'
    })
    if existing:
        raise HTTPException(status_code=400, detail="Cashier already has an open session")
    
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    session_doc = {
        'id': session_id,
        'cashier_id': data.cashier_id,
        'cashier_name': cashier['name'],
        'organization_id': data.organization_id,
        'drawer_id': data.drawer_id,
        'status': 'open',
        'opened_at': now,
        'closed_at': None,
        'opening_cash_usd': data.opening_cash_usd,
        'opening_cash_lbp': data.opening_cash_lbp,
        'closing_cash_usd': None,
        'closing_cash_lbp': None,
        'expected_cash_usd': data.opening_cash_usd,
        'expected_cash_lbp': data.opening_cash_lbp,
        'transaction_count': 0,
        'total_sales_usd': 0,
        'total_sales_lbp': 0,
        'total_cash_usd': 0,
        'total_cash_lbp': 0,
        'total_card_usd': 0,
        'total_credit_usd': 0,
        'notes': data.notes
    }
    
    await db.cashier_sessions.insert_one(session_doc)
    
    return CashierSessionResponse(**session_doc)


@router.post("/sessions/close", response_model=CashierSessionResponse)
async def close_session(data: SessionCloseRequest, current_user: dict = Depends(get_current_user)):
    """Close a cashier session"""
    session = await db.cashier_sessions.find_one({'id': data.session_id}, {'_id': 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session['status'] != 'open':
        raise HTTPException(status_code=400, detail="Session is already closed")
    
    if current_user['role'] == 'cashier' and current_user['id'] != session['cashier_id']:
        raise HTTPException(status_code=403, detail="Cannot close another cashier's session")
    
    now = datetime.now(timezone.utc).isoformat()
    
    expected_usd = session['opening_cash_usd'] + session.get('total_cash_usd', 0)
    expected_lbp = session['opening_cash_lbp'] + session.get('total_cash_lbp', 0)
    
    update_doc = {
        'status': 'closed',
        'closed_at': now,
        'closing_cash_usd': data.closing_cash_usd,
        'closing_cash_lbp': data.closing_cash_lbp,
        'expected_cash_usd': expected_usd,
        'expected_cash_lbp': expected_lbp,
        'difference_usd': data.closing_cash_usd - expected_usd,
        'difference_lbp': data.closing_cash_lbp - expected_lbp,
        'notes': data.notes or session.get('notes')
    }
    
    await db.cashier_sessions.update_one({'id': data.session_id}, {'$set': update_doc})
    
    updated = await db.cashier_sessions.find_one({'id': data.session_id}, {'_id': 0})
    return CashierSessionResponse(**updated)


@router.get("/sessions/active", response_model=Optional[CashierSessionResponse])
async def get_active_session(cashier_id: str, current_user: dict = Depends(get_current_user)):
    """Get cashier's active session"""
    session = await db.cashier_sessions.find_one(
        {'cashier_id': cashier_id, 'status': 'open'},
        {'_id': 0}
    )
    if session:
        return CashierSessionResponse(**session)
    return None


@router.get("/sessions", response_model=List[CashierSessionResponse])
async def list_sessions(
    organization_id: str,
    status: Optional[str] = None,
    cashier_id: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """List sessions (admins see all, cashiers see only their own)"""
    query = {'organization_id': organization_id}
    
    if current_user['role'] == 'cashier':
        query['cashier_id'] = current_user['id']
    elif cashier_id:
        query['cashier_id'] = cashier_id
    
    if status:
        query['status'] = status
    
    sessions = await db.cashier_sessions.find(
        query,
        {'_id': 0}
    ).sort('opened_at', -1).to_list(limit)
    
    return [CashierSessionResponse(**s) for s in sessions]


@router.get("/sessions/{session_id}", response_model=CashierSessionResponse)
async def get_session(session_id: str, current_user: dict = Depends(get_current_user)):
    """Get session details"""
    session = await db.cashier_sessions.find_one({'id': session_id}, {'_id': 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if current_user['role'] == 'cashier' and session['cashier_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return CashierSessionResponse(**session)


@router.get("/sessions/{session_id}/transactions")
async def get_session_transactions(session_id: str, current_user: dict = Depends(get_current_user)):
    """Get all transactions for a session"""
    session = await db.cashier_sessions.find_one({'id': session_id}, {'_id': 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if current_user['role'] == 'cashier' and session['cashier_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    transactions = await db.pos_transactions.find(
        {'session_id': session_id},
        {'_id': 0}
    ).sort('date', -1).to_list(500)
    
    return transactions


# ================== ADMIN OVERSIGHT ==================

@router.get("/admin/live-sessions", response_model=List[CashierSessionResponse])
async def get_live_sessions(organization_id: str, current_user: dict = Depends(get_current_user)):
    """Get all open sessions (admin only) for real-time monitoring"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    sessions = await db.cashier_sessions.find(
        {'organization_id': organization_id, 'status': 'open'},
        {'_id': 0}
    ).to_list(50)
    
    return [CashierSessionResponse(**s) for s in sessions]


@router.get("/admin/session-summary")
async def get_session_summary(
    organization_id: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get session summary for admin dashboard"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    query = {'organization_id': organization_id}
    
    if date_from:
        query['opened_at'] = {'$gte': date_from}
    if date_to:
        query.setdefault('opened_at', {})['$lte'] = date_to
    
    sessions = await db.cashier_sessions.find(query, {'_id': 0}).to_list(None)
    
    total_sales_usd = sum(s.get('total_sales_usd', 0) for s in sessions)
    total_sales_lbp = sum(s.get('total_sales_lbp', 0) for s in sessions)
    total_transactions = sum(s.get('transaction_count', 0) for s in sessions)
    total_cash_usd = sum(s.get('total_cash_usd', 0) for s in sessions)
    total_card_usd = sum(s.get('total_card_usd', 0) for s in sessions)
    total_credit_usd = sum(s.get('total_credit_usd', 0) for s in sessions)
    
    open_sessions = len([s for s in sessions if s['status'] == 'open'])
    closed_sessions = len([s for s in sessions if s['status'] == 'closed'])
    
    total_variance_usd = sum(s.get('difference_usd', 0) or 0 for s in sessions if s['status'] == 'closed')
    total_variance_lbp = sum(s.get('difference_lbp', 0) or 0 for s in sessions if s['status'] == 'closed')
    
    return {
        'total_sessions': len(sessions),
        'open_sessions': open_sessions,
        'closed_sessions': closed_sessions,
        'total_transactions': total_transactions,
        'total_sales_usd': total_sales_usd,
        'total_sales_lbp': total_sales_lbp,
        'total_cash_usd': total_cash_usd,
        'total_card_usd': total_card_usd,
        'total_credit_usd': total_credit_usd,
        'total_variance_usd': total_variance_usd,
        'total_variance_lbp': total_variance_lbp
    }


@router.post("/sessions/{session_id}/record-transaction")
async def record_session_transaction(session_id: str, transaction_data: dict, current_user: dict = Depends(get_current_user)):
    """Record a transaction and update session statistics"""
    session = await db.cashier_sessions.find_one({'id': session_id}, {'_id': 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session['status'] != 'open':
        raise HTTPException(status_code=400, detail="Cannot add transactions to closed session")
    
    payment_method = transaction_data.get('payment_method', 'cash')
    total_usd = transaction_data.get('total_usd', 0)
    total_lbp = transaction_data.get('total_lbp', 0)
    
    # Calculate net cash for expected drawer
    payment_amount = transaction_data.get('payment_amount', 0)
    payment_currency = transaction_data.get('payment_currency', 'USD')
    change_amount = transaction_data.get('change_amount', 0)
    lbp_rate = transaction_data.get('lbp_rate', 89500)
    
    update_doc = {
        '$inc': {
            'transaction_count': 1,
            'total_sales_usd': total_usd,
            'total_sales_lbp': total_lbp,
        }
    }
    
    if payment_method == 'cash':
        # Net cash = payment received - change given
        if payment_currency == 'USD':
            net_cash_usd = payment_amount - change_amount
            update_doc['$inc']['total_cash_usd'] = net_cash_usd
            update_doc['$inc']['expected_cash_usd'] = net_cash_usd
        else:
            net_cash_lbp = payment_amount - (change_amount * lbp_rate)
            update_doc['$inc']['total_cash_lbp'] = net_cash_lbp
            update_doc['$inc']['expected_cash_lbp'] = net_cash_lbp
            update_doc['$inc']['total_cash_usd'] = net_cash_lbp / lbp_rate
    elif payment_method == 'card':
        update_doc['$inc']['total_card_usd'] = total_usd
    else:  # customer credit
        update_doc['$inc']['total_credit_usd'] = total_usd
    
    await db.cashier_sessions.update_one({'id': session_id}, update_doc)
    
    # Store transaction with session reference
    transaction_data['session_id'] = session_id
    
    return {"message": "Transaction recorded", "session_id": session_id}



# ================== ADMIN ADJUSTMENTS ==================

class SessionAdjustment(BaseModel):
    session_id: str
    adjustment_type: Literal['cash_adjustment', 'void_transaction', 'manual_entry']
    amount_usd: Optional[float] = 0
    amount_lbp: Optional[float] = 0
    reason: str
    transaction_id: Optional[str] = None


@router.post("/admin/adjust-session")
async def adjust_session(data: SessionAdjustment, current_user: dict = Depends(get_current_user)):
    """Admin adjustment to a session (add/remove cash, void transactions)"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    session = await db.cashier_sessions.find_one({'id': data.session_id}, {'_id': 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    now = datetime.now(timezone.utc).isoformat()
    adjustment_id = str(uuid.uuid4())
    
    # Record the adjustment
    adjustment_doc = {
        'id': adjustment_id,
        'session_id': data.session_id,
        'adjustment_type': data.adjustment_type,
        'amount_usd': data.amount_usd,
        'amount_lbp': data.amount_lbp,
        'reason': data.reason,
        'transaction_id': data.transaction_id,
        'adjusted_by': current_user['id'],
        'adjusted_by_name': current_user.get('name', current_user['email']),
        'created_at': now
    }
    
    await db.session_adjustments.insert_one(adjustment_doc)
    
    # Update session based on adjustment type
    if data.adjustment_type == 'cash_adjustment':
        update_doc = {
            '$inc': {
                'expected_cash_usd': data.amount_usd,
                'expected_cash_lbp': data.amount_lbp,
                'total_sales_usd': data.amount_usd if data.amount_usd > 0 else 0,
                'total_sales_lbp': data.amount_lbp if data.amount_lbp > 0 else 0,
            }
        }
        await db.cashier_sessions.update_one({'id': data.session_id}, update_doc)
    
    elif data.adjustment_type == 'void_transaction' and data.transaction_id:
        # Mark transaction as voided
        transaction = await db.pos_transactions.find_one({'id': data.transaction_id}, {'_id': 0})
        if transaction:
            await db.pos_transactions.update_one(
                {'id': data.transaction_id},
                {'$set': {'is_voided': True, 'voided_at': now, 'voided_by': current_user['id'], 'void_reason': data.reason}}
            )
            # Adjust session totals
            update_doc = {
                '$inc': {
                    'total_sales_usd': -transaction.get('total_usd', 0),
                    'total_sales_lbp': -transaction.get('total_lbp', 0),
                    'transaction_count': -1
                }
            }
            if transaction.get('payment_method') == 'cash':
                update_doc['$inc']['total_cash_usd'] = -transaction.get('total_usd', 0)
                update_doc['$inc']['expected_cash_usd'] = -transaction.get('total_usd', 0)
            elif transaction.get('payment_method') == 'card':
                update_doc['$inc']['total_card_usd'] = -transaction.get('total_usd', 0)
            else:
                update_doc['$inc']['total_credit_usd'] = -transaction.get('total_usd', 0)
            
            await db.cashier_sessions.update_one({'id': data.session_id}, update_doc)
    
    return {"message": "Adjustment recorded", "adjustment_id": adjustment_id}


@router.get("/admin/session-adjustments/{session_id}")
async def get_session_adjustments(session_id: str, current_user: dict = Depends(get_current_user)):
    """Get all adjustments for a session"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    adjustments = await db.session_adjustments.find(
        {'session_id': session_id},
        {'_id': 0}
    ).sort('created_at', -1).to_list(100)
    
    return adjustments


@router.get("/admin/historical-sales")
async def get_historical_sales(
    organization_id: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    group_by: str = 'day',  # 'day', 'week', 'month'
    current_user: dict = Depends(get_current_user)
):
    """Get historical sales data for reporting"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    query = {'organization_id': organization_id}
    
    if date_from:
        query['date'] = {'$gte': date_from}
    if date_to:
        query.setdefault('date', {})['$lte'] = date_to
    
    # Get all transactions
    transactions = await db.pos_transactions.find(
        query,
        {'_id': 0, 'date': 1, 'total_usd': 1, 'total_lbp': 1, 'payment_method': 1, 'is_voided': 1}
    ).to_list(None)
    
    # Filter out voided transactions
    transactions = [t for t in transactions if not t.get('is_voided')]
    
    # Calculate totals
    total_sales_usd = sum(t.get('total_usd', 0) for t in transactions)
    total_sales_lbp = sum(t.get('total_lbp', 0) for t in transactions)
    total_transactions = len(transactions)
    
    # Group by payment method
    by_payment = {}
    for t in transactions:
        method = t.get('payment_method', 'cash')
        if method not in by_payment:
            by_payment[method] = {'count': 0, 'total_usd': 0}
        by_payment[method]['count'] += 1
        by_payment[method]['total_usd'] += t.get('total_usd', 0)
    
    # Group by date
    daily_sales = {}
    for t in transactions:
        date_str = t.get('date', '')[:10]  # Get YYYY-MM-DD
        if date_str not in daily_sales:
            daily_sales[date_str] = {'count': 0, 'total_usd': 0, 'total_lbp': 0}
        daily_sales[date_str]['count'] += 1
        daily_sales[date_str]['total_usd'] += t.get('total_usd', 0)
        daily_sales[date_str]['total_lbp'] += t.get('total_lbp', 0)
    
    return {
        'summary': {
            'total_sales_usd': total_sales_usd,
            'total_sales_lbp': total_sales_lbp,
            'total_transactions': total_transactions,
            'average_transaction_usd': total_sales_usd / total_transactions if total_transactions > 0 else 0
        },
        'by_payment_method': by_payment,
        'daily_sales': [{'date': k, **v} for k, v in sorted(daily_sales.items())]
    }


@router.get("/admin/transactions")
async def get_transactions(
    organization_id: str,
    session_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    include_voided: bool = False,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get transactions for admin view"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    query = {'organization_id': organization_id}
    
    if session_id:
        query['session_id'] = session_id
    if date_from:
        query['date'] = {'$gte': date_from}
    if date_to:
        query.setdefault('date', {})['$lte'] = date_to
    if not include_voided:
        query['is_voided'] = {'$ne': True}
    
    transactions = await db.pos_transactions.find(
        query,
        {'_id': 0}
    ).sort('date', -1).to_list(limit)
    
    return transactions


@router.post("/admin/void-transaction/{transaction_id}")
async def void_transaction(transaction_id: str, reason: str = "Admin void", current_user: dict = Depends(get_current_user)):
    """Void a specific transaction"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    transaction = await db.pos_transactions.find_one({'id': transaction_id}, {'_id': 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if transaction.get('is_voided'):
        raise HTTPException(status_code=400, detail="Transaction already voided")
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.pos_transactions.update_one(
        {'id': transaction_id},
        {'$set': {'is_voided': True, 'voided_at': now, 'voided_by': current_user['id'], 'void_reason': reason}}
    )
    
    # Update session if exists
    if transaction.get('session_id'):
        update_doc = {
            '$inc': {
                'total_sales_usd': -transaction.get('total_usd', 0),
                'total_sales_lbp': -transaction.get('total_lbp', 0),
                'transaction_count': -1
            }
        }
        await db.cashier_sessions.update_one({'id': transaction['session_id']}, update_doc)
    
    return {"message": "Transaction voided", "transaction_id": transaction_id}
