import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { DateInput } from '../components/ui/date-input';
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
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Checkbox } from '../components/ui/checkbox';
import { 
  Package, Search, Plus, Edit, Trash2, AlertTriangle, Calendar,
  DollarSign, Hash, Tag, Truck, BarChart3, ArrowUpDown, Filter,
  Image, Upload, Sparkles, Globe, Loader2, X, Receipt, FileSpreadsheet,
  ChevronRight, Check, Layers, History, Eye, Printer, FileText, WifiOff, Database, RefreshCw
} from 'lucide-react';
import axios from 'axios';
import { formatUSD, formatDate } from '../lib/utils';
import db from '../lib/db';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const UNITS = [
  { value: 'piece', label: 'Piece' },
  { value: 'box', label: 'Box' },
  { value: 'kg', label: 'Kilogram' },
  { value: 'g', label: 'Gram' },
  { value: 'l', label: 'Liter' },
  { value: 'ml', label: 'Milliliter' },
  { value: 'pack', label: 'Pack' },
  { value: 'bottle', label: 'Bottle' },
  { value: 'tube', label: 'Tube' },
  { value: 'strip', label: 'Strip' },
];

const InventoryPage = () => {
  const { currentOrg, user } = useAuth();
  const { isOnline } = useSync();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pageSize] = useState(100);
  
  // Search states for dropdowns
  const [categorySearch, setCategorySearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterStock, setFilterStock] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  
  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [adjustQtyItem, setAdjustQtyItem] = useState(null);
  const [adjustmentValue, setAdjustmentValue] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  
  // Category management
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', name_ar: '', description: '' });
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState(null);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  
  // Image handling
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageItem, setImageItem] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [fetchingWeb, setFetchingWeb] = useState(false);
  const fileInputRef = useRef(null);
  
  // CSV Import state
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState(null);
  const [csvMappings, setCsvMappings] = useState({});
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvCreateCategories, setCsvCreateCategories] = useState(true);
  const [csvCreateSuppliers, setCsvCreateSuppliers] = useState(true);
  const [csvSupplierStartCode, setCsvSupplierStartCode] = useState('40001');
  const csvInputRef = useRef(null);
  
  // DBF Import state
  const [dbfDialogOpen, setDbfDialogOpen] = useState(false);
  const [dbfFile, setDbfFile] = useState(null);
  const [dbfPreview, setDbfPreview] = useState(null);
  const [dbfImporting, setDbfImporting] = useState(false);
  const [dbfImportResult, setDbfImportResult] = useState(null);
  const [dbfFieldMapping, setDbfFieldMapping] = useState({});
  const [dbfStep, setDbfStep] = useState(1); // 1: upload, 2: mapping, 3: result
  const [dbfCreateSuppliers, setDbfCreateSuppliers] = useState(true);
  const [dbfSupplierParentCode, setDbfSupplierParentCode] = useState('401');
  const [dbfUpdateExisting, setDbfUpdateExisting] = useState(false); // NEW: Update existing items
  const [supplierAccounts, setSupplierAccounts] = useState([]);
  const dbfInputRef = useRef(null);
  
  // Available inventory fields for mapping
  const inventoryFields = [
    { key: 'code', label: 'Item Code / SKU', required: false },
    { key: 'barcode', label: 'Barcode', required: false },
    { key: 'moh_code', label: 'MOH Code (Ministry of Health)', required: false },
    { key: 'name', label: 'Name (English)', required: true },
    { key: 'name_ar', label: 'Name (Arabic)', required: false },
    { key: 'unit', label: 'Unit', required: false },
    { key: 'price', label: 'Selling Price (TTC - Tax Included)', required: false },
    { key: 'cost', label: 'Cost Price (TTC - Tax Included)', required: false },
    { key: 'tva', label: 'TVA / Tax Rate (0=No Tax, 11=Taxable)', required: false },
    { key: 'currency', label: 'Currency (USD/LBP)', required: false },
    { key: 'category', label: 'Category', required: false },
    { key: 'country_of_origin', label: 'Country of Origin', required: false },
    { key: 'discount', label: 'Discount %', required: false },
    { key: 'on_hand_qty', label: 'Quantity on Hand', required: false },
    { key: 'min_qty', label: 'Minimum Quantity', required: false },
    { key: 'supplier', label: 'Supplier Name', required: false },
  ];
  
  // Batch management state
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchItem, setBatchItem] = useState(null);
  const [newBatch, setNewBatch] = useState({
    batch_number: '',
    expiry_date: '',
    quantity: '',
    cost: '',
    notes: ''
  });
  const [editingBatch, setEditingBatch] = useState(null);
  
  // Movement history state
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [movementItem, setMovementItem] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  
  // Barcode lookup state
  const [barcodeLookupLoading, setBarcodeLookupLoading] = useState(false);
  const [barcodeLookupResult, setBarcodeLookupResult] = useState(null);
  const [pendingImageUrl, setPendingImageUrl] = useState(null); // Store image URL from barcode lookup
  
  // Form state
  const [formData, setFormData] = useState({
    barcode: '',
    sku: '',
    moh_code: '',
    name: '',
    name_ar: '',
    category_id: '',
    supplier_id: '',
    cost: '',
    price: '',
    currency: 'USD',
    min_qty: '',
    on_hand_qty: '',
    unit: 'piece',
    expiry_date: '',
    description: '',
    is_taxable: true,
    is_active: true,
    is_pos_item: false,
    show_image_in_pos: true
  });

  useEffect(() => {
    if (currentOrg) {
      fetchInventory(1);
      fetchStats();
      fetchCategories();
      fetchSuppliers();
      fetchCurrencies();
    }
  }, [currentOrg, isOnline]);
  
  // Refetch when filters change
  useEffect(() => {
    if (currentOrg) {
      setCurrentPage(1);
      fetchInventory(1);
    }
  }, [searchTerm, filterCategory, filterSupplier]);

  const fetchInventory = async (page = currentPage) => {
    setLoading(true);
    try {
      if (isOnline) {
        const params = new URLSearchParams({
          organization_id: currentOrg.id,
          page: page.toString(),
          page_size: pageSize.toString()
        });
        
        // Add search filter
        if (searchTerm) {
          params.append('search', searchTerm);
        }
        
        // Add category filter
        if (filterCategory && filterCategory !== 'all') {
          params.append('category_id', filterCategory);
        }
        
        // Add supplier filter  
        if (filterSupplier && filterSupplier !== 'all') {
          params.append('supplier_id', filterSupplier);
        }
        
        const response = await axios.get(`${API}/inventory?${params.toString()}`);
        const data = response.data;
        
        // Handle paginated response
        if (data.items) {
          setItems(data.items);
          setTotalItems(data.total);
          setTotalPages(data.total_pages);
          setCurrentPage(data.page);
          
          // Cache in IndexedDB (only first page for offline)
          if (page === 1) {
            try {
              await db.inventoryItems.where('organization_id').equals(currentOrg.id).delete();
              if (data.items.length > 0) {
                await db.inventoryItems.bulkPut(data.items);
              }
            } catch (cacheError) {
              console.warn('[Inventory] Error caching:', cacheError);
            }
          }
        } else {
          // Backward compatibility - old response format
          setItems(data);
          setTotalItems(data.length);
          setTotalPages(1);
        }
      } else {
        // Load from IndexedDB when offline
        console.log('[Inventory] Offline mode - loading from cache');
        const cachedItems = await db.inventoryItems.where('organization_id').equals(currentOrg.id).toArray();
        setItems(cachedItems);
        setTotalItems(cachedItems.length);
        setTotalPages(1);
      }
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
      // Fallback to cache
      try {
        const cachedItems = await db.inventoryItems.where('organization_id').equals(currentOrg.id).toArray();
        if (cachedItems.length > 0) {
          setItems(cachedItems);
          setTotalItems(cachedItems.length);
          setTotalPages(1);
        }
      } catch (cacheError) {
        console.error('[Inventory] Cache fallback failed:', cacheError);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    if (!isOnline) return; // Stats require server calculation
    try {
      const response = await axios.get(`${API}/inventory/stats/summary?organization_id=${currentOrg.id}`);
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      if (isOnline) {
        const response = await axios.get(`${API}/inventory-categories?organization_id=${currentOrg.id}`);
        setCategories(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const fetchSuppliers = async () => {
    try {
      if (isOnline) {
        const response = await axios.get(`${API}/inventory-suppliers?organization_id=${currentOrg.id}`);
        setSuppliers(response.data);
        
        // Cache suppliers
        try {
          const suppliersToCache = response.data.map(s => ({ ...s, organization_id: currentOrg.id }));
          await db.suppliers.bulkPut(suppliersToCache);
        } catch (e) {}
      } else {
        const cachedSuppliers = await db.suppliers.where('organization_id').equals(currentOrg.id).toArray();
        setSuppliers(cachedSuppliers);
      }
    } catch (error) {
      console.error('Failed to fetch suppliers:', error);
    }
  };

  const fetchCurrencies = async () => {
    try {
      if (isOnline) {
        const response = await axios.get(`${API}/currencies/active`);
        setCurrencies(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch currencies:', error);
    }
  };

  // Category CRUD
  const handleSaveCategory = async () => {
    try {
      if (editingCategory) {
        await axios.put(`${API}/inventory-categories/${editingCategory.id}`, categoryForm);
      } else {
        await axios.post(`${API}/inventory-categories`, {
          ...categoryForm,
          organization_id: currentOrg.id
        });
      }
      setCategoryDialogOpen(false);
      setCategoryForm({ name: '', name_ar: '', description: '' });
      setEditingCategory(null);
      fetchCategories();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save category');
    }
  };

  // Quick create category inline
  const handleQuickCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    setCreatingCategory(true);
    try {
      const response = await axios.post(`${API}/inventory-categories`, {
        name: newCategoryName.trim(),
        organization_id: currentOrg.id
      });
      await fetchCategories();
      // Set the newly created category as selected
      setFormData({ ...formData, category_id: response.data.id });
      setNewCategoryName('');
      setShowNewCategoryInput(false);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to create category');
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteCategoryConfirm) return;
    try {
      await axios.delete(`${API}/inventory-categories/${deleteCategoryConfirm.id}`);
      setDeleteCategoryConfirm(null);
      fetchCategories();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete category');
    }
  };

  const openEditCategory = (cat) => {
    setEditingCategory(cat);
    setCategoryForm({ name: cat.name, name_ar: cat.name_ar || '', description: cat.description || '' });
    setCategoryDialogOpen(true);
  };

  // Barcode Spider Lookup
  const handleBarcodeLookup = async () => {
    const barcode = formData.barcode?.trim();
    if (!barcode) {
      alert('Please enter a barcode first');
      return;
    }
    
    setBarcodeLookupLoading(true);
    setBarcodeLookupResult(null);
    setPendingImageUrl(null);
    
    try {
      const response = await axios.get(`${API}/barcode-lookup/${barcode}`);
      const data = response.data;
      
      if (data.found) {
        setBarcodeLookupResult(data);
        
        // Store image URL if available
        if (data.image) {
          setPendingImageUrl(data.image);
        }
        
        // Auto-fill form fields with lookup results
        setFormData(prev => ({
          ...prev,
          name: data.name || prev.name,
          description: data.description || data.raw_attributes?.description || prev.description,
        }));
        
        // Show success message with product info
        const hasImage = data.image ? '\n✓ Product image found!' : '';
        alert(`Found: ${data.name}\nBrand: ${data.brand || 'N/A'}\nCategory: ${data.category || 'N/A'}${hasImage}\n\nProduct details have been auto-filled.`);
      } else {
        alert(`Product not found: ${data.message || 'No results for this barcode'}`);
      }
    } catch (error) {
      console.error('Barcode lookup error:', error);
      alert(error.response?.data?.detail || 'Failed to lookup barcode. Please try again.');
    } finally {
      setBarcodeLookupLoading(false);
    }
  };
  
  // Upload image from URL (for barcode lookup results)
  const uploadImageFromUrl = async (itemId, imageUrl) => {
    try {
      await axios.post(`${API}/inventory/${itemId}/upload-image-from-url?image_url=${encodeURIComponent(imageUrl)}`);
      return true;
    } catch (error) {
      console.error('Failed to upload image from URL:', error);
      return false;
    }
  };

  // Image handling
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !imageItem) return;
    
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      await axios.post(`${API}/inventory/${imageItem.id}/upload-image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      fetchInventory();
      setImageDialogOpen(false);
      setImageItem(null);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGenerateAIImage = async () => {
    if (!imageItem) return;
    
    setGeneratingAI(true);
    try {
      await axios.post(`${API}/inventory/${imageItem.id}/generate-ai-image`);
      fetchInventory();
      setImageDialogOpen(false);
      setImageItem(null);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to generate AI image');
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleFetchWebImage = async () => {
    if (!imageItem) return;
    
    setFetchingWeb(true);
    try {
      const response = await axios.post(`${API}/inventory/${imageItem.id}/fetch-web-image`);
      if (response.data.found) {
        fetchInventory();
        setImageDialogOpen(false);
        setImageItem(null);
      } else {
        alert(response.data.message);
      }
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to fetch image from web');
    } finally {
      setFetchingWeb(false);
    }
  };

  const handleDeleteImage = async () => {
    if (!imageItem) return;
    
    try {
      await axios.delete(`${API}/inventory/${imageItem.id}/image`);
      fetchInventory();
      setImageDialogOpen(false);
      setImageItem(null);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete image');
    }
  };

  // Fetch inventory movements for an item
  const fetchMovements = async (item) => {
    setMovementItem(item);
    setMovementDialogOpen(true);
    setLoadingMovements(true);
    
    try {
      const response = await axios.get(`${API}/inventory/${item.id}/movements`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setMovements(response.data.movements || []);
    } catch (error) {
      console.error('Error fetching movements:', error);
      alert(error.response?.data?.detail || 'Failed to fetch movement history');
      setMovements([]);
    } finally {
      setLoadingMovements(false);
    }
  };

  // Print movement history
  const printMovements = () => {
    if (!movementItem || movements.length === 0) return;
    
    // Helper function for date formatting in print
    const formatPrintDate = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    };
    
    const todayFormatted = formatPrintDate(new Date().toISOString());
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Inventory Movement - ${movementItem.name}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
          h1 { font-size: 16px; margin-bottom: 5px; }
          .subtitle { color: #666; font-size: 12px; margin-bottom: 15px; }
          .item-info { background: #f5f5f5; padding: 10px; margin-bottom: 15px; display: flex; gap: 30px; }
          .item-info span { display: block; }
          .item-info .label { font-weight: bold; color: #666; font-size: 10px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #f0f0f0; font-weight: bold; font-size: 10px; }
          .number { text-align: right; font-family: monospace; }
          .in { color: green; }
          .out { color: red; }
          .balance { font-weight: bold; }
          .footer { margin-top: 15px; font-size: 10px; color: #666; }
          @media print { body { margin: 10px; } }
        </style>
      </head>
      <body>
        <h1>Inventory Movement History</h1>
        <div class="subtitle">${currentOrg?.name || 'Organization'} - Printed on ${todayFormatted}</div>
        
        <div class="item-info">
          <div>
            <span class="label">Item Name</span>
            <span>${movementItem.name}</span>
          </div>
          ${movementItem.barcode ? `<div><span class="label">Barcode</span><span>${movementItem.barcode}</span></div>` : ''}
          <div>
            <span class="label">Current QH</span>
            <span>${movementItem.on_hand_qty || 0}</span>
          </div>
          <div>
            <span class="label">Cost</span>
            <span>$${formatUSD(movementItem.cost || 0)}</span>
          </div>
          <div>
            <span class="label">Price</span>
            <span>$${formatUSD(movementItem.price || 0)}</span>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th style="width: 80px;">Date</th>
              <th style="width: 100px;">Document</th>
              <th>Description</th>
              <th class="number" style="width: 60px;">In</th>
              <th class="number" style="width: 60px;">Out</th>
              <th class="number" style="width: 80px;">Price</th>
              <th class="number" style="width: 80px;">Cost</th>
              <th class="number" style="width: 70px;">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${movements.map(m => {
              return `
                <tr>
                  <td>${formatPrintDate(m.date)}</td>
                  <td>${m.document_number || '-'}</td>
                  <td>${m.description}</td>
                  <td class="number in">${m.qty_in > 0 ? m.qty_in : '-'}</td>
                  <td class="number out">${m.qty_out > 0 ? m.qty_out : '-'}</td>
                  <td class="number">$${formatUSD(m.unit_price || 0)}</td>
                  <td class="number">$${formatUSD(m.cost || 0)}</td>
                  <td class="number balance">${m.balance}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <div class="footer">
          Total Movements: ${movements.length} | 
          Total In: ${movements.reduce((sum, m) => sum + (m.qty_in || 0), 0)} | 
          Total Out: ${movements.reduce((sum, m) => sum + (m.qty_out || 0), 0)} |
          Final Balance: ${movements.length > 0 ? movements[movements.length - 1].balance : 0}
        </div>
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  // View related invoice - navigate to the relevant page with view parameter
  const viewRelatedInvoice = (movement) => {
    if (!movement.document_id) return;
    
    // Close dialog
    setMovementDialogOpen(false);
    setMovementItem(null);
    setMovements([]);
    
    // Navigate based on document type with view parameter
    if (movement.type === 'sale' || movement.type === 'used') {
      window.location.href = `/sales-invoices?view=${movement.document_id}`;
    } else if (movement.type === 'purchase') {
      window.location.href = `/purchase-invoices?view=${movement.document_id}`;
    } else if (movement.type === 'pos') {
      window.location.href = `/pos?view=${movement.document_id}`;
    }
  };

  const resetForm = () => {
    setFormData({
      barcode: '',
      sku: '',
      moh_code: '',
      name: '',
      name_ar: '',
      category_id: '',
      supplier_id: '',
      cost: '',
      price: '',
      currency: 'USD',
      min_qty: '',
      on_hand_qty: '',
      unit: 'piece',
      expiry_date: '',
      description: '',
      is_taxable: true,
      is_active: true,
      is_pos_item: false,
      show_image_in_pos: true
    });
    setEditingItem(null);
  };

  const handleOpenDialog = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        barcode: item.barcode || '',
        sku: item.sku || '',
        moh_code: item.moh_code || '',
        name: item.name,
        name_ar: item.name_ar || '',
        category_id: item.category_id || '',
        supplier_id: item.supplier_id || '',
        cost: item.cost?.toString() || '',
        price: item.price?.toString() || '',
        currency: item.currency || 'USD',
        min_qty: item.min_qty?.toString() || '',
        on_hand_qty: item.on_hand_qty?.toString() || '',
        unit: item.unit || 'piece',
        expiry_date: item.expiry_date || '',
        description: item.description || '',
        is_taxable: item.is_taxable !== false,
        is_active: item.is_active,
        is_pos_item: item.is_pos_item || false,
        show_image_in_pos: item.show_image_in_pos !== false
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const payload = {
      ...formData,
      cost: parseFloat(formData.cost) || 0,
      price: parseFloat(formData.price) || 0,
      min_qty: parseFloat(formData.min_qty) || 0,
      on_hand_qty: parseFloat(formData.on_hand_qty) || 0,
      category_id: formData.category_id || null,
      supplier_id: formData.supplier_id || null,
      expiry_date: formData.expiry_date || null,
      organization_id: currentOrg.id
    };

    try {
      let itemId;
      if (editingItem) {
        await axios.put(`${API}/inventory/${editingItem.id}`, payload);
        itemId = editingItem.id;
      } else {
        const response = await axios.post(`${API}/inventory`, payload);
        itemId = response.data.id;
      }
      
      // If there's a pending image from barcode lookup, upload it
      if (pendingImageUrl && itemId && !editingItem) {
        try {
          await uploadImageFromUrl(itemId, pendingImageUrl);
        } catch (imgError) {
          console.error('Failed to upload barcode image:', imgError);
          // Don't fail the whole operation if image upload fails
        }
      }
      
      setIsDialogOpen(false);
      resetForm();
      setPendingImageUrl(null);
      setBarcodeLookupResult(null);
      fetchInventory();
      fetchStats();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save item');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await axios.delete(`${API}/inventory/${deleteConfirm.id}`);
      setDeleteConfirm(null);
      fetchInventory();
      fetchStats();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete item');
    }
  };

  const handleAdjustQuantity = async () => {
    if (!adjustQtyItem || !adjustmentValue) return;
    
    try {
      await axios.post(`${API}/inventory/${adjustQtyItem.id}/adjust-quantity`, null, {
        params: {
          adjustment: parseFloat(adjustmentValue),
          reason: adjustmentReason
        }
      });
      setAdjustQtyItem(null);
      setAdjustmentValue('');
      setAdjustmentReason('');
      fetchInventory();
      fetchStats();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to adjust quantity');
    }
  };

  // CSV Import handlers
  const handleCsvFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setCsvFile(file);
    
    // Preview the CSV
    const formData = new FormData();
    formData.append('file', file);
    formData.append('organization_id', currentOrg.id);
    
    try {
      const response = await axios.post(`${API}/inventory/csv/preview`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setCsvPreview(response.data);
      setCsvMappings(response.data.auto_mappings || {});
      setCsvSupplierStartCode(response.data.next_supplier_code || '21201');
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to preview CSV');
      setCsvFile(null);
    }
  };

  const handleCsvImport = async () => {
    if (!csvFile || !csvPreview) return;
    
    setCsvImporting(true);
    
    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('organization_id', currentOrg.id);
    formData.append('field_mappings', JSON.stringify(csvMappings));
    formData.append('create_categories', csvCreateCategories);
    formData.append('create_suppliers', csvCreateSuppliers);
    formData.append('supplier_start_code', csvSupplierStartCode);
    
    try {
      const response = await axios.post(`${API}/inventory/csv/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const results = response.data;
      let message = `Import complete!\n\nCreated: ${results.created}\nUpdated: ${results.updated}\nSkipped: ${results.skipped}`;
      
      if (results.new_categories?.length > 0) {
        message += `\n\nNew categories created: ${results.new_categories.join(', ')}`;
      }
      if (results.new_suppliers?.length > 0) {
        message += `\n\nNew suppliers created:\n${results.new_suppliers.map(s => `${s.name} (${s.code})`).join('\n')}`;
      }
      if (results.errors?.length > 0) {
        message += `\n\nErrors (first 5):\n${results.errors.slice(0, 5).join('\n')}`;
      }
      
      alert(message);
      setCsvDialogOpen(false);
      setCsvFile(null);
      setCsvPreview(null);
      setCsvMappings({});
      fetchInventory();
      fetchCategories();
      fetchSuppliers();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to import CSV');
    } finally {
      setCsvImporting(false);
    }
  };

  // DBF Import handlers
  const handleDbfFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.dbf')) {
      alert('Please select a .dbf file');
      return;
    }
    
    setDbfFile(file);
    setDbfImportResult(null);
    setDbfFieldMapping({});
    
    // Preview DBF file
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/inventory/preview-dbf`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setDbfPreview(response.data);
      setDbfStep(2); // Move to mapping step
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to preview DBF file');
      setDbfFile(null);
    }
  };

  const handleDbfFieldMappingChange = (inventoryField, dbfField) => {
    setDbfFieldMapping(prev => {
      const newMapping = { ...prev };
      if (dbfField === '' || dbfField === null) {
        delete newMapping[inventoryField];
      } else {
        newMapping[inventoryField] = dbfField;
      }
      return newMapping;
    });
  };

  const handleDbfImport = async () => {
    if (!dbfFile) return;
    
    // Validate at least name field is mapped
    if (!dbfFieldMapping.name) {
      alert('Please map at least the "Name" field to proceed with import.');
      return;
    }
    
    setDbfImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', dbfFile);
      formData.append('field_mapping', JSON.stringify(dbfFieldMapping));
      formData.append('create_suppliers', dbfCreateSuppliers);
      formData.append('supplier_parent_code', dbfSupplierParentCode);
      formData.append('update_existing', dbfUpdateExisting);
      
      const response = await axios.post(`${API}/inventory/import-dbf?organization_id=${currentOrg.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000  // 10 minutes timeout for large imports
      });
      
      setDbfImportResult(response.data);
      setDbfStep(3); // Move to result step
      fetchInventory();
      fetchCategories();
      fetchSuppliers();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to import DBF file');
    } finally {
      setDbfImporting(false);
    }
  };

  const handleCloseDbfDialog = () => {
    setDbfDialogOpen(false);
    setDbfFile(null);
    setDbfPreview(null);
    setDbfImportResult(null);
    setDbfFieldMapping({});
    setDbfStep(1);
    setDbfCreateSuppliers(true);
    setDbfSupplierParentCode('401');
    if (dbfInputRef.current) {
      dbfInputRef.current.value = '';
    }
  };

  // Fetch supplier parent accounts for the dropdown
  const fetchSupplierAccounts = async () => {
    try {
      const response = await axios.get(`${API}/accounts?organization_id=${currentOrg.id}`);
      // Filter accounts that can be parent accounts for suppliers (typically liability accounts starting with 4)
      const parentAccounts = response.data.filter(acc => 
        acc.account_class === 4 || acc.code?.startsWith('4') || acc.code?.startsWith('2')
      );
      setSupplierAccounts(parentAccounts);
    } catch (error) {
      console.error('Failed to fetch supplier accounts:', error);
    }
  };

  useEffect(() => {
    if (currentOrg && dbfDialogOpen) {
      fetchSupplierAccounts();
    }
  }, [currentOrg, dbfDialogOpen]);

  const getSampleValueForField = (fieldName) => {
    if (!dbfPreview?.sample_data?.length) return '';
    const firstRecord = dbfPreview.sample_data[0];
    const value = firstRecord[fieldName];
    return value !== null && value !== undefined ? String(value) : '';
  };

  // Batch management handlers
  const handleOpenBatchDialog = (item) => {
    setBatchItem(item);
    setBatchDialogOpen(true);
  };

  const handleAddBatch = async () => {
    if (!batchItem || !newBatch.batch_number || !newBatch.quantity) {
      alert('Please fill in batch number and quantity');
      return;
    }
    
    try {
      await axios.post(`${API}/inventory/${batchItem.id}/batches`, {
        batch_number: newBatch.batch_number,
        quantity: parseFloat(newBatch.quantity),
        expiry_date: newBatch.expiry_date || null,
        cost: newBatch.cost ? parseFloat(newBatch.cost) : null,
        notes: newBatch.notes || null
      });
      
      setNewBatch({ batch_number: '', expiry_date: '', quantity: '', cost: '', notes: '' });
      
      // Refresh item data
      const response = await axios.get(`${API}/inventory/${batchItem.id}`);
      setBatchItem(response.data);
      fetchInventory();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to add batch';
      alert(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg);
    }
  };

  const handleDeleteBatch = async (batchId) => {
    if (!confirm('Are you sure you want to delete this batch?')) return;
    
    try {
      await axios.delete(`${API}/inventory/${batchItem.id}/batches/${batchId}`);
      
      // Refresh item data
      const response = await axios.get(`${API}/inventory/${batchItem.id}`);
      setBatchItem(response.data);
      fetchInventory();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete batch');
    }
  };

  // Filtered categories and suppliers for searchable dropdowns
  const filteredCategories = useMemo(() => {
    if (!categorySearch) return categories;
    const search = categorySearch.toLowerCase();
    return categories.filter(cat =>
      cat.name.toLowerCase().includes(search) ||
      (cat.name_ar && cat.name_ar.includes(categorySearch))
    );
  }, [categories, categorySearch]);

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch) return suppliers;
    const search = supplierSearch.toLowerCase();
    return suppliers.filter(sup =>
      sup.name.toLowerCase().includes(search) ||
      sup.code.toLowerCase().includes(search) ||
      (sup.name_ar && sup.name_ar.includes(supplierSearch))
    );
  }, [suppliers, supplierSearch]);

  // Filtered and sorted items
  const filteredItems = useMemo(() => {
    let result = [...items];
    
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter(item =>
        item.name.toLowerCase().includes(search) ||
        item.barcode?.toLowerCase().includes(search) ||
        item.name_ar?.includes(searchTerm)
      );
    }
    
    // Category and supplier filtering done server-side
    
    if (filterStock === 'low') {
      result = result.filter(item => item.on_hand_qty <= item.min_qty);
    } else if (filterStock === 'expiring') {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() + 30);
      const thresholdStr = threshold.toISOString().split('T')[0];
      result = result.filter(item => item.expiry_date && item.expiry_date <= thresholdStr);
    }
    
    result.sort((a, b) => {
      let valA, valB;
      switch (sortBy) {
        case 'name': valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
        case 'barcode': valA = a.barcode || ''; valB = b.barcode || ''; break;
        case 'cost': valA = a.cost; valB = b.cost; break;
        case 'price': valA = a.price; valB = b.price; break;
        case 'on_hand_qty': valA = a.on_hand_qty; valB = b.on_hand_qty; break;
        case 'expiry_date': valA = a.expiry_date || '9999-12-31'; valB = b.expiry_date || '9999-12-31'; break;
        default: valA = a.name.toLowerCase(); valB = b.name.toLowerCase();
      }
      return sortOrder === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
    
    return result;
  }, [items, searchTerm, filterCategory, filterSupplier, filterStock, sortBy, sortOrder]);

  const canEdit = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'accountant';
  const canDelete = user?.role === 'super_admin' || user?.role === 'admin';

  const isLowStock = (item) => item.on_hand_qty <= item.min_qty;
  const isExpiringSoon = (item) => {
    if (!item.expiry_date) return false;
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + 30);
    return new Date(item.expiry_date) <= threshold;
  };

  // Get image URL - prioritize S3 URL, fall back to local
  const getImageUrl = (item) => {
    if (item.image_url) {
      return item.image_url; // S3 URL
    }
    if (item.image_filename) {
      return `${API}/inventory/image/${item.image_filename}`; // Local file
    }
    return null;
  };

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6" data-testid="inventory-page">
      {/* Offline Banner */}
      <OfflineBanner />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Inventory Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage stock items for supermarket/pharmacy
          </p>
        </div>
        
        <div className="flex gap-2">
          {canEdit && (
            <>
              <Button variant="outline" onClick={() => { setCategoryForm({ name: '', name_ar: '', description: '' }); setEditingCategory(null); setCategoryDialogOpen(true); }}>
                <Tag className="w-4 h-4 mr-2" />
                Categories
              </Button>
              <Button variant="outline" onClick={() => { setCsvDialogOpen(true); setCsvFile(null); setCsvPreview(null); }}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Import CSV
              </Button>
              <Button variant="outline" onClick={() => { setDbfDialogOpen(true); setDbfFile(null); setDbfPreview(null); setDbfImportResult(null); }}>
                <Database className="w-4 h-4 mr-2" />
                Import DBF
              </Button>
              <Button className="btn-glow" onClick={() => handleOpenDialog()} data-testid="add-item-btn">
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 lg:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded">
                  <Package className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total_items}</p>
                  <p className="text-xs text-muted-foreground">Total Items</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-3 lg:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-400">{stats.low_stock_items}</p>
                  <p className="text-xs text-muted-foreground">Low Stock</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-3 lg:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded">
                  <Calendar className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-400">{stats.expiring_items}</p>
                  <p className="text-xs text-muted-foreground">Expiring Soon</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-3 lg:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-400">${formatUSD(stats.total_retail_value)}</p>
                  <p className="text-xs text-muted-foreground">Stock Value</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, barcode, or Arabic name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[160px]">
                  <Tag className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.cat_id || cat.id} value={cat.cat_id || cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                <SelectTrigger className="w-[160px]">
                  <Truck className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map(sup => (
                    <SelectItem key={sup.code || sup.id} value={sup.code || sup.id}>{sup.code} - {sup.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={filterStock} onValueChange={setFilterStock}>
                <SelectTrigger className="w-[130px]">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Stock" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Items</SelectItem>
                  <SelectItem value="low">Low Stock</SelectItem>
                  <SelectItem value="expiring">Expiring Soon</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[120px]">
                  <ArrowUpDown className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="barcode">Barcode</SelectItem>
                  <SelectItem value="cost">Cost</SelectItem>
                  <SelectItem value="price">Price</SelectItem>
                  <SelectItem value="on_hand_qty">Quantity</SelectItem>
                  <SelectItem value="expiry_date">Expiry</SelectItem>
                </SelectContent>
              </Select>
              
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                <ArrowUpDown className={`w-4 h-4 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base lg:text-lg flex items-center gap-2">
            <Package className="w-5 h-5" />
            Inventory Items ({filteredItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="spinner" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No inventory items found</p>
              <p className="text-xs mt-2">Add your first item to get started</p>
            </div>
          ) : (
            <>
              {/* Mobile View */}
              <div className="lg:hidden space-y-3">
                {filteredItems.map((item) => (
                  <div 
                    key={item.id} 
                    className={`p-3 bg-muted/20 rounded-sm border ${
                      isLowStock(item) ? 'border-amber-500/50' : isExpiringSoon(item) ? 'border-red-500/50' : 'border-border'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Thumbnail */}
                      <div 
                        className="w-12 h-12 bg-muted/50 rounded flex-shrink-0 flex items-center justify-center overflow-hidden cursor-pointer"
                        onClick={() => { setImageItem(item); setImageDialogOpen(true); }}
                      >
                        {(item.image_url || item.image_filename) ? (
                          <img src={getImageUrl(item)} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <Image className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        {item.barcode && (
                          <span className="font-mono text-xs text-cyan-400">{item.barcode}</span>
                        )}
                        <h3 className="font-medium truncate">{item.name}</h3>
                        {item.name_ar && (
                          <p className="text-xs text-muted-foreground truncate" dir="rtl">{item.name_ar}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {/* History button - always visible */}
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-cyan-400" onClick={() => fetchMovements(item)} title="Movement History">
                          <History className="w-3 h-3" />
                        </Button>
                        {canEdit && (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setAdjustQtyItem(item)} title="Adjust Qty">
                              <BarChart3 className="w-3 h-3" />
                            </Button>
                            {currentOrg?.enable_expiry_tracking && (
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-purple-400" onClick={() => handleOpenBatchDialog(item)} title="Manage Batches">
                                <Layers className="w-3 h-3" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleOpenDialog(item)} title="Edit">
                              <Edit className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400" onClick={() => setDeleteConfirm(item)} title="Delete">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-2 pt-2 border-t border-border/50 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Cost:</span>
                        <span className="ml-1 font-mono">{item.currency} {formatUSD(item.cost)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Price:</span>
                        <span className="ml-1 font-mono">{item.currency} {formatUSD(item.price)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Qty:</span>
                        <span className={`ml-1 font-mono ${isLowStock(item) ? 'text-amber-400' : ''}`}>
                          {item.on_hand_qty} {item.unit}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-14">Image</th>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Supplier</th>
                      <th className="text-right">Cost</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">On Hand</th>
                      <th className="text-center">Tax</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.id} className={isLowStock(item) || isExpiringSoon(item) ? 'bg-amber-500/5' : ''}>
                        <td>
                          <div 
                            className="w-10 h-10 bg-muted/50 rounded flex items-center justify-center overflow-hidden cursor-pointer"
                            onClick={() => { setImageItem(item); setImageDialogOpen(true); }}
                          >
                            {(item.image_url || item.image_filename) ? (
                              <img src={getImageUrl(item)} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <Image className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="space-y-0.5">
                            {item.item_code && <span className="font-mono text-xs text-blue-600 block">{item.item_code}</span>}
                            {item.barcode && <span className="font-mono text-xs text-muted-foreground block">{item.barcode}</span>}
                            {!item.item_code && !item.barcode && <span className="text-muted-foreground">-</span>}
                          </div>
                        </td>
                        <td>
                          <div>
                            <p className="font-medium">{item.name}</p>
                            {item.name_ar && (
                              <p className="text-xs text-muted-foreground" dir="rtl">{item.name_ar}</p>
                            )}
                          </div>
                        </td>
                        <td className="text-muted-foreground text-sm">{item.category_name || '-'}</td>
                        <td className="text-muted-foreground text-sm">{item.supplier_name || '-'}</td>
                        <td className="text-right font-mono">{item.currency} {formatUSD(item.cost)}</td>
                        <td className="text-right font-mono">{item.currency} {formatUSD(item.price)}</td>
                        <td className={`text-right font-mono ${isLowStock(item) ? 'text-amber-400 font-bold' : ''}`}>
                          {item.on_hand_qty} {item.unit}
                        </td>
                        <td className="text-center">
                          {item.is_taxable !== false ? (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Yes</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-zinc-500/20 text-zinc-400 border border-zinc-500/30">No</span>
                          )}
                        </td>
                        <td>
                          <div className="flex gap-1">
                            {/* History button - always visible */}
                            <Button variant="ghost" size="sm" className="text-cyan-400" onClick={() => fetchMovements(item)} title="Movement History">
                              <History className="w-3 h-3" />
                            </Button>
                            {canEdit && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => { setImageItem(item); setImageDialogOpen(true); }} title="Manage Image">
                                  <Image className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setAdjustQtyItem(item)} title="Adjust Quantity">
                                  <BarChart3 className="w-3 h-3" />
                                </Button>
                                {currentOrg?.enable_expiry_tracking && (
                                  <Button variant="ghost" size="sm" className="text-purple-400" onClick={() => handleOpenBatchDialog(item)} title="Manage Batches">
                                    <Layers className="w-3 h-3" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(item)} title="Edit">
                                  <Edit className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                            {canDelete && (
                              <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setDeleteConfirm(item)} title="Delete">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalItems)} of {totalItems} items
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => fetchInventory(1)} 
                      disabled={currentPage === 1 || loading}
                    >
                      First
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => fetchInventory(currentPage - 1)} 
                      disabled={currentPage === 1 || loading}
                    >
                      Previous
                    </Button>
                    <span className="px-3 py-1 text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => fetchInventory(currentPage + 1)} 
                      disabled={currentPage === totalPages || loading}
                    >
                      Next
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => fetchInventory(totalPages)} 
                      disabled={currentPage === totalPages || loading}
                    >
                      Last
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Total count when single page */}
              {totalPages <= 1 && totalItems > 0 && (
                <div className="px-4 py-2 border-t text-sm text-muted-foreground">
                  Total: {totalItems} items
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Item Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { resetForm(); setShowNewCategoryInput(false); setNewCategoryName(''); } }}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Edit Inventory Item' : 'Add Inventory Item'}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  Item Code
                </Label>
                <Input
                  placeholder="e.g., 1, 2, 3..."
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Name (English) *</Label>
                <Input
                  placeholder="Item name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Name (Arabic)</Label>
                <Input
                  placeholder="اسم المنتج"
                  value={formData.name_ar}
                  onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })}
                  dir="rtl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  Category
                </Label>
                {showNewCategoryInput ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="New category name..."
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleQuickCreateCategory();
                        } else if (e.key === 'Escape') {
                          setShowNewCategoryInput(false);
                          setNewCategoryName('');
                        }
                      }}
                      autoFocus
                      className="flex-1"
                    />
                    <Button 
                      type="button" 
                      size="icon" 
                      onClick={handleQuickCreateCategory}
                      disabled={creatingCategory || !newCategoryName.trim()}
                    >
                      {creatingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </Button>
                    <Button 
                      type="button" 
                      size="icon" 
                      variant="ghost"
                      onClick={() => { setShowNewCategoryInput(false); setNewCategoryName(''); }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Select value={formData.category_id || 'none'} onValueChange={(v) => {
                    if (v === 'create_new') {
                      setShowNewCategoryInput(true);
                    } else {
                      setFormData({ ...formData, category_id: v === 'none' ? '' : v });
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2">
                        <Input 
                          placeholder="Search categories..." 
                          value={categorySearch}
                          onChange={(e) => setCategorySearch(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <SelectItem value="create_new" className="text-primary font-medium">
                        <span className="flex items-center gap-2">
                          <Plus className="w-3 h-3" />
                          Create New Category
                        </span>
                      </SelectItem>
                      <SelectItem value="none">No Category</SelectItem>
                      {filteredCategories.map(cat => (
                        <SelectItem key={cat.cat_id || cat.id} value={cat.cat_id || cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Truck className="w-3 h-3" />
                  Supplier
                </Label>
                <Select value={formData.supplier_id || 'none'} onValueChange={(v) => setFormData({ ...formData, supplier_id: v === 'none' ? '' : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-2">
                      <Input 
                        placeholder="Search suppliers..." 
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <SelectItem value="none">No Supplier</SelectItem>
                    {filteredSuppliers.map(sup => (
                      <SelectItem key={sup.code || sup.id} value={sup.code || sup.id}>{sup.code} - {sup.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label>Cost *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Price *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="LBP">LBP</SelectItem>
                    {currencies.filter(c => !['USD', 'LBP'].includes(c.code)).map(curr => (
                      <SelectItem key={curr.id} value={curr.code}>{curr.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>On Hand Qty</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={formData.on_hand_qty}
                  onChange={(e) => setFormData({ ...formData, on_hand_qty: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Min Qty (Alert)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={formData.min_qty}
                  onChange={(e) => setFormData({ ...formData, min_qty: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Additional details..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="flex items-center space-x-2 py-2">
              <Checkbox
                id="is_taxable"
                checked={formData.is_taxable}
                onCheckedChange={(checked) => setFormData({ ...formData, is_taxable: checked })}
              />
              <Label htmlFor="is_taxable" className="flex items-center gap-2 cursor-pointer">
                <Receipt className="w-4 h-4 text-muted-foreground" />
                Subject to Tax
              </Label>
            </div>

            {/* POS Quick Item Settings */}
            <div className="border-t pt-4 mt-2">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-cyan-400" />
                POS Quick Item Settings
              </h4>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_pos_item"
                    checked={formData.is_pos_item}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_pos_item: checked })}
                  />
                  <Label htmlFor="is_pos_item" className="cursor-pointer text-sm">
                    Show in POS Quick Items
                  </Label>
                </div>
                {formData.is_pos_item && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="show_image_in_pos"
                      checked={formData.show_image_in_pos}
                      onCheckedChange={(checked) => setFormData({ ...formData, show_image_in_pos: checked })}
                    />
                    <Label htmlFor="show_image_in_pos" className="cursor-pointer text-sm">
                      Display Image in POS
                    </Label>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit">
                {editingItem ? 'Update Item' : 'Add Item'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Category Management Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="list" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="list">Categories</TabsTrigger>
              <TabsTrigger value="add">{editingCategory ? 'Edit' : 'Add New'}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="list" className="space-y-3 mt-4">
              {categories.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No categories yet. Add one!</p>
              ) : (
                categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between p-3 bg-muted/30 rounded">
                    <div>
                      <p className="font-medium">{cat.name}</p>
                      {cat.name_ar && <p className="text-xs text-muted-foreground">{cat.name_ar}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditCategory(cat)}>
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setDeleteCategoryConfirm(cat)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
            
            <TabsContent value="add" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Category Name *</Label>
                <Input
                  placeholder="e.g., Pharmaceuticals"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Arabic Name</Label>
                <Input
                  placeholder="الأدوية"
                  value={categoryForm.name_ar}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name_ar: e.target.value })}
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Category description..."
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  rows={2}
                />
              </div>
              <Button onClick={handleSaveCategory} disabled={!categoryForm.name} className="w-full">
                {editingCategory ? 'Update Category' : 'Add Category'}
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Delete Category Confirmation */}
      <Dialog open={!!deleteCategoryConfirm} onOpenChange={() => setDeleteCategoryConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteCategoryConfirm?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCategoryConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteCategory}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Management Dialog */}
      <Dialog open={imageDialogOpen} onOpenChange={(open) => { setImageDialogOpen(open); if (!open) setImageItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Product Image</DialogTitle>
            <DialogDescription>
              {imageItem?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Current Image */}
            <div className="w-full h-48 bg-muted/30 rounded flex items-center justify-center overflow-hidden">
              {(imageItem?.image_url || imageItem?.image_filename) ? (
                <img 
                  src={getImageUrl(imageItem)} 
                  alt={imageItem?.name} 
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="text-center text-muted-foreground">
                  <Image className="w-12 h-12 mx-auto mb-2" />
                  <p className="text-sm">No image</p>
                </div>
              )}
            </div>
            
            {/* Action Buttons */}
            <div className="grid grid-cols-1 gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
              
              <Button 
                variant="outline" 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
              >
                {uploadingImage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Upload Image
              </Button>
              
              <Button 
                variant="outline" 
                onClick={handleFetchWebImage}
                disabled={fetchingWeb}
                title="Search by barcode, name, or description"
              >
                {fetchingWeb ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
                Fetch from Web
              </Button>
              
              <Button 
                variant="outline" 
                onClick={handleGenerateAIImage}
                disabled={generatingAI}
              >
                {generatingAI ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Generate AI Image
              </Button>
              
              {(imageItem?.image_url || imageItem?.image_filename) && (
                <Button variant="destructive" onClick={handleDeleteImage}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove Image
                </Button>
              )}
            </div>
            
            {generatingAI && (
              <p className="text-xs text-center text-muted-foreground">
                AI generation may take up to 60 seconds...
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Item Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Quantity Dialog */}
      <Dialog open={!!adjustQtyItem} onOpenChange={() => { setAdjustQtyItem(null); setAdjustmentValue(''); setAdjustmentReason(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Quantity</DialogTitle>
            <DialogDescription>
              Adjust stock for <strong>{adjustQtyItem?.name}</strong>
              <br />
              Current: {adjustQtyItem?.on_hand_qty} {adjustQtyItem?.unit}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Adjustment (+ to add, - to subtract)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g., 10 or -5"
                value={adjustmentValue}
                onChange={(e) => setAdjustmentValue(e.target.value)}
              />
              {adjustmentValue && (
                <p className="text-sm text-muted-foreground">
                  New quantity will be: {(adjustQtyItem?.on_hand_qty || 0) + parseFloat(adjustmentValue || 0)} {adjustQtyItem?.unit}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input
                placeholder="e.g., Stock received, Damaged goods"
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setAdjustQtyItem(null); setAdjustmentValue(''); setAdjustmentReason(''); }}>
              Cancel
            </Button>
            <Button onClick={handleAdjustQuantity} disabled={!adjustmentValue}>
              Apply Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-green-400" />
              Import Inventory from CSV
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file to import inventory items. The system will auto-detect columns.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* File Upload */}
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept=".csv"
                ref={csvInputRef}
                onChange={handleCsvFileSelect}
                className="hidden"
              />
              <Button variant="outline" onClick={() => csvInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                {csvFile ? 'Change File' : 'Select CSV File'}
              </Button>
              {csvFile && (
                <span className="text-sm text-muted-foreground">
                  {csvFile.name} ({csvPreview?.total_rows || 0} rows)
                </span>
              )}
            </div>
            
            {csvPreview && (
              <>
                {/* Field Mappings */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <ChevronRight className="w-4 h-4" />
                    Field Mappings
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Match your CSV columns to inventory fields. Auto-detected mappings are pre-filled.
                  </p>
                  
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {['name', 'name_ar', 'barcode', 'category', 'supplier', 'cost', 'price', 'quantity', 'unit', 'min_qty', 'expiry_date', 'batch_number'].map(field => (
                      <div key={field} className="space-y-1">
                        <Label className="text-xs capitalize">{field.replace('_', ' ')}</Label>
                        <Select
                          value={csvMappings[field] || ''}
                          onValueChange={(v) => setCsvMappings({ ...csvMappings, [field]: v })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">-- Not mapped --</SelectItem>
                            {csvPreview.headers.map(h => (
                              <SelectItem key={h} value={h}>{h}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Import Options */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <ChevronRight className="w-4 h-4" />
                    Import Options
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="create-categories"
                        checked={csvCreateCategories}
                        onCheckedChange={setCsvCreateCategories}
                      />
                      <Label htmlFor="create-categories" className="text-sm cursor-pointer">
                        Create new categories if not found
                      </Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="create-suppliers"
                        checked={csvCreateSuppliers}
                        onCheckedChange={setCsvCreateSuppliers}
                      />
                      <Label htmlFor="create-suppliers" className="text-sm cursor-pointer">
                        Create new suppliers if not found
                      </Label>
                    </div>
                  </div>
                  
                  {csvCreateSuppliers && (
                    <div className="flex items-center gap-3 mt-2">
                      <Label className="text-sm">Supplier account code starts from:</Label>
                      <Input
                        value={csvSupplierStartCode}
                        onChange={(e) => setCsvSupplierStartCode(e.target.value)}
                        className="w-32 h-8 text-sm font-mono"
                      />
                      <span className="text-xs text-muted-foreground">
                        (Next available: {csvPreview.next_supplier_code})
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Preview Data */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <ChevronRight className="w-4 h-4" />
                    Data Preview (first 5 rows)
                  </h4>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          {csvPreview.headers.slice(0, 8).map(h => (
                            <th key={h} className="p-2 text-left font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.sample_data.map((row, i) => (
                          <tr key={i} className="border-b border-border/50">
                            {csvPreview.headers.slice(0, 8).map(h => (
                              <td key={h} className="p-2 truncate max-w-[150px]">{row[h]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                
                {/* Existing Data Info */}
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>Existing categories: {csvPreview.existing_categories?.length || 0}</span>
                  <span>Existing suppliers: {csvPreview.existing_suppliers?.length || 0}</span>
                </div>
              </>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCsvImport}
              disabled={!csvPreview || csvImporting || !csvMappings.name}
            >
              {csvImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Import {csvPreview?.total_rows || 0} Items
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DBF Import Dialog */}
      <Dialog open={dbfDialogOpen} onOpenChange={handleCloseDbfDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-orange-400" />
              Import Inventory from DBF File
            </DialogTitle>
            <DialogDescription>
              {dbfStep === 1 && "Step 1: Select your DBF file to preview its contents."}
              {dbfStep === 2 && "Step 2: Map DBF fields to inventory fields. Only mapped fields will be imported."}
              {dbfStep === 3 && "Import completed! Review the results below."}
            </DialogDescription>
          </DialogHeader>

          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2 py-2">
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs ${dbfStep >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              <span>1</span> Upload
            </div>
            <div className="w-8 h-px bg-border" />
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs ${dbfStep >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              <span>2</span> Map Fields
            </div>
            <div className="w-8 h-px bg-border" />
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs ${dbfStep >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              <span>3</span> Import
            </div>
          </div>

          <div className="space-y-4 py-4">
            {/* Step 1: File Upload */}
            {dbfStep === 1 && (
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                <input
                  ref={dbfInputRef}
                  type="file"
                  accept=".dbf"
                  onChange={handleDbfFileSelect}
                  className="hidden"
                />
                <Database className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-3">
                  Select a .dbf file to import
                </p>
                <Button onClick={() => dbfInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />
                  Choose DBF File
                </Button>
              </div>
            )}

            {/* Step 2: Field Mapping */}
            {dbfStep === 2 && dbfPreview && (
              <div className="space-y-4">
                {/* File Info */}
                <div className="bg-muted/30 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-orange-400" />
                    <div>
                      <p className="font-medium">{dbfFile?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {dbfPreview.total_records} records • {dbfPreview.fields?.length} fields
                        {dbfPreview.detected_encoding && <span className="ml-2 text-xs text-cyan-400">({dbfPreview.detected_encoding})</span>}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setDbfStep(1); setDbfFile(null); setDbfPreview(null); setDbfFieldMapping({}); }}>
                    <X className="w-4 h-4 mr-1" /> Change File
                  </Button>
                </div>

                {/* Nafitha Arabic Warning */}
                {dbfPreview.is_nafitha_arabic && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                    <p className="text-amber-400 font-medium text-sm mb-1">⚠️ Legacy Arabic Encoding Detected (Nafitha)</p>
                    <p className="text-xs text-muted-foreground">
                      This file uses Nafitha Arabic encoding from DOS era. Arabic text may not display correctly, 
                      but numeric values (prices, quantities, balances) and codes will import properly.
                      You can map the Arabic field to "Name (Arabic)" for reference.
                    </p>
                  </div>
                )}

                {/* Field Mapping Interface */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 border-b">
                    <h4 className="font-medium text-sm">Field Mapping</h4>
                    <p className="text-xs text-muted-foreground">Select which DBF field maps to each inventory field. Leave empty to skip.</p>
                  </div>
                  <div className="divide-y">
                    {inventoryFields.map((field) => (
                      <div key={field.key} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20">
                        <div className="w-1/3">
                          <label className="text-sm font-medium flex items-center gap-1">
                            {field.label}
                            {field.required && <span className="text-red-500">*</span>}
                          </label>
                        </div>
                        <div className="w-1/3">
                          <select
                            className="w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                            value={dbfFieldMapping[field.key] || ''}
                            onChange={(e) => handleDbfFieldMappingChange(field.key, e.target.value)}
                          >
                            <option value="">-- Skip this field --</option>
                            {dbfPreview.fields?.map((dbfField) => (
                              <option key={dbfField.name} value={dbfField.name}>
                                {dbfField.name} ({dbfField.type})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-1/3 text-xs text-muted-foreground font-mono truncate">
                          {dbfFieldMapping[field.key] && (
                            <span className="bg-muted px-2 py-1 rounded">
                              Sample: {getSampleValueForField(dbfFieldMapping[field.key]) || '(empty)'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mapping Summary */}
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <p className="text-blue-400 font-medium text-sm mb-1">
                    {Object.keys(dbfFieldMapping).length} of {inventoryFields.length} fields mapped
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {!dbfFieldMapping.name ? (
                      <span className="text-yellow-400">⚠ You must map the "Name" field to proceed.</span>
                    ) : (
                      <span className="text-green-400">✓ Ready to import. Items without names or with duplicate barcodes/SKUs will be skipped.</span>
                    )}
                  </p>
                </div>

                {/* Update Existing Items Option */}
                <div className="border rounded-lg p-4 space-y-2 bg-amber-500/10 border-amber-500/30">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dbfUpdateExisting}
                      onChange={(e) => setDbfUpdateExisting(e.target.checked)}
                      className="rounded border-gray-300 w-5 h-5"
                    />
                    <div>
                      <span className="font-medium text-sm">Update existing items</span>
                      <p className="text-xs text-muted-foreground">
                        If checked, existing items (matched by barcode or SKU) will be updated with new field values.
                        If unchecked, existing items will be skipped.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Supplier Creation Options */}
                {dbfFieldMapping.supplier && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-sm">Supplier Import Options</h4>
                        <p className="text-xs text-muted-foreground">Configure how suppliers from the DBF file are handled</p>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={dbfCreateSuppliers}
                          onChange={(e) => setDbfCreateSuppliers(e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">Create new suppliers</span>
                      </label>
                    </div>
                    
                    {dbfCreateSuppliers && (
                      <div className="flex items-center gap-4">
                        <Label className="text-sm whitespace-nowrap">Parent Account:</Label>
                        <select
                          className="flex-1 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          value={dbfSupplierParentCode}
                          onChange={(e) => setDbfSupplierParentCode(e.target.value)}
                        >
                          <option value="401">401 - Suppliers (Default)</option>
                          {supplierAccounts.map((acc) => (
                            <option key={acc.id} value={acc.code}>
                              {acc.code} - {acc.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground">
                      {dbfCreateSuppliers 
                        ? `New suppliers will be created under account code "${dbfSupplierParentCode}" (e.g., ${dbfSupplierParentCode}001, ${dbfSupplierParentCode}002, ...)`
                        : 'Suppliers will be matched by name. Items with unknown suppliers will have no supplier assigned.'
                      }
                    </p>
                  </div>
                )}

                {/* Sample Data Preview */}
                <details className="border rounded-lg">
                  <summary className="px-4 py-2 cursor-pointer hover:bg-muted/20 font-medium text-sm">
                    Preview Sample Data ({dbfPreview.sample_data?.length} of {dbfPreview.total_records} records)
                  </summary>
                  <div className="p-4 overflow-x-auto border-t">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          {dbfPreview.fields?.map((field, idx) => (
                            <th key={idx} className={`p-2 text-left font-medium ${dbfFieldMapping && Object.values(dbfFieldMapping).includes(field.name) ? 'text-primary bg-primary/10' : ''}`}>
                              {field.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dbfPreview.sample_data?.map((row, idx) => (
                          <tr key={idx} className="border-b border-border/50 hover:bg-muted/30">
                            {dbfPreview.fields?.map((field, fidx) => (
                              <td key={fidx} className={`p-2 font-mono truncate max-w-[150px] ${dbfFieldMapping && Object.values(dbfFieldMapping).includes(field.name) ? 'bg-primary/5' : ''}`}>
                                {String(row[field.name] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}

            {/* Step 3: Import Result */}
            {dbfStep === 3 && dbfImportResult && (
              <div className="space-y-4">
                <div className={`rounded-lg p-4 ${dbfImportResult.imported > 0 ? 'bg-green-500/10 border border-green-500/30' : 'bg-yellow-500/10 border border-yellow-500/30'}`}>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-400" />
                    Import Completed
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Imported:</span>
                      <span className="ml-2 font-bold text-green-400">{dbfImportResult.imported}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Updated:</span>
                      <span className="ml-2 font-bold text-amber-400">{dbfImportResult.updated || 0}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Skipped:</span>
                      <span className="ml-2 font-medium">{dbfImportResult.skipped}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Categories:</span>
                      <span className="ml-2 font-medium">{dbfImportResult.categories_created}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Suppliers:</span>
                      <span className="ml-2 font-medium text-cyan-400">{dbfImportResult.suppliers_created || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Suppliers Created */}
                {dbfImportResult.new_suppliers?.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2 text-cyan-400">New Suppliers Created</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs max-h-40 overflow-y-auto">
                      {dbfImportResult.new_suppliers.map((sup, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-muted/30 px-2 py-1 rounded">
                          <span className="font-mono text-cyan-400">{sup.code}</span>
                          <span className="text-muted-foreground">-</span>
                          <span className="truncate">{sup.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Field Mapping Used */}
                {dbfImportResult.field_mapping && Object.keys(dbfImportResult.field_mapping).length > 0 && (
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2">Field Mapping Used</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(dbfImportResult.field_mapping).map(([our, dbf]) => (
                        <div key={our} className="flex items-center gap-2">
                          <span className="text-muted-foreground">{inventoryFields.find(f => f.key === our)?.label || our}:</span>
                          <span className="font-mono text-cyan-400">{dbf}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Errors */}
                {dbfImportResult.errors?.length > 0 && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                    <h4 className="font-medium mb-2 text-red-400">Errors</h4>
                    <ul className="list-disc list-inside text-xs text-muted-foreground">
                      {dbfImportResult.errors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDbfDialog}>
              {dbfStep === 3 ? 'Close' : 'Cancel'}
            </Button>
            {dbfStep === 2 && (
              <Button onClick={handleDbfImport} disabled={dbfImporting || !dbfFieldMapping.name}>
                {dbfImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Import {dbfPreview?.total_records || 0} Items
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Management Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-400" />
              Manage Batches - {batchItem?.name}
            </DialogTitle>
            <DialogDescription>
              Track inventory by batch/lot with expiry dates
            </DialogDescription>
          </DialogHeader>
          
          {batchItem && (
            <div className="space-y-4 py-4">
              {/* Add New Batch */}
              <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
                <h4 className="font-medium text-sm">Add New Batch</h4>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Batch Number *</Label>
                    <Input
                      placeholder="e.g., LOT-2025-001"
                      value={newBatch.batch_number}
                      onChange={(e) => setNewBatch({ ...newBatch, batch_number: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Quantity *</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={newBatch.quantity}
                      onChange={(e) => setNewBatch({ ...newBatch, quantity: e.target.value })}
                      className="h-8 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Expiry Date</Label>
                    <DateInput
                      value={newBatch.expiry_date}
                      onChange={(e) => setNewBatch({ ...newBatch, expiry_date: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cost per Unit</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={batchItem.cost?.toString() || '0'}
                      value={newBatch.cost}
                      onChange={(e) => setNewBatch({ ...newBatch, cost: e.target.value })}
                      className="h-8 text-sm font-mono"
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Notes</Label>
                    <Input
                      placeholder="Optional notes"
                      value={newBatch.notes}
                      onChange={(e) => setNewBatch({ ...newBatch, notes: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <Button size="sm" onClick={handleAddBatch}>
                  <Plus className="w-3 h-3 mr-1" />
                  Add Batch
                </Button>
              </div>
              
              {/* Existing Batches */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-sm flex items-center justify-between">
                  <span>Existing Batches ({batchItem.batches?.length || 0})</span>
                  <span className="text-muted-foreground font-normal">
                    Total Qty: {batchItem.on_hand_qty}
                  </span>
                </h4>
                
                {(!batchItem.batches || batchItem.batches.length === 0) ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No batches yet. Add one above.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="p-2 text-left font-medium">Batch #</th>
                          <th className="p-2 text-left font-medium">Expiry</th>
                          <th className="p-2 text-right font-medium">Qty</th>
                          <th className="p-2 text-right font-medium">Cost</th>
                          <th className="p-2 text-left font-medium">Notes</th>
                          <th className="p-2 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchItem.batches.map(batch => {
                          const isExpired = batch.expiry_date && new Date(batch.expiry_date) < new Date();
                          const isExpiringSoon = batch.expiry_date && !isExpired && 
                            new Date(batch.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                          
                          return (
                            <tr key={batch.id} className={`border-b border-border/50 ${isExpired ? 'bg-red-500/10' : isExpiringSoon ? 'bg-amber-500/10' : ''}`}>
                              <td className="p-2 font-mono">{batch.batch_number}</td>
                              <td className="p-2">
                                {batch.expiry_date ? (
                                  <span className={isExpired ? 'text-red-400' : isExpiringSoon ? 'text-amber-400' : ''}>
                                    {batch.expiry_date}
                                    {isExpired && ' (Expired)'}
                                    {isExpiringSoon && ' (Soon)'}
                                  </span>
                                ) : '-'}
                              </td>
                              <td className="p-2 text-right font-mono">{batch.quantity}</td>
                              <td className="p-2 text-right font-mono">${batch.cost?.toFixed(2) || '-'}</td>
                              <td className="p-2 text-muted-foreground truncate max-w-[100px]">{batch.notes || '-'}</td>
                              <td className="p-2 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-red-400"
                                  onClick={() => handleDeleteBatch(batch.id)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement History Dialog */}
      <Dialog open={movementDialogOpen} onOpenChange={(open) => { setMovementDialogOpen(open); if (!open) { setMovementItem(null); setMovements([]); } }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-cyan-400" />
              Inventory Movement History
            </DialogTitle>
            <DialogDescription>
              {movementItem && (
                <div className="flex flex-wrap items-center gap-4 mt-2 text-sm">
                  <span className="font-medium text-foreground">{movementItem.name}</span>
                  {movementItem.barcode && <span className="text-muted-foreground font-mono">[{movementItem.barcode}]</span>}
                  <span className="text-green-400">P: ${formatUSD(movementItem.price || 0)}</span>
                  <span className="text-orange-400">C: ${formatUSD(movementItem.cost || 0)}</span>
                  <span className="text-blue-400">QH: {movementItem.on_hand_qty || 0}</span>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto mt-4">
            {loadingMovements ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : movements.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No movement history found for this item</p>
              </div>
            ) : (
              <table className="data-table text-sm w-full">
                <thead className="sticky top-0 bg-background z-10">
                  <tr>
                    <th className="text-left p-2 w-24">Date</th>
                    <th className="text-left p-2 w-28">Document</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-right p-2 w-16 text-green-400">In</th>
                    <th className="text-right p-2 w-16 text-red-400">Out</th>
                    <th className="text-right p-2 w-20">Price</th>
                    <th className="text-right p-2 w-20">Cost</th>
                    <th className="text-right p-2 w-16 font-bold">Balance</th>
                    <th className="text-center p-2 w-16">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((mov, idx) => (
                    <tr key={idx} className="hover:bg-muted/50">
                      <td className="p-2 text-muted-foreground">{formatDate(mov.date)}</td>
                      <td className="p-2">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs">{mov.document_number || '-'}</span>
                          <span className="text-[10px] text-muted-foreground">{mov.document_type}</span>
                        </div>
                      </td>
                      <td className="p-2 truncate max-w-[200px]" title={mov.description}>{mov.description}</td>
                      <td className="p-2 text-right font-mono text-green-400">{mov.qty_in > 0 ? `+${mov.qty_in}` : '-'}</td>
                      <td className="p-2 text-right font-mono text-red-400">{mov.qty_out > 0 ? `-${mov.qty_out}` : '-'}</td>
                      <td className="p-2 text-right font-mono">${formatUSD(mov.unit_price || 0)}</td>
                      <td className="p-2 text-right font-mono">${formatUSD(mov.cost || 0)}</td>
                      <td className="p-2 text-right font-mono font-bold">{mov.balance}</td>
                      <td className="p-2 text-center">
                        {mov.document_id && mov.type !== 'adjustment' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-cyan-400"
                            onClick={() => viewRelatedInvoice(mov)}
                            title="View Invoice"
                          >
                            <Eye className="w-3 h-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border">
                  <tr className="bg-muted/30 font-medium">
                    <td colSpan="3" className="p-2 text-right">Totals:</td>
                    <td className="p-2 text-right font-mono text-green-400">
                      +{movements.reduce((sum, m) => sum + (m.qty_in || 0), 0)}
                    </td>
                    <td className="p-2 text-right font-mono text-red-400">
                      -{movements.reduce((sum, m) => sum + (m.qty_out || 0), 0)}
                    </td>
                    <td colSpan="2" className="p-2"></td>
                    <td className="p-2 text-right font-mono font-bold text-cyan-400">
                      {movements.length > 0 ? movements[movements.length - 1].balance : 0}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
          
          <DialogFooter className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-muted-foreground">
                {movements.length} transaction{movements.length !== 1 ? 's' : ''}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={printMovements} disabled={movements.length === 0}>
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
                <Button variant="outline" onClick={() => setMovementDialogOpen(false)}>Close</Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryPage;
