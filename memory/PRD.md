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

### March 15, 2026 (Session 5)
- **Auto Account Code Generation** — Fixed and verified `/api/accounts/next-code` endpoint with numeric sorting. Customers page auto-fills code with prefix `4111`, Suppliers page with `4011` when clicking "Add".
- **Exchange Rate Visibility in Cr/Db Notes** — Exchange rate input visible and editable in the note form. Rate column displayed in the notes list table.
- **CrDb Notes handleSave Bug Fix** — Fixed critical bug where saving/updating notes failed because `accounts` array was empty after RemoteAccountSelector refactoring. Now uses note state directly. Backend `CrDbNoteUpdate` accepts both IDs and codes as fallback.
- **z-index Dropdown Fix (P2)** — Added `z-[60]` to all Header dropdown menus (FY selector, Org switcher, User menu) to render above sidebar (`z-50`).
- **Dashboard React Warnings Fix (P3)** — Wrapped `fetchDashboardData` and `filterVouchers` in `useCallback` with proper dependency arrays. Eliminated missing dependency warnings.
- **Recent Transactions Widget** — Added a 3-column quick-access widget to Dashboard showing latest Sales Invoices, Purchase Invoices, and Cr/Db Notes with "View All" navigation links.
- **Auto-Retry on Connection Error** — Global axios interceptor shows a toast with a "Retry" button on connection errors/timeouts. Max 2 retries, skips auth requests, auto-dismisses after 10s.
- **Global Loading Bar** — Added a YouTube/GitHub-style loading bar at the top of the viewport that animates during API calls. Uses axios interceptors to track active requests.
- **Keyboard Shortcuts** — Added power-user shortcuts: `?` help dialog, `/` focus search, `Esc` close/blur, `Ctrl+N` new record, `Ctrl+S` save, plus `G then D/V/A/C/S/N/I/P` navigation sequences. Implemented via `useKeyboardShortcuts` and `useSequenceShortcut` hooks in Layout.jsx.

### March 17, 2026 (Session 5 continued)
- **Sales Invoice Due Date Freeze Fix** — Fixed DateInput component (`date-input.jsx`) that was passing synthetic event objects instead of string values to onChange. All consumers now receive plain date strings.
- **Account Balance by Fiscal Year** — Added `fy_id` parameter to `/customer-accounts`, `/supplier-accounts`, and `/accounts/movable/list` endpoints. When a fiscal year is selected, account balances are recalculated from posted voucher entries within that FY's date range. Frontend AccountSelector and RemoteAccountSelector now pass the selected FY ID.
- **Restored Custom Print Template** — SalesInvoicePage and SalesReturnPage now use the bilingual `SalesInvoicePrint` component (with MM logo, Arabic/English headers, proper formatting) instead of the generic inline template.
- **Inventory Searchable Dropdowns** — Replaced basic Select dropdowns for Category and Supplier filters with searchable Popover+Command comboboxes that support typing to filter.

### March 14, 2026 (Session 4)
- **POS Transaction Void (Soft Delete)** — New PUT /api/pos/invoices/{id}/void endpoint. Voids transaction with reason, reverses account balances and inventory, marks voucher as voided. Frontend: void dialog with reason input, "Show voided" filter in history, VOIDED badge with strikethrough, separate hard delete option.
- **POS Transaction Delete Fix** — Added missing DELETE endpoint
- **Purchase Orders Module** — Full CRUD + workflow + post as invoice
- **POS Transaction Bug Fix** — Fixed uuid error + VAT/discount accounting
- **POS Receipt Customization** — Settings dialog with logo, header, footer, printer width
- **POS Sales Analytics Dashboard** — Charts for trends, top items, cashier performance
- **AccountSelector Refactored** — Shared RemoteAccountSelector component

## Known Issues
- None currently tracked.

## Backlog
- Cleanup: Remove unused offline library files (db.js, syncService.js, offlineDataService.js, SyncContext.js, OfflineBanner.jsx, OfflineToast.jsx, SyncStatusIndicator.jsx, SyncConflictDialog.jsx, useOfflineData.js) — these are no longer imported but still exist in the codebase
