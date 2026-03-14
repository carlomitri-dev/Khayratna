# KAIROS - Digital Invoicing System

## Original Problem Statement
Lebanese accounting/invoicing SaaS (KAIROS) with React + FastAPI + MongoDB. Full accounting, invoicing, inventory, POS, exchange rates.

## Architecture
- **Frontend**: React (port 3000), Shadcn/UI, Recharts
- **Backend**: FastAPI (port 8001), MongoDB, modular routers in `/app/backend/routers/`
- **Auth**: JWT-based, role-based (super_admin, admin, accountant, cashier)

## Implemented Modules
- Chart of Accounts (LCOA), Fiscal Years
- Voucher Entry (journal, receipt, payment, sales, payroll)
- Sales & Purchase Invoices (with print, post/unpost)
- Sales & Purchase Returns (with print)
- **Purchase Orders** (full workflow: draft→approved→sent→received→posted as Purchase Invoice, print, mobile-friendly, serial numbering, low stock suggestions)
- Credit/Debit Notes
- Inventory Management (CSV/DBF import, batch/expiry)
- POS Terminal (barcode scanner, quick items, cart, receipt print)
- POS Receipt Customization (logo, header/footer, printer width, live preview)
- Cashier System (sessions, PIN login, admin management)
- POS Daily Closing Report + POS Sales Analytics Dashboard
- Customer & Supplier Management (with VAT number, mirror account creation)
- Exchange Rates (USD/LBP simplified)
- Reports: Trial Balance, Income Statement, General Ledger
- 3 decimal places for all numeric formatting

## Changes Log

### March 14, 2026 (Session 4)
- **Purchase Orders Module** — Full CRUD + workflow + post as invoice. Backend: 8 endpoints (create, list, get, update, status transitions, post, delete, low-stock suggestions). Frontend: list page with desktop table + mobile cards, form with supplier/type/line items/discount/VAT/notes, view dialog with status actions, post dialog with account selectors, print. Serial numbering (PO-YYYY-XXXXX). Auto inventory update + voucher creation on posting.
- **POS Transaction Bug Fix** — Fixed `UnboundLocalError: uuid`. Added proper VAT/discount accounting in vouchers.
- **POS Receipt Customization** — Settings dialog with logo upload, store info, footer, printer width, font size, live preview.
- **POS Sales Analytics Dashboard** — Charts for trends, top items, cashier performance.
- **AccountSelector Refactored** — Shared `RemoteAccountSelector` component.

### Prior Sessions
- Performance overhaul, Invoice pages rewrite, POS module integration
- Customer/Supplier creation with VAT & mirror accounts
- 3 decimal places, print for returns, selling_price in purchase invoice

## Known Issues
- Minor: React hydration warning in Dashboard (not blocking)

## Backlog
- P3: Dashboard hydration fix
