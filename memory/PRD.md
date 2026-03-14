# KAIROS - Digital Invoicing System

## Original Problem Statement
Lebanese accounting/invoicing SaaS (KAIROS) with React + FastAPI + MongoDB. Full accounting, invoicing, inventory, POS, exchange rates.

## Architecture
- **Frontend**: React (port 3000), Shadcn/UI, Recharts
- **Backend**: FastAPI (port 8001), MongoDB, routers in `/app/backend/routers/`
- **Auth**: JWT-based, role-based (super_admin, admin, accountant, cashier)

## Implemented Modules
- Chart of Accounts (LCOA), Fiscal Years
- Voucher Entry (journal, receipt, payment, sales, payroll)
- Sales & Purchase Invoices (rewritten clean, with print, post/unpost)
- Sales & Purchase Returns (with print)
- Credit/Debit Notes
- Inventory Management (CSV/DBF import, batch/expiry)
- POS Terminal (barcode scanner, quick items, cart, receipt print)
- Cashier System (sessions, PIN login, admin management)
- POS Daily Closing Report (admin-only, per-session breakdown, print)
- POS Sales Analytics Dashboard (trends, top items, cashier performance charts)
- Customer & Supplier Management (with VAT number, mirror account creation)
- Exchange Rates (USD/LBP simplified)
- Reports: Trial Balance, Income Statement, General Ledger
- 3 decimal places for all numeric formatting

## Changes Log

### March 14, 2026 (Session 4 - Bug Fix + Analytics)
- **CRITICAL BUG FIX: POS Transaction Posting** — Fixed `UnboundLocalError: uuid` caused by shadowed `import uuid` inside if-block in pos.py. POS transactions now post correctly for all payment methods (cash, card, on account).
- **VAT Accounting in POS** — Voucher now properly splits VAT into a separate Credit line to VAT Payable (442*) instead of including it in the sales total.
- **Discount Accounting in POS** — Invoice-level discounts create a separate Debit line to Sales Discount (721*). Payment adjustments at register also properly accounted.
- **Auto-account creation** — If VAT Payable (44210001) or Sales Discount (72110001) accounts don't exist, they're auto-created on first use.
- **POS Sales Analytics Dashboard** — New admin-only page at `/pos-analytics` with 3 backend endpoints, Recharts charts (trends, payment breakdown, top items, cashier performance), date range filter, period selector.
- **AccountSelector Refactored** — Extracted shared `RemoteAccountSelector` component.

### Prior Sessions
- Performance overhaul, Invoice pages rewrite, POS module integration
- Customer/Supplier creation with VAT & mirror accounts
- 3 decimal places, print for returns, selling_price in purchase invoice

## Known Issues
- Minor: React hydration warning in Dashboard (not blocking)

## Backlog
- P3: Dashboard hydration fix
