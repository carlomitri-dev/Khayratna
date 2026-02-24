import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { formatUSD } from '../../lib/utils';

/**
 * Reusable Invoice Totals Summary Component
 * Shows subtotal, discount, tax, and total
 */
const InvoiceTotals = ({
  subtotal = 0,
  discountPercent = 0,
  discountAmount = 0,
  taxPercent = 0,
  taxAmount = 0,
  total = 0,
  currency = 'USD',
  exchangeRate = 1,
  showLBP = false,
  lbpRate = 89500,
  compact = false,
  className = ''
}) => {
  const totalLBP = total * lbpRate;

  if (compact) {
    return (
      <div className={`space-y-1 text-sm ${className}`}>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal:</span>
          <span>${formatUSD(subtotal)}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-red-400">
            <span>Discount ({discountPercent}%):</span>
            <span>-${formatUSD(discountAmount)}</span>
          </div>
        )}
        {taxAmount > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax ({taxPercent}%):</span>
            <span>${formatUSD(taxAmount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-lg pt-2 border-t">
          <span>Total:</span>
          <span className="text-green-400">${formatUSD(total)}</span>
        </div>
        {showLBP && (
          <div className="flex justify-between text-muted-foreground">
            <span>LBP:</span>
            <span>{totalLBP.toLocaleString()} ل.ل</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Invoice Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal:</span>
          <span className="font-medium">${formatUSD(subtotal)}</span>
        </div>
        
        {discountAmount > 0 && (
          <div className="flex justify-between text-red-400">
            <span>Discount ({discountPercent}%):</span>
            <span>-${formatUSD(discountAmount)}</span>
          </div>
        )}
        
        {taxAmount > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax ({taxPercent}%):</span>
            <span>${formatUSD(taxAmount)}</span>
          </div>
        )}
        
        <div className="border-t pt-2">
          <div className="flex justify-between text-lg font-bold">
            <span>Total (USD):</span>
            <span className="text-green-400">${formatUSD(total)}</span>
          </div>
          {showLBP && (
            <div className="flex justify-between text-muted-foreground mt-1">
              <span>Total (LBP):</span>
              <span>{totalLBP.toLocaleString()} ل.ل</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default InvoiceTotals;
