/**
 * Account Selector with Balance Display
 * Reusable dropdown for selecting accounts with balance badges
 */
import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { formatUSD } from '../../lib/utils';

const AccountSelector = ({ 
  accounts, 
  value, 
  onChange, 
  placeholder = "Select account",
  showBalance = true 
}) => {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {accounts.map(acc => (
          <SelectItem key={acc.id} value={acc.id}>
            <span className="flex items-center gap-2">
              <span>{acc.code} - {acc.name}</span>
              {showBalance && (
                <span className={`text-[10px] px-1 rounded ${
                  (acc.balance_usd || 0) >= 0 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  ${formatUSD(Math.abs(acc.balance_usd || 0))}
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default AccountSelector;
