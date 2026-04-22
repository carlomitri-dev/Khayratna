"""
Tests for Default Posting Accounts - KAIROS
Covers: GET/PUT /api/settings/default-accounts and pre-fill persistence.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://invoice-journal-app.preview.emergentagent.com").rstrip("/")
ORG_ID = "14a4544d-a2c8-437b-94bf-d9e94b72d2ea"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "testadmin@test.com",
        "password": "testadmin123",
    })
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    })
    return s


@pytest.fixture(scope="module")
def accounts(client):
    r = client.get(f"{BASE_URL}/api/accounts", params={"organization_id": ORG_ID})
    assert r.status_code == 200
    data = r.json()
    arr = data.get("accounts") if isinstance(data, dict) else data
    assert isinstance(arr, list) and len(arr) > 0, "No accounts available for tests"
    return arr


# ========= GET endpoint =========
class TestGetDefaultAccounts:
    def test_get_returns_structure(self, client):
        r = client.get(f"{BASE_URL}/api/settings/default-accounts",
                       params={"organization_id": ORG_ID})
        assert r.status_code == 200
        d = r.json()
        assert d["organization_id"] == ORG_ID
        assert "accounts" in d and isinstance(d["accounts"], dict)

    def test_get_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/settings/default-accounts",
                         params={"organization_id": ORG_ID})
        assert r.status_code in (401, 403)


# ========= PUT endpoint & persistence =========
class TestSaveDefaultAccounts:
    def test_save_and_persist_all_keys(self, client, accounts):
        sales_id = accounts[0]["id"]
        alt_id = accounts[-1]["id"]
        payload = {
            "organization_id": ORG_ID,
            "accounts": {
                "sales_vat_account": sales_id,
                "purchase_vat_account": sales_id,
                "sales_account": sales_id,
                "purchase_account": alt_id,
                "sales_return_account": alt_id,
                "purchase_return_account": sales_id,
                "cash_bank_account": alt_id,
            },
        }
        r = client.put(f"{BASE_URL}/api/settings/default-accounts", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accounts"]["sales_account"] == sales_id
        assert body["accounts"]["purchase_account"] == alt_id

        # GET to verify persistence
        g = client.get(f"{BASE_URL}/api/settings/default-accounts",
                       params={"organization_id": ORG_ID})
        assert g.status_code == 200
        stored = g.json()["accounts"]
        for k in [
            "sales_vat_account", "purchase_vat_account", "sales_account",
            "purchase_account", "sales_return_account",
            "purchase_return_account", "cash_bank_account",
        ]:
            assert k in stored and stored[k], f"Missing key {k} after save"
        assert stored["sales_account"] == sales_id
        assert stored["sales_return_account"] == alt_id

    def test_save_rejects_missing_org_id(self, client):
        r = client.put(f"{BASE_URL}/api/settings/default-accounts",
                       json={"accounts": {"sales_account": "x"}})
        assert r.status_code == 400

    def test_save_filters_invalid_keys(self, client, accounts):
        # Unknown keys should be stripped; known keys with non-str values dropped
        sales_id = accounts[0]["id"]
        r = client.put(f"{BASE_URL}/api/settings/default-accounts", json={
            "organization_id": ORG_ID,
            "accounts": {
                "sales_account": sales_id,
                "foo_bar": "xxx",
                "purchase_account": 123,  # non-string
            },
        })
        assert r.status_code == 200
        body = r.json()["accounts"]
        assert body.get("sales_account") == sales_id
        assert "foo_bar" not in body
        assert "purchase_account" not in body

    def test_save_requires_auth(self):
        r = requests.put(f"{BASE_URL}/api/settings/default-accounts",
                         json={"organization_id": ORG_ID, "accounts": {}})
        assert r.status_code in (401, 403)

    def test_cleanup_and_persist_empty(self, client):
        # Reset to empty for clean UI state
        r = client.put(f"{BASE_URL}/api/settings/default-accounts", json={
            "organization_id": ORG_ID,
            "accounts": {},
        })
        assert r.status_code == 200
        g = client.get(f"{BASE_URL}/api/settings/default-accounts",
                       params={"organization_id": ORG_ID})
        assert g.json()["accounts"] == {}
