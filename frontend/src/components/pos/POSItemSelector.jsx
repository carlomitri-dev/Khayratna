/**
 * POS Item Selector Component
 * Searchable dropdown for selecting items in POS
 */
import React, { useState, useMemo } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import { Search, ChevronsUpDown, Check } from 'lucide-react';
import { formatUSD } from '../../lib/utils';

const POSItemSelector = ({ items, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    if (!search) return items.slice(0, 20);
    const searchLower = search.toLowerCase();
    return items.filter(item => 
      (item.barcode && item.barcode.toLowerCase().includes(searchLower)) ||
      item.name.toLowerCase().includes(searchLower) ||
      (item.name_ar && item.name_ar.includes(search))
    ).slice(0, 20);
  }, [items, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between h-12 text-lg">
          <span className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Search Items...
          </span>
          <ChevronsUpDown className="w-5 h-5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Scan barcode or search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 text-base"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              No items found
            </div>
          ) : (
            filteredItems.map(item => (
              <div
                key={item.id}
                className="flex items-center px-3 py-2 cursor-pointer hover:bg-muted border-b border-border/50 last:border-0"
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {item.barcode && <span className="font-mono text-cyan-400">[{item.barcode}]</span>}
                    <span className="font-medium truncate">{item.name}</span>
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-3">
                    <span className="font-mono text-green-400">{item.currency || 'USD'} {formatUSD(item.price)}</span>
                    <span>Stock: {item.on_hand_qty}</span>
                    {item.is_taxable === false && (
                      <span className="text-yellow-400 text-xs">No Tax</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-2 border-t border-border bg-muted/30 text-sm text-muted-foreground">
          Showing {filteredItems.length} of {items.length} items
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default POSItemSelector;
