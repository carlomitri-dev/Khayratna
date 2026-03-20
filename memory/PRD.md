# Lebanese Accounting System - PRD

## Original Problem Statement
Full-scale invoicing and accounting system with modules for sales/purchase invoices, sales/purchase returns, chart of accounts, inventory management, data import/export, POS, and financial reports (Journal, Trial Balance). Built with React frontend + FastAPI backend + MongoDB.

## Core Modules
- Sales Invoices (with Box/Pkg/Qty system)
- Purchase Invoices
- Sales Returns (with Box/Pkg/Qty system)
- Purchase Returns
- Journal (all posted vouchers, unbalanced filter)
- Trial Balance (date filters, orphan-code checker)
- Chart of Accounts
- Inventory Management
- POS
- Settings (data cleanup utilities)

## What's Been Implemented

### Completed Features
- Full CRUD for Sales/Purchase Invoices & Returns
- Box/Pkg/Qty calculation system on Sales Invoice and Sales Return forms
- Print templates with customer data, registration numbers, account balances
- Journal module with unbalanced voucher filter
- Trial Balance with date-range filtering and orphan-code check
- Data import/export (CSV)
- Fiscal year management
- Organization cleanup utility
- html2pdf.js for PDF generation

### Recent Fixes (Current Session - March 2026)
- **Print Template**: Removed redundant "Unit/وحدة" column. New order: # | Item | Box | Pkg | Qty | Price | Disc | Total (8 columns)
- **Data Persistence Bug**: Box/Package/PackDescription fields now correctly saved on Sales Invoices (schema was already fixed in prior session)
- **SalesReturnLineItem Schema**: Added box, package, pack_description fields to prevent same data-loss bug on Sales Returns

### Prior Session Fixes
- Fixed customer address, VAT#, account balances on printed invoices
- Fixed voucher editing from Journal page
- Fixed imported voucher editing (account codes, amounts)
- Fixed historical/posted voucher updates
- Fixed missing item descriptions on invoice edit
- Increased font sizes on print template
- Corrected inventory import logic (prices as HT)
- Added registration_number display on customer/supplier/inventory pages

## Prioritized Backlog

### P0 (Critical)
- ~~Trial Balance Discrepancy~~ (DONE per user confirmation)

### P1 (High)
- ~~Print Template Cleanup~~ (DONE - Unit column removed)
- ~~Box/Package data persistence bug~~ (DONE - Schema fixed)

### P2 (Medium)
- Apply Box/Pkg/Qty to Purchase Invoice and Purchase Return forms
- Email PDF invoices to customers

### P3 (Low)
- Sales Quotations workflow enhancements
- Refactor print data-fetching into shared hook
- Centralize customer data fetching for print across Invoice/Return pages

## Tech Stack
- Frontend: React, Shadcn UI, html2pdf.js
- Backend: FastAPI, Pydantic, Motor (async MongoDB)
- Database: MongoDB
- Auth: JWT-based

## Key Technical Notes
- Pydantic models use `extra="ignore"` — new fields MUST be explicitly added to schemas
- Print templates generate raw HTML strings rendered in popup windows
- Frontend fetches customer data directly via API before printing (more reliable than backend enrichment)
- All monetary values stored with USD precision (3 decimal places)

## Credentials
- Email: carlo.mitri@gmail.com
- Password: Carinemi@28
