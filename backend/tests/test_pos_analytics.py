"""
POS Analytics API Tests
Tests for GET /api/pos/analytics/sales-trends, top-items, and cashier-performance endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

# Test credentials
TEST_EMAIL = "carlo.mitri@gmail.com"
TEST_PASSWORD = "Carinemi@28"
TEST_ORG_ID = "fa6d4449-a859-445f-9e0b-fbb4aa90bfee"


@pytest.fixture(scope="session")
def auth_token():
    """Get authentication token for testing"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    # API returns 'token' not 'access_token'
    assert "token" in data, "No token in response"
    return data["token"]


@pytest.fixture(scope="session")
def headers(auth_token):
    """Return headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestSalesTrendsEndpoint:
    """Tests for GET /api/pos/analytics/sales-trends"""

    def test_sales_trends_returns_200(self, headers):
        """Test that sales-trends endpoint returns 200 with valid auth"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/sales-trends",
            params={"organization_id": TEST_ORG_ID},
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_sales_trends_response_structure(self, headers):
        """Test response structure has required fields: period, summary, data"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/sales-trends",
            params={"organization_id": TEST_ORG_ID, "period": "daily"},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check top-level fields
        assert "period" in data, "Missing 'period' field"
        assert "date_from" in data, "Missing 'date_from' field"
        assert "date_to" in data, "Missing 'date_to' field"
        assert "summary" in data, "Missing 'summary' field"
        assert "data" in data, "Missing 'data' field"
        
        # Check summary structure
        summary = data["summary"]
        assert "total_sales_usd" in summary, "Missing summary.total_sales_usd"
        assert "total_transactions" in summary, "Missing summary.total_transactions"
        assert "avg_per_period" in summary, "Missing summary.avg_per_period"
        assert "avg_ticket" in summary, "Missing summary.avg_ticket"
        assert "total_items_sold" in summary, "Missing summary.total_items_sold"
    
    def test_sales_trends_period_daily(self, headers):
        """Test daily period returns expected period value"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/sales-trends",
            params={"organization_id": TEST_ORG_ID, "period": "daily"},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["period"] == "daily"
    
    def test_sales_trends_period_weekly(self, headers):
        """Test weekly period returns expected period value"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/sales-trends",
            params={"organization_id": TEST_ORG_ID, "period": "weekly"},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["period"] == "weekly"
    
    def test_sales_trends_period_monthly(self, headers):
        """Test monthly period returns expected period value"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/sales-trends",
            params={"organization_id": TEST_ORG_ID, "period": "monthly"},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["period"] == "monthly"
    
    def test_sales_trends_date_range(self, headers):
        """Test date range parameters work correctly"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/sales-trends",
            params={
                "organization_id": TEST_ORG_ID,
                "date_from": "2024-01-01",
                "date_to": "2024-12-31"
            },
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["date_from"] == "2024-01-01"
        assert data["date_to"] == "2024-12-31"
    
    def test_sales_trends_requires_auth(self):
        """Test endpoint returns 401/403 without authentication"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/sales-trends",
            params={"organization_id": TEST_ORG_ID}
        )
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"


class TestTopItemsEndpoint:
    """Tests for GET /api/pos/analytics/top-items"""
    
    def test_top_items_returns_200(self, headers):
        """Test that top-items endpoint returns 200 with valid auth"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/top-items",
            params={"organization_id": TEST_ORG_ID},
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_top_items_response_structure(self, headers):
        """Test response structure has by_quantity and by_revenue arrays"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/top-items",
            params={"organization_id": TEST_ORG_ID},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check top-level fields
        assert "date_from" in data, "Missing 'date_from' field"
        assert "date_to" in data, "Missing 'date_to' field"
        assert "by_quantity" in data, "Missing 'by_quantity' field"
        assert "by_revenue" in data, "Missing 'by_revenue' field"
        assert "total_unique_items" in data, "Missing 'total_unique_items' field"
        
        # Verify arrays
        assert isinstance(data["by_quantity"], list), "by_quantity should be a list"
        assert isinstance(data["by_revenue"], list), "by_revenue should be a list"
    
    def test_top_items_limit_param(self, headers):
        """Test limit parameter works"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/top-items",
            params={"organization_id": TEST_ORG_ID, "limit": 5},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        # If there are items, they should be <= limit
        assert len(data["by_quantity"]) <= 5
        assert len(data["by_revenue"]) <= 5
    
    def test_top_items_requires_auth(self):
        """Test endpoint returns 401/403 without authentication"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/top-items",
            params={"organization_id": TEST_ORG_ID}
        )
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"


class TestCashierPerformanceEndpoint:
    """Tests for GET /api/pos/analytics/cashier-performance"""
    
    def test_cashier_performance_returns_200(self, headers):
        """Test that cashier-performance endpoint returns 200 with valid auth"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/cashier-performance",
            params={"organization_id": TEST_ORG_ID},
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_cashier_performance_response_structure(self, headers):
        """Test response structure has cashiers array"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/cashier-performance",
            params={"organization_id": TEST_ORG_ID},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check top-level fields
        assert "date_from" in data, "Missing 'date_from' field"
        assert "date_to" in data, "Missing 'date_to' field"
        assert "cashiers" in data, "Missing 'cashiers' field"
        assert "total_cashiers" in data, "Missing 'total_cashiers' field"
        
        # Verify array
        assert isinstance(data["cashiers"], list), "cashiers should be a list"
    
    def test_cashier_performance_date_range(self, headers):
        """Test date range parameters work correctly"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/cashier-performance",
            params={
                "organization_id": TEST_ORG_ID,
                "date_from": "2024-01-01",
                "date_to": "2024-12-31"
            },
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["date_from"] == "2024-01-01"
        assert data["date_to"] == "2024-12-31"
    
    def test_cashier_performance_requires_auth(self):
        """Test endpoint returns 401/403 without authentication"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/cashier-performance",
            params={"organization_id": TEST_ORG_ID}
        )
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"


class TestEmptyDataHandling:
    """Tests for graceful handling of empty/no POS data"""
    
    def test_sales_trends_empty_data(self, headers):
        """Test sales-trends returns empty data array gracefully"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/sales-trends",
            params={
                "organization_id": TEST_ORG_ID,
                "date_from": "2099-01-01",  # Future date - no data
                "date_to": "2099-12-31"
            },
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["data"], list)
        # Summary should have zero values for empty period
        assert data["summary"]["total_sales_usd"] == 0
        assert data["summary"]["total_transactions"] == 0
    
    def test_top_items_empty_data(self, headers):
        """Test top-items returns empty arrays gracefully"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/top-items",
            params={
                "organization_id": TEST_ORG_ID,
                "date_from": "2099-01-01",
                "date_to": "2099-12-31"
            },
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["by_quantity"], list)
        assert isinstance(data["by_revenue"], list)
        assert len(data["by_quantity"]) == 0
        assert len(data["by_revenue"]) == 0
    
    def test_cashier_performance_empty_data(self, headers):
        """Test cashier-performance returns empty array gracefully"""
        response = requests.get(
            f"{BASE_URL}/api/pos/analytics/cashier-performance",
            params={
                "organization_id": TEST_ORG_ID,
                "date_from": "2099-01-01",
                "date_to": "2099-12-31"
            },
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["cashiers"], list)
        assert data["total_cashiers"] == 0
