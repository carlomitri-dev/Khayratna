import React, { useState } from 'react';
import { useSync, NETWORK_STATUS, SYNC_STATE } from '../context/SyncContext';
import { Wifi, WifiOff, RefreshCw, Cloud, CloudOff, AlertCircle, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { formatDateTime } from '../lib/utils';
import SyncConflictDialog from './SyncConflictDialog';
import db from '../lib/db';
import { SYNC_STATUS } from '../lib/syncService';

const SyncStatusIndicator = () => {
  const {
    networkStatus,
    syncState,
    pendingCount,
    lastSyncTime,
    isOnline,
    isSyncing,
    hasPendingChanges,
    triggerSync,
    updatePendingCount
  } = useSync();
  
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [failedCount, setFailedCount] = useState(0);

  // Check for failed operations periodically
  React.useEffect(() => {
    const checkFailed = async () => {
      try {
        const count = await db.syncQueue
          .where('status')
          .equals(SYNC_STATUS.FAILED)
          .count();
        setFailedCount(count);
      } catch (e) {
        console.error('Error checking failed count:', e);
      }
    };
    
    checkFailed();
    const interval = setInterval(checkFailed, 5000);
    return () => clearInterval(interval);
  }, []);

  // Determine display state
  const getStatusConfig = () => {
    // Show error state if there are failed operations
    if (failedCount > 0) {
      return {
        icon: AlertTriangle,
        color: 'text-orange-500',
        bgColor: 'bg-orange-500/10',
        label: 'Conflicts',
        description: `${failedCount} operation${failedCount > 1 ? 's' : ''} failed to sync`,
        showConflict: true
      };
    }
    
    if (!isOnline) {
      return {
        icon: WifiOff,
        color: 'text-red-500',
        bgColor: 'bg-red-500/10',
        label: 'Offline',
        description: hasPendingChanges 
          ? `${pendingCount} pending change${pendingCount > 1 ? 's' : ''}` 
          : 'No internet connection'
      };
    }

    if (isSyncing) {
      return {
        icon: RefreshCw,
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500/10',
        label: 'Syncing...',
        description: 'Synchronizing data',
        animate: true
      };
    }

    if (hasPendingChanges) {
      return {
        icon: Cloud,
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500/10',
        label: 'Pending',
        description: `${pendingCount} change${pendingCount > 1 ? 's' : ''} to sync`
      };
    }

    if (syncState === SYNC_STATE.ERROR) {
      return {
        icon: AlertCircle,
        color: 'text-orange-500',
        bgColor: 'bg-orange-500/10',
        label: 'Sync Error',
        description: 'Some changes failed to sync'
      };
    }

    return {
      icon: Wifi,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      label: 'Online',
      description: lastSyncTime 
        ? `Last synced: ${formatDateTime(lastSyncTime)}` 
        : 'All changes synced'
    };
  };

  const status = getStatusConfig();
  const IconComponent = status.icon;

  const handleClick = () => {
    if (status.showConflict) {
      setShowConflictDialog(true);
    } else if (isOnline && !isSyncing) {
      triggerSync();
    }
  };

  const handleConflictResolved = () => {
    updatePendingCount();
    setFailedCount(0);
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={`gap-2 px-2 sm:px-3 h-8 ${status.bgColor}`}
              onClick={handleClick}
              disabled={!isOnline && !status.showConflict}
            >
              <IconComponent 
                className={`w-4 h-4 ${status.color} ${status.animate ? 'animate-spin' : ''}`} 
              />
              <span className={`text-xs font-medium ${status.color} hidden sm:inline`}>
                {status.label}
              </span>
              {(hasPendingChanges || failedCount > 0) && !isSyncing && (
                <span className={`flex items-center justify-center w-5 h-5 text-xs font-bold text-white rounded-full ${failedCount > 0 ? 'bg-orange-500' : 'bg-yellow-500'}`}>
                  {failedCount > 0 ? failedCount : pendingCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[200px]">
            <div className="text-sm">
              <p className="font-medium">{status.label}</p>
              <p className="text-muted-foreground text-xs mt-1">{status.description}</p>
              {status.showConflict && (
                <p className="text-xs mt-2 text-orange-400">Click to resolve conflicts</p>
              )}
              {isOnline && !isSyncing && hasPendingChanges && !status.showConflict && (
                <p className="text-xs mt-2 text-primary">Click to sync now</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      <SyncConflictDialog 
        open={showConflictDialog} 
        onClose={() => setShowConflictDialog(false)}
        onResolved={handleConflictResolved}
      />
    </>
  );
};

export default SyncStatusIndicator;
