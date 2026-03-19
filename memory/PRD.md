# KAIROS - Digital Invoicing System

## Original Problem Statement
Lebanese accounting/invoicing SaaS (KAIROS) with React + FastAPI + MongoDB. Full accounting, invoicing, inventory, POS, exchange rates.

## Architecture
- **Frontend**: React (port 3000), Shadcn/UI, Recharts
- **Backend**: FastAPI (port 8001), MongoDB, modular routers in `/app/backend/routers/`
- **Auth**: JWT-based, role-based (super_admin, admin, accountant, cashier)

## Implemented Modules
- Chart of Accounts (LCOA), Fiscal Years
- Voucher Entry (journal, receipt, payment, sales, payroll)
- Sales & Purchase Invoices (with print, post/unpost)
- Sales & Purchase Returns (with print)
- Purchase Orders (full workflow, post as invoice, print, mobile-friendly)
- Credit/Debit Notes
- Inventory Management (CSV/DBF import, batch/expiry)
- POS Terminal (barcode scanner, quick items, cart, receipt print, void/delete transactions)
- POS Receipt Customization (logo, header/footer, printer width, live preview)
- Cashier System (sessions, PIN login, admin management)
- POS Daily Closing Report + POS Sales Analytics Dashboard
- Customer & Supplier Management (with VAT number, mirror account creation)
- Exchange Rates (USD/LBP simplified)
- Reports: Trial Balance, Income Statement, General Ledger

## Changes Log

### March 19, 2026 (Session 7)
- **Database Cleanup** — Cleaned 35,209 orphaned documents (28K+ vouchers, 4K accounts, etc.) from deleted organization. DB reduced from 34MB to <1KB
- **Background Voucher Import** — Refactored `/api/import/vouchers` to use `asyncio.create_task()` background processing:
  - Returns immediately with `job_id` (no more timeout)
  - New polling endpoint: `GET /api/import/vouchers/status/{job_id}` 
  - Real-time progress bar on frontend (0-100%) with status messages
  - Both Quick Import and Match Fields flows use background processing
- **Organization Delete Fix** — Added missing collection cleanup (fiscal_years, regions, receipt_settings, sales_returns, purchase_returns, purchase_orders, sales_quotations) to the delete organization endpoint

### March 17, 2026 (Session 6)
- **Invoice Print Template Redesign** — Updated `SalesInvoicePrint.jsx` with:
  - Replaced "MM" text logo with Khayratna Logo (served via URL from /assets/)
  - Increased all font sizes by 2 points
  - Converted template to full monochrome (white bg, black text) for laser printer optimization
  - Expanded item table from 15 to 20 rows per page
  - Added CSS `@media print` rules for multi-page support with repeating table headers
  - Removed duplicate VAT notice line
- **PDF Export/Download** — Added `html2pdf.js` integration:
  - `downloadPdf()` function in `SalesInvoicePrint.jsx` generates PDF from the same monochrome template
  - Download PDF buttons added to Sales Invoice list + view dialog
  - Download PDF buttons added to Sales Return list + view dialog
  - PDF files named `Invoice-{number}.pdf` with A4 format
- **Codebase Cleanup** — Removed 9 unused offline library files (db.js, syncService.js, etc.)

### March 17, 2026 (Session 5 continued)
- **Sales Invoice Due Date Freeze Fix** — Fixed DateInput component
- **Account Balance by Fiscal Year** — Added `fy_id` parameter to account endpoints
- **Restored Custom Print Template** — SalesInvoicePrint component with bilingual headers
- **Inventory Searchable Dropdowns** — Replaced dropdowns with searchable comboboxes

### March 15, 2026 (Session 5)
- **Auto Account Code Generation** — Fixed `/api/accounts/next-code` endpoint
- **Exchange Rate Visibility in Cr/Db Notes** — Rate input visible and editable
- **CrDb Notes handleSave Bug Fix** — Fixed save failures after refactoring
- **z-index Dropdown Fix** — Added z-[60] to Header dropdown menus
- **Dashboard React Warnings Fix** — Wrapped callbacks with useCallback
- **Recent Transactions Widget** — 3-column quick-access widget on Dashboard
- **Auto-Retry on Connection Error** — Global axios interceptor with retry button
- **Global Loading Bar** — YouTube/GitHub-style loading bar during API calls
- **Keyboard Shortcuts** — Power-user shortcuts with help dialog

### March 14, 2026 (Session 4)
- **POS Transaction Void (Soft Delete)** — Void with reason, reverse balances
- **Purchase Orders Module** — Full CRUD + workflow + post as invoice
- **POS Receipt Customization** — Settings dialog with logo, header, footer
- **POS Sales Analytics Dashboard** — Charts for trends, top items
- **AccountSelector Refactored** — Shared RemoteAccountSelector component

### March 19, 2026 (Session 8)
- **Journal Module** — New `/journal` page displaying all posted vouchers:
  - Sidebar link placed above "Trial Balance" as requested
  - Date range filter (From/To) with fiscal year support
  - Full voucher detail display: number, type, date, description, reference, all lines with account code/name/debit/credit in USD & LBP
  - Unbalanced voucher detection (debit != credit) with red highlighting and "UNBALANCED" label
  - Grand totals section showing debit/credit in both USD and LBP
  - Action buttons: Edit (navigates to voucher editor), Unpost (super_admin), Delete (with confirmation dialog)
  - Print and PDF export (landscape A4)

## Known Issues
- None currently tracked.

## Backlog
- Email Invoices (P1): Send PDF invoices directly to customers via email
- Sales Quotations Workflow (P2): Potential enhancements to the existing quotations feature
