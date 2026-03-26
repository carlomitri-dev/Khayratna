# Lebanese Accounting System - PRD

## Original Problem Statement
Full-scale invoicing and accounting system with modules for sales/purchase invoices, sales/purchase returns, chart of accounts, inventory management, data import/export, POS, and financial reports (Journal, Trial Balance). Built with React frontend + FastAPI backend + MongoDB.

## What's Been Implemented
- Full CRUD for Sales/Purchase Invoices & Returns
- Box/Pkg/Qty calculation system on Sales Invoice and Sales Return forms
- Print templates with customer data, registration numbers, account balances
- Journal module with unbalanced voucher filter
- Trial Balance with date-range filtering and orphan-code check
- Data import/export (CSV/Excel)
- Fiscal year management
- Organization cleanup utility (Clean Orphaned Data)
- html2pdf.js for PDF generation

## Recent Fixes (Current Session - March 2026)
- **Print Template**: Removed "Unit/وحدة" column → # | Item | Box | Pkg | Qty | Price | Disc | Total
- **Invoice Save Freeze**: Fixed Pydantic 422 error from empty strings for box/quantity fields
- **Clean Orphaned Data**: Fixed route ordering in server.py (was blocked by /{org_id} catch-all)
- **VAT Posting Bug**: Fixed forced VAT recalculation on non-taxable invoices (both sales & purchase)
- **Unpost Bug**: Fixed 500 error when unposting invoices — voucher lines use `account_code` not `account_id`. Fixed both sales and purchase unpost functions to fall back to account_code lookup.
- **Logo**: Replaced print logo with Khayratna branding

## Key Technical Notes
- Organization routes live in server.py, NOT organizations.py router
- Voucher lines use `account_code` (NOT `account_id`) — all code touching voucher lines must use account_code
- Trust stored tax_amount — never recalculate from tax_percent
- Pydantic models use extra="ignore" — new fields must be explicitly added

## Prioritized Backlog
### P2 (Medium)
- Apply Box/Pkg/Qty to Purchase Invoice and Purchase Return forms
- Email PDF invoices to customers
### P3 (Low)
- Sales Quotations workflow enhancements
- Refactor print data-fetching into shared hook

## Credentials
- Email: carlo.mitri@gmail.com / Password: Carinemi@28
- Deployed: https://khayratna.com/ (Org: effee0de-5cf2-4388-b126-33ee67e836d5)
