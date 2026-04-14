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
- Per-line-item Tax checkbox on Purchase Invoice, Sales Invoice, Sales Return

## Recent Changes (Current Session - Apr 2026)
- **Ledger Print Header**: Redesigned with company header (no logo), title "كشف حساب - Ledger Account", bilingual account info, +4px fonts
- **Date-First Ledger Loading**: LedgerDialog + GeneralLedgerPage require "Load Ledger" click
- **Import from Organization**: Background async job with polling, 19 tables, batch insert, duplicate skipping
- **Deployment Fix**: Fixed DuplicateKeyError for inventory_items (wrong dup field), added BulkWriteError handling
- **VAT/Tax Fix**: Changed `is_taxable` logic from `!== false` (defaulting to taxable) to `=== true` (strict). Added Tax checkbox per line item on all 3 invoice/return forms. Empty lines default to `is_taxable: false`.

## Key Technical Notes
- `is_taxable` must use strict `=== true` check, NOT `!== false` (inventory items may not have the field)
- Organization routes in server.py, NOT organizations.py
- Voucher lines use account_code, NOT account_id
- Trust stored tax_amount — never recalculate
- Route Shadowing: server.py overrides modular routers
- Import uses asyncio.ensure_future for background processing

## Backlog
### P0: Recalculate Balances for Trial Balance (account balance sync from vouchers)
### P2: Box/Pkg/Qty to Purchase Invoice/Return, Email PDF invoices
### P3: Sales Quotations enhancements

## Credentials
- carlo.mitri@gmail.com / Carinemi@28
- Deployed: https://khayratna.com/
