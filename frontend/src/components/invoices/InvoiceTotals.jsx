/**
 * Invoice Totals Component
 * Displays subtotal, discount, tax, and total for invoices
 */
import React from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { formatUSD } from '../../lib/utils';

const InvoiceTotals = ({
  formData,
  setFormData,
  onDiscountChange,
  onTaxChange,
  readOnly = false
}) => {
  return (
    <div className="bg-muted/30 rounded-sm p-3 space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal (USD)</span>
        <span className="font-mono">${formatUSD(formData.subtotal)}</span>
      </div>
      
      {!readOnly ? (
        <>
          <div className="flex justify-between items-center gap-2">
            <Label className="text-sm text-muted-foreground">Discount %</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={formData.discount_percent}
              onChange={(e) => onDiscountChange(parseFloat(e.target.value) || 0)}
              className="w-20 h-7 text-xs text-right"
            />
          </div>
          <div className="flex justify-between text-sm text-red-400">
            <span>Discount Amount</span>
            <span className="font-mono">-${formatUSD(formData.discount_amount)}</span>
          </div>
          
          <div className="flex justify-between items-center gap-2">
            <Label className="text-sm text-muted-foreground">Tax %</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={formData.tax_percent}
              onChange={(e) => onTaxChange(parseFloat(e.target.value) || 0)}
              className="w-20 h-7 text-xs text-right"
            />
          </div>
          <div className="flex justify-between text-sm text-cyan-400">
            <span>Tax Amount</span>
            <span className="font-mono">+${formatUSD(formData.tax_amount)}</span>
          </div>
        </>
      ) : (
        <>
          {formData.discount_percent > 0 && (
            <div className="flex justify-between text-sm text-red-400">
              <span>Discount ({formData.discount_percent}%)</span>
              <span className="font-mono">-${formatUSD(formData.discount_amount)}</span>
            </div>
          )}
          {formData.tax_percent > 0 && (
            <div className="flex justify-between text-sm text-cyan-400">
              <span>Tax ({formData.tax_percent}%)</span>
              <span className="font-mono">+${formatUSD(formData.tax_amount)}</span>
            </div>
          )}
        </>
      )}
      
      <div className="flex justify-between text-base font-bold pt-2 border-t border-border">
        <span>Total (USD)</span>
        <span className="font-mono text-green-400">${formatUSD(formData.total_usd)}</span>
      </div>
    </div>
  );
};

export default InvoiceTotals;
