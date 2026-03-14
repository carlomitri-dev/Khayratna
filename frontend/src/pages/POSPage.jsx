import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import OfflineBanner from '../components/OfflineBanner';
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
  DialogFooter,
  DialogDescription,
} from '../components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover';
import { 
  Search, Plus, Minus, Trash2, ShoppingCart, CreditCard, Banknote, 
  Package, DollarSign, Percent, X, Check, UserCheck,
  History, Printer, Clock, User, BarChart3, ChevronsUpDown, Building2, AlertTriangle, WifiOff, Settings
} from 'lucide-react';
import axios from 'axios';
import { formatUSD, formatDate } from '../lib/utils';
import { toast } from 'sonner';
import db from '../lib/db';
import { addToSyncQueue, OPERATION_TYPES, ACTION_TYPES } from '../lib/syncService';
import ReceiptSettingsDialog from '../components/shared/ReceiptSettingsDialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Quick Item Button Component
const QuickItemButton = ({ item, onClick, showImage = true }) => {
  // Check for either S3 URL (image_url) or local file (image_filename)
  const hasImage = item.image_url || item.image_filename;
  const shouldShowImage = showImage && item.show_image_in_pos !== false && hasImage;
  
  // Get image URL - prioritize S3 URL, fall back to local
  const getImageSrc = () => {
    if (item.image_url) {
      // S3 URL - use directly (it's a full URL)
      return item.image_url;
    }
    if (item.image_filename) {
      // Local file - construct API URL
      return `${API}/inventory/image/${encodeURIComponent(item.image_filename)}`;
    }
    return null;
  };
  
  return (
    <button
      onClick={() => onClick(item)}
      className="p-2 bg-card border border-border rounded-xl hover:bg-muted hover:border-primary/50 hover:shadow-lg transition-all duration-200 text-left flex flex-col group"
    >
      {shouldShowImage ? (
        <div className="w-full aspect-square mb-2 rounded-lg overflow-hidden bg-gradient-to-br from-muted/80 to-muted flex items-center justify-center border border-border/50">
          <img 
            src={getImageSrc()} 
            alt={item.name} 
            className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform duration-200"
            onError={(e) => { 
              e.target.style.display = 'none'; 
              e.target.parentElement.innerHTML = '<div class="text-3xl opacity-30">📦</div>';
            }}
          />
        </div>
      ) : (
        <div className="w-full aspect-square mb-2 rounded-lg overflow-hidden bg-gradient-to-br from-muted/80 to-muted flex items-center justify-center border border-border/50">
          <span className="text-3xl opacity-30">📦</span>
        </div>
      )}
      <div className="text-xs font-mono text-cyan-400 truncate w-full">{item.barcode || item.sku || 'N/A'}</div>
      <div className="text-sm font-semibold truncate w-full leading-tight mt-0.5">{item.name}</div>
      <div className="flex justify-between items-center w-full mt-1">
        <span className="text-sm font-bold text-primary">{item.currency || 'USD'} {formatUSD(item.price)}</span>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{item.on_hand_qty || 0}</span>
      </div>
    </button>
  );
};

