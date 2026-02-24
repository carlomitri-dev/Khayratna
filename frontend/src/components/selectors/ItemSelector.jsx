import React, { useState, useMemo } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Search, ChevronsUpDown, Package, Wrench } from 'lucide-react';
import { formatUSD } from '../../lib/utils';

/**
 * Reusable Item Selector Component
 * Used for selecting inventory items or service items in invoices/POS
 */
const ItemSelector = ({
  items = [],
  serviceItems = [],
  value,
  onChange,
  placeholder = 'Search items...',
  showServices = false,
  showCost = false,
  showPrice = true,
  showQty = true,
  disabled = false,
  className = ''
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const allItems = useMemo(() => {
    const inventoryList = items.map(item => ({
      ...item,
      type: 'inventory',
      displayName: item.name,
      displayCode: item.barcode || item.sku
    }));
    
    if (showServices && serviceItems.length > 0) {
      const serviceList = serviceItems.map(item => ({
        ...item,
        type: 'service',
        displayName: item.name,
        displayCode: item.code
      }));
      return [...inventoryList, ...serviceList];
    }
    
    return inventoryList;
  }, [items, serviceItems, showServices]);

  const filteredItems = useMemo(() => {
    if (!search) return allItems;
    const searchLower = search.toLowerCase();
    return allItems.filter(item =>
      item.displayName?.toLowerCase().includes(searchLower) ||
      item.displayCode?.toLowerCase().includes(searchLower) ||
      item.name_ar?.includes(search)
    );
  }, [allItems, search]);

  const selectedItem = allItems.find(item => item.id === value);

  const handleSelect = (item) => {
    onChange(item);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={`w-full justify-between ${className}`}
          disabled={disabled}
        >
          <span className="truncate">
            {selectedItem ? selectedItem.displayName : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No items found
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-center p-2 cursor-pointer hover:bg-muted border-b border-border/50 ${value === item.id ? 'bg-muted' : ''}`}
                onClick={() => handleSelect(item)}
              >
                <div className="flex-shrink-0 mr-2">
                  {item.type === 'service' ? (
                    <Wrench className="w-4 h-4 text-purple-400" />
                  ) : (
                    <Package className="w-4 h-4 text-blue-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{item.displayName}</div>
                  <div className="text-xs text-muted-foreground flex gap-2">
                    {item.displayCode && <span>{item.displayCode}</span>}
                    {item.type === 'service' && <span className="text-purple-400">(Service)</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end text-xs ml-2">
                  {showPrice && item.price !== undefined && (
                    <span className="text-green-400">P: ${formatUSD(item.price)}</span>
                  )}
                  {showCost && item.cost !== undefined && (
                    <span className="text-yellow-400">C: ${formatUSD(item.cost)}</span>
                  )}
                  {showQty && item.type !== 'service' && item.on_hand_qty !== undefined && (
                    <span className={item.on_hand_qty <= (item.min_qty || 0) ? 'text-red-400' : 'text-muted-foreground'}>
                      QH: {item.on_hand_qty}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ItemSelector;
