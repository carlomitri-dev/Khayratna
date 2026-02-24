/**
 * Searchable Account Selector Component
 * Used for selecting accounts with search functionality
 * Features: Search by code/name, display balance, clear selection
 */
import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Search, X } from 'lucide-react';
import { formatUSD } from '../../lib/utils';

const SearchableAccountSelector = ({
  accounts,
  value,
  valueName,
  onChange,
  label,
  labelColor = 'text-cyan-400',
  placeholder = 'Search by code or name...',
  required = false,
  showBalance = true,
  maxResults = 10
}) => {
  const [search, setSearch] = useState('');

  const filteredAccounts = accounts.filter(acc =>
    acc.code.toLowerCase().includes(search.toLowerCase()) ||
    acc.name.toLowerCase().includes(search.toLowerCase()) ||
    (acc.name_ar && acc.name_ar.includes(search))
  ).slice(0, maxResults);

  const handleSelect = (acc) => {
    onChange(acc.code, acc.name);
    setSearch('');
  };

  const handleClear = () => {
    onChange('', '');
    setSearch('');
  };

  return (
    <div className="space-y-2">
      {label && (
        <Label className="flex items-center gap-1">
          <span className={labelColor}>{label}</span>
          {required && '*'}
        </Label>
      )}
      <div className="relative">
        <div className="flex items-center border rounded-md bg-background">
          <Search className="w-4 h-4 ml-2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        
        {/* Selected Account Display */}
        {value && (
          <div className="mt-1 p-2 bg-muted/50 rounded text-sm flex items-center justify-between">
            <span>
              <span className="font-mono text-cyan-400">{value}</span>
              <span className="ml-2">{valueName}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleClear}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}
        
        {/* Search Results Dropdown */}
        {search && !value && (
          <div className="absolute z-50 w-full mt-1 max-h-48 overflow-auto bg-popover border rounded-md shadow-lg">
            {filteredAccounts.length === 0 ? (
              <div className="px-3 py-2 text-muted-foreground text-sm">No accounts found</div>
            ) : (
              filteredAccounts.map(acc => (
                <div
                  key={acc.id}
                  className="px-3 py-2 cursor-pointer hover:bg-accent flex items-center justify-between"
                  onClick={() => handleSelect(acc)}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-cyan-400">{acc.code}</span>
                    <span className="text-sm">{acc.name}</span>
                  </span>
                  {showBalance && (
                    <span className={`text-xs ${(acc.balance_usd || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${formatUSD(Math.abs(acc.balance_usd || 0))}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchableAccountSelector;