// Searchable Item Selector for POS
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
              className="pl-10 h-12 text-lg"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[350px] overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No items found
            </div>
          ) : (
            filteredItems.map(item => (
              <div
                key={item.id}
                className="flex items-center px-3 py-2 cursor-pointer hover:bg-muted border-b border-border/50"
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {item.barcode && <span className="font-mono text-sm text-cyan-400">[{item.barcode}]</span>}
                    <span className="font-medium">{item.name}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {item.currency || 'USD'} {formatUSD(item.price)} • Stock: {item.on_hand_qty}
                  </div>
                </div>
                <Plus className="w-5 h-5 text-green-400" />
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Customer Selector Component
const CustomerSelector = ({ customers, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredCustomers = useMemo(() => {
    if (!search) return customers;
    const searchLower = search.toLowerCase();
    return customers.filter(c => 
      c.code.toLowerCase().includes(searchLower) ||
      c.name.toLowerCase().includes(searchLower)
    );
  }, [customers, search]);

  const selected = customers.find(c => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between h-10">
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <span className="font-mono text-cyan-400">{selected.code}</span>
              <span>{selected.name}</span>
              <span className={`text-xs px-1 rounded ${(selected.balance_usd || 0) >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                ${formatUSD(Math.abs(selected.balance_usd || 0))}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Select customer...</span>
          )}
          <ChevronsUpDown className="w-4 h-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="start">
        <div className="p-2 border-b border-border">
          <Input
            placeholder="Search customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
            autoFocus
          />
        </div>
        <div className="max-h-[250px] overflow-y-auto">
          <div
            className={`flex items-center px-3 py-2 cursor-pointer hover:bg-muted ${!value ? 'bg-muted' : ''}`}
            onClick={() => { onChange(''); setOpen(false); }}
          >
            <span className="text-muted-foreground">Walk-in Customer (Cash)</span>
          </div>
          {filteredCustomers.map(c => (
            <div
              key={c.id}
              className={`flex items-center px-3 py-2 cursor-pointer hover:bg-muted ${value === c.id ? 'bg-muted' : ''}`}
              onClick={() => { onChange(c.id); setOpen(false); setSearch(''); }}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-cyan-400">{c.code}</span>
                  <span>{c.name}</span>
                </div>
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded ${(c.balance_usd || 0) >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                ${formatUSD(Math.abs(c.balance_usd || 0))}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const POSPage = () => {
  const { currentOrg, user } = useAuth();
  const { isOnline, pendingCount, triggerSync, updatePendingCount } = useSync();
  const [searchParams, setSearchParams] = useSearchParams();
  const barcodeInputRef = useRef(null);
  
  // Data
  const [inventoryItems, setInventoryItems] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [salesAccounts, setSalesAccounts] = useState([]);
  const [customerAccounts, setCustomerAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dailySummary, setDailySummary] = useState(null);
  const [customerHistory, setCustomerHistory] = useState([]);
  
  // Cart State
  const [cart, setCart] = useState([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [taxPercent, setTaxPercent] = useState(11);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  
  // Batch State
  const [itemBatches, setItemBatches] = useState({}); // { itemId: [batches] }
  const [batchSelectorOpen, setBatchSelectorOpen] = useState(null); // cart index
  
  // Display Currency
  const [displayCurrency, setDisplayCurrency] = useState('USD');
  const [lbpRate, setLbpRate] = useState(89500);
  
  // Settings
  const [creditAccountId, setCreditAccountId] = useState('');
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [showReceipt, setShowReceipt] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [viewTransaction, setViewTransaction] = useState(null); // For viewing transaction from URL param
  
  // Payment State
  const [paymentMethod, setPaymentMethod] = useState('cash'); // cash, card, customer
  const [paymentCurrency, setPaymentCurrency] = useState('USD');
  const [paymentExchangeRate, setPaymentExchangeRate] = useState(1);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedCashAccount, setSelectedCashAccount] = useState('');
  const [selectedBankAccount, setSelectedBankAccount] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // Transaction to delete
  const [paymentAdjustment, setPaymentAdjustment] = useState(0); // Adjustment discount/premium based on payment amount
  const [receiptSettings, setReceiptSettings] = useState(null);
  const [showReceiptSettings, setShowReceiptSettings] = useState(false);
  const [voidConfirm, setVoidConfirm] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [showVoided, setShowVoided] = useState(false);

  // Calculate totals in multiple currencies
  // Tax is only applied to items marked as is_taxable
  const totals = useMemo(() => {
    const subtotalUsd = cart.reduce((sum, item) => sum + (item.line_total_usd || 0), 0);
    // Calculate taxable subtotal - only items where is_taxable is true
    const taxableSubtotal = cart.reduce((sum, item) => {
      if (item.is_taxable !== false) {
        return sum + (item.line_total_usd || 0);
      }
      return sum;
    }, 0);
    const discountAmount = subtotalUsd * (discountPercent / 100);
    const afterDiscount = subtotalUsd - discountAmount;
    // Apply discount proportionally to taxable amount
    const taxableAfterDiscount = taxableSubtotal * (1 - discountPercent / 100);
    const taxAmount = taxableAfterDiscount * (taxPercent / 100);
    const totalUsd = afterDiscount + taxAmount;
    const totalLbp = totalUsd * lbpRate;
    
    return { subtotalUsd, taxableSubtotal, discountAmount, taxAmount, totalUsd, totalLbp };
  }, [cart, discountPercent, taxPercent, lbpRate]);

  // Calculate payment adjustment (discount if paid less, premium if paid more)
  const calculatedAdjustment = useMemo(() => {
    if (paymentMethod === 'customer') return 0;
    const paid = parseFloat(paymentAmount) || 0;
    const paidUsd = paymentCurrency === 'USD' ? paid : paid / paymentExchangeRate;
    // Positive = discount (paid less), Negative = premium (paid more)
    return totals.totalUsd - paidUsd;
  }, [paymentAmount, paymentCurrency, paymentExchangeRate, totals.totalUsd, paymentMethod]);

  // Calculate change (only if paid more than total after adjustment)
  const changeAmount = useMemo(() => {
    if (paymentMethod === 'customer') return 0;
    const paid = parseFloat(paymentAmount) || 0;
    const paidUsd = paymentCurrency === 'USD' ? paid : paid / paymentExchangeRate;
    // If using adjustment, no change needed
    if (paymentAdjustment !== 0) return 0;
    return Math.max(0, paidUsd - totals.totalUsd);
  }, [paymentAmount, paymentCurrency, paymentExchangeRate, totals.totalUsd, paymentMethod, paymentAdjustment]);

  useEffect(() => {
    const loadData = async () => {
      if (!currentOrg) return;
      setLoading(true);
      try {
        // Try to load from server first (if online)
        if (isOnline) {
          const [inventoryRes, cashRes, salesRes, customersRes, summaryRes] = await Promise.all([
            axios.get(`${API}/pos/inventory?organization_id=${currentOrg.id}`),
            axios.get(`${API}/pos/cash-accounts?organization_id=${currentOrg.id}`),
            axios.get(`${API}/sales-accounts?organization_id=${currentOrg.id}`),
            axios.get(`${API}/customer-accounts?organization_id=${currentOrg.id}`),
            axios.get(`${API}/pos/daily-summary?organization_id=${currentOrg.id}`).catch(() => ({ data: null }))
          ]);
          
          // POS inventory endpoint returns array directly
          const inventoryData = inventoryRes.data;
          
          // Cache data in IndexedDB for offline use
          try {
            // Cache inventory
            await db.inventoryItems.where('organization_id').equals(currentOrg.id).delete();
            if (inventoryData.length > 0) {
              // Add organization_id for caching
              const itemsToCache = inventoryData.map(item => ({ ...item, organization_id: currentOrg.id }));
              await db.inventoryItems.bulkPut(itemsToCache);
            }
            
            // Cache customers
            await db.customers.where('organization_id').equals(currentOrg.id).delete();
            const customerData = customersRes.data.map(c => ({ ...c, organization_id: currentOrg.id }));
            if (customerData.length > 0) {
              await db.customers.bulkPut(customerData);
            }
            
            // Cache chart of accounts for cash/sales accounts
            const allAccounts = [...cashRes.data, ...salesRes.data];
            const accountsToCache = allAccounts.map(a => ({ ...a, organization_id: currentOrg.id }));
            if (accountsToCache.length > 0) {
              await db.chartOfAccounts.bulkPut(accountsToCache);
            }
          } catch (cacheError) {
            console.warn('[POS] Error caching data:', cacheError);
          }
          
          setInventoryItems(inventoryData);
          // Separate cash and bank accounts
          const allCashAccounts = cashRes.data;
          setCashAccounts(allCashAccounts.filter(a => a.code.startsWith('5'))); // All cash/bank accounts
          setBankAccounts(allCashAccounts.filter(a => a.code.startsWith('5'))); // All cash/bank accounts
          setSalesAccounts(salesRes.data);
          setCustomerAccounts(customersRes.data);
          setDailySummary(summaryRes.data);
          
          // Set defaults based on specific account codes
          // Cash payment = 5311, Card/Bank = 5111, Sales = 7011
          if (allCashAccounts.length > 0) {
            const cashAcc = allCashAccounts.find(a => a.code === '5311') || allCashAccounts.find(a => a.code.startsWith('53')) || allCashAccounts[0];
            const bankAcc = allCashAccounts.find(a => a.code === '5111') || allCashAccounts.find(a => a.code.startsWith('51')) || allCashAccounts[0];
            setSelectedCashAccount(cashAcc?.id || allCashAccounts[0].id);
            setSelectedBankAccount(bankAcc?.id || allCashAccounts[0].id);
          }
          // Set default Sales account - prefer 7011
          if (salesRes.data.length > 0) {
            const salesAcc = salesRes.data.find(a => a.code === '7011') || salesRes.data.find(a => a.code.startsWith('701')) || salesRes.data[0];
            setCreditAccountId(salesAcc?.id || salesRes.data[0].id);
          }
        } else {
          // Load from IndexedDB when offline
          console.log('[POS] Offline mode - loading from cache');
          
          const cachedInventory = await db.inventoryItems.where('organization_id').equals(currentOrg.id).toArray();
          const cachedCustomers = await db.customers.where('organization_id').equals(currentOrg.id).toArray();
          const cachedAccounts = await db.chartOfAccounts.where('organization_id').equals(currentOrg.id).toArray();
          
          setInventoryItems(cachedInventory);
          setCustomerAccounts(cachedCustomers);
          
          const allCashAccounts = cachedAccounts.filter(a => a.code?.startsWith('5'));
          setCashAccounts(allCashAccounts);
          setBankAccounts(allCashAccounts);
          setSalesAccounts(cachedAccounts.filter(a => a.code?.startsWith('7')));
          
          // Set defaults based on specific account codes
          if (allCashAccounts.length > 0) {
            const cashAcc = allCashAccounts.find(a => a.code === '5311') || allCashAccounts.find(a => a.code?.startsWith('53')) || allCashAccounts[0];
            const bankAcc = allCashAccounts.find(a => a.code === '5111') || allCashAccounts.find(a => a.code?.startsWith('51')) || allCashAccounts[0];
            setSelectedCashAccount(cashAcc?.id || allCashAccounts[0]?.id);
            setSelectedBankAccount(bankAcc?.id || allCashAccounts[0]?.id);
          }
          
          // Set default Sales account - prefer 7011
          const salesAccountsList = cachedAccounts.filter(a => a.code?.startsWith('7'));
          if (salesAccountsList.length > 0) {
            const salesAcc = salesAccountsList.find(a => a.code === '7011') || salesAccountsList.find(a => a.code?.startsWith('701')) || salesAccountsList[0];
            setCreditAccountId(salesAcc?.id || salesAccountsList[0].id);
          }
        }
        
        // Get exchange rate from org settings
        if (currentOrg.base_exchange_rate) setLbpRate(currentOrg.base_exchange_rate);
        
        // Load receipt settings
        if (isOnline) {
          try {
            const rcptRes = await axios.get(`${API}/receipt-settings?organization_id=${currentOrg.id}`);
            setReceiptSettings(rcptRes.data);
          } catch { /* use defaults */ }
        }
        
        // Get tax rate from org settings
        if (currentOrg.tax_percent !== undefined && currentOrg.tax_percent !== null) {
          setTaxPercent(currentOrg.tax_percent);
        }
        
      } catch (error) {
        console.error('Error loading data:', error);
        
        // Fallback to cached data on error
        try {
          const cachedInventory = await db.inventoryItems.where('organization_id').equals(currentOrg.id).toArray();
          const cachedCustomers = await db.customers.where('organization_id').equals(currentOrg.id).toArray();
          
          if (cachedInventory.length > 0) {
            setInventoryItems(cachedInventory);
            console.log('[POS] Loaded inventory from cache');
          }
          if (cachedCustomers.length > 0) {
            setCustomerAccounts(cachedCustomers);
            console.log('[POS] Loaded customers from cache');
          }
        } catch (cacheError) {
          console.error('[POS] Cache fallback failed:', cacheError);
        }
      }
      setLoading(false);
    };
    
    loadData();
  }, [currentOrg, isOnline]);

  // Handle view parameter from URL (for viewing transaction from inventory ledger)
  useEffect(() => {
    const viewId = searchParams.get('view');
    if (viewId && transactions.length > 0) {
      const transactionToView = transactions.find(t => t.id === viewId);
      if (transactionToView) {
        setShowReceipt(transactionToView);
        // Clear the view parameter from URL
        searchParams.delete('view');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, transactions, setSearchParams]);

  // Fetch transactions when component mounts to support view parameter
  useEffect(() => {
    const viewId = searchParams.get('view');
    if (viewId && currentOrg) {
      fetchTransactions();
    }
  }, [currentOrg, searchParams]);

  const refreshData = async () => {
    if (!currentOrg) return;
    try {
      const summaryRes = await axios.get(`${API}/pos/daily-summary?organization_id=${currentOrg.id}`);
      setDailySummary(summaryRes.data);
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await axios.get(`${API}/pos/transactions?organization_id=${currentOrg.id}&limit=50`);
      setTransactions(res.data);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const fetchCustomerHistory = async (customerId) => {
    if (!customerId) return;
    try {
      const res = await axios.get(`${API}/pos/customer-history?organization_id=${currentOrg.id}&customer_id=${customerId}`);
      setCustomerHistory(res.data);
    } catch (error) {
      console.error('Error fetching customer history:', error);
      setCustomerHistory([]);
    }
  };

  // Delete POS transaction and its voucher
  const handleDeleteTransaction = async (transaction) => {
    try {
      setProcessing(true);
      await axios.delete(`${API}/pos/invoices/${transaction.id}?restore_inventory=true`);
      toast.success(`Transaction ${transaction.receipt_number} permanently deleted`);
      setDeleteConfirm(null);
      fetchTransactions();
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to delete transaction');
    } finally {
      setProcessing(false);
    }
  };

  const handleVoidTransaction = async () => {
    if (!voidConfirm) return;
    if (!voidReason.trim()) {
      toast.error('Please enter a reason for voiding');
      return;
    }
    try {
      setProcessing(true);
      await axios.put(
        `${API}/pos/invoices/${voidConfirm.id}/void?reason=${encodeURIComponent(voidReason.trim())}`
      );
      toast.success(`Transaction ${voidConfirm.receipt_number} voided`);
      setVoidConfirm(null);
      setVoidReason('');
      fetchTransactions();
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to void transaction');
    } finally {
      setProcessing(false);
    }
  };

  // Fetch batches for an inventory item
  const fetchItemBatches = async (itemId) => {
    if (!itemId || itemBatches[itemId]) return itemBatches[itemId];
    try {
      const res = await axios.get(`${API}/inventory/${itemId}/batches`);
      const availableBatches = (res.data || [])
        .filter(b => b.quantity > 0)
        .sort((a, b) => (a.expiry_date || '9999-12-31').localeCompare(b.expiry_date || '9999-12-31'));
      setItemBatches(prev => ({ ...prev, [itemId]: availableBatches }));
      return availableBatches;
    } catch (error) {
      console.error('Error fetching batches:', error);
      setItemBatches(prev => ({ ...prev, [itemId]: [] }));
      return [];
    }
  };

  // Update cart item batch
  const updateCartBatch = (index, batchId) => {
    setCart(prev => {
      const newCart = [...prev];
      newCart[index] = { ...newCart[index], batch_id: batchId };
      return newCart;
    });
    setBatchSelectorOpen(null);
  };

  // Add item to cart
  const addToCart = (item) => {
    // Fetch batches if expiry tracking is enabled
    if (currentOrg?.enable_expiry_tracking) {
      fetchItemBatches(item.id);
    }
    
    setCart(prev => {
      const existing = prev.find(c => c.inventory_item_id === item.id);
      if (existing) {
        return prev.map(c => 
          c.inventory_item_id === item.id 
            ? { 
                ...c, 
                quantity: c.quantity + 1,
                line_total: (c.quantity + 1) * c.unit_price * (1 - c.discount_percent / 100),
                line_total_usd: ((c.quantity + 1) * c.unit_price * (1 - c.discount_percent / 100)) / (c.exchange_rate || 1)
              }
            : c
        );
      }
      
      const lineTotal = item.price;
      const exchangeRate = item.currency === 'LBP' ? lbpRate : 1;
      const lineTotalUsd = item.currency === 'USD' ? lineTotal : lineTotal / exchangeRate;
      
      return [...prev, {
        inventory_item_id: item.id,
        item_name: item.name,
        item_name_ar: item.name_ar,
        barcode: item.barcode,
        quantity: 1,
        unit: item.unit || 'piece',
        unit_price: item.price,
        currency: item.currency || 'USD',
        exchange_rate: exchangeRate,
        discount_percent: 0,
        line_total: lineTotal,
        line_total_usd: lineTotalUsd,
        is_taxable: item.is_taxable !== false,  // Include taxable flag
        batch_id: ''  // Auto (FEFO) by default
      }];
    });
  };

  // Update cart item quantity
  const updateQuantity = (index, delta) => {
    setCart(prev => {
      const newCart = [...prev];
      const item = newCart[index];
      const newQty = Math.max(1, item.quantity + delta);
      const lineTotal = newQty * item.unit_price * (1 - item.discount_percent / 100);
      const lineTotalUsd = item.currency === 'USD' ? lineTotal : lineTotal / (item.exchange_rate || 1);
      
      newCart[index] = { ...item, quantity: newQty, line_total: lineTotal, line_total_usd: lineTotalUsd };
      return newCart;
    });
  };

  // Update cart item discount
  const updateItemDiscount = (index, discount) => {
    setCart(prev => {
      const newCart = [...prev];
      const item = newCart[index];
      const discPct = Math.min(100, Math.max(0, parseFloat(discount) || 0));
      const lineTotal = item.quantity * item.unit_price * (1 - discPct / 100);
      const lineTotalUsd = item.currency === 'USD' ? lineTotal : lineTotal / (item.exchange_rate || 1);
      
      newCart[index] = { ...item, discount_percent: discPct, line_total: lineTotal, line_total_usd: lineTotalUsd };
      return newCart;
    });
  };

  // Remove from cart
  const removeFromCart = (index) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  // Clear cart
  const clearCart = () => {
    setCart([]);
    setDiscountPercent(0);
    setSelectedCustomerId('');
    setNotes('');
    setPaymentAmount('');
    setPaymentMethod('cash');
    setPaymentAdjustment(0);
  };

  // Handle barcode input
  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    
    const item = inventoryItems.find(i => 
      i.barcode?.toLowerCase() === barcodeInput.trim().toLowerCase()
    );
    
    if (item) {
      addToCart(item);
      setBarcodeInput('');
    } else {
      alert('Item not found');
    }
  };

  // Get debit account based on payment method
  const getDebitAccountId = () => {
    switch (paymentMethod) {
      case 'cash':
        return selectedCashAccount;
      case 'card':
        return selectedBankAccount;
      case 'customer':
        return selectedCustomerId;
      default:
        return selectedCashAccount;
    }
  };

  // Process payment
  const processPayment = async () => {
    if (cart.length === 0) return;
    
    const debitAccountId = getDebitAccountId();
    if (!debitAccountId || !creditAccountId) {
      alert('Please configure payment and sales accounts');
      return;
    }
    
    if (paymentMethod === 'customer' && !selectedCustomerId) {
      alert('Please select a customer for credit sale');
      return;
    }
    
    setProcessing(true);
    try {
      const selectedCustomer = customerAccounts.find(c => c.id === selectedCustomerId);
      const transactionId = 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const receiptNumber = 'POS-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-5);
      
      const payload = {
        organization_id: currentOrg.id,
        lines: cart,
        subtotal_usd: totals.subtotalUsd,
        discount_percent: discountPercent,
        discount_amount: totals.discountAmount,
        tax_percent: taxPercent,
        tax_amount: totals.taxAmount,
        total_usd: totals.totalUsd,
        total_lbp: totals.totalLbp,
        payment_method: paymentMethod,
        payment_amount: paymentMethod === 'customer' ? totals.totalUsd : (parseFloat(paymentAmount) || totals.totalUsd),
        payment_currency: paymentMethod === 'customer' ? 'USD' : paymentCurrency,
        payment_exchange_rate: paymentExchangeRate,
        change_amount: changeAmount,
        payment_adjustment: paymentAdjustment, // Discount (+) or Premium (-) adjustment
        customer_id: selectedCustomerId || null,
        customer_name: selectedCustomer?.name || (paymentMethod === 'customer' ? null : 'Walk-in'),
        customer_code: selectedCustomer?.code || null,
        notes: notes || null,
        debit_account_id: debitAccountId,
        credit_account_id: creditAccountId,
        lbp_rate: lbpRate
      };
      
      let transactionData;
      
      if (isOnline) {
        // Online: Send to server
        const res = await axios.post(`${API}/pos/transactions`, payload);
        transactionData = res.data;
        
        // Cache the transaction
        try {
          await db.posTransactions.put({ ...transactionData, organization_id: currentOrg.id });
        } catch (e) {
          console.warn('[POS] Error caching transaction:', e);
        }
      } else {
        // Offline: Save locally and queue for sync
        transactionData = {
          id: transactionId,
          receipt_number: receiptNumber,
          ...payload,
          date: new Date().toISOString(),
          time: new Date().toLocaleTimeString('en-US', { hour12: false }),
          status: 'pending_sync',
          created_offline: true,
          voucher_number: 'PENDING-SYNC'
        };
        
        // Save to IndexedDB
        await db.posTransactions.put(transactionData);
        
        // Update local inventory quantities
        for (const item of cart) {
          if (item.inventory_item_id) {
            const invItem = await db.inventoryItems.get(item.inventory_item_id);
            if (invItem) {
              invItem.on_hand_qty = (invItem.on_hand_qty || 0) - item.quantity;
              await db.inventoryItems.put(invItem);
            }
          }
        }
        
        // Add to sync queue
        await addToSyncQueue(OPERATION_TYPES.POS_TRANSACTION, ACTION_TYPES.CREATE, transactionId, payload);
        await updatePendingCount();
        
        // Update local inventory state
        setInventoryItems(await db.inventoryItems.where('organization_id').equals(currentOrg.id).toArray());
      }
      
      setShowPayment(false);
      setShowReceipt(transactionData);
      clearCart();
      
      // Refresh data
      refreshData();
      
    } catch (error) {
      console.error('Error processing payment:', error);
      alert(error.response?.data?.detail || 'Error processing payment');
    }
    setProcessing(false);
  };

  // Print thermal receipt (POS printer format)
  const printThermalReceipt = (transaction) => {
    const rs = receiptSettings || {};
    const pw = rs.printer_width || '80mm';
    const fs = rs.font_size || '12px';
    const storeName = rs.store_name || currentOrg?.name || 'KAIROS POS';
    const storeNameAr = rs.store_name_ar || '';
    const addr1 = rs.address_line1 || currentOrg?.address || '';
    const addr2 = rs.address_line2 || '';
    const phone = rs.phone || currentOrg?.phone || '';
    const vatNum = rs.vat_number || '';
    const footerMsg = rs.footer_message || 'Thank you for your business!';
    const footerMsgAr = rs.footer_message_ar || '';
    const showLogo = rs.show_logo !== false && rs.logo_url;
    const showVat = rs.show_vat_number !== false && vatNum;
    const showBarcode = rs.show_barcode !== false;

    const receiptHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt - ${transaction.receipt_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Courier New', monospace; 
            font-size: ${fs}; 
            width: ${pw}; 
            padding: 5mm;
            background: white;
            color: black;
          }
          .header { text-align: center; margin-bottom: 3mm; }
          .header h1 { font-size: 1.3em; font-weight: bold; margin-bottom: 1mm; }
          .header h2 { font-size: 1.1em; font-weight: bold; margin-bottom: 1mm; }
          .header p { font-size: 0.85em; }
          .logo { text-align: center; margin-bottom: 2mm; }
          .logo img { max-height: 50px; max-width: 80%; }
          .divider { border-top: 1px dashed #000; margin: 3mm 0; }
          .divider-double { border-top: 2px solid #000; margin: 3mm 0; }
          .info-row { display: flex; justify-content: space-between; font-size: 0.9em; margin: 1mm 0; }
          .item { margin: 2mm 0; }
          .item-name { font-size: 0.9em; }
          .item-details { display: flex; justify-content: space-between; font-size: 0.85em; color: #333; }
          .total-section { margin-top: 2mm; }
          .total-row { display: flex; justify-content: space-between; font-size: 0.9em; margin: 1mm 0; }
          .grand-total { font-size: 1.2em; font-weight: bold; }
          .payment-info { background: #f0f0f0; padding: 2mm; margin: 2mm 0; }
          .footer { text-align: center; margin-top: 3mm; font-size: 0.85em; }
          .barcode-area { text-align: center; padding: 2mm; border: 1px dashed #999; margin: 2mm 0; font-size: 0.8em; }
        </style>
      </head>
      <body>
        ${showLogo ? `<div class="logo"><img src="${rs.logo_url}" alt="Logo" /></div>` : ''}
        
        <div class="header">
          <h1>${storeName}</h1>
          ${storeNameAr ? `<h2 dir="rtl">${storeNameAr}</h2>` : ''}
          ${addr1 ? `<p>${addr1}</p>` : ''}
          ${addr2 ? `<p>${addr2}</p>` : ''}
          ${phone ? `<p>Tel: ${phone}</p>` : ''}
          ${showVat ? `<p>VAT: ${vatNum}</p>` : ''}
        </div>
        
        <div class="divider-double"></div>
        
        <div class="info-row">
          <span>Receipt #:</span>
          <span>${transaction.receipt_number}</span>
        </div>
        <div class="info-row">
          <span>Date:</span>
          <span>${(() => { const d = new Date(transaction.date); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; })()} ${transaction.time}</span>
        </div>
        <div class="info-row">
          <span>Cashier:</span>
          <span>${transaction.cashier_name || 'Admin'}</span>
        </div>
        ${transaction.customer_name ? `
        <div class="info-row">
          <span>Customer:</span>
          <span>${transaction.customer_code ? `[${transaction.customer_code}] ` : ''}${transaction.customer_name}</span>
        </div>
        ` : ''}
        
        <div class="divider"></div>
        
        ${transaction.lines.map(line => `
          <div class="item">
            <div class="item-name">${line.item_name}</div>
            <div class="item-details">
              <span>${line.quantity} x ${line.currency} ${parseFloat(line.unit_price).toFixed(3)}${line.discount_percent > 0 ? ` (-${line.discount_percent}%)` : ''}</span>
              <span>$${(line.line_total_usd || line.line_total).toFixed(3)}</span>
            </div>
          </div>
        `).join('')}
        
        <div class="divider"></div>
        
        <div class="total-section">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>$${transaction.subtotal_usd.toFixed(3)}</span>
          </div>
          ${transaction.discount_amount > 0 ? `
          <div class="total-row">
            <span>Discount (${transaction.discount_percent}%):</span>
            <span>-$${transaction.discount_amount.toFixed(3)}</span>
          </div>
          ` : ''}
          ${transaction.tax_amount > 0 ? `
          <div class="total-row">
            <span>VAT (${transaction.tax_percent}%):</span>
            <span>+$${transaction.tax_amount.toFixed(3)}</span>
          </div>
          ` : ''}
        </div>
        
        <div class="divider-double"></div>
        
        <div class="total-row grand-total">
          <span>TOTAL USD:</span>
          <span>$${transaction.total_usd.toFixed(3)}</span>
        </div>
        ${transaction.total_lbp ? `
        <div class="total-row">
          <span>TOTAL LBP:</span>
          <span>L.L ${Math.round(transaction.total_lbp).toLocaleString()}</span>
        </div>
        ` : ''}
        
        <div class="divider"></div>
        
        <div class="payment-info">
          <div class="total-row">
            <span>Payment (${transaction.payment_method.toUpperCase()}):</span>
            <span>${transaction.payment_currency} ${parseFloat(transaction.payment_amount).toFixed(3)}</span>
          </div>
          ${transaction.change_amount > 0 ? `
          <div class="total-row">
            <span>Change:</span>
            <span>$${transaction.change_amount.toFixed(3)}</span>
          </div>
          ` : ''}
        </div>
        
        <div class="divider"></div>
        
        <div class="footer">
          <p>Voucher: ${transaction.voucher_number || 'N/A'}</p>
          ${footerMsg ? `<p style="margin-top: 2mm;">${footerMsg}</p>` : ''}
          ${footerMsgAr ? `<p dir="rtl" style="margin-top: 1mm;">${footerMsgAr}</p>` : ''}
        </div>
        
        ${showBarcode ? `
        <div class="barcode-area">
          [Barcode: ${transaction.receipt_number}]
        </div>
        ` : ''}
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank', 'width=320,height=600');
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  // Format amount based on display currency
  const formatAmount = (usdAmount) => {
    if (displayCurrency === 'LBP') {
      return `L.L ${Math.round(usdAmount * lbpRate).toLocaleString()}`;
    }
    return `$${formatUSD(usdAmount)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Check if quick items panel should be shown
  const showQuickItems = currentOrg?.pos_quick_items_enabled !== false;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col lg:flex-row gap-4 p-4">
      {/* Offline Banner */}
      <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-2">
        <OfflineBanner />
      </div>
      
      {/* Left Panel - Products (only if quick items enabled) */}
      {showQuickItems && (
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Search & Barcode */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Barcode Input */}
              <form onSubmit={handleBarcodeSubmit} className="flex-1">
                <div className="relative">
                  <BarChart3 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    ref={barcodeInputRef}
                    placeholder="Scan barcode..."
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    className="pl-10 h-12 text-lg font-mono"
                    autoFocus
                  />
                </div>
              </form>
              
              {/* Search Dropdown */}
              <div className="flex-1">
                <POSItemSelector items={inventoryItems} onSelect={addToCart} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Items Grid */}
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="py-3 px-4 border-b flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4" />
              Quick Items
            </CardTitle>
            {/* Display Currency Toggle */}
            <div className="flex items-center gap-2">
              <Button 
                variant={displayCurrency === 'USD' ? 'default' : 'outline'} 
                size="sm" 
                onClick={() => setDisplayCurrency('USD')}
                className="h-7 px-2"
              >
                USD
              </Button>
              <Button 
                variant={displayCurrency === 'LBP' ? 'default' : 'outline'} 
                size="sm" 
                onClick={() => setDisplayCurrency('LBP')}
                className="h-7 px-2"
              >
                LBP
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 overflow-y-auto h-[calc(100%-3rem)]">
            {inventoryItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Package className="w-12 h-12 mb-2 opacity-50" />
                <p>No inventory items found</p>
                <p className="text-sm">Add items from the Inventory page</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {/* Show items marked as POS items first, then configured quick items, then first 20 */}
                {(() => {
                  const posItems = inventoryItems.filter(item => item.is_pos_item);
                  const configuredItems = currentOrg?.pos_quick_items?.length > 0 
                    ? inventoryItems.filter(item => currentOrg.pos_quick_items.includes(item.id) && !item.is_pos_item)
                    : [];
                  const quickItems = posItems.length > 0 || configuredItems.length > 0
                    ? [...posItems, ...configuredItems]
                    : inventoryItems.slice(0, 20);
                  return quickItems.length > 0 ? quickItems.map(item => (
                    <QuickItemButton key={item.id} item={item} onClick={addToCart} showImage={true} />
                  )) : (
                    <div className="col-span-full text-center text-muted-foreground py-8">
                      <p>No quick items configured</p>
                      <p className="text-sm">Mark items as &quot;POS Quick Item&quot; in Inventory, or add items in Organization Settings</p>
                    </div>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {/* Right Panel - Cart (full width when quick items disabled) */}
      {showQuickItems ? (
        /* === STANDARD SIDEBAR CART VIEW === */
        <div className="flex flex-col gap-4 w-full lg:w-[420px] xl:w-[480px]">
          {/* Daily Summary */}
          <Card className="bg-gradient-to-r from-green-500/10 to-cyan-500/10">
            <CardContent className="p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Today&apos;s Sales
                </span>
                <span className="font-bold text-green-400">
                  ${formatUSD(dailySummary?.total_sales || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                <span>{dailySummary?.total_transactions || 0} transactions</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 text-xs"
                  onClick={() => { setShowHistory(true); fetchTransactions(); }}
                >
                  <History className="w-3 h-3 mr-1" />
                  History
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 text-xs"
                  onClick={() => setShowReceiptSettings(true)}
                  data-testid="receipt-settings-btn"
                >
                  <Settings className="w-3 h-3 mr-1" />
                  Receipt
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Customer Selection */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1">
                  <CustomerSelector 
                    customers={customerAccounts} 
                    value={selectedCustomerId}
                    onChange={(id) => {
                      setSelectedCustomerId(id);
                      if (id) {
                        setPaymentMethod('customer');
                        fetchCustomerHistory(id);
                      } else {
                        setPaymentMethod('cash');
                      }
                    }}
                  />
                </div>
                {selectedCustomerId && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => { setShowCustomerHistory(true); fetchCustomerHistory(selectedCustomerId); }}
                  >
                    <History className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Cart Items - Sidebar View */}
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardHeader className="py-3 px-4 border-b flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                Cart ({cart.length} items)
              </CardTitle>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-400 h-7">
                  <Trash2 className="w-3 h-3 mr-1" />
                  Clear
                </Button>
              )}
            </CardHeader>
            
            <CardContent className="flex-1 overflow-y-auto p-0">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <ShoppingCart className="w-12 h-12 mb-2 opacity-20" />
                  <p>Cart is empty</p>
                  <p className="text-xs">Scan a barcode or search for items</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {cart.map((item, idx) => (
                    <div key={idx} className="p-3 hover:bg-muted/30">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.item_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.currency} {formatUSD(item.unit_price)} × {item.quantity}
                            {item.discount_percent > 0 && (
                              <span className="text-red-400 ml-1">(-{item.discount_percent}%)</span>
                            )}
                          </div>
                          {currentOrg?.enable_expiry_tracking && itemBatches[item.inventory_item_id]?.length > 0 && (
                            <div className="mt-1">
                              <button
                                onClick={() => setBatchSelectorOpen(batchSelectorOpen === idx ? null : idx)}
                                className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors"
                              >
                                {item.batch_id 
                                  ? `Batch: ${itemBatches[item.inventory_item_id]?.find(b => b.id === item.batch_id)?.batch_number || 'Selected'}`
                                  : 'Auto (FEFO)'
                                }
                              </button>
                              {batchSelectorOpen === idx && (
                                <div className="mt-1 p-2 bg-background border rounded-lg shadow-lg">
                                  <div className="text-[10px] text-muted-foreground mb-1">Select Batch:</div>
                                  <div className="space-y-1 max-h-32 overflow-y-auto">
                                    <button
                                      onClick={() => updateCartBatch(idx, '')}
                                      className={`w-full text-left text-xs px-2 py-1 rounded ${!item.batch_id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                                    >
                                      Auto (FEFO)
                                    </button>
                                    {itemBatches[item.inventory_item_id]?.map(batch => (
                                      <button
                                        key={batch.id}
                                        onClick={() => updateCartBatch(idx, batch.id)}
                                        className={`w-full text-left text-xs px-2 py-1 rounded ${item.batch_id === batch.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                                      >
                                        <div>{batch.batch_number}</div>
                                        <div className="text-[10px] opacity-70">
                                          Qty: {batch.quantity} | Exp: {batch.expiry_date || 'N/A'}
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-green-400">
                            {formatAmount(item.line_total_usd)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center bg-muted rounded">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 w-7 p-0"
                            onClick={() => updateQuantity(idx, -1)}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="w-8 text-center font-mono">{item.quantity}</span>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 w-7 p-0"
                            onClick={() => updateQuantity(idx, 1)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-1">
                          <Percent className="w-3 h-3 text-muted-foreground" />
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={item.discount_percent}
                            onChange={(e) => updateItemDiscount(idx, e.target.value)}
                            className="h-7 w-14 text-xs text-center"
                          />
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0 text-red-400 ml-auto"
                          onClick={() => removeFromCart(idx)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>

            {/* Totals */}
            <div className="border-t p-4 bg-muted/30 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span className="font-mono">{formatAmount(totals.subtotalUsd)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Discount:</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Math.min(100, parseFloat(e.target.value) || 0))}
                  className="h-7 w-16 text-xs text-center"
                />
                <span className="text-sm">%</span>
                <span className="ml-auto font-mono text-red-400">-{formatAmount(totals.discountAmount)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Tax:</span>
                <Input
                  type="number"
                  min="0"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
                  className="h-7 w-16 text-xs text-center"
                />
                <span className="text-sm">%</span>
                <span className="ml-auto font-mono text-cyan-400">+{formatAmount(totals.taxAmount)}</span>
              </div>
              <div className="border-t pt-2 space-y-1">
                <div className="flex justify-between text-xl font-bold">
                  <span>TOTAL USD:</span>
                  <span className="font-mono text-green-400">${formatUSD(totals.totalUsd)}</span>
                </div>
                <div className="flex justify-between text-lg">
                  <span>TOTAL LBP:</span>
                  <span className="font-mono text-cyan-400">L.L {Math.round(totals.totalLbp).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Payment Button */}
            <div className="p-4 border-t">
              <Button 
                className="w-full h-14 text-lg font-bold"
                disabled={cart.length === 0}
                onClick={() => {
                  setPaymentAmount(totals.totalUsd.toFixed(3));
                  setShowPayment(true);
                }}
              >
                <CreditCard className="w-5 h-5 mr-2" />
                Pay ${formatUSD(totals.totalUsd)}
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        /* === FULL-SCREEN POS VIEW (No Quick Items) === */
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          {/* Top Bar: Search + Customer + Summary */}
          <div className="flex flex-wrap items-stretch gap-3">
            {/* Barcode Input */}
            <form onSubmit={handleBarcodeSubmit} className="w-64">
              <div className="relative">
                <BarChart3 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  ref={barcodeInputRef}
                  placeholder="Scan barcode..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  className="pl-9 h-10 font-mono"
                  autoFocus
                />
              </div>
            </form>
            
            {/* Search Dropdown */}
            <div className="w-72">
              <POSItemSelector items={inventoryItems} onSelect={addToCart} />
            </div>
            
            {/* Customer Selector */}
            <div className="w-64 flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <CustomerSelector 
                customers={customerAccounts} 
                value={selectedCustomerId}
                onChange={(id) => {
                  setSelectedCustomerId(id);
                  if (id) {
                    setPaymentMethod('customer');
                    fetchCustomerHistory(id);
                  } else {
                    setPaymentMethod('cash');
                  }
                }}
              />
            </div>
            
            {/* Currency Toggle */}
            <div className="flex items-center gap-1 ml-auto">
              <Button 
                variant={displayCurrency === 'USD' ? 'default' : 'outline'} 
                size="sm" 
                onClick={() => setDisplayCurrency('USD')}
                className="h-10 px-3"
              >
                USD
              </Button>
              <Button 
                variant={displayCurrency === 'LBP' ? 'default' : 'outline'} 
                size="sm" 
                onClick={() => setDisplayCurrency('LBP')}
                className="h-10 px-3"
              >
                LBP
              </Button>
            </div>
            
            {/* Daily Summary Compact */}
            <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-gradient-to-r from-green-500/10 to-cyan-500/10 border">
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Today</div>
                <div className="font-bold text-green-400">${formatUSD(dailySummary?.total_sales || 0)}</div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 px-2"
                onClick={() => { setShowHistory(true); fetchTransactions(); }}
              >
                <History className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Main Content: Cart Table + Totals Panel */}
          <div className="flex-1 flex gap-3 min-h-0">
            {/* Cart Table - Takes most of the space */}
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="py-2 px-4 border-b flex-row items-center justify-between shrink-0">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  Cart ({cart.length} items)
                </CardTitle>
                {cart.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-400 h-7 text-xs">
                    <Trash2 className="w-3 h-3 mr-1" />
                    Clear All
                  </Button>
                )}
              </CardHeader>
              
              <div className="flex-1 overflow-auto">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                    <ShoppingCart className="w-16 h-16 mb-3 opacity-20" />
                    <p className="text-lg">Cart is empty</p>
                    <p className="text-sm">Scan a barcode or search for items to begin</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-2 px-3 font-medium w-8">#</th>
                        <th className="py-2 px-3 font-medium">Item</th>
                        <th className="py-2 px-3 font-medium text-center w-24">Price</th>
                        <th className="py-2 px-3 font-medium text-center w-32">Qty</th>
                        <th className="py-2 px-3 font-medium text-center w-20">Disc%</th>
                        <th className="py-2 px-3 font-medium text-right w-28">Total</th>
                        <th className="py-2 px-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {cart.map((item, idx) => (
                        <tr key={idx} className="hover:bg-muted/30 group">
                          <td className="py-2 px-3 text-muted-foreground text-xs">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <div className="font-medium truncate max-w-[280px]">{item.item_name}</div>
                            {item.barcode && <div className="text-xs text-cyan-400 font-mono">{item.barcode}</div>}
                            {currentOrg?.enable_expiry_tracking && itemBatches[item.inventory_item_id]?.length > 0 && (
                              <button
                                onClick={() => setBatchSelectorOpen(batchSelectorOpen === idx ? null : idx)}
                                className="text-[10px] px-1.5 py-0.5 mt-0.5 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30"
                              >
                                {item.batch_id ? `Batch: ${itemBatches[item.inventory_item_id]?.find(b => b.id === item.batch_id)?.batch_number || 'Selected'}` : 'Auto (FEFO)'}
                              </button>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-xs">
                            {item.currency} {formatUSD(item.unit_price)}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex items-center justify-center gap-1">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 w-7 p-0"
                                onClick={() => updateQuantity(idx, -1)}
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="w-10 text-center font-mono font-medium">{item.quantity}</span>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 w-7 p-0"
                                onClick={() => updateQuantity(idx, 1)}
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={item.discount_percent}
                              onChange={(e) => updateItemDiscount(idx, e.target.value)}
                              className="h-7 w-16 text-xs text-center mx-auto"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className="font-mono font-bold text-green-400">
                              {formatAmount(item.line_total_usd)}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 w-7 p-0 text-red-400 opacity-50 group-hover:opacity-100"
                              onClick={() => removeFromCart(idx)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>

            {/* Totals & Payment Panel - Fixed width on right */}
            <Card className="w-72 flex flex-col shrink-0">
              <CardHeader className="py-2 px-4 border-b shrink-0">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Order Summary
                </CardTitle>
              </CardHeader>
              
              <CardContent className="flex-1 p-4 space-y-3 overflow-auto">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono">{formatAmount(totals.subtotalUsd)}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Discount</span>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(Math.min(100, parseFloat(e.target.value) || 0))}
                    className="h-7 w-14 text-xs text-center ml-auto"
                  />
                  <span className="text-xs">%</span>
                </div>
                {totals.discountAmount > 0 && (
                  <div className="text-right text-sm font-mono text-red-400">
                    -{formatAmount(totals.discountAmount)}
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Tax</span>
                  <Input
                    type="number"
                    min="0"
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
                    className="h-7 w-14 text-xs text-center ml-auto"
                  />
                  <span className="text-xs">%</span>
                </div>
                {totals.taxAmount > 0 && (
                  <div className="text-right text-sm font-mono text-cyan-400">
                    +{formatAmount(totals.taxAmount)}
                  </div>
                )}
                
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Total USD</span>
                    <span className="text-2xl font-bold font-mono text-green-400">
                      ${formatUSD(totals.totalUsd)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total LBP</span>
                    <span className="font-mono text-cyan-400">
                      L.L {Math.round(totals.totalLbp).toLocaleString()}
                    </span>
                  </div>
                </div>
              </CardContent>

              {/* Payment Button */}
              <div className="p-4 border-t mt-auto shrink-0">
                <Button 
                  className="w-full h-12 text-base font-bold"
                  disabled={cart.length === 0}
                  onClick={() => {
                    setPaymentAmount(totals.totalUsd.toFixed(3));
                    setShowPayment(true);
                  }}
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  Pay Now
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Payment
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Total Display */}
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground">Amount Due</div>
              <div className="text-3xl font-bold text-green-400 font-mono">
                ${formatUSD(totals.totalUsd)}
              </div>
              <div className="text-lg text-cyan-400 font-mono">
                L.L {Math.round(totals.totalLbp).toLocaleString()}
              </div>
            </div>

            {/* Payment Method Selection */}
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button 
                  type="button"
                  variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                  onClick={() => setPaymentMethod('cash')}
                  className="h-14 flex-col gap-1"
                >
                  <Banknote className="w-5 h-5" />
                  <span className="text-xs">Cash</span>
                </Button>
                <Button 
                  type="button"
                  variant={paymentMethod === 'card' ? 'default' : 'outline'}
                  onClick={() => setPaymentMethod('card')}
                  className="h-14 flex-col gap-1"
                >
                  <CreditCard className="w-5 h-5" />
                  <span className="text-xs">Card/Bank</span>
                </Button>
                <Button 
                  type="button"
                  variant={paymentMethod === 'customer' ? 'default' : 'outline'}
                  onClick={() => setPaymentMethod('customer')}
                  disabled={!selectedCustomerId}
                  className="h-14 flex-col gap-1"
                >
                  <UserCheck className="w-5 h-5" />
                  <span className="text-xs">On Account</span>
                </Button>
              </div>
            </div>

            {/* Customer Credit Info */}
            {paymentMethod === 'customer' && selectedCustomerId && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <UserCheck className="w-4 h-4 text-blue-400" />
                  <span>Charge to: </span>
                  <span className="font-bold">
                    {customerAccounts.find(c => c.id === selectedCustomerId)?.name}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Current Balance: ${formatUSD(customerAccounts.find(c => c.id === selectedCustomerId)?.balance_usd || 0)}
                </div>
              </div>
            )}

            {/* Cash/Card Payment Details */}
            {paymentMethod !== 'customer' && (
              <>
                {/* Account Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">{paymentMethod === 'cash' ? 'Cash Account' : 'Bank Account'}</Label>
                    <Select 
                      value={paymentMethod === 'cash' ? selectedCashAccount : selectedBankAccount} 
                      onValueChange={(v) => paymentMethod === 'cash' ? setSelectedCashAccount(v) : setSelectedBankAccount(v)}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(paymentMethod === 'cash' ? cashAccounts : bankAccounts).map(a => (
                          <SelectItem key={a.id} value={a.id} className="text-xs">
                            {a.code} - {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Sales Account</Label>
                    <Select value={creditAccountId} onValueChange={setCreditAccountId}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {salesAccounts.map(a => (
                          <SelectItem key={a.id} value={a.id} className="text-xs">
                            {a.code} - {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Payment Currency & Amount */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Currency</Label>
                    <Select value={paymentCurrency} onValueChange={(v) => {
                      setPaymentCurrency(v);
                      setPaymentExchangeRate(v === 'LBP' ? lbpRate : 1);
                      // Convert amount
                      if (v === 'LBP') {
                        setPaymentAmount(Math.round(totals.totalUsd * lbpRate).toString());
                      } else {
                        setPaymentAmount(totals.totalUsd.toFixed(3));
                      }
                    }}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="LBP">LBP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {paymentCurrency === 'LBP' && (
                    <div className="space-y-2">
                      <Label className="text-xs">Rate</Label>
                      <Input
                        type="number"
                        value={paymentExchangeRate}
                        onChange={(e) => setPaymentExchangeRate(parseFloat(e.target.value) || lbpRate)}
                        className="h-9 text-xs"
                      />
                    </div>
                  )}
                  <div className={`space-y-2 ${paymentCurrency === 'LBP' ? '' : 'col-span-2'}`}>
                    <Label className="text-xs">Amount ({paymentCurrency})</Label>
                    <Input
                      type="number"
                      step={paymentCurrency === 'USD' ? '0.01' : '1000'}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="h-9 text-lg font-mono text-center"
                    />
                  </div>
                </div>

                {/* Quick Amount Buttons */}
                {paymentMethod === 'cash' && (
                  <div className="grid grid-cols-4 gap-2">
                    {paymentCurrency === 'USD' 
                      ? [10, 20, 50, 100].map(amt => (
                          <Button key={amt} type="button" variant="outline" onClick={() => setPaymentAmount(amt.toString())} className="h-9">
                            ${amt}
                          </Button>
                        ))
                      : [100000, 500000, 1000000, 2000000].map(amt => (
                          <Button key={amt} type="button" variant="outline" onClick={() => setPaymentAmount(amt.toString())} className="h-9 text-xs">
                            {(amt/1000)}K
                          </Button>
                        ))
                    }
                  </div>
                )}

                {/* Payment Adjustment - Discount/Premium based on amount paid */}
                {calculatedAdjustment !== 0 && paymentAdjustment === 0 && (
                  <div className={`p-3 rounded-lg text-center ${calculatedAdjustment > 0 ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-blue-500/10 border border-blue-500/30'}`}>
                    <div className="text-sm text-muted-foreground">
                      {calculatedAdjustment > 0 ? 'Customer pays less - Apply Discount?' : 'Customer pays more - Apply Premium?'}
                    </div>
                    <div className={`text-xl font-bold font-mono ${calculatedAdjustment > 0 ? 'text-orange-400' : 'text-blue-400'}`}>
                      {calculatedAdjustment > 0 ? '-' : '+'}${formatUSD(Math.abs(calculatedAdjustment))}
                    </div>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      className="mt-2"
                      onClick={() => setPaymentAdjustment(calculatedAdjustment)}
                    >
                      {calculatedAdjustment > 0 ? 'Apply as Discount' : 'Apply as Premium'}
                    </Button>
                  </div>
                )}

                {/* Applied Adjustment Display */}
                {paymentAdjustment !== 0 && (
                  <div className={`p-3 rounded-lg ${paymentAdjustment > 0 ? 'bg-green-500/10 border border-green-500/30' : 'bg-purple-500/10 border border-purple-500/30'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-muted-foreground">
                          {paymentAdjustment > 0 ? 'Discount Applied' : 'Premium Applied'}
                        </div>
                        <div className={`text-lg font-bold font-mono ${paymentAdjustment > 0 ? 'text-green-400' : 'text-purple-400'}`}>
                          {paymentAdjustment > 0 ? '-' : '+'}${formatUSD(Math.abs(paymentAdjustment))}
                        </div>
                      </div>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-400"
                        onClick={() => setPaymentAdjustment(0)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Final Amount: ${formatUSD(totals.totalUsd - paymentAdjustment)}
                    </div>
                  </div>
                )}

                {/* Change Display - Only when no adjustment and paid more */}
                {changeAmount > 0 && paymentAdjustment === 0 && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">Change Due</div>
                    <div className="text-xl font-bold text-yellow-400 font-mono">
                      ${formatUSD(changeAmount)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      L.L {Math.round(changeAmount * lbpRate).toLocaleString()}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPayment(false)}>
              Cancel
            </Button>
            <Button 
              onClick={processPayment}
              disabled={processing || (paymentMethod !== 'customer' && paymentAdjustment === 0 && ((parseFloat(paymentAmount) || 0) < (paymentCurrency === 'USD' ? totals.totalUsd : totals.totalLbp)))}
              className="min-w-[140px]"
            >
              {processing ? 'Processing...' : (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  Complete Sale
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={!!showReceipt} onOpenChange={() => setShowReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-400">
              <Check className="w-5 h-5" />
              Sale Complete!
            </DialogTitle>
          </DialogHeader>
          
          {showReceipt && (
            <div className="space-y-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="font-mono text-lg font-bold">{showReceipt.receipt_number}</div>
                <div className="text-2xl font-bold text-green-400 font-mono my-2">
                  ${formatUSD(showReceipt.total_usd)}
                </div>
                <div className="text-lg text-cyan-400 font-mono">
                  L.L {Math.round(showReceipt.total_lbp || showReceipt.total_usd * lbpRate).toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  {formatDate(showReceipt.date)} {showReceipt.time}
                </div>
              </div>

              {showReceipt.change_amount > 0 && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-center">
                  <div className="text-sm text-muted-foreground">Change Due</div>
                  <div className="text-xl font-bold text-yellow-400 font-mono">
                    ${formatUSD(showReceipt.change_amount)}
                  </div>
                </div>
              )}

              <div className="text-sm text-center space-y-1">
                <div className="text-muted-foreground">
                  Payment: <span className="text-foreground capitalize">{showReceipt.payment_method}</span>
                </div>
                <div className="text-muted-foreground">
                  Voucher: <span className="text-foreground font-mono">{showReceipt.voucher_number}</span>
                </div>
                {showReceipt.customer_name && (
                  <div className="text-muted-foreground">
                    Customer: <span className="text-foreground">{showReceipt.customer_name}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowReceipt(null)}>
              Close
            </Button>
            <Button onClick={() => printThermalReceipt(showReceipt)}>
              <Printer className="w-4 h-4 mr-1" />
              Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Transaction History
            </DialogTitle>
            <DialogDescription className="flex items-center gap-3">
              <span>{transactions.filter(t => !t.is_voided).length} active transactions</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={showVoided}
                  onChange={e => setShowVoided(e.target.checked)}
                  className="rounded border-border"
                />
                Show voided ({transactions.filter(t => t.is_voided).length})
              </label>
            </DialogDescription>
          </DialogHeader>
          
          <div className="overflow-y-auto max-h-[60vh]">
            {transactions.filter(t => showVoided || !t.is_voided).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No transactions found
              </div>
            ) : (
              <table className="data-table text-sm" data-testid="history-table">
                <thead>
                  <tr>
                    <th>Receipt #</th>
                    <th>Date/Time</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th className="text-right">Total</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.filter(t => showVoided || !t.is_voided).map(t => (
                    <tr key={t.id} className={t.is_voided ? 'opacity-50' : ''}>
                      <td className={`font-mono text-xs ${t.is_voided ? 'line-through' : ''}`}>{t.receipt_number}</td>
                      <td className="text-muted-foreground text-xs">{formatDate(t.date)} {t.time}</td>
                      <td className="text-xs">{t.customer_name || '-'}</td>
                      <td>{t.lines.length}</td>
                      <td className={`text-right font-mono font-bold ${t.is_voided ? 'text-red-400 line-through' : 'text-green-400'}`}>
                        ${formatUSD(t.total_usd)}
                      </td>
                      <td className="capitalize text-xs">{t.payment_method}</td>
                      <td>
                        {t.is_voided ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400 border border-red-500/30" title={`Reason: ${t.void_reason || 'N/A'}\nBy: ${t.voided_by_name || 'Admin'}\nAt: ${t.voided_at || ''}`}>
                            VOIDED
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            Active
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {!t.is_voided && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => printThermalReceipt(t)} title="Print Receipt">
                                <Printer className="w-3 h-3" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/20" 
                                onClick={() => { setVoidConfirm(t); setVoidReason(''); }}
                                title="Void Transaction"
                                data-testid="void-btn"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/20" 
                            onClick={() => setDeleteConfirm(t)}
                            title={t.is_voided ? "Permanently Delete" : "Delete Transaction"}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Transaction Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Permanently Delete
            </DialogTitle>
            <DialogDescription>
              This will permanently remove this transaction from the system. This cannot be undone. Use "Void" instead to keep an audit trail.
            </DialogDescription>
          </DialogHeader>
          
          {deleteConfirm && (
            <div className="space-y-3 py-2">
              <div className="bg-muted/30 p-3 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receipt:</span>
                  <span className="font-mono font-medium">{deleteConfirm.receipt_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date:</span>
                  <span>{formatDate(deleteConfirm.date)} {deleteConfirm.time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-mono font-bold text-green-400">${formatUSD(deleteConfirm.total_usd)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Voucher:</span>
                  <span className="font-mono">{deleteConfirm.voucher_number}</span>
                </div>
              </div>
              
              <div className="text-sm text-amber-400 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>This will permanently delete the transaction, voucher, and restore inventory.</span>
              </div>
            </div>
          )}
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={processing}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => handleDeleteTransaction(deleteConfirm)}
              disabled={processing}
              data-testid="confirm-delete-btn"
            >
              {processing ? 'Deleting...' : 'Permanently Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Transaction Dialog */}
      <Dialog open={!!voidConfirm} onOpenChange={() => { setVoidConfirm(null); setVoidReason(''); }}>
        <DialogContent className="max-w-md" data-testid="void-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <X className="w-5 h-5" />
              Void Transaction
            </DialogTitle>
            <DialogDescription>
              Void this transaction to reverse its accounting entries and restore inventory. The transaction will remain visible in history for audit purposes.
            </DialogDescription>
          </DialogHeader>
          
          {voidConfirm && (
            <div className="space-y-3 py-2">
              <div className="bg-muted/30 p-3 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receipt:</span>
                  <span className="font-mono font-medium">{voidConfirm.receipt_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-mono font-bold text-green-400">${formatUSD(voidConfirm.total_usd)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Voucher:</span>
                  <span className="font-mono">{voidConfirm.voucher_number}</span>
                </div>
              </div>
              
              <div className="space-y-1.5">
                <Label className="text-xs">Reason for Voiding *</Label>
                <Input
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  placeholder="e.g., Customer returned items, wrong order, duplicate entry..."
                  data-testid="void-reason-input"
                  autoFocus
                />
              </div>
            </div>
          )}
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setVoidConfirm(null); setVoidReason(''); }} disabled={processing}>
              Cancel
            </Button>
            <Button 
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleVoidTransaction}
              disabled={processing || !voidReason.trim()}
              data-testid="confirm-void-btn"
            >
              {processing ? 'Voiding...' : 'Void Transaction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer History Dialog */}
      <Dialog open={showCustomerHistory} onOpenChange={setShowCustomerHistory}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Customer Purchase History
              {selectedCustomerId && (
                <span className="text-muted-foreground font-normal">
                  - {customerAccounts.find(c => c.id === selectedCustomerId)?.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="overflow-y-auto max-h-[60vh]">
            {customerHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No purchase history found for this customer
              </div>
            ) : (
              <div className="space-y-3">
                {customerHistory.map(t => (
                  <Card key={t.id} className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-mono text-sm">{t.receipt_number}</span>
                        <span className="text-xs text-muted-foreground ml-2">{formatDate(t.date)} {t.time}</span>
                      </div>
                      <span className="font-mono font-bold text-green-400">${formatUSD(t.total_usd)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t.lines.map(l => l.item_name).join(', ')}
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs">
                      <span className="capitalize">{t.payment_method}</span>
                      <Button variant="ghost" size="sm" className="h-6" onClick={() => printThermalReceipt(t)}>
                        <Printer className="w-3 h-3 mr-1" />
                        Reprint
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Settings Dialog */}
      <ReceiptSettingsDialog
        open={showReceiptSettings}
        onOpenChange={(open) => {
          setShowReceiptSettings(open);
          if (!open && currentOrg) {
            axios.get(`${API}/receipt-settings?organization_id=${currentOrg.id}`)
              .then(res => setReceiptSettings(res.data))
              .catch(() => {});
          }
        }}
        organizationId={currentOrg?.id}
      />
    </div>
  );
};

export default POSPage;
