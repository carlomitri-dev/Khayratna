import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Search, ChevronsUpDown, User, Building2, Loader2 } from 'lucide-react';
import { formatUSD } from '../../lib/utils';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Reusable Account Selector Component with Remote Search
 * When fetchUrl is provided, it fetches accounts from API on search (true remote search).
 * When accounts array is provided, it filters locally (legacy mode).
 */
const AccountSelector = ({
  accounts: localAccounts = [],
  value,
  onChange,
  label,
  labelIcon: LabelIcon,
  labelColor = 'text-cyan-400',
  placeholder = 'Select account...',
  showBalance = true,
  showCode = true,
  accountType = 'customer',
  disabled = false,
  className = '',
  required = false,
  fetchUrl = null,       // e.g., '/customer-accounts' or '/accounts/movable/list'
  fetchParams = {},      // e.g., { organization_id: '...' }
  minSearchLength = 1,   // minimum chars before searching remotely
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [remoteAccounts, setRemoteAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [selectedCache, setSelectedCache] = useState(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  const isRemote = !!fetchUrl;

  // For remote mode: fetch initial small set when opening dropdown
  const fetchAccounts = useCallback(async (searchTerm = '') => {
    if (!fetchUrl) return;
    
    // Cancel previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();
    
    setLoading(true);
    try {
      const params = new URLSearchParams(fetchParams);
      if (searchTerm) {
        params.set('search', searchTerm);
      }
      const res = await axios.get(`${API}${fetchUrl}?${params.toString()}`, {
        signal: abortRef.current.signal
      });
      const data = Array.isArray(res.data) ? res.data : (res.data?.accounts || res.data?.data || []);
      setRemoteAccounts(data);
      if (!initialLoaded) setInitialLoaded(true);
    } catch (error) {
      if (error.name !== 'CanceledError' && error.name !== 'AbortError') {
        console.error('Failed to fetch accounts:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchUrl, fetchParams]);

  // When dropdown opens, load initial set
  useEffect(() => {
    if (open && isRemote && !initialLoaded) {
      fetchAccounts('');
    }
  }, [open, isRemote, initialLoaded, fetchAccounts]);

  // Debounced remote search
  useEffect(() => {
    if (!isRemote || !open) return;
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      if (search.length >= minSearchLength || search.length === 0) {
        fetchAccounts(search);
      }
    }, 300);
    
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, isRemote, open, minSearchLength, fetchAccounts]);

  // Determine which accounts to show
  const accounts = isRemote ? remoteAccounts : localAccounts;

  // For local mode, filter client-side
  const displayAccounts = isRemote
    ? accounts
    : (() => {
        let filtered = accounts;
        if (search) {
          const searchLower = search.toLowerCase();
          filtered = accounts.filter(acc =>
            acc.name?.toLowerCase().includes(searchLower) ||
            acc.code?.toLowerCase().includes(searchLower) ||
            (acc.name_ar && acc.name_ar.includes(search))
          );
        }
        return filtered.slice(0, 100);
      })();

  // Find selected account - check local, remote, and cache
  const selectedAccount = accounts.find(acc => acc.id === value)
    || localAccounts.find(acc => acc.id === value)
    || selectedCache;

  // When selecting remotely, cache the selected account info for display
  const handleSelect = (account) => {
    onChange(account.id);
    setSelectedCache(account);
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
            data-testid="account-selector-trigger"
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
        <PopoverContent className="w-[400px] p-0" align="start">
          <div className="p-2 border-b">
            <div className="flex items-center gap-2">
              {loading ? (
                <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
              ) : (
                <Search className="w-4 h-4 text-muted-foreground" />
              )}
              <Input
                placeholder={isRemote ? `Type to search ${accountType}s...` : `Search ${accountType}s...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-0 focus-visible:ring-0 h-8"
                autoFocus
                data-testid="account-selector-search"
              />
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {loading && displayAccounts.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </div>
            ) : displayAccounts.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                {isRemote && search.length < minSearchLength
                  ? `Type ${minSearchLength}+ chars to search`
                  : `No ${accountType}s found`}
              </div>
            ) : (
              <>
                {displayAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className={`flex items-center p-2 cursor-pointer hover:bg-muted border-b border-border/50 transition-colors ${value === acc.id ? 'bg-muted' : ''}`}
                    onClick={() => handleSelect(acc)}
                    data-testid={`account-option-${acc.code}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {showCode && <span className="font-mono text-sm text-cyan-400">{acc.code}</span>}
                        <span className="font-medium text-sm truncate">{acc.name}</span>
                      </div>
                    </div>
                    {showBalance && acc.balance_usd !== undefined && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ml-2 whitespace-nowrap ${(acc.balance_usd || 0) >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        ${formatUSD(Math.abs(acc.balance_usd || 0))}
                      </span>
                    )}
                  </div>
                ))}
                {displayAccounts.length >= 100 && (
                  <div className="p-2 text-center text-xs text-muted-foreground bg-muted/30">
                    {isRemote ? 'Type more to narrow results' : 'Type to search for more'}
                  </div>
                )}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default AccountSelector;
