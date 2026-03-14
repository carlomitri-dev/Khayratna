"""
Test suite for POS Transaction VAT and Discount handling
Tests the bug fix for 'Error processing payment' and proper voucher accounting entries

Bug Context:
- Original bug: UnboundLocalError on uuid due to shadowed import inside if-block
- Fix also adds proper VAT and discount accounting entries in auto-generated vouchers

Test scenarios:
1. POS transaction with payment_method 'customer' (On Account)
2. POS transaction with payment_method 'cash'
3. POS transaction with VAT (tax_percent > 0) creates VAT Payable credit line
4. POS transaction with discount (discount_amount > 0) creates Sales Discount debit line
5. POS transaction without VAT/discount creates simple 2-line voucher
6. POS transaction with payment_adjustment creates discount voucher line
7. Voucher totals balanced (debits = credits)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "carlo.mitri@gmail.com"
TEST_PASSWORD = "Carinemi@28"
ORG_ID = "fa6d4449-a859-445f-9e0b-fbb4aa90bfee"
CASH_ACCOUNT_ID = "5b9252c1-bc6c-484d-b1af-ddb21284687e"  # code 51113001
SALES_ACCOUNT_ID = "3aff17e6-c6d8-42ec-9096-378a254a2679"  # code 70110001
CUSTOMER_ACCOUNT_ID = "d0631508-5eb4-4b36-892c-6e59c55818f2"  # code 41110002


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for API calls"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Configured requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestPOSTransactionBasic:
    """Basic POS transaction creation tests"""
    
    def test_pos_transaction_cash_payment(self, api_client):
        """Test POS transaction with cash payment method - basic flow"""
        payload = {
            "organization_id": ORG_ID,
            "lines": [{
                "inventory_item_id": None,
                "item_name": "TEST_Cash_Item",
                "quantity": 1,
                "unit_price": 100.0,
                "currency": "USD",
                "exchange_rate": 1.0,
                "discount_percent": 0,
                "line_total": 100.0,
                "line_total_usd": 100.0
            }],
            "subtotal_usd": 100.0,
            "discount_percent": 0,
            "discount_amount": 0,
            "tax_percent": 0,
            "tax_amount": 0,
            "total_usd": 100.0,
            "total_lbp": 8950000,
            "payment_method": "cash",
            "payment_amount": 100.0,
            "payment_currency": "USD",
            "payment_exchange_rate": 1.0,
            "change_amount": 0,
            "payment_adjustment": 0,
            "customer_id": None,
            "customer_name": "Walk-in",
            "debit_account_id": CASH_ACCOUNT_ID,
            "credit_account_id": SALES_ACCOUNT_ID,
            "lbp_rate": 89500
        }
        
        response = api_client.post(f"{BASE_URL}/api/pos/transactions", json=payload)
        
        # Assert status code
        assert response.status_code == 200, f"POS transaction failed: {response.text}"
        
        # Assert response structure
        data = response.json()
        assert "id" in data, "Response should contain transaction id"
        assert "receipt_number" in data, "Response should contain receipt_number"
        assert "voucher_id" in data, "Response should contain voucher_id"
        assert data["payment_method"] == "cash"
        assert data["total_usd"] == 100.0
        
        print(f"SUCCESS: Cash payment transaction created - Receipt: {data['receipt_number']}")
        return data

    def test_pos_transaction_customer_payment(self, api_client):
        """Test POS transaction with customer (On Account) payment method"""
        payload = {
            "organization_id": ORG_ID,
            "lines": [{
                "inventory_item_id": None,
                "item_name": "TEST_Credit_Item",
                "quantity": 2,
                "unit_price": 50.0,
                "currency": "USD",
                "exchange_rate": 1.0,
                "discount_percent": 0,
                "line_total": 100.0,
                "line_total_usd": 100.0
            }],
            "subtotal_usd": 100.0,
            "discount_percent": 0,
            "discount_amount": 0,
            "tax_percent": 0,
            "tax_amount": 0,
            "total_usd": 100.0,
            "total_lbp": 8950000,
            "payment_method": "customer",
            "payment_amount": 100.0,
            "payment_currency": "USD",
            "payment_exchange_rate": 1.0,
            "change_amount": 0,
            "payment_adjustment": 0,
            "customer_id": CUSTOMER_ACCOUNT_ID,
            "customer_name": "Test Customer",
            "customer_code": "41110002",
            "debit_account_id": CUSTOMER_ACCOUNT_ID,
            "credit_account_id": SALES_ACCOUNT_ID,
            "lbp_rate": 89500
        }
        
        response = api_client.post(f"{BASE_URL}/api/pos/transactions", json=payload)
        
        # Assert status code - this is the main bug test
        assert response.status_code == 200, f"Customer payment failed (uuid bug?): {response.text}"
        
        # Assert response structure
        data = response.json()
        assert data["payment_method"] == "customer"
        assert data["customer_id"] == CUSTOMER_ACCOUNT_ID
        
        print(f"SUCCESS: Customer (On Account) payment transaction created - Receipt: {data['receipt_number']}")
        return data


class TestPOSVATHandling:
    """Tests for VAT (tax) handling in POS transactions"""
    
    def test_pos_transaction_with_vat(self, api_client):
        """Test POS transaction with VAT creates VAT Payable credit line in voucher"""
        subtotal = 100.0
        tax_percent = 11.0
        tax_amount = subtotal * (tax_percent / 100)  # 11.0
        total = subtotal + tax_amount  # 111.0
        
        payload = {
            "organization_id": ORG_ID,
            "lines": [{
                "inventory_item_id": None,
                "item_name": "TEST_VAT_Item",
                "quantity": 1,
                "unit_price": 100.0,
                "currency": "USD",
                "exchange_rate": 1.0,
                "discount_percent": 0,
                "line_total": 100.0,
                "line_total_usd": 100.0,
                "is_taxable": True
            }],
            "subtotal_usd": subtotal,
            "discount_percent": 0,
            "discount_amount": 0,
            "tax_percent": tax_percent,
            "tax_amount": tax_amount,
            "total_usd": total,
            "total_lbp": total * 89500,
            "payment_method": "cash",
            "payment_amount": total,
            "payment_currency": "USD",
            "payment_exchange_rate": 1.0,
            "change_amount": 0,
            "payment_adjustment": 0,
            "customer_id": None,
            "customer_name": "Walk-in",
            "debit_account_id": CASH_ACCOUNT_ID,
            "credit_account_id": SALES_ACCOUNT_ID,
            "lbp_rate": 89500
        }
        
        response = api_client.post(f"{BASE_URL}/api/pos/transactions", json=payload)
        assert response.status_code == 200, f"VAT transaction failed: {response.text}"
        
        data = response.json()
        assert data["tax_amount"] == tax_amount
        assert data["tax_percent"] == tax_percent
        
        # Verify the voucher was created with VAT line
        voucher_id = data["voucher_id"]
        voucher_response = api_client.get(f"{BASE_URL}/api/vouchers/{voucher_id}")
        assert voucher_response.status_code == 200, f"Failed to get voucher: {voucher_response.text}"
        
        voucher = voucher_response.json()
        
        # Check voucher has VAT Payable line (credit to account starting with 442)
        vat_lines = [line for line in voucher["lines"] 
                     if line.get("account_code", "").startswith("442")]
        
        assert len(vat_lines) > 0, "Voucher should have VAT Payable credit line"
        
        vat_line = vat_lines[0]
        assert vat_line["credit"] > 0, "VAT line should be a credit"
        assert abs(vat_line["credit_usd"] - tax_amount) < 0.01, f"VAT credit should be {tax_amount}"
        
        print(f"SUCCESS: VAT transaction created - VAT Payable credit: ${vat_line['credit_usd']}")
        return data


class TestPOSDiscountHandling:
    """Tests for discount handling in POS transactions"""
    
    def test_pos_transaction_with_invoice_discount(self, api_client):
        """Test POS transaction with invoice-level discount creates Sales Discount debit line"""
        subtotal = 100.0
        discount_percent = 10.0
        discount_amount = subtotal * (discount_percent / 100)  # 10.0
        total = subtotal - discount_amount  # 90.0
        
        payload = {
            "organization_id": ORG_ID,
            "lines": [{
                "inventory_item_id": None,
                "item_name": "TEST_Discount_Item",
                "quantity": 1,
                "unit_price": 100.0,
                "currency": "USD",
                "exchange_rate": 1.0,
                "discount_percent": 0,
                "line_total": 100.0,
                "line_total_usd": 100.0
            }],
            "subtotal_usd": subtotal,
            "discount_percent": discount_percent,
            "discount_amount": discount_amount,
            "tax_percent": 0,
            "tax_amount": 0,
            "total_usd": total,
            "total_lbp": total * 89500,
            "payment_method": "cash",
            "payment_amount": total,
            "payment_currency": "USD",
            "payment_exchange_rate": 1.0,
            "change_amount": 0,
            "payment_adjustment": 0,
            "customer_id": None,
            "customer_name": "Walk-in",
            "debit_account_id": CASH_ACCOUNT_ID,
            "credit_account_id": SALES_ACCOUNT_ID,
            "lbp_rate": 89500
        }
        
        response = api_client.post(f"{BASE_URL}/api/pos/transactions", json=payload)
        assert response.status_code == 200, f"Discount transaction failed: {response.text}"
        
        data = response.json()
        assert data["discount_amount"] == discount_amount
        assert data["discount_percent"] == discount_percent
        
        # Verify the voucher was created with discount line
        voucher_id = data["voucher_id"]
        voucher_response = api_client.get(f"{BASE_URL}/api/vouchers/{voucher_id}")
        assert voucher_response.status_code == 200
        
        voucher = voucher_response.json()
        
        # Check voucher has Sales Discount line (debit to account starting with 721)
        discount_lines = [line for line in voucher["lines"] 
                          if line.get("account_code", "").startswith("721")]
        
        assert len(discount_lines) > 0, "Voucher should have Sales Discount debit line"
        
        discount_line = discount_lines[0]
        assert discount_line["debit"] > 0, "Discount line should be a debit"
        assert abs(discount_line["debit_usd"] - discount_amount) < 0.01, f"Discount debit should be {discount_amount}"
        
        print(f"SUCCESS: Invoice discount transaction created - Sales Discount debit: ${discount_line['debit_usd']}")
        return data

    def test_pos_transaction_with_payment_adjustment(self, api_client):
        """Test POS transaction with payment_adjustment (cash register discount) creates discount line"""
        subtotal = 100.0
        total = 100.0
        payment_adjustment = 5.0  # Customer pays $95, gets $5 discount at register
        
        payload = {
            "organization_id": ORG_ID,
            "lines": [{
                "inventory_item_id": None,
                "item_name": "TEST_PayAdj_Item",
                "quantity": 1,
                "unit_price": 100.0,
                "currency": "USD",
                "exchange_rate": 1.0,
                "discount_percent": 0,
                "line_total": 100.0,
                "line_total_usd": 100.0
            }],
            "subtotal_usd": subtotal,
            "discount_percent": 0,
            "discount_amount": 0,
            "tax_percent": 0,
            "tax_amount": 0,
            "total_usd": total,
            "total_lbp": total * 89500,
            "payment_method": "cash",
            "payment_amount": total - payment_adjustment,  # 95
            "payment_currency": "USD",
            "payment_exchange_rate": 1.0,
            "change_amount": 0,
            "payment_adjustment": payment_adjustment,  # 5
            "customer_id": None,
            "customer_name": "Walk-in",
            "debit_account_id": CASH_ACCOUNT_ID,
            "credit_account_id": SALES_ACCOUNT_ID,
            "lbp_rate": 89500
        }
        
        response = api_client.post(f"{BASE_URL}/api/pos/transactions", json=payload)
        assert response.status_code == 200, f"Payment adjustment transaction failed: {response.text}"
        
        data = response.json()
        assert data["payment_adjustment"] == payment_adjustment
        
        # Verify the voucher
        voucher_id = data["voucher_id"]
        voucher_response = api_client.get(f"{BASE_URL}/api/vouchers/{voucher_id}")
        assert voucher_response.status_code == 200
        
        voucher = voucher_response.json()
        
        # Check voucher has payment adjustment discount line
        discount_lines = [line for line in voucher["lines"] 
                          if line.get("account_code", "").startswith("721") and line.get("debit", 0) > 0]
        
        assert len(discount_lines) > 0, "Voucher should have payment adjustment discount line"
        
        print(f"SUCCESS: Payment adjustment transaction created - Adjustment: ${payment_adjustment}")
        return data


class TestPOSVoucherBalance:
    """Tests for voucher balance (debits = credits)"""
    
    def test_voucher_balanced_simple(self, api_client):
        """Test simple POS transaction creates balanced 2-line voucher"""
        payload = {
            "organization_id": ORG_ID,
            "lines": [{
                "inventory_item_id": None,
                "item_name": "TEST_Balance_Simple",
                "quantity": 1,
                "unit_price": 50.0,
                "currency": "USD",
                "exchange_rate": 1.0,
                "discount_percent": 0,
                "line_total": 50.0,
                "line_total_usd": 50.0
            }],
            "subtotal_usd": 50.0,
            "discount_percent": 0,
            "discount_amount": 0,
            "tax_percent": 0,
            "tax_amount": 0,
            "total_usd": 50.0,
            "total_lbp": 50.0 * 89500,
            "payment_method": "cash",
            "payment_amount": 50.0,
            "payment_currency": "USD",
            "payment_exchange_rate": 1.0,
            "change_amount": 0,
            "payment_adjustment": 0,
            "customer_id": None,
            "customer_name": "Walk-in",
            "debit_account_id": CASH_ACCOUNT_ID,
            "credit_account_id": SALES_ACCOUNT_ID,
            "lbp_rate": 89500
        }
        
        response = api_client.post(f"{BASE_URL}/api/pos/transactions", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        voucher_id = data["voucher_id"]
        
        voucher_response = api_client.get(f"{BASE_URL}/api/vouchers/{voucher_id}")
        assert voucher_response.status_code == 200
        
        voucher = voucher_response.json()
        
        # Check voucher is balanced
        total_debit = voucher["total_debit_usd"]
        total_credit = voucher["total_credit_usd"]
        
        assert abs(total_debit - total_credit) < 0.01, f"Voucher not balanced: debit={total_debit}, credit={total_credit}"
        
        # Simple voucher should have 2 lines: debit cash, credit sales
        assert len(voucher["lines"]) == 2, f"Simple voucher should have 2 lines, got {len(voucher['lines'])}"
        
        print(f"SUCCESS: Simple voucher balanced - Debit: ${total_debit}, Credit: ${total_credit}")
        return data

    def test_voucher_balanced_with_vat_and_discount(self, api_client):
        """Test POS transaction with VAT AND discount creates balanced voucher"""
        subtotal = 100.0
        discount_percent = 10.0
        discount_amount = subtotal * (discount_percent / 100)  # 10.0
        after_discount = subtotal - discount_amount  # 90.0
        tax_percent = 11.0
        tax_amount = after_discount * (tax_percent / 100)  # 9.9
        total = after_discount + tax_amount  # 99.9
        
        payload = {
            "organization_id": ORG_ID,
            "lines": [{
                "inventory_item_id": None,
                "item_name": "TEST_Complex_Balance",
                "quantity": 2,
                "unit_price": 50.0,
                "currency": "USD",
                "exchange_rate": 1.0,
                "discount_percent": 0,
                "line_total": 100.0,
                "line_total_usd": 100.0,
                "is_taxable": True
            }],
            "subtotal_usd": subtotal,
            "discount_percent": discount_percent,
            "discount_amount": discount_amount,
            "tax_percent": tax_percent,
            "tax_amount": tax_amount,
            "total_usd": total,
            "total_lbp": total * 89500,
            "payment_method": "cash",
            "payment_amount": total,
            "payment_currency": "USD",
            "payment_exchange_rate": 1.0,
            "change_amount": 0,
            "payment_adjustment": 0,
            "customer_id": None,
            "customer_name": "Walk-in",
            "debit_account_id": CASH_ACCOUNT_ID,
            "credit_account_id": SALES_ACCOUNT_ID,
            "lbp_rate": 89500
        }
        
        response = api_client.post(f"{BASE_URL}/api/pos/transactions", json=payload)
        assert response.status_code == 200, f"Complex transaction failed: {response.text}"
        
        data = response.json()
        voucher_id = data["voucher_id"]
        
        voucher_response = api_client.get(f"{BASE_URL}/api/vouchers/{voucher_id}")
        assert voucher_response.status_code == 200
        
        voucher = voucher_response.json()
        
        # Check voucher is balanced
        total_debit = voucher["total_debit_usd"]
        total_credit = voucher["total_credit_usd"]
        
        assert abs(total_debit - total_credit) < 0.01, f"Voucher not balanced: debit={total_debit}, credit={total_credit}"
        
        # Complex voucher should have multiple lines: cash, sales, VAT, discount
        assert len(voucher["lines"]) >= 3, f"Complex voucher should have 3+ lines, got {len(voucher['lines'])}"
        
        print(f"SUCCESS: Complex voucher balanced - Debit: ${total_debit}, Credit: ${total_credit}")
        print(f"  - Lines: {len(voucher['lines'])}")
        for line in voucher["lines"]:
            print(f"    - {line['account_code']} {line['account_name']}: D=${line.get('debit_usd', 0)} C=${line.get('credit_usd', 0)}")
        
        return data


class TestPOSEndpointAvailability:
    """Tests for POS endpoint availability"""
    
    def test_pos_inventory_endpoint(self, api_client):
        """Test POS inventory endpoint returns items"""
        response = api_client.get(f"{BASE_URL}/api/pos/inventory?organization_id={ORG_ID}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: POS inventory endpoint - {len(data)} items")
    
    def test_pos_cash_accounts_endpoint(self, api_client):
        """Test POS cash accounts endpoint returns accounts"""
        response = api_client.get(f"{BASE_URL}/api/pos/cash-accounts?organization_id={ORG_ID}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Should have cash accounts"
        print(f"SUCCESS: POS cash accounts endpoint - {len(data)} accounts")
    
    def test_pos_daily_summary_endpoint(self, api_client):
        """Test POS daily summary endpoint"""
        response = api_client.get(f"{BASE_URL}/api/pos/daily-summary?organization_id={ORG_ID}")
        assert response.status_code == 200
        data = response.json()
        assert "date" in data
        assert "total_transactions" in data
        assert "total_sales" in data
        print(f"SUCCESS: POS daily summary - {data['total_transactions']} transactions, ${data['total_sales']} total")
    
    def test_pos_transactions_list_endpoint(self, api_client):
        """Test POS transactions list endpoint"""
        response = api_client.get(f"{BASE_URL}/api/pos/transactions?organization_id={ORG_ID}&limit=10")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: POS transactions list - {len(data)} recent transactions")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
