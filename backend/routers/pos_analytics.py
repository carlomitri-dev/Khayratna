"""
POS Analytics Router
Provides sales trends, top-selling items, and cashier performance data.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os
import jwt
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter(prefix="/pos/analytics", tags=["POS Analytics"])

mongo_url = os.environ.get('MONGO_URL')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME')]

JWT_SECRET = os.environ.get('JWT_SECRET', 'lebanese-accounting-secret-key-2024')
JWT_ALGORITHM = "HS256"
security = HTTPBearer()


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


def require_admin(user: dict):
    if user['role'] not in ['super_admin', 'admin']:
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/sales-trends")
async def get_sales_trends(
    organization_id: str,
    period: str = "daily",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get sales trends grouped by day/week/month."""
    require_admin(current_user)

    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    if not date_from:
        if period == "daily":
            date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%d')
        elif period == "weekly":
            date_from = (datetime.now(timezone.utc) - timedelta(weeks=12)).strftime('%Y-%m-%d')
        else:
            date_from = (datetime.now(timezone.utc) - timedelta(days=365)).strftime('%Y-%m-%d')
    if not date_to:
        date_to = today

    query = {
        'organization_id': organization_id,
        'date': {'$gte': date_from, '$lte': date_to},
        'is_voided': {'$ne': True}
    }

    transactions = await db.pos_transactions.find(
        query,
        {'_id': 0, 'date': 1, 'total_usd': 1, 'total_lbp': 1, 'payment_method': 1, 'lines': 1}
    ).to_list(None)

    # Group by period
    buckets = {}
    for t in transactions:
        date_str = t.get('date', '')[:10]
        if not date_str:
            continue

        if period == "daily":
            key = date_str
        elif period == "weekly":
            dt = datetime.strptime(date_str, '%Y-%m-%d')
            week_start = dt - timedelta(days=dt.weekday())
            key = week_start.strftime('%Y-%m-%d')
        else:  # monthly
            key = date_str[:7]

        if key not in buckets:
            buckets[key] = {
                'period': key,
                'sales_usd': 0, 'sales_lbp': 0,
                'transactions': 0, 'items_sold': 0,
                'cash_usd': 0, 'card_usd': 0, 'credit_usd': 0
            }

        b = buckets[key]
        b['sales_usd'] += t.get('total_usd', 0)
        b['sales_lbp'] += t.get('total_lbp', 0)
        b['transactions'] += 1
        b['items_sold'] += sum(line.get('quantity', 0) for line in t.get('lines', []))

        method = t.get('payment_method', 'cash')
        if method == 'cash':
            b['cash_usd'] += t.get('total_usd', 0)
        elif method == 'card':
            b['card_usd'] += t.get('total_usd', 0)
        else:
            b['credit_usd'] += t.get('total_usd', 0)

    data = sorted(buckets.values(), key=lambda x: x['period'])

    total_sales = sum(b['sales_usd'] for b in data)
    total_txns = sum(b['transactions'] for b in data)
    avg_per_period = total_sales / len(data) if data else 0

    return {
        'period': period,
        'date_from': date_from,
        'date_to': date_to,
        'summary': {
            'total_sales_usd': total_sales,
            'total_transactions': total_txns,
            'avg_per_period': avg_per_period,
            'avg_ticket': total_sales / total_txns if total_txns else 0,
            'total_items_sold': sum(b['items_sold'] for b in data)
        },
        'data': data
    }


@router.get("/top-items")
async def get_top_items(
    organization_id: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 15,
    current_user: dict = Depends(get_current_user)
):
    """Get top-selling items by quantity and revenue."""
    require_admin(current_user)

    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    if not date_from:
        date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%d')
    if not date_to:
        date_to = today

    query = {
        'organization_id': organization_id,
        'date': {'$gte': date_from, '$lte': date_to},
        'is_voided': {'$ne': True}
    }

    transactions = await db.pos_transactions.find(
        query, {'_id': 0, 'lines': 1}
    ).to_list(None)

    items = {}
    for t in transactions:
        for line in t.get('lines', []):
            item_id = line.get('inventory_id') or line.get('item_name', 'Unknown')
            name = line.get('item_name', 'Unknown')
            if item_id not in items:
                items[item_id] = {
                    'item_id': item_id,
                    'name': name,
                    'quantity': 0,
                    'revenue_usd': 0,
                    'transactions': 0
                }
            items[item_id]['quantity'] += line.get('quantity', 0)
            items[item_id]['revenue_usd'] += line.get('line_total_usd', 0) or line.get('line_total', 0)
            items[item_id]['transactions'] += 1

    by_qty = sorted(items.values(), key=lambda x: x['quantity'], reverse=True)[:limit]
    by_rev = sorted(items.values(), key=lambda x: x['revenue_usd'], reverse=True)[:limit]

    return {
        'date_from': date_from,
        'date_to': date_to,
        'by_quantity': by_qty,
        'by_revenue': by_rev,
        'total_unique_items': len(items)
    }


