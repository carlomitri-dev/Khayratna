import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { DateInput } from '../components/ui/date-input';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  ClipboardList, Plus, Edit, Trash2, Send, Eye, Printer,
  Search, Filter, Check, Package, Truck, FileText, Save,
  ArrowRight, AlertTriangle, ChevronDown, ChevronUp, Undo2, X, Loader2
} from 'lucide-react';
import axios from 'axios';
import { formatUSD, formatDate } from '../lib/utils';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusColors = {
  draft: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  approved: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  sent: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  received: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  posted: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const statusLabels = {
  draft: 'Draft', approved: 'Approved', sent: 'Sent',
  received: 'Received', posted: 'Posted'
};

const PurchaseOrdersPage = () => {
  const { user, currentOrg, canEdit } = useAuth();
  const { selectedFY } = useFiscalYear();

  // List state
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [viewOrder, setViewOrder] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [postingOrder, setPostingOrder] = useState(null);
  const [posting, setPosting] = useState(false);

  // Supplier & Inventory data
  const [supplierAccounts, setSupplierAccounts] = useState([]);
  const [purchaseAccounts, setPurchaseAccounts] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [showLowStock, setShowLowStock] = useState(false);

  // Post dialog accounts
  const [postDebitId, setPostDebitId] = useState('');
  const [postCreditId, setPostCreditId] = useState('');

  const [exchangeRate] = useState(89500);

  const emptyLine = {
    inventory_item_id: '', item_name: '', item_name_ar: '', barcode: '',
    quantity: 1, unit: 'piece', unit_price: 0, selling_price: 0, currency: 'USD',
    exchange_rate: 1, discount_percent: 0, line_total: 0, line_total_usd: 0,
    batch_number: '', expiry_date: '', notes: ''
  };

  const emptyOrder = {
    date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '',
    order_type: 'supplier',
    supplier_id: '', supplier_name: '', supplier_code: '',
    lines: [{ ...emptyLine }],
    subtotal: 0, discount_percent: 0, discount_amount: 0,
    tax_percent: 0, tax_amount: 0, total: 0, total_usd: 0,
    currency: 'USD', notes: ''
  };

  const [order, setOrder] = useState({ ...emptyOrder });

  // Fetch data on mount
  useEffect(() => {
    if (!currentOrg) return;
    fetchOrders();
    fetchReferenceData();
  }, [currentOrg, filterStatus, filterType]);

  const fetchOrders = async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ organization_id: currentOrg.id });
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterType !== 'all') params.set('order_type', filterType);
      if (searchTerm) params.set('search', searchTerm);
      const res = await axios.get(`${API}/purchase-orders?${params}`);
      setOrders(res.data);
    } catch {
      toast.error('Failed to load purchase orders');
    }
    setLoading(false);
  };

  const fetchReferenceData = async () => {
    if (!currentOrg) return;
    try {
      const [suppRes, purchRes, invRes, lowRes] = await Promise.all([
        axios.get(`${API}/supplier-accounts?organization_id=${currentOrg.id}`).catch(() => ({ data: [] })),
        axios.get(`${API}/purchase-accounts?organization_id=${currentOrg.id}`).catch(() => ({ data: [] })),
        axios.get(`${API}/inventory?organization_id=${currentOrg.id}&limit=500`).catch(() => ({ data: [] })),
        axios.get(`${API}/purchase-orders/low-stock-suggestions?organization_id=${currentOrg.id}`).catch(() => ({ data: [] }))
      ]);
      setSupplierAccounts(suppRes.data);
      setPurchaseAccounts(purchRes.data);
      setInventoryItems(Array.isArray(invRes.data) ? invRes.data : invRes.data?.items || []);
      setLowStockItems(lowRes.data);
    } catch { /* */ }
  };

  // Line item calculations
  const recalcLine = (line) => {
    const qty = parseFloat(line.quantity) || 0;
    const price = parseFloat(line.unit_price) || 0;
    const disc = parseFloat(line.discount_percent) || 0;
    const gross = qty * price;
    const discAmt = gross * disc / 100;
    const total = gross - discAmt;
    const rate = line.currency === 'LBP' ? (parseFloat(line.exchange_rate) || exchangeRate) : 1;
    return { ...line, line_total: total, line_total_usd: line.currency === 'LBP' ? total / rate : total };
  };

  const recalcOrder = useCallback((o) => {
    const lines = o.lines.map(recalcLine);
    const subtotal = lines.reduce((s, l) => s + l.line_total_usd, 0);
    const discAmt = subtotal * (parseFloat(o.discount_percent) || 0) / 100;
    const afterDisc = subtotal - discAmt;
    const taxAmt = afterDisc * (parseFloat(o.tax_percent) || 0) / 100;
    const total_usd = afterDisc + taxAmt;
    return {
      ...o, lines, subtotal: round3(subtotal), discount_amount: round3(discAmt),
      tax_amount: round3(taxAmt), total: round3(total_usd), total_usd: round3(total_usd)
    };
  }, [exchangeRate]);

  const round3 = (v) => Math.round(v * 1000) / 1000;

  const updateLine = (idx, field, value) => {
    const lines = [...order.lines];
    lines[idx] = { ...lines[idx], [field]: value };
    setOrder(recalcOrder({ ...order, lines }));
  };

  const addLine = () => setOrder(prev => ({ ...prev, lines: [...prev.lines, { ...emptyLine }] }));

  const removeLine = (idx) => {
    if (order.lines.length <= 1) return;
    const lines = order.lines.filter((_, i) => i !== idx);
    setOrder(recalcOrder({ ...order, lines }));
  };

  const addLowStockItem = (item) => {
    const newLine = {
      ...emptyLine,
      inventory_item_id: item.id,
      item_name: item.name,
      item_name_ar: item.name_ar || '',
      barcode: item.barcode || '',
      unit: item.unit || 'piece',
      unit_price: item.cost || 0,
      selling_price: item.price || 0,
      quantity: Math.max((item.reorder_level || 5) - (item.on_hand_qty || 0), 1)
    };
    setOrder(prev => recalcOrder({ ...prev, lines: [...prev.lines.filter(l => l.item_name), newLine] }));
    toast.success(`Added ${item.name}`);
  };

  const selectInventoryItem = (idx, item) => {
    const lines = [...order.lines];
    lines[idx] = {
      ...lines[idx],
      inventory_item_id: item.id,
      item_name: item.name,
      item_name_ar: item.name_ar || '',
      barcode: item.barcode || '',
      unit: item.unit || 'piece',
      unit_price: item.cost || 0,
      selling_price: item.price || 0
    };
    setOrder(recalcOrder({ ...order, lines }));
  };

  const selectSupplier = (suppId) => {
    const supp = supplierAccounts.find(s => s.id === suppId);
    if (supp) {
      setOrder(prev => ({ ...prev, supplier_id: supp.id, supplier_name: supp.name, supplier_code: supp.code }));
    }
  };

  // CRUD
  const handleSave = async () => {
    if (!order.lines.some(l => l.item_name)) {
      toast.error('Add at least one line item');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...order, organization_id: currentOrg.id };
      if (editingOrder) {
        await axios.put(`${API}/purchase-orders/${editingOrder.id}`, payload);
        toast.success('Purchase order updated');
      } else {
        await axios.post(`${API}/purchase-orders`, payload);
        toast.success('Purchase order created');
      }
      resetForm();
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    }
    setSaving(false);
  };

  const handleStatusAction = async (orderId, action) => {
    try {
      await axios.put(`${API}/purchase-orders/${orderId}/status?action=${action}`);
      toast.success(`Order ${action}d`);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || `Failed to ${action}`);
    }
  };

  const handlePost = async () => {
    if (!postDebitId || !postCreditId) {
      toast.error('Select both debit and credit accounts');
      return;
    }
    setPosting(true);
    try {
      await axios.post(
        `${API}/purchase-orders/${postingOrder.id}/post?debit_account_id=${postDebitId}&credit_account_id=${postCreditId}`
      );
      toast.success('Purchase order posted as invoice!');
      setShowPostDialog(false);
      setPostingOrder(null);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to post');
    }
    setPosting(false);
  };

  const handleDelete = async (orderId) => {
    if (!window.confirm('Delete this purchase order?')) return;
    try {
      await axios.delete(`${API}/purchase-orders/${orderId}`);
      toast.success('Purchase order deleted');
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    }
  };

  const openEdit = (o) => {
    setEditingOrder(o);
    setOrder({ ...o });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingOrder(null);
    setOrder({ ...emptyOrder });
  };

  // Print
  const printOrder = (o) => {
    const html = `<!DOCTYPE html><html><head><title>PO ${o.order_number}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:12px;padding:15mm;color:#000}
      .header{text-align:center;margin-bottom:8mm;border-bottom:2px solid #000;padding-bottom:4mm}
      .header h1{font-size:20px;margin-bottom:2mm}
      .header h2{font-size:16px;color:#333}
      .meta{display:flex;justify-content:space-between;margin:5mm 0;font-size:11px}
      .meta div{flex:1}
      table{width:100%;border-collapse:collapse;margin:5mm 0}
      th,td{border:1px solid #999;padding:3mm 2mm;text-align:left;font-size:11px}
      th{background:#f0f0f0;font-weight:bold}
      .text-right{text-align:right}
      .totals{width:50%;margin-left:auto;margin-top:5mm}
      .totals td{border:none;padding:1.5mm 2mm}
      .totals .grand{font-size:14px;font-weight:bold;border-top:2px solid #000}
      .footer{margin-top:10mm;font-size:10px;color:#666;text-align:center}
      .badge{display:inline-block;padding:1mm 3mm;border-radius:3px;font-size:10px;font-weight:bold;background:#e0e0e0}
      .badge-draft{background:#ccc;color:#333}
      .badge-approved{background:#c8e6ff;color:#0066cc}
      .badge-sent{background:#e8d5f5;color:#7700cc}
      .badge-received{background:#ffeacc;color:#cc6600}
      .badge-posted{background:#d4edda;color:#006600}
      @media print{body{padding:10mm}@page{size:A4;margin:10mm}}
    </style></head><body>
    <div class="header">
      <h1>PURCHASE ORDER</h1>
      <h2>${o.order_number}</h2>
      <span class="badge badge-${o.status}">${(o.status || '').toUpperCase()}</span>
    </div>
    <div class="meta">
      <div><strong>Date:</strong> ${formatDate(o.date)}<br/>
      ${o.expected_delivery_date ? `<strong>Expected Delivery:</strong> ${formatDate(o.expected_delivery_date)}<br/>` : ''}
      <strong>Type:</strong> ${o.order_type === 'daily_sales' ? 'Daily Sales Order' : 'Supplier Order'}</div>
      <div style="text-align:right">
      ${o.supplier_name ? `<strong>Supplier:</strong> ${o.supplier_code ? `[${o.supplier_code}] ` : ''}${o.supplier_name}<br/>` : ''}
      ${o.purchase_invoice_number ? `<strong>Invoice:</strong> ${o.purchase_invoice_number}<br/>` : ''}
      </div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Item</th><th>Barcode</th><th>Qty</th><th>Unit</th><th>Price</th><th>Sell Price</th><th>Disc%</th><th class="text-right">Total</th></tr></thead>
      <tbody>
      ${o.lines.map((l, i) => `<tr>
        <td>${i + 1}</td><td>${l.item_name}${l.item_name_ar ? `<br/><small>${l.item_name_ar}</small>` : ''}</td>
        <td>${l.barcode || '-'}</td><td>${l.quantity}</td><td>${l.unit}</td>
        <td>$${parseFloat(l.unit_price).toFixed(3)}</td>
        <td>${l.selling_price ? `$${parseFloat(l.selling_price).toFixed(3)}` : '-'}</td>
        <td>${l.discount_percent || 0}%</td>
        <td class="text-right">$${(l.line_total_usd || l.line_total || 0).toFixed(3)}</td>
      </tr>`).join('')}
      </tbody>
    </table>
    <table class="totals">
      <tr><td>Subtotal:</td><td class="text-right">$${o.subtotal.toFixed(3)}</td></tr>
      ${o.discount_amount > 0 ? `<tr><td>Discount (${o.discount_percent}%):</td><td class="text-right">-$${o.discount_amount.toFixed(3)}</td></tr>` : ''}
      ${o.tax_amount > 0 ? `<tr><td>VAT (${o.tax_percent}%):</td><td class="text-right">+$${o.tax_amount.toFixed(3)}</td></tr>` : ''}
      <tr class="grand"><td>TOTAL:</td><td class="text-right">$${o.total_usd.toFixed(3)}</td></tr>
    </table>
    ${o.notes ? `<div style="margin-top:5mm;padding:3mm;background:#f9f9f9;border:1px solid #ddd"><strong>Notes:</strong> ${o.notes}</div>` : ''}
    <div class="footer">
      <p>Printed on ${new Date().toLocaleString()}</p>
    </div>
    </body></html>`;
    const w = window.open('', '_blank', 'width=800,height=900');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // Filtered list
  const filteredOrders = useMemo(() => {
    if (!searchTerm) return orders;
    const s = searchTerm.toLowerCase();
    return orders.filter(o =>
      o.order_number?.toLowerCase().includes(s) ||
      o.supplier_name?.toLowerCase().includes(s) ||
      o.notes?.toLowerCase().includes(s)
    );
  }, [orders, searchTerm]);

  if (!currentOrg) return <div className="p-8 text-muted-foreground text-center">Select an organization</div>;

  // ==================== FORM VIEW ====================
  if (showForm) {
    return (
      <div className="space-y-4 pb-24" data-testid="po-form">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            {editingOrder ? `Edit ${editingOrder.order_number}` : 'New Purchase Order'}
          </h1>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={resetForm}><X className="w-4 h-4 mr-1" />Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} data-testid="save-po-btn">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save Draft
            </Button>
          </div>
        </div>

        {/* Header Fields */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <DateInput value={order.date} onChange={v => setOrder(prev => ({ ...prev, date: v }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expected Delivery</Label>
                <DateInput value={order.expected_delivery_date} onChange={v => setOrder(prev => ({ ...prev, expected_delivery_date: v }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Order Type</Label>
                <Select value={order.order_type} onValueChange={v => setOrder(prev => ({ ...prev, order_type: v }))}>
                  <SelectTrigger className="h-9" data-testid="order-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supplier">Supplier Order</SelectItem>
                    <SelectItem value="daily_sales">Daily Sales Order</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Supplier</Label>
                <Select value={order.supplier_id} onValueChange={selectSupplier}>
                  <SelectTrigger className="h-9" data-testid="supplier-select"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {supplierAccounts.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Low Stock Suggestions */}
        {lowStockItems.length > 0 && (
          <Card className="border-amber-500/30">
            <CardContent className="p-3">
              <button
                onClick={() => setShowLowStock(!showLowStock)}
                className="flex items-center gap-2 w-full text-left"
              >
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-400">Low Stock Items ({lowStockItems.length})</span>
                {showLowStock ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
              </button>
              {showLowStock && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {lowStockItems.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => addLowStockItem(item)}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Stock: {item.on_hand_qty || 0} / Min: {item.reorder_level || 5}
                        </p>
                      </div>
                      <Plus className="w-4 h-4 flex-shrink-0 text-primary" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Line Items */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Line Items</Label>
              <Button variant="outline" size="sm" onClick={addLine}><Plus className="w-3 h-3 mr-1" />Add</Button>
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="p-2 text-left w-8">#</th>
                    <th className="p-2 text-left">Item</th>
                    <th className="p-2 text-left w-20">Barcode</th>
                    <th className="p-2 text-right w-16">Qty</th>
                    <th className="p-2 text-left w-16">Unit</th>
                    <th className="p-2 text-right w-24">Cost</th>
                    <th className="p-2 text-right w-24">Sell Price</th>
                    <th className="p-2 text-right w-16">Disc%</th>
                    <th className="p-2 text-right w-24">Total</th>
                    <th className="p-2 w-20">Batch</th>
                    <th className="p-2 w-24">Expiry</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/10">
                      <td className="p-1 text-muted-foreground">{idx + 1}</td>
                      <td className="p-1">
                        <Select
                          value={line.inventory_item_id || ''}
                          onValueChange={v => {
                            const item = inventoryItems.find(i => i.id === v);
                            if (item) selectInventoryItem(idx, item);
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Select item">{line.item_name || 'Select item'}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {inventoryItems.map(i => (
                              <SelectItem key={i.id} value={i.id}>
                                {i.barcode ? `[${i.barcode}] ` : ''}{i.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-1"><Input className="h-7 text-xs" value={line.barcode || ''} onChange={e => updateLine(idx, 'barcode', e.target.value)} /></td>
                      <td className="p-1"><Input type="number" className="h-7 text-xs text-right" value={line.quantity} onChange={e => updateLine(idx, 'quantity', e.target.value)} min="0" step="1" /></td>
                      <td className="p-1"><Input className="h-7 text-xs" value={line.unit} onChange={e => updateLine(idx, 'unit', e.target.value)} /></td>
                      <td className="p-1"><Input type="number" className="h-7 text-xs text-right" value={line.unit_price} onChange={e => updateLine(idx, 'unit_price', e.target.value)} min="0" step="0.001" /></td>
                      <td className="p-1"><Input type="number" className="h-7 text-xs text-right" value={line.selling_price || ''} onChange={e => updateLine(idx, 'selling_price', e.target.value)} min="0" step="0.001" /></td>
                      <td className="p-1"><Input type="number" className="h-7 text-xs text-right" value={line.discount_percent} onChange={e => updateLine(idx, 'discount_percent', e.target.value)} min="0" max="100" /></td>
                      <td className="p-1 text-right font-mono">${formatUSD(line.line_total_usd || 0)}</td>
                      <td className="p-1"><Input className="h-7 text-xs" value={line.batch_number || ''} onChange={e => updateLine(idx, 'batch_number', e.target.value)} placeholder="Batch" /></td>
                      <td className="p-1"><Input type="date" className="h-7 text-xs" value={line.expiry_date || ''} onChange={e => updateLine(idx, 'expiry_date', e.target.value)} /></td>
                      <td className="p-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeLine(idx)} disabled={order.lines.length <= 1}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden space-y-3">
              {order.lines.map((line, idx) => (
                <Card key={idx} className="bg-muted/10">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-medium">Item #{idx + 1}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeLine(idx)} disabled={order.lines.length <= 1}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                    <Select
                      value={line.inventory_item_id || ''}
                      onValueChange={v => {
                        const item = inventoryItems.find(i => i.id === v);
                        if (item) selectInventoryItem(idx, item);
                      }}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select item">{line.item_name || 'Select item'}</SelectValue></SelectTrigger>
                      <SelectContent>
                        {inventoryItems.map(i => (<SelectItem key={i.id} value={i.id}>{i.barcode ? `[${i.barcode}] ` : ''}{i.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <div className="grid grid-cols-3 gap-2">
                      <div><Label className="text-[10px]">Qty</Label><Input type="number" className="h-8 text-sm" value={line.quantity} onChange={e => updateLine(idx, 'quantity', e.target.value)} /></div>
                      <div><Label className="text-[10px]">Cost</Label><Input type="number" className="h-8 text-sm" value={line.unit_price} onChange={e => updateLine(idx, 'unit_price', e.target.value)} /></div>
                      <div><Label className="text-[10px]">Sell</Label><Input type="number" className="h-8 text-sm" value={line.selling_price || ''} onChange={e => updateLine(idx, 'selling_price', e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div><Label className="text-[10px]">Disc%</Label><Input type="number" className="h-8 text-sm" value={line.discount_percent} onChange={e => updateLine(idx, 'discount_percent', e.target.value)} /></div>
                      <div><Label className="text-[10px]">Batch</Label><Input className="h-8 text-sm" value={line.batch_number || ''} onChange={e => updateLine(idx, 'batch_number', e.target.value)} /></div>
                      <div><Label className="text-[10px]">Expiry</Label><Input type="date" className="h-8 text-sm" value={line.expiry_date || ''} onChange={e => updateLine(idx, 'expiry_date', e.target.value)} /></div>
                    </div>
                    <div className="text-right font-mono text-sm font-medium text-primary">Total: ${formatUSD(line.line_total_usd || 0)}</div>
                  </CardContent>
                </Card>
              ))}
              <Button variant="outline" className="w-full" onClick={addLine}><Plus className="w-4 h-4 mr-1" />Add Item</Button>
            </div>
          </CardContent>
        </Card>

        {/* Totals & Notes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 space-y-2">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={order.notes || ''} rows={3}
                onChange={e => setOrder(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Order notes, supplier ref, delivery instructions..."
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between text-sm"><span>Subtotal:</span><span className="font-mono">${formatUSD(order.subtotal)}</span></div>
              <div className="flex items-center gap-2">
                <span className="text-sm flex-1">Discount:</span>
                <Input type="number" className="h-7 w-16 text-xs text-right" value={order.discount_percent} onChange={e => setOrder(recalcOrder({ ...order, discount_percent: e.target.value }))} min="0" max="100" />
                <span className="text-xs">%</span>
                <span className="font-mono text-sm">-${formatUSD(order.discount_amount)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm flex-1">VAT:</span>
                <Input type="number" className="h-7 w-16 text-xs text-right" value={order.tax_percent} onChange={e => setOrder(recalcOrder({ ...order, tax_percent: e.target.value }))} min="0" max="100" />
                <span className="text-xs">%</span>
                <span className="font-mono text-sm">+${formatUSD(order.tax_amount)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2"><span>Total:</span><span className="font-mono text-primary">${formatUSD(order.total_usd)}</span></div>
            </CardContent>
          </Card>
        </div>

        {/* Mobile sticky save */}
        <div className="fixed bottom-0 left-0 right-0 lg:hidden p-3 bg-background/95 backdrop-blur border-t z-40 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={resetForm}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving} data-testid="save-po-btn-mobile">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Save Draft
          </Button>
        </div>
      </div>
    );
  }

  // ==================== VIEW DIALOG ====================
  const renderViewDialog = () => viewOrder && (
    <Dialog open={!!viewOrder} onOpenChange={() => setViewOrder(null)}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="po-view-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            {viewOrder.order_number}
            <Badge className={statusColors[viewOrder.status]}>{statusLabels[viewOrder.status]}</Badge>
          </DialogTitle>
          <DialogDescription>
            {viewOrder.order_type === 'daily_sales' ? 'Daily Sales Order' : 'Supplier Order'}
            {viewOrder.supplier_name && ` - ${viewOrder.supplier_name}`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><span className="text-muted-foreground text-xs">Date</span><p>{formatDate(viewOrder.date)}</p></div>
          {viewOrder.expected_delivery_date && <div><span className="text-muted-foreground text-xs">Delivery</span><p>{formatDate(viewOrder.expected_delivery_date)}</p></div>}
          <div><span className="text-muted-foreground text-xs">Total</span><p className="font-mono text-primary font-bold">${formatUSD(viewOrder.total_usd)}</p></div>
          {viewOrder.purchase_invoice_number && <div><span className="text-muted-foreground text-xs">Invoice</span><p className="text-emerald-400">{viewOrder.purchase_invoice_number}</p></div>}
        </div>

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs">
            <thead><tr className="border-b bg-muted/20">
              <th className="p-2 text-left">#</th><th className="p-2 text-left">Item</th>
              <th className="p-2 text-right">Qty</th><th className="p-2">Unit</th>
              <th className="p-2 text-right">Cost</th><th className="p-2 text-right">Sell</th>
              <th className="p-2 text-right">Disc%</th><th className="p-2 text-right">Total</th>
            </tr></thead>
            <tbody>
              {viewOrder.lines.map((l, i) => (
                <tr key={i} className="border-b">
                  <td className="p-2">{i + 1}</td>
                  <td className="p-2">{l.item_name}{l.batch_number ? <span className="text-muted-foreground ml-1">[{l.batch_number}]</span> : ''}</td>
                  <td className="p-2 text-right">{l.quantity}</td><td className="p-2">{l.unit}</td>
                  <td className="p-2 text-right font-mono">${formatUSD(l.unit_price)}</td>
                  <td className="p-2 text-right font-mono">{l.selling_price ? `$${formatUSD(l.selling_price)}` : '-'}</td>
                  <td className="p-2 text-right">{l.discount_percent || 0}%</td>
                  <td className="p-2 text-right font-mono">${formatUSD(l.line_total_usd || l.line_total || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col items-end text-sm mt-2 space-y-1">
          <div className="flex gap-8"><span className="text-muted-foreground">Subtotal:</span><span className="font-mono">${formatUSD(viewOrder.subtotal)}</span></div>
          {viewOrder.discount_amount > 0 && <div className="flex gap-8"><span className="text-muted-foreground">Discount ({viewOrder.discount_percent}%):</span><span className="font-mono">-${formatUSD(viewOrder.discount_amount)}</span></div>}
          {viewOrder.tax_amount > 0 && <div className="flex gap-8"><span className="text-muted-foreground">VAT ({viewOrder.tax_percent}%):</span><span className="font-mono">+${formatUSD(viewOrder.tax_amount)}</span></div>}
          <div className="flex gap-8 font-bold text-base border-t pt-1"><span>Total:</span><span className="font-mono text-primary">${formatUSD(viewOrder.total_usd)}</span></div>
        </div>

        {viewOrder.notes && <div className="text-xs text-muted-foreground p-2 bg-muted/20 rounded mt-2">{viewOrder.notes}</div>}

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => printOrder(viewOrder)} data-testid="print-po-btn"><Printer className="w-4 h-4 mr-1" />Print</Button>
          {viewOrder.status === 'draft' && <Button variant="outline" size="sm" onClick={() => { handleStatusAction(viewOrder.id, 'approve'); setViewOrder(null); }}><Check className="w-4 h-4 mr-1" />Approve</Button>}
          {viewOrder.status === 'approved' && <Button variant="outline" size="sm" onClick={() => { handleStatusAction(viewOrder.id, 'send'); setViewOrder(null); }}><Send className="w-4 h-4 mr-1" />Mark Sent</Button>}
          {['approved', 'sent'].includes(viewOrder.status) && <Button variant="outline" size="sm" onClick={() => { handleStatusAction(viewOrder.id, 'receive'); setViewOrder(null); }}><Package className="w-4 h-4 mr-1" />Mark Received</Button>}
          {['approved', 'sent', 'received'].includes(viewOrder.status) && (
            <Button size="sm" onClick={() => { setPostingOrder(viewOrder); setShowPostDialog(true); setViewOrder(null); }} data-testid="post-po-btn">
              <ArrowRight className="w-4 h-4 mr-1" />Post as Invoice
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ==================== POST DIALOG ====================
  const renderPostDialog = () => (
    <Dialog open={showPostDialog} onOpenChange={v => { if (!v) { setShowPostDialog(false); setPostingOrder(null); } }}>
      <DialogContent data-testid="post-po-dialog">
        <DialogHeader>
          <DialogTitle>Post as Purchase Invoice</DialogTitle>
          <DialogDescription>
            Convert {postingOrder?.order_number} to a purchase invoice. Select the accounting accounts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Debit Account (Purchases/Inventory)</Label>
            <Select value={postDebitId} onValueChange={setPostDebitId}>
              <SelectTrigger data-testid="post-debit-select"><SelectValue placeholder="Select debit account" /></SelectTrigger>
              <SelectContent>
                {purchaseAccounts.map(a => (<SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Credit Account (Supplier)</Label>
            <Select value={postCreditId} onValueChange={setPostCreditId}>
              <SelectTrigger data-testid="post-credit-select"><SelectValue placeholder="Select supplier account" /></SelectTrigger>
              <SelectContent>
                {supplierAccounts.map(a => (<SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          {postingOrder && (
            <div className="p-3 bg-muted/20 rounded text-sm">
              <p>Order: <strong>{postingOrder.order_number}</strong></p>
              <p>Total: <strong className="text-primary">${formatUSD(postingOrder.total_usd)}</strong></p>
              <p>Items: {postingOrder.lines.length}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setShowPostDialog(false); setPostingOrder(null); }}>Cancel</Button>
          <Button onClick={handlePost} disabled={posting} data-testid="confirm-post-btn">
            {posting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-1" />}
            Post as Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ==================== LIST VIEW ====================
  return (
    <div className="space-y-4" data-testid="purchase-orders-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            Purchase Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{filteredOrders.length} orders</p>
        </div>
        <Button onClick={() => { setEditingOrder(null); setOrder({ ...emptyOrder }); setShowForm(true); }} data-testid="new-po-btn">
          <Plus className="w-4 h-4 mr-1" />New Order
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchOrders()}
                className="pl-8 h-9"
                data-testid="search-orders-input"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[130px] h-9" data-testid="filter-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px] h-9" data-testid="filter-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="supplier">Supplier</SelectItem>
                <SelectItem value="daily_sales">Daily Sales</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Desktop Table */}
      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="po-table">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="p-3 text-left text-xs">Order #</th>
                    <th className="p-3 text-left text-xs">Date</th>
                    <th className="p-3 text-left text-xs">Type</th>
                    <th className="p-3 text-left text-xs">Supplier</th>
                    <th className="p-3 text-right text-xs">Items</th>
                    <th className="p-3 text-right text-xs">Total</th>
                    <th className="p-3 text-center text-xs">Status</th>
                    <th className="p-3 text-left text-xs">Invoice</th>
                    <th className="p-3 text-right text-xs">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></td></tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No purchase orders found</td></tr>
                  ) : filteredOrders.map(o => (
                    <tr key={o.id} className="border-b hover:bg-muted/10 cursor-pointer" onClick={() => setViewOrder(o)}>
                      <td className="p-3 font-mono font-medium">{o.order_number}</td>
                      <td className="p-3">{formatDate(o.date)}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-[10px]">
                          {o.order_type === 'daily_sales' ? 'Daily' : 'Supplier'}
                        </Badge>
                      </td>
                      <td className="p-3 truncate max-w-[180px]">{o.supplier_name || '-'}</td>
                      <td className="p-3 text-right">{o.lines?.length || 0}</td>
                      <td className="p-3 text-right font-mono">${formatUSD(o.total_usd)}</td>
                      <td className="p-3 text-center"><Badge className={statusColors[o.status]}>{statusLabels[o.status]}</Badge></td>
                      <td className="p-3 text-xs">{o.purchase_invoice_number || '-'}</td>
                      <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewOrder(o)}><Eye className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => printOrder(o)}><Printer className="w-3.5 h-3.5" /></Button>
                          {o.status === 'draft' && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(o)}><Edit className="w-3.5 h-3.5" /></Button>}
                          {o.status !== 'posted' && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(o.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
        ) : filteredOrders.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No purchase orders found</CardContent></Card>
        ) : filteredOrders.map(o => (
          <Card key={o.id} className="cursor-pointer hover:bg-muted/5 transition-colors" onClick={() => setViewOrder(o)}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono font-medium text-sm">{o.order_number}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(o.date)}</p>
                </div>
                <Badge className={statusColors[o.status] + ' text-[10px]'}>{statusLabels[o.status]}</Badge>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="text-xs text-muted-foreground">
                  {o.supplier_name || 'No supplier'} | {o.lines?.length || 0} items
                  <Badge variant="outline" className="text-[9px] ml-1">{o.order_type === 'daily_sales' ? 'Daily' : 'Supplier'}</Badge>
                </div>
                <span className="font-mono font-bold text-primary text-sm">${formatUSD(o.total_usd)}</span>
              </div>
              {o.purchase_invoice_number && <p className="text-[10px] text-emerald-400 mt-1">Invoice: {o.purchase_invoice_number}</p>}
              <div className="flex gap-1 mt-2 justify-end" onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => printOrder(o)}><Printer className="w-3.5 h-3.5" /></Button>
                {o.status === 'draft' && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(o)}><Edit className="w-3.5 h-3.5" /></Button>}
                {o.status !== 'posted' && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(o.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {renderViewDialog()}
      {renderPostDialog()}
    </div>
  );
};

export default PurchaseOrdersPage;
