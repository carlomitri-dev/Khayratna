import db from './db';
import axios from 'axios';
import { addToSyncQueue, OPERATION_TYPES, ACTION_TYPES } from './syncService';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Check if online
export function isOnline() {
  return navigator.onLine;
}

// Generic fetch and cache function
async function fetchAndCache(endpoint, table, orgId) {
  try {
    const response = await axios.get(`${API}${endpoint}`, {
      params: orgId ? { organization_id: orgId } : {}
    });
    
    const data = response.data;
    
    // Clear existing data for this org and insert new
    if (orgId) {
      await db[table].where('organization_id').equals(orgId).delete();
    } else {
      await db[table].clear();
    }
    
    if (Array.isArray(data) && data.length > 0) {
      await db[table].bulkPut(data);
    }
    
    return data;
  } catch (error) {
    console.error(`[OfflineData] Failed to fetch ${endpoint}:`, error);
    // Return cached data on error
    if (orgId) {
      return await db[table].where('organization_id').equals(orgId).toArray();
    }
    return await db[table].toArray();
  }
}

// ==================== CUSTOMERS ====================
export async function getCustomers(orgId) {
  if (isOnline()) {
    return await fetchAndCache('/customers', 'customers', orgId);
  }
  return await db.customers.where('organization_id').equals(orgId).toArray();
}

export async function createCustomer(data, orgId) {
  const customer = { ...data, organization_id: orgId, id: data.id || generateId() };
  
  // Save locally first
  await db.customers.put(customer);
  
  if (isOnline()) {
    try {
      const response = await axios.post(`${API}/customers`, customer);
      await db.customers.put(response.data);
      return response.data;
    } catch (error) {
      await addToSyncQueue(OPERATION_TYPES.CUSTOMER, ACTION_TYPES.CREATE, customer.id, customer);
      throw error;
    }
  } else {
    await addToSyncQueue(OPERATION_TYPES.CUSTOMER, ACTION_TYPES.CREATE, customer.id, customer);
    return customer;
  }
}

// ==================== SUPPLIERS ====================
export async function getSuppliers(orgId) {
  if (isOnline()) {
    return await fetchAndCache('/suppliers', 'suppliers', orgId);
  }
  return await db.suppliers.where('organization_id').equals(orgId).toArray();
}

export async function createSupplier(data, orgId) {
  const supplier = { ...data, organization_id: orgId, id: data.id || generateId() };
  
  await db.suppliers.put(supplier);
  
  if (isOnline()) {
    try {
      const response = await axios.post(`${API}/suppliers`, supplier);
      await db.suppliers.put(response.data);
      return response.data;
    } catch (error) {
      await addToSyncQueue(OPERATION_TYPES.SUPPLIER, ACTION_TYPES.CREATE, supplier.id, supplier);
      throw error;
    }
  } else {
    await addToSyncQueue(OPERATION_TYPES.SUPPLIER, ACTION_TYPES.CREATE, supplier.id, supplier);
    return supplier;
  }
}

// ==================== INVENTORY ====================
export async function getInventoryItems(orgId) {
  if (isOnline()) {
    return await fetchAndCache('/inventory-items', 'inventoryItems', orgId);
  }
  return await db.inventoryItems.where('organization_id').equals(orgId).toArray();
}

export async function updateInventoryItem(id, data, orgId) {
  const item = { ...data, organization_id: orgId, id };
  
  await db.inventoryItems.put(item);
  
  if (isOnline()) {
    try {
      const response = await axios.put(`${API}/inventory-items/${id}`, item);
      await db.inventoryItems.put(response.data);
      return response.data;
    } catch (error) {
      await addToSyncQueue(OPERATION_TYPES.INVENTORY_ITEM, ACTION_TYPES.UPDATE, id, item);
      throw error;
    }
  } else {
    await addToSyncQueue(OPERATION_TYPES.INVENTORY_ITEM, ACTION_TYPES.UPDATE, id, item);
    return item;
  }
}

// ==================== SALES INVOICES ====================
export async function getSalesInvoices(orgId) {
  if (isOnline()) {
    return await fetchAndCache('/sales-invoices', 'salesInvoices', orgId);
  }
  return await db.salesInvoices.where('organization_id').equals(orgId).toArray();
}

export async function createSalesInvoice(data, orgId) {
  const invoice = { 
    ...data, 
    organization_id: orgId, 
    id: data.id || generateId(),
    created_offline: !isOnline()
  };
  
  await db.salesInvoices.put(invoice);
  
  // Update local inventory quantities
  await updateLocalInventoryForSale(invoice.items, orgId);
  
  if (isOnline()) {
    try {
      const response = await axios.post(`${API}/sales-invoices`, invoice);
      await db.salesInvoices.put(response.data);
      return response.data;
    } catch (error) {
      await addToSyncQueue(OPERATION_TYPES.SALES_INVOICE, ACTION_TYPES.CREATE, invoice.id, invoice);
      throw error;
    }
  } else {
    await addToSyncQueue(OPERATION_TYPES.SALES_INVOICE, ACTION_TYPES.CREATE, invoice.id, invoice);
    return invoice;
  }
}

// ==================== PURCHASE INVOICES ====================
export async function getPurchaseInvoices(orgId) {
  if (isOnline()) {
    return await fetchAndCache('/purchase-invoices', 'purchaseInvoices', orgId);
  }
  return await db.purchaseInvoices.where('organization_id').equals(orgId).toArray();
}

