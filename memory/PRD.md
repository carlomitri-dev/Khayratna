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
- POS Receipt Customization (logo, header, footer, printer width, font size, live preview)
- Cashier System (sessions, PIN login, admin management)
- POS Daily Closing Report (admin-only, per-session breakdown, print)
- POS Sales Analytics Dashboard (trends, top items, cashier performance charts)
- Customer & Supplier Management (with VAT number, mirror account creation)
- Exchange Rates (USD/LBP simplified)
- Reports: Trial Balance, Income Statement, General Ledger
- 3 decimal places for all numeric formatting

## Changes Log

### March 14, 2026 (Session 4)
- **POS Transaction Bug Fix** — Fixed `UnboundLocalError: uuid` in pos.py. Added proper VAT/discount accounting in voucher posting.
- **POS Sales Analytics Dashboard** — New page at `/pos-analytics` with Recharts charts.
- **POS Receipt Customization** — New receipt settings dialog with: store logo upload (base64), store name (en/ar), address, phone, VAT number, custom footer (en/ar), printer width (58/72/80mm), font size, barcode/VAT toggles, live preview. Backend: `/api/receipt-settings` CRUD + `/api/receipt-settings/logo` upload.
- **AccountSelector Refactored** — Extracted shared `RemoteAccountSelector` component.

### Prior Sessions
- Performance overhaul, Invoice pages rewrite, POS module integration
- Customer/Supplier creation with VAT & mirror accounts
- 3 decimal places, print for returns, selling_price in purchase invoice

## Known Issues
- Minor: React hydration warning in Dashboard (not blocking)

## Backlog
- P3: Dashboard hydration fix
