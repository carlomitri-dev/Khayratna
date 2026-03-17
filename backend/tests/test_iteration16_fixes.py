"""
Test Suite for Iteration 16 Fixes:
1. Date Input freeze fix (frontend only - tested via Playwright)
2. FY-filtered account balances in customer-accounts and accounts/movable/list
3. Category and Supplier searchable dropdowns in Inventory (frontend - tested via Playwright)
4. Custom invoice print template (frontend - tested via Playwright)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "carlo.mitri@gmail.com"
TEST_PASSWORD = "Carinemi@28"
ORGANIZATION_ID = "fa6d4449-a859-445f-9e0b-fbb4aa90bfee"
FY_2017_ID = "ec0a1e9b-e0bc-433b-a5fa-059ca159b13d"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token") or response.json().get("token")
    pytest.skip("Authentication failed - skipping tests")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Auth headers"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestFYFilteredBalances:
    """Test that FY-filtered balances work on customer-accounts and accounts/movable/list endpoints"""

    def test_customer_accounts_without_fy(self, auth_headers):
        """Test GET /api/customer-accounts returns accounts without fy_id param"""
        response = requests.get(
            f"{BASE_URL}/api/customer-accounts",
            params={"organization_id": ORGANIZATION_ID},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Got {len(data)} customer accounts without FY filter")
        
        # Verify accounts have balance fields
        if len(data) > 0:
            first_acc = data[0]
            assert 'code' in first_acc, "Account should have code"
            assert 'name' in first_acc, "Account should have name"
            # Balance fields should be present
            assert 'balance_usd' in first_acc or 'balance_lbp' in first_acc, "Account should have balance field"

    def test_customer_accounts_with_fy_id(self, auth_headers):
        """Test GET /api/customer-accounts accepts fy_id param for FY-filtered balances"""
        response = requests.get(
            f"{BASE_URL}/api/customer-accounts",
            params={"organization_id": ORGANIZATION_ID, "fy_id": FY_2017_ID},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Got {len(data)} customer accounts WITH FY filter (fy_id={FY_2017_ID})")
        
        # The endpoint should accept fy_id without error
        # Balances should be recalculated based on FY

    def test_supplier_accounts_without_fy(self, auth_headers):
        """Test GET /api/supplier-accounts returns accounts without fy_id param"""
        response = requests.get(
            f"{BASE_URL}/api/supplier-accounts",
            params={"organization_id": ORGANIZATION_ID},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Got {len(data)} supplier accounts without FY filter")

    def test_supplier_accounts_with_fy_id(self, auth_headers):
        """Test GET /api/supplier-accounts accepts fy_id param for FY-filtered balances"""
        response = requests.get(
            f"{BASE_URL}/api/supplier-accounts",
            params={"organization_id": ORGANIZATION_ID, "fy_id": FY_2017_ID},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Got {len(data)} supplier accounts WITH FY filter (fy_id={FY_2017_ID})")

    def test_movable_accounts_without_fy(self, auth_headers):
        """Test GET /api/accounts/movable/list returns accounts without fy_id param"""
        response = requests.get(
            f"{BASE_URL}/api/accounts/movable/list",
            params={"organization_id": ORGANIZATION_ID},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Got {len(data)} movable accounts without FY filter")

    def test_movable_accounts_with_fy_id(self, auth_headers):
        """Test GET /api/accounts/movable/list accepts fy_id param for FY-filtered balances"""
        response = requests.get(
            f"{BASE_URL}/api/accounts/movable/list",
            params={"organization_id": ORGANIZATION_ID, "fy_id": FY_2017_ID},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Got {len(data)} movable accounts WITH FY filter (fy_id={FY_2017_ID})")
        
        # Verify balance fields exist
        if len(data) > 0:
            first_acc = data[0]
            assert 'balance_usd' in first_acc, "Account should have balance_usd field"


class TestSalesInvoiceEndpoints:
    """Test sales invoice related endpoints"""

    def test_get_sales_invoices(self, auth_headers):
        """Test GET /api/sales-invoices returns list"""
        response = requests.get(
            f"{BASE_URL}/api/sales-invoices",
            params={"organization_id": ORGANIZATION_ID},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Got {len(data)} sales invoices")

    def test_get_sales_accounts(self, auth_headers):
        """Test GET /api/sales-accounts returns list"""
        response = requests.get(
            f"{BASE_URL}/api/sales-accounts",
            params={"organization_id": ORGANIZATION_ID},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Got {len(data)} sales accounts")


class TestInventoryEndpoints:
    """Test inventory endpoints for category/supplier search"""

    def test_get_inventory_items(self, auth_headers):
        """Test GET /api/inventory returns items"""
        response = requests.get(
            f"{BASE_URL}/api/inventory",
            params={"organization_id": ORGANIZATION_ID, "page": 1, "page_size": 10},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        # Can be dict with items key or list
        if isinstance(data, dict):
            assert 'items' in data or 'total' in data
            print(f"Got inventory response with {data.get('total', len(data.get('items', [])))} items")
        else:
            print(f"Got {len(data)} inventory items")

    def test_get_inventory_categories(self, auth_headers):
        """Test GET /api/inventory-categories returns categories"""
        response = requests.get(
            f"{BASE_URL}/api/inventory-categories",
            params={"organization_id": ORGANIZATION_ID},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Got {len(data)} inventory categories")

    def test_get_inventory_suppliers(self, auth_headers):
        """Test GET /api/inventory-suppliers returns suppliers"""
        response = requests.get(
            f"{BASE_URL}/api/inventory-suppliers",
            params={"organization_id": ORGANIZATION_ID},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Got {len(data)} inventory suppliers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
