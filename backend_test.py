import requests
import sys
import json
import uuid
from datetime import datetime

class KAIROSAPITester:
    def __init__(self, base_url="https://vat-ledger.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.org_id = None
        self.customer_id = None
        self.supplier_id = None
        self.sales_return_account_id = None
        self.purchase_return_account_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, params=params)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            print(f"   Request URL: {response.url}")
            print(f"   Response Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {json.dumps(error_data, indent=2)}")
                except:
                    print(f"   Response text: {response.text[:500]}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_login(self):
        """Test login with provided credentials"""
        success, response = self.run_test(
            "User Login",
            "POST",
            "auth/login",
            200,
            data={
                "email": "carlo.mitri@gmail.com", 
                "password": "Carinemi@28"
            }
        )
        if success and 'token' in response:
            self.token = response['token']
            user_data = response.get('user', {})
            self.org_id = user_data.get('organization_id')
            print(f"   Logged in as: {user_data.get('name')} ({user_data.get('role')})")
            print(f"   Organization ID: {self.org_id}")
            return True
        return False

    def setup_test_accounts(self):
        """Setup customer, supplier and return accounts for testing"""
        if not self.org_id:
            print("❌ No organization ID available")
            return False
            
        # Get customer accounts
        success, customers = self.run_test(
            "Get Customer Accounts",
            "GET", 
            "customer-accounts",
            200,
            params={'organization_id': self.org_id}
        )
        if success and customers and len(customers) > 0:
            self.customer_id = customers[0]['id']
            print(f"   Using customer: {customers[0]['name']} ({customers[0]['code']})")
        
        # Get supplier accounts  
        success, suppliers = self.run_test(
            "Get Supplier Accounts",
            "GET",
            "supplier-accounts", 
            200,
            params={'organization_id': self.org_id}
        )
        if success and suppliers and len(suppliers) > 0:
            self.supplier_id = suppliers[0]['id']
            print(f"   Using supplier: {suppliers[0]['name']} ({suppliers[0]['code']})")
            
        # Get sales accounts for sales returns
        success, sales_accounts = self.run_test(
            "Get Sales Accounts",
            "GET",
            "sales-accounts",
            200, 
            params={'organization_id': self.org_id}
        )
        if success and sales_accounts and len(sales_accounts) > 0:
            self.sales_return_account_id = sales_accounts[0]['id'] 
            print(f"   Using sales return account: {sales_accounts[0]['name']} ({sales_accounts[0]['code']})")
            
        # Get purchase accounts for purchase returns
        success, purchase_accounts = self.run_test(
            "Get Purchase Accounts", 
            "GET",
            "purchase-accounts",
            200,
            params={'organization_id': self.org_id}
        )
        if success and purchase_accounts and len(purchase_accounts) > 0:
            self.purchase_return_account_id = purchase_accounts[0]['id']
            print(f"   Using purchase return account: {purchase_accounts[0]['name']} ({purchase_accounts[0]['code']})")
        
        return True

    def test_sales_returns_endpoints(self):
        """Test all Sales Returns endpoints"""
        print("\n📦 TESTING SALES RETURNS MODULE")
        
        # Test GET /sales-returns (list)
        success, _ = self.run_test(
            "List Sales Returns",
            "GET", 
            "sales-returns",
            200,
            params={'organization_id': self.org_id}
        )
        
        # Test GET /sales-returns/count
        success, _ = self.run_test(
            "Get Sales Returns Count",
            "GET",
            "sales-returns/count", 
            200,
            params={'organization_id': self.org_id}
        )
        
        # Test POST /sales-returns (create)
        if self.customer_id and self.sales_return_account_id:
            return_data = {
                "date": datetime.now().strftime("%Y-%m-%d"),
                "lines": [{
                    "item_name": "Test Item Return",
                    "quantity": 2,
                    "unit": "piece",
                    "unit_price": 25.0,
                    "currency": "USD",
                    "exchange_rate": 1,
                    "discount_percent": 0,
                    "line_total": 50.0,
                    "line_total_usd": 50.0,
                    "is_taxable": True
                }],
                "subtotal": 50.0,
                "discount_percent": 0,
                "discount_amount": 0,
                "tax_percent": 11.0,
                "tax_amount": 5.5,
                "total": 55.5,
                "total_usd": 55.5,
                "currency": "USD",
                "reason": "Defective item",
                "notes": "Customer requested return",
                "debit_account_id": self.sales_return_account_id,
                "credit_account_id": self.customer_id,
                "organization_id": self.org_id
            }
            
            success, created_return = self.run_test(
                "Create Sales Return",
                "POST",
                "sales-returns",
                200,
                data=return_data
            )
            
            if success and 'id' in created_return:
                return_id = created_return['id']
                print(f"   Created return with number: {created_return.get('return_number')}")
                
                # Test GET /sales-returns/{id}
                success, _ = self.run_test(
                    "Get Sales Return by ID",
                    "GET",
                    f"sales-returns/{return_id}",
                    200
                )
                
                # Test PUT /sales-returns/{id} 
                update_data = {**return_data, "reason": "Updated reason - damaged goods"}
                success, _ = self.run_test(
                    "Update Sales Return",
                    "PUT",
                    f"sales-returns/{return_id}",
                    200,
                    data=update_data
                )
                
                # Test POST /sales-returns/{id}/post
                success, post_response = self.run_test(
                    "Post Sales Return",
                    "POST", 
                    f"sales-returns/{return_id}/post",
                    200
                )
                if success:
                    print(f"   Posted with voucher: {post_response.get('voucher_number')}")
                
                # Test POST /sales-returns/{id}/unpost (super admin only)
                success, _ = self.run_test(
                    "Unpost Sales Return (may fail if not super_admin)",
                    "POST",
                    f"sales-returns/{return_id}/unpost", 
                    200
                )
                
                return return_id
        else:
            print("❌ Cannot test sales returns - missing customer or sales account")
            return None

    def test_purchase_returns_endpoints(self):
        """Test all Purchase Returns endpoints"""
        print("\n📦 TESTING PURCHASE RETURNS MODULE")
        
        # Test GET /purchase-returns (list)
        success, _ = self.run_test(
            "List Purchase Returns",
            "GET",
            "purchase-returns", 
            200,
            params={'organization_id': self.org_id}
        )
        
        # Test GET /purchase-returns/count
        success, _ = self.run_test(
            "Get Purchase Returns Count", 
            "GET",
            "purchase-returns/count",
            200, 
            params={'organization_id': self.org_id}
        )
        
        # Test POST /purchase-returns (create)
        if self.supplier_id and self.purchase_return_account_id:
            return_data = {
                "date": datetime.now().strftime("%Y-%m-%d"),
                "lines": [{
                    "item_name": "Test Purchase Return",
                    "quantity": 3,
                    "unit": "piece", 
                    "unit_price": 15.0,
                    "currency": "USD",
                    "exchange_rate": 1,
                    "discount_percent": 0,
                    "line_total": 45.0,
                    "line_total_usd": 45.0
                }],
                "subtotal": 45.0,
                "discount_percent": 0,
                "discount_amount": 0,
                "tax_percent": 11.0,
                "tax_amount": 4.95,
                "total": 49.95,
                "total_usd": 49.95,
                "currency": "USD", 
                "reason": "Wrong items received",
                "notes": "Supplier sent wrong SKU",
                "debit_account_id": self.supplier_id,
                "credit_account_id": self.purchase_return_account_id,
                "organization_id": self.org_id
            }
            
            success, created_return = self.run_test(
                "Create Purchase Return",
                "POST",
                "purchase-returns",
                200,
                data=return_data
            )
            
            if success and 'id' in created_return:
                return_id = created_return['id']
                print(f"   Created return with number: {created_return.get('return_number')}")
                
                # Test GET /purchase-returns/{id}
                success, _ = self.run_test(
                    "Get Purchase Return by ID",
                    "GET",
                    f"purchase-returns/{return_id}",
                    200
                )
                
                # Test PUT /purchase-returns/{id}
                update_data = {**return_data, "reason": "Updated - completely wrong order"}
                success, _ = self.run_test(
                    "Update Purchase Return",
                    "PUT", 
                    f"purchase-returns/{return_id}",
                    200,
                    data=update_data
                )
                
                # Test POST /purchase-returns/{id}/post
                success, post_response = self.run_test(
                    "Post Purchase Return",
                    "POST",
                    f"purchase-returns/{return_id}/post",
                    200
                )
                if success:
                    print(f"   Posted with voucher: {post_response.get('voucher_number')}")
                
                return return_id
        else:
            print("❌ Cannot test purchase returns - missing supplier or purchase account")
            return None

    def test_voucher_performance(self):
        """Test voucher endpoints for performance improvements"""
        print("\n💼 TESTING VOUCHER ENTRY (Performance Check)")
        
        # Test voucher list with pagination 
        success, vouchers = self.run_test(
            "Get Vouchers List (with pagination)",
            "GET",
            "vouchers",
            200,
            params={
                'organization_id': self.org_id,
                'skip': 0,
                'limit': 50
            }
        )
        
        # Test accounts/movable/list endpoint (performance improvement)
        success, accounts = self.run_test(
            "Get Movable Accounts (Performance Endpoint)",
            "GET", 
            "accounts/movable/list",
            200,
            params={'organization_id': self.org_id}
        )

    def test_crdb_notes_performance(self):
        """Test CrDb Notes endpoints for performance improvements"""
        print("\n📝 TESTING CR/DB NOTES (Performance Check)")
        
        # Test CrDb notes list
        success, notes = self.run_test(
            "Get CrDb Notes List",
            "GET",
            "crdb-notes", 
            200,
            params={'organization_id': self.org_id}
        )

    def test_exchange_rate_latest(self):
        """Test exchange rate auto-fetch"""
        print("\n💱 TESTING EXCHANGE RATE")
        
        # Test latest exchange rate
        success, rate_data = self.run_test(
            "Get Latest Exchange Rate",
            "GET",
            "exchange-rates/latest",
            200,
            params={'organization_id': self.org_id}
        )
        
        if success and 'rate' in rate_data:
            rate = rate_data['rate']
            print(f"   Latest rate: {rate}")
            if rate == 89500:
                print("✅ Exchange rate matches expected value (89500)")
            else:
                print(f"⚠️ Exchange rate is {rate}, expected 89500")

def main():
    print("🧪 KAIROS Accounting System - API Testing")
    print("=" * 50)
    
    tester = KAIROSAPITester()
    
    # Login first
    if not tester.test_login():
        print("❌ Login failed, stopping tests")
        return 1
    
    # Setup test accounts
    if not tester.setup_test_accounts():
        print("❌ Account setup failed") 
        return 1
        
    # Test all modules
    tester.test_sales_returns_endpoints()
    tester.test_purchase_returns_endpoints() 
    tester.test_voucher_performance()
    tester.test_crdb_notes_performance()
    tester.test_exchange_rate_latest()
    
    # Print final results
    print(f"\n📊 FINAL RESULTS")
    print("=" * 30)
    print(f"Tests run: {tester.tests_run}")
    print(f"Tests passed: {tester.tests_passed}")
    print(f"Tests failed: {tester.tests_run - tester.tests_passed}")
    print(f"Success rate: {(tester.tests_passed/tester.tests_run*100):.1f}%")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())