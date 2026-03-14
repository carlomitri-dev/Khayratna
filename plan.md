# Plan: Stabilize Vouchers/Cr-Db + Faster Invoice Selectors + USD/LBP Exchange Rate + Returns (UPDATED v2)

## Objectives (Current Status)
- ✅ Stop freezing in **Vouchers** and **Cr/Db Notes** by removing in-memory filtering and huge reads.
- ✅ Improve perceived performance of **account selectors** across modules (Voucher/CrDb/Invoices/Returns).
- ✅ Simplify currency to **USD + LBP only** and always use the **latest saved exchange rate**.
- ✅ Add **Sales Return** and **Purchase Return** modules (standalone, partial returns, inventory updates, own numbering).
- ✅ Fix critical regression where **movable accounts** returned **0 items** (causing Voucher/CrDb selectors to be empty).

---

## Phase 1: Core Performance Fixes (Backend-first) — **COMPLETED**
**User stories (Delivered)**
1. ✅ As a user, I can open the Voucher list instantly even with many vouchers.
2. ✅ As a user, I can search vouchers/notes and get results without the page freezing.
3. ✅ As a user, voucher/CrDb pagination loads only the next page, not everything.

**Implementation steps (Completed)**
- Backend:
  - ✅ **Vouchers**: replaced `.to_list(10000)` + Python filtering with MongoDB query:
    - `$or` regex on `voucher_number`, `reference`, `description`
    - DB-side `skip/limit` pagination
    - ✅ `/vouchers/count` uses `count_documents` with the same query
  - ✅ **CrDb Notes**: same optimization for list + count endpoints (DB-side search + pagination)
  - ✅ Added/ensured indexes for common query patterns including new collections:
    - vouchers, invoices, exchange_rates, inventory
    - ✅ new indexes: `sales_returns`, `purchase_returns` (org/date/status/return_number)

**Evidence/verification**
- ✅ Voucher list/search no longer freezes.
- ✅ Cr/Db Notes list/search no longer freezes.

**Success criteria (Met)**
- ✅ Voucher and Cr/Db lists render without noticeable freezing; pagination and search stay responsive.

---

## Phase 1.5: Account Selector Data Fix + UI Performance (Critical Regression) — **COMPLETED**
**Problem addressed**
- Voucher + Cr/Db pages were loading **without accounts**.
- Root cause: duplicate endpoint `/accounts/movable/list` in `routers/accounts.py` was filtering by `account_type='detail'`, but this DB uses `account_type` like `asset/liability/expense/revenue/equity`, so it returned **0 accounts**.

**User stories (Delivered)**
1. ✅ As a user, Voucher Entry account dropdowns show accounts again.
2. ✅ As a user, Cr/Db Notes debit/credit dropdowns show accounts again.
3. ✅ As a user, large account dropdowns do not freeze the browser.

**Implementation steps (Completed)**
- Backend:
  - ✅ Fixed `/accounts/movable/list` in `routers/accounts.py`:
    - uses code length rule (`$strLenCP(code) >= 5`) + `is_active=True`
    - supports `search` parameter
    - returns a bounded list (limit 5000)
  - ✅ (Note) This router endpoint is the one actually used, because `routers/accounts.py` is included before `server.py` routes.
- Frontend:
  - ✅ `AccountSelector` now renders **max 100** items at a time for performance.
  - ✅ Added a “Showing 100 of N… Type to search for more.” hint.

**Evidence/verification**
- ✅ `/accounts/movable/list` now returns ~3,848 accounts for the org.
- ✅ Voucher Entry and Cr/Db Notes pages show selectors populated.

**Success criteria (Met)**
- ✅ Dropdowns populate correctly and remain responsive even with thousands of accounts.

---

## Phase 2: Invoice/Return Page Load-Time Improvements — **IN PROGRESS / PARTIALLY COMPLETE**
**Current status**
- Backend API calls are fast on server-side, but users reported **10–15 seconds** before customer/sales accounts appear in:
  - Sales Invoice
  - Purchase Invoice
  - Sales Return
  - Purchase Return

**Hypothesis (root cause)**
- Large payloads + multiple parallel requests (customers/suppliers + inventory + accounts) cause noticeable client-side delay depending on network/device.

