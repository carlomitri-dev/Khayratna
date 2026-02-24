import { useState, useEffect, useCallback } from 'react';
import { useSync } from '../context/SyncContext';
import { useAuth } from '../context/AuthContext';
import * as offlineDataService from '../lib/offlineDataService';

/**
 * Custom hook for offline-first data access
 * Provides data that works both online and offline with automatic caching
 */
export function useOfflineData() {
  const { currentOrg } = useAuth();
  const { isOnline, triggerSync, updatePendingCount } = useSync();
  const orgId = currentOrg?.id;

  // Customers
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);

  const loadCustomers = useCallback(async () => {
    if (!orgId) return [];
    setCustomersLoading(true);
    try {
      const data = await offlineDataService.getCustomers(orgId);
      setCustomers(data);
      return data;
    } catch (error) {
      console.error('[useOfflineData] Error loading customers:', error);
      return [];
    } finally {
      setCustomersLoading(false);
    }
  }, [orgId]);

  // Suppliers
  const [suppliers, setSuppliers] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);

  const loadSuppliers = useCallback(async () => {
    if (!orgId) return [];
    setSuppliersLoading(true);
    try {
      const data = await offlineDataService.getSuppliers(orgId);
      setSuppliers(data);
      return data;
    } catch (error) {
      console.error('[useOfflineData] Error loading suppliers:', error);
      return [];
    } finally {
      setSuppliersLoading(false);
    }
  }, [orgId]);

  // Inventory Items
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  const loadInventory = useCallback(async () => {
    if (!orgId) return [];
    setInventoryLoading(true);
    try {
      const data = await offlineDataService.getInventoryItems(orgId);
      setInventoryItems(data);
      return data;
    } catch (error) {
      console.error('[useOfflineData] Error loading inventory:', error);
      return [];
    } finally {
      setInventoryLoading(false);
    }
  }, [orgId]);

  // Sales Invoices
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [salesInvoicesLoading, setSalesInvoicesLoading] = useState(false);

  const loadSalesInvoices = useCallback(async () => {
    if (!orgId) return [];
    setSalesInvoicesLoading(true);
    try {
      const data = await offlineDataService.getSalesInvoices(orgId);
      setSalesInvoices(data);
      return data;
    } catch (error) {
      console.error('[useOfflineData] Error loading sales invoices:', error);
      return [];
    } finally {
      setSalesInvoicesLoading(false);
    }
  }, [orgId]);

  const createSalesInvoice = useCallback(async (invoiceData) => {
    if (!orgId) throw new Error('No organization selected');
    try {
      const result = await offlineDataService.createSalesInvoice(invoiceData, orgId);
      await updatePendingCount();
      await loadSalesInvoices();
      return result;
    } catch (error) {
      console.error('[useOfflineData] Error creating sales invoice:', error);
      throw error;
    }
  }, [orgId, updatePendingCount, loadSalesInvoices]);

  // Purchase Invoices
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [purchaseInvoicesLoading, setPurchaseInvoicesLoading] = useState(false);

  const loadPurchaseInvoices = useCallback(async () => {
    if (!orgId) return [];
    setPurchaseInvoicesLoading(true);
    try {
      const data = await offlineDataService.getPurchaseInvoices(orgId);
      setPurchaseInvoices(data);
      return data;
    } catch (error) {
      console.error('[useOfflineData] Error loading purchase invoices:', error);
      return [];
    } finally {
      setPurchaseInvoicesLoading(false);
    }
  }, [orgId]);

  const createPurchaseInvoice = useCallback(async (invoiceData) => {
    if (!orgId) throw new Error('No organization selected');
    try {
      const result = await offlineDataService.createPurchaseInvoice(invoiceData, orgId);
      await updatePendingCount();
      await loadPurchaseInvoices();
      return result;
    } catch (error) {
      console.error('[useOfflineData] Error creating purchase invoice:', error);
      throw error;
    }
  }, [orgId, updatePendingCount, loadPurchaseInvoices]);

  // POS Transactions
  const [posTransactions, setPosTransactions] = useState([]);
  const [posLoading, setPosLoading] = useState(false);

  const loadPOSTransactions = useCallback(async () => {
    if (!orgId) return [];
    setPosLoading(true);
    try {
      const data = await offlineDataService.getPOSTransactions(orgId);
      setPosTransactions(data);
      return data;
    } catch (error) {
      console.error('[useOfflineData] Error loading POS transactions:', error);
      return [];
    } finally {
      setPosLoading(false);
    }
  }, [orgId]);

  const createPOSTransaction = useCallback(async (transactionData) => {
    if (!orgId) throw new Error('No organization selected');
    try {
      const result = await offlineDataService.createPOSTransaction(transactionData, orgId);
      await updatePendingCount();
      await loadPOSTransactions();
      await loadInventory(); // Refresh inventory after sale
      return result;
    } catch (error) {
      console.error('[useOfflineData] Error creating POS transaction:', error);
      throw error;
    }
  }, [orgId, updatePendingCount, loadPOSTransactions, loadInventory]);

  // Chart of Accounts
  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  const loadChartOfAccounts = useCallback(async () => {
    if (!orgId) return [];
    setAccountsLoading(true);
    try {
      const data = await offlineDataService.getChartOfAccounts(orgId);
      setChartOfAccounts(data);
      return data;
    } catch (error) {
      console.error('[useOfflineData] Error loading chart of accounts:', error);
      return [];
    } finally {
      setAccountsLoading(false);
    }
  }, [orgId]);

  // Vouchers
  const [vouchers, setVouchers] = useState([]);
  const [vouchersLoading, setVouchersLoading] = useState(false);

  const loadVouchers = useCallback(async () => {
    if (!orgId) return [];
    setVouchersLoading(true);
    try {
      const data = await offlineDataService.getVouchers(orgId);
      setVouchers(data);
      return data;
    } catch (error) {
      console.error('[useOfflineData] Error loading vouchers:', error);
      return [];
    } finally {
      setVouchersLoading(false);
    }
  }, [orgId]);

  const createVoucher = useCallback(async (voucherData) => {
    if (!orgId) throw new Error('No organization selected');
    try {
      const result = await offlineDataService.createVoucher(voucherData, orgId);
      await updatePendingCount();
      await loadVouchers();
      return result;
    } catch (error) {
      console.error('[useOfflineData] Error creating voucher:', error);
      throw error;
    }
  }, [orgId, updatePendingCount, loadVouchers]);

  // Refresh all data
  const refreshAll = useCallback(async () => {
    if (!orgId) return;
    await Promise.all([
      loadCustomers(),
      loadSuppliers(),
      loadInventory(),
      loadChartOfAccounts(),
      loadSalesInvoices(),
      loadPurchaseInvoices(),
      loadPOSTransactions(),
      loadVouchers()
    ]);
  }, [orgId, loadCustomers, loadSuppliers, loadInventory, loadChartOfAccounts, loadSalesInvoices, loadPurchaseInvoices, loadPOSTransactions, loadVouchers]);

  return {
    // Connection status
    isOnline,
    triggerSync,
    
    // Customers
    customers,
    customersLoading,
    loadCustomers,
    
    // Suppliers
    suppliers,
    suppliersLoading,
    loadSuppliers,
    
    // Inventory
    inventoryItems,
    inventoryLoading,
    loadInventory,
    
    // Sales Invoices
    salesInvoices,
    salesInvoicesLoading,
    loadSalesInvoices,
    createSalesInvoice,
    
    // Purchase Invoices
    purchaseInvoices,
    purchaseInvoicesLoading,
    loadPurchaseInvoices,
    createPurchaseInvoice,
    
    // POS
    posTransactions,
    posLoading,
    loadPOSTransactions,
    createPOSTransaction,
    
    // Chart of Accounts
    chartOfAccounts,
    accountsLoading,
    loadChartOfAccounts,
    
    // Vouchers
    vouchers,
    vouchersLoading,
    loadVouchers,
    createVoucher,
    
    // Refresh all
    refreshAll
  };
}

export default useOfflineData;
