import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Loader2 } from 'lucide-react';

/**
 * Reusable Invoice Line Item Component
 * Used in Sales Invoice, Purchase Invoice pages
 */
const InvoiceLineItem = ({
  line,
  index,
  onUpdate,
  onRemove,
  isEditing = true,
  showCost = false,
  currency = 'USD',
  exchangeRate = 1
}) => {
  const handleQuantityChange = (value) => {
    const qty = parseFloat(value) || 0;
    onUpdate(index, {
      ...line,
      quantity: qty,
      line_total: qty * (line.unit_price || 0) * (1 - (line.discount_percent || 0) / 100)
    });
  };

  const handlePriceChange = (value) => {
    const price = parseFloat(value) || 0;
    onUpdate(index, {
      ...line,
      unit_price: price,
      line_total: (line.quantity || 0) * price * (1 - (line.discount_percent || 0) / 100)
    });
  };

  const handleDiscountChange = (value) => {
    const discount = parseFloat(value) || 0;
    onUpdate(index, {
      ...line,
      discount_percent: discount,
      line_total: (line.quantity || 0) * (line.unit_price || 0) * (1 - discount / 100)
    });
  };

  return (
    <div className="grid grid-cols-12 gap-2 items-center p-2 bg-card/50 rounded border border-border/50">
      {/* Item Name */}
      <div className="col-span-4 lg:col-span-3">
        <span className="font-medium text-sm truncate block">{line.item_name}</span>
        {line.item_name_ar && (
          <span className="text-xs text-muted-foreground truncate block" dir="rtl">
            {line.item_name_ar}
          </span>
        )}
      </div>

      {/* Quantity */}
      <div className="col-span-2 lg:col-span-1">
        {isEditing ? (
          <input
            type="number"
            min="1"
            value={line.quantity}
            onChange={(e) => handleQuantityChange(e.target.value)}
            className="w-full text-center text-sm bg-background border rounded p-1"
          />
        ) : (
          <span className="text-sm text-center block">{line.quantity}</span>
        )}
      </div>

      {/* Unit Price */}
      <div className="col-span-2">
        {isEditing ? (
          <input
            type="number"
            min="0"
            step="0.01"
            value={line.unit_price}
            onChange={(e) => handlePriceChange(e.target.value)}
            className="w-full text-right text-sm bg-background border rounded p-1"
          />
        ) : (
          <span className="text-sm text-right block">${(line.unit_price || 0).toFixed(2)}</span>
        )}
      </div>

      {/* Discount */}
      <div className="col-span-1 hidden lg:block">
        {isEditing ? (
          <input
            type="number"
            min="0"
            max="100"
            value={line.discount_percent || 0}
            onChange={(e) => handleDiscountChange(e.target.value)}
            className="w-full text-center text-sm bg-background border rounded p-1"
          />
        ) : (
          <span className="text-sm text-center block">{line.discount_percent || 0}%</span>
        )}
      </div>

      {/* Line Total */}
      <div className="col-span-2">
        <span className="text-sm text-right block font-medium text-green-400">
          ${(line.line_total || 0).toFixed(2)}
        </span>
      </div>

      {/* Remove Button */}
      {isEditing && (
        <div className="col-span-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(index)}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1 h-7 w-7"
          >
            ×
          </Button>
        </div>
      )}
    </div>
  );
};

export default InvoiceLineItem;
