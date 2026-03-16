import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { DateInput } from '../components/ui/date-input';
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
import { Plus, Trash2, AlertCircle, Save, Send, RefreshCw, Pencil, Undo2, ChevronDown, Filter, WifiOff, Loader2, Check, Search } from 'lucide-react';
import axios from 'axios';
import { formatLBP, formatUSD, getTodayForInput, getVoucherTypeName, formatDate } from '../lib/utils';
import AccountSelector from '../components/shared/RemoteAccountSelector';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Currency selector for each line
const CurrencySelector = ({ currencies, value, onChange }) => {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs w-20">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {currencies.map(curr => (
          <SelectItem key={curr.code} value={curr.code}>
            {curr.code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const VoucherEntryPage = () => {
  const { currentOrg, user } = useAuth();
  const { selectedFY } = useFiscalYear();
  const [accounts, setAccounts] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [baseExchangeRate, setBaseExchangeRate] = useState(89500);
  const [fetchingRate, setFetchingRate] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 20;
  
  const emptyLine = {
    account_code: '',
    account_name: '',
    description: '',
    currency: 'USD',
    exchange_rate: 1.0,
    debit: 0,
    credit: 0,
    debit_lbp: 0,
    credit_lbp: 0,
    debit_usd: 0,
    credit_usd: 0
  };

  const [voucher, setVoucher] = useState({
    voucher_type: 'JV',
    date: getTodayForInput(),
    reference: '',
    description: '',
    lines: [{ ...emptyLine }, { ...emptyLine }]
  });

  const voucherTypes = ['JV', 'RV', 'PV', 'SV', 'PAYV'];

  useEffect(() => {
    if (currentOrg) {
      fetchData();
    }
  }, [currentOrg]);

  // Refetch vouchers when search/filter/FY changes
  useEffect(() => {
    if (currentOrg) {
      setCurrentPage(0);
      fetchVouchers(true);
    }
  }, [searchTerm, filterType, filterStatus, selectedFY]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const rateRes = await axios.get(`${API}/exchange-rates/latest?organization_id=${currentOrg.id}`).catch(() => ({ data: { rate: 89500 } }));
      
      const currencyData = [
            { code: 'USD', name: 'US Dollar', symbol: '$', rate_to_usd: 1, rate_to_lbp: rateRes.data.rate || 89500 },
            { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل', rate_to_usd: 1/(rateRes.data.rate || 89500), rate_to_lbp: 1 }
          ];
      setCurrencies(currencyData);
      setBaseExchangeRate(rateRes.data.rate || 89500);
      
      await fetchVouchers(true);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (!error.response && error.message === 'Network Error') {
        alert('Connection Error: Unable to connect to the server. Please check your internet connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchVouchers = async (reset = false) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    
    try {
      const params = new URLSearchParams({
        organization_id: currentOrg.id,
        skip: reset ? 0 : currentPage * PAGE_SIZE,
        limit: PAGE_SIZE
      });
      
      if (searchTerm) params.append('search', searchTerm);
      if (filterType !== 'all') params.append('voucher_type', filterType);
      if (filterStatus !== 'all') params.append('status', filterStatus);
      
      // Filter by fiscal year date range
      if (selectedFY) {
        params.append('date_from', selectedFY.start_date);
        params.append('date_to', selectedFY.end_date);
      }
      
      const [vouchersRes, countRes] = await Promise.all([
        axios.get(`${API}/vouchers?${params.toString()}`),
        axios.get(`${API}/vouchers/count?${params.toString()}`)
      ]);
      
      if (reset) {
        setVouchers(vouchersRes.data);
        setCurrentPage(1);
      } else {
        setVouchers(prev => [...prev, ...vouchersRes.data]);
        setCurrentPage(prev => prev + 1);
      }
      setTotalCount(countRes.data.count);
    } catch (error) {
      console.error('Failed to fetch vouchers:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    fetchVouchers(false);
  };

  const hasMore = vouchers.length < totalCount;

  const fetchLiveRate = async () => {
    setFetchingRate(true);
    try {
      const response = await axios.get(`${API}/exchange-rates/live`);
      setBaseExchangeRate(response.data.rate);
    } catch (error) {
      console.error('Failed to fetch live rate:', error);
    } finally {
      setFetchingRate(false);
    }
  };

  // Get exchange rate for a currency
  const getExchangeRate = (currencyCode) => {
    const currency = currencies.find(c => c.code === currencyCode);
    if (!currency) return currencyCode === 'USD' ? 1 : 1/baseExchangeRate;
    return currency.rate_to_usd;
  };

  // Convert amount to USD and LBP
  const convertAmounts = (amount, currencyCode) => {
    const rateToUsd = getExchangeRate(currencyCode);
    const amountUsd = amount * rateToUsd;
    const amountLbp = amountUsd * baseExchangeRate;
    return { usd: amountUsd, lbp: amountLbp };
  };

  const handleLineChange = (index, field, value, accountName = null) => {
    const newLines = [...voucher.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    
    // If account_code changed and we have the name, set it
    if (field === 'account_code' && accountName) {
      newLines[index].account_name = accountName;
    } else if (field === 'account_code') {
      const account = accounts.find(a => a.code === value);
      if (account) {
        newLines[index].account_name = account.name;
      }
    }

    // If currency changed, update exchange rate
    if (field === 'currency') {
      newLines[index].exchange_rate = getExchangeRate(value);
    }

    // If debit or credit changed, recalculate converted values
    if (field === 'debit' || field === 'credit' || field === 'currency' || field === 'exchange_rate') {
      const line = newLines[index];
      const debitConverted = convertAmounts(line.debit || 0, line.currency);
      const creditConverted = convertAmounts(line.credit || 0, line.currency);
      newLines[index].debit_usd = debitConverted.usd;
      newLines[index].debit_lbp = debitConverted.lbp;
      newLines[index].credit_usd = creditConverted.usd;
      newLines[index].credit_lbp = creditConverted.lbp;
    }
    
    setVoucher({ ...voucher, lines: newLines });
  };

  const handleAccountSelect = (index, code, name) => {
    handleLineChange(index, 'account_code', code, name);
  };

  const handleCurrencyChange = (index, currencyCode) => {
    handleLineChange(index, 'currency', currencyCode);
  };

  const addLine = () => {
    setVoucher({
      ...voucher,
      lines: [...voucher.lines, { ...emptyLine }]
    });
  };

  const removeLine = (index) => {
    if (voucher.lines.length > 2) {
      const newLines = voucher.lines.filter((_, i) => i !== index);
      setVoucher({ ...voucher, lines: newLines });
    }
  };

  const resetForm = () => {
    setVoucher({
      voucher_type: 'JV',
      date: getTodayForInput(),
      reference: '',
      description: '',
      lines: [{ ...emptyLine }, { ...emptyLine }]
    });
    setEditingVoucher(null);
  };

  // Calculate totals
  const calculateTotals = () => {
    let totalDebitUsd = 0;
    let totalCreditUsd = 0;
    let totalDebitLbp = 0;
    let totalCreditLbp = 0;

    voucher.lines.forEach(line => {
      totalDebitUsd += line.debit_usd || 0;
      totalCreditUsd += line.credit_usd || 0;
      totalDebitLbp += line.debit_lbp || 0;
      totalCreditLbp += line.credit_lbp || 0;
    });

    return { totalDebitUsd, totalCreditUsd, totalDebitLbp, totalCreditLbp };
  };

  const isVoucherBalanced = () => {
    const totals = calculateTotals();
    return Math.abs(totals.totalDebitUsd - totals.totalCreditUsd) < 0.01;
  };

  const handleSave = async (shouldPost = false) => {
    if (!voucher.description) {
      alert('Please enter a description');
      return;
    }

    const validLines = voucher.lines.filter(l => l.account_code);
    if (validLines.length < 2) {
      alert('Please enter at least 2 lines with account codes');
      return;
    }

    if (shouldPost && !isVoucherBalanced()) {
      alert('Cannot post: Voucher is not balanced. Total Debits (USD) must equal Total Credits (USD).');
      return;
    }

    setSaving(true);
    try {
      if (editingVoucher) {
        // Update existing voucher
        const payload = {
          voucher_type: voucher.voucher_type,
          date: voucher.date,
          reference: voucher.reference,
          description: voucher.description,
          lines: validLines
        };
        
        await axios.put(`${API}/vouchers/${editingVoucher.id}`, payload);
        
        if (shouldPost && !editingVoucher.is_posted) {
          await axios.post(`${API}/vouchers/${editingVoucher.id}/post`);
        }
        
        alert('Voucher updated successfully!');
      } else {
        // Create new voucher
        const payload = {
          voucher_type: voucher.voucher_type,
          date: voucher.date,
          reference: voucher.reference,
          description: voucher.description,
          lines: validLines,
          organization_id: currentOrg.id
        };

        const response = await axios.post(`${API}/vouchers`, payload);
        
        if (shouldPost) {
          await axios.post(`${API}/vouchers/${response.data.id}/post`);
        }
        
        alert(shouldPost ? 'Voucher saved and posted successfully!' : 'Voucher saved as draft');
      }
      
      fetchData();
      resetForm();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save voucher');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (v) => {
    setEditingVoucher(v);
    setVoucher({
      voucher_type: v.voucher_type,
      date: v.date,
      reference: v.reference || '',
      description: v.description,
      lines: v.lines.map(l => ({
        account_code: l.account_code,
        account_name: l.account_name,
        description: l.description || '',
        currency: l.currency || 'USD',
        exchange_rate: l.exchange_rate || 1.0,
        debit: l.debit || 0,
        credit: l.credit || 0,
        debit_lbp: l.debit_lbp || 0,
        credit_lbp: l.credit_lbp || 0,
        debit_usd: l.debit_usd || 0,
        credit_usd: l.credit_usd || 0
      }))
    });
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    
    try {
      await axios.delete(`${API}/vouchers/${deleteConfirm.id}`);
      fetchData();
      setDeleteConfirm(null);
      alert('Voucher deleted successfully!');
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete voucher');
    }
  };

  const handleUnpost = async (voucherId) => {
    try {
      await axios.post(`${API}/vouchers/${voucherId}/unpost`);
      fetchData();
      alert('Voucher unposted successfully!');
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to unpost voucher');
    }
  };

  const handlePostVoucher = async (voucherId) => {
    try {
      await axios.post(`${API}/vouchers/${voucherId}/post`);
      fetchData();
      alert('Voucher posted successfully!');
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to post voucher');
    }
  };

  const totals = calculateTotals();
  const isBalanced = isVoucherBalanced();
  const isSuperAdmin = user?.role === 'super_admin';
  const canDelete = user?.role === 'super_admin' || user?.role === 'admin';

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6" data-testid="voucher-entry-page">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Voucher Entry
        </h1>
        <p className="text-muted-foreground text-xs lg:text-sm mt-1">
          Create journal, receipt, payment, sales, and payroll vouchers with multi-currency support
        </p>
      </div>

      {/* Voucher Form */}
      <Card data-testid="voucher-form">
        <CardHeader className="pb-3 lg:pb-6">
          <CardTitle className="text-base lg:text-lg flex items-center justify-between" style={{ fontFamily: 'Manrope, sans-serif' }}>
            <span>{editingVoucher ? `Edit Voucher: ${editingVoucher.voucher_number}` : 'New Voucher'}</span>
            {editingVoucher && (
              <Button variant="ghost" size="sm" onClick={resetForm}>
                Cancel Edit
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 lg:space-y-6">
          {/* Header Fields */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <div className="space-y-2">
              <Label className="text-xs lg:text-sm">Voucher Type</Label>
              <Select
                value={voucher.voucher_type}
                onValueChange={(value) => setVoucher({ ...voucher, voucher_type: value })}
              >
                <SelectTrigger data-testid="voucher-type-select" className="text-xs lg:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {voucherTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type} - {getVoucherTypeName(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs lg:text-sm">Date</Label>
              <DateInput
                value={voucher.date}
                onChange={(e) => setVoucher({ ...voucher, date: e.target.value })}
                className="text-xs lg:text-sm"
                data-testid="voucher-date"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs lg:text-sm">Base Rate (LBP/USD)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={baseExchangeRate}
                  onChange={(e) => setBaseExchangeRate(parseFloat(e.target.value) || 89500)}
                  className="font-mono text-xs lg:text-sm"
                  data-testid="base-exchange-rate"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={fetchLiveRate}
                  disabled={fetchingRate}
                  title="Fetch live rate"
                  data-testid="fetch-live-rate-btn"
                >
                  <RefreshCw className={`w-4 h-4 ${fetchingRate ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs lg:text-sm">Reference</Label>
              <Input
                placeholder="Invoice #, Check #, etc."
                value={voucher.reference}
                onChange={(e) => setVoucher({ ...voucher, reference: e.target.value })}
                className="text-xs lg:text-sm"
                data-testid="voucher-reference"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs lg:text-sm">Description</Label>
            <Input
              placeholder="Brief description"
              value={voucher.description}
              onChange={(e) => setVoucher({ ...voucher, description: e.target.value })}
              required
              className="text-xs lg:text-sm"
              data-testid="voucher-description"
            />
          </div>

          {/* Voucher Lines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs lg:text-sm">Voucher Lines (Per-Line Currency)</Label>
              <Button variant="outline" size="sm" onClick={addLine} data-testid="add-line-btn" className="text-xs">
                <Plus className="w-3 h-3 lg:w-4 lg:h-4 mr-1" />
                Add Line
              </Button>
            </div>

            {/* Mobile-friendly lines display */}
            <div className="space-y-3 lg:hidden">
              {voucher.lines.map((line, index) => (
                <div key={index} className="p-3 bg-muted/20 rounded-sm border border-border space-y-2" data-testid={`voucher-line-${index}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Line {index + 1}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeLine(index)} disabled={voucher.lines.length <= 2}>
                      <Trash2 className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </div>
                  <AccountSelector
                    organizationId={currentOrg?.id}
                    value={line.account_code}
                    onChange={(code, name) => handleAccountSelect(index, code, name)}
                    placeholder="Search account..."
                    compact
                  />
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Currency</Label>
                      <CurrencySelector
                        currencies={currencies}
                        value={line.currency}
                        onChange={(val) => handleCurrencyChange(index, val)}
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Rate to USD</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        className="text-xs font-mono h-8"
                        value={line.exchange_rate}
                        onChange={(e) => handleLineChange(index, 'exchange_rate', parseFloat(e.target.value) || 1)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Debit ({line.currency})</Label>
                      <Input
                        type="number"
                        step="0.01"
                        className="text-xs font-mono"
                        value={line.debit || ''}
                        onChange={(e) => handleLineChange(index, 'debit', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Credit ({line.currency})</Label>
                      <Input
                        type="number"
                        step="0.01"
                        className="text-xs font-mono"
                        value={line.credit || ''}
                        onChange={(e) => handleLineChange(index, 'credit', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  {(line.debit > 0 || line.credit > 0) && (
                    <div className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                      USD: D {formatUSD(line.debit_usd)} / C {formatUSD(line.credit_usd)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block border border-border rounded-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left w-72">Account (5+ digits only)</th>
                    <th className="px-3 py-2 text-left w-40">Description</th>
                    <th className="px-3 py-2 text-center w-20">Currency</th>
                    <th className="px-3 py-2 text-right w-24">Rate</th>
                    <th className="px-3 py-2 text-right w-28">Debit</th>
                    <th className="px-3 py-2 text-right w-28">Credit</th>
                    <th className="px-3 py-2 text-right w-28">Debit (USD)</th>
                    <th className="px-3 py-2 text-right w-28">Credit (USD)</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {voucher.lines.map((line, index) => (
                    <tr key={index} className="border-t border-border" data-testid={`voucher-line-${index}`}>
                      <td className="px-2 py-1">
                        <AccountSelector
                          organizationId={currentOrg?.id}
                          value={line.account_code}
                          onChange={(code, name) => handleAccountSelect(index, code, name)}
                          placeholder="Search account..."
                          compact
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input className="h-8 text-xs" placeholder="Line desc" value={line.description} onChange={(e) => handleLineChange(index, 'description', e.target.value)} />
                      </td>
                      <td className="px-2 py-1">
                        <CurrencySelector
                          currencies={currencies}
                          value={line.currency}
                          onChange={(val) => handleCurrencyChange(index, val)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input type="number" step="0.0001" className="h-8 text-xs font-mono text-right" value={line.exchange_rate} onChange={(e) => handleLineChange(index, 'exchange_rate', parseFloat(e.target.value) || 1)} />
                      </td>
                      <td className="px-2 py-1">
                        <Input type="number" step="0.01" className="h-8 text-xs font-mono text-right" placeholder="0.00" value={line.debit || ''} onChange={(e) => handleLineChange(index, 'debit', parseFloat(e.target.value) || 0)} />
                      </td>
                      <td className="px-2 py-1">
                        <Input type="number" step="0.01" className="h-8 text-xs font-mono text-right" placeholder="0.00" value={line.credit || ''} onChange={(e) => handleLineChange(index, 'credit', parseFloat(e.target.value) || 0)} />
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-xs text-muted-foreground">
                        {formatUSD(line.debit_usd)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-xs text-muted-foreground">
                        {formatUSD(line.credit_usd)}
                      </td>
                      <td className="px-2 py-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLine(index)} disabled={voucher.lines.length <= 2}>
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 font-medium">
                  <tr className="border-t border-border">
                    <td colSpan={4} className="px-3 py-2 text-right">Totals (USD):</td>
                    <td className="px-2 py-2 text-right font-mono">{formatUSD(totals.totalDebitUsd)}</td>
                    <td className="px-2 py-2 text-right font-mono">{formatUSD(totals.totalCreditUsd)}</td>
                    <td className="px-2 py-2 text-right font-mono text-primary">${formatUSD(totals.totalDebitUsd)}</td>
                    <td className="px-2 py-2 text-right font-mono text-primary">${formatUSD(totals.totalCreditUsd)}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right">Totals (LBP):</td>
                    <td colSpan={4} className="px-2 py-2 text-right font-mono">
                      D: {formatLBP(totals.totalDebitLbp)} | C: {formatLBP(totals.totalCreditLbp)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile totals */}
            <div className="lg:hidden p-3 bg-muted/30 rounded-sm space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Debit (USD):</span>
                <span className="font-mono">${formatUSD(totals.totalDebitUsd)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Credit (USD):</span>
                <span className="font-mono">${formatUSD(totals.totalCreditUsd)}</span>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t border-border/50">
                <span className="text-muted-foreground">Total Debit (LBP):</span>
                <span className="font-mono">{formatLBP(totals.totalDebitLbp)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Credit (LBP):</span>
                <span className="font-mono">{formatLBP(totals.totalCreditLbp)}</span>
              </div>
            </div>
          </div>

          {/* Balance Status */}
          <div className={`flex items-center gap-2 p-3 rounded-sm ${isBalanced ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
            {isBalanced ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-sm">
              {isBalanced ? 'Voucher is balanced' : `Out of balance by $${formatUSD(Math.abs(totals.totalDebitUsd - totals.totalCreditUsd))}`}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
            <Button 
              variant="outline" 
              onClick={() => handleSave(false)} 
              disabled={saving}
              className="text-xs lg:text-sm"
              data-testid="save-draft-btn"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save as Draft'}
            </Button>
            <Button 
              onClick={() => handleSave(true)} 
              disabled={saving || !isBalanced}
              className="btn-glow text-xs lg:text-sm"
              data-testid="save-post-btn"
            >
              <Send className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save & Post'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Vouchers */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base lg:text-lg" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Vouchers ({totalCount})
            </CardTitle>
            
            {/* Search and Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search voucher #, desc, account..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[90px] h-8 text-xs">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {voucherTypes.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[100px] h-8 text-xs">
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
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><div className="spinner" /></div>
          ) : vouchers.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {searchTerm || filterType !== 'all' || filterStatus !== 'all' 
                ? 'No vouchers match your search' 
                : 'No vouchers found'}
            </p>
          ) : (
            <>
              {/* Mobile list */}
              <div className="lg:hidden space-y-3">
                {vouchers.map((v) => (
                  <div key={v.id} className="p-3 bg-muted/20 rounded-sm border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs">{v.voucher_number}</span>
                      <span className={v.is_posted ? 'status-posted' : 'status-draft'}>{v.is_posted ? 'Posted' : 'Draft'}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">{formatDate(v.date)} • {v.description}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs font-mono">
                        ${formatUSD(v.total_debit_usd)}
                      </span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleEdit(v)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        {v.is_posted && isSuperAdmin && (
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleUnpost(v.id)}>
                            <Undo2 className="w-3 h-3" />
                          </Button>
                        )}
                        {!v.is_posted && (
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handlePostVoucher(v.id)}>Post</Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400" onClick={() => setDeleteConfirm(v)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Load More Button - Mobile */}
                {hasMore && (
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <><div className="spinner-sm mr-2" /> Loading...</>
                    ) : (
                      <><ChevronDown className="w-4 h-4 mr-2" /> Load More ({vouchers.length} of {totalCount})</>
                    )}
                  </Button>
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Voucher #</th>
                      <th>Type</th>
                      <th>Date</th>
                      <th>Description</th>
                      <th className="text-right">Debit (USD)</th>
                      <th className="text-right">Credit (USD)</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vouchers.map((v) => (
                      <tr key={v.id}>
                        <td className="font-mono text-sm">{v.voucher_number}</td>
                        <td><span className={`px-2 py-0.5 rounded-sm text-xs border voucher-${v.voucher_type.toLowerCase()}`}>{v.voucher_type}</span></td>
                        <td className="text-muted-foreground">{formatDate(v.date)}</td>
                        <td className="max-w-[200px] truncate">{v.description}</td>
                        <td className="number text-right"><span className="currency-usd">${formatUSD(v.total_debit_usd)}</span></td>
                        <td className="number text-right"><span className="currency-usd">${formatUSD(v.total_credit_usd)}</span></td>
                        <td><span className={v.is_posted ? 'status-posted' : 'status-draft'}>{v.is_posted ? 'Posted' : 'Draft'}</span></td>
                        <td>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(v)} title="Edit">
                              <Pencil className="w-3 h-3" />
                            </Button>
                            {v.is_posted && isSuperAdmin && (
                              <Button variant="ghost" size="sm" onClick={() => handleUnpost(v.id)} title="Unpost">
                                <Undo2 className="w-3 h-3" />
                              </Button>
                            )}
                            {!v.is_posted && (
                              <Button variant="ghost" size="sm" onClick={() => handlePostVoucher(v.id)}>Post</Button>
                            )}
                            {canDelete && (
                              <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setDeleteConfirm(v)} title="Delete">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* Load More Button - Desktop */}
                {hasMore && (
                  <div className="mt-4 text-center">
                    <Button 
                      variant="outline" 
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <><div className="spinner-sm mr-2" /> Loading...</>
                      ) : (
                        <><ChevronDown className="w-4 h-4 mr-2" /> Load More ({vouchers.length} of {totalCount})</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Voucher</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete voucher <strong>{deleteConfirm?.voucher_number}</strong>?
              {deleteConfirm?.is_posted && (
                <span className="block mt-2 text-amber-400">
                  Warning: This voucher is posted. Deleting it will reverse all account entries.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VoucherEntryPage;
