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
- Sales & Purchase Returns (new modules)
- Inventory management with CSV/DBF import
- Exchange rate simplification (USD/LBP only)
- Performance optimization: remote search for account selectors
- Credit/Debit notes with attachments
- POS system, Cashier sessions
- Image archive

## Recent Changes (March 2026)
1. **Inventory table alignment fix** - Removed duplicate "Name" header (was 11 headers, 10 data columns)
2. **Performance fix (P0)** - Removed duplicate endpoints from server.py that were overriding optimized router versions:
   - `/accounts/movable/list` - now uses aggregation pipeline with search/limit
   - `/customer-accounts` - now uses proper search with limit 100
   - `/supplier-accounts` - now uses proper search with limit 100
   - `/sales-accounts` and `/purchase-accounts` - deduplication

## Known Issues
- Minor dropdown z-index conflict in header (fiscal year selector) - low priority
- server.py still has many legacy endpoints that duplicate router files - needs full audit

## Backlog
- P2: Full audit of remaining duplicate endpoints in server.py
- P2: Extract shared AccountSelector component from inline implementations in VoucherEntry/CrDbNotes
- P3: Minor UI z-index fix for header dropdown
