"""
Tests for POS Daily Closing Report API
Tests the new /api/cashier/admin/daily-closing-report endpoint
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ORG_ID = "fa6d4449-a859-445f-9e0b-fbb4aa90bfee"

# Test credentials
TEST_EMAIL = "carlo.mitri@gmail.com"
TEST_PASSWORD = "Carinemi@28"


@pytest.fixture(scope="module")
def auth_token():
    """Authenticate and get token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.status_code}")
    return response.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestDailyClosingReportAPI:
    """Test POS Daily Closing Report endpoint"""
    
    def test_daily_closing_report_returns_200(self, auth_headers):
        """Test that daily closing report endpoint returns 200"""
        today = datetime.now().strftime('%Y-%m-%d')
        response = requests.get(
            f"{BASE_URL}/api/cashier/admin/daily-closing-report",
            params={"organization_id": ORG_ID, "date": today},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ Daily closing report API returns 200 for date {today}")
    
    def test_daily_closing_report_structure(self, auth_headers):
        """Test that the response has correct structure"""
        today = datetime.now().strftime('%Y-%m-%d')
        response = requests.get(
            f"{BASE_URL}/api/cashier/admin/daily-closing-report",
            params={"organization_id": ORG_ID, "date": today},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify date field
        assert "date" in data, "Response should include 'date' field"
        assert data["date"] == today, f"Date should match request date"
        
        # Verify grand_totals structure
        assert "grand_totals" in data, "Response should include 'grand_totals'"
        grand_totals = data["grand_totals"]
        expected_fields = [
            "total_sales_usd", "total_sales_lbp", "total_transactions",
            "cash_usd", "card_usd", "credit_usd",
            "total_sessions", "open_sessions", "closed_sessions",
            "total_variance_usd", "total_variance_lbp"
        ]
        for field in expected_fields:
            assert field in grand_totals, f"grand_totals should have '{field}'"
        
        # Verify cashier_sessions is a list
        assert "cashier_sessions" in data, "Response should include 'cashier_sessions'"
        assert isinstance(data["cashier_sessions"], list), "cashier_sessions should be a list"
        
        # Verify admin_pos structure
        assert "admin_pos" in data, "Response should include 'admin_pos'"
        assert "transaction_count" in data["admin_pos"], "admin_pos should have transaction_count"
        assert "total_sales_usd" in data["admin_pos"], "admin_pos should have total_sales_usd"
        assert "transactions" in data["admin_pos"], "admin_pos should have transactions"
        
        print("✓ Daily closing report has correct structure with all required fields")
    
    def test_daily_closing_report_different_dates(self, auth_headers):
        """Test report with different dates"""
        today = datetime.now()
        yesterday = (today - timedelta(days=1)).strftime('%Y-%m-%d')
        last_week = (today - timedelta(days=7)).strftime('%Y-%m-%d')
        
        for date in [yesterday, last_week]:
            response = requests.get(
                f"{BASE_URL}/api/cashier/admin/daily-closing-report",
                params={"organization_id": ORG_ID, "date": date},
                headers=auth_headers
            )
            assert response.status_code == 200, f"Failed for date {date}"
            data = response.json()
            assert data["date"] == date, f"Date mismatch for {date}"
        
        print(f"✓ Daily closing report works for multiple dates")
    
    def test_daily_closing_report_requires_auth(self):
        """Test that endpoint requires authentication"""
        today = datetime.now().strftime('%Y-%m-%d')
        response = requests.get(
            f"{BASE_URL}/api/cashier/admin/daily-closing-report",
            params={"organization_id": ORG_ID, "date": today}
        )
        assert response.status_code in [401, 403], "Should require authentication"
        print("✓ Endpoint correctly requires authentication")
    
    def test_daily_closing_report_grand_totals_types(self, auth_headers):
        """Test that grand_totals fields have correct types"""
        today = datetime.now().strftime('%Y-%m-%d')
        response = requests.get(
            f"{BASE_URL}/api/cashier/admin/daily-closing-report",
            params={"organization_id": ORG_ID, "date": today},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        grand_totals = data["grand_totals"]
        
        # Numeric fields should be numbers (int or float)
        numeric_fields = [
            "total_sales_usd", "total_sales_lbp", "total_transactions",
            "cash_usd", "card_usd", "credit_usd",
            "total_sessions", "open_sessions", "closed_sessions",
            "total_variance_usd", "total_variance_lbp"
        ]
        for field in numeric_fields:
            value = grand_totals[field]
            assert isinstance(value, (int, float)), f"{field} should be numeric, got {type(value)}"
        
        print("✓ All grand_totals fields have correct numeric types")
    
    def test_daily_closing_report_empty_data(self, auth_headers):
        """Test that empty data is handled gracefully"""
        # Use a future date which should have no data
        future_date = (datetime.now() + timedelta(days=365)).strftime('%Y-%m-%d')
        response = requests.get(
            f"{BASE_URL}/api/cashier/admin/daily-closing-report",
            params={"organization_id": ORG_ID, "date": future_date},
            headers=auth_headers
        )
        assert response.status_code == 200, "Should return 200 even for no data"
        data = response.json()
        
        # Should return zero values, not errors
        assert data["grand_totals"]["total_transactions"] == 0
        assert data["grand_totals"]["total_sessions"] == 0
        assert len(data["cashier_sessions"]) == 0
        assert data["admin_pos"]["transaction_count"] == 0
        
        print("✓ Empty data handled gracefully with zero values")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
