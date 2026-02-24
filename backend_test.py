#!/usr/bin/env python3
"""
Backend Testing for KAIROS Lebanese Digital Invoicing System
Focus: Fiscal Year Management Module API Testing
"""
import requests
import sys
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

# Backend URL from frontend .env
BACKEND_URL = "https://simplicity-2.preview.emergentagent.com/api"

class FiscalYearAPITester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.token = None
        self.org_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.created_fy_ids = []  # Track created FYs for cleanup
        
    def log(self, message: str):
        """Log test messages"""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, headers: Optional[Dict] = None) -> tuple[bool, Dict]:
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        
        # Default headers
        req_headers = {'Content-Type': 'application/json'}
        if self.token:
            req_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            req_headers.update(headers)
            
        self.tests_run += 1
        self.log(f"🔍 Testing {name}...")
        
        try:
            if method.upper() == 'GET':
                response = requests.get(url, headers=req_headers)
            elif method.upper() == 'POST':
                response = requests.post(url, json=data, headers=req_headers)
            elif method.upper() == 'PUT':
                response = requests.put(url, json=data, headers=req_headers)
            elif method.upper() == 'DELETE':
                response = requests.delete(url, headers=req_headers)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"✅ PASS - {name} (Status: {response.status_code})")
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                self.log(f"❌ FAIL - {name} - Expected {expected_status}, got {response.status_code}")
                if response.status_code >= 400:
                    try:
                        error_detail = response.json().get('detail', 'No error detail')
                        self.log(f"   Error: {error_detail}")
                    except:
                        self.log(f"   Error: {response.text[:200]}")
                return False, {}
                
        except Exception as e:
            self.log(f"❌ ERROR - {name} - Exception: {str(e)}")
            return False, {}
    
    def setup_auth_and_org(self):
        """Setup authentication and get organization"""
        self.log("🚀 Setting up authentication and organization...")
        
        # First try to seed demo data
        success, _ = self.run_test("Seed Demo Data", "POST", "seed", 200)
        
        # Login with super admin credentials
        login_data = {
            "email": "carlo.mitri@gmail.com",
            "password": "Carinemi@28"
        }
        success, response = self.run_test("Login", "POST", "auth/login", 200, login_data)
        
        if not success:
            self.log("❌ Failed to login - stopping tests")
            return False
            
        self.token = response.get('token')
        if not self.token:
            self.log("❌ No token received - stopping tests")
            return False
            
        # Get organizations
        success, orgs = self.run_test("Get Organizations", "GET", "organizations", 200)
        if not success or not orgs:
            self.log("❌ Failed to get organizations - stopping tests")
            return False
            
        # Find Beirut Trading Co. organization
        beirut_org = None
        for org in orgs:
            if org.get('name') == 'Beirut Trading Co.':
                beirut_org = org
                break
                
        if not beirut_org:
            self.log("❌ Beirut Trading Co. organization not found - stopping tests")
            return False
            
        self.org_id = beirut_org['id']
        self.log(f"✅ Using organization: {beirut_org['name']} (ID: {self.org_id})")
        return True
    
    def test_fiscal_year_crud(self):
        """Test fiscal year CRUD operations"""
        self.log("\n📅 Testing Fiscal Year CRUD Operations...")
        
        # Test 1: Create FY 2024
        fy_2024_data = {
            "name": "FY 2024",
            "start_date": "2024-01-01",
            "end_date": "2024-12-31",
            "organization_id": self.org_id
        }
        
        success, fy_2024 = self.run_test(
            "Create FY 2024", "POST", "fiscal-years", 200, fy_2024_data
        )
        
        if success:
            self.created_fy_ids.append(fy_2024.get('id'))
            
        # Test 2: Create FY 2025
        fy_2025_data = {
            "name": "FY 2025", 
            "start_date": "2025-01-01",
            "end_date": "2025-12-31",
            "organization_id": self.org_id
        }
        
        success, fy_2025 = self.run_test(
            "Create FY 2025", "POST", "fiscal-years", 200, fy_2025_data
        )
        
        if success:
            self.created_fy_ids.append(fy_2025.get('id'))
            
        # Test 3: Try to create overlapping FY (should fail)
        overlap_fy_data = {
            "name": "FY Overlap Test",
            "start_date": "2024-06-01",
            "end_date": "2025-06-01", 
            "organization_id": self.org_id
        }
        
        self.run_test(
            "Create Overlapping FY (should fail)", "POST", "fiscal-years", 400, overlap_fy_data
        )
        
        # Test 4: Get all fiscal years
        success, fiscal_years = self.run_test(
            "Get All Fiscal Years", "GET", f"fiscal-years?organization_id={self.org_id}", 200
        )
        
        if success:
            self.log(f"   Found {len(fiscal_years)} fiscal years")
            
        # Test 5: Get single fiscal year
        if self.created_fy_ids:
            fy_id = self.created_fy_ids[0]
            self.run_test(
                "Get Single Fiscal Year", "GET", f"fiscal-years/{fy_id}", 200
            )
            
        # Test 6: Update fiscal year
        if self.created_fy_ids:
            fy_id = self.created_fy_ids[0]
            update_data = {
                "name": "FY 2024 Updated"
            }
            self.run_test(
                "Update Fiscal Year", "PUT", f"fiscal-years/{fy_id}", 200, update_data
            )
    
    def test_fiscal_year_closing(self):
        """Test fiscal year closing functionality"""
        self.log("\n🔒 Testing Fiscal Year Closing...")
        
        if not self.created_fy_ids:
            self.log("❌ No fiscal years available for closing test")
            return
            
        fy_id = self.created_fy_ids[0]  # Use first created FY
        
        # Test close fiscal year
        success, close_result = self.run_test(
            "Close Fiscal Year", "POST", f"fiscal-years/{fy_id}/close", 200
        )
        
        if success:
            self.log(f"   Closing result: {close_result.get('message', 'No message')}")
            
            # Verify FY is now closed
            success, fy_data = self.run_test(
                "Verify FY Closed", "GET", f"fiscal-years/{fy_id}", 200
            )
            
            if success and fy_data.get('status') == 'closed':
                self.log("   ✅ Fiscal year status confirmed as closed")
                
                # Test that we can't edit a closed FY
                update_data = {"name": "Should Fail"}
                self.run_test(
                    "Edit Closed FY (should fail)", "PUT", f"fiscal-years/{fy_id}", 400, update_data
                )
                
                # Test that we can't delete a closed FY
                self.run_test(
                    "Delete Closed FY (should fail)", "DELETE", f"fiscal-years/{fy_id}", 400
                )
                
                # Test reopen (super admin only)
                self.run_test(
                    "Reopen Fiscal Year", "POST", f"fiscal-years/{fy_id}/reopen", 200
                )
    
    def test_reports_with_fy_filter(self):
        """Test that reports accept fy_id parameter"""
        self.log("\n📊 Testing Reports with FY Filter...")
        
        if not self.created_fy_ids:
            self.log("❌ No fiscal years available for report testing")
            return
            
        fy_id = self.created_fy_ids[0]
        
        # Test Trial Balance with FY filter
        self.run_test(
            "Trial Balance with FY", "GET", 
            f"reports/trial-balance?organization_id={self.org_id}&fy_id={fy_id}", 
            200
        )
        
        # Test Income Statement with FY filter  
        self.run_test(
            "Income Statement with FY", "GET",
            f"reports/income-statement?organization_id={self.org_id}&fy_id={fy_id}",
            200
        )
        
        # Test General Ledger with FY filter (need an account code)
        # First get accounts to find a valid code
        success, accounts = self.run_test(
            "Get Accounts for GL Test", "GET", f"accounts?organization_id={self.org_id}", 200
        )
        
        if success and accounts:
            # Use first account for GL test
            account_code = accounts[0].get('code')
            if account_code:
                self.run_test(
                    "General Ledger with FY", "GET",
                    f"reports/general-ledger/{account_code}?organization_id={self.org_id}&fy_id={fy_id}",
                    200
                )
    
    def cleanup(self):
        """Clean up created test data"""
        self.log("\n🧹 Cleaning up test data...")
        
        for fy_id in self.created_fy_ids:
            # Try to reopen if closed first
            self.run_test("Reopen for cleanup", "POST", f"fiscal-years/{fy_id}/reopen", 200)
            # Then delete
            self.run_test("Delete FY", "DELETE", f"fiscal-years/{fy_id}", 200)
    
    def run_all_tests(self):
        """Run all fiscal year tests"""
        self.log("🎯 Starting KAIROS Fiscal Year API Tests...")
        self.log("=" * 50)
        
        # Setup
        if not self.setup_auth_and_org():
            return False
            
        try:
            # Run test suites
            self.test_fiscal_year_crud()
            self.test_fiscal_year_closing()
            self.test_reports_with_fy_filter()
            
        finally:
            # Always cleanup
            self.cleanup()
            
        # Results
        self.log("\n" + "=" * 50)
        self.log(f"📊 Test Results: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 ALL TESTS PASSED!")
            return True
        else:
            failed = self.tests_run - self.tests_passed
            self.log(f"❌ {failed} tests failed")
            return False

def main():
    """Main entry point"""
    tester = FiscalYearAPITester()
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
        
    except KeyboardInterrupt:
        print("\n🛑 Tests interrupted by user")
        return 130
    except Exception as e:
        print(f"\n💥 Unexpected error: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())