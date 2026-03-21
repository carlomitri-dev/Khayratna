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
- Data import/export (CSV/Excel)
- Fiscal year management
- Organization cleanup utility
- html2pdf.js for PDF generation

### Recent Fixes (Current Session - March 2026)
- **Print Template**: Removed redundant "Unit/وحدة" column. New order: # | Item | Box | Pkg | Qty | Price | Disc | Total (8 columns)
- **Invoice Save Freeze Bug**: Fixed Pydantic 422 error caused by empty strings for box/quantity. Added data sanitization in handleSave for both SalesInvoicePage and SalesReturnPage.
- **SalesReturnLineItem Schema**: Added box, package, pack_description fields to prevent data-loss bug
- **Clean Orphaned Data Bug (CRITICAL)**: Fixed FastAPI route ordering — `/cleanup-orphaned` was blocked by `/{org_id}` catch-all route in server.py. Moved cleanup route BEFORE parameterized routes. This fix cleans ALL orphaned data (accounts, vouchers, invoices, etc.) from deleted organizations.

### Data Integrity Finding (User's deployed site khayratna.com)
- Total accounts: 8,696 (global) vs 4,348 (in org) → 4,348 orphaned
- Total vouchers: 29,946 (global) vs ~14,979 (in org) → ~14,967 orphaned
- After deploying the fix and running cleanup, these will be removed

## Prioritized Backlog

### P0 (Critical)
- ~~Trial Balance Discrepancy~~ (DONE per user)
- ~~Clean Orphaned Data not working~~ (DONE - route ordering fix)

### P1 (High)
- ~~Print Template Cleanup~~ (DONE - Unit column removed)
- ~~Box/Package data persistence bug~~ (DONE - Schema fixed)
- ~~Invoice save freeze~~ (DONE - Data sanitization added)

### P2 (Medium)
- Apply Box/Pkg/Qty to Purchase Invoice and Purchase Return forms
- Email PDF invoices to customers

### P3 (Low)
- Sales Quotations workflow enhancements
- Refactor print data-fetching into shared hook

## Tech Stack
- Frontend: React, Shadcn UI, html2pdf.js
- Backend: FastAPI, Pydantic, Motor (async MongoDB)
- Database: MongoDB
- Auth: JWT-based

## Key Technical Notes
- Pydantic models use `extra="ignore"` — new fields MUST be explicitly added to schemas
- **IMPORTANT**: Organization routes are defined directly in server.py, NOT via the organizations.py router (which is not mounted). Always add org routes to server.py.
- Print templates generate raw HTML strings rendered in popup windows
- Frontend fetches customer data directly via API before printing
- All monetary values stored with USD precision (3 decimal places)
- Clean empty strings before sending numeric fields to backend (Pydantic rejects empty strings for float fields)

## Credentials
- Email: carlo.mitri@gmail.com
- Password: Carinemi@28
- Deployed site: https://khayratna.com/
- Org ID (deployed): effee0de-5cf2-4388-b126-33ee67e836d5
