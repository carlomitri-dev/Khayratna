import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { DateInput } from '../components/ui/date-input';
import AccountSelector from '../components/selectors/AccountSelector';
import InventorySelector from '../components/selectors/InventorySelector';
import SalesInvoicePrint from '../components/invoice/SalesInvoicePrint';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import {
  FileText, Search, Plus, Edit, Trash2, Send, Eye, Printer,
  Filter, Undo2, X, Save, Download
} from 'lucide-react';
import axios from 'axios';
import { formatUSD, formatDate } from '../lib/utils';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAGE_SIZE = 20;

const SalesInvoicePage = () => {
  const { user, currentOrg, canEdit } = useAuth();
  const { selectedFY } = useFiscalYear();
  
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  
  const [salesAccounts, setSalesAccounts] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [currencies] = useState([
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل' }
  ]);
  const [exchangeRate, setExchangeRate] = useState(89500);
  
  const emptyLine = {
    inventory_item_id: '', item_name: '', item_name_ar: '', barcode: '',
    quantity: 1, unit: 'piece', unit_price: 0, currency: 'USD',
    exchange_rate: 1, discount_percent: 0, line_total: 0, line_total_usd: 0,
    is_taxable: true
  };
  
  const defaultFormData = {
    date: new Date().toISOString().split('T')[0],
    due_date: '',
    lines: [{ ...emptyLine }],
    subtotal: 0, discount_percent: 0, discount_amount: 0,
    tax_percent: 11, tax_amount: 0, total: 0, total_usd: 0,
    currency: 'USD', notes: '',
    debit_account_id: '', credit_account_id: '',
    organization_id: currentOrg?.id || ''
  };
  
  const [formData, setFormData] = useState(defaultFormData);
  
  useEffect(() => {
    if (currentOrg) {
      fetchData();
      fetchInvoices(true);
    }
  }, [currentOrg, selectedFY]);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentOrg) fetchInvoices(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, filterStatus]);
  
  const fetchData = async () => {
    try {
      const [salesRes, inventoryRes, rateRes] = await Promise.all([
        axios.get(`${API}/sales-accounts?organization_id=${currentOrg.id}`),
        axios.get(`${API}/inventory?organization_id=${currentOrg.id}&page_size=1000`),
        axios.get(`${API}/exchange-rates/latest?organization_id=${currentOrg.id}`).catch(() => ({ data: { rate: 89500 } }))
      ]);
      setSalesAccounts(salesRes.data);
      const items = inventoryRes.data?.items || inventoryRes.data || [];
      setInventoryItems(Array.isArray(items) ? items : []);
      if (rateRes.data?.rate) setExchangeRate(rateRes.data.rate);
    } catch (error) {
      console.error('Failed to fetch reference data:', error);
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
        axios.get(`${API}/sales-invoices/count?organization_id=${currentOrg.id}${filterStatus !== 'all' ? `&status=${filterStatus}` : ''}${searchTerm ? `&search=${searchTerm}` : ''}`)
      ]);
      if (reset) {
        setInvoices(invoicesRes.data);
        setCurrentPage(1);
      } else {
        setInvoices(prev => [...prev, ...invoicesRes.data]);
        setCurrentPage(prev => prev + 1);
      }
      setTotalCount(countRes.data.total || countRes.data.count || 0);
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };
  
  const hasMore = invoices.length < totalCount;
  
  const calculateLineTotal = (line) => {
    const qty = parseFloat(line.quantity) || 0;
    const price = parseFloat(line.unit_price) || 0;
    const discount = parseFloat(line.discount_percent) || 0;
    const subtotal = qty * price;
    const lineTotal = subtotal - (subtotal * discount / 100);
    const rate = parseFloat(line.exchange_rate) || 1;
    const lineTotalUsd = line.currency === 'USD' ? lineTotal : lineTotal / rate;
    return { lineTotal, lineTotalUsd };
  };
  
  const recalculateTotals = (lines, discountPercent, taxPercent) => {
    const subtotalUsd = lines.reduce((sum, l) => sum + (parseFloat(l.line_total_usd) || 0), 0);
    const taxableUsd = lines.reduce((sum, l) => l.is_taxable !== false ? sum + (parseFloat(l.line_total_usd) || 0) : sum, 0);
    const discountAmount = subtotalUsd * (parseFloat(discountPercent) || 0) / 100;
    const afterDiscount = subtotalUsd - discountAmount;
    const taxableAfterDiscount = taxableUsd * (1 - (parseFloat(discountPercent) || 0) / 100);
    const taxAmount = taxableAfterDiscount * (parseFloat(taxPercent) || 0) / 100;
    const totalUsd = afterDiscount + taxAmount;
    return { subtotal: subtotalUsd, discountAmount, taxAmount, total: totalUsd, totalUsd };
  };
  
  const handleLineChange = (index, field, value) => {
    const newLines = [...formData.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    const { lineTotal, lineTotalUsd } = calculateLineTotal(newLines[index]);
    newLines[index].line_total = lineTotal;
    newLines[index].line_total_usd = lineTotalUsd;
    const totals = recalculateTotals(newLines, formData.discount_percent, formData.tax_percent);
    setFormData({ ...formData, lines: newLines, subtotal: totals.subtotal, discount_amount: totals.discountAmount, tax_amount: totals.taxAmount, total: totals.total, total_usd: totals.totalUsd });
  };
  
  const handleItemSelect = (index, item) => {
    const newLines = [...formData.lines];
    newLines[index] = {
      ...newLines[index],
      inventory_item_id: item.id,
      item_name: item.name, item_name_ar: item.name_ar || '',
      barcode: item.barcode || '', unit: item.unit || 'piece',
      unit_price: item.price || 0, currency: item.currency || 'USD',
      exchange_rate: item.currency === 'LBP' ? exchangeRate : 1,
      is_taxable: item.is_taxable !== false,
      discount_percent: item.discount_percent || 0,
      package: item.package || 0,
      pack_description: item.pack_description || ''
    };
    const { lineTotal, lineTotalUsd } = calculateLineTotal(newLines[index]);
    newLines[index].line_total = lineTotal;
    newLines[index].line_total_usd = lineTotalUsd;
    const totals = recalculateTotals(newLines, formData.discount_percent, formData.tax_percent);
    setFormData({ ...formData, lines: newLines, subtotal: totals.subtotal, discount_amount: totals.discountAmount, tax_amount: totals.taxAmount, total: totals.total, total_usd: totals.totalUsd });
  };
  
  const addLine = () => {
    setFormData({ ...formData, lines: [...formData.lines, { ...emptyLine }] });
  };
  
  const removeLine = (index) => {
    if (formData.lines.length <= 1) return;
    const newLines = formData.lines.filter((_, i) => i !== index);
    const totals = recalculateTotals(newLines, formData.discount_percent, formData.tax_percent);
    setFormData({ ...formData, lines: newLines, subtotal: totals.subtotal, discount_amount: totals.discountAmount, tax_amount: totals.taxAmount, total: totals.total, total_usd: totals.totalUsd });
  };
  
  const handleDiscountOrTaxChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    const totals = recalculateTotals(newData.lines, newData.discount_percent, newData.tax_percent);
    setFormData({ ...newData, subtotal: totals.subtotal, discount_amount: totals.discountAmount, tax_amount: totals.taxAmount, total: totals.total, total_usd: totals.totalUsd });
  };
  
  const openCreateForm = () => {
    setEditingInvoice(null);
    setFormData({ ...defaultFormData, organization_id: currentOrg.id });
    setShowForm(true);
  };
  
  const openEditForm = (inv) => {
    if (inv.is_posted) { toast.error('Cannot edit posted invoice'); return; }
    setEditingInvoice(inv);
    setFormData({
      date: inv.date, due_date: inv.due_date || '',
      lines: inv.lines.map(l => ({ ...emptyLine, ...l })),
      subtotal: inv.subtotal, discount_percent: inv.discount_percent || 0,
      discount_amount: inv.discount_amount || 0, tax_percent: inv.tax_percent || 0,
      tax_amount: inv.tax_amount || 0, total: inv.total, total_usd: inv.total_usd,
      currency: inv.currency || 'USD', notes: inv.notes || '',
      debit_account_id: inv.debit_account_id, credit_account_id: inv.credit_account_id,
      organization_id: currentOrg.id
    });
    setShowForm(true);
  };
  
  const handleSave = async () => {
    if (!formData.debit_account_id || !formData.credit_account_id) {
      toast.error('Please select both Customer and Sales accounts');
      return;
    }
    if (formData.lines.length === 0 || !formData.lines[0].item_name) {
      toast.error('Please add at least one line item');
      return;
    }
    setSaving(true);
    try {
      if (editingInvoice) {
        await axios.put(`${API}/sales-invoices/${editingInvoice.id}`, formData);
        toast.success('Sales invoice updated');
      } else {
        await axios.post(`${API}/sales-invoices`, formData);
        toast.success('Sales invoice created');
      }
      setShowForm(false);
      fetchInvoices(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };
  
  const handlePost = async (id) => {
    if (!window.confirm('Post this invoice? This will create a voucher and update inventory.')) return;
    setPosting(true);
    try {
      const res = await axios.post(`${API}/sales-invoices/${id}/post`);
      toast.success(`Posted! Voucher: ${res.data.voucher_number}`);
      fetchInvoices(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to post');
    } finally {
      setPosting(false);
    }
  };
  
  const handleUnpost = async (id) => {
    if (!window.confirm('Unpost this invoice? This will reverse the voucher and inventory changes.')) return;
    setPosting(true);
    try {
      await axios.post(`${API}/sales-invoices/${id}/unpost`);
      toast.success('Invoice unposted');
      fetchInvoices(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to unpost');
    } finally {
      setPosting(false);
    }
  };
  
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this invoice? This cannot be undone.')) return;
    try {
      await axios.delete(`${API}/sales-invoices/${id}`);
      toast.success('Invoice deleted');
      fetchInvoices(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete');
    }
  };
  
  const handlePrint = (inv) => {
    const { printInvoice } = SalesInvoicePrint({
      invoice: inv,
      organization: currentOrg,
      customer: {
        name: inv.debit_account_name || inv.customer_name || '',
        code: inv.debit_account_code || inv.customer_code || '',
        address: inv.customer_address || '',
        registration_number: inv.customer_registration_number || '',
        balance_usd: inv.customer_balance_usd || 0
      }
    });
    printInvoice();
  };

  const handleDownloadPdf = (inv) => {
    const { downloadPdf } = SalesInvoicePrint({
      invoice: inv,
      organization: currentOrg,
      customer: {
        name: inv.debit_account_name || inv.customer_name || '',
        code: inv.debit_account_code || inv.customer_code || '',
        address: inv.customer_address || '',
        registration_number: inv.customer_registration_number || '',
        balance_usd: inv.customer_balance_usd || 0
      }
    });
    downloadPdf();
  };
  
  const allInventoryItems = useMemo(() => {
    return inventoryItems.map(item => ({
      ...item,
      display_name: `${item.item_code || ''} - ${item.name}`.trim()
    }));
  }, [inventoryItems]);
  
  if (!currentOrg) return <div className="p-8 text-center text-muted-foreground">Select an organization</div>;
  
  return (
    <div className="space-y-6" data-testid="sales-invoice-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Sales Invoices
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Manage sales invoices and customer billing</p>
        </div>
        {canEdit() && (
          <Button onClick={openCreateForm} data-testid="create-sales-invoice-btn">
            <Plus className="w-4 h-4 mr-2" /> New Sales Invoice
          </Button>
        )}
      </div>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search invoices..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" data-testid="search-invoices-input" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]" data-testid="filter-status">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : invoices.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No sales invoices found</p>
              {canEdit() && <Button variant="link" onClick={openCreateForm}>Create your first invoice</Button>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="sales-invoices-table">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Invoice #</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Date</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Customer</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground">Total (USD)</th>
                    <th className="text-center p-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-center p-3 text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b hover:bg-muted/20 transition-colors" data-testid={`invoice-row-${inv.id}`}>
                      <td className="p-3 font-mono text-sm">{inv.invoice_number}</td>
                      <td className="p-3 text-sm">{formatDate(inv.date)}</td>
                      <td className="p-3 text-sm">
                        <span className="font-medium">{inv.debit_account_name || ''}</span>
                        <span className="text-muted-foreground ml-1 text-xs">{inv.debit_account_code || ''}</span>
                      </td>
                      <td className="p-3 text-sm text-right font-mono">{formatUSD(inv.total_usd)}</td>
                      <td className="p-3 text-center">
                        <Badge variant={inv.status === 'posted' ? 'default' : 'secondary'} className={inv.status === 'posted' ? 'bg-emerald-600' : ''}>
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewInvoice(inv)} data-testid={`view-invoice-${inv.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePrint(inv)} data-testid={`print-invoice-${inv.id}`}>
                            <Printer className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownloadPdf(inv)} data-testid={`pdf-invoice-${inv.id}`} title="Download PDF">
                            <Download className="w-4 h-4" />
                          </Button>
                          {!inv.is_posted && canEdit() && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditForm(inv)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePost(inv.id)} disabled={posting}>
                                <Send className="w-4 h-4 text-emerald-600" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(inv.id)}>
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </>
                          )}
                          {inv.is_posted && user?.role === 'super_admin' && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleUnpost(inv.id)} disabled={posting}>
                              <Undo2 className="w-4 h-4 text-amber-600" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {hasMore && (
            <div className="p-4 text-center border-t">
              <Button variant="outline" onClick={() => fetchInvoices(false)} disabled={loadingMore}>
                {loadingMore ? 'Loading...' : `Load More (${invoices.length}/${totalCount})`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-[98vw] w-full max-h-[95vh] overflow-y-auto" data-testid="sales-invoice-form-dialog">
          <DialogHeader>
            <DialogTitle>{editingInvoice ? 'Edit Sales Invoice' : 'New Sales Invoice'}</DialogTitle>
            <DialogDescription>Fill in the invoice details</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Date</Label>
                <DateInput value={formData.date} onChange={(val) => setFormData({ ...formData, date: val })} />
              </div>
              <div>
                <Label>Due Date</Label>
                <DateInput value={formData.due_date} onChange={(val) => setFormData({ ...formData, due_date: val })} />
              </div>
              <div>
                <Label>Customer Account (Debit)</Label>
                <AccountSelector
                  fetchUrl="/customer-accounts"
                  fetchParams={{ organization_id: currentOrg.id, ...(selectedFY?.id && { fy_id: selectedFY.id }) }}
                  value={formData.debit_account_id}
                  onChange={(val) => setFormData({ ...formData, debit_account_id: val })}
                  placeholder="Search customer..."
                  accountType="customer"
                />
              </div>
              <div>
                <Label>Sales Account (Credit)</Label>
                <AccountSelector
                  accounts={salesAccounts}
                  value={formData.credit_account_id}
                  onChange={(val) => setFormData({ ...formData, credit_account_id: val })}
                  placeholder="Select sales account..."
                  accountType="account"
                />
              </div>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label className="text-base font-semibold">Line Items</Label>
                <Button variant="outline" size="sm" onClick={addLine} data-testid="add-line-btn">
                  <Plus className="w-4 h-4 mr-1" /> Add Item
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-2 min-w-[200px]">Item</th>
                      <th className="text-center p-2 w-[50px]">Pkg</th>
                      <th className="text-left p-2 w-[80px]">Qty</th>
                      <th className="text-left p-2 w-[80px]">Unit</th>
                      <th className="text-left p-2 w-[100px]">Price</th>
                      <th className="text-left p-2 w-[80px]">Currency</th>
                      <th className="text-left p-2 w-[80px]">Disc %</th>
                      <th className="text-right p-2 w-[100px]">Total</th>
                      <th className="text-right p-2 w-[100px]">USD</th>
                      <th className="p-2 w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.lines.map((line, index) => (
                      <tr key={index} className="border-b" data-testid={`line-row-${index}`}>
                        <td className="p-2">
                          <InventorySelector
                            items={allInventoryItems}
                            value={line.inventory_item_id}
                            onChange={(val) => handleLineChange(index, 'inventory_item_id', val)}
                            onItemSelect={(item) => handleItemSelect(index, item)}
                            placeholder="Search item..."
                            organizationId={currentOrg?.id}
                            apiUrl={API}
                            fallbackLabel={line.item_name || line.item_name_ar}
                          />
                        </td>
                        <td className="p-2 text-center text-xs text-muted-foreground font-mono">
                          {line.package || '-'}
                        </td>
                        <td className="p-2">
                          <Input type="number" value={line.quantity} onChange={(e) => handleLineChange(index, 'quantity', e.target.value)} min="0" step="0.01" className="h-9" />
                        </td>
                        <td className="p-2">
                          <Input value={line.unit} onChange={(e) => handleLineChange(index, 'unit', e.target.value)} className="h-9" />
                        </td>
                        <td className="p-2">
                          <Input type="number" value={line.unit_price} onChange={(e) => handleLineChange(index, 'unit_price', e.target.value)} min="0" step="0.01" className="h-9" />
                        </td>
                        <td className="p-2">
                          <Select value={line.currency} onValueChange={(val) => {
                            handleLineChange(index, 'currency', val);
                            if (val === 'LBP') handleLineChange(index, 'exchange_rate', exchangeRate);
                            else handleLineChange(index, 'exchange_rate', 1);
                          }}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <Input type="number" value={line.discount_percent} onChange={(e) => handleLineChange(index, 'discount_percent', e.target.value)} min="0" max="100" className="h-9" />
                        </td>
                        <td className="p-2 text-right font-mono">{(line.line_total || 0).toFixed(3)}</td>
                        <td className="p-2 text-right font-mono text-primary">{formatUSD(line.line_total_usd || 0)}</td>
                        <td className="p-2">
                          {formData.lines.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLine(index)}>
                              <X className="w-4 h-4 text-red-500" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div>
                  <Label>Notes</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional notes..." rows={3} />
                </div>
              </div>
              <div className="space-y-2 bg-muted/30 rounded-lg p-4">
                <div className="flex justify-between text-sm">
                  <span>Subtotal (USD)</span>
                  <span className="font-mono">{formatUSD(formData.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm gap-2">
                  <span>Discount</span>
                  <div className="flex items-center gap-2">
                    <Input type="number" value={formData.discount_percent} onChange={(e) => handleDiscountOrTaxChange('discount_percent', e.target.value)} min="0" max="100" className="w-20 h-8" />
                    <span>%</span>
                    <span className="font-mono text-red-500">-{formatUSD(formData.discount_amount)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm gap-2">
                  <span>VAT</span>
                  <div className="flex items-center gap-2">
                    <Input type="number" value={formData.tax_percent} onChange={(e) => handleDiscountOrTaxChange('tax_percent', e.target.value)} min="0" max="100" className="w-20 h-8" />
                    <span>%</span>
                    <span className="font-mono">+{formatUSD(formData.tax_amount)}</span>
                  </div>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span>Total (USD)</span>
                  <span className="font-mono text-primary" data-testid="invoice-total">{formatUSD(formData.total_usd)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Approx LBP</span>
                  <span>{(formData.total_usd * exchangeRate).toLocaleString()} LBP</span>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="save-invoice-btn">
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : (editingInvoice ? 'Update Invoice' : 'Create Invoice')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* View Dialog */}
      <Dialog open={!!viewInvoice} onOpenChange={() => setViewInvoice(null)}>
        <DialogContent className="max-w-[95vw] w-full max-h-[90vh] overflow-y-auto" data-testid="view-invoice-dialog">
          {viewInvoice && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Sales Invoice: {viewInvoice.invoice_number}
                  <Badge variant={viewInvoice.status === 'posted' ? 'default' : 'secondary'} className={viewInvoice.status === 'posted' ? 'bg-emerald-600 ml-2' : 'ml-2'}>
                    {viewInvoice.status}
                  </Badge>
                </DialogTitle>
                <DialogDescription>Invoice details and line items</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Date:</span> <strong>{formatDate(viewInvoice.date)}</strong></div>
                  <div><span className="text-muted-foreground">Customer:</span> <strong>{viewInvoice.debit_account_name} ({viewInvoice.debit_account_code})</strong></div>
                  <div><span className="text-muted-foreground">Sales Acc:</span> <strong>{viewInvoice.credit_account_name} ({viewInvoice.credit_account_code})</strong></div>
                  <div><span className="text-muted-foreground">Total:</span> <strong className="text-primary">{formatUSD(viewInvoice.total_usd)}</strong></div>
                  {viewInvoice.voucher_number && <div><span className="text-muted-foreground">Voucher:</span> <strong>{viewInvoice.voucher_number}</strong></div>}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-2">Item</th>
                      <th className="text-right p-2">Qty</th>
                      <th className="text-right p-2">Price</th>
                      <th className="text-right p-2">Disc%</th>
                      <th className="text-right p-2">Total USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewInvoice.lines.map((line, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-2">{line.item_name}</td>
                        <td className="p-2 text-right">{line.quantity} {line.unit}</td>
                        <td className="p-2 text-right">{line.unit_price} {line.currency}</td>
                        <td className="p-2 text-right">{line.discount_percent||0}%</td>
                        <td className="p-2 text-right font-mono">{formatUSD(line.line_total_usd || line.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => handleDownloadPdf(viewInvoice)} data-testid="pdf-from-view-btn">
                    <Download className="w-4 h-4 mr-2" /> Download PDF
                  </Button>
                  <Button onClick={() => handlePrint(viewInvoice)} data-testid="print-from-view-btn">
                    <Printer className="w-4 h-4 mr-2" /> Print Invoice
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesInvoicePage;
