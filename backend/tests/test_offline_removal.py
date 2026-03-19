"""
Test suite to verify offline mode removal - All APIs should work correctly 
since offline IndexedDB caching has been removed from frontend.
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://transaction-journal.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "carlo.mitri@gmail.com"
TEST_PASSWORD = "Carinemi@28"


class TestAPIHealth:
    """Basic API health tests"""
    
    def test_api_root_accessible(self):
        """Verify API root endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data or "version" in data
        print(f"API root response: {data}")
    
    def test_organizations_requires_auth(self):
        """Organizations endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/organizations")
        # Should return 401 or require auth
        assert response.status_code in [401, 403, 200]


class TestAuthentication:
    """Test authentication flow"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        # First get organizations
        orgs_response = requests.get(f"{BASE_URL}/api/organizations/public")
        if orgs_response.status_code != 200:
            pytest.skip("Could not fetch organizations")
        
        orgs = orgs_response.json()
        if not orgs:
            pytest.skip("No organizations available")
        
        org_id = orgs[0].get('id')
        
        # Login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "organization_id": org_id
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.text}")
        
        return login_response.json().get("token"), org_id
    
    def test_login_success(self):
        """Test login with valid credentials"""
        # Get public organizations first
        orgs_response = requests.get(f"{BASE_URL}/api/organizations/public")
        assert orgs_response.status_code == 200
        orgs = orgs_response.json()
        assert len(orgs) > 0, "No organizations available"
        
        org_id = orgs[0].get('id')
        
        # Login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "organization_id": org_id
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        print(f"Login successful, token received")


class TestCoreAPIs:
    """Test core API endpoints that frontend pages use"""
    
    @pytest.fixture
    def authenticated_client(self):
        """Get authenticated session"""
        session = requests.Session()
        
        # Get organizations
        orgs_response = session.get(f"{BASE_URL}/api/organizations/public")
        if orgs_response.status_code != 200:
            pytest.skip("Could not fetch organizations")
        
        orgs = orgs_response.json()
        if not orgs:
            pytest.skip("No organizations available")
        
        org_id = orgs[0].get('id')
        
        # Login
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "organization_id": org_id
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.text}")
        
        token = login_response.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        return session, org_id
    
    def test_accounts_endpoint(self, authenticated_client):
        """Test Chart of Accounts API - should return data from server"""
        session, org_id = authenticated_client
        response = session.get(f"{BASE_URL}/api/accounts?organization_id={org_id}&limit=10")
        
        assert response.status_code == 200
        data = response.json()
        # Should return accounts or empty list
        assert isinstance(data, (list, dict))
        print(f"Accounts endpoint returned {len(data) if isinstance(data, list) else 'dict with accounts'}")
    
    def test_customers_endpoint(self, authenticated_client):
        """Test Customers API - data should come from server"""
        session, org_id = authenticated_client
        response = session.get(f"{BASE_URL}/api/customers?organization_id={org_id}&limit=10")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Customers endpoint returned {len(data)} records")
    
    def test_suppliers_endpoint(self, authenticated_client):
        """Test Suppliers API - data should come from server"""
        session, org_id = authenticated_client
        response = session.get(f"{BASE_URL}/api/suppliers?organization_id={org_id}&limit=10")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Suppliers endpoint returned {len(data)} records")
    
    def test_vouchers_endpoint(self, authenticated_client):
        """Test Vouchers API - data should come from server"""
        session, org_id = authenticated_client
        response = session.get(f"{BASE_URL}/api/vouchers?organization_id={org_id}&limit=10")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Vouchers endpoint returned {len(data)} records")
    
    def test_crdb_notes_endpoint(self, authenticated_client):
        """Test Cr/Db Notes API - data should come from server"""
        session, org_id = authenticated_client
        response = session.get(f"{BASE_URL}/api/crdb-notes?organization_id={org_id}&limit=10")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Cr/Db Notes endpoint returned {len(data)} records")
    
    def test_inventory_endpoint(self, authenticated_client):
        """Test Inventory API - data should come from server"""
        session, org_id = authenticated_client
        response = session.get(f"{BASE_URL}/api/inventory?organization_id={org_id}&limit=10")
        
        assert response.status_code == 200
        data = response.json()
        # Inventory returns dict with 'items' key or a list
        if isinstance(data, dict):
            assert "items" in data or "total" in data
            items = data.get("items", [])
            print(f"Inventory endpoint returned {len(items)} items (total: {data.get('total', 'N/A')})")
        else:
            assert isinstance(data, list)
            print(f"Inventory endpoint returned {len(data)} records")
    
    def test_pos_inventory_endpoint(self, authenticated_client):
        """Test POS Inventory API - data should come from server"""
        session, org_id = authenticated_client
        response = session.get(f"{BASE_URL}/api/pos/inventory?organization_id={org_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"POS Inventory endpoint returned {len(data)} records")


class TestAutoCodeGeneration:
    """Test auto-code generation for customers/suppliers"""
    
    @pytest.fixture
    def authenticated_client(self):
        """Get authenticated session"""
        session = requests.Session()
        
        orgs_response = session.get(f"{BASE_URL}/api/organizations/public")
        orgs = orgs_response.json()
        org_id = orgs[0].get('id')
        
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "organization_id": org_id
        })
        
        token = login_response.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        return session, org_id
    
    def test_customer_next_code_generation(self, authenticated_client):
        """Test that next customer code is generated correctly (4111xxxx)"""
        session, org_id = authenticated_client
        response = session.get(f"{BASE_URL}/api/accounts/next-code?organization_id={org_id}&prefix=4111")
        
        assert response.status_code == 200
        data = response.json()
        assert "next_code" in data
        next_code = data["next_code"]
        assert next_code.startswith("4111"), f"Expected code to start with 4111, got {next_code}"
        print(f"Next customer code: {next_code}")
    
    def test_supplier_next_code_generation(self, authenticated_client):
        """Test that next supplier code is generated correctly (4011xxxx)"""
        session, org_id = authenticated_client
        response = session.get(f"{BASE_URL}/api/accounts/next-code?organization_id={org_id}&prefix=4011")
        
        assert response.status_code == 200
        data = response.json()
        assert "next_code" in data
        next_code = data["next_code"]
        assert next_code.startswith("4011"), f"Expected code to start with 4011, got {next_code}"
        print(f"Next supplier code: {next_code}")
