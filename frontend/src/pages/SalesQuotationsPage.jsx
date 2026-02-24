import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import {
  FileText, Plus, Edit, Trash2, Printer, Search, Calendar,
  DollarSign, ChevronRight, Eye, Check, X, RefreshCw,
  ArrowRight, Copy, Send, CheckCircle, XCircle, Clock,
  Package, Wrench, User
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const QUOTATION_STATUSES = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-500' },
  { value: 'sent', label: 'Sent', color: 'bg-blue-500' },
  { value: 'accepted', label: 'Accepted', color: 'bg-green-500' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-500' },
  { value: 'expired', label: 'Expired', color: 'bg-yellow-500' },
  { value: 'converted', label: 'Converted', color: 'bg-purple-500' }
];

// Searchable Customer Selector Component
const CustomerSearch = ({ customers, value, onChange, placeholder = "Search customer..." }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (searchTerm.length > 0) {
      const filtered = customers.filter(c => 
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.code?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredCustomers(filtered.slice(0, 10));
    } else {
      setFilteredCustomers(customers.slice(0, 10));
    }
  }, [searchTerm, customers]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedCustomer = customers.find(c => c.id === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder={placeholder}
          value={isOpen ? searchTerm : (selectedCustomer ? `${selectedCustomer.code} - ${selectedCustomer.name}` : '')}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearchTerm('');
          }}
          className="pl-10"
        />
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredCustomers.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">No customers found</div>
          ) : (
            filteredCustomers.map(customer => (
              <div
                key={customer.id}
                className={`p-2 cursor-pointer hover:bg-muted ${value === customer.id ? 'bg-muted' : ''}`}
                onClick={() => {
                  onChange(customer.id);
                  setIsOpen(false);
                  setSearchTerm('');
                }}
              >
                <div className="font-medium">{customer.name}</div>
                <div className="text-xs text-muted-foreground">{customer.code}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// Searchable Item/Service Selector Component
const ItemServiceSearch = ({ inventory, services, onSelect, placeholder = "Search item or service..." }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('items'); // 'items' or 'services'
  const [filteredItems, setFilteredItems] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (searchTerm.length > 0) {
      const term = searchTerm.toLowerCase();
      setFilteredItems(inventory.filter(i => 
        i.name?.toLowerCase().includes(term) ||
        i.barcode?.toLowerCase().includes(term) ||
        i.sku?.toLowerCase().includes(term)
      ).slice(0, 10));
      setFilteredServices(services.filter(s => 
        s.name?.toLowerCase().includes(term) ||
        s.code?.toLowerCase().includes(term)
      ).slice(0, 10));
    } else {
      setFilteredItems(inventory.slice(0, 10));
      setFilteredServices(services.slice(0, 10));
    }
  }, [searchTerm, inventory, services]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item, type) => {
    onSelect({
      item_id: item.id,
      item_name: item.name,
      unit: type === 'service' ? 'service' : (item.unit || 'piece'),
      unit_price: item.price || 0,
      type: type,
      image_url: item.image_url || ''
    });
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="pl-10"
        />
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-80 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b">
            <button
              type="button"
              className={`flex-1 p-2 text-sm font-medium flex items-center justify-center gap-1 ${activeTab === 'items' ? 'bg-muted border-b-2 border-primary' : ''}`}
              onClick={(e) => { e.stopPropagation(); setActiveTab('items'); }}
            >
              <Package className="w-4 h-4" />
              Items ({filteredItems.length})
            </button>
            <button
              type="button"
              className={`flex-1 p-2 text-sm font-medium flex items-center justify-center gap-1 ${activeTab === 'services' ? 'bg-muted border-b-2 border-primary' : ''}`}
              onClick={(e) => { e.stopPropagation(); setActiveTab('services'); }}
            >
              <Wrench className="w-4 h-4" />
              Services ({filteredServices.length})
            </button>
          </div>
          
          {/* Content */}
          <div className="max-h-60 overflow-auto">
            {activeTab === 'items' ? (
              filteredItems.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">No items found</div>
              ) : (
                filteredItems.map(item => (
                  <div
                    key={item.id}
                    className="p-2 cursor-pointer hover:bg-muted flex justify-between items-center"
                    onClick={(e) => { e.stopPropagation(); handleSelect(item, 'item'); }}
                  >
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.barcode || item.sku || 'No code'} • Stock: {item.on_hand_qty || 0}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-primary">
                      {item.currency || 'USD'} {(item.price || 0).toFixed(2)}
                    </div>
                  </div>
                ))
              )
            ) : (
              filteredServices.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">No services found</div>
              ) : (
                filteredServices.map(service => (
                  <div
                    key={service.id}
                    className="p-2 cursor-pointer hover:bg-muted flex justify-between items-center"
                    onClick={(e) => { e.stopPropagation(); handleSelect(service, 'service'); }}
                  >
                    <div>
                      <div className="font-medium">{service.name}</div>
                      <div className="text-xs text-muted-foreground">{service.code}</div>
                    </div>
                    <div className="text-sm font-medium text-primary">
                      {service.currency || 'USD'} {(service.price || 0).toFixed(2)}
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SalesQuotationsPage = () => {
  const { currentOrg } = useAuth();
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState(null);
  const [viewingQuotation, setViewingQuotation] = useState(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [quotationToConvert, setQuotationToConvert] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    valid_until: '',
    debit_account_id: '',
    currency: 'USD',
    notes: '',
    terms: '',
    lines: [],
    discount_percent: 0,
    tax_percent: 0
  });
  
  const [customers, setCustomers] = useState([]);
  const [salesAccounts, setSalesAccounts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedSalesAccount, setSelectedSalesAccount] = useState('');
  const [exchangeRate, setExchangeRate] = useState(89500);
  // Print dialog state
  const [printDialog, setPrintDialog] = useState(null); // Quotation to print
  const [printWithBackground, setPrintWithBackground] = useState(true);

  useEffect(() => {
    if (currentOrg) {
      fetchQuotations();
      fetchCustomers();
      fetchSalesAccounts();
      fetchInventory();
      fetchServices();
      setExchangeRate(currentOrg.base_exchange_rate || 89500);
    }
  }, [currentOrg]);

  const fetchQuotations = async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API}/sales-quotations?organization_id=${currentOrg.id}`);
      setQuotations(response.data);
    } catch (error) {
      console.error('Failed to fetch quotations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      // Use dedicated customer accounts endpoint (only returns leaf customer accounts starting with 41)
      const response = await axios.get(`${API}/customer-accounts?organization_id=${currentOrg.id}`);
      setCustomers(response.data || []);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
      setCustomers([]);
    }
  };

  const fetchSalesAccounts = async () => {
    try {
      const response = await axios.get(`${API}/accounts?organization_id=${currentOrg.id}&code_prefix=7`);
      setSalesAccounts(response.data.filter(a => a.code?.length >= 3));
    } catch (error) {
      console.error('Failed to fetch sales accounts:', error);
    }
  };

  const fetchInventory = async () => {
    try {
      const response = await axios.get(`${API}/inventory?organization_id=${currentOrg.id}&page_size=1000`);
      setInventory(response.data.items || response.data || []);
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
    }
  };

  const fetchServices = async () => {
    try {
      const response = await axios.get(`${API}/service-items?organization_id=${currentOrg.id}`);
      setServices(response.data || []);
    } catch (error) {
      console.error('Failed to fetch service items:', error);
      setServices([]);
    }
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      valid_until: '',
      debit_account_id: '',
      currency: 'USD',
      notes: '',
      terms: '',
      lines: [],
      discount_percent: 0,
      tax_percent: 0
    });
    setEditingQuotation(null);
  };

  const calculateLineTotals = () => {
    const subtotal = formData.lines.reduce((sum, line) => sum + (line.line_total || 0), 0);
    const discountAmount = (subtotal * (formData.discount_percent || 0)) / 100;
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = (afterDiscount * (formData.tax_percent || 0)) / 100;
    const total = afterDiscount + taxAmount;
    const totalUsd = formData.currency === 'LBP' ? total / exchangeRate : total;
    
    return { subtotal, discountAmount, taxAmount, total, totalUsd };
  };

  const handleAddLine = (selectedItem) => {
    if (!selectedItem.item_name) return;
    
    const lineTotal = selectedItem.unit_price * 1; // Default qty 1
    
    setFormData({
      ...formData,
      lines: [...formData.lines, {
        item_id: selectedItem.item_id,
        item_name: selectedItem.item_name,
        quantity: 1,
        unit: selectedItem.unit,
        unit_price: selectedItem.unit_price,
        discount_percent: 0,
        line_total: lineTotal,
        line_total_usd: formData.currency === 'LBP' ? lineTotal / exchangeRate : lineTotal,
        type: selectedItem.type || 'item',
        image_url: selectedItem.image_url || ''
      }]
    });
  };

  const handleUpdateLine = (index, field, value) => {
    const updatedLines = [...formData.lines];
    updatedLines[index][field] = value;
    
    // Recalculate line total
    const line = updatedLines[index];
    const lineTotal = (line.unit_price * line.quantity) * (1 - (line.discount_percent || 0) / 100);
    updatedLines[index].line_total = lineTotal;
    updatedLines[index].line_total_usd = formData.currency === 'LBP' ? lineTotal / exchangeRate : lineTotal;
    
    setFormData({ ...formData, lines: updatedLines });
  };

  const handleRemoveLine = (index) => {
    setFormData({
      ...formData,
      lines: formData.lines.filter((_, i) => i !== index)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.lines.length === 0) {
      alert('Please add at least one line item');
      return;
    }
    
    if (!formData.debit_account_id) {
      alert('Please select a customer');
      return;
    }
    
    const { subtotal, discountAmount, taxAmount, total, totalUsd } = calculateLineTotals();
    
    const payload = {
      ...formData,
      subtotal,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      total,
      total_usd: totalUsd,
      organization_id: currentOrg.id
    };
    
    try {
      if (editingQuotation) {
        await axios.put(`${API}/sales-quotations/${editingQuotation.id}`, payload);
      } else {
        await axios.post(`${API}/sales-quotations`, payload);
      }
      setIsDialogOpen(false);
      resetForm();
      fetchQuotations();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save quotation');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this quotation?')) return;
    
    try {
      await axios.delete(`${API}/sales-quotations/${id}`);
      fetchQuotations();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete quotation');
    }
  };

  const handleConvertToInvoice = async () => {
    if (!quotationToConvert || !selectedSalesAccount) {
      alert('Please select a sales account');
      return;
    }
    
    try {
      const response = await axios.post(
        `${API}/sales-quotations/${quotationToConvert.id}/convert-to-invoice?credit_account_id=${selectedSalesAccount}`
      );
      alert(`Quotation converted to Invoice ${response.data.invoice_number}`);
      setConvertDialogOpen(false);
      setQuotationToConvert(null);
      setSelectedSalesAccount('');
      fetchQuotations();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to convert quotation');
    }
  };

  const handleDuplicate = async (id) => {
    try {
      const response = await axios.post(`${API}/sales-quotations/${id}/duplicate`);
      alert(`Quotation duplicated: ${response.data.quotation_number}`);
      fetchQuotations();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to duplicate quotation');
    }
  };

  const openEdit = (quotation) => {
    setEditingQuotation(quotation);
    setFormData({
      date: quotation.date,
      valid_until: quotation.valid_until || '',
      debit_account_id: quotation.debit_account_id,
      currency: quotation.currency,
      notes: quotation.notes || '',
      terms: quotation.terms || '',
      lines: quotation.lines || [],
      discount_percent: quotation.discount_percent || 0,
      tax_percent: quotation.tax_percent || 0
    });
    setIsDialogOpen(true);
  };

  const printQuotation = (quotation, withBackground = true) => {
    // Get quotation-specific template or fall back to invoice template
    const template = currentOrg?.document_templates?.sales_quotation || currentOrg?.invoice_template || {};
    const pageWidth = template.page_width || 210;
    const pageHeight = template.page_height || 297;
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
    
    const printWindow = window.open('', '_blank');
    
    const formatAmount = (amount) => {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount || 0);
    };
    
    const customerName = quotation.debit_account_name || '';
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Quotation ${quotation.quotation_number}</title>
        <style>
          @page { size: ${pageWidth}mm ${pageHeight}mm; margin: 10mm; }
          body { 
            font-family: Arial, sans-serif; 
            font-size: 12px; 
            margin: 0; 
            padding: 20px;
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
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
          .company-name { font-size: 24px; font-weight: bold; color: #333; }
          .company-type { font-size: 14px; color: #666; }
          .quotation-title { font-size: 20px; font-weight: bold; margin: 20px 0; text-align: center; color: #0066cc; }
          .info-section { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .info-box { flex: 1; }
          .info-label { font-weight: bold; color: #666; font-size: 10px; }
          .info-value { font-size: 12px; margin-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th { background: #f0f0f0; padding: 10px; text-align: left; border: 1px solid #ddd; font-size: 11px; }
          td { padding: 8px 10px; border: 1px solid #ddd; font-size: 11px; }
          .text-right { text-align: right; }
          .totals { margin-top: 20px; }
          .totals-row { display: flex; justify-content: flex-end; margin: 5px 0; }
          .totals-label { width: 150px; text-align: right; padding-right: 20px; }
          .totals-value { width: 120px; text-align: right; font-weight: bold; }
          .grand-total { font-size: 16px; border-top: 2px solid #333; padding-top: 10px; margin-top: 10px; }
          .terms { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
          .terms-title { font-weight: bold; margin-bottom: 10px; }
          .notes { margin-top: 20px; font-style: italic; color: #666; }
          .validity { background: #fff3cd; padding: 10px; border-radius: 5px; margin: 10px 0; text-align: center; }
          .service-badge { background: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 3px; font-size: 9px; margin-left: 5px; }
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
        </style>
      </head>
      <body>
        ${backgroundImage ? '<div class="background-layer"></div>' : ''}
        <div class="header">
          <div class="company-name">${template.company_name || currentOrg?.name || 'Company Name'}</div>
          <div class="company-type">${template.company_type || ''}</div>
          <div style="font-size: 11px; margin-top: 5px;">
            ${template.address || ''}<br/>
            Tel: ${template.tel_fax || ''} | Mobile: ${template.mobile || ''}<br/>
            Email: ${template.email || ''}
          </div>
        </div>
        
        <div class="quotation-title">SALES QUOTATION</div>
        
        <div class="info-section">
          <div class="info-box">
            <div class="info-label">QUOTATION TO:</div>
            <div class="info-value" style="font-size: 14px; font-weight: bold;">${customerName}</div>
          </div>
          <div class="info-box" style="text-align: right;">
            <div class="info-label">QUOTATION #</div>
            <div class="info-value" style="font-size: 14px; font-weight: bold;">${quotation.quotation_number}</div>
            <div class="info-label">DATE</div>
            <div class="info-value">${quotation.date}</div>
            ${quotation.valid_until ? `
              <div class="info-label">VALID UNTIL</div>
              <div class="info-value">${quotation.valid_until}</div>
            ` : ''}
          </div>
        </div>
        
        ${quotation.valid_until ? `
          <div class="validity">
            <strong>⏰ This quotation is valid until ${quotation.valid_until}</strong>
          </div>
        ` : ''}
        
        <table>
          <thead>
            <tr>
              <th style="width: 5%;">#</th>
              <th style="width: 10%;">Image</th>
              <th style="width: 35%;">Description</th>
              <th style="width: 10%;" class="text-right">Qty</th>
              <th style="width: 10%;">Unit</th>
              <th style="width: 15%;" class="text-right">Unit Price</th>
              <th style="width: 15%;" class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${quotation.lines.map((line, i) => `
              <tr>
                <td>${i + 1}</td>
                <td style="text-align: center; vertical-align: middle;">
                  ${line.image_url ? `<img src="${line.image_url}" alt="${line.item_name || ''}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;" />` : '<span style="color: #ccc;">-</span>'}
                </td>
                <td>${line.item_name || ''}${line.type === 'service' ? '<span class="service-badge">Service</span>' : ''}</td>
                <td class="text-right">${line.quantity || 0}</td>
                <td>${line.unit || ''}</td>
                <td class="text-right">${formatAmount(line.unit_price)}</td>
                <td class="text-right">${formatAmount(line.line_total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="totals">
          <div class="totals-row">
            <div class="totals-label">Subtotal:</div>
            <div class="totals-value">${quotation.currency} ${formatAmount(quotation.subtotal)}</div>
          </div>
          ${quotation.discount_amount > 0 ? `
            <div class="totals-row">
              <div class="totals-label">Discount (${quotation.discount_percent || 0}%):</div>
              <div class="totals-value">- ${formatAmount(quotation.discount_amount)}</div>
            </div>
          ` : ''}
          ${quotation.tax_amount > 0 ? `
            <div class="totals-row">
              <div class="totals-label">Tax (${quotation.tax_percent || 0}%):</div>
              <div class="totals-value">${formatAmount(quotation.tax_amount)}</div>
            </div>
          ` : ''}
          <div class="totals-row grand-total">
            <div class="totals-label">TOTAL:</div>
            <div class="totals-value">${quotation.currency} ${formatAmount(quotation.total)}</div>
          </div>
          ${quotation.currency === 'LBP' ? `
            <div class="totals-row" style="font-size: 11px; color: #666;">
              <div class="totals-label">Equivalent USD:</div>
              <div class="totals-value">$ ${formatAmount(quotation.total_usd)}</div>
            </div>
          ` : ''}
        </div>
        
        ${quotation.terms ? `
          <div class="terms">
            <div class="terms-title">Terms & Conditions:</div>
            <div>${quotation.terms.replace(/\n/g, '<br/>')}</div>
          </div>
        ` : ''}
        
        ${quotation.notes ? `
          <div class="notes">
            <strong>Notes:</strong> ${quotation.notes}
          </div>
        ` : ''}
        
        <div style="margin-top: 40px; text-align: center; color: #666; font-size: 10px;">
          ${template.footer_text || 'Thank you for your business!'}
        </div>
      </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  const filteredQuotations = quotations.filter(q => {
    const matchesSearch = 
      q.quotation_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.debit_account_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || q.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (amount, currency = 'USD') => {
    return `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(amount || 0)}`;
  };

  const getStatusBadge = (status) => {
    const statusConfig = QUOTATION_STATUSES.find(s => s.value === status) || QUOTATION_STATUSES[0];
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium text-white ${statusConfig.color}`}>
        {statusConfig.label}
      </span>
    );
  };

  if (!currentOrg) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Please select an organization to view quotations.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Sales Quotations
          </h1>
          <p className="text-muted-foreground text-sm">Create and manage sales quotations</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="btn-glow" data-testid="new-quotation-btn">
              <Plus className="w-4 h-4 mr-2" />
              New Quotation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingQuotation ? 'Edit Quotation' : 'Create New Quotation'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {/* Header Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valid Until</Label>
                  <Input
                    type="date"
                    value={formData.valid_until}
                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                  <Label>Customer *</Label>
                  <CustomerSearch
                    customers={customers}
                    value={formData.debit_account_id}
                    onChange={(id) => setFormData({ ...formData, debit_account_id: id })}
                    placeholder="Search customer..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select 
                    value={formData.currency} 
                    onValueChange={(v) => setFormData({ ...formData, currency: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="LBP">LBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Line Items */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Line Items</h3>
                  {formData.lines.length > 0 && (
                    <span className="text-xs text-muted-foreground">{formData.lines.length} item(s)</span>
                  )}
                </div>
                
                {/* Add Line - Searchable Item/Service Selector */}
                <div className="mb-4 pb-4 border-b">
                  <Label className="mb-2 block flex items-center gap-2">
                    <Plus className="w-4 h-4 text-green-500" />
                    Add Item or Service
                  </Label>
                  <ItemServiceSearch
                    inventory={inventory}
                    services={services}
                    onSelect={handleAddLine}
                    placeholder="Click here to search and add items..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Search by name, barcode, or SKU. Click on an item to add it to the quotation.
                  </p>
                </div>

                {/* Line Items Table */}
                {formData.lines.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-1">#</th>
                          <th className="text-left py-2 px-1">Item/Service</th>
                          <th className="text-right py-2 px-1 w-20">Qty</th>
                          <th className="text-right py-2 px-1 w-24">Price</th>
                          <th className="text-right py-2 px-1 w-16">Disc%</th>
                          <th className="text-right py-2 px-1">Total</th>
                          <th className="py-2 px-1 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.lines.map((line, idx) => (
                          <tr key={idx} className="border-b">
                            <td className="py-2 px-1">{idx + 1}</td>
                            <td className="py-2 px-1">
                              <div className="flex items-center gap-2">
                                {line.image_url ? (
                                  <img src={line.image_url} alt={line.item_name} className="w-8 h-8 object-cover rounded" />
                                ) : line.type === 'service' ? (
                                  <div className="w-8 h-8 bg-purple-500/20 rounded flex items-center justify-center">
                                    <Wrench className="w-4 h-4 text-purple-500" />
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 bg-blue-500/20 rounded flex items-center justify-center">
                                    <Package className="w-4 h-4 text-blue-500" />
                                  </div>
                                )}
                                <span className="truncate max-w-[150px]">{line.item_name}</span>
                              </div>
                            </td>
                            <td className="py-2 px-1">
                              <Input
                                type="number"
                                className="w-20 text-right"
                                value={line.quantity}
                                onChange={(e) => handleUpdateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.01"
                              />
                            </td>
                            <td className="py-2 px-1">
                              <Input
                                type="number"
                                className="w-24 text-right"
                                value={line.unit_price}
                                onChange={(e) => handleUpdateLine(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.01"
                              />
                            </td>
                            <td className="py-2 px-1">
                              <Input
                                type="number"
                                className="w-16 text-right"
                                value={line.discount_percent || 0}
                                onChange={(e) => handleUpdateLine(idx, 'discount_percent', parseFloat(e.target.value) || 0)}
                                min="0"
                                max="100"
                              />
                            </td>
                            <td className="text-right py-2 px-1 font-medium">
                              {formatCurrency(line.line_total, formData.currency)}
                            </td>
                            <td className="py-2 px-1">
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleRemoveLine(idx)}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {formData.lines.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>No items added yet. Search and select items or services above.</p>
                  </div>
                )}

                {/* Totals */}
                {formData.lines.length > 0 && (
                  <div className="mt-4 pt-4 border-t space-y-2">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span className="font-medium">{formatCurrency(calculateLineTotals().subtotal, formData.currency)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>Discount:</span>
                        <Input
                          type="number"
                          className="w-20"
                          value={formData.discount_percent || 0}
                          onChange={(e) => setFormData({ ...formData, discount_percent: parseFloat(e.target.value) || 0 })}
                          min="0"
                          max="100"
                        />
                        <span>%</span>
                      </div>
                      <span>- {formatCurrency(calculateLineTotals().discountAmount, formData.currency)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>Tax:</span>
                        <Input
                          type="number"
                          className="w-20"
                          value={formData.tax_percent || 0}
                          onChange={(e) => setFormData({ ...formData, tax_percent: parseFloat(e.target.value) || 0 })}
                          min="0"
                        />
                        <span>%</span>
                      </div>
                      <span>{formatCurrency(calculateLineTotals().taxAmount, formData.currency)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold border-t pt-2">
                      <span>Total:</span>
                      <span>{formatCurrency(calculateLineTotals().total, formData.currency)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes and Terms */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Terms & Conditions</Label>
                  <Textarea
                    placeholder="Payment terms, delivery conditions, etc."
                    value={formData.terms}
                    onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Additional notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={formData.lines.length === 0 || !formData.debit_account_id}>
                  <Check className="w-4 h-4 mr-2" />
                  {editingQuotation ? 'Update Quotation' : 'Create Quotation'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by quotation number or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {QUOTATION_STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Quotations List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading quotations...
            </div>
          ) : filteredQuotations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No quotations found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-medium">Quotation #</th>
                    <th className="text-left p-4 font-medium">Date</th>
                    <th className="text-left p-4 font-medium">Customer</th>
                    <th className="text-right p-4 font-medium">Total</th>
                    <th className="text-center p-4 font-medium">Status</th>
                    <th className="text-right p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotations.map((quotation) => (
                    <tr key={quotation.id} className="border-b hover:bg-muted/30">
                      <td className="p-4 font-mono text-sm">{quotation.quotation_number}</td>
                      <td className="p-4">{quotation.date}</td>
                      <td className="p-4">
                        <div className="font-medium">{quotation.debit_account_name}</div>
                        <div className="text-xs text-muted-foreground">{quotation.debit_account_code}</div>
                      </td>
                      <td className="p-4 text-right font-medium">
                        {formatCurrency(quotation.total, quotation.currency)}
                      </td>
                      <td className="p-4 text-center">
                        {getStatusBadge(quotation.status)}
                        {quotation.converted_to_invoice_number && (
                          <div className="text-xs text-muted-foreground mt-1">
                            → {quotation.converted_to_invoice_number}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingQuotation(quotation)}
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPrintDialog(quotation)}
                            title="Print"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                          {quotation.status !== 'converted' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEdit(quotation)}
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDuplicate(quotation.id)}
                                title="Duplicate"
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setQuotationToConvert(quotation);
                                  setConvertDialogOpen(true);
                                }}
                                title="Convert to Invoice"
                                className="text-green-600"
                              >
                                <ArrowRight className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(quotation.id)}
                                title="Delete"
                                className="text-red-500"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Convert to Invoice Dialog */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert Quotation to Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Convert quotation <strong>{quotationToConvert?.quotation_number}</strong> to a sales invoice.
            </p>
            <div className="space-y-2">
              <Label>Sales Account *</Label>
              <Select value={selectedSalesAccount} onValueChange={setSelectedSalesAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sales account" />
                </SelectTrigger>
                <SelectContent>
                  {salesAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This account will be credited when the invoice is posted
              </p>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConvertToInvoice} disabled={!selectedSalesAccount}>
              <ArrowRight className="w-4 h-4 mr-2" />
              Convert to Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Quotation Dialog */}
      <Dialog open={!!viewingQuotation} onOpenChange={() => setViewingQuotation(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Quotation Details - {viewingQuotation?.quotation_number}</DialogTitle>
          </DialogHeader>
          {viewingQuotation && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Customer</Label>
                  <p className="font-medium">{viewingQuotation.debit_account_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Date</Label>
                  <p>{viewingQuotation.date}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Valid Until</Label>
                  <p>{viewingQuotation.valid_until || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(viewingQuotation.status)}</div>
                </div>
              </div>
              
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3">#</th>
                      <th className="text-left p-3">Item/Service</th>
                      <th className="text-right p-3">Qty</th>
                      <th className="text-right p-3">Price</th>
                      <th className="text-right p-3">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingQuotation.lines?.map((line, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-3">{idx + 1}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {line.image_url ? (
                              <img src={line.image_url} alt={line.item_name} className="w-10 h-10 object-cover rounded" />
                            ) : line.type === 'service' ? (
                              <div className="w-10 h-10 bg-purple-500/20 rounded flex items-center justify-center">
                                <Wrench className="w-5 h-5 text-purple-500" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 bg-blue-500/20 rounded flex items-center justify-center">
                                <Package className="w-5 h-5 text-blue-500" />
                              </div>
                            )}
                            <span>{line.item_name}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right">{line.quantity}</td>
                        <td className="p-3 text-right">{formatCurrency(line.unit_price, viewingQuotation.currency)}</td>
                        <td className="p-3 text-right">{formatCurrency(line.line_total, viewingQuotation.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(viewingQuotation.subtotal, viewingQuotation.currency)}</span>
                  </div>
                  {viewingQuotation.discount_amount > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Discount:</span>
                      <span>- {formatCurrency(viewingQuotation.discount_amount, viewingQuotation.currency)}</span>
                    </div>
                  )}
                  {viewingQuotation.tax_amount > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tax:</span>
                      <span>{formatCurrency(viewingQuotation.tax_amount, viewingQuotation.currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t pt-2">
                    <span>Total:</span>
                    <span>{formatCurrency(viewingQuotation.total, viewingQuotation.currency)}</span>
                  </div>
                </div>
              </div>
              
              {viewingQuotation.terms && (
                <div>
                  <Label className="text-muted-foreground">Terms & Conditions</Label>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{viewingQuotation.terms}</p>
                </div>
              )}
              
              {viewingQuotation.notes && (
                <div>
                  <Label className="text-muted-foreground">Notes</Label>
                  <p className="mt-1 text-sm">{viewingQuotation.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Print Dialog with Background Option */}
      <Dialog open={!!printDialog} onOpenChange={() => setPrintDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Print Quotation
            </DialogTitle>
          </DialogHeader>
          
          {/* Background Option */}
          <div className="flex items-center gap-2 py-3 px-3 bg-muted/30 rounded-lg border">
            <input
              type="checkbox"
              id="quotation-print-with-background"
              checked={printWithBackground}
              onChange={(e) => setPrintWithBackground(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="quotation-print-with-background" className="text-sm cursor-pointer flex-1">
              Print with background image
            </label>
          </div>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPrintDialog(null)}>Cancel</Button>
            <Button 
              onClick={() => {
                printQuotation(printDialog, printWithBackground);
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
    </div>
  );
};

export default SalesQuotationsPage;
