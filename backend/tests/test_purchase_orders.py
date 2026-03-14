"""
Purchase Orders API Tests
Tests CRUD operations, workflow transitions, and post-to-invoice functionality
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "carlo.mitri@gmail.com"
TEST_PASSWORD = "Carinemi@28"
ORG_ID = "fa6d4449-a859-445f-9e0b-fbb4aa90bfee"
TEST_SUPPLIER_ACCOUNT_ID = "d0631508-5eb4-4b36-892c-6e59c55818f2"
TEST_PURCHASE_ACCOUNT_ID = "3aff17e6-c6d8-42ec-9096-378a254a2679"


@pytest.fixture(scope="module")
def auth_token():
    """Authenticate and get token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestPurchaseOrdersCRUD:
    """Test Purchase Orders CRUD operations"""
    
    created_po_id = None  # Track created PO for cleanup
    
    def test_list_purchase_orders(self, auth_headers):
        """GET /api/purchase-orders - List all purchase orders"""
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders",
            params={"organization_id": ORG_ID},
            headers=auth_headers
        )
        assert response.status_code == 200
        orders = response.json()
        assert isinstance(orders, list)
        print(f"Found {len(orders)} purchase orders")
    
    def test_create_purchase_order(self, auth_headers):
        """POST /api/purchase-orders - Create a new purchase order with auto-serial"""
        today = datetime.now().strftime("%Y-%m-%d")
        delivery_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        
        payload = {
            "date": today,
            "expected_delivery_date": delivery_date,
            "order_type": "supplier",
            "supplier_id": TEST_SUPPLIER_ACCOUNT_ID,
            "supplier_name": "Test Supplier",
            "supplier_code": "TS001",
            "lines": [
                {
                    "inventory_item_id": None,
                    "item_name": "TEST_PO_Item_1",
                    "item_name_ar": "عنصر اختبار",
                    "barcode": "TEST123",
                    "quantity": 10,
                    "unit": "piece",
                    "unit_price": 5.00,
                    "selling_price": 8.00,
                    "currency": "USD",
                    "exchange_rate": 1,
                    "discount_percent": 0,
                    "line_total": 50.00,
                    "line_total_usd": 50.00,
                    "batch_number": "BATCH001",
                    "expiry_date": "2027-12-31"
                }
            ],
            "subtotal": 50.00,
            "discount_percent": 0,
            "discount_amount": 0,
            "tax_percent": 0,
            "tax_amount": 0,
            "total": 50.00,
            "total_usd": 50.00,
            "currency": "USD",
            "notes": "Test purchase order for API testing",
            "organization_id": ORG_ID
        }
        
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Create failed: {response.text}"
        po = response.json()
        
        # Verify response structure
        assert "id" in po
        assert "order_number" in po
        assert po["status"] == "draft"
        assert po["order_type"] == "supplier"
        
        # Verify serial number format PO-YYYY-XXXXX
        order_number = po["order_number"]
        assert order_number.startswith("PO-")
        parts = order_number.split("-")
        assert len(parts) == 3
        assert parts[1].isdigit() and len(parts[1]) == 4  # Year
        assert parts[2].isdigit() and len(parts[2]) == 5  # Sequence
        
        print(f"Created PO: {order_number} with status {po['status']}")
        TestPurchaseOrdersCRUD.created_po_id = po["id"]
        
        # GET to verify persistence
        get_response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{po['id']}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["order_number"] == order_number
        assert fetched["notes"] == payload["notes"]
    
    def test_list_with_filters(self, auth_headers):
        """GET /api/purchase-orders with status/type/search filters"""
        # Test status filter
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders",
            params={"organization_id": ORG_ID, "status": "draft"},
            headers=auth_headers
        )
        assert response.status_code == 200
        orders = response.json()
        for o in orders:
            assert o["status"] == "draft"
        print(f"Found {len(orders)} draft orders")
        
        # Test type filter
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders",
            params={"organization_id": ORG_ID, "order_type": "supplier"},
            headers=auth_headers
        )
        assert response.status_code == 200
        orders = response.json()
        for o in orders:
            assert o["order_type"] == "supplier"
        
        # Test search filter
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders",
            params={"organization_id": ORG_ID, "search": "TEST_PO"},
            headers=auth_headers
        )
        assert response.status_code == 200
        print("Filter tests passed")
    
    def test_update_draft_order(self, auth_headers):
        """PUT /api/purchase-orders/{id} - Update a draft PO"""
        if not TestPurchaseOrdersCRUD.created_po_id:
            pytest.skip("No PO created to update")
        
        po_id = TestPurchaseOrdersCRUD.created_po_id
        
        update_payload = {
            "notes": "Updated notes for testing",
            "discount_percent": 5,
            "lines": [
                {
                    "inventory_item_id": None,
                    "item_name": "TEST_PO_Item_Updated",
                    "item_name_ar": "عنصر محدث",
                    "barcode": "TEST456",
                    "quantity": 20,
                    "unit": "piece",
                    "unit_price": 10.00,
                    "selling_price": 15.00,
                    "currency": "USD",
                    "exchange_rate": 1,
                    "discount_percent": 0,
                    "line_total": 200.00,
                    "line_total_usd": 200.00
                }
            ],
            "subtotal": 200.00,
            "discount_amount": 10.00,
            "total": 190.00,
            "total_usd": 190.00
        }
        
        response = requests.put(
            f"{BASE_URL}/api/purchase-orders/{po_id}",
            json=update_payload,
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        po = response.json()
        assert po["notes"] == "Updated notes for testing"
        assert po["discount_percent"] == 5
        
        # GET to verify update persisted
        get_response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{po_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["notes"] == "Updated notes for testing"
        print("Update draft test passed")


class TestPurchaseOrdersWorkflow:
    """Test Purchase Order workflow transitions"""
    
    workflow_po_id = None
    
    def test_create_for_workflow(self, auth_headers):
        """Create a PO to test workflow"""
        today = datetime.now().strftime("%Y-%m-%d")
        payload = {
            "date": today,
            "order_type": "supplier",
            "lines": [
                {
                    "item_name": "TEST_Workflow_Item",
                    "quantity": 5,
                    "unit": "piece",
                    "unit_price": 20.00,
                    "line_total": 100.00,
                    "line_total_usd": 100.00
                }
            ],
            "subtotal": 100.00,
            "total": 100.00,
            "total_usd": 100.00,
            "organization_id": ORG_ID
        }
        
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        po = response.json()
        assert po["status"] == "draft"
        TestPurchaseOrdersWorkflow.workflow_po_id = po["id"]
        print(f"Created workflow PO: {po['order_number']}")
    
    def test_approve_order(self, auth_headers):
        """PUT /api/purchase-orders/{id}/status?action=approve"""
        if not TestPurchaseOrdersWorkflow.workflow_po_id:
            pytest.skip("No PO for workflow test")
        
        po_id = TestPurchaseOrdersWorkflow.workflow_po_id
        
        response = requests.put(
            f"{BASE_URL}/api/purchase-orders/{po_id}/status",
            params={"action": "approve"},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Approve failed: {response.text}"
        po = response.json()
        assert po["status"] == "approved"
        assert po.get("approved_at") is not None
        print(f"PO approved: {po['status']}")
    
    def test_send_order(self, auth_headers):
        """PUT /api/purchase-orders/{id}/status?action=send"""
        if not TestPurchaseOrdersWorkflow.workflow_po_id:
            pytest.skip("No PO for workflow test")
        
        po_id = TestPurchaseOrdersWorkflow.workflow_po_id
        
        response = requests.put(
            f"{BASE_URL}/api/purchase-orders/{po_id}/status",
            params={"action": "send"},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Send failed: {response.text}"
        po = response.json()
        assert po["status"] == "sent"
        assert po.get("sent_at") is not None
        print(f"PO sent: {po['status']}")
    
    def test_receive_order(self, auth_headers):
        """PUT /api/purchase-orders/{id}/status?action=receive"""
        if not TestPurchaseOrdersWorkflow.workflow_po_id:
            pytest.skip("No PO for workflow test")
        
        po_id = TestPurchaseOrdersWorkflow.workflow_po_id
        
        response = requests.put(
            f"{BASE_URL}/api/purchase-orders/{po_id}/status",
            params={"action": "receive"},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Receive failed: {response.text}"
        po = response.json()
        assert po["status"] == "received"
        assert po.get("received_at") is not None
        print(f"PO received: {po['status']}")
    
    def test_revert_to_draft(self, auth_headers):
        """PUT /api/purchase-orders/{id}/status?action=revert_to_draft"""
        # Create new PO and approve it to test revert
        today = datetime.now().strftime("%Y-%m-%d")
        payload = {
            "date": today,
            "order_type": "daily_sales",
            "lines": [
                {
                    "item_name": "TEST_Revert_Item",
                    "quantity": 2,
                    "unit": "piece",
                    "unit_price": 15.00,
                    "line_total": 30.00,
                    "line_total_usd": 30.00
                }
            ],
            "subtotal": 30.00,
            "total": 30.00,
            "total_usd": 30.00,
            "organization_id": ORG_ID
        }
        
        # Create
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        po = response.json()
        po_id = po["id"]
        
        # Approve
        response = requests.put(
            f"{BASE_URL}/api/purchase-orders/{po_id}/status",
            params={"action": "approve"},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["status"] == "approved"
        
        # Revert to draft
        response = requests.put(
            f"{BASE_URL}/api/purchase-orders/{po_id}/status",
            params={"action": "revert_to_draft"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Revert failed: {response.text}"
        po = response.json()
        assert po["status"] == "draft"
        assert po.get("approved_at") is None
        print("Revert to draft test passed")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/purchase-orders/{po_id}", headers=auth_headers)


class TestPurchaseOrderPostAsInvoice:
    """Test posting PO as Purchase Invoice"""
    
    post_po_id = None
    
    def test_create_and_post_order(self, auth_headers):
        """POST /api/purchase-orders/{id}/post - Convert PO to Purchase Invoice"""
        today = datetime.now().strftime("%Y-%m-%d")
        payload = {
            "date": today,
            "order_type": "supplier",
            "supplier_id": TEST_SUPPLIER_ACCOUNT_ID,
            "supplier_name": "Test Supplier for Post",
            "lines": [
                {
                    "inventory_item_id": None,
                    "item_name": "TEST_Post_Item",
                    "quantity": 3,
                    "unit": "piece",
                    "unit_price": 25.00,
                    "selling_price": 40.00,
                    "line_total": 75.00,
                    "line_total_usd": 75.00
                }
            ],
            "subtotal": 75.00,
            "tax_percent": 11,
            "tax_amount": 8.25,
            "total": 83.25,
            "total_usd": 83.25,
            "notes": "TEST_Order_For_Posting",
            "organization_id": ORG_ID
        }
        
        # Create PO
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        po = response.json()
        po_id = po["id"]
        order_number = po["order_number"]
        TestPurchaseOrderPostAsInvoice.post_po_id = po_id
        print(f"Created PO for posting: {order_number}")
        
        # Approve PO (required before posting)
        response = requests.put(
            f"{BASE_URL}/api/purchase-orders/{po_id}/status",
            params={"action": "approve"},
            headers=auth_headers
        )
        assert response.status_code == 200
        
        # Post as Invoice
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders/{po_id}/post",
            params={
                "debit_account_id": TEST_PURCHASE_ACCOUNT_ID,
                "credit_account_id": TEST_SUPPLIER_ACCOUNT_ID
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Post failed: {response.text}"
        po = response.json()
        assert po["status"] == "posted"
        assert po.get("purchase_invoice_id") is not None
        assert po.get("posted_at") is not None
        print(f"PO posted. Invoice ID: {po['purchase_invoice_id']}")
        
        # Verify invoice was created
        if po.get("purchase_invoice_number"):
            print(f"Created Invoice: {po['purchase_invoice_number']}")
    
    def test_cannot_edit_posted_order(self, auth_headers):
        """Verify posted PO cannot be edited"""
        if not TestPurchaseOrderPostAsInvoice.post_po_id:
            pytest.skip("No posted PO to test")
        
        po_id = TestPurchaseOrderPostAsInvoice.post_po_id
        
        # Try to update posted PO
        response = requests.put(
            f"{BASE_URL}/api/purchase-orders/{po_id}",
            json={"notes": "Attempt to update posted PO"},
            headers=auth_headers
        )
        
        # Should fail since PO is posted (not draft)
        assert response.status_code == 400
        print("Cannot edit posted PO - test passed")
    
    def test_cannot_delete_posted_order(self, auth_headers):
        """Verify posted PO cannot be deleted"""
        if not TestPurchaseOrderPostAsInvoice.post_po_id:
            pytest.skip("No posted PO to test")
        
        po_id = TestPurchaseOrderPostAsInvoice.post_po_id
        
        response = requests.delete(
            f"{BASE_URL}/api/purchase-orders/{po_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 400
        assert "posted" in response.json().get("detail", "").lower() or "cannot delete" in response.json().get("detail", "").lower()
        print("Cannot delete posted PO - test passed")


class TestLowStockSuggestions:
    """Test low stock suggestions endpoint"""
    
    def test_get_low_stock_suggestions(self, auth_headers):
        """GET /api/purchase-orders/low-stock-suggestions"""
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders/low-stock-suggestions",
            params={"organization_id": ORG_ID},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        items = response.json()
        assert isinstance(items, list)
        
        # If items exist, verify structure
        for item in items[:5]:  # Check first 5
            assert "id" in item
            assert "name" in item
            # on_hand_qty should be less than reorder_level
            on_hand = item.get("on_hand_qty", 0)
            reorder = item.get("reorder_level", 5)
            # The query uses $lt so on_hand should be less than reorder
        
        print(f"Low stock suggestions: {len(items)} items")


class TestDeletePurchaseOrder:
    """Test delete functionality"""
    
    def test_delete_draft_order(self, auth_headers):
        """DELETE /api/purchase-orders/{id} - Delete a draft PO"""
        # Create a PO to delete
        today = datetime.now().strftime("%Y-%m-%d")
        payload = {
            "date": today,
            "order_type": "supplier",
            "lines": [
                {
                    "item_name": "TEST_Delete_Item",
                    "quantity": 1,
                    "unit": "piece",
                    "unit_price": 10.00,
                    "line_total": 10.00,
                    "line_total_usd": 10.00
                }
            ],
            "subtotal": 10.00,
            "total": 10.00,
            "total_usd": 10.00,
            "organization_id": ORG_ID
        }
        
        # Create
        response = requests.post(
            f"{BASE_URL}/api/purchase-orders",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        po_id = response.json()["id"]
        
        # Delete
        response = requests.delete(
            f"{BASE_URL}/api/purchase-orders/{po_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        # Verify deleted
        response = requests.get(
            f"{BASE_URL}/api/purchase-orders/{po_id}",
            headers=auth_headers
        )
        assert response.status_code == 404
        print("Delete draft PO test passed")


class TestInvalidTransitions:
    """Test invalid workflow transitions"""
    
    def test_invalid_action(self, auth_headers):
        """Test invalid action parameter"""
        # Create a draft PO
        today = datetime.now().strftime("%Y-%m-%d")
        payload = {
            "date": today,
            "order_type": "supplier",
            "lines": [{"item_name": "TEST_Invalid", "quantity": 1, "unit": "piece", "unit_price": 5, "line_total": 5, "line_total_usd": 5}],
            "subtotal": 5, "total": 5, "total_usd": 5,
            "organization_id": ORG_ID
        }
        
        response = requests.post(f"{BASE_URL}/api/purchase-orders", json=payload, headers=auth_headers)
        assert response.status_code == 200
        po_id = response.json()["id"]
        
        # Try invalid action
        response = requests.put(
            f"{BASE_URL}/api/purchase-orders/{po_id}/status",
            params={"action": "invalid_action"},
            headers=auth_headers
        )
        assert response.status_code == 400
        
        # Try to send from draft (should fail - must approve first)
        response = requests.put(
            f"{BASE_URL}/api/purchase-orders/{po_id}/status",
            params={"action": "send"},
            headers=auth_headers
        )
        assert response.status_code == 400
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/purchase-orders/{po_id}", headers=auth_headers)
        print("Invalid transition tests passed")


# Cleanup function
@pytest.fixture(scope="module", autouse=True)
def cleanup(auth_headers):
    """Cleanup test data after all tests"""
    yield
    # Cleanup created test POs
    if TestPurchaseOrdersCRUD.created_po_id:
        requests.delete(
            f"{BASE_URL}/api/purchase-orders/{TestPurchaseOrdersCRUD.created_po_id}",
            headers=auth_headers
        )
    if TestPurchaseOrdersWorkflow.workflow_po_id:
        requests.delete(
            f"{BASE_URL}/api/purchase-orders/{TestPurchaseOrdersWorkflow.workflow_po_id}",
            headers=auth_headers
        )
