import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { 
  AlertTriangle, RefreshCw, Trash2, Check, X, 
  Clock, CloudOff, Upload, SkipForward, CheckCircle2,
  GitMerge, Server, Laptop, AlertCircle
} from 'lucide-react';
import db from '../lib/db';
import { SYNC_STATUS, CONFLICT_TYPES, syncAllPending, clearFailedOperations, resolveConflict } from '../lib/syncService';
import { formatDateTime } from '../lib/utils';

const SyncConflictDialog = ({ open, onClose, onResolved }) => {
  const [failedOperations, setFailedOperations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [expandedOp, setExpandedOp] = useState(null);

  useEffect(() => {
    if (open) {
      loadFailedOperations();
    }
  }, [open]);

  const loadFailedOperations = async () => {
    setLoading(true);
    try {
      const failed = await db.syncQueue
        .where('status')
        .equals(SYNC_STATUS.FAILED)
        .toArray();
      setFailedOperations(failed);
    } catch (error) {
      console.error('Error loading failed operations:', error);
    }
    setLoading(false);
  };

  const handleRetry = async (operation) => {
    setRetrying(operation.id);
    try {
      // Reset status to pending for retry
      await db.syncQueue.update(operation.id, { 
        status: SYNC_STATUS.PENDING,
        retryCount: 0 
      });
      
      // Trigger sync
      await syncAllPending();
      
      // Reload list
      await loadFailedOperations();
    } catch (error) {
      console.error('Retry failed:', error);
    }
    setRetrying(null);
  };

  const handleDiscard = async (operation) => {
    try {
      await db.syncQueue.delete(operation.id);
      await loadFailedOperations();
    } catch (error) {
      console.error('Error discarding operation:', error);
    }
  };

  const handleResolveConflict = async (operation, resolution) => {
    setRetrying(operation.id);
    try {
      await resolveConflict(operation.id, resolution);
      
      // If keeping local, retry sync
      if (resolution === 'keep_local') {
        await syncAllPending();
      }
      
      await loadFailedOperations();
      
      if (failedOperations.length <= 1) {
        onResolved?.();
      }
    } catch (error) {
      console.error('Error resolving conflict:', error);
    }
    setRetrying(null);
  };

  const handleRetryAll = async () => {
    setResolving(true);
    try {
      // Reset all failed operations to pending
      for (const op of failedOperations) {
        await db.syncQueue.update(op.id, { 
          status: SYNC_STATUS.PENDING,
          retryCount: 0 
        });
      }
      
      // Trigger sync
      await syncAllPending();
      
      // Reload list
      await loadFailedOperations();
    } catch (error) {
      console.error('Retry all failed:', error);
    }
    setResolving(false);
  };

  const handleDiscardAll = async () => {
    if (!window.confirm('Are you sure you want to discard all failed operations? This cannot be undone.')) {
      return;
    }
    
    setResolving(true);
    try {
      for (const op of failedOperations) {
        await db.syncQueue.delete(op.id);
      }
      await loadFailedOperations();
      onResolved?.();
    } catch (error) {
      console.error('Error discarding all:', error);
    }
    setResolving(false);
  };

  const getOperationIcon = (type) => {
    const icons = {
      salesInvoices: '🧾',
      purchaseInvoices: '📦',
      posTransactions: '🛒',
      vouchers: '📋',
      customers: '👤',
      suppliers: '🏭',
      inventoryItems: '📦',
      serviceItems: '⚙️',
      crdbNotes: '📝',
      accounts: '📊'
    };
    return icons[type] || '📄';
  };

  const getActionLabel = (action) => {
    const labels = {
      create: 'Create',
      update: 'Update',
      delete: 'Delete'
    };
    return labels[action] || action;
  };

  const getTypeLabel = (type) => {
    const labels = {
      salesInvoices: 'Sales Invoice',
      purchaseInvoices: 'Purchase Invoice',
      posTransactions: 'POS Transaction',
      vouchers: 'Voucher',
      customers: 'Customer',
      suppliers: 'Supplier',
      inventoryItems: 'Inventory Item',
      serviceItems: 'Service Item',
      crdbNotes: 'Cr/Db Note',
      accounts: 'Account'
    };
    return labels[type] || type;
  };

  const getConflictLabel = (conflictType) => {
    const labels = {
      [CONFLICT_TYPES.SERVER_MODIFIED]: 'Modified on server',
      [CONFLICT_TYPES.DELETED_ON_SERVER]: 'Deleted on server',
      [CONFLICT_TYPES.DUPLICATE]: 'Already exists',
      [CONFLICT_TYPES.VALIDATION]: 'Validation error'
    };
    return labels[conflictType] || 'Unknown conflict';
  };

  const isConflict = (op) => op.conflictType && Object.values(CONFLICT_TYPES).includes(op.conflictType);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Sync Issues
          </DialogTitle>
          <DialogDescription>
            The following operations need attention. Resolve conflicts or retry failed operations.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : failedOperations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
            <p className="text-lg font-medium">All Synced!</p>
            <p className="text-sm text-muted-foreground">All operations have been synced successfully.</p>
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-[400px] pr-4">
              <div className="space-y-3">
                {failedOperations.map((op) => {
                  const data = JSON.parse(op.data || '{}');
                  const serverData = op.serverData ? JSON.parse(op.serverData) : null;
                  const isExpanded = expandedOp === op.id;
                  const hasConflict = isConflict(op);
                  
                  return (
                    <div 
                      key={op.id} 
                      className={`p-4 bg-card border rounded-lg ${hasConflict ? 'border-yellow-500/50' : 'border-border'}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{getOperationIcon(op.type)}</span>
                            <span className="font-medium">{getActionLabel(op.action)}</span>
                            <span className="text-muted-foreground">{getTypeLabel(op.type)}</span>
                            {hasConflict && (
                              <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full flex items-center gap-1">
                                <GitMerge className="w-3 h-3" />
                                Conflict
                              </span>
                            )}
                          </div>
                          
                          <div className="text-sm text-muted-foreground mb-2">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {formatDateTime(op.timestamp)}
                          </div>
                          
                          {op.lastError && (
                            <div className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded mb-2 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              {hasConflict ? getConflictLabel(op.conflictType) : op.lastError}
                            </div>
                          )}
                          
                          <div className="text-xs text-muted-foreground">
                            ID: {op.entityId?.substring(0, 8)}...
                            {op.retryCount > 0 && (
                              <span className="ml-2">• Retries: {op.retryCount}</span>
                            )}
                          </div>
                          
                          {/* Conflict Resolution Options */}
                          {hasConflict && (
                            <div className="mt-3 pt-3 border-t border-border">
                              <p className="text-xs text-muted-foreground mb-2">Resolve this conflict:</p>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleResolveConflict(op, 'keep_local')}
                                  disabled={retrying === op.id}
                                  className="text-xs"
                                >
                                  <Laptop className="w-3 h-3 mr-1" />
                                  Keep My Changes
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleResolveConflict(op, 'keep_server')}
                                  disabled={retrying === op.id}
                                  className="text-xs"
                                >
                                  <Server className="w-3 h-3 mr-1" />
                                  Use Server Version
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setExpandedOp(isExpanded ? null : op.id)}
                                  className="text-xs"
                                >
                                  {isExpanded ? 'Hide Details' : 'View Details'}
                                </Button>
                              </div>
                              
                              {/* Expanded Details */}
                              {isExpanded && (
                                <div className="mt-3 grid grid-cols-2 gap-3">
                                  <div className="p-2 bg-blue-500/10 rounded text-xs">
                                    <div className="font-medium text-blue-400 mb-1 flex items-center gap-1">
                                      <Laptop className="w-3 h-3" /> Your Version
                                    </div>
                                    <pre className="text-[10px] overflow-auto max-h-24 text-muted-foreground">
                                      {JSON.stringify(data, null, 2)}
                                    </pre>
                                  </div>
                                  {serverData && (
                                    <div className="p-2 bg-purple-500/10 rounded text-xs">
                                      <div className="font-medium text-purple-400 mb-1 flex items-center gap-1">
                                        <Server className="w-3 h-3" /> Server Version
                                      </div>
                                      <pre className="text-[10px] overflow-auto max-h-24 text-muted-foreground">
                                        {JSON.stringify(serverData, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {!hasConflict && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRetry(op)}
                              disabled={retrying === op.id}
                            >
                              {retrying === op.id ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              onClick={() => handleDiscard(op)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                {failedOperations.length} issue{failedOperations.length !== 1 ? 's' : ''}
                {failedOperations.filter(isConflict).length > 0 && (
                  <span className="text-yellow-400 ml-1">
                    ({failedOperations.filter(isConflict).length} conflict{failedOperations.filter(isConflict).length !== 1 ? 's' : ''})
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleDiscardAll}
                  disabled={resolving}
                  className="text-red-400"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Discard All
                </Button>
                <Button
                  onClick={handleRetryAll}
                  disabled={resolving}
                >
                  {resolving ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Retry All
                </Button>
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SyncConflictDialog;
