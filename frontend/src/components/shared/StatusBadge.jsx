/**
 * Status Badge Component
 * Consistent status display across the application
 */
import React from 'react';
import { Badge } from '../ui/badge';
import { Check, X, Clock, AlertTriangle, FileText } from 'lucide-react';

const statusConfig = {
  posted: {
    label: 'Posted',
    variant: 'default',
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: Check
  },
  draft: {
    label: 'Draft',
    variant: 'outline',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    icon: FileText
  },
  pending: {
    label: 'Pending',
    variant: 'outline',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    icon: Clock
  },
  cancelled: {
    label: 'Cancelled',
    variant: 'destructive',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: X
  },
  completed: {
    label: 'Completed',
    variant: 'default',
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: Check
  },
  void: {
    label: 'Void',
    variant: 'destructive',
    className: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    icon: X
  },
  overdue: {
    label: 'Overdue',
    variant: 'destructive',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: AlertTriangle
  }
};

const StatusBadge = ({
  status,
  customLabel,
  showIcon = true,
  size = 'sm'
}) => {
  const config = statusConfig[status?.toLowerCase()] || statusConfig.draft;
  const Icon = config.icon;
  const label = customLabel || config.label;

  return (
    <Badge 
      variant={config.variant}
      className={`${config.className} ${size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'}`}
    >
      {showIcon && Icon && <Icon className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} mr-1`} />}
      {label}
    </Badge>
  );
};

export default StatusBadge;
