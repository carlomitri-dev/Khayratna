import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FiscalYearProvider } from './context/FiscalYearContext';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import axios from 'axios';
import Layout from './components/Layout';

// Global axios interceptor for connection errors with auto-retry
axios.interceptors.response.use(
  response => response,
  error => {
    const config = error.config;
    // Skip retry for login requests or already-retried requests
    if (!config || config._retryCount >= 2 || config.url?.includes('/auth/login')) {
      if (!error.response && error.message === 'Network Error') {
        toast.error('Connection Error', {
          description: 'Unable to connect to the server. Please check your internet connection.',
          duration: 5000,
          id: 'connection-error-final'
        });
      }
      return Promise.reject(error);
    }

    if (!error.response && error.message === 'Network Error') {
      config._retryCount = (config._retryCount || 0) + 1;
      return new Promise((resolve, reject) => {
        toast.error('Connection Error', {
          description: 'Unable to connect to the server.',
          duration: 8000,
          id: 'connection-error',
          action: {
            label: 'Retry',
            onClick: () => {
              toast.loading('Retrying...', { id: 'connection-retry', duration: 3000 });
              axios(config).then(resolve).catch(reject);
            }
          }
        });
        // Auto-reject after 10s if user doesn't click Retry
        setTimeout(() => reject(error), 10000);
      });
    }

    if (error.code === 'ECONNABORTED') {
      config._retryCount = (config._retryCount || 0) + 1;
      return new Promise((resolve, reject) => {
        toast.error('Connection Timeout', {
          description: 'The server took too long to respond.',
          duration: 8000,
          id: 'timeout-error',
          action: {
            label: 'Retry',
            onClick: () => {
              toast.loading('Retrying...', { id: 'connection-retry', duration: 3000 });
              axios(config).then(resolve).catch(reject);
            }
          }
        });
        setTimeout(() => reject(error), 10000);
      });
    }

    return Promise.reject(error);
  }
);
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
import PurchaseOrdersPage from './pages/PurchaseOrdersPage';
import SalesReturnPage from './pages/SalesReturnPage';
import PurchaseReturnPage from './pages/PurchaseReturnPage';
import ImportDataPage from './pages/ImportDataPage';
import POSPage from './pages/POSPage';
import CashierPOSPage from './pages/CashierPOSPage';
import CashierSessionsPage from './pages/CashierSessionsPage';
import CashierLoginPage from './pages/CashierLoginPage';
import POSClosingReportPage from './pages/POSClosingReportPage';
import POSAnalyticsPage from './pages/POSAnalyticsPage';
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
        path="/purchase-orders"
        element={
          <ProtectedRoute>
            <PurchaseOrdersPage />
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
      <Route
        path="/pos-analytics"
        element={
          <ProtectedRoute>
            <POSAnalyticsPage />
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
            <FiscalYearProvider>
              <AppRoutes />
              <Toaster />
            </FiscalYearProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
