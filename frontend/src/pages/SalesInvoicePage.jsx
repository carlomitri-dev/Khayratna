import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { useSync } from '../context/SyncContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { DateInput } from '../components/ui/date-input';
import OfflineBanner from '../components/OfflineBanner';
import AccountSelector from '../components/selectors/AccountSelector';
import InventorySelector from '../components/selectors/InventorySelector';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover';
import { 
  FileText, Search, Plus, Edit, Trash2, Send, Printer, Eye,
  Package, Users, DollarSign, Calendar, ChevronDown, Filter,
  Undo2, Check, X, ShoppingCart, ChevronsUpDown, Save, WifiOff
} from 'lucide-react';
import axios from 'axios';
import { formatUSD, formatDate } from '../lib/utils';
import db from '../lib/db';
import { addToSyncQueue, OPERATION_TYPES, ACTION_TYPES } from '../lib/syncService';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Searchable Used Item Selector for parts/materials
const UsedItemSelector = ({ items, value, onChange, placeholder = "Search parts..." }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const searchLower = search.toLowerCase();
    return items.filter(item => 
      (item.barcode && item.barcode.toLowerCase().includes(searchLower)) ||
      item.name.toLowerCase().includes(searchLower) ||
      (item.name_ar && item.name_ar.includes(search)) ||
      (item.category_name && item.category_name.toLowerCase().includes(searchLower))
    );
  }, [items, search]);

  const selectedItem = items.find(i => i.id === value);

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
            <span className="truncate flex items-center gap-1">
              <Package className="w-3 h-3 text-purple-400" />
              {selectedItem.name}
              <span className="text-muted-foreground">({selectedItem.on_hand_qty})</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, barcode, category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[250px] overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No parts found
            </div>
          ) : (
            filteredItems.map(item => (
              <div
                key={item.id}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted text-xs border-b border-border/50 last:border-0 ${value === item.id ? 'bg-purple-500/10' : ''}`}
                onClick={() => {
                  onChange(item.id, item);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    {item.barcode && (
                      <span className="font-mono text-cyan-400">[{item.barcode}]</span>
                    )}
                    <span className="font-medium truncate">{item.name}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    {item.category_name && <span>{item.category_name}</span>}
                    <span className={item.on_hand_qty <= (item.min_qty || 0) ? 'text-amber-400' : ''}>
                      Stock: {item.on_hand_qty} {item.unit}
                    </span>
                  </div>
                </div>
                {value === item.id && <Check className="ml-2 h-3 w-3 text-purple-400" />}
              </div>
            ))
          )}
        </div>
        <div className="p-2 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">
            {filteredItems.length} parts available
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const SalesInvoicePage = () => {
  const { currentOrg, user, fetchOrganizations } = useAuth();
  const { selectedFY } = useFiscalYear();
  const { isOnline, updatePendingCount } = useSync();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Data
  const [customers, setCustomers] = useState([]);
  const [salesAccounts, setSalesAccounts] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [serviceItems, setServiceItems] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 20;
  
  // Dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [printCurrencyDialog, setPrintCurrencyDialog] = useState(null); // Invoice to print with currency selection
  const [printWithBackground, setPrintWithBackground] = useState(true); // Print with background image option
  const [formDataLoading, setFormDataLoading] = useState(false); // Loading state for form data
  const [newItemDialog, setNewItemDialog] = useState(null); // { name: string, lineIndex: number } for creating new inventory item
  const [newItemSaving, setNewItemSaving] = useState(false);
  
  // Form state
  const emptyLine = { inventory_item_id: '', item_name: '', item_name_ar: '', barcode: '', quantity: 1, unit: 'piece', unit_price: 0, currency: 'USD', exchange_rate: 1, discount_percent: 0, line_total: 0, line_total_usd: 0, is_taxable: true, used_items: [], batch_id: '' };
  const emptyUsedItem = { inventory_item_id: '', item_name: '', quantity: 1 };
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    due_date: '',
    lines: [{ ...emptyLine }],
    subtotal: 0,
    discount_percent: 0,
    discount_amount: 0,
    tax_percent: 0,
    tax_amount: 0,
    total: 0,
    total_usd: 0,
    notes: '',
    debit_account_id: '',
    credit_account_id: ''
  });
  const [unpostConfirm, setUnpostConfirm] = useState(null);
  
  // Last price cache for items per customer
  const [lastPrices, setLastPrices] = useState({}); // { itemId: { price, date, invoice_number } }
  const [itemBatches, setItemBatches] = useState({}); // { itemId: [batches] }
  const [searchItemsCache, setSearchItemsCache] = useState({}); // Cache items from search { itemId: item }

  const canEdit = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'accountant';
  const canDelete = user?.role === 'super_admin' || user?.role === 'admin';
  const isSuperAdmin = user?.role === 'super_admin';
  
  // Combined inventory items (local + search cache)
  const allInventoryItems = useMemo(() => {
    const combined = [...inventoryItems];
    Object.values(searchItemsCache).forEach(item => {
      if (!combined.find(i => i.id === item.id)) {
        combined.push(item);
      }
    });
    return combined;
  }, [inventoryItems, searchItemsCache]);
  
  // Handler when an item is selected from search
  const handleItemSelectedFromSearch = (item) => {
    if (item && item.id) {
      setSearchItemsCache(prev => ({ ...prev, [item.id]: item }));
    }
  };

  // Fetch batches for an inventory item
  const fetchItemBatches = async (itemId) => {
    if (!itemId || itemBatches[itemId]) return;
    try {
      const res = await axios.get(`${API}/inventory/${itemId}/batches`);
      // Filter to only batches with quantity > 0 and sort by expiry date (FEFO)
      const availableBatches = (res.data || [])
        .filter(b => b.quantity > 0)
        .sort((a, b) => (a.expiry_date || '9999-12-31').localeCompare(b.expiry_date || '9999-12-31'));
      setItemBatches(prev => ({ ...prev, [itemId]: availableBatches }));
    } catch (error) {
      console.error('Error fetching batches:', error);
      setItemBatches(prev => ({ ...prev, [itemId]: [] }));
    }
  };

  // Fetch last price for an item when customer changes or item is added
  const fetchLastPrice = async (customerId, itemId) => {
    if (!customerId || !itemId) return null;
    
    const cacheKey = `${customerId}_${itemId}`;
    if (lastPrices[cacheKey] !== undefined) return lastPrices[cacheKey];
    
    try {
      const res = await axios.get(`${API}/sales-invoices/last-price/${customerId}/${itemId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = res.data;
      setLastPrices(prev => ({ ...prev, [cacheKey]: data.found ? data : null }));
      return data.found ? data : null;
    } catch (error) {
      console.error('Error fetching last price:', error);
      return null;
    }
  };

  // Get item info (cost, price, qty) from inventory
  const getItemInfo = (itemId) => {
    const item = inventoryItems.find(i => i.id === itemId);
    return item ? { cost: item.cost || 0, price: item.price || 0, qh: item.on_hand_qty || 0 } : null;
  };

  // Get last price from cache
  const getLastPriceFromCache = (customerId, itemId) => {
    const cacheKey = `${customerId}_${itemId}`;
    return lastPrices[cacheKey];
  };

  // Set default tax from organization settings
  useEffect(() => {
    if (currentOrg?.tax_percent !== undefined && currentOrg?.tax_percent !== null) {
      setFormData(prev => ({
        ...prev,
        tax_percent: currentOrg.tax_percent
      }));
    }
  }, [currentOrg]);

  useEffect(() => {
    if (currentOrg) {
      fetchData();
    }
  }, [currentOrg]);

  useEffect(() => {
    if (currentOrg) {
      setCurrentPage(0);
      fetchInvoices(true);
    }
  }, [searchTerm, filterStatus, selectedFY]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        const [customersRes, salesRes, inventoryRes, serviceRes, currenciesRes] = await Promise.all([
          axios.get(`${API}/customer-accounts?organization_id=${currentOrg.id}`),
          axios.get(`${API}/sales-accounts?organization_id=${currentOrg.id}`),
          axios.get(`${API}/inventory?organization_id=${currentOrg.id}&page_size=1000`),  // Load first 1000, search for more
          axios.get(`${API}/service-items?organization_id=${currentOrg.id}`).catch(() => ({ data: [] })),
          axios.get(`${API}/currencies/active`).catch(() => ({ data: [] }))
        ]);
        
        // Handle paginated inventory response - extract items array
        const inventoryData = Array.isArray(inventoryRes.data) 
          ? inventoryRes.data 
          : (inventoryRes.data?.items || []);
        
        // Handle service items response
        const serviceData = Array.isArray(serviceRes.data) 
          ? serviceRes.data 
          : (serviceRes.data?.items || []);
        
        // Cache data in IndexedDB
        try {
          // Cache customers
          const customerData = customersRes.data.map(c => ({ ...c, organization_id: currentOrg.id }));
          await db.customers.where('organization_id').equals(currentOrg.id).delete();
          if (customerData.length > 0) await db.customers.bulkPut(customerData);
          
          // Cache inventory
          await db.inventoryItems.where('organization_id').equals(currentOrg.id).delete();
          if (inventoryData.length > 0) await db.inventoryItems.bulkPut(inventoryData);
          
          // Cache sales accounts
          const accountsToCache = salesRes.data.map(a => ({ ...a, organization_id: currentOrg.id }));
          if (accountsToCache.length > 0) await db.chartOfAccounts.bulkPut(accountsToCache);
        } catch (cacheError) {
          console.warn('[SalesInvoice] Error caching data:', cacheError);
        }
        
        setCustomers(customersRes.data);
        setSalesAccounts(salesRes.data);
        setInventoryItems(inventoryData);
        setServiceItems(serviceData);
        setCurrencies(currenciesRes.data.length > 0 ? currenciesRes.data : [
          { code: 'USD', name: 'US Dollar', symbol: '$' },
          { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل' }
        ]);
        
        // Set default accounts if available
        if (customersRes.data.length > 0 && !formData.debit_account_id) {
          setFormData(prev => ({ ...prev, debit_account_id: customersRes.data[0].id }));
        }
        if (salesRes.data.length > 0 && !formData.credit_account_id) {
          setFormData(prev => ({ ...prev, credit_account_id: salesRes.data[0].id }));
        }
        
        await fetchInvoices(true);
      } else {
        // Load from IndexedDB when offline
        console.log('[SalesInvoice] Offline mode - loading from cache');
        
        const cachedCustomers = await db.customers.where('organization_id').equals(currentOrg.id).toArray();
        const cachedInventory = await db.inventoryItems.where('organization_id').equals(currentOrg.id).toArray();
        const cachedAccounts = await db.chartOfAccounts.where('organization_id').equals(currentOrg.id).toArray();
        const cachedInvoices = await db.salesInvoices.where('organization_id').equals(currentOrg.id).toArray();
        
        setCustomers(cachedCustomers);
        setInventoryItems(cachedInventory);
        setSalesAccounts(cachedAccounts.filter(a => a.code?.startsWith('7')));
        setInvoices(cachedInvoices);
        setTotalCount(cachedInvoices.length);
        setCurrencies([
          { code: 'USD', name: 'US Dollar', symbol: '$' },
          { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل' }
        ]);
        
        if (cachedCustomers.length > 0 && !formData.debit_account_id) {
          setFormData(prev => ({ ...prev, debit_account_id: cachedCustomers[0].id }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      
      // Fallback to cached data
      try {
        const cachedCustomers = await db.customers.where('organization_id').equals(currentOrg.id).toArray();
        const cachedInventory = await db.inventoryItems.where('organization_id').equals(currentOrg.id).toArray();
        const cachedInvoices = await db.salesInvoices.where('organization_id').equals(currentOrg.id).toArray();
        
        if (cachedCustomers.length > 0) setCustomers(cachedCustomers);
        if (cachedInventory.length > 0) setInventoryItems(cachedInventory);
        if (cachedInvoices.length > 0) {
          setInvoices(cachedInvoices);
          setTotalCount(cachedInvoices.length);
        }
      } catch (cacheError) {
        console.error('[SalesInvoice] Cache fallback failed:', cacheError);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoices = async (reset = false) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    
    try {
      const params = new URLSearchParams({
        organization_id: currentOrg.id,
        skip: reset ? 0 : currentPage * PAGE_SIZE,
        limit: PAGE_SIZE
      });
      
      if (searchTerm) params.append('search', searchTerm);
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (selectedFY) {
        params.append('date_from', selectedFY.start_date);
        params.append('date_to', selectedFY.end_date);
      }
      
      const [invoicesRes, countRes] = await Promise.all([
        axios.get(`${API}/sales-invoices?${params.toString()}`),
        axios.get(`${API}/sales-invoices/count?${params.toString()}`)
      ]);
      
      if (reset) {
        setInvoices(invoicesRes.data);
        setCurrentPage(1);
      } else {
        setInvoices(prev => [...prev, ...invoicesRes.data]);
        setCurrentPage(prev => prev + 1);
      }
      setTotalCount(countRes.data.count);
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => fetchInvoices(false);
  const hasMore = invoices.length < totalCount;

  // Handle URL query parameter for viewing specific invoice
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewId = urlParams.get('view');
    if (viewId && invoices.length > 0) {
      const invoiceToView = invoices.find(inv => inv.id === viewId);
      if (invoiceToView) {
        setViewInvoice(invoiceToView);
        // Clear the URL parameter
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [invoices]);

  // Line item calculations - supports per-line currency
  const calculateLineTotal = (line) => {
    const qty = parseFloat(line.quantity) || 0;
    const price = parseFloat(line.unit_price) || 0;
    const discount = parseFloat(line.discount_percent) || 0;
    const subtotal = qty * price;
    const lineTotal = subtotal - (subtotal * discount / 100);
    const exchangeRate = parseFloat(line.exchange_rate) || 1;
    const lineTotalUsd = line.currency === 'USD' ? lineTotal : lineTotal / exchangeRate;
    return { lineTotal, lineTotalUsd };
  };

  const recalculateTotals = (lines, discountPercent, taxPercent) => {
    // Sum all line totals in USD for consistent calculation
    const subtotalUsd = lines.reduce((sum, line) => sum + (parseFloat(line.line_total_usd) || 0), 0);
    // Calculate taxable subtotal - only items where is_taxable is true
    const taxableSubtotalUsd = lines.reduce((sum, line) => {
      if (line.is_taxable !== false) {
        return sum + (parseFloat(line.line_total_usd) || 0);
      }
      return sum;
    }, 0);
    const discountAmount = subtotalUsd * (parseFloat(discountPercent) || 0) / 100;
    const afterDiscount = subtotalUsd - discountAmount;
    // Apply discount proportionally to taxable amount
    const taxableAfterDiscount = taxableSubtotalUsd * (1 - (parseFloat(discountPercent) || 0) / 100);
    const taxAmount = taxableAfterDiscount * (parseFloat(taxPercent) || 0) / 100;
    const totalUsd = afterDiscount + taxAmount;
    
    return { subtotal: subtotalUsd, taxableSubtotal: taxableSubtotalUsd, discountAmount, taxAmount, total: totalUsd, totalUsd };
  };

  const handleLineChange = (index, field, value) => {
    const newLines = [...formData.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    
    // If item selected, populate details including currency and taxable flag
    if (field === 'inventory_item_id' && value) {
      const item = allInventoryItems.find(i => i.id === value);
      if (item) {
        newLines[index] = {
          ...newLines[index],
          item_name: item.name,
          item_name_ar: item.name_ar || '',
          barcode: item.barcode || '',
          unit: item.unit || 'piece',
          quantity: newLines[index].quantity || 1,  // Default quantity to 1 if not set
          unit_price: item.price || 0,
          currency: item.currency || 'USD',
          exchange_rate: item.currency === 'LBP' ? (currentOrg?.base_exchange_rate || 89500) : 1,
          is_taxable: item.is_taxable !== false,  // Include taxable flag
          batch_id: ''  // Reset batch selection when item changes
        };
        
        // Fetch batches if expiry tracking is enabled
        if (currentOrg?.enable_expiry_tracking) {
          fetchItemBatches(value);
        }
        
        // Fetch last price for this customer/item combo
        if (formData.debit_account_id) {
          fetchLastPrice(formData.debit_account_id, value);
        }
      } else {
        // Item not found in local cache - this shouldn't happen with searchItemsCache
        console.warn(`Item ${value} not found in allInventoryItems`);
      }
    }
    
    // Recalculate line total
    const { lineTotal, lineTotalUsd } = calculateLineTotal(newLines[index]);
    newLines[index].line_total = lineTotal;
    newLines[index].line_total_usd = lineTotalUsd;
    
    // Recalculate invoice totals
    const totals = recalculateTotals(newLines, formData.discount_percent, formData.tax_percent);
    
    setFormData({
      ...formData,
      lines: newLines,
      subtotal: totals.subtotal,
      discount_amount: totals.discountAmount,
      tax_amount: totals.taxAmount,
      total: totals.total,
      total_usd: totals.totalUsd
    });
  };

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [...formData.lines, { ...emptyLine, used_items: [] }]
    });
  };

  const removeLine = (index) => {
    if (formData.lines.length <= 1) return;
    const newLines = formData.lines.filter((_, i) => i !== index);
    const totals = recalculateTotals(newLines, formData.discount_percent, formData.tax_percent);
    setFormData({
      ...formData,
      lines: newLines,
      subtotal: totals.subtotal,
      discount_amount: totals.discountAmount,
      tax_amount: totals.taxAmount,
      total: totals.total,
      total_usd: totals.totalUsd
    });
  };

  // Used Items management for service lines
  const addUsedItem = (lineIndex) => {
    const newLines = [...formData.lines];
    if (!newLines[lineIndex].used_items) {
      newLines[lineIndex].used_items = [];
    }
    newLines[lineIndex].used_items.push({ ...emptyUsedItem });
    setFormData({ ...formData, lines: newLines });
  };

  const removeUsedItem = (lineIndex, usedItemIndex) => {
    const newLines = [...formData.lines];
    newLines[lineIndex].used_items = newLines[lineIndex].used_items.filter((_, i) => i !== usedItemIndex);
    setFormData({ ...formData, lines: newLines });
  };

  const handleUsedItemChange = (lineIndex, usedItemIndex, field, value, itemObj = null) => {
    const newLines = [...formData.lines];
    const usedItem = newLines[lineIndex].used_items[usedItemIndex];
    
    if (field === 'inventory_item_id' && value) {
      // If itemObj is provided from the selector, use it directly
      const invItem = itemObj || inventoryItems.find(i => i.id === value);
      if (invItem) {
        usedItem.inventory_item_id = value;
        usedItem.item_name = invItem.name;
        usedItem.available_qty = invItem.on_hand_qty;
        usedItem.unit = invItem.unit;
      }
    } else {
      usedItem[field] = value;
    }
    
    setFormData({ ...formData, lines: newLines });
  };

  // Handle selecting a service item
  const handleSelectService = (index, service) => {
    const newLines = [...formData.lines];
    newLines[index] = {
      ...newLines[index],
      inventory_item_id: '',  // Clear inventory selection
      item_name: service.name,
      item_name_ar: service.name_ar || '',
      barcode: '',
      unit: service.unit || 'service',
      unit_price: service.price,
      currency: service.currency || 'USD',
      exchange_rate: service.currency === 'LBP' ? (currentOrg?.base_exchange_rate || 89500) : 1,
      is_taxable: service.is_taxable !== false
    };
    
    // Recalculate line total
    const { lineTotal, lineTotalUsd } = calculateLineTotal(newLines[index]);
    newLines[index].line_total = lineTotal;
    newLines[index].line_total_usd = lineTotalUsd;
    
    // Recalculate invoice totals
    const totals = recalculateTotals(newLines, formData.discount_percent, formData.tax_percent);
    
    setFormData({
      ...formData,
      lines: newLines,
      subtotal: totals.subtotal,
      discount_amount: totals.discountAmount,
      tax_amount: totals.taxAmount,
      total: totals.total,
      total_usd: totals.totalUsd
    });
  };

  // Save line item as a reusable service
  const saveLineAsService = async (index) => {
    const line = formData.lines[index];
    if (!line.item_name) {
      alert('Please enter an item name first');
      return;
    }
    
    try {
      const serviceData = {
        name: line.item_name,
        name_ar: line.item_name_ar || null,
        price: parseFloat(line.unit_price) || 0,
        currency: line.currency || 'USD',
        unit: line.unit || 'service',
        is_taxable: line.is_taxable !== false,
        organization_id: currentOrg.id
      };
      
      await axios.post(`${API}/service-items`, serviceData);
      
      // Refresh service items list
      const res = await axios.get(`${API}/service-items?organization_id=${currentOrg.id}`);
      setServiceItems(res.data);
      
      alert(`"${line.item_name}" saved as a reusable service!`);
    } catch (error) {
      if (error.response?.status === 400) {
        alert('A service with this name already exists');
      } else {
        console.error('Failed to save service:', error);
        alert('Failed to save service');
      }
    }
  };

  // Create new inventory item from search
  const handleCreateNewItem = async (itemData) => {
    if (!itemData.name) {
      alert('Please enter an item name');
      return;
    }
    
    setNewItemSaving(true);
    try {
      const newItem = {
        name: itemData.name,
        name_ar: itemData.name_ar || null,
        barcode: itemData.barcode || null,
        price: parseFloat(itemData.price) || 0,
        cost: parseFloat(itemData.cost) || 0,
        currency: itemData.currency || 'USD',
        unit: itemData.unit || 'piece',
        category: itemData.category || 'General',
        is_taxable: itemData.is_taxable !== false,
        track_stock: false, // Don't track stock by default for quick-add items
        organization_id: currentOrg.id
      };
      
      const res = await axios.post(`${API}/inventory`, newItem);
      const createdItem = res.data;
      
      // Add to local inventory list
      setInventoryItems(prev => [...prev, createdItem]);
      
      // If we have a line index, update that line with the new item
      if (newItemDialog?.lineIndex !== undefined) {
        const lineIndex = newItemDialog.lineIndex;
        const newLines = [...formData.lines];
        newLines[lineIndex] = {
          ...newLines[lineIndex],
          inventory_item_id: createdItem.id,
          item_name: createdItem.name,
          item_name_ar: createdItem.name_ar || '',
          barcode: createdItem.barcode || '',
          unit_price: createdItem.price || 0,
          currency: createdItem.currency || 'USD',
          unit: createdItem.unit || 'piece',
          is_taxable: createdItem.is_taxable !== false
        };
        
        const totals = recalculateTotals(newLines, formData.discount_percent, formData.tax_percent);
        setFormData(prev => ({ 
          ...prev, 
          lines: newLines,
          subtotal: totals.subtotal,
          discount_amount: totals.discountAmount,
          tax_amount: totals.taxAmount,
          total: totals.total,
          total_usd: totals.totalUsd
        }));
      }
      
      setNewItemDialog(null);
      alert(`"${createdItem.name}" created and added to line!`);
    } catch (error) {
      console.error('Failed to create item:', error);
      if (error.response?.data?.detail) {
        alert(error.response.data.detail);
      } else {
        alert('Failed to create item');
      }
    } finally {
      setNewItemSaving(false);
    }
  };

  const handleDiscountTaxChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    const totals = recalculateTotals(newData.lines, newData.discount_percent, newData.tax_percent);
    setFormData({ ...newData, subtotal: totals.subtotal, discount_amount: totals.discountAmount, tax_amount: totals.taxAmount, total: totals.total, total_usd: totals.totalUsd });
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      due_date: '',
      lines: [{ ...emptyLine }],
      subtotal: 0,
      discount_percent: 0,
      discount_amount: 0,
      tax_percent: currentOrg?.tax_percent || 0,  // Use org default tax
      tax_amount: 0,
      total: 0,
      total_usd: 0,
      notes: '',
      debit_account_id: customers[0]?.id || '',
      credit_account_id: salesAccounts[0]?.id || ''
    });
    setEditingInvoice(null);
  };

  const openForm = (invoice = null) => {
    if (invoice) {
      setEditingInvoice(invoice);
      setFormData({
        date: invoice.date,
        due_date: invoice.due_date || '',
        lines: invoice.lines.length > 0 ? invoice.lines.map(l => ({
          ...l,
          currency: l.currency || 'USD',
          exchange_rate: l.exchange_rate || 1,
          line_total_usd: l.line_total_usd || l.line_total
        })) : [{ ...emptyLine }],
        subtotal: invoice.subtotal,
        discount_percent: invoice.discount_percent,
        discount_amount: invoice.discount_amount,
        tax_percent: invoice.tax_percent,
        tax_amount: invoice.tax_amount,
        total: invoice.total,
        total_usd: invoice.total_usd,
        notes: invoice.notes || '',
        debit_account_id: invoice.debit_account_id,
        credit_account_id: invoice.credit_account_id
      });
    } else {
      resetForm();
    }
    setIsFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.debit_account_id || !formData.credit_account_id) {
      alert('Please select debit and credit accounts');
      return;
    }
    if (formData.lines.every(l => !l.item_name)) {
      alert('Please add at least one line item');
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        ...formData,
        organization_id: currentOrg.id
      };
      
      if (isOnline) {
        // Online: Send to server
        if (editingInvoice) {
          await axios.put(`${API}/sales-invoices/${editingInvoice.id}`, payload);
        } else {
          await axios.post(`${API}/sales-invoices`, payload);
        }
      } else {
        // Offline: Save locally and queue for sync
        const offlineId = 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const offlineInvoiceNumber = 'SI-OFFLINE-' + String(Date.now()).slice(-5);
        
        const offlineInvoice = {
          id: editingInvoice?.id || offlineId,
          invoice_number: editingInvoice?.invoice_number || offlineInvoiceNumber,
          ...payload,
          is_posted: false,
          status: 'draft',
          created_offline: true,
          created_at: new Date().toISOString()
        };
        
        // Save to IndexedDB
        await db.salesInvoices.put(offlineInvoice);
        
        // Add to sync queue
        const { addToSyncQueue, OPERATION_TYPES, ACTION_TYPES } = await import('../lib/syncService');
        await addToSyncQueue(
          OPERATION_TYPES.SALES_INVOICE, 
          editingInvoice ? ACTION_TYPES.UPDATE : ACTION_TYPES.CREATE, 
          offlineInvoice.id, 
          payload
        );
        await updatePendingCount();
        
        alert('Invoice saved offline. It will sync when you\'re back online.');
      }
      
      setIsFormOpen(false);
      resetForm();
      fetchInvoices(true);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      // If deleting a posted invoice, need to pass force=true
      const url = deleteConfirm.is_posted 
        ? `${API}/sales-invoices/${deleteConfirm.id}?force=true`
        : `${API}/sales-invoices/${deleteConfirm.id}`;
      await axios.delete(url);
      setDeleteConfirm(null);
      fetchInvoices(true);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete invoice');
    }
  };

  const handlePost = async (invoiceId) => {
    if (!window.confirm('Post this invoice? This will create a sales voucher and update account balances.')) return;
    
    try {
      const response = await axios.post(`${API}/sales-invoices/${invoiceId}/post`);
      alert(`Invoice posted! Voucher: ${response.data.voucher_number}`);
      fetchInvoices(true);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to post invoice');
    }
  };

  const handleUnpost = async () => {
    if (!unpostConfirm) return;
    
    try {
      await axios.post(`${API}/sales-invoices/${unpostConfirm.id}/unpost`);
      setUnpostConfirm(null);
      fetchInvoices(true);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to unpost invoice');
    }
  };

  // Helper function to convert number to words
  const numberToWords = (num) => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    if (num === 0) return 'Zero';
    if (num < 0) return 'Negative ' + numberToWords(-num);
    
    let words = '';
    
    if (Math.floor(num / 1000000) > 0) {
      words += numberToWords(Math.floor(num / 1000000)) + ' Million ';
      num %= 1000000;
    }
    if (Math.floor(num / 1000) > 0) {
      words += numberToWords(Math.floor(num / 1000)) + ' Thousand ';
      num %= 1000;
    }
    if (Math.floor(num / 100) > 0) {
      words += ones[Math.floor(num / 100)] + ' Hundred ';
      num %= 100;
    }
    if (num > 0) {
      if (num < 20) {
        words += ones[num];
      } else {
        words += tens[Math.floor(num / 10)];
        if (num % 10 > 0) words += '-' + ones[num % 10];
      }
    }
    return words.trim();
  };

  const amountToWords = (amount, currency = 'USD') => {
    if (currency === 'LBP') {
      // For LBP, just show the whole number (no cents)
      const lbpAmount = Math.round(amount);
      return numberToWords(lbpAmount) + ' Lebanese Pounds Only';
    } else {
      const dollars = Math.floor(amount);
      const cents = Math.round((amount - dollars) * 100);
      let result = numberToWords(dollars) + ' US Dollars';
      if (cents > 0) {
        result += ' and ' + numberToWords(cents) + ' Cents';
      }
      return result + ' Only';
    }
  };

  const handlePrint = (invoice) => {
    // Show currency selection dialog
    setPrintCurrencyDialog(invoice);
  };

  const executePrint = async (invoice, printCurrency, withBackground = true) => {
    try {
      // Fetch fresh organization data directly to ensure we have the latest template
      const response = await axios.get(`${API}/organizations`);
      const organizations = response.data;
      const org = organizations.find(o => o.id === currentOrg?.id) || currentOrg || {};
      // Use document-specific template or fall back to legacy invoice_template
      const template = org.document_templates?.sales_invoice || org.invoice_template || {};
      
      // Check if we have field positions (new template system)
      const hasFieldPositions = template.field_positions && template.field_positions.length > 0;
      
      console.log('=== PRINT DEBUG ===');
      console.log('Organization:', org.name);
      console.log('Template type:', hasFieldPositions ? 'Custom Template with Field Positions' : 'Default Format');
      console.log('Field positions count:', template.field_positions?.length || 0);
      console.log('Page size:', template.page_width + 'x' + template.page_height + 'mm');
      console.log('Line items config:', template.line_items_config);
      console.log('Print with background:', withBackground);
      if (template.field_positions) {
        console.log('Fields:', template.field_positions.map(f => f.field_name).join(', '));
      }
      console.log('===================');
      
      if (hasFieldPositions) {
        // Use positioned template printing - pass org data
        printWithTemplate(invoice, template, printCurrency, org, withBackground);
      } else {
        // Use default format printing
        printDefaultFormat(invoice, org, template, printCurrency, withBackground);
      }
    } catch (error) {
      console.error('Failed to fetch fresh organization data:', error);
      // Fall back to using currentOrg from state
      const org = currentOrg || {};
      const template = org.document_templates?.sales_invoice || org.invoice_template || {};
      const hasFieldPositions = template.field_positions && template.field_positions.length > 0;
      
      if (hasFieldPositions) {
        printWithTemplate(invoice, template, printCurrency, org, withBackground);
      } else {
        printDefaultFormat(invoice, org, template, printCurrency, withBackground);
      }
    }
    
    setPrintCurrencyDialog(null);
  };

  // Print using positioned template
  const printWithTemplate = (invoice, template, printCurrency = 'USD', org = null, withBackground = true) => {
    // Use passed org or fall back to currentOrg
    const orgData = org || currentOrg || {};
    
    const pageWidth = template.page_width || 210;
    const pageHeight = template.page_height || 297;
    const fieldPositions = template.field_positions || [];
    const lineConfig = template.line_items_config || { start_y: 35, row_height: 3, max_rows: 10 };
    // Only use background image if withBackground is true
    const backgroundImage = withBackground ? (template.background_image || '') : '';
    const bgPosition = template.background_position || 'center';
    const bgOpacity = template.background_opacity || 100;
    const bgSize = template.background_size || 'cover';
    
    // Calculate background CSS
    const getBgSizeCSS = () => {
      switch (bgSize) {
        case 'contain': return 'contain';
        case 'stretch': return '100% 100%';
        default: return 'cover';
      }
    };
    const getBgPositionCSS = () => {
      switch (bgPosition) {
        case 'top': return 'center top';
        case 'bottom': return 'center bottom';
        default: return 'center center';
      }
    };
    
    // Exchange rate for currency conversion
    const exchangeRate = orgData.base_exchange_rate || 89500;
    const currencySymbol = printCurrency === 'USD' ? '$' : 'LBP ';
    
    // Convert amount based on print currency
    const convertAmount = (amountUsd) => {
      if (printCurrency === 'LBP') {
        return parseFloat(amountUsd) * exchangeRate;
      }
      return parseFloat(amountUsd);
    };
    
    const formatAmount = (amount) => {
      const converted = convertAmount(amount);
      if (printCurrency === 'LBP') {
        return `${currencySymbol}${Math.round(converted).toLocaleString()}`;
      }
      return `${currencySymbol}${converted.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    };
    
    // Helper to format date as dd-mm-yyyy
    const formatPrintDate = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    };
    
    // Get field value by field name
    const getFieldValue = (fieldName, lineIndex = 0) => {
      const line = invoice.lines?.[lineIndex];
      
      switch (fieldName) {
        case 'invoice_number': return invoice.invoice_number;
        case 'date': return formatPrintDate(invoice.date);
        case 'due_date': return formatPrintDate(invoice.due_date) || '';
        case 'customer_name': return invoice.debit_account_name || invoice.customer_name || '';
        case 'customer_address': return invoice.customer_address || '';
        case 'customer_account': return invoice.debit_account_code || '';
        case 'company_name': return orgData.name || template.company_name || 'KAIROS';
        case 'company_phone': return orgData.phone || template.tel_fax || '';
        case 'company_email': return orgData.email || template.email || '';
        case 'company_address': return orgData.address || template.address || '';
        case 'company_registration': return orgData.registration_number || '';
        case 'subtotal': return formatAmount(invoice.subtotal || 0);
        case 'discount': return invoice.discount_amount > 0 ? `-${formatAmount(invoice.discount_amount)}` : '';
        case 'tax': return invoice.tax_amount > 0 ? formatAmount(invoice.tax_amount) : '';
        case 'total': return formatAmount(invoice.total || 0);
        case 'amount_words': return amountToWords(printCurrency === 'LBP' ? convertAmount(invoice.total || 0) : (invoice.total || 0), printCurrency);
        case 'print_currency': return printCurrency;
        // Line item fields
        case 'line_item_no': return line ? (lineIndex + 1).toString() : '';
        case 'line_description': return line?.item_name || '';
        case 'line_quantity': return line ? `${line.quantity}` : '';
        case 'line_unit': return line?.unit || '';
        case 'line_unit_price': {
          if (!line) return '';
          // Convert line price to print currency
          const priceUsd = line.line_total_usd ? (line.unit_price * (line.line_total_usd / line.line_total)) : line.unit_price;
          return formatAmount(priceUsd);
        }
        case 'line_discount': return line && line.discount_percent ? `${line.discount_percent}%` : '';
        case 'line_total': {
          if (!line) return '';
          // Use line_total_usd for conversion
          const totalUsd = line.line_total_usd || line.line_total || 0;
          return formatAmount(totalUsd);
        }
        default: return '';
      }
    };
    
    // Separate header fields from line item fields
    const headerFields = fieldPositions.filter(f => !f.field_name.startsWith('line_'));
    const lineFields = fieldPositions.filter(f => f.field_name.startsWith('line_'));
    
    // Generate field HTML with proper positioning (for header fields only now)
    const generateFieldHtml = (pos, lineIndex = 0) => {
      const value = getFieldValue(pos.field_name, lineIndex);
      if (!value) return '';
      
      // For line items, we now use table - this is only for header fields
      const yPos = pos.y;
      
      // Text wrapping styles
      const wrapStyles = pos.text_wrap === 'wrap' 
        ? `white-space: normal; word-wrap: break-word; overflow-wrap: break-word; max-width: ${pos.max_width || 100}%;`
        : 'white-space: nowrap;';
      
      return `<div style="
        position: absolute;
        left: ${pos.x}%;
        top: ${yPos}%;
        font-size: ${pos.font_size || 11}px;
        font-weight: ${pos.font_weight || 'normal'};
        text-align: ${pos.text_align || 'left'};
        ${wrapStyles}
      ">${value}</div>`;
    };
    
    // Generate header fields HTML
    const headerFieldsHtml = headerFields.map(pos => generateFieldHtml(pos)).join('');
    
    // Generate line items using the actual field positions from template
    const maxLines = Math.min(invoice.lines?.length || 0, lineConfig.max_rows);
    
    // Get line field positions and sort by X position for correct column order
    const lineFieldsSorted = [...lineFields].sort((a, b) => (a.x || 0) - (b.x || 0));
    
    // Get font size from first line field or default
    const lineFontSize = lineFields[0]?.font_size || 10;
    const lineRowHeight = lineConfig.row_height || 3;
    
    // Generate line items HTML using a TABLE for proper wrapping
    // This ensures wrapped descriptions don't overlap with next rows
    let lineItemsHtml = '';
    
    if (lineFieldsSorted.length > 0 && invoice.lines?.length > 0) {
      // Build column definitions based on field positions
      const columns = lineFieldsSorted.map(field => {
        // Calculate column width based on next field position or remaining space
        const fieldIndex = lineFieldsSorted.indexOf(field);
        const nextField = lineFieldsSorted[fieldIndex + 1];
        let width = field.width;
        if (!width && nextField) {
          width = (nextField.x - field.x);
        } else if (!width) {
          width = 100 - field.x; // Remaining space for last column
        }
        return {
          fieldName: field.field_name,
          x: field.x || 0,
          width: width,
          textAlign: field.text_align || 'left',
          fontWeight: field.font_weight || 'normal',
          fontSize: field.font_size || lineFontSize,
          maxWidth: field.max_width,
          textWrap: field.text_wrap
        };
      });
      
      // Start line items container at the configured start_y position
      lineItemsHtml = `<div style="
        position: absolute;
        left: ${lineFieldsSorted[0]?.x || 0}%;
        top: ${lineConfig.start_y}%;
        width: ${100 - (lineFieldsSorted[0]?.x || 0)}%;
        font-size: ${lineFontSize}px;
      ">
        <table style="
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        " class="items-table">
          <colgroup>
            ${columns.map(col => `<col style="width: ${col.width}%;">`).join('')}
          </colgroup>
          <tbody>`;
      
      invoice.lines.slice(0, maxLines).forEach((line, lineIdx) => {
        const lineUsdTotal = line.line_total_usd || line.line_total || 0;
        const lineUsdPrice = lineUsdTotal / (line.quantity || 1);
        
        lineItemsHtml += `<tr style="vertical-align: top; line-height: 1.3;">`;
        
        columns.forEach(col => {
          let value = '';
          switch (col.fieldName) {
            case 'line_item_no': value = (lineIdx + 1).toString(); break;
            case 'line_description': value = line.item_name || ''; break;
            case 'line_quantity': value = line.quantity?.toString() || ''; break;
            case 'line_unit': value = line.unit || ''; break;
            case 'line_unit_price': value = formatAmount(lineUsdPrice); break;
            case 'line_discount': value = line.discount_percent ? `${line.discount_percent}%` : ''; break;
            case 'line_total': value = formatAmount(lineUsdTotal); break;
            default: value = '';
          }
          
          // Apply text wrapping for description column
          const wrapStyle = col.fieldName === 'line_description' || col.textWrap === 'wrap'
            ? 'word-wrap: break-word; overflow-wrap: break-word; white-space: normal;'
            : 'white-space: nowrap;';
          
          const cellClass = col.fieldName === 'line_description' ? 'desc-cell' : '';
          
          lineItemsHtml += `<td class="${cellClass}" style="
            text-align: ${col.textAlign};
            font-weight: ${col.fontWeight};
            font-size: ${col.fontSize}px;
            padding: 1mm 0;
            ${wrapStyle}
          ">${value}</td>`;
        });
        
        lineItemsHtml += `</tr>`;
      });
      
      lineItemsHtml += `</tbody></table></div>`;
    }
    
    // Calculate aspect ratio for screen preview to match canvas exactly
    const aspectRatio = pageWidth / pageHeight;
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
          }
          body { 
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            align-items: center;
            background: #f0f0f0;
            padding: 20px;
          }
          .paper-size-hint {
            background: #2563eb;
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            margin-bottom: 15px;
            font-size: 14px;
          }
          .template-container {
            position: relative;
            width: ${pageWidth}mm;
            height: ${pageHeight}mm;
            background: white;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .background-layer {
            position: absolute;
            inset: 0;
            ${backgroundImage ? `background-image: url('${backgroundImage}');` : ''}
            ${backgroundImage ? `background-size: ${getBgSizeCSS()};` : ''}
            ${backgroundImage ? `background-position: ${getBgPositionCSS()};` : ''}
            ${backgroundImage ? 'background-repeat: no-repeat;' : ''}
            ${backgroundImage ? `opacity: ${bgOpacity / 100};` : ''}
          }
          @media print { 
            body { 
              padding: 0;
              margin: 0;
              background: white;
              display: block;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .paper-size-hint {
              display: none;
            }
            .template-container {
              width: ${pageWidth}mm;
              height: ${pageHeight}mm;
              box-shadow: none;
              margin: 0;
              padding: 0;
            }
            .background-layer {
              ${backgroundImage ? `background-image: url('${backgroundImage}') !important;` : ''}
              ${backgroundImage ? `background-size: ${getBgSizeCSS()} !important;` : ''}
              ${backgroundImage ? `background-position: ${getBgPositionCSS()} !important;` : ''}
              ${backgroundImage ? 'background-repeat: no-repeat !important;' : ''}
              ${backgroundImage ? `opacity: ${bgOpacity / 100} !important;` : ''}
              ${backgroundImage ? '-webkit-print-color-adjust: exact !important;' : ''}
              ${backgroundImage ? 'print-color-adjust: exact !important;' : ''}
            }
            /* Ensure text wrapping works in print */
            .items-table {
              table-layout: fixed !important;
            }
            .items-table td.desc-cell {
              word-wrap: break-word !important;
              overflow-wrap: break-word !important;
              word-break: break-word !important;
              white-space: normal !important;
            }
          }
          /* Items table styling */
          .items-table {
            table-layout: fixed;
            border-collapse: collapse;
          }
          .items-table td {
            vertical-align: top;
          }
          .items-table td.desc-cell {
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
          }
          @media screen {
            .template-container {
              /* Scale to fit screen while maintaining aspect ratio */
              max-width: 90vw;
              max-height: 90vh;
              width: min(90vw, calc(90vh * ${aspectRatio}));
              height: min(90vh, calc(90vw / ${aspectRatio}));
            }
          }
        </style>
      </head>
      <body>
        <div class="paper-size-hint">
          📄 Set paper size to: ${pageWidth}mm × ${pageHeight}mm ${pageWidth < pageHeight ? '(Portrait)' : '(Landscape)'}
        </div>
        <div class="template-container">
          ${backgroundImage ? '<div class="background-layer"></div>' : ''}
          ${headerFieldsHtml}
          ${lineItemsHtml}
        </div>
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
  };

  // Print with default format (backward compatible)
  const printDefaultFormat = (invoice, org, template, printCurrency = 'USD', withBackground = true) => {
    const companyName = template.company_name || org.name || 'KAIROS';
    const companyType = template.company_type || 'S.A.R.L.';
    const telFax = template.tel_fax || '';
    const mobile = template.mobile || '';
    const email = template.email || '';
    const address = template.address || '';
    const footerText = template.footer_text || 'Thank you for your business!';
    const showDiscount = template.show_discount_column !== false;
    // Only use background image if withBackground is true
    const backgroundImage = withBackground ? (template.background_image || '') : '';
    const bgPosition = template.background_position || 'center';
    const bgOpacity = template.background_opacity || 100;
    const bgSize = template.background_size || 'cover';
    
    // Calculate background CSS
    const getBgSizeCSS = () => {
      switch (bgSize) {
        case 'contain': return 'contain';
        case 'stretch': return '100% 100%';
        default: return 'cover';
      }
    };
    const getBgPositionCSS = () => {
      switch (bgPosition) {
        case 'top': return 'center top';
        case 'bottom': return 'center bottom';
        default: return 'center center';
      }
    };
    
    // Currency conversion setup
    const exchangeRate = currentOrg?.base_exchange_rate || 89500;
    const currencySymbol = printCurrency === 'USD' ? '$' : 'LBP ';
    
    // Convert amount based on print currency
    const convertAmount = (amountUsd) => {
      if (printCurrency === 'LBP') {
        return parseFloat(amountUsd || 0) * exchangeRate;
      }
      return parseFloat(amountUsd || 0);
    };
    
    const formatAmount = (amount) => {
      const converted = convertAmount(amount);
      if (printCurrency === 'LBP') {
        return `${currencySymbol}${Math.round(converted).toLocaleString()}`;
      }
      return `${currencySymbol}${converted.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    };
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: Arial, sans-serif; 
            font-size: 11px; 
            padding: 15px;
            line-height: 1.4;
            position: relative;
            min-height: 100vh;
          }
          .background-layer {
            position: fixed;
            inset: 0;
            z-index: -1;
            ${backgroundImage ? `background-image: url('${backgroundImage}');` : ''}
            ${backgroundImage ? `background-size: ${getBgSizeCSS()};` : ''}
            ${backgroundImage ? `background-position: ${getBgPositionCSS()};` : ''}
            ${backgroundImage ? 'background-repeat: no-repeat;' : ''}
            ${backgroundImage ? `opacity: ${bgOpacity / 100};` : ''}
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .background-layer {
              ${backgroundImage ? `background-image: url('${backgroundImage}') !important;` : ''}
              ${backgroundImage ? `background-size: ${getBgSizeCSS()} !important;` : ''}
              ${backgroundImage ? `background-position: ${getBgPositionCSS()} !important;` : ''}
              ${backgroundImage ? 'background-repeat: no-repeat !important;' : ''}
              ${backgroundImage ? `opacity: ${bgOpacity / 100} !important;` : ''}
              ${backgroundImage ? '-webkit-print-color-adjust: exact !important;' : ''}
              ${backgroundImage ? 'print-color-adjust: exact !important;' : ''}
            }
          }
          
          /* Header Section */
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 15px;
            border-bottom: 2px solid #000;
            padding-bottom: 10px;
          }
          .company-info {
            flex: 1;
          }
          .company-name {
            font-size: 24px;
            font-weight: bold;
            color: #1a365d;
            margin-bottom: 5px;
          }
          .company-details {
            font-size: 10px;
            line-height: 1.5;
          }
          .company-type {
            display: inline-block;
            border: 1px solid #000;
            padding: 2px 8px;
            font-size: 10px;
            margin-left: 10px;
          }
          .invoice-title {
            font-size: 28px;
            font-weight: bold;
            font-style: italic;
            color: #1a365d;
          }
          
          /* Customer & Invoice Info Section */
          .info-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
            gap: 20px;
          }
          .customer-info, .invoice-info {
            flex: 1;
          }
          .info-row {
            display: flex;
            margin-bottom: 8px;
            align-items: center;
          }
          .info-label {
            font-weight: bold;
            min-width: 70px;
          }
          .info-value {
            flex: 1;
            border-bottom: 1px solid #000;
            padding: 2px 5px;
            min-height: 18px;
          }
          
          /* Line Items Table */
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
            table-layout: fixed;
          }
          .items-table th {
            background: #f0f0f0;
            border: 1px solid #000;
            padding: 8px 5px;
            text-align: center;
            font-weight: bold;
            font-size: 11px;
          }
          .items-table td {
            border: 1px solid #000;
            padding: 6px 5px;
            text-align: center;
            vertical-align: top;
          }
          .items-table td.left { 
            text-align: left; 
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: pre-wrap;
            line-height: 1.3;
          }
          .items-table td.right { text-align: right; font-family: monospace; vertical-align: top; }
          .items-table tbody tr { 
            page-break-inside: avoid;
          }
          
          /* Description column styling - CRITICAL for long text wrapping */
          .items-table td.desc-cell {
            text-align: left !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            word-break: break-word !important;
            white-space: normal !important;
            line-height: 1.4;
            max-width: 250px;
            vertical-align: top;
          }
          .desc-main {
            display: block;
            margin-bottom: 2px;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          .desc-ar {
            display: block;
            direction: rtl;
            font-size: 0.9em;
            color: #555;
            word-wrap: break-word;
          }
          .used-parts {
            margin-top: 4px;
            padding-top: 4px;
            border-top: 1px dashed #ccc;
            font-size: 0.85em;
            color: #666;
          }
          .used-parts-label {
            font-weight: bold;
            color: #7c3aed;
          }
          
          /* Empty rows for form */
          .empty-row td { height: 25px; }
          
          /* Footer Section */
          .footer-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 15px;
          }
          .amount-words {
            flex: 2;
          }
          .amount-words-label {
            font-weight: bold;
          }
          .amount-words-value {
            border-bottom: 1px solid #000;
            padding: 2px 5px;
            min-height: 20px;
            font-style: italic;
          }
          .signature-section {
            flex: 1;
            text-align: center;
          }
          .signature-line {
            border-bottom: 1px solid #000;
            margin-top: 30px;
            margin-bottom: 5px;
          }
          .total-section {
            flex: 1;
            text-align: right;
          }
          .total-box {
            display: inline-block;
            border: 2px solid #000;
            padding: 8px 15px;
            font-size: 14px;
            font-weight: bold;
          }
          .total-label {
            font-weight: bold;
            margin-bottom: 5px;
          }
          
          @media print { 
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        ${backgroundImage ? '<div class="background-layer"></div>' : ''}
        <!-- Header -->
        <div class="header">
          <div class="company-info">
            <div class="company-name">${companyName}</div>
            ${companyType ? `<span class="company-type">${companyType}</span>` : ''}
            <div class="company-details">
              ${telFax ? `<div>Tel & Fax: ${telFax}</div>` : ''}
              ${mobile ? `<div>Cell: ${mobile}</div>` : ''}
              ${email ? `<div>E-mail: ${email}</div>` : ''}
              ${address ? `<div>${address}</div>` : ''}
            </div>
          </div>
          <div>
            <div class="invoice-title">Invoice</div>
            <div style="text-align: right; font-size: 12px; margin-top: 5px;">${invoice.invoice_number}</div>
          </div>
        </div>
        
        <!-- Customer & Invoice Info -->
        <div class="info-section">
          <div class="customer-info">
            <div class="info-row">
              <span class="info-label">Name:</span>
              <span class="info-value">${invoice.debit_account_name || invoice.customer_name || ''}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Address:</span>
              <span class="info-value">${invoice.customer_address || ''}</span>
            </div>
          </div>
          <div class="invoice-info">
            <div class="info-row">
              <span class="info-label">Account:</span>
              <span class="info-value">${invoice.debit_account_code || ''}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Date:</span>
              <span class="info-value">${(() => { const d = new Date(invoice.date); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; })()}</span>
            </div>
          </div>
        </div>
        
        <!-- Line Items Table -->
        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 8%;">Item No.</th>
              <th style="width: ${showDiscount ? '35%' : '42%'};">Description</th>
              <th style="width: 12%;">Quantity</th>
              <th style="width: 15%;">Unit Price</th>
              ${showDiscount ? '<th style="width: 10%;">Disc%</th>' : ''}
              <th style="width: 20%;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.lines.map((line, idx) => {
              const lineUsdTotal = line.line_total_usd || line.line_total || 0;
              const lineUsdPrice = lineUsdTotal / (line.quantity || 1);
              const hasUsedItems = line.used_items && line.used_items.length > 0;
              return `
              <tr>
                <td>${idx + 1}</td>
                <td class="desc-cell">
                  <span class="desc-main">${line.item_name}</span>
                  ${line.item_name_ar ? `<span class="desc-ar">${line.item_name_ar}</span>` : ''}
                  ${hasUsedItems ? `
                    <div class="used-parts">
                      <span class="used-parts-label">Parts Used:</span>
                      ${line.used_items.map(u => `${u.item_name} (×${u.quantity})`).join(', ')}
                    </div>
                  ` : ''}
                </td>
                <td>${line.quantity}</td>
                <td class="right">${formatAmount(lineUsdPrice)}</td>
                ${showDiscount ? `<td class="right">${line.discount_percent || 0}%</td>` : ''}
                <td class="right">${formatAmount(lineUsdTotal)}</td>
              </tr>
            `}).join('')}
            ${Array(Math.max(0, 10 - invoice.lines.length)).fill(`<tr class="empty-row"><td></td><td></td><td></td><td></td>${showDiscount ? '<td></td>' : ''}<td></td></tr>`).join('')}
            ${invoice.discount_amount > 0 ? `
              <tr>
                <td colspan="${showDiscount ? 5 : 4}" class="right"><strong>Discount (${invoice.discount_percent}%):</strong></td>
                <td class="right">-${formatAmount(invoice.discount_amount)}</td>
              </tr>
            ` : ''}
            ${invoice.tax_amount > 0 ? `
              <tr>
                <td colspan="${showDiscount ? 5 : 4}" class="right"><strong>Tax (${invoice.tax_percent}%):</strong></td>
                <td class="right">${formatAmount(invoice.tax_amount)}</td>
              </tr>
            ` : ''}
          </tbody>
        </table>
        
        <!-- Footer Section -->
        <div class="footer-section">
          <div class="amount-words">
            <span class="amount-words-label">Only:</span>
            <div class="amount-words-value">${amountToWords(convertAmount(invoice.total), printCurrency)}</div>
          </div>
          <div class="signature-section">
            <div class="signature-line"></div>
            <div>Signature</div>
          </div>
          <div class="total-section">
            <div class="total-label">Total (${printCurrency})</div>
            <div class="total-box">${formatAmount(invoice.total)}</div>
          </div>
        </div>
        
        ${footerText ? `<div style="margin-top: 20px; text-align: center; font-size: 10px; color: #666;">${footerText}</div>` : ''}
        
        ${invoice.is_posted ? `
          <div style="margin-top: 15px; padding: 5px; background: #f0f0f0; font-size: 10px;">
            <strong>Voucher:</strong> ${invoice.voucher_number || 'N/A'} | <strong>Status:</strong> POSTED
          </div>
        ` : ''}
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6" data-testid="sales-invoice-page">
      {/* Offline Banner */}
      <OfflineBanner />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Sales Invoices
          </h1>
          <p className="text-sm text-muted-foreground">
            Create and manage customer invoices
          </p>
        </div>
        
        {canEdit && (
          <Button className="btn-glow" onClick={() => openForm()} data-testid="new-invoice-btn">
            <Plus className="w-4 h-4 mr-2" />
            New Invoice
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search invoice #, customer, items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[130px]">
                <Filter className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Invoices List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base lg:text-lg flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Invoices ({totalCount})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="spinner" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No invoices found</p>
            </div>
          ) : (
            <>
              {/* Mobile View */}
              <div className="lg:hidden space-y-3">
                {invoices.map((inv) => (
                  <div key={inv.id} className="p-3 bg-muted/20 rounded-sm border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm font-bold">{inv.invoice_number}</span>
                      <span className={inv.is_posted ? 'status-posted' : 'status-draft'}>
                        {inv.is_posted ? 'Posted' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-sm">{inv.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(inv.date)}</p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                      <span className="font-mono font-bold">
                        {inv.currency} {formatUSD(inv.total)}
                      </span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setViewInvoice(inv)}>
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handlePrint(inv)}>
                          <Printer className="w-3 h-3" />
                        </Button>
                        {!inv.is_posted && canEdit && (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openForm(inv)}>
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handlePost(inv.id)}>
                              <Send className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                        {inv.is_posted && isSuperAdmin && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-orange-400 hover:text-orange-300 hover:bg-orange-500/20" onClick={() => setUnpostConfirm(inv)} title="Unpost Invoice">
                            <Undo2 className="w-3 h-3" />
                          </Button>
                        )}
                        {canDelete && !inv.is_posted && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400" onClick={() => setDeleteConfirm(inv)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                        {isSuperAdmin && inv.is_posted && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/20" onClick={() => setDeleteConfirm(inv)} title="Force Delete Posted Invoice">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {hasMore && (
                  <Button variant="outline" className="w-full" onClick={handleLoadMore} disabled={loadingMore}>
                    {loadingMore ? 'Loading...' : `Load More (${invoices.length} of ${totalCount})`}
                  </Button>
                )}
              </div>

              {/* Desktop View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Date</th>
                      <th>Debit Account</th>
                      <th>Items</th>
                      <th className="text-right">Total (USD)</th>
                      <th>Status</th>
                      <th>Voucher</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="font-mono text-sm font-bold">{inv.invoice_number}</td>
                        <td className="text-muted-foreground">{formatDate(inv.date)}</td>
                        <td>
                          <span className="font-mono text-xs text-cyan-400">{inv.debit_account_code}</span>
                          <br />
                          <span className="text-sm">{inv.debit_account_name}</span>
                        </td>
                        <td className="text-muted-foreground">{inv.lines.length} items</td>
                        <td className="text-right font-mono font-bold text-green-400">
                          ${formatUSD(inv.total_usd)}
                        </td>
                        <td>
                          <span className={inv.is_posted ? 'status-posted' : 'status-draft'}>
                            {inv.is_posted ? 'Posted' : 'Draft'}
                          </span>
                        </td>
                        <td className="font-mono text-xs">{inv.voucher_number || '-'}</td>
                        <td>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setViewInvoice(inv)} title="View">
                              <Eye className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handlePrint(inv)} title="Print">
                              <Printer className="w-3 h-3" />
                            </Button>
                            {!inv.is_posted && canEdit && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => openForm(inv)} title="Edit">
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handlePost(inv.id)} title="Post">
                                  <Send className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                            {inv.is_posted && isSuperAdmin && (
                              <Button variant="ghost" size="sm" className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/20" onClick={() => setUnpostConfirm(inv)} title="Unpost Invoice">
                                <Undo2 className="w-3 h-3" />
                              </Button>
                            )}
                            {canDelete && !inv.is_posted && (
                              <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setDeleteConfirm(inv)} title="Delete">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                            {isSuperAdmin && inv.is_posted && (
                              <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/20" onClick={() => setDeleteConfirm(inv)} title="Force Delete Posted Invoice">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {hasMore && (
                  <div className="mt-4 text-center">
                    <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
                      {loadingMore ? 'Loading...' : `Load More (${invoices.length} of ${totalCount})`}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Invoice Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { setIsFormOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                <span className="text-sm text-muted-foreground">Loading inventory and accounts...</span>
                <span className="text-xs text-muted-foreground">This may take a moment for large inventories</span>
              </div>
            </div>
          )}
          
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              {editingInvoice ? 'Edit Invoice' : 'New Sales Invoice'}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Header Fields - Date & Due Date Only */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <DateInput
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <DateInput
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              </div>
            </div>

            {/* Debit & Credit Accounts with Search */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {loading ? (
                <div className="col-span-2 flex items-center justify-center py-8">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    <span>Loading accounts and inventory...</span>
                  </div>
                </div>
              ) : (
                <>
                  <AccountSelector
                    accounts={customers}
                    value={formData.debit_account_id}
                    onChange={(v) => setFormData({ ...formData, debit_account_id: v })}
                    label="Debit Account (Receivable) *"
                    labelIcon={DollarSign}
                    labelColor="text-red-400"
                    placeholder="Search customer account..."
                  />
                  <AccountSelector
                    accounts={salesAccounts}
                    value={formData.credit_account_id}
                    onChange={(v) => setFormData({ ...formData, credit_account_id: v })}
                    label="Credit Account (Sales) *"
                    labelIcon={DollarSign}
                    labelColor="text-green-400"
                    placeholder="Search sales account..."
                  />
                </>
              )}
            </div>

            {/* Line Items with Per-Line Currency - Enhanced Visibility */}
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-muted/30 p-2 rounded-t-lg border-b">
                <Label className="flex items-center gap-2 text-base font-semibold">
                  <Package className="w-4 h-4 text-primary" />
                  Line Items (Multi-Currency)
                </Label>
                <Button type="button" variant="default" size="sm" onClick={addLine} className="gap-1">
                  <Plus className="w-4 h-4" />
                  Add Line
                </Button>
              </div>
              
              <div className="border rounded-lg overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gradient-to-r from-muted/80 to-muted/50">
                      <tr>
                        <th className="p-3 text-left min-w-[220px] font-semibold">Item (Search)</th>
                        <th className="p-3 text-center w-20 font-semibold">Qty</th>
                        {currentOrg?.enable_expiry_tracking && (
                          <th className="p-3 text-center w-32 font-semibold">Batch</th>
                        )}
                        <th className="p-3 text-center w-24 font-semibold">Currency</th>
                        <th className="p-3 text-center w-24 font-semibold">Rate</th>
                        <th className="p-3 text-right w-28 font-semibold">Unit Price</th>
                        <th className="p-3 text-center w-20 font-semibold">Disc%</th>
                        <th className="p-3 text-right w-28 font-semibold">Line Total</th>
                        <th className="p-3 text-right w-28 font-semibold text-green-400">USD Equiv.</th>
                        <th className="p-3 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {formData.lines.map((line, idx) => (
                        <React.Fragment key={idx}>
                        <tr className="hover:bg-muted/20 transition-colors">
                          <td className="p-2">
                            <InventorySelector
                              items={inventoryItems}
                              serviceItems={serviceItems}
                              value={line.inventory_item_id}
                              onChange={(v) => handleLineChange(idx, 'inventory_item_id', v)}
                              currencies={currencies}
                              lineCurrency={line.currency}
                              onSelectService={(service) => handleSelectService(idx, service)}
                              organizationId={currentOrg?.id}
                              apiUrl={API}
                              onItemSelect={handleItemSelectedFromSearch}
                              onCreateNewItem={(searchTerm) => setNewItemDialog({ name: searchTerm, lineIndex: idx })}
                            />
                            {line.inventory_item_id === '' && (
                              <div className="flex gap-1 mt-1">
                                <Input
                                  placeholder="Item name (manual)"
                                  value={line.item_name}
                                  onChange={(e) => handleLineChange(idx, 'item_name', e.target.value)}
                                  className="h-8 text-xs flex-1"
                                />
                                {line.item_name && (
                                  <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm"
                                    className="h-8 px-2 text-purple-400 hover:text-purple-300 hover:border-purple-500"
                                    onClick={() => saveLineAsService(idx)}
                                    title="Save as reusable service"
                                  >
                                    <Save className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.quantity}
                              onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                              className="h-9 text-center font-medium"
                            />
                          </td>
                          {currentOrg?.enable_expiry_tracking && (
                            <td className="p-2">
                              {line.inventory_item_id && itemBatches[line.inventory_item_id]?.length > 0 ? (
                                <Select 
                                  value={line.batch_id || 'auto'} 
                                  onValueChange={(v) => handleLineChange(idx, 'batch_id', v === 'auto' ? '' : v)}
                                >
                                  <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="Auto (FEFO)" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="auto">Auto (FEFO)</SelectItem>
                                    {itemBatches[line.inventory_item_id]?.map(batch => (
                                      <SelectItem key={batch.id} value={batch.id}>
                                        <div className="flex flex-col">
                                          <span>{batch.batch_number}</span>
                                          <span className="text-[10px] text-muted-foreground">
                                            Qty: {batch.quantity} | Exp: {batch.expiry_date || 'N/A'}
                                          </span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </td>
                          )}
                          <td className="p-2">
                            <Select 
                              value={line.currency || 'USD'} 
                              onValueChange={(v) => {
                                handleLineChange(idx, 'currency', v);
                              if (v === 'USD') handleLineChange(idx, 'exchange_rate', 1);
                              else if (v === 'LBP') handleLineChange(idx, 'exchange_rate', currentOrg?.base_exchange_rate || 89500);
                            }}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="LBP">LBP</SelectItem>
                              {currencies.filter(c => !['USD', 'LBP'].includes(c.code)).map(c => (
                                <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          {line.currency !== 'USD' ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.exchange_rate}
                              onChange={(e) => handleLineChange(idx, 'exchange_rate', e.target.value)}
                              className="h-9 text-center font-mono"
                            />
                          ) : (
                            <span className="text-sm text-muted-foreground block text-center">1.00</span>
                          )}
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.unit_price}
                            onChange={(e) => handleLineChange(idx, 'unit_price', e.target.value)}
                            className="h-9 text-right font-mono"
                          />
                          {/* LP, C, QH display for inventory items */}
                          {line.inventory_item_id && (() => {
                            const itemInfo = getItemInfo(line.inventory_item_id);
                            const lastPriceData = getLastPriceFromCache(formData.debit_account_id, line.inventory_item_id);
                            if (!itemInfo) return null;
                            return (
                              <div className="text-[9px] mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                                {lastPriceData && lastPriceData.last_price !== null && (
                                  <span className="text-yellow-400" title={`Last sold on ${lastPriceData.date || 'N/A'}`}>
                                    LP:{formatUSD(lastPriceData.last_price)}
                                  </span>
                                )}
                                <span className="text-orange-400" title="Cost">C:{formatUSD(itemInfo.cost)}</span>
                                <span className="text-blue-400" title="Qty on Hand">QH:{itemInfo.qh}</span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={line.discount_percent}
                            onChange={(e) => handleLineChange(idx, 'discount_percent', e.target.value)}
                            className="h-9 text-center"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <div className="font-mono text-sm font-medium">
                            <span className="text-muted-foreground text-xs mr-1">{line.currency || 'USD'}</span>
                            {formatUSD(line.line_total)}
                          </div>
                        </td>
                        <td className="p-2 text-right">
                          <span className="font-mono text-sm font-semibold text-green-400">
                            ${formatUSD(line.line_total_usd || line.line_total)}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          {formData.lines.length > 1 && (
                            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/20" onClick={() => removeLine(idx)}>
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                      {/* Used Items Row - Show only for service/manual items (no inventory_item_id) */}
                      {!line.inventory_item_id && (
                        <tr className="bg-muted/10 border-l-2 border-l-purple-500">
                          <td colSpan={9} className="p-2 pl-4">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-purple-400 flex items-center gap-1">
                                  <Package className="w-3 h-3" />
                                  Used Items (Parts/Materials from Inventory)
                                </span>
                                <Button 
                                  type="button" 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-6 text-xs gap-1 text-purple-400 border-purple-500/50 hover:bg-purple-500/10"
                                  onClick={() => addUsedItem(idx)}
                                >
                                  <Plus className="w-3 h-3" />
                                  Add Part
                                </Button>
                              </div>
                              {line.used_items && line.used_items.length > 0 && (
                                <div className="space-y-1">
                                  {line.used_items.map((usedItem, usedIdx) => (
                                    <div key={usedIdx} className="flex items-center gap-2 bg-background/50 p-2 rounded border border-purple-500/20">
                                      <div className="flex-1 min-w-[220px]">
                                        <UsedItemSelector
                                          items={inventoryItems}
                                          value={usedItem.inventory_item_id}
                                          onChange={(id, item) => handleUsedItemChange(idx, usedIdx, 'inventory_item_id', id, item)}
                                          placeholder="Search parts by name, barcode..."
                                        />
                                      </div>
                                      <div className="w-20">
                                        <Input
                                          type="number"
                                          step="1"
                                          min="1"
                                          placeholder="Qty"
                                          value={usedItem.quantity}
                                          onChange={(e) => handleUsedItemChange(idx, usedIdx, 'quantity', parseFloat(e.target.value) || 1)}
                                          className="h-8 text-xs text-center"
                                        />
                                      </div>
                                      {usedItem.available_qty !== undefined && (
                                        <span className={`text-xs ${usedItem.quantity > usedItem.available_qty ? 'text-red-400 font-medium' : 'text-muted-foreground'}`}>
                                          / {usedItem.available_qty} {usedItem.unit || ''}
                                        </span>
                                      )}
                                      <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                                        onClick={() => removeUsedItem(idx, usedIdx)}
                                      >
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {(!line.used_items || line.used_items.length === 0) && (
                                <p className="text-xs text-muted-foreground italic">
                                  No parts/materials added. Click &quot;Add Part&quot; to include inventory items that will be deducted from stock.
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

            {/* Totals - All in USD */}
            <div className="flex justify-end">
              <div className="w-72 space-y-2 bg-muted/30 p-3 rounded">
                <div className="flex justify-between text-sm">
                  <span>Subtotal (USD):</span>
                  <span className="font-mono text-green-400">${formatUSD(formData.subtotal)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm w-24">Discount %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={formData.discount_percent}
                    onChange={(e) => handleDiscountTaxChange('discount_percent', e.target.value)}
                    className="h-8 w-20 text-right"
                  />
                  <span className="font-mono text-sm text-red-400">-${formatUSD(formData.discount_amount)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm w-24">Tax %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={formData.tax_percent}
                    onChange={(e) => handleDiscountTaxChange('tax_percent', e.target.value)}
                    className="h-8 w-20 text-right"
                  />
                  <span className="font-mono text-sm text-cyan-400">+${formatUSD(formData.tax_amount)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total (USD):</span>
                  <span className="font-mono text-green-400">${formatUSD(formData.total_usd)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Invoice notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
              />
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => { setIsFormOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingInvoice ? 'Update Invoice' : 'Create Invoice'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Invoice Dialog */}
      <Dialog open={!!viewInvoice} onOpenChange={() => setViewInvoice(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice {viewInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          
          {viewInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-muted/30 rounded">
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p>{formatDate(viewInvoice.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p>{viewInvoice.due_date ? formatDate(viewInvoice.due_date) : '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <span className={viewInvoice.is_posted ? 'status-posted' : 'status-draft'}>
                    {viewInvoice.is_posted ? 'Posted' : 'Draft'}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Voucher</p>
                  <p className="font-mono">{viewInvoice.voucher_number || '-'}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/20 rounded">
                <div>
                  <p className="text-xs text-muted-foreground">Debit Account (Receivable)</p>
                  <p className="font-mono text-sm text-red-400">{viewInvoice.debit_account_code}</p>
                  <p className="font-medium">{viewInvoice.debit_account_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Credit Account (Sales)</p>
                  <p className="font-mono text-sm text-green-400">{viewInvoice.credit_account_code}</p>
                  <p className="font-medium">{viewInvoice.credit_account_name}</p>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Line Items (Multi-Currency)</h4>
                <table className="data-table text-sm">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Qty</th>
                      <th className="text-center">Currency</th>
                      <th className="text-right">Unit Price</th>
                      <th className="text-right">Disc %</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewInvoice.lines.map((line, idx) => (
                      <React.Fragment key={idx}>
                        <tr>
                          <td>
                            {line.item_name}
                            {line.barcode && <span className="text-xs text-muted-foreground ml-1">[{line.barcode}]</span>}
                          </td>
                          <td className="text-right">{line.quantity} {line.unit}</td>
                          <td className="text-center text-xs">{line.currency || 'USD'}</td>
                          <td className="text-right font-mono">{line.currency === 'USD' ? '$' : line.currency + ' '}{formatUSD(line.unit_price)}</td>
                          <td className="text-right">{line.discount_percent}%</td>
                          <td className="text-right font-mono">{line.currency || 'USD'} {formatUSD(line.line_total)}</td>
                          <td className="text-right font-mono text-green-400">${formatUSD(line.line_total_usd || line.line_total)}</td>
                        </tr>
                        {/* Show used items if any */}
                        {line.used_items && line.used_items.length > 0 && (
                          <tr className="bg-purple-500/5">
                            <td colSpan={7} className="px-4 py-2">
                              <div className="text-xs">
                                <span className="text-purple-400 font-medium">Used Parts:</span>
                                <ul className="mt-1 space-y-0.5">
                                  {line.used_items.map((usedItem, uIdx) => (
                                    <li key={uIdx} className="text-muted-foreground flex items-center gap-1">
                                      <Package className="w-3 h-3" />
                                      {usedItem.item_name} × {usedItem.quantity}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="flex justify-end">
                <div className="w-64 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal (USD):</span>
                    <span className="font-mono text-green-400">${formatUSD(viewInvoice.subtotal)}</span>
                  </div>
                  {viewInvoice.discount_amount > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Discount ({viewInvoice.discount_percent}%):</span>
                      <span className="font-mono text-red-400">-${formatUSD(viewInvoice.discount_amount)}</span>
                    </div>
                  )}
                  {viewInvoice.tax_amount > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tax ({viewInvoice.tax_percent}%):</span>
                      <span className="font-mono text-cyan-400">+${formatUSD(viewInvoice.tax_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t pt-1">
                    <span>Total (USD):</span>
                    <span className="font-mono text-green-400">${formatUSD(viewInvoice.total_usd)}</span>
                  </div>
                </div>
              </div>
              
              {viewInvoice.notes && (
                <div className="p-3 bg-muted/20 rounded">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{viewInvoice.notes}</p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setViewInvoice(null)}>Close</Button>
            {viewInvoice?.is_posted && isSuperAdmin && (
              <Button 
                variant="outline"
                className="text-orange-400 border-orange-400 hover:bg-orange-500/20"
                onClick={() => {
                  setUnpostConfirm(viewInvoice);
                  setViewInvoice(null);
                }}
              >
                <Undo2 className="w-4 h-4 mr-2" />
                Unpost Invoice
              </Button>
            )}
            <Button onClick={() => handlePrint(viewInvoice)}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className={deleteConfirm?.is_posted ? 'text-red-500' : ''}>
              {deleteConfirm?.is_posted ? '⚠️ Force Delete Posted Invoice' : 'Delete Invoice'}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>Are you sure you want to delete invoice <strong>{deleteConfirm?.invoice_number}</strong>?</p>
              {deleteConfirm?.is_posted && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-400 text-sm">
                  <p className="font-semibold mb-1">Warning: This is a POSTED invoice!</p>
                  <p>Deleting will:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Reverse all journal entries and account balances</li>
                    <li>Restore inventory quantities</li>
                    <li>Delete the associated voucher ({deleteConfirm?.voucher_number})</li>
                    <li>Permanently remove the invoice</li>
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>
              {deleteConfirm?.is_posted ? 'Force Delete' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unpost Confirmation */}
      <Dialog open={!!unpostConfirm} onOpenChange={() => setUnpostConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-orange-400 flex items-center gap-2">
              <Undo2 className="w-5 h-5" />
              Unpost Invoice
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>Are you sure you want to unpost invoice <strong>{unpostConfirm?.invoice_number}</strong>?</p>
              <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-md text-orange-400 text-sm">
                <p className="font-semibold mb-1">This action will:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Reverse all journal entries</li>
                  <li>Restore account balances to previous state</li>
                  <li>Restore inventory quantities (add back sold items)</li>
                  <li>Delete the voucher ({unpostConfirm?.voucher_number})</li>
                  <li>Change invoice status to &quot;Draft&quot;</li>
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">The invoice can be edited and posted again after unposting.</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnpostConfirm(null)}>Cancel</Button>
            <Button 
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={handleUnpost}
            >
              <Undo2 className="w-4 h-4 mr-2" />
              Unpost Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Currency Selection Dialog */}
      <Dialog open={!!printCurrencyDialog} onOpenChange={() => setPrintCurrencyDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Print Invoice
            </DialogTitle>
            <DialogDescription>
              Select the currency for printing the invoice
            </DialogDescription>
          </DialogHeader>
          
          {/* Background Option */}
          <div className="flex items-center gap-2 py-2 px-3 bg-muted/30 rounded-lg border">
            <input
              type="checkbox"
              id="print-with-background"
              checked={printWithBackground}
              onChange={(e) => setPrintWithBackground(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="print-with-background" className="text-sm cursor-pointer flex-1">
              Print with background image
            </label>
          </div>
          
          <div className="grid grid-cols-2 gap-3 py-4">
            <Button
              variant="outline"
              className="h-20 flex flex-col items-center justify-center gap-2 hover:bg-green-500/10 hover:border-green-500"
              onClick={() => executePrint(printCurrencyDialog, 'USD', printWithBackground)}
            >
              <DollarSign className="w-8 h-8 text-green-500" />
              <span className="font-semibold">Print in USD</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 flex flex-col items-center justify-center gap-2 hover:bg-blue-500/10 hover:border-blue-500"
              onClick={() => executePrint(printCurrencyDialog, 'LBP', printWithBackground)}
            >
              <span className="text-2xl font-bold text-blue-500">ل.ل</span>
              <span className="font-semibold">Print in LBP</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Exchange rate: 1 USD = {(currentOrg?.base_exchange_rate || 89500).toLocaleString()} LBP
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPrintCurrencyDialog(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create New Item Dialog */}
      <Dialog open={!!newItemDialog} onOpenChange={() => setNewItemDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-400">
              <Package className="w-5 h-5" />
              Create New Inventory Item
            </DialogTitle>
            <DialogDescription>
              Add a new item to your inventory and use it in this invoice.
            </DialogDescription>
          </DialogHeader>
          {newItemDialog && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const formEl = e.target;
              handleCreateNewItem({
                name: formEl.itemName.value,
                name_ar: formEl.itemNameAr.value || null,
                barcode: formEl.barcode.value || null,
                price: formEl.price.value,
                cost: formEl.cost.value || 0,
                currency: formEl.currency.value,
                unit: formEl.unit.value,
                category: formEl.category.value,
                is_taxable: formEl.is_taxable.checked
              });
            }}>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="itemName">Item Name *</Label>
                    <Input
                      id="itemName"
                      name="itemName"
                      defaultValue={newItemDialog.name}
                      placeholder="Enter item name"
                      required
                      className="mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="itemNameAr">Arabic Name</Label>
                    <Input
                      id="itemNameAr"
                      name="itemNameAr"
                      placeholder="الاسم بالعربي"
                      className="mt-1"
                      dir="rtl"
                    />
                  </div>
                  <div>
                    <Label htmlFor="barcode">Barcode</Label>
                    <Input
                      id="barcode"
                      name="barcode"
                      placeholder="Optional"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Input
                      id="category"
                      name="category"
                      defaultValue="General"
                      placeholder="Category"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="price">Selling Price</Label>
                    <Input
                      id="price"
                      name="price"
                      type="number"
                      step="0.01"
                      defaultValue="0"
                      placeholder="0.00"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cost">Cost Price</Label>
                    <Input
                      id="cost"
                      name="cost"
                      type="number"
                      step="0.01"
                      defaultValue="0"
                      placeholder="0.00"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="currency">Currency</Label>
                    <Select name="currency" defaultValue="USD">
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="LBP">LBP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="unit">Unit</Label>
                    <Select name="unit" defaultValue="piece">
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Unit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="piece">Piece</SelectItem>
                        <SelectItem value="kg">Kilogram</SelectItem>
                        <SelectItem value="g">Gram</SelectItem>
                        <SelectItem value="l">Liter</SelectItem>
                        <SelectItem value="m">Meter</SelectItem>
                        <SelectItem value="box">Box</SelectItem>
                        <SelectItem value="pack">Pack</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_taxable"
                      name="is_taxable"
                      defaultChecked={true}
                      className="w-4 h-4 rounded border-gray-600"
                    />
                    <Label htmlFor="is_taxable" className="cursor-pointer">Taxable item</Label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setNewItemDialog(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={newItemSaving}>
                  {newItemSaving ? 'Creating...' : 'Create & Add to Line'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesInvoicePage;
