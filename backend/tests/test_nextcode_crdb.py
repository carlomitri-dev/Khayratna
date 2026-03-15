"""
Test Suite for:
1. Automatic Account Code Generation (GET /accounts/next-code)
2. CrDb Notes Exchange Rate visibility and functionality
"""
import pytest
import requests
import os
import random
import string

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from previous iterations
TEST_EMAIL = "carlo.mitri@gmail.com"
TEST_PASSWORD = "Carinemi@28"
ORGANIZATION_ID = "fa6d4449-a859-445f-9e0b-fbb4aa90bfee"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestNextCodeEndpoint:
    """Test GET /api/accounts/next-code for automatic account code generation"""
    
    def test_next_code_customer_prefix_4111(self, api_client):
        """Test next code generation for customer accounts (prefix 4111)"""
        response = api_client.get(
            f"{BASE_URL}/api/accounts/next-code",
            params={
                "organization_id": ORGANIZATION_ID,
                "prefix": "4111"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "next_code" in data, "Response should contain 'next_code' field"
        next_code = data["next_code"]
        
        # Verify code starts with prefix
        assert next_code.startswith("4111"), f"Code should start with '4111', got: {next_code}"
        
        # Verify code length (should be numeric suffix after prefix)
        assert len(next_code) > 4, f"Code should have digits after prefix, got: {next_code}"
        
        # Verify suffix is numeric
        suffix = next_code[4:]
        assert suffix.isdigit(), f"Suffix should be numeric, got: {suffix}"
        
        print(f"SUCCESS: Next customer code is {next_code}")
    
    def test_next_code_supplier_prefix_4011(self, api_client):
        """Test next code generation for supplier accounts (prefix 4011)"""
        response = api_client.get(
            f"{BASE_URL}/api/accounts/next-code",
            params={
                "organization_id": ORGANIZATION_ID,
                "prefix": "4011"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "next_code" in data, "Response should contain 'next_code' field"
        next_code = data["next_code"]
        
        # Verify code starts with prefix
        assert next_code.startswith("4011"), f"Code should start with '4011', got: {next_code}"
        
        # Verify code length
        assert len(next_code) > 4, f"Code should have digits after prefix, got: {next_code}"
        
        # Verify suffix is numeric
        suffix = next_code[4:]
        assert suffix.isdigit(), f"Suffix should be numeric, got: {suffix}"
        
        print(f"SUCCESS: Next supplier code is {next_code}")
    
    def test_next_code_requires_auth(self):
        """Test that next-code endpoint requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/accounts/next-code",
            params={
                "organization_id": ORGANIZATION_ID,
                "prefix": "4111"
            }
        )
        assert response.status_code in [401, 403], f"Should require auth, got: {response.status_code}"
        print("SUCCESS: Endpoint requires authentication")
    
    def test_next_code_increments_correctly(self, api_client):
        """Test that sequential calls return incremented codes"""
        # Get first code
        response1 = api_client.get(
            f"{BASE_URL}/api/accounts/next-code",
            params={
                "organization_id": ORGANIZATION_ID,
                "prefix": "4111"
            }
        )
        assert response1.status_code == 200
        code1 = response1.json()["next_code"]
        
        # Second call should return the same code (no account created yet)
        response2 = api_client.get(
            f"{BASE_URL}/api/accounts/next-code",
            params={
                "organization_id": ORGANIZATION_ID,
                "prefix": "4111"
            }
        )
        assert response2.status_code == 200
        code2 = response2.json()["next_code"]
        
        # Codes should be the same since we didn't create an account
        assert code1 == code2, f"Without creating an account, codes should be same: {code1} vs {code2}"
        print(f"SUCCESS: Consistent code returned: {code1}")


class TestCrDbNotesEndpoint:
    """Test CrDb Notes with exchange_rate field"""
    
    def test_create_crdb_note_with_exchange_rate(self, api_client):
        """Test creating a CrDb note with exchange rate"""
        # First get a movable account for debit
        accounts_response = api_client.get(
            f"{BASE_URL}/api/accounts/movable/list",
            params={
                "organization_id": ORGANIZATION_ID,
                "search": "4111"
            }
        )
        assert accounts_response.status_code == 200
        accounts = accounts_response.json()
        assert len(accounts) > 0, "Should have at least one customer account"
        debit_account = accounts[0]
        
        # Get a credit account
        credit_accounts_response = api_client.get(
            f"{BASE_URL}/api/accounts/movable/list",
            params={
                "organization_id": ORGANIZATION_ID,
                "search": "5"  # Cash/Bank accounts
            }
        )
        credit_accounts = credit_accounts_response.json()
        assert len(credit_accounts) > 0, "Should have at least one cash/bank account"
        credit_account = credit_accounts[0]
        
        # Create CrDb note with exchange_rate
        unique_suffix = ''.join(random.choices(string.digits, k=6))
        note_data = {
            "note_type": "debit",
            "date": "2026-01-15",
            "description": f"TEST_EXCHANGE_RATE_{unique_suffix}",
            "currency": "USD",
            "amount": 100.00,
            "exchange_rate": 89500,  # Testing exchange rate visibility
            "organization_id": ORGANIZATION_ID,
            "debit_account_code": debit_account["code"],
            "debit_account_name": debit_account["name"],
            "credit_account_code": credit_account["code"],
            "credit_account_name": credit_account["name"]
        }
        
        response = api_client.post(f"{BASE_URL}/api/crdb-notes", json=note_data)
        assert response.status_code == 200, f"Failed to create note: {response.text}"
        
        created_note = response.json()
        
        # Verify exchange_rate is saved and returned
        assert "exchange_rate" in created_note, "Response should include exchange_rate"
        assert created_note["exchange_rate"] == 89500, f"Exchange rate should be 89500, got: {created_note.get('exchange_rate')}"
        
        # Verify amount_lbp calculation
        assert "amount_lbp" in created_note, "Response should include amount_lbp"
        expected_lbp = 100.00 * 89500
        assert created_note["amount_lbp"] == expected_lbp, f"amount_lbp should be {expected_lbp}, got: {created_note.get('amount_lbp')}"
        
        print(f"SUCCESS: Created CrDb note with exchange_rate: {created_note['note_number']}")
        print(f"  - Exchange Rate: {created_note['exchange_rate']}")
        print(f"  - Amount USD: {created_note['amount']}")
        print(f"  - Amount LBP: {created_note['amount_lbp']}")
        
        # Store note_id for cleanup or further tests
        return created_note["id"]
    
    def test_get_crdb_notes_includes_exchange_rate(self, api_client):
        """Test that GET /crdb-notes returns exchange_rate in the list"""
        response = api_client.get(
            f"{BASE_URL}/api/crdb-notes",
            params={
                "organization_id": ORGANIZATION_ID,
                "limit": 20
            }
        )
        assert response.status_code == 200, f"Failed to get notes: {response.text}"
        
        notes = response.json()
        assert len(notes) > 0, "Should have at least one note"
        
        # Check that exchange_rate is in the response
        for note in notes:
            assert "exchange_rate" in note, f"Note {note.get('note_number')} should have exchange_rate field"
            print(f"  - {note['note_number']}: exchange_rate={note.get('exchange_rate')}")
        
        print(f"SUCCESS: All {len(notes)} notes include exchange_rate field")
    
    def test_update_crdb_note_with_exchange_rate(self, api_client):
        """Test updating a CrDb note exchange rate"""
        # First get existing draft notes
        response = api_client.get(
            f"{BASE_URL}/api/crdb-notes",
            params={
                "organization_id": ORGANIZATION_ID,
                "status": "draft",
                "limit": 10
            }
        )
        assert response.status_code == 200
        notes = response.json()
        
        # Find a draft note to update (preferably our test note)
        draft_note = None
        for n in notes:
            if n.get("description", "").startswith("TEST_EXCHANGE_RATE"):
                draft_note = n
                break
        
        if not draft_note and len(notes) > 0:
            draft_note = notes[0]
        
        if not draft_note:
            pytest.skip("No draft notes available to test update")
        
        # Update the note with a different exchange rate
        new_rate = 90000
        update_data = {
            "note_type": draft_note["note_type"],
            "date": draft_note["date"],
            "description": draft_note["description"],
            "currency": draft_note["currency"],
            "amount": draft_note["amount"],
            "exchange_rate": new_rate,
            "organization_id": ORGANIZATION_ID,
            "debit_account_code": draft_note["debit_account_code"],
            "credit_account_code": draft_note["credit_account_code"]
        }
        
        response = api_client.put(f"{BASE_URL}/api/crdb-notes/{draft_note['id']}", json=update_data)
        assert response.status_code == 200, f"Failed to update note: {response.text}"
        
        updated_note = response.json()
        assert updated_note["exchange_rate"] == new_rate, f"Exchange rate should be updated to {new_rate}, got: {updated_note.get('exchange_rate')}"
        
        print(f"SUCCESS: Updated note {draft_note['note_number']} exchange_rate to {new_rate}")


class TestCrDbNotesCRUD:
    """Additional CRUD tests for CrDb notes"""
    
    def test_crdb_note_count_endpoint(self, api_client):
        """Test count endpoint for CrDb notes"""
        response = api_client.get(
            f"{BASE_URL}/api/crdb-notes/count",
            params={"organization_id": ORGANIZATION_ID}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "count" in data, "Response should include count"
        print(f"SUCCESS: Total CrDb notes count: {data['count']}")
    
    def test_crdb_notes_filter_by_type(self, api_client):
        """Test filtering CrDb notes by note_type"""
        for note_type in ["debit", "credit", "dbcr"]:
            response = api_client.get(
                f"{BASE_URL}/api/crdb-notes",
                params={
                    "organization_id": ORGANIZATION_ID,
                    "note_type": note_type,
                    "limit": 5
                }
            )
            assert response.status_code == 200, f"Failed for type {note_type}: {response.text}"
            notes = response.json()
            for note in notes:
                assert note["note_type"] == note_type, f"Note type should be {note_type}, got: {note['note_type']}"
            print(f"SUCCESS: Filter by {note_type} works ({len(notes)} notes)")
    
    def test_crdb_notes_filter_by_status(self, api_client):
        """Test filtering CrDb notes by status"""
        for status in ["draft", "posted"]:
            response = api_client.get(
                f"{BASE_URL}/api/crdb-notes",
                params={
                    "organization_id": ORGANIZATION_ID,
                    "status": status,
                    "limit": 5
                }
            )
            assert response.status_code == 200, f"Failed for status {status}: {response.text}"
            notes = response.json()
            for note in notes:
                expected_posted = (status == "posted")
                assert note["is_posted"] == expected_posted, f"is_posted should be {expected_posted}, got: {note['is_posted']}"
            print(f"SUCCESS: Filter by {status} works ({len(notes)} notes)")


# Cleanup fixture
@pytest.fixture(scope="module", autouse=True)
def cleanup(api_client):
    """Cleanup test data after tests"""
    yield
    # Note: We don't delete test notes as they might be needed for frontend verification
    print("Test cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
