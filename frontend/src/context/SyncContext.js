import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getPendingCount, syncAllPending, getLastSyncTime } from '../lib/syncService';
import { refreshAllData } from '../lib/offlineDataService';
import { initSyncMeta } from '../lib/db';
import { useAuth } from './AuthContext';

const SyncContext = createContext(null);

export const NETWORK_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline'
};

export const SYNC_STATE = {
  IDLE: 'idle',
  SYNCING: 'syncing',
  ERROR: 'error'
};

export const SyncProvider = ({ children }) => {
  const { currentOrg } = useAuth();
  const [networkStatus, setNetworkStatus] = useState(
    navigator.onLine ? NETWORK_STATUS.ONLINE : NETWORK_STATUS.OFFLINE
  );
  const [syncState, setSyncState] = useState(SYNC_STATE.IDLE);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [syncProgress, setSyncProgress] = useState(null);
  
  // Use refs to avoid hook dependency issues
  const syncStateRef = useRef(syncState);
  const networkStatusRef = useRef(networkStatus);
  const currentOrgRef = useRef(currentOrg);
  
  // Keep refs in sync
  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState]);
  
  useEffect(() => {
    networkStatusRef.current = networkStatus;
  }, [networkStatus]);
  
  useEffect(() => {
    currentOrgRef.current = currentOrg;
  }, [currentOrg]);

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch (error) {
      console.error('[SyncContext] Failed to get pending count:', error);
    }
  }, []);

  // Update last sync time
  const updateLastSyncTime = useCallback(async () => {
    try {
      const time = await getLastSyncTime();
      setLastSyncTime(time);
    } catch (error) {
      console.error('[SyncContext] Failed to get last sync time:', error);
    }
  }, []);

  // Trigger sync function
  const triggerSync = useCallback(async () => {
    if (networkStatusRef.current !== NETWORK_STATUS.ONLINE) {
      console.log('[SyncContext] Cannot sync - offline');
      return { success: false, reason: 'offline' };
    }

    if (syncStateRef.current === SYNC_STATE.SYNCING) {
      console.log('[SyncContext] Sync already in progress');
      return { success: false, reason: 'already_syncing' };
    }

    setSyncState(SYNC_STATE.SYNCING);
    setSyncProgress({ total: 0, synced: 0, failed: 0, current: 0 });

    try {
      // Sync pending operations
      const result = await syncAllPending((progress) => {
        setSyncProgress(progress);
      });

      // Refresh data from server
      if (currentOrgRef.current?.id) {
        await refreshAllData(currentOrgRef.current.id);
      }

      setSyncState(SYNC_STATE.IDLE);
      setSyncProgress(null);
      await updatePendingCount();
      await updateLastSyncTime();

      return { success: true, ...result };
    } catch (error) {
      console.error('[SyncContext] Sync failed:', error);
      setSyncState(SYNC_STATE.ERROR);
      setSyncProgress(null);
      return { success: false, error: error.message };
    }
  }, [updatePendingCount, updateLastSyncTime]);

  // Initialize database metadata
  useEffect(() => {
    initSyncMeta();
    updatePendingCount();
    updateLastSyncTime();
  }, [updatePendingCount, updateLastSyncTime]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('[SyncContext] Network online');
      setNetworkStatus(NETWORK_STATUS.ONLINE);
      // Auto-sync when coming back online
      triggerSync();
    };

    const handleOffline = () => {
      console.log('[SyncContext] Network offline');
      setNetworkStatus(NETWORK_STATUS.OFFLINE);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [triggerSync]);

  // Listen for service worker sync messages
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'SYNC_REQUESTED') {
        triggerSync();
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [triggerSync]);

  // Update pending count periodically
  useEffect(() => {
    const interval = setInterval(updatePendingCount, 5000);
    return () => clearInterval(interval);
  }, [updatePendingCount]);

  const isOnline = networkStatus === NETWORK_STATUS.ONLINE;
  const isSyncing = syncState === SYNC_STATE.SYNCING;
  const hasPendingChanges = pendingCount > 0;

  return (
    <SyncContext.Provider
      value={{
        networkStatus,
        syncState,
        pendingCount,
        lastSyncTime,
        syncProgress,
        isOnline,
        isSyncing,
        hasPendingChanges,
        triggerSync,
        updatePendingCount
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};
