# KAIROS - Digital Invoicing System

## Original Problem Statement
Lebanese accounting/invoicing SaaS (KAIROS) with React + FastAPI + MongoDB. Full accounting, invoicing, inventory, POS, exchange rates.

## Architecture
- **Frontend**: React (port 3000), Shadcn/UI
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
- Customer & Supplier Management (with VAT number)
- Exchange Rates (USD/LBP simplified)
- Reports: Trial Balance, Income Statement, General Ledger
- 3 decimal places for all numeric formatting

## Changes Log

### March 14, 2026 (Session 3)
- **POS Module Connected** — Wired up 4 existing POS pages (POSPage, CashierPOSPage, CashierSessionsPage, CashierLoginPage) with routes in App.js and sidebar navigation
- **POS Router Included** — Added POS router to server.py (was missing)
- **POS Endpoint Cleanup** — Removed ~605 lines of duplicate POS endpoints from server.py
- **POS Inventory Endpoint** — Added missing GET /api/pos/inventory to routers/pos.py

### March 14, 2026 (Session 2)
- Invoice pages rewrite, print for returns, selling_price in purchase invoice

### March 14, 2026 (Session 1)
- 3 decimal places, service removal, customer/supplier add with VAT, inventory fix, performance fix

## Known Issues
- Minor: React hydration warning in Dashboard (not blocking)
- Minor: Dropdown z-index conflict in header

## Backlog
- P2: Full audit of remaining duplicate endpoints in server.py
- P2: Extract shared AccountSelector component
- P3: Dashboard hydration fix
