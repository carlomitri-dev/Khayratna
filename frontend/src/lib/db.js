import Dexie from 'dexie';

// Initialize IndexedDB database
export const db = new Dexie('KairosDB');

// Define database schema - mirrors MongoDB collections
db.version(3).stores({
  // Core data collections
  customers: 'id, name, organization_id',
  suppliers: 'id, name, organization_id',
  inventoryItems: 'id, name, sku, organization_id',
  chartOfAccounts: 'id, code, name, organization_id',
  serviceItems: 'id, name, code, organization_id',
  
  // Transaction collections
  salesInvoices: 'id, invoice_number, customer_id, date, organization_id',
  purchaseInvoices: 'id, invoice_number, supplier_id, date, organization_id',
  posTransactions: 'id, transaction_number, date, organization_id',
  vouchers: 'id, voucher_number, date, organization_id',
  crdbNotes: 'id, note_number, date, organization_id',
  
  // Settings and configuration
  organizations: 'id, name',
  exchangeRates: 'id, date, organization_id',
  currencies: 'id, code, name',
  
  // Sync queue for offline operations with conflict tracking
  syncQueue: '++id, type, action, entityId, timestamp, status, retryCount, conflictType',
  
  // Metadata for sync status
  syncMeta: 'key'
});

// Initialize sync metadata
export async function initSyncMeta() {
  const lastSync = await db.syncMeta.get('lastSync');
  if (!lastSync) {
    await db.syncMeta.put({ key: 'lastSync', value: null });
  }
}

// Export database instance
export default db;
