"""
Test Box & Package Field Persistence in Sales Invoices
Tests the bug fix where box, package, pack_description fields were being cleared on invoice save.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://invoice-journal-app.preview.emergentagent.com"

# Test credentials
TEST_EMAIL = "carlo.mitri@gmail.com"
TEST_PASSWORD = "Carinemi@28"


class TestBoxPackagePersistence:
    """Tests for Box & Package field persistence in sales invoices"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in login response"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def organization_id(self, auth_token):
        """Get organization ID"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/organizations", headers=headers)
        assert response.status_code == 200, f"Failed to get organizations: {response.text}"
        orgs = response.json()
        assert len(orgs) > 0, "No organizations found"
        return orgs[0]["id"]
    
    @pytest.fixture(scope="class")
    def customer_account_id(self, auth_token, organization_id):
        """Get or create a customer account (4111 series)"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/customer-accounts?organization_id={organization_id}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get customer accounts: {response.text}"
        accounts = response.json()
        
        if len(accounts) > 0:
            return accounts[0]["id"]
        
        # Create a test customer account if none exists
        create_response = requests.post(
            f"{BASE_URL}/api/accounts",
            headers=headers,
            json={
                "code": "41110001",
                "name": "TEST Customer Account",
                "name_ar": "حساب عميل اختبار",
                "account_class": 4,
                "account_type": "asset",
                "is_active": True,
                "organization_id": organization_id
            }
        )
        assert create_response.status_code == 200, f"Failed to create customer account: {create_response.text}"
        return create_response.json()["id"]
    
    @pytest.fixture(scope="class")
    def sales_account_id(self, auth_token, organization_id):
        """Get or create a sales account"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/sales-accounts?organization_id={organization_id}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get sales accounts: {response.text}"
        accounts = response.json()
        
        if len(accounts) > 0:
            return accounts[0]["id"]
        
        # Create a test sales account if none exists
        create_response = requests.post(
            f"{BASE_URL}/api/accounts",
            headers=headers,
            json={
                "code": "71010001",
                "name": "TEST Sales Revenue",
                "name_ar": "إيرادات المبيعات اختبار",
                "account_class": 7,
                "account_type": "revenue",
                "is_active": True,
                "organization_id": organization_id
            }
        )
        assert create_response.status_code == 200, f"Failed to create sales account: {create_response.text}"
        return create_response.json()["id"]
    
    def test_create_invoice_with_box_package_fields(
        self, auth_token, organization_id, customer_account_id, sales_account_id
    ):
        """Create a sales invoice with box, package, pack_description fields and verify persistence"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Create invoice with box & package fields
        invoice_data = {
            "date": "2026-01-15",
            "due_date": "2026-02-15",
            "lines": [
                {
                    "item_name": "TEST_Item_Box_Package",
                    "item_name_ar": "عنصر اختبار",
                    "box": 5.0,
                    "package": 12.0,
                    "pack_description": "12 pieces per box",
                    "quantity": 60,
                    "unit": "piece",
                    "unit_price": 10.50,
                    "currency": "USD",
                    "exchange_rate": 1,
                    "discount_percent": 0,
                    "line_total": 630.0,
                    "is_taxable": True
                },
                {
                    "item_name": "TEST_Item_Without_Box",
                    "quantity": 10,
                    "unit": "piece",
                    "unit_price": 5.00,
                    "currency": "USD",
                    "exchange_rate": 1,
                    "discount_percent": 0,
                    "line_total": 50.0,
                    "is_taxable": True
                }
            ],
            "subtotal": 680.0,
            "discount_percent": 0,
            "discount_amount": 0,
            "tax_percent": 11,
            "tax_amount": 74.8,
            "total": 754.8,
            "total_usd": 754.8,
            "currency": "USD",
            "notes": "Test invoice for box/package persistence",
            "debit_account_id": customer_account_id,
            "credit_account_id": sales_account_id,
            "organization_id": organization_id
        }
        
        # Create the invoice
        create_response = requests.post(
            f"{BASE_URL}/api/sales-invoices",
            json=invoice_data,
            headers=headers
        )
        assert create_response.status_code == 200, f"Failed to create invoice: {create_response.text}"
        
        created_invoice = create_response.json()
        invoice_id = created_invoice["id"]
        
        # Verify box & package in create response
        assert len(created_invoice["lines"]) == 2, "Expected 2 lines in invoice"
        
        line1 = created_invoice["lines"][0]
        assert line1.get("box") == 5.0, f"box field not preserved in create response. Got: {line1.get('box')}"
        assert line1.get("package") == 12.0, f"package field not preserved in create response. Got: {line1.get('package')}"
        assert line1.get("pack_description") == "12 pieces per box", f"pack_description not preserved. Got: {line1.get('pack_description')}"
        
        print(f"✓ Invoice created with ID: {invoice_id}")
        print(f"✓ Box field preserved in create response: {line1.get('box')}")
        print(f"✓ Package field preserved in create response: {line1.get('package')}")
        print(f"✓ Pack description preserved in create response: {line1.get('pack_description')}")
        
        # GET the invoice to verify persistence
        get_response = requests.get(
            f"{BASE_URL}/api/sales-invoices/{invoice_id}",
            headers=headers
        )
        assert get_response.status_code == 200, f"Failed to get invoice: {get_response.text}"
        
        fetched_invoice = get_response.json()
        fetched_line1 = fetched_invoice["lines"][0]
        
        assert fetched_line1.get("box") == 5.0, f"box field lost after GET. Got: {fetched_line1.get('box')}"
        assert fetched_line1.get("package") == 12.0, f"package field lost after GET. Got: {fetched_line1.get('package')}"
        assert fetched_line1.get("pack_description") == "12 pieces per box", f"pack_description lost after GET. Got: {fetched_line1.get('pack_description')}"
        
        print(f"✓ Box field persisted after GET: {fetched_line1.get('box')}")
        print(f"✓ Package field persisted after GET: {fetched_line1.get('package')}")
        print(f"✓ Pack description persisted after GET: {fetched_line1.get('pack_description')}")
        
        # Clean up - delete the test invoice
        delete_response = requests.delete(
            f"{BASE_URL}/api/sales-invoices/{invoice_id}",
            headers=headers
        )
        assert delete_response.status_code == 200, f"Failed to delete test invoice: {delete_response.text}"
        print(f"✓ Test invoice deleted")
    
    def test_update_invoice_preserves_box_package(
        self, auth_token, organization_id, customer_account_id, sales_account_id
    ):
        """Test that updating an invoice preserves box & package fields"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Create invoice
        invoice_data = {
            "date": "2026-01-15",
            "lines": [
                {
                    "item_name": "TEST_Update_Box_Package",
                    "box": 3.0,
                    "package": 6.0,
                    "pack_description": "6 units per pack",
                    "quantity": 18,
                    "unit": "piece",
                    "unit_price": 20.0,
                    "currency": "USD",
                    "exchange_rate": 1,
                    "discount_percent": 0,
                    "line_total": 360.0,
                    "is_taxable": True
                }
            ],
            "subtotal": 360.0,
            "discount_percent": 0,
            "discount_amount": 0,
            "tax_percent": 11,
            "tax_amount": 39.6,
            "total": 399.6,
            "total_usd": 399.6,
            "currency": "USD",
            "debit_account_id": customer_account_id,
            "credit_account_id": sales_account_id,
            "organization_id": organization_id
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/sales-invoices",
            json=invoice_data,
            headers=headers
        )
        assert create_response.status_code == 200
        invoice_id = create_response.json()["id"]
        
        # Update the invoice - change quantity but keep box/package
        update_data = {
            "lines": [
                {
                    "item_name": "TEST_Update_Box_Package",
                    "box": 4.0,  # Changed box
                    "package": 8.0,  # Changed package
                    "pack_description": "8 units per pack - updated",
                    "quantity": 32,  # Changed quantity
                    "unit": "piece",
                    "unit_price": 20.0,
                    "currency": "USD",
                    "exchange_rate": 1,
                    "discount_percent": 0,
                    "line_total": 640.0,
                    "is_taxable": True
                }
            ],
            "subtotal": 640.0,
            "tax_amount": 70.4,
            "total": 710.4,
            "total_usd": 710.4
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/sales-invoices/{invoice_id}",
            json=update_data,
            headers=headers
        )
        assert update_response.status_code == 200, f"Failed to update invoice: {update_response.text}"
        
        updated_invoice = update_response.json()
        updated_line = updated_invoice["lines"][0]
        
        assert updated_line.get("box") == 4.0, f"box not updated. Got: {updated_line.get('box')}"
        assert updated_line.get("package") == 8.0, f"package not updated. Got: {updated_line.get('package')}"
        assert updated_line.get("pack_description") == "8 units per pack - updated", f"pack_description not updated. Got: {updated_line.get('pack_description')}"
        
        print(f"✓ Box field preserved after update: {updated_line.get('box')}")
        print(f"✓ Package field preserved after update: {updated_line.get('package')}")
        print(f"✓ Pack description preserved after update: {updated_line.get('pack_description')}")
        
        # Clean up
        requests.delete(f"{BASE_URL}/api/sales-invoices/{invoice_id}", headers=headers)


class TestPrintTemplateStructure:
    """Tests to verify print template column structure (code review verification)"""
    
    def test_print_template_no_unit_column(self):
        """Verify print template does NOT contain Unit/وحدة column"""
        import os
        print_template_path = "/app/frontend/src/components/invoice/SalesInvoicePrint.jsx"
        
        with open(print_template_path, 'r') as f:
            content = f.read()
        
        # Check for 'وحدة' (Arabic for Unit)
        assert 'وحدة' not in content, "Print template should NOT contain 'وحدة' (Unit in Arabic)"
        
        # Check for 'Unit' as a column header (but allow in other contexts)
        # The column headers are in <th> tags
        import re
        th_pattern = r'<th[^>]*>[^<]*Unit[^<]*</th>'
        unit_columns = re.findall(th_pattern, content, re.IGNORECASE)
        assert len(unit_columns) == 0, f"Print template should NOT contain Unit column header. Found: {unit_columns}"
        
        print("✓ Print template does NOT contain Unit/وحدة column")
    
    def test_print_template_has_8_columns(self):
        """Verify print template header has exactly 8 columns"""
        print_template_path = "/app/frontend/src/components/invoice/SalesInvoicePrint.jsx"
        
        with open(print_template_path, 'r') as f:
            content = f.read()
        
        # Find the table header section
        import re
        # Look for <thead> section and count <th> tags
        thead_match = re.search(r'<thead>(.*?)</thead>', content, re.DOTALL)
        assert thead_match, "Could not find <thead> section in print template"
        
        thead_content = thead_match.group(1)
        th_count = len(re.findall(r'<th', thead_content))
        
        assert th_count == 8, f"Expected 8 columns in header, found {th_count}"
        
        # Verify expected column headers
        expected_headers = ['#', 'Item', 'Box', 'Pkg', 'Qty', 'Price', 'Disc', 'Total']
        for header in expected_headers:
            assert header in thead_content, f"Missing expected column header: {header}"
        
        print(f"✓ Print template has exactly 8 columns: {expected_headers}")
    
    def test_empty_rows_have_8_td_elements(self):
        """Verify empty rows in print template have exactly 8 <td> elements"""
        print_template_path = "/app/frontend/src/components/invoice/SalesInvoicePrint.jsx"
        
        with open(print_template_path, 'r') as f:
            content = f.read()
        
        # Find the emptyRowsHtml section
        import re
        empty_row_match = re.search(r'emptyRowsHtml = Array.*?\.fill\(`(.*?)`\)', content, re.DOTALL)
        assert empty_row_match, "Could not find emptyRowsHtml in print template"
        
        empty_row_content = empty_row_match.group(1)
        td_count = len(re.findall(r'<td', empty_row_content))
        
        assert td_count == 8, f"Expected 8 <td> elements in empty rows, found {td_count}"
        print(f"✓ Empty rows have exactly 8 <td> elements")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
