"""
Authentication utilities - Shared auth helpers
"""
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import os

from core.database import db

JWT_SECRET = os.environ.get('JWT_SECRET', 'lebanese-accounting-secret-key-2024')
JWT_ALGORITHM = "HS256"

security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current authenticated user from JWT token"""
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


async def get_current_admin(current_user: dict = Depends(get_current_user)):
    """Require admin or super_admin role"""
    if current_user.get('role') not in ['admin', 'super_admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
