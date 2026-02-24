"""
Authentication Router
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import uuid

from models.schemas import UserCreate, UserLogin, UserResponse, TokenResponse
from utils.database import db
from utils.auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    """Register a new user"""
    existing = await db.users.find_one({'email': user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check if this is the first user (make them super_admin)
    user_count = await db.users.count_documents({})
    role = 'super_admin' if user_count == 0 else user_data.role
    
    user_id = str(uuid.uuid4())
    user_doc = {
        'id': user_id,
        'email': user_data.email,
        'password': hash_password(user_data.password),
        'name': user_data.name,
        'role': role,
        'organization_id': user_data.organization_id,
        'is_active': True,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_access_token(user_id, user_data.email, role, user_data.organization_id)
    user_response = UserResponse(**{k: v for k, v in user_doc.items() if k != 'password'})
    
    return TokenResponse(token=token, user=user_response)


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    """Login with email and password"""
    user = await db.users.find_one({'email': credentials.email})
    if not user or not verify_password(credentials.password, user['password']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.get('is_active', True):
        raise HTTPException(status_code=403, detail="Account is deactivated")
    
    token = create_access_token(user['id'], user['email'], user['role'], user.get('organization_id'))
    user_response = UserResponse(**{k: v for k, v in user.items() if k not in ['password', '_id']})
    
    return TokenResponse(token=token, user=user_response)


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current user information"""
    return UserResponse(**current_user)
