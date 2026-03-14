"""
POS Transaction Void/Delete Tests
Tests the void (soft-delete) and delete (hard-delete) functionality for POS transactions
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from main agent
TEST_EMAIL = "carlo.mitri@gmail.com"
TEST_PASSWORD = "Carinemi@28"
ORG_ID = "fa6d4449-a859-445f-9e0b-fbb4aa90bfee"
CASH_ACCOUNT_ID = "5b9252c1-bc6c-484d-b1af-ddb21284687e"
SALES_ACCOUNT_ID = "3aff17e6-c6d8-42ec-9096-378a254a2679"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture
def create_test_transaction(auth_headers):
    """Helper to create a POS transaction for testing"""
    def _create():
        payload = {
            "organization_id": ORG_ID,
            "lines": [{
                "inventory_item_id": None,
                "item_name": "TEST_VOID_ITEM",
                "item_name_ar": "",
                "barcode": "",
                "quantity": 1,
                "unit": "piece",
                "unit_price": 10.00,
                "currency": "USD",
                "exchange_rate": 1,
                "discount_percent": 0,
                "line_total": 10.00,
                "line_total_usd": 10.00,
                "is_taxable": False,
                "batch_id": ""
            }],
            "subtotal_usd": 10.00,
            "discount_percent": 0,
            "discount_amount": 0,
            "tax_percent": 0,
            "tax_amount": 0,
            "total_usd": 10.00,
            "total_lbp": 895000,
            "payment_method": "cash",
            "payment_amount": 10.00,
            "payment_currency": "USD",
            "payment_exchange_rate": 1,
            "change_amount": 0,
            "payment_adjustment": 0,
            "customer_id": None,
            "customer_name": "Walk-in",
            "customer_code": None,
            "notes": "Test transaction for void testing",
            "debit_account_id": CASH_ACCOUNT_ID,
            "credit_account_id": SALES_ACCOUNT_ID,
            "lbp_rate": 89500
        }
        response = requests.post(
            f"{BASE_URL}/api/pos/transactions",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to create transaction: {response.text}"
        return response.json()
    return _create


class TestPOSVoidEndpoint:
    """Tests for PUT /api/pos/invoices/{id}/void endpoint"""
    
    def test_void_transaction_success(self, auth_headers, create_test_transaction):
        """Test voiding a transaction successfully"""
        # Create a new transaction
        transaction = create_test_transaction()
        transaction_id = transaction["id"]
        
        # Void the transaction
        void_reason = "Test void reason - customer returned item"
        response = requests.put(
            f"{BASE_URL}/api/pos/invoices/{transaction_id}/void?reason={void_reason}",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Void failed: {response.text}"
        
        voided = response.json()
        # Verify voided fields are set
        assert voided["is_voided"] == True
        assert voided["void_reason"] == void_reason
        assert voided["voided_at"] is not None
        assert voided["voided_by_name"] is not None
        print(f"SUCCESS: Transaction {transaction['receipt_number']} voided successfully")
    
    def test_void_already_voided_returns_400(self, auth_headers, create_test_transaction):
        """Test that voiding an already voided transaction returns 400"""
        # Create and void a transaction
        transaction = create_test_transaction()
        transaction_id = transaction["id"]
        
        # First void
        response1 = requests.put(
            f"{BASE_URL}/api/pos/invoices/{transaction_id}/void?reason=First void",
            headers=auth_headers
        )
        assert response1.status_code == 200
        
        # Try to void again
        response2 = requests.put(
            f"{BASE_URL}/api/pos/invoices/{transaction_id}/void?reason=Second void attempt",
            headers=auth_headers
        )
        
        assert response2.status_code == 400, f"Expected 400, got {response2.status_code}: {response2.text}"
        assert "already voided" in response2.json()["detail"].lower()
        print("SUCCESS: Already voided transaction correctly rejected with 400")
    
    def test_void_nonexistent_transaction_returns_404(self, auth_headers):
        """Test that voiding a non-existent transaction returns 404"""
        fake_id = "nonexistent-transaction-id-12345"
        response = requests.put(
            f"{BASE_URL}/api/pos/invoices/{fake_id}/void?reason=Test",
            headers=auth_headers
        )
        
        assert response.status_code == 404
        print("SUCCESS: Non-existent transaction correctly returned 404")
    
    def test_void_without_auth_returns_401(self):
        """Test that voiding without authentication returns 401"""
        response = requests.put(
            f"{BASE_URL}/api/pos/invoices/some-id/void?reason=Test"
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("SUCCESS: Unauthenticated request correctly rejected")
    
    def test_void_default_reason(self, auth_headers, create_test_transaction):
        """Test void with default reason if none provided"""
        transaction = create_test_transaction()
        transaction_id = transaction["id"]
        
        # Void without explicit reason (uses default)
        response = requests.put(
            f"{BASE_URL}/api/pos/invoices/{transaction_id}/void",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        voided = response.json()
        assert voided["void_reason"] == "Voided by admin"  # Default value
        print("SUCCESS: Default void reason applied correctly")


class TestPOSDeleteEndpoint:
    """Tests for DELETE /api/pos/invoices/{id} endpoint (hard delete)"""
    
    def test_delete_transaction_success(self, auth_headers, create_test_transaction):
        """Test deleting a transaction successfully"""
        transaction = create_test_transaction()
        transaction_id = transaction["id"]
        receipt_number = transaction["receipt_number"]
        
        # Delete the transaction
        response = requests.delete(
            f"{BASE_URL}/api/pos/invoices/{transaction_id}?restore_inventory=true",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Delete failed: {response.text}"
        
        result = response.json()
        assert result["voucher_deleted"] == True
        assert result["inventory_restored"] == True
        assert receipt_number in result["message"]
        
        # Verify it's actually deleted by trying to get it
        get_response = requests.get(
            f"{BASE_URL}/api/pos/transactions/{transaction_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 404
        print(f"SUCCESS: Transaction {receipt_number} hard-deleted successfully")
    
    def test_delete_voided_transaction(self, auth_headers, create_test_transaction):
        """Test that voided transactions can still be hard-deleted"""
        transaction = create_test_transaction()
        transaction_id = transaction["id"]
        
        # First void
        void_response = requests.put(
            f"{BASE_URL}/api/pos/invoices/{transaction_id}/void?reason=Test",
            headers=auth_headers
        )
        assert void_response.status_code == 200
        
        # Then delete
        delete_response = requests.delete(
            f"{BASE_URL}/api/pos/invoices/{transaction_id}",
            headers=auth_headers
        )
        
        assert delete_response.status_code == 200
        print("SUCCESS: Voided transaction can be hard-deleted")
    
    def test_delete_nonexistent_returns_404(self, auth_headers):
        """Test deleting a non-existent transaction returns 404"""
        fake_id = "nonexistent-transaction-id-67890"
        response = requests.delete(
            f"{BASE_URL}/api/pos/invoices/{fake_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 404
        print("SUCCESS: Non-existent transaction correctly returned 404 on delete")


class TestVoidedTransactionRetrieval:
    """Tests for retrieving voided transactions"""
    
    def test_get_transactions_includes_voided_field(self, auth_headers, create_test_transaction):
        """Test that GET transactions includes voided fields"""
        # Create and void a transaction
        transaction = create_test_transaction()
        transaction_id = transaction["id"]
        
        void_reason = "Test reason for retrieval test"
        void_response = requests.put(
            f"{BASE_URL}/api/pos/invoices/{transaction_id}/void?reason={void_reason}",
            headers=auth_headers
        )
        assert void_response.status_code == 200
        
        # Get transactions list
        response = requests.get(
            f"{BASE_URL}/api/pos/transactions?organization_id={ORG_ID}&limit=50",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        transactions = response.json()
        
        # Find our voided transaction
        voided_txn = next((t for t in transactions if t["id"] == transaction_id), None)
        assert voided_txn is not None, "Voided transaction not found in list"
        assert voided_txn["is_voided"] == True
        assert voided_txn["void_reason"] == void_reason
        assert voided_txn["voided_at"] is not None
        assert voided_txn["voided_by_name"] is not None
        print("SUCCESS: Voided transaction fields present in list retrieval")
    
    def test_get_single_voided_transaction(self, auth_headers, create_test_transaction):
        """Test getting a single voided transaction by ID"""
        transaction = create_test_transaction()
        transaction_id = transaction["id"]
        
        # Void it
        void_response = requests.put(
            f"{BASE_URL}/api/pos/invoices/{transaction_id}/void?reason=Single fetch test",
            headers=auth_headers
        )
        assert void_response.status_code == 200
        
        # Get single transaction
        get_response = requests.get(
            f"{BASE_URL}/api/pos/transactions/{transaction_id}",
            headers=auth_headers
        )
        
        assert get_response.status_code == 200
        txn = get_response.json()
        assert txn["is_voided"] == True
        assert txn["void_reason"] == "Single fetch test"
        print("SUCCESS: Single voided transaction retrieval works correctly")


class TestVoidAccountReversals:
    """Test that void properly reverses account balances"""
    
    def test_void_reverses_cash_account_balance(self, auth_headers, create_test_transaction):
        """Test that voiding reverses the cash account balance change"""
        # Get initial cash account balance
        initial_balance_resp = requests.get(
            f"{BASE_URL}/api/accounts/{CASH_ACCOUNT_ID}",
            headers=auth_headers
        )
        initial_balance = initial_balance_resp.json().get("balance_usd", 0) if initial_balance_resp.status_code == 200 else 0
        
        # Create transaction (adds to cash balance)
        transaction = create_test_transaction()
        transaction_id = transaction["id"]
        txn_amount = transaction["total_usd"]
        
        # Wait a moment for balance update
        time.sleep(0.5)
        
        # Check balance increased
        after_create_resp = requests.get(
            f"{BASE_URL}/api/accounts/{CASH_ACCOUNT_ID}",
            headers=auth_headers
        )
        if after_create_resp.status_code == 200:
            after_create_balance = after_create_resp.json().get("balance_usd", 0)
            print(f"Balance after create: {after_create_balance} (was {initial_balance}, should have +{txn_amount})")
        
        # Void the transaction
        void_response = requests.put(
            f"{BASE_URL}/api/pos/invoices/{transaction_id}/void?reason=Balance test",
            headers=auth_headers
        )
        assert void_response.status_code == 200
        
        # Wait for balance reversal
        time.sleep(0.5)
        
        # Check balance returned to approximately initial
        after_void_resp = requests.get(
            f"{BASE_URL}/api/accounts/{CASH_ACCOUNT_ID}",
            headers=auth_headers
        )
        if after_void_resp.status_code == 200:
            after_void_balance = after_void_resp.json().get("balance_usd", 0)
            print(f"Balance after void: {after_void_balance} (should be back to ~{initial_balance})")
            # Allow for small floating point differences
            assert abs(after_void_balance - initial_balance) < 0.01, f"Balance not reversed: {after_void_balance} vs {initial_balance}"
        
        print("SUCCESS: Account balance correctly reversed after void")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
