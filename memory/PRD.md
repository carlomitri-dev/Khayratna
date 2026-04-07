# Lebanese Accounting System - PRD

## Original Problem Statement
Full-scale invoicing and accounting system with modules for sales/purchase invoices, sales/purchase returns, chart of accounts, inventory management, data import/export, POS, and financial reports.

## What's Been Implemented
- Full CRUD for Sales/Purchase Invoices & Returns
- Box/Pkg/Qty calculation on Sales Invoice and Sales Return forms
- Print templates with customer data, registration numbers, account balances
- Journal module, Trial Balance with date filters, Data import/export, POS
- Last Price feature on Sales Invoice and Sales Return
- Ledger Account custom print header (matching invoice header style, no logo)
- Date-first Ledger loading (like Journal): LedgerDialog + General Ledger Page

## Recent Fixes (Current Session - Apr 2026)
- **Ledger Print Header**: Redesigned `buildLedgerHtml()` in `LedgerDialog.jsx` to use the same company header layout as the Sales Invoice print (English left, Arabic right, no center logo). Title changed to "كشف حساب - Ledger Account". Account info section added. Font sizes +4px.
- **Date-First Ledger Loading**: Modified `LedgerDialog.jsx` and `GeneralLedgerPage.jsx` so data does NOT auto-load. User must set dates and click "Load Ledger" first, same pattern as Journal page. Affects Customers, Suppliers, Chart of Accounts (LedgerDialog) and the General Ledger standalone page.

## Key Technical Notes
- Organization routes in server.py, NOT organizations.py
- Voucher lines use account_code, NOT account_id
- Trust stored tax_amount — never recalculate
- Static routes must be defined BEFORE parameterized /{id} routes in FastAPI
- AccountSelector in remote mode now auto-fetches by ID on mount
- Route Shadowing: server.py contains direct @api_router endpoints that override modular routers

## Backlog
### P0: Recalculate Balances for Trial Balance (account balance sync from vouchers)
### P2: Box/Pkg/Qty to Purchase Invoice/Return, Email PDF invoices
### P3: Sales Quotations enhancements

## Credentials
- carlo.mitri@gmail.com / Carinemi@28
- Deployed: https://khayratna.com/
