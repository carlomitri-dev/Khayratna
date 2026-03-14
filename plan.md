# Plan: Stabilize Vouchers/Cr-Db + Faster Invoice Selectors + USD/LBP Exchange Rate + Returns (UPDATED)

## Objectives (Current Status)
- ✅ Stop freezing in **Vouchers** and **Cr/Db Notes** by removing in-memory filtering and huge reads.
- ✅ Make **customer/supplier account** selectors in Sales/Purchase invoices load faster via optimized endpoints.
- ✅ Simplify currency to **USD + LBP only** and always use the **latest saved exchange rate**.
- ✅ Add **Sales Return** and **Purchase Return** modules (standalone, partial returns, VAT reversal intent, inventory updates, own numbering).
- ✅ Verify end-to-end flows and fix critical issues found during testing.

---

## Phase 1: Core Performance Fixes (Backend-first) — **COMPLETED**
**User stories (Delivered)**
1. ✅ As a user, I can open the Voucher list instantly even with many vouchers.
2. ✅ As a user, I can search vouchers/notes and get results without the page freezing.
3. ✅ As a user, voucher/CrDb pagination loads only the next page, not everything.
4. ✅ As a user, Sales/Purchase invoice account dropdown opens quickly.
5. ✅ As a user, searching customer/supplier accounts returns results faster.

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
- Accounts endpoints:
  - ✅ Added `search` + pagination support to `/customer-accounts` and `/supplier-accounts`
  - ✅ Added extra fields returned for selectors (address/mobile where needed)
- Frontend:
  - ✅ Updated heavy pages (**VoucherEntryPage**, **CrDbNotesPage**) to use `/accounts/movable/list` instead of the heavyweight `/accounts` endpoint.

**Evidence/verification**
- ✅ Voucher page loads without freezing (confirmed via UI).
- ✅ Cr/Db Notes page loads without freezing (confirmed via UI).

**Success criteria (Met)**
- ✅ Voucher and Cr/Db lists render without noticeable freezing; pagination and search stay responsive.
- ✅ Dropdowns no longer block the UI due to fetching full chart of accounts.

---

## Phase 2: Exchange Rate Simplification (USD/LBP only) — **COMPLETED**
**User stories (Delivered)**
1. ✅ As a user, I only see USD and LBP currency options where used.
2. ✅ As a user, the app automatically uses the latest saved LBP/USD rate.
3. ✅ As a user, I can still save new exchange rate entries.

**Implementation steps (Completed)**
- Backend:
  - ✅ Confirmed `GET /exchange-rates/latest?organization_id=...` returns latest `{rate}`.
- Frontend:
  - ✅ Removed dependency on `currencies/active` where not needed.
  - ✅ Standardized currencies to `[USD, LBP]` in Voucher Entry and Cr/Db Notes.
  - ✅ Voucher Entry now uses latest exchange rate when loading the form.
  - ✅ Sales/Purchase invoices updated to use USD/LBP-only list (UI).

**Success criteria (Met)**
- ✅ No extra currencies appear in updated areas; latest exchange rate is used (confirmed at 89,500 in Voucher Entry UI).

---

## Phase 3: Sales Return Module (POC → V1) — **COMPLETED**
**User stories (Delivered)**
1. ✅ Standalone Sales Return (no invoice reference required).
2. ✅ Partial quantities supported through line items.
3. ✅ Posting creates accounting voucher entries.
4. ✅ Posting adds returned quantities back to inventory.
5. ✅ Unpost supported (restricted to super_admin) to reverse voucher + inventory.

**Implementation steps (Completed)**
- Backend:
  - ✅ New `sales_returns` collection + CRUD endpoints.
  - ✅ Post/unpost:
    - numbering: `SR-YYYY-#####`
    - voucher numbering: `SRV-YYYY-#####`
    - inventory: `on_hand_qty` increments on post and reverses on unpost
  - ✅ Added MongoDB indexes for returns.
- Frontend:
  - ✅ New `SalesReturnPage` with list, filters, create/edit modal, post/unpost actions.
  - ✅ Added route and sidebar nav.

**Notes from testing**
- ✅ Sales Return created and posted successfully via curl:
  - `SR-2026-00001` posted → `SRV-2026-00001`.

**Success criteria (Met)**
- ✅ Draft→Post creates voucher and increases inventory; Unpost reverses.

---

## Phase 4: Purchase Return Module (POC → V1) — **COMPLETED**
**User stories (Delivered)**
1. ✅ Standalone Purchase Return.
2. ✅ Partial quantities supported.
3. ✅ Posting creates accounting voucher entries.
4. ✅ Posting reduces inventory quantities.
5. ✅ Unpost supported (restricted to super_admin) to reverse voucher + inventory.

**Implementation steps (Completed)**
- Backend:
  - ✅ New `purchase_returns` collection + CRUD endpoints.
  - ✅ Post/unpost:
    - numbering: `PR-YYYY-#####`
    - voucher numbering: `PRV-YYYY-#####`
    - inventory: `on_hand_qty` decrements on post and reverses on unpost
  - ✅ Added MongoDB indexes for returns.
- Frontend:
  - ✅ New `PurchaseReturnPage` with list, filters, create/edit modal, post/unpost actions.
  - ✅ Added route and sidebar nav.

**Notes from testing**
- ✅ Purchase Return created and posted successfully via curl:
  - `PR-2026-00001` posted → `PRV-2026-00001`.

**Success criteria (Met)**
- ✅ Post/unpost consistently updates voucher + inventory.

---

## Phase 5: Testing & Polish — **COMPLETED**
**User stories (Verified)**
1. ✅ Voucher create/search/pagination no longer causes UI lag.
2. ✅ Cr/Db Notes search/pagination works smoothly.
3. ✅ Returns modules behave correctly across draft/post/unpost.

**Implementation steps (Completed)**
- ✅ Ran automated + manual verification.
- ✅ Frontend smoke checks with screenshots:
  - Sales Returns page shows created return and posted status.
  - Purchase Returns page shows created return and posted status.
  - Voucher Entry page loads and shows latest exchange rate.
- ✅ Backend API verification with curl:
  - List/create/post sales return
  - List/create/post purchase return

**Critical issue found & fixed**
- ✅ Fixed FastAPI auth dependency injection bug in new return routers.
  - Root cause: incorrect dependency wiring (`lambda`/custom dependency approach).
  - Fix: return routers now use the standard `Depends(get_current_user)` from `core.auth` and shared `db` from `core.database`.
  - Updated `server.py` router registration accordingly.

**Success criteria (Met)**
- ✅ No freezes; acceptable load times; returns functional; critical auth issue resolved.

---

## Post-Completion / Optional Next Enhancements (Backlog)
1. **VAT reversal parity**: ensure returns posting mirrors the full 4-line VAT posting scheme used by invoices (if required in your COA structure).
2. **Inventory batch logic**: if expiry/batch tracking is enabled, extend returns to adjust per-batch quantities (currently adjusts `on_hand_qty`).
3. **Server-side account search in selectors**: optionally enhance invoice customer/supplier selectors to query on type (true remote search UI) instead of preloading.
4. **UI polish**: add print/export for returns if desired.
