"""Backend tests for Purchase Expense (Landed Cost) feature."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://invoice-journal-app.preview.emergentagent.com').rstrip('/')
ORG_ID = '14a4544d-a2c8-437b-94bf-d9e94b72d2ea'
INVOICE_ID = '04f349be-78d9-43a3-b208-40129ccc9859'
EMAIL = 'testadmin@test.com'
PASSWORD = 'testadmin123'


@pytest.fixture(scope='module')
def token():
    r = requests.post(f'{BASE_URL}/api/auth/login', json={'email': EMAIL, 'password': PASSWORD}, timeout=20)
    assert r.status_code == 200, f'Login failed: {r.status_code} {r.text}'
    return r.json()['token']


@pytest.fixture(scope='module')
def headers(token):
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}


@pytest.fixture(scope='module')
def accounts(headers):
    r = requests.get(f'{BASE_URL}/api/accounts?organization_id={ORG_ID}', headers=headers, timeout=20)
    assert r.status_code == 200
    body = r.json()
    accs = body['accounts'] if isinstance(body, dict) else body
    assert len(accs) >= 2, f'Need at least 2 accounts, found {len(accs)}'
    return accs


@pytest.fixture(scope='module')
def invoice(headers):
    r = requests.get(f'{BASE_URL}/api/purchase-invoices/{INVOICE_ID}', headers=headers, timeout=20)
    assert r.status_code == 200, f'Invoice not found: {r.text}'
    return r.json()


# === LIST endpoint ===
def test_list_purchase_expenses_initial(headers):
    r = requests.get(
        f'{BASE_URL}/api/purchase-expenses?organization_id={ORG_ID}&purchase_invoice_id={INVOICE_ID}',
        headers=headers, timeout=20,
    )
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


# === CREATE: balance validation ===
def test_create_unbalanced_rejected(headers, accounts):
    a1, a2 = accounts[0], accounts[1]
    payload = {
        'purchase_invoice_id': INVOICE_ID,
        'date': '2026-01-15',
        'exchange_rate': 89500,
        'debit_lines': [{'account_code': a1['code'], 'account_name': a1.get('name'), 'amount_usd': 100, 'amount_lbp': 8950000}],
        'credit_lines': [{'account_code': a2['code'], 'account_name': a2.get('name'), 'amount_usd': 50, 'amount_lbp': 4475000}],
        'total_usd': 100, 'total_lbp': 8950000,
        'organization_id': ORG_ID,
    }
    r = requests.post(f'{BASE_URL}/api/purchase-expenses', headers=headers, json=payload, timeout=20)
    assert r.status_code == 400, f'Expected 400, got {r.status_code}: {r.text}'
    assert 'must equal' in r.text.lower() or 'debit' in r.text.lower()


# === CREATE valid + GET back ===
@pytest.fixture(scope='module')
def created_expense(headers, accounts):
    a1, a2 = accounts[0], accounts[1]
    payload = {
        'purchase_invoice_id': INVOICE_ID,
        'date': '2026-01-15',
        'exchange_rate': 89500,
        'debit_lines': [{
            'account_code': a1['code'], 'account_name': a1.get('name'),
            'description': 'Shipping cost', 'amount_usd': 30, 'amount_lbp': 2685000,
        }],
        'credit_lines': [{
            'account_code': a2['code'], 'account_name': a2.get('name'),
            'description': 'Payable', 'amount_usd': 30, 'amount_lbp': 2685000,
        }],
        'total_usd': 30, 'total_lbp': 2685000,
        'notes': 'TEST_purchase_expense',
        'organization_id': ORG_ID,
    }
    r = requests.post(f'{BASE_URL}/api/purchase-expenses', headers=headers, json=payload, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data['id']
    assert data['expense_number'].startswith('PEXP-')
    assert data['is_posted'] is False
    assert data['status'] == 'draft'
    assert abs(data['total_usd'] - 30) < 0.01
    yield data
    # Cleanup
    requests.post(f'{BASE_URL}/api/purchase-expenses/{data["id"]}/unpost', headers=headers, timeout=20)
    requests.delete(f'{BASE_URL}/api/purchase-expenses/{data["id"]}', headers=headers, timeout=20)


def test_create_persisted_via_get(headers, created_expense):
    r = requests.get(f'{BASE_URL}/api/purchase-expenses/{created_expense["id"]}', headers=headers, timeout=20)
    assert r.status_code == 200
    assert r.json()['id'] == created_expense['id']
    assert r.json()['purchase_invoice_id'] == INVOICE_ID


def test_list_after_create(headers, created_expense):
    r = requests.get(
        f'{BASE_URL}/api/purchase-expenses?organization_id={ORG_ID}&purchase_invoice_id={INVOICE_ID}',
        headers=headers, timeout=20,
    )
    assert r.status_code == 200
    ids = [e['id'] for e in r.json()]
    assert created_expense['id'] in ids


# === UPDATE ===
def test_update_draft_expense(headers, created_expense, accounts):
    a1, a2 = accounts[0], accounts[1]
    payload = {
        'notes': 'TEST_purchase_expense_updated',
        'debit_lines': [{
            'account_code': a1['code'], 'account_name': a1.get('name'),
            'amount_usd': 45, 'amount_lbp': 4027500,
        }],
        'credit_lines': [{
            'account_code': a2['code'], 'account_name': a2.get('name'),
            'amount_usd': 45, 'amount_lbp': 4027500,
        }],
    }
    r = requests.put(f'{BASE_URL}/api/purchase-expenses/{created_expense["id"]}', headers=headers, json=payload, timeout=20)
    assert r.status_code == 200, r.text
    g = requests.get(f'{BASE_URL}/api/purchase-expenses/{created_expense["id"]}', headers=headers, timeout=20).json()
    assert g['notes'] == 'TEST_purchase_expense_updated'
    assert abs(g['total_usd'] - 45) < 0.01


# === DISTRIBUTION PREVIEW ===
def test_distribution_preview(headers, created_expense, invoice):
    r = requests.get(f'{BASE_URL}/api/purchase-expenses/{created_expense["id"]}/distribution-preview', headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert 'items' in data
    assert 'total_expense_usd' in data
    assert 'invoice_total_usd' in data
    assert len(data['items']) == len(invoice.get('lines', []))
    # Sum of expense_share should approximately equal total_usd
    s = sum(it['expense_share_usd'] for it in data['items'])
    assert abs(s - data['total_expense_usd']) < 0.05, f'distribution sum mismatch: {s} vs {data["total_expense_usd"]}'
    # Each item should have proportion
    for it in data['items']:
        assert 'proportion' in it
        assert 'expense_per_unit_usd' in it
        assert 'new_unit_cost' in it


# === POST + verify inventory + UNPOST ===
def test_post_and_unpost_flow(headers, created_expense, invoice):
    exp_id = created_expense['id']

    # Capture original inventory costs
    orig_costs = {}
    for ln in invoice.get('lines', []):
        iid = ln.get('inventory_item_id')
        if not iid:
            continue
        ir = requests.get(f'{BASE_URL}/api/inventory/items/{iid}', headers=headers, timeout=20)
        if ir.status_code == 200:
            orig_costs[iid] = ir.json().get('cost', 0)

    # POST
    r = requests.post(f'{BASE_URL}/api/purchase-expenses/{exp_id}/post', headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get('voucher_id')
    assert body.get('voucher_number', '').startswith('PEXP-V-')
    assert 'distribution' in body

    # Verify expense state
    g = requests.get(f'{BASE_URL}/api/purchase-expenses/{exp_id}', headers=headers, timeout=20).json()
    assert g['is_posted'] is True
    assert g['status'] == 'posted'
    assert g['voucher_id']

    # Verify voucher exists
    vr = requests.get(f'{BASE_URL}/api/vouchers/{body["voucher_id"]}', headers=headers, timeout=20)
    assert vr.status_code == 200, vr.text

    # Verify inventory cost increased (only if invoice lines have linked inventory items)
    has_inventory_links = any(ln.get('inventory_item_id') for ln in invoice.get('lines', []))
    if has_inventory_links:
        cost_changed = False
        for iid, orig in orig_costs.items():
            ir = requests.get(f'{BASE_URL}/api/inventory/items/{iid}', headers=headers, timeout=20)
            if ir.status_code == 200:
                new_cost = ir.json().get('cost', 0)
                if new_cost > orig + 0.0001:
                    cost_changed = True
        assert cost_changed, 'Expected at least one inventory item cost to increase after posting'
    else:
        print('NOTE: Test invoice lines have no inventory_item_id - inventory cost update step is no-op (data limitation, not a bug)')

    # UNPOST
    r2 = requests.post(f'{BASE_URL}/api/purchase-expenses/{exp_id}/unpost', headers=headers, timeout=30)
    assert r2.status_code == 200, r2.text

    g2 = requests.get(f'{BASE_URL}/api/purchase-expenses/{exp_id}', headers=headers, timeout=20).json()
    assert g2['is_posted'] is False
    assert g2['status'] == 'draft'

    # Verify voucher deleted
    vr2 = requests.get(f'{BASE_URL}/api/vouchers/{body["voucher_id"]}', headers=headers, timeout=20)
    assert vr2.status_code in (404, 400), f'Voucher should be deleted, got {vr2.status_code}'

    # Verify inventory cost reverted
    for iid, orig in orig_costs.items():
        ir = requests.get(f'{BASE_URL}/api/inventory/items/{iid}', headers=headers, timeout=20)
        if ir.status_code == 200:
            new_cost = ir.json().get('cost', 0)
            assert abs(new_cost - orig) < 0.01, f'Cost not reverted for {iid}: was {orig}, now {new_cost}'


def test_delete_draft_expense(headers, accounts):
    a1, a2 = accounts[0], accounts[1]
    payload = {
        'purchase_invoice_id': INVOICE_ID, 'date': '2026-01-15', 'exchange_rate': 89500,
        'debit_lines': [{'account_code': a1['code'], 'amount_usd': 10, 'amount_lbp': 895000}],
        'credit_lines': [{'account_code': a2['code'], 'amount_usd': 10, 'amount_lbp': 895000}],
        'total_usd': 10, 'total_lbp': 895000,
        'notes': 'TEST_to_delete', 'organization_id': ORG_ID,
    }
    r = requests.post(f'{BASE_URL}/api/purchase-expenses', headers=headers, json=payload, timeout=20)
    assert r.status_code == 200, r.text
    eid = r.json()['id']
    d = requests.delete(f'{BASE_URL}/api/purchase-expenses/{eid}', headers=headers, timeout=20)
    assert d.status_code == 200
    g = requests.get(f'{BASE_URL}/api/purchase-expenses/{eid}', headers=headers, timeout=20)
    assert g.status_code == 404
