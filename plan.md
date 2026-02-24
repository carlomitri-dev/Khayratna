# plan.md — Fiscal Year (FY) Management for KAIROS

## 1) Objectives
- Add per-organization Fiscal Years with **custom date ranges**.
- Provide **global FY selector** (header) that drives data shown across pages.
- Enforce **posting controls**: voucher/invoice transaction dates must fall within an **Open** FY.
- Implement **Year-End Closing**:
  - Close/lock FY (no new postings/edits in that FY)
  - Post closing entries: **Classes 6 & 7 → Retained Earnings (code 120)**
  - Create/initialize next FY opening balances (carry forward Classes 1–5)
- Update **Trial Balance / Income Statement / General Ledger** to filter by selected FY.

---

## 2) Implementation Steps

### Phase 1 — Core FY POC (isolation, prove accounting logic end-to-end)
**Goal:** Prove the hardest part works: FY selection + posting validation + closing logic + report filtering.

**POC User Stories**
1. As an admin, I can create an FY with a custom start/end date for my organization.
2. As a user, I cannot post a voucher dated outside the currently open FY.
3. As an admin, I can close an FY and the system generates closing entries into Retained Earnings.
4. As a user, once FY is closed, I cannot add/edit vouchers/invoices dated inside that FY.
5. As an admin, I can open the next FY and see opening balances carried forward.

**Backend (POC scope, minimal UI changes)**
- Data model (Mongo): `fiscal_years`
  - fields: `id, organization_id, name, start_date, end_date, status(open|closed), closed_at, closed_by, created_at`
  - optional: `is_current` (or derive current by selector)
- Add POC endpoints in `server.py` (then later refactor into router):
  - `POST /api/fiscal-years` create
  - `GET /api/fiscal-years?organization_id=...`
  - `POST /api/fiscal-years/{fy_id}/close` (closing routine)
- Posting validation (POC):
  - Add helper `get_open_fy_for_date(org_id, date)`
  - On voucher creation + sales/purchase invoice creation: validate date ∈ open FY.
- Closing routine (POC logic):
  - Compute net income for FY date range from vouchers (and/or posted invoices if they generate vouchers).
  - Create a closing voucher dated `fy.end_date` that:
    - Closes revenue/expense totals to account 120 (Retained Earnings)
  - Mark FY `status=closed`.
  - Create next FY (optional in POC) or store carry-forward snapshot for next FY opening.
- Report filtering (POC):
  - Update report endpoints to accept `fy_id` OR `start_date/end_date` and filter by voucher `date`.

**POC Validation Script (Python)**
- Add `/app/backend/tests/test_fy_poc.py` that:
  - Creates org + FY
  - Posts a voucher inside FY (success)
  - Posts a voucher outside FY (fails)
  - Runs close FY, asserts closing voucher created and FY locked
  - Fetches trial balance for FY and asserts totals are consistent

**Checkpoint:** Do not proceed until POC script passes.

---

### Phase 2 — V1 App Development (backend + frontend integration)

**V1 User Stories**
1. As a user, I can pick an FY from a global dropdown and all pages use it.
2. As an admin, I can manage FYs (create/edit/close) from Settings.
3. As a user, when I try to post outside an open FY, I see a clear error and guidance.
4. As an admin, I can close an FY via UI with a confirmation dialog and summary.
5. As a user, reports (TB/IS/GL) automatically reflect the selected FY date range.

**Backend (productionizing POC)**
- Create `models/schemas.py` additions: `FiscalYearCreate/Update/Response`, `FiscalYearCloseRequest/Response`.
- Add new router: `/app/backend/routers/fiscal_years.py` with CRUD + close.
- Centralize FY utilities:
  - `utils/fiscal_year.py` (date range checks, overlap checks, status rules)
- Enforce validations across modules:
  - Vouchers: create/update/post actions must validate FY
  - Sales/Purchase invoices: validate invoice date; if invoices generate vouchers, ensure voucher uses same date
- Locking behavior:
  - Disallow edits/deletes for documents dated in closed FY
  - Optional: allow super_admin override flag (configurable later)
- Reports:
  - Update `reports.py` endpoints to accept `fy_id` and derive `start/end`.

**Frontend**
- Global FY selector:
  - Add `FiscalYearContext` (or extend existing context) to store `selectedFY` per organization (persist in localStorage).
  - Add selector UI into `components/Layout.jsx` header near org selector.
- Settings integration:
  - Add Settings sub-section/tab: “Fiscal Years”
  - List FYs, create modal, edit, close button with confirmation + close summary.
- Data fetching updates:
  - Append `fy_id` to relevant API calls for reports + list pages that must filter.
  - For vouchers/invoices lists: default filter by selected FY (with optional override toggle later).
- UX states:
  - If no FY exists: banner prompting admin to create FY.
  - If selected FY is closed: show “Read-only FY” badge.

**End of Phase 2:** Run one E2E pass (seed → create FY → post voucher → close FY → run reports).

---

### Phase 3 — Testing, Hardening, and Backward Compatibility

**Hardening User Stories**
1. As a user, switching organizations updates FY list and keeps selection consistent.
2. As an admin, I cannot create overlapping FY ranges for the same organization.
3. As a user, I can still view historical data in closed FY without errors.
4. As an admin, closing an FY is idempotent and safe if re-clicked.
5. As an auditor, reports match totals before/after closing (no drift).

**Backend tests**
- Add pytest coverage:
  - FY overlap rules
  - Posting validation for vouchers/invoices
  - Close FY accounting entry correctness
  - Report filtering by FY
- Data migration strategy:
  - For existing orgs with historical vouchers: create a default FY that covers min/max dates or require admin action.

**Frontend tests/QA**
- Manual QA checklist across key pages with FY switch.
- Verify error banners/messages are understandable.

---

## 3) Next Actions
1. Implement Phase 1 POC endpoints + FY collection + validation helpers.
2. Add `test_fy_poc.py` and iterate until it passes.
3. Implement routers + schemas + enforce FY validation across vouchers/invoices.
4. Add global FY selector + Settings FY management UI.
5. Update reports + list pages to respect selected FY.

---

## 4) Success Criteria
- Users can create FYs with custom ranges per organization; overlaps are prevented.
- Posting a voucher/invoice outside an open FY is blocked with clear messaging.
- Closing an FY creates correct closing voucher to Retained Earnings and locks the FY.
- Selected FY in header consistently filters Trial Balance, Income Statement, General Ledger (and relevant lists).
- Automated tests for FY POC + validations pass; no regressions in core modules.
