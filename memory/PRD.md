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

### March 17, 2026 (Session 6)
- **Invoice Print Template Redesign** — Updated `SalesInvoicePrint.jsx` with:
  - Replaced "MM" text logo with Khayratna Logo (base64-embedded grayscale PNG)
  - Increased all font sizes by 2 points (body 13px, headers 16px, table 12px, totals 13px, grand total 15px)
  - Converted template to full monochrome (black/white only) for laser printer optimization
  - Expanded item table from 15 to 20 rows per page
  - Added CSS `@media print` rules for multi-page support with repeating table headers
  - Both Sales Invoice and Sales Return pages use the same updated component

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

## Known Issues
- Minor hydration warning: `<tr>` inside `<span>` in Dashboard recent transactions (cosmetic, non-functional)

## Backlog
- P3: Fix Dashboard hydration warning (cosmetic)
- P3: Cleanup — Remove unused offline library files (db.js, syncService.js, offlineDataService.js, SyncContext.js, OfflineBanner.jsx, OfflineToast.jsx, SyncStatusIndicator.jsx, SyncConflictDialog.jsx, useOfflineData.js)
