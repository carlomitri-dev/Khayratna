# Plan: Stabilize Vouchers/Cr-Db + Faster Invoice Selectors + USD/LBP Exchange Rate + Returns

## Objectives
- Stop freezing in **Vouchers** and **Cr/Db Notes** by removing in-memory filtering and huge reads.
- Make **customer/supplier account** selectors in Sales/Purchase invoices load fast via server-side search.
- Simplify currency to **USD + LBP only** and always use the **latest saved exchange rate**.
- Add **Sales Return** and **Purchase Return** modules (standalone, partial returns, VAT reversal, inventory updates, own numbering).

---

## Phase 1: Core Performance Fixes (Backend-first)
**User stories**
1. As a user, I can open the Voucher list instantly even with many vouchers.
2. As a user, I can search vouchers/notes and get results without the page freezing.
3. As a user, voucher/CrDb pagination loads only the next page, not everything.
4. As a user, Sales/Purchase invoice account dropdown opens quickly.
5. As a user, searching customer/supplier accounts returns results as I type.

**Implementation steps**
- Backend (server.py and routers):
  - **Vouchers**: replace `.to_list(10000)` + Python filtering with MongoDB query:
    - `$or` regex on `voucher_number`, `reference`, `description`
    - keep `skip/limit` in DB query
    - `/vouchers/count` uses `count_documents` with same query (no full scan)
  - **CrDb Notes**: same optimization for `/crdb-notes` and `/crdb-notes/count`.
  - Add/ensure indexes (Mongo) for common filters:
    - `vouchers: organization_id + date/created_at + voucher_number`
    - `crdb_notes: organization_id + date/created_at + note_number`
- Accounts endpoints for selectors:
  - Add `search` + `limit` + `skip` support to `/customer-accounts` and `/supplier-accounts`.
  - Keep “leaf-only” behavior for customers but compute leaf efficiently (aggregation) or cache leaf flags.
- Frontend:
  - Update SalesInvoicePage/PurchaseInvoicePage selectors to **query server by search** (debounced) instead of loading full list.

**Next actions**
- Implement voucher + crdb query changes first and verify with seeded large datasets.
- Add account search endpoints and wire selectors.

**Success criteria**
- Voucher and Cr/Db lists render without noticeable freezing; pagination and search stay responsive.
- Customer/supplier dropdown opens quickly and returns search results within ~1s.

---

## Phase 2: Exchange Rate Simplification (USD/LBP only)
**User stories**
1. As a user, I only see USD and LBP currency options everywhere.
2. As a user, the app automatically uses the latest saved LBP/USD rate.
3. As a user, posting vouchers/invoices uses the same latest rate consistently.
4. As a user, I can still manually save a new exchange rate entry.
5. As a user, offline mode uses the last cached rate.

**Implementation steps**
- Backend:
  - Treat exchange rate module as the source of truth; add/confirm `GET /exchange-rates/latest?organization_id=...` returns `{rate, date}`.
- Frontend:
  - Replace “currencies/active” dependence where possible with a simple `[USD, LBP]` constant.
  - On opening Voucher/Sales/Purchase forms, fetch latest rate once and use it for conversions.
  - Ensure all conversions derive from **latest rate** (no org setting currency dependency).

**Next actions**
- Patch VoucherEntryPage conversions to use latest rate and only USD/LBP.
- Patch Sales/Purchase invoices line conversion logic similarly.

**Success criteria**
- No extra currencies appear; all conversions and postings consistently reflect latest exchange rate.

---

## Phase 3: Sales Return Module (POC → V1)
**User stories**
1. As a user, I can create a standalone Sales Return without referencing an invoice.
2. As a user, I can return partial quantities of items.
3. As a user, posting a Sales Return creates accounting entries reversing VAT logic.
4. As a user, posting a Sales Return adds returned quantities back to inventory (and batches if applicable).
5. As a user, I can unpost a Sales Return to revert voucher + inventory changes.

**Implementation steps**
- POC (core flow isolation):
  - Implement minimal backend endpoints for `sales_returns`:
    - create (draft), list, get, update, delete
    - post/unpost: generates voucher `SR-YYYY-#####`
    - voucher lines: reverse sales logic + VAT reversal (mirror existing invoice VAT scheme)
    - inventory: add back quantities (respect batch_id when present)
  - Minimal frontend page to create draft + post + list posted/draft.
- V1 app development:
  - Full page parity with invoice UI patterns (selectors, line items, totals, print-friendly basic view).
  - Add route + sidebar entry.

**Next actions**
- Build backend POC first; validate posting/unposting and inventory movements with manual tests.
- Then build the full UI around it.

**Success criteria**
- Draft→Post creates correct voucher and inventory increases; Unpost cleanly reverses both.

---

## Phase 4: Purchase Return Module (POC → V1)
**User stories**
1. As a user, I can create a standalone Purchase Return.
2. As a user, I can return partial quantities.
3. As a user, posting a Purchase Return reverses purchase voucher logic + VAT.
4. As a user, posting a Purchase Return reduces inventory quantities (and batches when applicable).
5. As a user, I can unpost a Purchase Return and restore inventory.

**Implementation steps**
- Backend: new `purchase_returns` collection + CRUD + post/unpost; numbering `PR-YYYY-#####`.
- Posting creates reversed purchase voucher lines and applies latest exchange rate.
- Inventory reduces on post; reverses on unpost.
- Frontend: PurchaseReturnPage with the same UX style as PurchaseInvoicePage.
- Add route + sidebar entry.

**Next actions**
- Implement backend POC then frontend UI.

**Success criteria**
- Post/unpost consistently updates voucher + inventory with correct totals and VAT reversal.

---

## Phase 5: Testing & Polish
**User stories**
1. As a user, I can run through voucher create/post/search without UI lag.
2. As a user, Cr/Db Notes search/pagination works smoothly.
3. As a user, invoice account selectors feel instant with type-to-search.
4. As a user, returns modules behave correctly across draft/post/unpost.
5. As an admin, I can verify balances/inventory counts match expectations after operations.

**Implementation steps**
- Add focused backend tests for query endpoints + post/unpost invariants.
- Run end-to-end manual flows:
  - large voucher/note list + search
  - invoice creation with fast account search
  - sales return + purchase return post/unpost
- Fix regressions and ensure existing invoices/vouchers remain compatible.

**Success criteria**
- No freezes; acceptable load times; returns fully functional; no regressions in posting/unposting logic.
