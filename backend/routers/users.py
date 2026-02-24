"""
Users Management Router
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone
import uuid

from models.schemas import UserCreate, UserUpdate, UserResponse, UserListResponse
from utils.database import db
from utils.auth import hash_password, get_current_user

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=List[UserListResponse])
async def get_users(current_user: dict = Depends(get_current_user)):
    """Get all users (super_admin only sees all, others see their org)"""
    if current_user['role'] == 'super_admin':
        users = await db.users.find({}, {'_id': 0, 'password': 0}).to_list(1000)
    else:
        users = await db.users.find(
            {'organization_id': current_user.get('organization_id')},
            {'_id': 0, 'password': 0}
        ).to_list(1000)
    
    # Add organization names
    for user in users:
        if user.get('organization_id'):
            org = await db.organizations.find_one({'id': user['organization_id']}, {'name': 1})
            user['organization_name'] = org['name'] if org else None
    
    return users


@router.post("", response_model=UserResponse)
async def create_user(user_data: UserCreate, current_user: dict = Depends(get_current_user)):
    """Create a new user"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
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
        'organization_id': user_data.organization_id or current_user.get('organization_id'),
        'is_active': True,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    return UserResponse(**{k: v for k, v in user_doc.items() if k != 'password'})


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, user_data: UserUpdate, current_user: dict = Depends(get_current_user)):
    """Update a user"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    user = await db.users.find_one({'id': user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Non-super_admin cannot modify super_admin users
    if user['role'] == 'super_admin' and current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Cannot modify super admin")
    
    update_doc = {}
    if user_data.name is not None:
        update_doc['name'] = user_data.name
    if user_data.role is not None and current_user['role'] == 'super_admin':
        update_doc['role'] = user_data.role
    if user_data.organization_id is not None:
        update_doc['organization_id'] = user_data.organization_id
    if user_data.is_active is not None:
        update_doc['is_active'] = user_data.is_active
    
    if update_doc:
        update_doc['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one({'id': user_id}, {'$set': update_doc})
    
    updated = await db.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
    return UserResponse(**updated)


@router.delete("/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a user"""
    if current_user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Only super admin can delete users")
    
    user = await db.users.find_one({'id': user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user['role'] == 'super_admin':
        raise HTTPException(status_code=400, detail="Cannot delete super admin")
    
    await db.users.delete_one({'id': user_id})
    return {"message": "User deleted successfully"}


@router.post("/{user_id}/reset-password")
async def reset_password(user_id: str, new_password: str, current_user: dict = Depends(get_current_user)):
    """Reset user password"""
    if current_user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    user = await db.users.find_one({'id': user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {'id': user_id},
        {'$set': {'password': hash_password(new_password)}}
    )
    
    return {"message": "Password reset successfully"}
