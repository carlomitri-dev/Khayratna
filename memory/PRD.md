# KAIROS - Digital Invoicing System

## Original Problem Statement
Lebanese accounting/invoicing SaaS application (KAIROS) built with React + FastAPI + MongoDB. Supports chart of accounts (LCOA), vouchers, sales/purchase invoices, inventory management, POS, exchange rates (USD/LBP), and more.

## Architecture
- **Frontend**: React (port 3000), Shadcn/UI components, AccountSelector + InventorySelector reusable components
- **Backend**: FastAPI (port 8001), MongoDB, routers in `/app/backend/routers/`
- **Auth**: JWT-based, role-based access (super_admin, admin, accountant, cashier)

## What's Been Implemented
- Full accounting module (vouchers, accounts, fiscal years)
- Sales & Purchase invoices with posting/unposting/printing (rewritten Mar 14)
- Sales & Purchase Returns with printing (print added Mar 14)
- Inventory management with CSV/DBF import
- Exchange rate simplification (USD/LBP only)
- Performance optimization: remote search for account selectors
- Credit/Debit notes with attachments
- POS system, Cashier sessions
- Customer & Supplier management with VAT number + Add new
- 3 decimal places for all numeric formatting

## Changes Log

### March 14, 2026 (Session 2)
- **Invoice Pages Rewrite** — Completely rewrote SalesInvoicePage and PurchaseInvoicePage from scratch using the clean pattern from the working Return pages
- **Print for Returns** — Added print functionality to both SalesReturnPage and PurchaseReturnPage
- **Duplicate Endpoint Cleanup** — Removed ~1000 lines of duplicate sales-invoices and purchase-invoices endpoints from server.py
- **Purchase Invoice selling_price** — Added selling_price field to purchase invoice line items (updates inventory price on posting)
- **No Service Items** — Removed service items from both invoice types
- **No Copy From** — Removed "Copy from Sales Invoice" from Purchase Invoice

### March 14, 2026 (Session 1)
- 3 decimal places for all numeric values
- Removed service items from invoices
- Added selling_price field to purchase invoice
- Customer/Supplier module: Add new with VAT number
- Inventory table alignment fix
- Performance fix: removed duplicate endpoints from server.py

## Known Issues
- Minor: React hydration warning (<tr> inside <span>) in Dashboard — not blocking
- Minor: dropdown z-index conflict in header (fiscal year selector)

## Backlog
- P2: Full audit of remaining duplicate endpoints in server.py
- P2: Extract shared AccountSelector logic
- P3: Minor UI z-index fix for header dropdown
