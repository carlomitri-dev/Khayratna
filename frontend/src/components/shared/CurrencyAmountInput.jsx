/**
 * Currency Amount Input Component
 * Combines currency selector with amount and exchange rate inputs
 */
import React from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

const CurrencyAmountInput = ({
  currency,
  amount,
  exchangeRate,
  onCurrencyChange,
  onAmountChange,
  onExchangeRateChange,
  currencies = ['USD', 'LBP'],
  showExchangeRate = true,
  amountLabel = 'Amount',
  currencyLabel = 'Currency',
  exchangeRateLabel = 'Exchange Rate'
}) => {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="space-y-2">
        <Label>{currencyLabel}</Label>
        <Select value={currency} onValueChange={onCurrencyChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currencies.map(curr => (
              <SelectItem key={curr} value={curr}>{curr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{amountLabel} *</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => onAmountChange(parseFloat(e.target.value) || 0)}
          placeholder="0.00"
        />
      </div>
      {showExchangeRate && (
        <div className="space-y-2">
          <Label>{exchangeRateLabel}</Label>
          <Input
            type="number"
            step="1"
            min="1"
            value={exchangeRate}
            onChange={(e) => onExchangeRateChange(parseFloat(e.target.value) || 1)}
            placeholder="89500"
          />
        </div>
      )}
    </div>
  );
};

export default CurrencyAmountInput;
