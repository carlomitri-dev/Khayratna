import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import { Search, ChevronsUpDown, Check, Loader2 } from 'lucide-react';
import axios from 'axios';
import { formatUSD } from '../../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const RemoteAccountSelector = ({
  value,
  onChange,
  placeholder = 'Select account',
  label,
  organizationId,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  const fetchAccounts = useCallback(async (searchTerm = '') => {
    if (!organizationId) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const params = new URLSearchParams({ organization_id: organizationId });
      if (searchTerm) params.set('search', searchTerm);
      const res = await axios.get(`${API}/accounts/movable/list?${params.toString()}`, {
        signal: abortRef.current.signal,
      });
      setAccounts(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      if (error.name !== 'CanceledError' && error.name !== 'AbortError') {
        console.error('Failed to fetch accounts:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (open && accounts.length === 0) fetchAccounts('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchAccounts(search);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, open]);

  const displaySelected = accounts.find(a => a.code === value) || selectedAccount;

  const formatBalance = (acc) => {
    const bal = acc.balance_usd || 0;
    if (bal === 0) return '$0.00';
    return bal >= 0 ? `$${formatUSD(bal)}` : `-$${formatUSD(Math.abs(bal))}`;
  };

  const triggerClass = compact
    ? 'w-full justify-between h-8 text-xs font-mono'
    : 'w-full justify-between h-10 text-sm';

  const iconSize = compact ? 'h-3 w-3' : 'h-4 w-4';

  const content = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={triggerClass}
          data-testid="account-selector"
        >
          {displaySelected ? (
            <span className="truncate flex items-center gap-2">
              {compact ? (
                <span>{displaySelected.code} - {displaySelected.name}</span>
              ) : (
                <>
                  <span className="font-mono mr-1">{displaySelected.code}</span>
                  <span>{displaySelected.name}</span>
                </>
              )}
              <span className={`text-[10px] px-1 rounded ${(displaySelected.balance_usd || 0) >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {formatBalance(displaySelected)}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className={`ml-2 ${iconSize} shrink-0 opacity-50`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            {loading ? (
              <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
            ) : (
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            )}
            <Input
              placeholder="Type to search accounts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[250px] overflow-y-auto">
          {loading && accounts.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading...
            </div>
          ) : accounts.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Type to search accounts
            </div>
          ) : (
            accounts.map(acc => (
              <div
                key={acc.id}
                className={`flex items-center px-2 py-1.5 cursor-pointer hover:bg-muted text-xs transition-colors ${value === acc.code ? 'bg-muted' : ''}`}
                onClick={() => {
                  onChange(acc.code, acc.name);
                  setSelectedAccount(acc);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <span className="font-mono w-16 flex-shrink-0">{acc.code}</span>
                <span className="truncate flex-1">{acc.name}</span>
                <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ml-2 ${(acc.balance_usd || 0) >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {formatBalance(acc)}
                </span>
                {value === acc.code && <Check className="ml-2 h-3 w-3" />}
              </div>
            ))
          )}
        </div>
        {accounts.length > 0 && (
          <div className="p-2 border-t border-border bg-muted/30">
            <p className="text-xs text-muted-foreground">
              Showing {accounts.length} accounts{search ? ` matching "${search}"` : ''}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );

  if (label) {
    return (
      <div className="space-y-2">
        <Label className="text-xs lg:text-sm">{label}</Label>
        {content}
      </div>
    );
  }

  return content;
};

export default RemoteAccountSelector;
