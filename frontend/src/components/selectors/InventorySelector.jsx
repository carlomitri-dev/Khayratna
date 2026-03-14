import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import { Search, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { formatUSD } from '../../lib/utils';

/**
 * InventorySelector - Reusable component for selecting inventory items
 * Used in Sales Invoice and Purchase Invoice pages
 */
const InventorySelector = ({ 
  items = [], 
  value, 
  onChange, 
  placeholder = "Select item", 
  organizationId, 
  apiUrl, 
  onItemSelect, 
  onCreateNewItem 
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [selectedItemCache, setSelectedItemCache] = useState(null);

  const safeItems = Array.isArray(items) ? items : [];
  
  const displayItems = searchResults !== null ? searchResults : safeItems;
  
  const allItems = useMemo(() => {
    const combined = [...safeItems];
    if (searchResults) {
      searchResults.forEach(item => {
        if (!combined.find(i => i.id === item.id)) {
          combined.push(item);
        }
      });
    }
    if (selectedItemCache && !combined.find(i => i.id === selectedItemCache.id)) {
      combined.push(selectedItemCache);
    }
    return combined;
  }, [safeItems, searchResults, selectedItemCache]);

  const filteredItems = useMemo(() => {
    if (!search) return displayItems.slice(0, 200);
    const searchLower = search.toLowerCase();
    return displayItems.filter(item => 
      (item.barcode && item.barcode.toLowerCase().includes(searchLower)) ||
      item.name.toLowerCase().includes(searchLower) ||
      (item.name_ar && item.name_ar.includes(search))
    ).slice(0, 200);
  }, [displayItems, search]);

  // Server-side search for large datasets
  useEffect(() => {
    if (!search || search.length < 2 || !apiUrl || !organizationId) {
      setSearchResults(null);
      return;
    }
    
    if (safeItems.length < 1000) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `${apiUrl}/inventory?organization_id=${organizationId}&search=${encodeURIComponent(search)}&page_size=200`,
          { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }}
        );
        const data = await response.json();
        setSearchResults(data.items || data || []);
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults(null);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, apiUrl, organizationId, safeItems.length]);

  const selectedItem = allItems.find(i => i.id === value) || selectedItemCache;
  
  const handleSelectItem = (item) => {
    setSelectedItemCache(item);
    onChange(item.id);
    if (onItemSelect) {
      onItemSelect(item);
    }
    setOpen(false);
    setSearch('');
    setSearchResults(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-8 text-xs"
          data-testid="inventory-selector-trigger"
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
              data-testid="inventory-search-input"
            />
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {/* Manual Entry Option */}
          <div
            className={`flex items-center px-2 py-1.5 cursor-pointer hover:bg-muted text-xs ${value === '' ? 'bg-muted' : ''}`}
            onClick={() => {
              onChange('');
              setOpen(false);
              setSearch('');
            }}
            data-testid="manual-entry-option"
          >
            <span className="text-muted-foreground">Manual Entry</span>
            {value === '' && <Check className="ml-auto h-3 w-3" />}
          </div>
          
          {/* Inventory Items Section */}
          {filteredItems.length > 0 && (
            <>
              <div className="px-2 py-1 text-[10px] font-semibold text-cyan-400 bg-cyan-500/10 border-y border-cyan-500/20">
                Inventory Items
              </div>
              {filteredItems.map(item => (
                <div
                  key={item.id}
                  className={`flex items-center px-2 py-1.5 cursor-pointer hover:bg-muted text-xs ${value === item.id ? 'bg-muted' : ''}`}
                  onClick={() => handleSelectItem(item)}
                  data-testid={`inventory-item-${item.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {item.barcode && <span className="font-mono text-cyan-400">[{item.barcode}]</span>}
                      <span className="truncate">{item.name}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-3">
                      <span className="text-green-400">P:{formatUSD(item.price)}</span>
                      <span className="text-orange-400">C:{formatUSD(item.cost || 0)}</span>
                      <span className="text-blue-400">QH:{item.on_hand_qty}</span>
                    </div>
                  </div>
                  {value === item.id && <Check className="ml-2 h-3 w-3" />}
                </div>
              ))}
            </>
          )}
          
          {filteredItems.length === 0 && !searching && (
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                {search ? `No items found for "${search}"` : 'Type to search items...'}
              </p>
              {search && onCreateNewItem && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  onClick={() => {
                    onCreateNewItem(search);
                    setOpen(false);
                  }}
                  data-testid="create-new-item-btn"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Create &ldquo;{search}&rdquo; as new item
                </Button>
              )}
            </div>
          )}
          
          {searching && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Searching...
            </div>
          )}
        </div>
        <div className="p-2 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">
            {filteredItems.length}{safeItems.length > 200 ? '+' : ''} inventory items {safeItems.length > 1000 && search.length < 2 ? '(type to search more)' : ''}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default InventorySelector;
