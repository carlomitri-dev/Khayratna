/**
 * Searchable Inventory Selector Component
 * Used in Sales Invoice, Purchase Invoice, and POS pages
 */
import React, { useState, useMemo } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import { Search, Check, ChevronsUpDown } from 'lucide-react';
import { formatUSD } from '../../lib/utils';

const InventorySelector = ({ 
  items = [], 
  value, 
  onChange, 
  placeholder = "Select item",
  showManualEntry = true 
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Ensure items is always an array
  const safeItems = Array.isArray(items) ? items : [];

  const filteredItems = useMemo(() => {
    if (!search) return safeItems;
    const searchLower = search.toLowerCase();
    return safeItems.filter(item => 
      (item.barcode && item.barcode.toLowerCase().includes(searchLower)) ||
      item.name.toLowerCase().includes(searchLower) ||
      (item.name_ar && item.name_ar.includes(search))
    );
  }, [safeItems, search]);

  const selectedItem = safeItems.find(i => i.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-8 text-xs"
        >
          {selectedItem ? (
            <span className="truncate">
              {selectedItem.barcode ? `[${selectedItem.barcode}] ` : ''}{selectedItem.name}
            </span>
          ) : value === '' ? (
            <span className="text-muted-foreground">Manual Entry</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search barcode, name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[250px] overflow-y-auto">
          {/* Manual Entry Option */}
          {showManualEntry && (
            <div
              className={`flex items-center px-2 py-1.5 cursor-pointer hover:bg-muted text-xs ${value === '' ? 'bg-muted' : ''}`}
              onClick={() => {
                onChange('');
                setOpen(false);
                setSearch('');
              }}
            >
              <span className="text-muted-foreground">Manual Entry</span>
              {value === '' && <Check className="ml-auto h-3 w-3" />}
            </div>
          )}
          
          {filteredItems.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No items found
            </div>
          ) : (
            filteredItems.map(item => (
              <div
                key={item.id}
                className={`flex items-center px-2 py-1.5 cursor-pointer hover:bg-muted text-xs ${value === item.id ? 'bg-muted' : ''}`}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {item.barcode && <span className="font-mono text-cyan-400">[{item.barcode}]</span>}
                    <span className="truncate">{item.name}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                    <span>{item.currency || 'USD'} {formatUSD(item.price)}</span>
                    <span>Stock: {item.on_hand_qty}</span>
                    {item.is_taxable === false && (
                      <span className="text-yellow-400">No Tax</span>
                    )}
                  </div>
                </div>
                {value === item.id && <Check className="ml-2 h-3 w-3" />}
              </div>
            ))
          )}
        </div>
        <div className="p-2 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">
            {filteredItems.length} items
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default InventorySelector;
