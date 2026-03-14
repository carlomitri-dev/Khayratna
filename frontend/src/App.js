import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SyncProvider } from './context/SyncContext';
import { FiscalYearProvider } from './context/FiscalYearContext';
import { Toaster } from './components/ui/sonner';
import OfflineToast from './components/OfflineToast';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ChartOfAccountsPage from './pages/ChartOfAccountsPage';
import VoucherEntryPage from './pages/VoucherEntryPage';
import ExchangeRatesPage from './pages/ExchangeRatesPage';
import TrialBalancePage from './pages/TrialBalancePage';
import IncomeStatementPage from './pages/IncomeStatementPage';
import GeneralLedgerPage from './pages/GeneralLedgerPage';
import SettingsPage from './pages/SettingsPage';
import CrDbNotesPage from './pages/CrDbNotesPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
import InventoryPage from './pages/InventoryPage';
import SalesInvoicePage from './pages/SalesInvoicePage';
import SalesQuotationsPage from './pages/SalesQuotationsPage';
import PurchaseInvoicePage from './pages/PurchaseInvoicePage';
import SalesReturnPage from './pages/SalesReturnPage';
import PurchaseReturnPage from './pages/PurchaseReturnPage';
import ImportDataPage from './pages/ImportDataPage';
import POSPage from './pages/POSPage';
import CashierPOSPage from './pages/CashierPOSPage';
import CashierSessionsPage from './pages/CashierSessionsPage';
import CashierLoginPage from './pages/CashierLoginPage';
import POSClosingReportPage from './pages/POSClosingReportPage';
import './App.css';

const ProtectedRoute = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Layout>{children}</Layout>;
};

const PublicRoute = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chart-of-accounts"
        element={
          <ProtectedRoute>
            <ChartOfAccountsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/vouchers"
        element={
          <ProtectedRoute>
            <VoucherEntryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/exchange-rates"
        element={
          <ProtectedRoute>
            <ExchangeRatesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trial-balance"
        element={
          <ProtectedRoute>
            <TrialBalancePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/income-statement"
        element={
          <ProtectedRoute>
            <IncomeStatementPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/general-ledger"
        element={
          <ProtectedRoute>
            <GeneralLedgerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cr-db-notes"
        element={
          <ProtectedRoute>
            <CrDbNotesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers"
        element={
          <ProtectedRoute>
            <CustomersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/suppliers"
        element={
          <ProtectedRoute>
            <SuppliersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedRoute>
            <InventoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales-invoices"
        element={
          <ProtectedRoute>
            <SalesInvoicePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales-quotations"
        element={
          <ProtectedRoute>
            <SalesQuotationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/purchase-invoices"
        element={
          <ProtectedRoute>
            <PurchaseInvoicePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales-returns"
        element={
          <ProtectedRoute>
            <SalesReturnPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/purchase-returns"
        element={
          <ProtectedRoute>
            <PurchaseReturnPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/import-data"
        element={
          <ProtectedRoute>
            <ImportDataPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pos"
        element={
          <ProtectedRoute>
            <POSPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cashier-sessions"
        element={
          <ProtectedRoute>
            <CashierSessionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pos-closing-report"
        element={
          <ProtectedRoute>
            <POSClosingReportPage />
          </ProtectedRoute>
        }
      />
      <Route path="/cashier-login" element={<CashierLoginPage />} />
      <Route path="/cashier-pos" element={<CashierPOSPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <SyncProvider>
            <FiscalYearProvider>
              <AppRoutes />
              <Toaster />
              <OfflineToast />
            </FiscalYearProvider>
          </SyncProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
