# KAIROS Digital Invoicing - Product Requirements Document

## Original Problem Statement
Comprehensive invoicing and accounting system (Lebanese Accounting) with support for:
- Sales/Purchase Invoices, Returns, Journal, Trial Balance, General Ledger, Inventory Management
- Box, Package, and Quantity metrics on items
- Cross-organization data import with table-level selection, background polling, and date filters
- Dynamic Default Posting Accounts per organization that auto-populate when creating new invoices/returns

## Tech Stack
- Frontend: React + Shadcn UI
- Backend: FastAPI (Python)
- Database: MongoDB
- PDF: html2pdf.js

## Completed Features
- Full Chart of Accounts (Lebanese standard, Class 1-7)
- Sales/Purchase Invoices with line items, VAT, discounts
- Sales/Purchase Returns
- Journal/Vouchers with debit/credit lines
- Trial Balance, Income Statement, General Ledger
- POS Terminal with cashier sessions
- Inventory management with categories
- Customer/Supplier management with contact info
- Fiscal Year management
- Currency management with exchange rates
- Backup/Restore functionality
- Ledger Account custom print header (no logo, larger font, Arabic/English)
- Date-first required filtering for General Ledger
- Cross-organization data import module with table selection and date filters
- Background polling job for data import (10,000+ records)
- Fixed DuplicateKeyError during inventory import
- Fixed Purchase Invoice VAT logic (is_taxable per line item)
- Tax checkbox per line item on all invoice/return forms
- Fixed Pydantic schema for is_taxable on Purchase Invoices/Returns
- **Default Accounts Settings tab with 7 searchable dropdowns (DONE)**
- **Auto-population of Default Accounts in invoice/return creation forms (DONE - Apr 22, 2026)**

## Architecture
/app/
├── backend/
│   ├── models/schemas.py
│   ├── routers/ (accounts, invoices, import_org, etc.)
│   └── server.py (main API + catch-all routes)
└── frontend/
    └── src/
        ├── components/selectors/AccountSelector.jsx
        ├── pages/SettingsPage.jsx (Default Accounts tab)
        └── pages/*InvoicePage.jsx, *ReturnPage.jsx

## Key API Endpoints
- GET/PUT /api/settings/default-accounts - Manage default posting accounts
- GET /api/accounts - List accounts with search/pagination
- POST /api/import-org/execute - Trigger cross-org import
- GET /api/import-org/status/{job_id} - Poll import status

## Default Account Mapping
- Sales Invoice: credit_account_id ← sales_account
- Purchase Invoice: debit_account_id ← purchase_account
- Sales Return: debit_account_id ← sales_return_account
- Purchase Return: credit_account_id ← purchase_return_account

## Pending Issues
- P1: "الرصيد:" balance label incorrect on Print Template (SalesInvoicePrint.jsx)
- P2: Recalculate Balances endpoint for Trial Balance sync

## Upcoming Tasks
- Apply Box/Pkg/Qty to Purchase Forms (P2)
- Email PDF invoices to customers (P1)
- Sales Quotations workflow enhancements (P2)

## Refactoring Needed
- Move remaining routes from bloated server.py into dedicated router files
- server.py catch-all routes cause route shadowing issues
