import React from 'react';
import { useSync } from '../context/SyncContext';
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';

/**
 * Banner that shows at the top of pages when offline or has pending changes
 */
const OfflineBanner = () => {
  const { isOnline, pendingCount, isSyncing, triggerSync } = useSync();

  // Don't show banner if online and no pending changes
  if (isOnline && pendingCount === 0) {
    return null;
  }

  // Offline banner
  if (!isOnline) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 flex items-center gap-3">
        <WifiOff className="w-5 h-5 text-red-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-400">You're offline</p>
          <p className="text-xs text-red-400/70">
            {pendingCount > 0 
              ? `${pendingCount} change${pendingCount > 1 ? 's' : ''} will sync when back online`
              : 'Working with cached data'
            }
          </p>
        </div>
      </div>
    );
  }

  // Online but has pending changes
  if (pendingCount > 0) {
    return (
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-yellow-400">
            {pendingCount} pending change{pendingCount > 1 ? 's' : ''}
          </p>
          <p className="text-xs text-yellow-400/70">Click sync to upload changes</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={triggerSync}
          disabled={isSyncing}
          className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </Button>
      </div>
    );
  }

  return null;
};

export default OfflineBanner;
