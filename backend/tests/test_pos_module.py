"""
POS Module API Tests
Tests for POS Terminal, Cashier Sessions, and Cashier Management endpoints
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://invoice-redesign-6.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "carlo.mitri@gmail.com"
TEST_PASSWORD = "Carinemi@28"
ORG_ID = "fa6d4449-a859-445f-9e0b-fbb4aa90bfee"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for API tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


# ============== POS TERMINAL ENDPOINTS ==============

class TestPOSInventory:
    """Test /api/pos/inventory endpoint for POS Terminal"""
    
    def test_pos_inventory_returns_list(self, api_client):
        """POS inventory endpoint should return list of items"""
        response = api_client.get(f"{BASE_URL}/api/pos/inventory?organization_id={ORG_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # If items exist, verify structure
        if len(data) > 0:
            item = data[0]
            # Check required fields for POS
            assert "id" in item, "Item should have id"
            assert "name" in item, "Item should have name"
            print(f"✓ POS inventory returned {len(data)} items")
        else:
            print("✓ POS inventory endpoint works (no items in org)")


class TestPOSCashAccounts:
    """Test /api/pos/cash-accounts endpoint"""
    
    def test_cash_accounts_returns_list(self, api_client):
        """Cash accounts endpoint should return list of accounts"""
        response = api_client.get(f"{BASE_URL}/api/pos/cash-accounts?organization_id={ORG_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Verify account structure
        if len(data) > 0:
            account = data[0]
            assert "id" in account
            assert "code" in account
            assert "name" in account
            # Verify it's a class 5 account (cash/bank)
            assert account["code"].startswith("5"), "Cash accounts should start with 5"
            print(f"✓ POS cash accounts returned {len(data)} accounts")
        else:
            print("✓ POS cash accounts endpoint works (no accounts found)")


class TestPOSDailySummary:
    """Test /api/pos/daily-summary endpoint"""
    
    def test_daily_summary_returns_data(self, api_client):
        """Daily summary endpoint should return summary object"""
        response = api_client.get(f"{BASE_URL}/api/pos/daily-summary?organization_id={ORG_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "date" in data, "Response should have date"
        assert "total_transactions" in data, "Response should have total_transactions"
        assert "total_sales" in data, "Response should have total_sales"
        assert "by_payment_method" in data, "Response should have by_payment_method"
        
        print(f"✓ Daily summary: {data['total_transactions']} transactions, ${data['total_sales']} sales")


class TestPOSTransactions:
    """Test /api/pos/transactions endpoint"""
    
    def test_get_transactions(self, api_client):
        """Get POS transactions list"""
        response = api_client.get(f"{BASE_URL}/api/pos/transactions?organization_id={ORG_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ POS transactions returned {len(data)} records")
    
    def test_get_transactions_count(self, api_client):
        """Get POS transactions count"""
        response = api_client.get(f"{BASE_URL}/api/pos/transactions/count?organization_id={ORG_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "count" in data, "Response should have count"
        print(f"✓ POS transactions count: {data['count']}")


# ============== CASHIER MANAGEMENT ENDPOINTS ==============

class TestCashierManagement:
    """Test /api/cashier/* endpoints for cashier management"""
    
    def test_get_cashiers_list(self, api_client):
        """Get list of cashiers (admin only)"""
        response = api_client.get(f"{BASE_URL}/api/cashier/cashiers?organization_id={ORG_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of cashiers"
        print(f"✓ Cashiers list returned {len(data)} cashiers")
    
    def test_create_cashier(self, api_client):
        """Create a new cashier"""
        import uuid
        test_email = f"TEST_cashier_{uuid.uuid4().hex[:8]}@test.com"
        
        response = api_client.post(f"{BASE_URL}/api/cashier/cashiers", json={
            "email": test_email,
            "password": "test123",
            "name": "TEST Cashier",
            "pin": "1234",
            "organization_id": ORG_ID
        })
        
        # Should succeed (201 or 200)
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should have id"
        assert data["email"] == test_email, "Email should match"
        assert data["name"] == "TEST Cashier", "Name should match"
        
        # Store cashier ID for cleanup
        cashier_id = data["id"]
        print(f"✓ Created cashier: {test_email} (ID: {cashier_id})")
        
        # Cleanup - delete the test cashier
        delete_response = api_client.delete(f"{BASE_URL}/api/cashier/cashiers/{cashier_id}")
        assert delete_response.status_code in [200, 204], f"Cleanup failed: {delete_response.text}"
        print(f"✓ Cleaned up test cashier")


# ============== CASHIER SESSIONS ENDPOINTS ==============

class TestCashierSessions:
    """Test /api/cashier/sessions/* endpoints"""
    
    def test_get_sessions_list(self, api_client):
        """Get sessions list"""
        response = api_client.get(f"{BASE_URL}/api/cashier/sessions?organization_id={ORG_ID}&limit=100")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of sessions"
        print(f"✓ Sessions list returned {len(data)} sessions")
        
        # Verify session structure if any exist
        if len(data) > 0:
            session = data[0]
            assert "id" in session
            assert "cashier_id" in session
            assert "cashier_name" in session
            assert "status" in session
            assert "opened_at" in session
    
    def test_get_live_sessions(self, api_client):
        """Get live (open) sessions - admin endpoint"""
        response = api_client.get(f"{BASE_URL}/api/cashier/admin/live-sessions?organization_id={ORG_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Live sessions: {len(data)} open sessions")
    
    def test_get_session_summary(self, api_client):
        """Get session summary - admin endpoint"""
        response = api_client.get(f"{BASE_URL}/api/cashier/admin/session-summary?organization_id={ORG_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "total_sessions" in data
        assert "open_sessions" in data
        assert "closed_sessions" in data
        assert "total_transactions" in data
        assert "total_sales_usd" in data
        
        print(f"✓ Session summary: {data['total_sessions']} total, {data['open_sessions']} open, ${data['total_sales_usd']} sales")


# ============== SUPPORTING API ENDPOINTS ==============

class TestSupportingEndpoints:
    """Test supporting endpoints used by POS pages"""
    
    def test_customer_accounts(self, api_client):
        """Customer accounts for customer selection in POS"""
        response = api_client.get(f"{BASE_URL}/api/customer-accounts?organization_id={ORG_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Customer accounts: {len(data)} customers")
    
    def test_sales_accounts(self, api_client):
        """Sales accounts for POS credit account"""
        response = api_client.get(f"{BASE_URL}/api/sales-accounts?organization_id={ORG_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Sales accounts: {len(data)} accounts")
    
    def test_organizations_public(self, api_client):
        """Public organizations for cashier login page"""
        # This endpoint doesn't require auth
        response = requests.get(f"{BASE_URL}/api/organizations/public")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should have at least one organization"
        print(f"✓ Public organizations: {len(data)} orgs")


# ============== CASHIER LOGIN ENDPOINT ==============

class TestCashierLogin:
    """Test /api/cashier/login endpoint (doesn't require auth)"""
    
    def test_cashier_login_endpoint_exists(self):
        """Cashier login endpoint should exist"""
        # Test with invalid credentials - should return 401 not 404
        response = requests.post(f"{BASE_URL}/api/cashier/login", json={
            "organization_id": ORG_ID,
            "email": "fake@test.com",
            "password": "wrongpassword"
        })
        
        # Should get 401 (invalid credentials) not 404 (not found)
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✓ Cashier login endpoint exists and returns 401 for invalid credentials")
    
    def test_admin_can_login_as_cashier(self):
        """Admin should be able to login via cashier endpoint"""
        response = requests.post(f"{BASE_URL}/api/cashier/login", json={
            "organization_id": ORG_ID,
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should have token"
        assert "user" in data, "Response should have user"
        assert data["user"]["email"] == TEST_EMAIL
        print("✓ Admin can login via cashier endpoint")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
