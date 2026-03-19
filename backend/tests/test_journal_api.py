"""
Test Journal API endpoint - GET /api/reports/journal
Tests the Journal module backend API for fetching all posted vouchers
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test request
TEST_EMAIL = "carlo.mitri@gmail.com"
TEST_PASSWORD = "Carinemi@28"


class TestJournalAPI:
    """Test cases for Journal API endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token") or data.get("token")
        pytest.fail(f"Login failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture(scope="class")
    def user_data(self, auth_headers):
        """Get current user data including organizations"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get user data: {response.status_code}"
        return response.json()
    
    @pytest.fixture(scope="class")
    def organization_id(self, user_data):
        """Extract organization_id from user data"""
        # User should have at least one organization
        orgs = user_data.get('organizations', [])
        if orgs:
            return orgs[0].get('id')
        # Or it might be in current_organization
        current_org = user_data.get('current_organization', {})
        if current_org.get('id'):
            return current_org.get('id')
        # Or directly as organization_id
        if user_data.get('organization_id'):
            return user_data.get('organization_id')
        pytest.fail("No organization_id found in user data")
    
    def test_login_success(self, auth_token):
        """Test that login works and returns valid token"""
        assert auth_token is not None
        assert len(auth_token) > 0
        print(f"Login successful, token received (length: {len(auth_token)})")
    
    def test_journal_endpoint_exists(self, auth_headers, organization_id):
        """Test that journal endpoint exists and returns proper structure"""
        response = requests.get(
            f"{BASE_URL}/api/reports/journal",
            params={"organization_id": organization_id},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Journal endpoint failed: {response.status_code} - {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "vouchers" in data, "Response missing 'vouchers' array"
        assert "total_vouchers" in data, "Response missing 'total_vouchers'"
        assert "grand_total" in data, "Response missing 'grand_total'"
        
        # Verify grand_total structure
        gt = data["grand_total"]
        assert "debit_usd" in gt, "grand_total missing 'debit_usd'"
        assert "credit_usd" in gt, "grand_total missing 'credit_usd'"
        assert "debit_lbp" in gt, "grand_total missing 'debit_lbp'"
        assert "credit_lbp" in gt, "grand_total missing 'credit_lbp'"
        
        print(f"Journal endpoint returns {data['total_vouchers']} vouchers")
        print(f"Grand total structure verified: {list(gt.keys())}")
    
    def test_journal_with_date_filter(self, auth_headers, organization_id):
        """Test journal endpoint with date range filter"""
        response = requests.get(
            f"{BASE_URL}/api/reports/journal",
            params={
                "organization_id": organization_id,
                "from_date": "2024-01-01",
                "to_date": "2025-12-31"
            },
            headers=auth_headers
        )
        assert response.status_code == 200, f"Journal with dates failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "vouchers" in data
        # Check from_date and to_date in response
        assert data.get("from_date") == "2024-01-01" or data.get("from_date") is None
        assert data.get("to_date") == "2025-12-31" or data.get("to_date") is None
        print(f"Journal with date filter returns {data['total_vouchers']} vouchers")
    
    def test_journal_without_auth_fails(self, organization_id):
        """Test that journal endpoint requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/reports/journal",
            params={"organization_id": organization_id}
        )
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print(f"Unauthenticated request correctly returned {response.status_code}")
    
    def test_journal_voucher_structure(self, auth_headers, organization_id):
        """Test voucher structure in journal response"""
        response = requests.get(
            f"{BASE_URL}/api/reports/journal",
            params={"organization_id": organization_id},
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        vouchers = data.get("vouchers", [])
        
        if len(vouchers) > 0:
            voucher = vouchers[0]
            # Verify voucher fields
            expected_fields = ["id", "voucher_number", "voucher_type", "date", "lines"]
            for field in expected_fields:
                assert field in voucher, f"Voucher missing field: {field}"
            
            # Verify balance check fields
            assert "is_balanced_usd" in voucher, "Voucher missing 'is_balanced_usd'"
            assert "is_balanced_lbp" in voucher, "Voucher missing 'is_balanced_lbp'"
            assert "total_debit_usd" in voucher, "Voucher missing 'total_debit_usd'"
            assert "total_credit_usd" in voucher, "Voucher missing 'total_credit_usd'"
            
            # Verify lines structure if voucher has lines
            if voucher.get("lines"):
                line = voucher["lines"][0]
                line_expected_fields = ["account_code", "account_name", "debit_usd", "credit_usd", "debit_lbp", "credit_lbp"]
                for field in line_expected_fields:
                    assert field in line, f"Line missing field: {field}"
                print(f"Voucher structure verified with {len(voucher['lines'])} lines")
            else:
                print("Voucher has no lines to verify")
        else:
            print("No vouchers found in journal - empty result (may be expected if no posted vouchers)")


class TestTrialBalanceAPI:
    """Test Trial Balance endpoint for comparison/verification"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token") or data.get("token")
        pytest.fail(f"Login failed: {response.status_code}")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture(scope="class")
    def organization_id(self, auth_headers):
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        if response.status_code == 200:
            user_data = response.json()
            orgs = user_data.get('organizations', [])
            if orgs:
                return orgs[0].get('id')
            if user_data.get('organization_id'):
                return user_data.get('organization_id')
        pytest.skip("Could not get organization_id")
    
    def test_trial_balance_endpoint(self, auth_headers, organization_id):
        """Verify trial balance endpoint still works (Journal should be above this in nav)"""
        response = requests.get(
            f"{BASE_URL}/api/reports/trial-balance",
            params={"organization_id": organization_id},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Trial balance failed: {response.status_code} - {response.text}"
        print("Trial Balance endpoint working correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