**User stories (Target)**
1. ✅/⬜ As a user, invoice/return forms open quickly and become usable without waiting for every list to preload.
2. ✅/⬜ As a user, customer/supplier selection appears quickly and search works.

**Implementation steps**
- Backend (Completed)
  - ✅ Added server-side search support to customer/supplier account endpoints in `routers/invoices.py`:
    - `/customer-accounts?organization_id=...&search=...`
    - `/supplier-accounts?organization_id=...&search=...`
- Frontend (Pending / optional enhancement)
  - ⬜ Convert customer/supplier selectors on invoice/return forms to **remote search** mode:
    - load a small default set (e.g., 50–100)
    - query server as user types
  - ⬜ Defer heavy reference-data fetches (inventory/services) until user opens the line-item selector.

**Success criteria (Not fully re-verified on slow devices yet)**
- ⬜ Forms become interactive in < 2–3 seconds on typical connections.

---

## Phase 3: Exchange Rate Simplification (USD/LBP only) — **COMPLETED**
**User stories (Delivered)**
1. ✅ As a user, I only see USD and LBP currency options where used.
2. ✅ As a user, the app automatically uses the latest saved LBP/USD rate.

**Implementation steps (Completed)**
- Backend:
  - ✅ Confirmed `GET /exchange-rates/latest?organization_id=...` returns latest `{rate}`.
- Frontend:
  - ✅ Removed dependency on `currencies/active` where not needed.
  - ✅ Standardized currencies to `[USD, LBP]` in Voucher Entry and Cr/Db Notes.
  - ✅ Voucher Entry uses latest exchange rate when loading.
  - ✅ Sales/Purchase invoices use USD/LBP-only list.

**Success criteria (Met)**
- ✅ No extra currencies appear; latest exchange rate is used.

---

## Phase 4: Sales Return Module (POC → V1) — **COMPLETED**
**User stories (Delivered)**
1. ✅ Standalone Sales Return (no invoice reference required).
2. ✅ Partial quantities supported.
3. ✅ Posting creates voucher entries.
4. ✅ Posting adds returned quantities back to inventory.
5. ✅ Unpost supported (restricted to super_admin).

**Implementation steps (Completed)**
- Backend:
  - ✅ `sales_returns` collection + CRUD + post/unpost.
  - ✅ numbering: `SR-YYYY-#####`; voucher numbering: `SRV-YYYY-#####`.
- Frontend:
  - ✅ `SalesReturnPage` with list, create/edit modal, post/unpost.
  - ✅ Route + sidebar nav.

---

## Phase 5: Purchase Return Module (POC → V1) — **COMPLETED**
**User stories (Delivered)**
1. ✅ Standalone Purchase Return.
2. ✅ Partial quantities supported.
3. ✅ Posting creates voucher entries.
4. ✅ Posting reduces inventory quantities.
5. ✅ Unpost supported (restricted to super_admin).

**Implementation steps (Completed)**
- Backend:
  - ✅ `purchase_returns` collection + CRUD + post/unpost.
  - ✅ numbering: `PR-YYYY-#####`; voucher numbering: `PRV-YYYY-#####`.
- Frontend:
  - ✅ `PurchaseReturnPage` with list, create/edit modal, post/unpost.
  - ✅ Route + sidebar nav.

---

## Phase 6: Testing & Verification — **COMPLETED (with ongoing perf follow-up)**
**Verified**
- ✅ Vouchers and Cr/Db Notes no longer freeze.
- ✅ Returns modules CRUD + post/unpost works.
- ✅ Movable accounts endpoint fixed; selectors now populate.
- ✅ UI account selector performance improved via 100-item render cap.

**Perf follow-up**
- ⬜ Re-test invoice/return page load time on representative slow device/network after implementing remote search + deferred loading.

---

## Post-Completion / Optional Next Enhancements (Backlog)
1. **VAT reversal parity**: ensure returns posting mirrors the full 4-line VAT posting scheme used by invoices (if required in your COA structure).
2. **Remote search for customer/supplier selectors** (true async typeahead): avoid preloading 1000 customers.
3. **Remote search for movable accounts**: fetch accounts from `/accounts/movable/list?search=...` instead of loading ~3,800 upfront.
4. **Inventory batch logic**: adjust per-batch quantities if expiry/batch tracking is enabled.
5. **UI polish**: print/export for returns if desired.