@router.get("/cashier-performance")
async def get_cashier_performance(
    organization_id: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get cashier performance comparison."""
    require_admin(current_user)

    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    if not date_from:
        date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%d')
    if not date_to:
        date_to = today

    # Get sessions in date range
    sessions = await db.cashier_sessions.find(
        {
            'organization_id': organization_id,
            'opened_at': {'$gte': date_from, '$lte': date_to + 'T23:59:59'}
        },
        {'_id': 0}
    ).to_list(None)

    # Also get POS transactions created by users (for admin POS usage)
    query = {
        'organization_id': organization_id,
        'date': {'$gte': date_from, '$lte': date_to},
        'is_voided': {'$ne': True}
    }
    transactions = await db.pos_transactions.find(
        query, {'_id': 0, 'created_by': 1, 'total_usd': 1, 'lines': 1, 'session_id': 1}
    ).to_list(None)

    # Aggregate by cashier
    cashier_data = {}

    # From sessions
    for s in sessions:
        cid = s.get('cashier_id', 'unknown')
        cname = s.get('cashier_name', 'Unknown')
        if cid not in cashier_data:
            cashier_data[cid] = {
                'cashier_id': cid,
                'name': cname,
                'sessions': 0,
                'total_sales_usd': 0,
                'total_transactions': 0,
                'total_items': 0,
                'cash_usd': 0,
                'card_usd': 0,
                'avg_ticket': 0
            }
        cashier_data[cid]['sessions'] += 1
        cashier_data[cid]['total_sales_usd'] += s.get('total_sales_usd', 0)
        cashier_data[cid]['total_transactions'] += s.get('transaction_count', 0)
        cashier_data[cid]['cash_usd'] += s.get('total_cash_usd', 0)
        cashier_data[cid]['card_usd'] += s.get('total_card_usd', 0)

    # Count items from transactions linked to sessions
    for t in transactions:
        sid = t.get('session_id')
        if sid:
            # Find which cashier owns this session
            for s in sessions:
                if s['id'] == sid:
                    cid = s.get('cashier_id', 'unknown')
                    if cid in cashier_data:
                        cashier_data[cid]['total_items'] += sum(
                            line.get('quantity', 0) for line in t.get('lines', [])
                        )
                    break
        else:
            # Admin POS transaction
            uid = t.get('created_by', 'admin')
            if uid not in cashier_data:
                user = await db.users.find_one({'id': uid}, {'_id': 0, 'name': 1})
                cashier_data[uid] = {
                    'cashier_id': uid,
                    'name': (user or {}).get('name', 'Admin'),
                    'sessions': 0,
                    'total_sales_usd': 0,
                    'total_transactions': 0,
                    'total_items': 0,
                    'cash_usd': 0,
                    'card_usd': 0,
                    'avg_ticket': 0
                }
            cashier_data[uid]['total_sales_usd'] += t.get('total_usd', 0)
            cashier_data[uid]['total_transactions'] += 1
            cashier_data[uid]['total_items'] += sum(
                line.get('quantity', 0) for line in t.get('lines', [])
            )

    # Calculate avg ticket
    for c in cashier_data.values():
        if c['total_transactions'] > 0:
            c['avg_ticket'] = c['total_sales_usd'] / c['total_transactions']

    result = sorted(cashier_data.values(), key=lambda x: x['total_sales_usd'], reverse=True)

    return {
        'date_from': date_from,
        'date_to': date_to,
        'cashiers': result,
        'total_cashiers': len(result)
    }
