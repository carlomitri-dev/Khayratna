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
- **Invoice Save Freeze Bug**: Fixed Pydantic 422 error caused by empty strings for box/quantity. Added data sanitization in handleSave.
- **SalesReturnLineItem Schema**: Added box, package, pack_description fields to prevent data-loss bug
- **Clean Orphaned Data Bug**: Fixed FastAPI route ordering in server.py — `/cleanup-orphaned` was blocked by `/{org_id}` catch-all route.
- **VAT Posting Bug (CRITICAL)**: Fixed incorrect VAT split when posting invoices with all non-taxable items. The posting code was recalculating tax from total even when tax_amount=0. Fixed in both sales invoice and purchase invoice posting functions in invoices.py.
- **Logo**: Replaced printed invoice logo with new Khayratna logo.

### Key Bug Details: VAT Posting
- Root cause: Lines 454-461 in invoices.py checked `if tax_usd == 0 and tax_percent > 0` then forcibly recalculated tax, ignoring that tax_amount=0 means non-taxable items.
- Fix: Trust the stored `tax_amount` from the invoice (already correctly calculated by frontend based on item taxability).
- Same fix applied to purchase invoice posting (line 1028 area).

## Prioritized Backlog

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
- Organization routes are defined directly in server.py, NOT via organizations.py router
- Trust stored tax_amount — do NOT recalculate from tax_percent
- Clean empty strings before sending numeric fields to backend

## Credentials
- Email: carlo.mitri@gmail.com
- Password: Carinemi@28
- Deployed site: https://khayratna.com/
- Org ID (deployed): effee0de-5cf2-4388-b126-33ee67e836d5
