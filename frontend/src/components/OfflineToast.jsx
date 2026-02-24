import React, { useEffect, useRef } from 'react';
import { useSync } from '../context/SyncContext';
import { toast } from 'sonner';

/**
 * Component that shows toast notifications for online/offline state changes
 * This component doesn't render anything visible - it just manages toasts
 */
const OfflineToast = () => {
  const { isOnline, pendingCount, isSyncing } = useSync();
  const prevOnline = useRef(isOnline);
  const prevSyncing = useRef(isSyncing);

  useEffect(() => {
    // Detect online -> offline transition
    if (prevOnline.current && !isOnline) {
      toast.error('You are offline', {
        description: 'Changes will be saved locally and synced when back online.',
        duration: 5000,
        id: 'offline-status'
      });
    }
    
    // Detect offline -> online transition
    if (!prevOnline.current && isOnline) {
      toast.success('Back online!', {
        description: pendingCount > 0 
          ? `Syncing ${pendingCount} pending change${pendingCount > 1 ? 's' : ''}...`
          : 'All data is up to date.',
        duration: 3000,
        id: 'online-status'
      });
    }
    
    prevOnline.current = isOnline;
  }, [isOnline, pendingCount]);

  useEffect(() => {
    // Detect sync completion
    if (prevSyncing.current && !isSyncing && isOnline) {
      if (pendingCount === 0) {
        toast.success('Sync complete', {
          description: 'All changes have been saved to the server.',
          duration: 2000,
          id: 'sync-complete'
        });
      }
    }
    
    prevSyncing.current = isSyncing;
  }, [isSyncing, isOnline, pendingCount]);

  // This component doesn't render anything visible
  return null;
};

export default OfflineToast;
