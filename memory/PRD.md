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
- Purchase Orders (full workflow, post as invoice, print, mobile-friendly)
- Credit/Debit Notes
- Inventory Management (CSV/DBF import, batch/expiry)
- POS Terminal (barcode scanner, quick items, cart, receipt print, void/delete transactions)
- POS Receipt Customization (logo, header/footer, printer width, live preview)
- Cashier System (sessions, PIN login, admin management)
- POS Daily Closing Report + POS Sales Analytics Dashboard
- Customer & Supplier Management (with VAT number, mirror account creation)
- Exchange Rates (USD/LBP simplified)
- Reports: Trial Balance, Income Statement, General Ledger

## Changes Log

### March 14, 2026 (Session 4)
- **POS Transaction Void (Soft Delete)** — New PUT /api/pos/invoices/{id}/void endpoint. Voids transaction with reason, reverses account balances and inventory, marks voucher as voided. Frontend: void dialog with reason input, "Show voided" filter in history, VOIDED badge with strikethrough, separate hard delete option.
- **POS Transaction Delete Fix** — Added missing DELETE endpoint
- **Purchase Orders Module** — Full CRUD + workflow + post as invoice
- **POS Transaction Bug Fix** — Fixed uuid error + VAT/discount accounting
- **POS Receipt Customization** — Settings dialog with logo, header, footer, printer width
- **POS Sales Analytics Dashboard** — Charts for trends, top items, cashier performance
- **AccountSelector Refactored** — Shared RemoteAccountSelector component

## Known Issues
- Minor: React hydration warning in Dashboard (not blocking)

## Backlog
- P3: Dashboard hydration fix
