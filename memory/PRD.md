# Lebanese Accounting System - PRD

## Original Problem Statement
Full-scale invoicing and accounting system with modules for sales/purchase invoices, sales/purchase returns, chart of accounts, inventory management, data import/export, POS, and financial reports (Journal, Trial Balance).

## What's Been Implemented
- Full CRUD for Sales/Purchase Invoices & Returns
- Box/Pkg/Qty calculation on Sales Invoice and Sales Return forms
- Print templates with customer data, registration numbers, account balances
- Journal module with unbalanced voucher filter
- Trial Balance with date-range filtering and orphan-code check
- Data import/export, Fiscal year management, Organization cleanup utility

## Recent Fixes (Current Session)
- **Print Template**: Removed "Unit/وحدة" column → 8 columns
- **Invoice Save Freeze**: Data sanitization for Pydantic validation (Sales, Sales Return, Purchase)
- **Clean Orphaned Data**: Fixed route ordering in server.py
- **VAT Posting Bug**: Trust stored tax_amount, no forced recalculation (Sales + Purchase)
- **Unpost Bug**: Fall back to account_code when account_id missing (Sales + Purchase)
- **Logo**: Replaced with Khayratna branding
- **Purchase Invoice Form Overhaul**:
  - Removed Batch & Expiry columns (only Cost, Sell Price, Disc%)
  - Fixed VAT calc: only apply to taxable items (recalculateTotals)
  - Wider/more visible input fields
  - Qty arrows: integer step (step=1)
  - Data sanitization in handleSave
- **Supplier Name on Edit**: AccountSelector now fetches account by ID in remote mode for initial display
- **Purchase Posting**: No 4014 split when tax_amount=0 (non-taxable items)

## Key Technical Notes
- Organization routes in server.py, NOT organizations.py
- Voucher lines use account_code, NOT account_id
- Trust stored tax_amount — never recalculate
- AccountSelector in remote mode (fetchUrl) now auto-fetches by ID on mount for edit scenarios

## Backlog
### P2: Box/Pkg/Qty to Purchase Invoice/Return, Email PDF invoices
### P3: Sales Quotations enhancements, Refactor print hook

## Credentials
- carlo.mitri@gmail.com / Carinemi@28
- Deployed: https://khayratna.com/
