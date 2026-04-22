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
- **Default Posting Accounts** in Settings (per org, 7 accounts, searchable dropdown)

## Recent Changes (Current Session - Apr 2026)
- **Ledger Print Header**: Company header, no logo, "كشف حساب - Ledger Account", +4px fonts
- **Date-First Ledger Loading**: LedgerDialog + GeneralLedgerPage require "Load Ledger" click
- **Import from Organization**: Background async job with polling, 19 tables, batch insert
- **Deployment Fix**: Fixed DuplicateKeyError for inventory_items, added BulkWriteError handling
- **VAT/Tax Fix**: Changed `is_taxable` from `!== false` to `=== true`. Added Tax checkbox per line. Fixed Pydantic schemas for PurchaseInvoiceLineItem and PurchaseReturnLineItem.
- **Default Posting Accounts**: New Settings tab with 7 configurable accounts per org (Sales/Purchase VAT, Sales/Purchase Account, Sales/Purchase Return, Cash/Bank). Stored in `organization_settings` collection. Backend: GET/PUT `/api/settings/default-accounts`.

## Key Technical Notes
- `is_taxable` must use strict `=== true` check, NOT `!== false`
- Pydantic `extra="ignore"` silently strips unknown fields — always add new fields to schemas
- Organization routes in server.py, NOT organizations.py
- Route Shadowing: server.py overrides modular routers
- Default accounts stored in `organization_settings` collection with type="default_accounts"

## Backlog
### P0: Recalculate Balances for Trial Balance (account balance sync from vouchers)
### P1: Wire default accounts to auto-populate on new invoices
### P2: Box/Pkg/Qty to Purchase Invoice/Return, Email PDF invoices
### P3: Sales Quotations enhancements

## Credentials
- carlo.mitri@gmail.com / Carinemi@28
- Deployed: https://khayratna.com/
