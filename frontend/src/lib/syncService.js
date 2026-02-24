import db from './db';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Sync status constants
export const SYNC_STATUS = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  FAILED: 'failed'
};

// Operation types
export const OPERATION_TYPES = {
  SALES_INVOICE: 'salesInvoices',
  PURCHASE_INVOICE: 'purchaseInvoices',
  POS_TRANSACTION: 'posTransactions',
  VOUCHER: 'vouchers',
  CUSTOMER: 'customers',
  SUPPLIER: 'suppliers',
  INVENTORY_ITEM: 'inventoryItems',
  ACCOUNT: 'accounts',
  SERVICE_ITEM: 'serviceItems',
  CRDB_NOTE: 'crdbNotes'
};

// Action types
export const ACTION_TYPES = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete'
};

// Add operation to sync queue
export async function addToSyncQueue(type, action, entityId, data) {
  const operation = {
    type,
    action,
    entityId,
    data: JSON.stringify(data),
    timestamp: new Date().toISOString(),
    status: SYNC_STATUS.PENDING,
    retryCount: 0
  };
  
  await db.syncQueue.add(operation);
  console.log('[SyncService] Added to sync queue:', type, action, entityId);
  
  return operation;
}

// Get pending operations count
export async function getPendingCount() {
  return await db.syncQueue.where('status').equals(SYNC_STATUS.PENDING).count();
}

// Get all pending operations
export async function getPendingOperations() {
  return await db.syncQueue
    .where('status')
    .anyOf([SYNC_STATUS.PENDING, SYNC_STATUS.FAILED])
    .toArray();
}

