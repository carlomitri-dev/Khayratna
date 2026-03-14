# KAIROS - Digital Invoicing System

## Original Problem Statement
Lebanese accounting/invoicing SaaS application (KAIROS) built with React + FastAPI + MongoDB. Supports chart of accounts (LCOA), vouchers, sales/purchase invoices, inventory management, POS, exchange rates (USD/LBP), and more.

## Core Requirements
- Multi-currency accounting (USD/LBP) with exchange rate management
- Chart of Accounts (Lebanese standard)
- Voucher entry (journal, receipt, payment, sales, payroll)
- Sales & Purchase invoices with VAT support
- Inventory management with batch/expiry tracking
- POS system for cashiers
- Credit/Debit notes
- Sales & Purchase Returns
- Fiscal year management
- Reports: Trial Balance, Income Statement, General Ledger

## Architecture
- **Frontend**: React (port 3000), Shadcn/UI components
- **Backend**: FastAPI (port 8001), MongoDB
- **Auth**: JWT-based, role-based access (super_admin, admin, accountant, cashier)
- **Routing**: Backend routes in `/app/backend/routers/`, legacy endpoints in `server.py`

## What's Been Implemented
- Full accounting module (vouchers, accounts, fiscal years)
- Sales & Purchase invoices with posting/unposting
- Sales & Purchase Returns
- Inventory management with CSV/DBF import
- Exchange rate simplification (USD/LBP only)
- Performance optimization: remote search for account selectors
- Credit/Debit notes with attachments
- POS system, Cashier sessions
- Image archive
- Customer & Supplier management with VAT number + Add new

## Recent Changes (March 14, 2026)
1. **3 Decimal Places** — Updated `formatUSD()` and all `.toFixed(2)` across the app to use 3 decimal digits
2. **Sales Invoice** — Removed service items from line items; parts (used items from inventory) remain
3. **Purchase Invoice** — Removed service items, removed "Copy from Sales Invoice" feature, added "Sell Price" column to line items. When posted, updates both `cost` and `price` in inventory
4. **Customer Module** — Added "Add Customer" button with form (code, name, name_ar, VAT number, contact info). Auto-creates `4114xxxx` VAT mirror account
5. **Supplier Module** — Added "Add Supplier" button with form (code, name, name_ar, VAT number, contact info). Auto-creates `4014xxxx` VAT mirror account
6. **VAT Number** — Added to Customer/Supplier tables, view dialogs, edit dialogs, and backend schema
7. **Duplicate Endpoint Cleanup** — Removed duplicate POST /accounts, /customers, /suppliers, /contact-info, /accounts/movable/list, /customer-accounts, /supplier-accounts, /sales-accounts, /purchase-accounts from server.py
8. **Inventory Table Fix** — Fixed header/data column misalignment (removed duplicate "Name" header)
9. **Performance Fix** — Removed 5 duplicate endpoints from server.py that were overriding optimized router versions

## Known Issues
- Minor dropdown z-index conflict in header (fiscal year selector) - low priority
- server.py still has some legacy endpoints that may duplicate router files

## Backlog
- P2: Full audit of remaining duplicate endpoints in server.py
- P2: Extract shared AccountSelector component from inline implementations
- P3: Minor UI z-index fix for header dropdown
