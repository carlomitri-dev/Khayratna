/**
 * POS Quick Item Button Component
 * Displays a clickable button for quick item selection in POS
 */
import React from 'react';
import { formatUSD } from '../../lib/utils';

const QuickItemButton = ({ item, onClick }) => (
  <button
    onClick={() => onClick(item)}
    className="p-3 bg-card border border-border rounded-lg hover:bg-muted transition-colors text-left"
  >
    <div className="text-xs font-mono text-cyan-400 truncate">{item.barcode || 'N/A'}</div>
    <div className="text-sm font-medium truncate">{item.name}</div>
    <div className="text-xs text-muted-foreground">{item.currency || 'USD'} {formatUSD(item.price)}</div>
    <div className="text-xs text-muted-foreground">Stock: {item.on_hand_qty}</div>
  </button>
);

export default QuickItemButton;
