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
  Undo2, Check, X, ShoppingCart, ChevronsUpDown, ClipboardCopy, Loader2, WifiOff
} from 'lucide-react';
import axios from 'axios';
import { formatUSD, formatDate } from '../lib/utils';
import db from '../lib/db';
import { addToSyncQueue, OPERATION_TYPES, ACTION_TYPES } from '../lib/syncService';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PurchaseInvoicePage = () => {
  const { currentOrg, user } = useAuth();
  const { selectedFY } = useFiscalYear();
  const { isOnline, updatePendingCount } = useSync();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Data
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseAccounts, setPurchaseAccounts] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [serviceItems, setServiceItems] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [searchItemsCache, setSearchItemsCache] = useState({}); // Cache items from search { itemId: item }
  
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
  const [newItemDialog, setNewItemDialog] = useState(null); // { name: string, lineIndex: number }
  const [newItemSaving, setNewItemSaving] = useState(false);
  
  // Copy from Sales Invoice state
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [loadingSalesInvoices, setLoadingSalesInvoices] = useState(false);
  const [salesInvoiceSearch, setSalesInvoiceSearch] = useState('');
  // Print state
  const [printDialog, setPrintDialog] = useState(null); // Invoice to print
  const [printWithBackground, setPrintWithBackground] = useState(true);
  
  // Form state
  const emptyLine = { inventory_item_id: '', service_item_id: '', item_name: '', item_name_ar: '', barcode: '', quantity: 1, unit: 'piece', unit_price: 0, currency: 'USD', exchange_rate: 1, discount_percent: 0, line_total: 0, line_total_usd: 0, is_taxable: true, is_service: false, batch_number: '', expiry_date: '' };
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    due_date: '',
    supplier_invoice_number: '',
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

  const canEdit = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'accountant';
  const canDelete = user?.role === 'super_admin' || user?.role === 'admin';
  const isSuperAdmin = user?.role === 'super_admin';

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
        const [purchaseRes, inventoryRes, servicesRes] = await Promise.all([
          axios.get(`${API}/purchase-accounts?organization_id=${currentOrg.id}`),
          axios.get(`${API}/inventory?organization_id=${currentOrg.id}&page_size=1000`),
          axios.get(`${API}/service-items?organization_id=${currentOrg.id}`).catch(() => ({ data: [] }))
        ]);
        
        // Handle paginated inventory response - extract items array
        const inventoryData = Array.isArray(inventoryRes.data) 
          ? inventoryRes.data 
          : (inventoryRes.data?.items || []);
        
        // Handle service items response
        const serviceData = Array.isArray(servicesRes.data) 
          ? servicesRes.data 
          : (servicesRes.data?.items || []);
        
        // Cache data in IndexedDB
        try {
          // Cache inventory
          await db.inventoryItems.where('organization_id').equals(currentOrg.id).delete();
          if (inventoryData.length > 0) await db.inventoryItems.bulkPut(inventoryData);
          
          // Cache purchase accounts
          const accountsToCache = purchaseRes.data.map(a => ({ ...a, organization_id: currentOrg.id }));
          if (accountsToCache.length > 0) await db.chartOfAccounts.bulkPut(accountsToCache);
        } catch (cacheError) {
          console.warn('[PurchaseInvoice] Error caching data:', cacheError);
        }
        
        setPurchaseAccounts(purchaseRes.data);
        setInventoryItems(inventoryData);
        setServiceItems(serviceData);
        setCurrencies([
          { code: 'USD', name: 'US Dollar', symbol: '$' },
          { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل' }
        ]);
        
        // Set default accounts if available
        // Debit = Purchase/Expense account, Credit = Supplier Payable
        if (purchaseRes.data.length > 0 && !formData.debit_account_id) {
          setFormData(prev => ({ ...prev, debit_account_id: purchaseRes.data[0].id }));
        }
        if (suppliersRes.data.length > 0 && !formData.credit_account_id) {
          setFormData(prev => ({ ...prev, credit_account_id: suppliersRes.data[0].id }));
        }
        
        await fetchInvoices(true);
      } else {
        // Load from IndexedDB when offline
        console.log('[PurchaseInvoice] Offline mode - loading from cache');
        
        const cachedSuppliers = await db.suppliers.where('organization_id').equals(currentOrg.id).toArray();
        const cachedInventory = await db.inventoryItems.where('organization_id').equals(currentOrg.id).toArray();
        const cachedAccounts = await db.chartOfAccounts.where('organization_id').equals(currentOrg.id).toArray();
        const cachedInvoices = await db.purchaseInvoices.where('organization_id').equals(currentOrg.id).toArray();
        
        setSuppliers(cachedSuppliers);
        setInventoryItems(cachedInventory);
        setPurchaseAccounts(cachedAccounts.filter(a => a.code?.startsWith('6')));
        setInvoices(cachedInvoices);
        setTotalCount(cachedInvoices.length);
        setCurrencies([
          { code: 'USD', name: 'US Dollar', symbol: '$' },
          { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل' }
        ]);
        
        if (cachedSuppliers.length > 0 && !formData.credit_account_id) {
          setFormData(prev => ({ ...prev, credit_account_id: cachedSuppliers[0].id }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      
      // Fallback to cached data
      try {
        const cachedSuppliers = await db.suppliers.where('organization_id').equals(currentOrg.id).toArray();
        const cachedInventory = await db.inventoryItems.where('organization_id').equals(currentOrg.id).toArray();
        const cachedInvoices = await db.purchaseInvoices.where('organization_id').equals(currentOrg.id).toArray();
        
        if (cachedSuppliers.length > 0) setSuppliers(cachedSuppliers);
        if (cachedInventory.length > 0) setInventoryItems(cachedInventory);
        if (cachedInvoices.length > 0) {
          setInvoices(cachedInvoices);
          setTotalCount(cachedInvoices.length);
        }
      } catch (cacheError) {
        console.error('[PurchaseInvoice] Cache fallback failed:', cacheError);
      }
    } finally {
      setLoading(false);
    }
  };

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
        axios.get(`${API}/purchase-invoices?${params.toString()}`),
        axios.get(`${API}/purchase-invoices/count?${params.toString()}`)
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
          inventory_item_id: value,
          service_item_id: '',  // Clear service reference
          is_service: false,    // Clear service flag
          item_name: item.name,
          item_name_ar: item.name_ar || '',
          barcode: item.barcode || '',
          unit: item.unit || 'piece',
          quantity: newLines[index].quantity || 1,  // Default quantity to 1 if not set
          unit_price: item.cost || item.price || 0,  // Use cost for purchase invoices
          currency: item.currency || 'USD',
          exchange_rate: item.currency === 'LBP' ? (currentOrg?.base_exchange_rate || 89500) : 1,
          is_taxable: item.is_taxable !== false  // Include taxable flag
        };
      } else {
        // Item not found in local cache - this shouldn't happen with searchItemsCache
        console.warn(`Item ${value} not found in allInventoryItems`);
      }
    }
    
    // If cleared to manual entry, reset service flags too
    if (field === 'inventory_item_id' && !value) {
      newLines[index] = {
        ...newLines[index],
        service_item_id: '',
        is_service: false
      };
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

  // Handle service item selection
  const handleSelectService = (index, service) => {
    const newLines = [...formData.lines];
    newLines[index] = {
      ...newLines[index],
      inventory_item_id: '',  // Clear inventory item reference
      service_item_id: service.id,
      item_name: service.name,
      item_name_ar: service.name_ar || '',
      barcode: '',
      quantity: 1,
      unit: service.unit || 'service',
      unit_price: service.price,
      currency: service.currency || 'USD',
      exchange_rate: service.currency === 'LBP' ? (currentOrg?.base_exchange_rate || 89500) : 1,
      is_taxable: service.is_taxable !== false,
      is_service: true  // Flag to indicate this is a service
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

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [...formData.lines, { ...emptyLine }]
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

  const handleDiscountTaxChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    const totals = recalculateTotals(newData.lines, newData.discount_percent, newData.tax_percent);
    setFormData({ ...newData, subtotal: totals.subtotal, discount_amount: totals.discountAmount, tax_amount: totals.taxAmount, total: totals.total, total_usd: totals.totalUsd });
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
        track_stock: true, // Track stock for purchase items
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
          unit_price: createdItem.cost || createdItem.price || 0, // Use cost for purchase
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
      debit_account_id: purchaseAccounts[0]?.id || '',
      credit_account_id: suppliers[0]?.id || ''
    });
    setEditingInvoice(null);
  };

  // Fetch sales invoices for copy feature
  const fetchSalesInvoices = async () => {
    setLoadingSalesInvoices(true);
    try {
      const response = await axios.get(`${API}/sales-invoices?organization_id=${currentOrg.id}&limit=50`);
      setSalesInvoices(response.data.invoices || response.data || []);
    } catch (error) {
      console.error('Error fetching sales invoices:', error);
    } finally {
      setLoadingSalesInvoices(false);
    }
  };

  // Open copy dialog
  const openCopyDialog = () => {
    setCopyDialogOpen(true);
    fetchSalesInvoices();
  };

  // Copy lines from a sales invoice
  const copyFromSalesInvoice = (salesInvoice) => {
    if (!salesInvoice.lines || salesInvoice.lines.length === 0) {
      alert('Selected invoice has no line items to copy');
      return;
    }

    // Map sales invoice lines to purchase invoice format
    const copiedLines = salesInvoice.lines.map(line => ({
      inventory_item_id: line.inventory_item_id || '',
      service_item_id: line.service_item_id || '',
      item_name: line.item_name || '',
      item_name_ar: line.item_name_ar || '',
      barcode: line.barcode || '',
      quantity: line.quantity || 1,
      unit: line.unit || 'piece',
      unit_price: line.unit_price || 0,  // Keep the same price, user can adjust
      currency: line.currency || 'USD',
      exchange_rate: line.exchange_rate || 1,
      discount_percent: line.discount_percent || 0,
      line_total: line.line_total || 0,
      line_total_usd: line.line_total_usd || line.line_total || 0,
      is_taxable: line.is_taxable !== false,
      is_service: line.is_service || false
    }));

    // Update form with copied lines
    const totals = recalculateTotals(copiedLines, formData.discount_percent, formData.tax_percent);
    
    setFormData({
      ...formData,
      lines: copiedLines,
      subtotal: totals.subtotal,
      discount_amount: totals.discountAmount,
      tax_amount: totals.taxAmount,
      total: totals.total,
      total_usd: totals.totalUsd
    });

    setCopyDialogOpen(false);
    setSalesInvoiceSearch('');
  };

  // Filter sales invoices for search
  const filteredSalesInvoices = useMemo(() => {
    if (!salesInvoiceSearch) return salesInvoices;
    const searchLower = salesInvoiceSearch.toLowerCase();
    return salesInvoices.filter(inv => 
      inv.invoice_number?.toLowerCase().includes(searchLower) ||
      inv.debit_account_name?.toLowerCase().includes(searchLower) ||
      inv.notes?.toLowerCase().includes(searchLower)
    );
  }, [salesInvoices, salesInvoiceSearch]);

  const openForm = (invoice = null) => {
    if (invoice) {
      setEditingInvoice(invoice);
      setFormData({
        date: invoice.date,
        due_date: invoice.due_date || '',
        supplier_invoice_number: invoice.supplier_invoice_number || '',
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
          await axios.put(`${API}/purchase-invoices/${editingInvoice.id}`, payload);
        } else {
          await axios.post(`${API}/purchase-invoices`, payload);
        }
      } else {
        // Offline: Save locally and queue for sync
        const offlineId = 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const offlineInvoiceNumber = 'PI-OFFLINE-' + String(Date.now()).slice(-5);
        
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
        await db.purchaseInvoices.put(offlineInvoice);
        
        // Add to sync queue
        const { addToSyncQueue, OPERATION_TYPES, ACTION_TYPES } = await import('../lib/syncService');
        await addToSyncQueue(
          OPERATION_TYPES.PURCHASE_INVOICE, 
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
      await axios.delete(`${API}/purchase-invoices/${deleteConfirm.id}`);
      setDeleteConfirm(null);
      fetchInvoices(true);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete invoice');
    }
  };

  const handlePost = async (invoiceId) => {
    if (!window.confirm('Post this invoice? This will create a sales voucher and update account balances.')) return;
    
    try {
      const response = await axios.post(`${API}/purchase-invoices/${invoiceId}/post`);
      alert(`Invoice posted! Voucher: ${response.data.voucher_number}`);
      fetchInvoices(true);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to post invoice');
    }
  };

  const handleUnpost = async (invoiceId) => {
    if (!window.confirm('Unpost this invoice? This will reverse the voucher and restore inventory quantities.')) return;
    
    try {
      await axios.post(`${API}/purchase-invoices/${invoiceId}/unpost`);
      fetchInvoices(true);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to unpost invoice');
    }
  };

  const handlePrint = (invoice, withBackground = true) => {
    // Get purchase invoice template from document_templates
    const template = currentOrg?.document_templates?.purchase_invoice || {};
    const companyName = template.company_name || currentOrg?.name || 'KAIROS';
    const companyType = template.company_type || '';
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
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: Arial, sans-serif; 
            padding: 40px; 
            font-size: 12px;
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
          .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .company { font-size: 24px; font-weight: bold; color: #1a365d; }
          .company-type { font-size: 12px; color: #666; }
          .invoice-title { font-size: 28px; color: #16a34a; text-align: right; }
          .invoice-number { color: #666; text-align: right; }
          .section { margin-bottom: 20px; }
          .section-title { font-weight: bold; margin-bottom: 8px; color: #1a365d; border-bottom: 2px solid #16a34a; padding-bottom: 4px; }
          .supplier-info { background: #f8fafc; padding: 15px; border-radius: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #166534; color: white; padding: 10px; text-align: left; }
          td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
          .number { text-align: right; font-family: monospace; }
          .totals { margin-top: 20px; width: 300px; margin-left: auto; }
          .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
          .totals-row.total { font-size: 16px; font-weight: bold; background: #f8fafc; padding: 12px; border: none; }
          .footer { margin-top: 40px; text-align: center; color: #666; font-size: 10px; }
          @media print { 
            body { 
              padding: 20px;
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
        </style>
      </head>
      <body>
        ${backgroundImage ? '<div class="background-layer"></div>' : ''}
        <div class="header">
          <div>
            <div class="company">${companyName}</div>
            ${companyType ? `<div class="company-type">${companyType}</div>` : ''}
          </div>
          <div>
            <div class="invoice-title">PURCHASE INVOICE</div>
            <div class="invoice-number">${invoice.invoice_number}</div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Supplier</div>
          <div class="supplier-info">
            <strong>${invoice.supplier_name || invoice.debit_account_name || 'Supplier'}</strong><br>
            Account: ${invoice.supplier_code || invoice.debit_account_code || ''}
          </div>
        </div>
        
        <div style="display: flex; gap: 40px; margin-bottom: 20px;">
          <div><strong>Invoice Date:</strong> ${new Date(invoice.date).toLocaleDateString('en-GB')}</div>
          ${invoice.due_date ? `<div><strong>Due Date:</strong> ${new Date(invoice.due_date).toLocaleDateString('en-GB')}</div>` : ''}
          <div><strong>Currency:</strong> ${invoice.currency}</div>
          <div><strong>Status:</strong> ${invoice.is_posted ? 'POSTED' : 'DRAFT'}</div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Barcode</th>
              <th class="number">Qty</th>
              <th class="number">Unit Cost</th>
              <th class="number">Discount %</th>
              <th class="number">Total</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.lines.map((line, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${line.item_name}${line.item_name_ar ? `<br><small>${line.item_name_ar}</small>` : ''}</td>
                <td>${line.barcode || '-'}</td>
                <td class="number">${line.quantity}${line.unit && line.unit !== 'piece' ? ' ' + line.unit : ''}</td>
                <td class="number">${invoice.currency} ${parseFloat(line.unit_price).toFixed(2)}</td>
                <td class="number">${line.discount_percent || 0}%</td>
                <td class="number">${invoice.currency} ${parseFloat(line.line_total).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="totals">
          <div class="totals-row">
            <span>Subtotal:</span>
            <span>${invoice.currency} ${parseFloat(invoice.subtotal).toFixed(2)}</span>
          </div>
          ${invoice.discount_amount > 0 ? `
            <div class="totals-row">
              <span>Discount (${invoice.discount_percent}%):</span>
              <span>-${invoice.currency} ${parseFloat(invoice.discount_amount).toFixed(2)}</span>
            </div>
          ` : ''}
          ${invoice.tax_amount > 0 ? `
            <div class="totals-row">
              <span>Tax (${invoice.tax_percent}%):</span>
              <span>${invoice.currency} ${parseFloat(invoice.tax_amount).toFixed(2)}</span>
            </div>
          ` : ''}
          <div class="totals-row total">
            <span>TOTAL:</span>
            <span>${invoice.currency} ${parseFloat(invoice.total).toFixed(2)}</span>
          </div>
          ${invoice.currency !== 'USD' ? `
            <div class="totals-row">
              <span>Total (USD):</span>
              <span>$ ${parseFloat(invoice.total_usd).toFixed(2)}</span>
            </div>
          ` : ''}
        </div>
        
        ${invoice.notes ? `
          <div class="section" style="margin-top: 30px;">
            <div class="section-title">Notes</div>
            <p>${invoice.notes}</p>
          </div>
        ` : ''}
        
        ${invoice.is_posted ? `
          <div style="margin-top: 20px; padding: 10px; background: #dcfce7; border-radius: 4px;">
            <strong>Voucher Reference:</strong> ${invoice.voucher_number || 'N/A'}
          </div>
        ` : ''}
        
        <div class="footer">
          <p>Thank you for your business!</p>
          <p>Generated by KAIROS Accounting System</p>
        </div>
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
            Purchase Invoices
          </h1>
          <p className="text-sm text-muted-foreground">
            Create and manage purchase invoices from suppliers
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
                placeholder="Search invoice #, items..."
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
            <ShoppingCart className="w-5 h-5" />
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
              <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-50" />
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
                    <p className="text-sm">{inv.credit_account_name || 'Supplier'}</p>
                    {inv.supplier_invoice_number && (
                      <p className="text-xs text-muted-foreground">Ref: {inv.supplier_invoice_number}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{formatDate(inv.date)}</p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                      <span className="font-mono font-bold">
                        ${formatUSD(inv.total_usd)}
                      </span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setViewInvoice(inv)}>
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setPrintDialog(inv)}>
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
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleUnpost(inv.id)}>
                            <Undo2 className="w-3 h-3" />
                          </Button>
                        )}
                        {canDelete && !inv.is_posted && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400" onClick={() => setDeleteConfirm(inv)}>
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
                      <th>Supplier Ref</th>
                      <th>Date</th>
                      <th>Supplier (Credit)</th>
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
                        <td className="text-muted-foreground text-xs">{inv.supplier_invoice_number || '-'}</td>
                        <td className="text-muted-foreground">{formatDate(inv.date)}</td>
                        <td>
                          <span className="font-mono text-xs text-cyan-400">{inv.credit_account_code}</span>
                          <br />
                          <span className="text-sm">{inv.credit_account_name}</span>
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
                            <Button variant="ghost" size="sm" onClick={() => setPrintDialog(inv)} title="Print">
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
                              <Button variant="ghost" size="sm" onClick={() => handleUnpost(inv.id)} title="Unpost">
                                <Undo2 className="w-3 h-3" />
                              </Button>
                            )}
                            {canDelete && !inv.is_posted && (
                              <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setDeleteConfirm(inv)} title="Delete">
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
        <DialogContent className="max-w-[98vw] w-full max-h-[95vh] overflow-y-auto">
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
              {editingInvoice ? 'Edit Invoice' : 'New Purchase Invoice'}
            </DialogTitle>
            {currentOrg?.enable_expiry_tracking && (
              <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm">
                <Package className="w-4 h-4 text-amber-400" />
                <span className="text-amber-400 font-medium">Batch & Expiry Tracking Enabled</span>
                <span className="text-muted-foreground">- Enter batch numbers and expiry dates for inventory items</span>
              </div>
            )}
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Header Fields - Date, Due Date & Supplier Invoice Number */}
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
              <div className="col-span-2 space-y-2">
                <Label>Supplier Invoice #</Label>
                <Input
                  placeholder="Supplier's reference number"
                  value={formData.supplier_invoice_number || ''}
                  onChange={(e) => setFormData({ ...formData, supplier_invoice_number: e.target.value })}
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
                    accounts={purchaseAccounts}
                    value={formData.debit_account_id}
                    onChange={(v) => setFormData({ ...formData, debit_account_id: v })}
                    label="Debit Account (Purchases/Expense)"
                    labelIcon={DollarSign}
                    labelColor="text-red-400"
                    placeholder="Search purchase account..."
                    accountType="account"
                    required
                  />
                  <AccountSelector
                    fetchUrl="/supplier-accounts"
                    fetchParams={{ organization_id: currentOrg.id }}
                    value={formData.credit_account_id}
                    onChange={(v) => setFormData({ ...formData, credit_account_id: v })}
                    label="Credit Account (Supplier Payable)"
                    labelIcon={DollarSign}
                    labelColor="text-green-400"
                    placeholder="Search supplier account..."
                    accountType="supplier"
                    required
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
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={openCopyDialog} className="gap-1 text-purple-400 hover:text-purple-300 hover:border-purple-500">
                    <ClipboardCopy className="w-4 h-4" />
                    Copy from Sales
                  </Button>
                  <Button type="button" variant="default" size="sm" onClick={addLine} className="gap-1">
                    <Plus className="w-4 h-4" />
                    Add Line
                  </Button>
                </div>
              </div>
              
              <div className="border rounded-lg overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead className="bg-gradient-to-r from-muted/80 to-muted/50">
                      <tr>
                        <th className="p-2 text-left min-w-[180px] font-semibold text-xs">Item (Search)</th>
                        <th className="p-2 text-center w-16 font-semibold text-xs">Qty</th>
                        {currentOrg?.enable_expiry_tracking && (
                          <>
                            <th className="p-2 text-center w-24 font-semibold text-xs">
                              <span className="flex items-center justify-center gap-1">
                                <Package className="w-3 h-3 text-amber-400" />
                                Batch
                              </span>
                            </th>
                            <th className="p-2 text-center w-28 font-semibold text-xs">
                              <span className="flex items-center justify-center gap-1">
                                <Calendar className="w-3 h-3 text-red-400" />
                                Expiry
                              </span>
                            </th>
                          </>
                        )}
                        <th className="p-2 text-center w-20 font-semibold text-xs">Curr.</th>
                        <th className="p-2 text-center w-20 font-semibold text-xs">Rate</th>
                        <th className="p-2 text-right w-24 font-semibold text-xs">Unit Cost</th>
                        <th className="p-2 text-center w-14 font-semibold text-xs">Disc%</th>
                        <th className="p-2 text-right w-28 font-semibold text-xs">Line Total</th>
                        <th className="p-2 text-right w-24 font-semibold text-xs text-green-400">USD</th>
                        <th className="p-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {formData.lines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-muted/20 transition-colors">
                          <td className="p-1.5">
                            <InventorySelector
                              items={inventoryItems}
                              serviceItems={serviceItems}
                              value={line.is_service ? `service_${line.service_item_id}` : line.inventory_item_id}
                              onChange={(v) => handleLineChange(idx, 'inventory_item_id', v)}
                              onSelectService={(service) => handleSelectService(idx, service)}
                              currencies={currencies}
                              lineCurrency={line.currency}
                              organizationId={currentOrg?.id}
                              apiUrl={API}
                              onItemSelect={handleItemSelectedFromSearch}
                              onCreateNewItem={(searchTerm) => setNewItemDialog({ name: searchTerm, lineIndex: idx })}
                            />
                            {!line.inventory_item_id && !line.service_item_id && (
                              <Input
                                placeholder="Item name (manual)"
                                value={line.item_name}
                                onChange={(e) => handleLineChange(idx, 'item_name', e.target.value)}
                                className="mt-1 h-8 text-xs"
                              />
                            )}
                            {line.is_service && (
                              <div className="text-[10px] text-purple-400 mt-1">Service Item (No Stock)</div>
                            )}
                          </td>
                          <td className="p-1.5">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.quantity}
                              onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                              className="h-8 text-center font-medium text-xs w-full"
                            />
                          </td>
                          {currentOrg?.enable_expiry_tracking && (
                            <>
                              <td className="p-1.5">
                                <Input
                                  placeholder="LOT"
                                  value={line.batch_number || ''}
                                  onChange={(e) => handleLineChange(idx, 'batch_number', e.target.value)}
                                  className="h-8 text-center text-xs border-amber-500/30 focus:border-amber-500 bg-amber-500/5 w-full"
                                  disabled={line.is_service}
                                />
                              </td>
                              <td className="p-1.5">
                                <Input
                                  type="date"
                                  value={line.expiry_date || ''}
                                  onChange={(e) => handleLineChange(idx, 'expiry_date', e.target.value)}
                                  className="h-8 text-xs border-red-500/30 focus:border-red-500 bg-red-500/5 w-full"
                                  disabled={line.is_service}
                                />
                              </td>
                            </>
                          )}
                          <td className="p-1.5">
                            <Select 
                              value={line.currency || 'USD'} 
                              onValueChange={(v) => {
                                handleLineChange(idx, 'currency', v);
                                if (v === 'USD') handleLineChange(idx, 'exchange_rate', 1);
                                else if (v === 'LBP') handleLineChange(idx, 'exchange_rate', currentOrg?.base_exchange_rate || 89500);
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs w-full">
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
                          <td className="p-1.5">
                            {line.currency !== 'USD' ? (
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={line.exchange_rate}
                                onChange={(e) => handleLineChange(idx, 'exchange_rate', e.target.value)}
                                className="h-8 text-center font-mono text-xs w-full"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground block text-center">1.00</span>
                            )}
                          </td>
                          <td className="p-1.5">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.unit_price}
                              onChange={(e) => handleLineChange(idx, 'unit_price', e.target.value)}
                              className="h-8 text-right font-mono text-xs w-full"
                            />
                          </td>
                          <td className="p-1.5">
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              value={line.discount_percent}
                              onChange={(e) => handleLineChange(idx, 'discount_percent', e.target.value)}
                              className="h-8 text-center text-xs w-full"
                            />
                          </td>
                          <td className="p-1.5 text-right">
                            <div className="font-mono text-xs font-medium whitespace-nowrap">
                              <span className="text-muted-foreground text-[10px] mr-0.5">{line.currency || 'USD'}</span>
                              {formatUSD(line.line_total)}
                            </div>
                          </td>
                          <td className="p-1.5 text-right">
                            <span className="font-mono text-xs font-semibold text-green-400 whitespace-nowrap">
                              ${formatUSD(line.line_total_usd || line.line_total)}
                            </span>
                          </td>
                          <td className="p-1.5 text-center">
                            {formData.lines.length > 1 && (
                              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/20" onClick={() => removeLine(idx)}>
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
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
        <DialogContent className="max-w-[98vw] w-full max-h-[90vh] overflow-y-auto">
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
                      {currentOrg?.enable_expiry_tracking && (
                        <>
                          <th className="text-center">Batch</th>
                          <th className="text-center">Expiry</th>
                        </>
                      )}
                      <th className="text-center">Currency</th>
                      <th className="text-right">Unit Cost</th>
                      <th className="text-right">Disc %</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewInvoice.lines.map((line, idx) => (
                      <tr key={idx}>
                        <td>
                          {line.item_name}
                          {line.barcode && <span className="text-xs text-muted-foreground ml-1">[{line.barcode}]</span>}
                        </td>
                        <td className="text-right">{line.quantity} {line.unit}</td>
                        {currentOrg?.enable_expiry_tracking && (
                          <>
                            <td className="text-center">
                              {line.batch_number ? (
                                <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs font-mono">
                                  {line.batch_number}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="text-center">
                              {line.expiry_date ? (
                                <span className={`px-1.5 py-0.5 rounded text-xs ${
                                  new Date(line.expiry_date) < new Date() 
                                    ? 'bg-red-500/20 text-red-400' 
                                    : 'bg-green-500/20 text-green-400'
                                }`}>
                                  {formatDate(line.expiry_date)}
                                </span>
                              ) : '-'}
                            </td>
                          </>
                        )}
                        <td className="text-center text-xs">{line.currency || 'USD'}</td>
                        <td className="text-right font-mono">{line.currency === 'USD' ? '$' : line.currency + ' '}{formatUSD(line.unit_price)}</td>
                        <td className="text-right">{line.discount_percent}%</td>
                        <td className="text-right font-mono">{line.currency || 'USD'} {formatUSD(line.line_total)}</td>
                        <td className="text-right font-mono text-green-400">${formatUSD(line.line_total_usd || line.line_total)}</td>
                      </tr>
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
            <Button onClick={() => { setPrintDialog(viewInvoice); setViewInvoice(null); }}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Dialog with Background Option */}
      <Dialog open={!!printDialog} onOpenChange={() => setPrintDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Print Invoice
            </DialogTitle>
          </DialogHeader>
          
          {/* Background Option */}
          <div className="flex items-center gap-2 py-3 px-3 bg-muted/30 rounded-lg border">
            <input
              type="checkbox"
              id="purchase-print-with-background"
              checked={printWithBackground}
              onChange={(e) => setPrintWithBackground(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="purchase-print-with-background" className="text-sm cursor-pointer flex-1">
              Print with background image
            </label>
          </div>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPrintDialog(null)}>Cancel</Button>
            <Button 
              onClick={() => {
                handlePrint(printDialog, printWithBackground);
                setPrintDialog(null);
              }}
              className="flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete invoice <strong>{deleteConfirm?.invoice_number}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy from Sales Invoice Dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={(open) => { setCopyDialogOpen(open); if (!open) setSalesInvoiceSearch(''); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCopy className="w-5 h-5 text-purple-400" />
              Copy from Sales Invoice
            </DialogTitle>
            <DialogDescription>
              Select a sales invoice to copy its line items to this purchase invoice
            </DialogDescription>
          </DialogHeader>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by invoice number or customer..."
              value={salesInvoiceSearch}
              onChange={(e) => setSalesInvoiceSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          
          {/* Sales Invoices List */}
          <div className="flex-1 overflow-auto mt-4 border rounded-lg">
            {loadingSalesInvoices ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : filteredSalesInvoices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No sales invoices found</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredSalesInvoices.map(inv => (
                  <div
                    key={inv.id}
                    className="p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => copyFromSalesInvoice(inv)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{inv.invoice_number}</p>
                        <p className="text-sm text-muted-foreground">{inv.debit_account_name || 'Customer'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-green-400">${formatUSD(inv.total_usd || inv.total)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(inv.date)}</p>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {inv.lines?.length || 0} line items • {inv.is_posted ? 'Posted' : 'Draft'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>Cancel</Button>
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
              Add a new item to your inventory and use it in this purchase invoice.
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
                    <Label htmlFor="cost">Cost Price *</Label>
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

export default PurchaseInvoicePage;
