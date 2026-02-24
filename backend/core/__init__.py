"""
Core module - Shared dependencies and utilities
"""
from core.database import db, client
from core.auth import get_current_user, get_current_admin, security, JWT_SECRET, JWT_ALGORITHM

__all__ = [
    'db', 'client',
    'get_current_user', 'get_current_admin', 'security',
    'JWT_SECRET', 'JWT_ALGORITHM'
]
