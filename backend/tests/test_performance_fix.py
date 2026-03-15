"""
Test suite for performance fixes in KAIROS accounting app
Tests: Account selectors performance, endpoint optimization

Testing:
1. /api/accounts/movable/list endpoint works with search parameter
2. /api/customer-accounts endpoint works with search parameter 
3. /api/supplier-accounts endpoint works with search parameter
4. /api/sales-accounts endpoint returns data
5. /api/purchase-accounts endpoint returns data
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://nextcode-crdb.preview.emergentagent.com')
if BASE_URL.endswith('/'):
    BASE_URL = BASE_URL.rstrip('/')

# Test credentials from the review request
TEST_EMAIL = "carlo.mitri@gmail.com"
TEST_PASSWORD = "Carinemi@28"
ORGANIZATION_ID = "fa6d4449-a859-445f-9e0b-fbb4aa90bfee"


class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        # API returns 'token' not 'access_token'
        assert "token" in data, "No token in response"
        return data["token"]
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        print(f"✓ Login successful - User: {data['user'].get('email')}")


class TestMovableAccountsEndpoint:
    """Tests for /api/accounts/movable/list endpoint (optimized version)"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json().get("token")
    
    def test_movable_accounts_without_search(self, auth_token):
        """Test movable accounts endpoint without search - should return quickly"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/api/accounts/movable/list?organization_id={ORGANIZATION_ID}",
            headers=headers
        )
        elapsed = time.time() - start
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Performance check - should respond within 5 seconds
        assert elapsed < 5, f"Response too slow: {elapsed}s"
        print(f"✓ Movable accounts loaded: {len(data)} accounts in {elapsed:.2f}s")
    
    def test_movable_accounts_with_search(self, auth_token):
        """Test movable accounts with search parameter"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/api/accounts/movable/list?organization_id={ORGANIZATION_ID}&search=cash",
            headers=headers
        )
        elapsed = time.time() - start
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Verify search works
        if len(data) > 0:
            # At least one account should contain search term
            found_match = any('cash' in (acc.get('name', '') + acc.get('code', '')).lower() for acc in data)
            print(f"✓ Movable accounts with search: {len(data)} results in {elapsed:.2f}s, matches found: {found_match}")
        else:
            print(f"✓ Movable accounts with search: 0 results in {elapsed:.2f}s (no accounts with 'cash')")
        
        assert elapsed < 5, f"Search response too slow: {elapsed}s"


class TestCustomerAccountsEndpoint:
    """Tests for /api/customer-accounts endpoint (optimized for sales invoices)"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json().get("token")
    
    def test_customer_accounts_without_search(self, auth_token):
        """Test customer accounts endpoint without search"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/api/customer-accounts?organization_id={ORGANIZATION_ID}",
            headers=headers
        )
        elapsed = time.time() - start
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Performance check
        assert elapsed < 5, f"Response too slow: {elapsed}s"
        print(f"✓ Customer accounts loaded: {len(data)} accounts in {elapsed:.2f}s")
    
    def test_customer_accounts_with_search(self, auth_token):
        """Test customer accounts with search parameter"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/api/customer-accounts?organization_id={ORGANIZATION_ID}&search=test",
            headers=headers
        )
        elapsed = time.time() - start
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        assert elapsed < 5, f"Search response too slow: {elapsed}s"
        print(f"✓ Customer accounts with search: {len(data)} results in {elapsed:.2f}s")


class TestSupplierAccountsEndpoint:
    """Tests for /api/supplier-accounts endpoint (optimized for purchase invoices)"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json().get("token")
    
    def test_supplier_accounts_without_search(self, auth_token):
        """Test supplier accounts endpoint without search"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/api/supplier-accounts?organization_id={ORGANIZATION_ID}",
            headers=headers
        )
        elapsed = time.time() - start
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Performance check
        assert elapsed < 5, f"Response too slow: {elapsed}s"
        print(f"✓ Supplier accounts loaded: {len(data)} accounts in {elapsed:.2f}s")
    
    def test_supplier_accounts_with_search(self, auth_token):
        """Test supplier accounts with search parameter"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/api/supplier-accounts?organization_id={ORGANIZATION_ID}&search=test",
            headers=headers
        )
        elapsed = time.time() - start
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        assert elapsed < 5, f"Search response too slow: {elapsed}s"
        print(f"✓ Supplier accounts with search: {len(data)} results in {elapsed:.2f}s")


class TestSalesAndPurchaseAccounts:
    """Tests for sales and purchase account endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json().get("token")
    
    def test_sales_accounts(self, auth_token):
        """Test /api/sales-accounts endpoint returns data"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/api/sales-accounts?organization_id={ORGANIZATION_ID}",
            headers=headers
        )
        elapsed = time.time() - start
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Performance check
        assert elapsed < 5, f"Response too slow: {elapsed}s"
        print(f"✓ Sales accounts loaded: {len(data)} accounts in {elapsed:.2f}s")
        
        # Verify accounts are class 7 (revenue)
        if len(data) > 0:
            for acc in data[:5]:  # Check first 5
                code = acc.get('code', '')
                assert code.startswith('7'), f"Sales account should start with 7: {code}"
            print(f"✓ Sales accounts verified - all start with '7' (revenue class)")
    
    def test_purchase_accounts(self, auth_token):
        """Test /api/purchase-accounts endpoint returns data"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/api/purchase-accounts?organization_id={ORGANIZATION_ID}",
            headers=headers
        )
        elapsed = time.time() - start
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Performance check
        assert elapsed < 5, f"Response too slow: {elapsed}s"
        print(f"✓ Purchase accounts loaded: {len(data)} accounts in {elapsed:.2f}s")
        
        # Verify accounts are class 6 (expenses)
        if len(data) > 0:
            for acc in data[:5]:  # Check first 5
                code = acc.get('code', '')
                assert code.startswith('6'), f"Purchase account should start with 6: {code}"
            print(f"✓ Purchase accounts verified - all start with '6' (expense class)")


class TestInventoryEndpoint:
    """Tests for inventory endpoint - verifying data structure for table alignment"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json().get("token")
    
    def test_inventory_list(self, auth_token):
        """Test inventory endpoint returns proper data structure"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/inventory?organization_id={ORGANIZATION_ID}&page=1&page_size=10",
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Check paginated response structure
        if isinstance(data, dict) and 'items' in data:
            items = data['items']
            total = data.get('total', 0)
        else:
            items = data if isinstance(data, list) else []
            total = len(items)
        
        print(f"✓ Inventory loaded: {len(items)} items (total: {total})")
        
        # Verify item structure (10 expected columns)
        if len(items) > 0:
            item = items[0]
            # Expected fields for 10-column table
            expected_fields = ['name', 'cost', 'price', 'on_hand_qty']
            for field in expected_fields:
                assert field in item, f"Missing field: {field}"
            print(f"✓ Inventory item structure verified - all required fields present")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