// Sync a single operation
async function syncOperation(operation) {
  const { type, action, entityId, data } = operation;
  const parsedData = JSON.parse(data);
  
  const endpoints = {
    [OPERATION_TYPES.SALES_INVOICE]: '/sales-invoices',
    [OPERATION_TYPES.PURCHASE_INVOICE]: '/purchase-invoices',
    [OPERATION_TYPES.POS_TRANSACTION]: '/pos/transactions',
    [OPERATION_TYPES.VOUCHER]: '/vouchers',
    [OPERATION_TYPES.CUSTOMER]: '/customers',
    [OPERATION_TYPES.SUPPLIER]: '/suppliers',
    [OPERATION_TYPES.INVENTORY_ITEM]: '/inventory-items',
    [OPERATION_TYPES.ACCOUNT]: '/accounts',
    [OPERATION_TYPES.SERVICE_ITEM]: '/service-items',
    [OPERATION_TYPES.CRDB_NOTE]: '/crdb-notes'
  };
  
  const endpoint = endpoints[type];
  if (!endpoint) {
    throw new Error(`Unknown operation type: ${type}`);
  }
  
  try {
    let response;
    
    switch (action) {
      case ACTION_TYPES.CREATE:
        response = await axios.post(`${API}${endpoint}`, parsedData);
        break;
      case ACTION_TYPES.UPDATE:
        response = await axios.put(`${API}${endpoint}/${entityId}`, parsedData);
        break;
      case ACTION_TYPES.DELETE:
        response = await axios.delete(`${API}${endpoint}/${entityId}`);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    return response.data;
  } catch (error) {
    console.error('[SyncService] Failed to sync operation:', error);
    
    // Check for conflict errors (409 or specific error messages)
    if (error.response?.status === 409 || 
        error.response?.data?.detail?.includes('conflict') ||
        error.response?.data?.detail?.includes('modified')) {
      error.isConflict = true;
      error.serverData = error.response?.data?.serverData;
    }
    
    throw error;
  }
}

// Conflict types
export const CONFLICT_TYPES = {
  SERVER_MODIFIED: 'server_modified',  // Server data changed while offline
  DELETED_ON_SERVER: 'deleted_on_server',  // Entity was deleted on server
  DUPLICATE: 'duplicate',  // Entity already exists
  VALIDATION: 'validation'  // Data validation failed
};

// Detect conflict type from error
function detectConflictType(error) {
  const status = error.response?.status;
  const message = error.response?.data?.detail || '';
  
  if (status === 404) return CONFLICT_TYPES.DELETED_ON_SERVER;
  if (status === 409) return CONFLICT_TYPES.SERVER_MODIFIED;
  if (message.includes('already exists') || message.includes('duplicate')) return CONFLICT_TYPES.DUPLICATE;
  if (status === 422) return CONFLICT_TYPES.VALIDATION;
  
  return null;
}

// Sync all pending operations with conflict handling
export async function syncAllPending(onProgress, onConflict) {
  const operations = await getPendingOperations();
  const total = operations.length;
  let synced = 0;
  let failed = 0;
  const conflicts = [];
  
  for (const operation of operations) {
    try {
      // Update status to syncing
      await db.syncQueue.update(operation.id, { status: SYNC_STATUS.SYNCING });
      
      // Attempt sync
      await syncOperation(operation);
      
      // Success - remove from queue
      await db.syncQueue.delete(operation.id);
      synced++;
      
    } catch (error) {
      const conflictType = detectConflictType(error);
      
      if (conflictType) {
        // This is a conflict - save details for resolution
        const conflictInfo = {
          operationId: operation.id,
          type: operation.type,
          action: operation.action,
          entityId: operation.entityId,
          localData: JSON.parse(operation.data),
          serverData: error.response?.data?.serverData || null,
          conflictType,
          errorMessage: error.response?.data?.detail || error.message,
          timestamp: operation.timestamp
        };
        
        conflicts.push(conflictInfo);
        
        // Update operation with conflict info
        await db.syncQueue.update(operation.id, {
          status: SYNC_STATUS.FAILED,
          retryCount: operation.retryCount + 1,
          lastError: `Conflict: ${conflictType}`,
          conflictType,
          serverData: JSON.stringify(error.response?.data?.serverData || null)
        });
        
        // Notify about conflict
        if (onConflict) {
          onConflict(conflictInfo);
        }
      } else {
        // Regular failure
        await db.syncQueue.update(operation.id, {
          status: SYNC_STATUS.FAILED,
          retryCount: operation.retryCount + 1,
          lastError: error.response?.data?.detail || error.message
        });
      }
      
      failed++;
    }
    
    if (onProgress) {
      onProgress({ total, synced, failed, current: synced + failed });
    }
  }
  
  // Update last sync time
  await db.syncMeta.put({ key: 'lastSync', value: new Date().toISOString() });
  
  return { total, synced, failed, conflicts };
}

// Resolve a conflict by choosing local or server data
export async function resolveConflict(operationId, resolution, customData = null) {
  const operation = await db.syncQueue.get(operationId);
  if (!operation) {
    throw new Error('Operation not found');
  }
  
  switch (resolution) {
    case 'keep_local':
      // Retry with local data (force update)
      await db.syncQueue.update(operationId, {
        status: SYNC_STATUS.PENDING,
        retryCount: 0,
        lastError: null,
        forceUpdate: true
      });
      break;
      
    case 'keep_server':
      // Discard local changes
      await db.syncQueue.delete(operationId);
      break;
      
    case 'merge':
      // Use custom merged data
      if (!customData) {
        throw new Error('Custom data required for merge resolution');
      }
      await db.syncQueue.update(operationId, {
        status: SYNC_STATUS.PENDING,
        retryCount: 0,
        lastError: null,
        data: JSON.stringify(customData),
        forceUpdate: true
      });
      break;
      
    case 'discard':
      // Remove from queue entirely
      await db.syncQueue.delete(operationId);
      break;
      
    default:
      throw new Error(`Unknown resolution: ${resolution}`);
  }
}

// Get all conflicts
export async function getConflicts() {
  return await db.syncQueue
    .where('conflictType')
    .notEqual('')
    .toArray();
}

// Clear failed operations after max retries
export async function clearFailedOperations(maxRetries = 5) {
  const failed = await db.syncQueue
    .where('retryCount')
    .above(maxRetries)
    .toArray();
  
  for (const op of failed) {
    await db.syncQueue.delete(op.id);
  }
  
  return failed.length;
}

// Get last sync time
export async function getLastSyncTime() {
  const meta = await db.syncMeta.get('lastSync');
  return meta?.value || null;
}
