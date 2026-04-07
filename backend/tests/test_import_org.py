"""
Test Import from Organization feature
Tests for GET /api/import-org/tables, POST /api/import-org/preview, POST /api/import-org/execute
Super-admin only access
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestImportOrgFeature:
    """Tests for Import from Organization module"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as super_admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "carlo.mitri@gmail.com",
            "password": "Carinemi@28"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        data = login_response.json()
        self.token = data.get("token")
        self.user = data.get("user")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Get organizations
        orgs_response = self.session.get(f"{BASE_URL}/api/organizations")
        assert orgs_response.status_code == 200
        self.organizations = orgs_response.json()
        
    def test_get_tables_returns_19_tables(self):
        """GET /api/import-org/tables should return exactly 19 importable tables"""
        response = self.session.get(f"{BASE_URL}/api/import-org/tables")
        
        assert response.status_code == 200
        tables = response.json()
        
        # Verify count
        assert len(tables) == 19, f"Expected 19 tables, got {len(tables)}"
        
        # Verify structure
        for table in tables:
            assert "key" in table, "Table should have 'key' field"
            assert "label" in table, "Table should have 'label' field"
            assert "has_date" in table, "Table should have 'has_date' field"
            assert isinstance(table["has_date"], bool)
        
        # Verify expected table keys
        expected_keys = [
            "accounts", "inventory_categories", "inventory_items", "regions",
            "services", "fiscal_years", "exchange_rates", "receipt_settings",
            "document_series", "invoice_templates", "vouchers", "sales_invoices",
            "sales_returns", "purchase_invoices", "purchase_returns", "purchase_orders",
            "sales_quotations", "pos_transactions", "crdb_notes"
        ]
        actual_keys = [t["key"] for t in tables]
        for key in expected_keys:
            assert key in actual_keys, f"Missing table key: {key}"
    
    def test_get_tables_date_based_tables(self):
        """Verify date-based tables are correctly marked"""
        response = self.session.get(f"{BASE_URL}/api/import-org/tables")
        assert response.status_code == 200
        tables = response.json()
        
        # Tables that should have has_date=True
        date_tables = ["exchange_rates", "vouchers", "sales_invoices", "sales_returns",
                       "purchase_invoices", "purchase_returns", "purchase_orders",
                       "sales_quotations", "pos_transactions", "crdb_notes"]
        
        for table in tables:
            if table["key"] in date_tables:
                assert table["has_date"] == True, f"{table['key']} should have has_date=True"
            else:
                assert table["has_date"] == False, f"{table['key']} should have has_date=False"
    
    def test_preview_returns_counts(self):
        """POST /api/import-org/preview should return source org name and counts"""
        if len(self.organizations) < 2:
            pytest.skip("Need at least 2 organizations to test preview")
        
        source_org = self.organizations[0]
        target_org = self.organizations[1]
        
        response = self.session.post(f"{BASE_URL}/api/import-org/preview", json={
            "source_org_id": source_org["id"],
            "target_org_id": target_org["id"],
            "tables": ["accounts", "inventory_items"],
            "from_date": None,
            "to_date": None
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "source_org" in data, "Response should have 'source_org'"
        assert "counts" in data, "Response should have 'counts'"
        assert isinstance(data["counts"], dict)
        
        # Verify counts for requested tables
        assert "accounts" in data["counts"]
        assert "inventory_items" in data["counts"]
        assert isinstance(data["counts"]["accounts"], int)
        assert isinstance(data["counts"]["inventory_items"], int)
    
    def test_preview_invalid_source_org(self):
        """POST /api/import-org/preview with invalid source org should return 404"""
        if len(self.organizations) < 1:
            pytest.skip("Need at least 1 organization")
        
        target_org = self.organizations[0]
        
        response = self.session.post(f"{BASE_URL}/api/import-org/preview", json={
            "source_org_id": "invalid-org-id-12345",
            "target_org_id": target_org["id"],
            "tables": ["accounts"],
            "from_date": None,
            "to_date": None
        })
        
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()
    
    def test_execute_same_org_fails(self):
        """POST /api/import-org/execute with same source and target should return 400"""
        if len(self.organizations) < 1:
            pytest.skip("Need at least 1 organization")
        
        org = self.organizations[0]
        
        response = self.session.post(f"{BASE_URL}/api/import-org/execute", json={
            "source_org_id": org["id"],
            "target_org_id": org["id"],
            "tables": ["accounts"],
            "from_date": None,
            "to_date": None
        })
        
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "same organization" in data["detail"].lower()
    
    def test_execute_invalid_source_org(self):
        """POST /api/import-org/execute with invalid source org should return 404"""
        if len(self.organizations) < 1:
            pytest.skip("Need at least 1 organization")
        
        target_org = self.organizations[0]
        
        response = self.session.post(f"{BASE_URL}/api/import-org/execute", json={
            "source_org_id": "invalid-org-id-12345",
            "target_org_id": target_org["id"],
            "tables": ["accounts"],
            "from_date": None,
            "to_date": None
        })
        
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()
    
    def test_execute_returns_results_structure(self):
        """POST /api/import-org/execute should return proper results structure"""
        if len(self.organizations) < 2:
            pytest.skip("Need at least 2 organizations to test execute")
        
        source_org = self.organizations[0]
        target_org = self.organizations[1]
        
        # Use a table that likely has no data to avoid actual data changes
        response = self.session.post(f"{BASE_URL}/api/import-org/execute", json={
            "source_org_id": source_org["id"],
            "target_org_id": target_org["id"],
            "tables": ["regions"],  # Likely empty, safe to test
            "from_date": None,
            "to_date": None
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "message" in data
        assert "results" in data
        assert "source_org" in data
        assert "target_org" in data
        assert "auto_created_accounts" in data
        
        # Verify results structure
        assert isinstance(data["results"], dict)
        if "regions" in data["results"]:
            assert "imported" in data["results"]["regions"]
            assert "skipped" in data["results"]["regions"]
    
    def test_tables_endpoint_requires_auth(self):
        """GET /api/import-org/tables without auth should return 401 or 403"""
        no_auth_session = requests.Session()
        response = no_auth_session.get(f"{BASE_URL}/api/import-org/tables")
        
        # Accept both 401 (Not authenticated) and 403 (Forbidden)
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
        data = response.json()
        assert "detail" in data
    
    def test_preview_with_date_filter(self):
        """POST /api/import-org/preview with date filter should work"""
        if len(self.organizations) < 2:
            pytest.skip("Need at least 2 organizations")
        
        source_org = self.organizations[0]
        target_org = self.organizations[1]
        
        response = self.session.post(f"{BASE_URL}/api/import-org/preview", json={
            "source_org_id": source_org["id"],
            "target_org_id": target_org["id"],
            "tables": ["vouchers", "sales_invoices"],  # Date-based tables
            "from_date": "2024-01-01",
            "to_date": "2024-12-31"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "counts" in data
        assert "vouchers" in data["counts"]
        assert "sales_invoices" in data["counts"]


class TestImportOrgAccessControl:
    """Tests for super-admin access control"""
    
    def test_tables_endpoint_requires_super_admin(self):
        """Non-super-admin should get 403 on /api/import-org/tables"""
        # This test would require a non-super-admin user
        # Since all users are super_admin in this environment, we skip
        pytest.skip("No non-super-admin users available for testing")
    
    def test_preview_endpoint_requires_super_admin(self):
        """Non-super-admin should get 403 on /api/import-org/preview"""
        pytest.skip("No non-super-admin users available for testing")
    
    def test_execute_endpoint_requires_super_admin(self):
        """Non-super-admin should get 403 on /api/import-org/execute"""
        pytest.skip("No non-super-admin users available for testing")
