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
- Import from Organization module (super_admin only): background job with polling

## Recent Changes (Current Session - Apr 2026)
- **Ledger Print Header**: Redesigned with company header (no logo), title "كشف حساب - Ledger Account", bilingual account info, +4px fonts
- **Date-First Ledger Loading**: LedgerDialog + GeneralLedgerPage now require "Load Ledger" click (like Journal)
- **Import from Organization**: 
  - New `/import-org` page (super_admin only)
  - Backend: Background async job with polling (`POST /execute` returns job_id, `GET /status/{job_id}` for polling)
  - 19 importable tables (accounts, inventory, vouchers, invoices, returns, POS, categories, regions, etc.)
  - Optimized for large datasets: pre-fetched duplicate detection, batch `insert_many` (500/batch), auto-created missing accounts
  - Successfully tested with 10,000 vouchers + 4,348 accounts
  - Date filter for transactional tables, duplicate skipping

## Key Technical Notes
- Organization routes in server.py, NOT organizations.py
- Voucher lines use account_code, NOT account_id
- Trust stored tax_amount — never recalculate
- Static routes before parameterized /{id} routes in FastAPI
- Route Shadowing: server.py overrides modular routers
- Import uses `asyncio.ensure_future` for background processing to avoid HTTP timeouts

## Backlog
### P0: Recalculate Balances for Trial Balance (account balance sync from vouchers)
### P2: Box/Pkg/Qty to Purchase Invoice/Return, Email PDF invoices
### P3: Sales Quotations enhancements

## Credentials
- carlo.mitri@gmail.com / Carinemi@28
- Deployed: https://khayratna.com/
