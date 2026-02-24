import React, { useState, useMemo } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Search, ChevronsUpDown, User, Building2 } from 'lucide-react';
import { formatUSD } from '../../lib/utils';

/**
 * Reusable Account Selector Component
 * Used for selecting customers, suppliers, or any account type
 */
const AccountSelector = ({
  accounts = [],
  value,
  onChange,
  label,
  labelIcon: LabelIcon,
  labelColor = 'text-cyan-400',
  placeholder = 'Select account...',
  showBalance = true,
  showCode = true,
  accountType = 'customer', // 'customer', 'supplier', 'account'
  disabled = false,
  className = '',
  required = false
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredAccounts = useMemo(() => {
    if (!search) return accounts;
    const searchLower = search.toLowerCase();
    return accounts.filter(acc =>
      acc.name?.toLowerCase().includes(searchLower) ||
      acc.code?.toLowerCase().includes(searchLower) ||
      (acc.name_ar && acc.name_ar.includes(search))
    );
  }, [accounts, search]);

  const selectedAccount = accounts.find(acc => acc.id === value);

  const handleSelect = (account) => {
    onChange(account.id);
    setOpen(false);
    setSearch('');
  };

  const getIcon = () => {
    if (LabelIcon) return <LabelIcon className={`w-3 h-3 ${labelColor}`} />;
    switch (accountType) {
      case 'customer':
        return <User className="w-3 h-3 text-cyan-400" />;
      case 'supplier':
        return <Building2 className="w-3 h-3 text-orange-400" />;
      default:
        return <Building2 className="w-3 h-3 text-muted-foreground" />;
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <Label className="flex items-center gap-1">
          {getIcon()}
          {label}
          {required && <span className="text-red-400">*</span>}
        </Label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className="w-full justify-between h-9 text-sm"
            disabled={disabled}
          >
            <span className="truncate flex items-center gap-2">
              {selectedAccount ? (
                <>
                  {showCode && <span className="font-mono text-cyan-400 text-xs">{selectedAccount.code}</span>}
                  <span className="truncate">{selectedAccount.name}</span>
                  {showBalance && selectedAccount.balance_usd !== undefined && (
                    <span className={`text-[10px] px-1 rounded ${(selectedAccount.balance_usd || 0) >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      ${formatUSD(Math.abs(selectedAccount.balance_usd || 0))}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[350px] p-0" align="start">
          <div className="p-2 border-b">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${accountType}s...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-0 focus-visible:ring-0 h-8"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {filteredAccounts.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No {accountType}s found
              </div>
            ) : (
              filteredAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className={`flex items-center p-2 cursor-pointer hover:bg-muted border-b border-border/50 ${value === acc.id ? 'bg-muted' : ''}`}
                  onClick={() => handleSelect(acc)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {showCode && <span className="font-mono text-sm text-cyan-400">{acc.code}</span>}
                      <span className="font-medium text-sm truncate">{acc.name}</span>
                    </div>
                  </div>
                  {showBalance && acc.balance_usd !== undefined && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ml-2 ${(acc.balance_usd || 0) >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      ${formatUSD(Math.abs(acc.balance_usd || 0))}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default AccountSelector;