export async function createPurchaseInvoice(data, orgId) {
  const invoice = { 
    ...data, 
    organization_id: orgId, 
    id: data.id || generateId(),
    created_offline: !isOnline()
  };
  
  await db.purchaseInvoices.put(invoice);
  
  // Update local inventory quantities
  await updateLocalInventoryForPurchase(invoice.items, orgId);
  
  if (isOnline()) {
    try {
      const response = await axios.post(`${API}/purchase-invoices`, invoice);
      await db.purchaseInvoices.put(response.data);
      return response.data;
    } catch (error) {
      await addToSyncQueue(OPERATION_TYPES.PURCHASE_INVOICE, ACTION_TYPES.CREATE, invoice.id, invoice);
      throw error;
    }
  } else {
    await addToSyncQueue(OPERATION_TYPES.PURCHASE_INVOICE, ACTION_TYPES.CREATE, invoice.id, invoice);
    return invoice;
  }
}

// ==================== POS TRANSACTIONS ====================
export async function getPOSTransactions(orgId) {
  if (isOnline()) {
    return await fetchAndCache('/pos/invoices', 'posTransactions', orgId);
  }
  return await db.posTransactions.where('organization_id').equals(orgId).toArray();
}

export async function createPOSTransaction(data, orgId) {
  const transaction = { 
    ...data, 
    organization_id: orgId, 
    id: data.id || generateId(),
    created_offline: !isOnline(),
    date: new Date().toISOString()
  };
  
  await db.posTransactions.put(transaction);
  
  // Update local inventory quantities
  await updateLocalInventoryForSale(transaction.items, orgId);
  
  if (isOnline()) {
    try {
      const response = await axios.post(`${API}/pos/checkout`, transaction);
      await db.posTransactions.put(response.data);
      return response.data;
    } catch (error) {
      await addToSyncQueue(OPERATION_TYPES.POS_TRANSACTION, ACTION_TYPES.CREATE, transaction.id, transaction);
      throw error;
    }
  } else {
    await addToSyncQueue(OPERATION_TYPES.POS_TRANSACTION, ACTION_TYPES.CREATE, transaction.id, transaction);
    return transaction;
  }
}

// ==================== CHART OF ACCOUNTS ====================
export async function getChartOfAccounts(orgId) {
  if (isOnline()) {
    return await fetchAndCache('/chart-of-accounts', 'chartOfAccounts', orgId);
  }
  return await db.chartOfAccounts.where('organization_id').equals(orgId).toArray();
}

// ==================== VOUCHERS ====================
export async function getVouchers(orgId) {
  if (isOnline()) {
    return await fetchAndCache('/vouchers', 'vouchers', orgId);
  }
  return await db.vouchers.where('organization_id').equals(orgId).toArray();
}

export async function createVoucher(data, orgId) {
  const voucher = { 
    ...data, 
    organization_id: orgId, 
    id: data.id || generateId(),
    created_offline: !isOnline()
  };
  
  await db.vouchers.put(voucher);
  
  if (isOnline()) {
    try {
      const response = await axios.post(`${API}/vouchers`, voucher);
      await db.vouchers.put(response.data);
      return response.data;
    } catch (error) {
      await addToSyncQueue(OPERATION_TYPES.VOUCHER, ACTION_TYPES.CREATE, voucher.id, voucher);
      throw error;
    }
  } else {
    await addToSyncQueue(OPERATION_TYPES.VOUCHER, ACTION_TYPES.CREATE, voucher.id, voucher);
    return voucher;
  }
}

// ==================== EXCHANGE RATES ====================
export async function getExchangeRates(orgId) {
  if (isOnline()) {
    return await fetchAndCache('/exchange-rates', 'exchangeRates', orgId);
  }
  return await db.exchangeRates.where('organization_id').equals(orgId).toArray();
}

// ==================== ORGANIZATIONS ====================
export async function getOrganizations() {
  if (isOnline()) {
    return await fetchAndCache('/organizations', 'organizations', null);
  }
  return await db.organizations.toArray();
}

// ==================== HELPER FUNCTIONS ====================

// Generate UUID for offline-created entities
function generateId() {
  return 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Update local inventory after a sale
async function updateLocalInventoryForSale(items, orgId) {
  if (!items) return;
  
  for (const item of items) {
    if (item.item_id && item.item_type !== 'service') {
      const inventoryItem = await db.inventoryItems.get(item.item_id);
      if (inventoryItem) {
        inventoryItem.quantity_on_hand = (inventoryItem.quantity_on_hand || 0) - (item.quantity || 0);
        await db.inventoryItems.put(inventoryItem);
      }
    }
  }
}

// Update local inventory after a purchase
async function updateLocalInventoryForPurchase(items, orgId) {
  if (!items) return;
  
  for (const item of items) {
    if (item.item_id && item.item_type !== 'service') {
      const inventoryItem = await db.inventoryItems.get(item.item_id);
      if (inventoryItem) {
        inventoryItem.quantity_on_hand = (inventoryItem.quantity_on_hand || 0) + (item.quantity || 0);
        await db.inventoryItems.put(inventoryItem);
      }
    }
  }
}

// Refresh all data from server
export async function refreshAllData(orgId) {
  if (!isOnline()) {
    return false;
  }
  
  try {
    await Promise.all([
      getCustomers(orgId),
      getSuppliers(orgId),
      getInventoryItems(orgId),
      getChartOfAccounts(orgId),
      getSalesInvoices(orgId),
      getPurchaseInvoices(orgId),
      getPOSTransactions(orgId),
      getVouchers(orgId),
      getExchangeRates(orgId)
    ]);
    
    return true;
  } catch (error) {
    console.error('[OfflineData] Failed to refresh all data:', error);
    return false;
  }
}
