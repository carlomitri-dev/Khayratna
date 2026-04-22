import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { DateInput } from '../components/ui/date-input';
import { Badge } from '../components/ui/badge';
import AccountSelector from '../components/selectors/AccountSelector';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import {
  Plus, Trash2, Send, Eye, Undo2, Save, Receipt, X, Loader2, ChevronDown, ChevronUp
} from 'lucide-react';
import axios from 'axios';
import { formatUSD } from '../lib/utils';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const emptyDebitLine = { account_id: '', account_code: '', account_name: '', description: '', reference: '', currency: 'USD', exchange_rate: 1, amount_usd: 0, amount_lbp: 0 };
const emptyCredLine = { account_id: '', account_code: '', account_name: '', description: '', reference: '', currency: 'USD', exchange_rate: 1, amount_usd: 0, amount_lbp: 0 };

const PurchaseExpenseDialog = ({ open, onOpenChange, invoice, organizationId, onSaved }) => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [showDistribution, setShowDistribution] = useState(null);
  const [distributionData, setDistributionData] = useState(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0].split('-').reverse().join('-'),
    exchange_rate: 89500,
    debit_lines: [{ ...emptyDebitLine }],
    credit_lines: [{ ...emptyCredLine }],
    notes: '',
  });

  const fetchExpenses = useCallback(async () => {
    if (!invoice?.id || !organizationId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/purchase-expenses?organization_id=${organizationId}&purchase_invoice_id=${invoice.id}`);
      setExpenses(res.data);
    } catch (err) {
      console.error('Failed to fetch expenses:', err);
    } finally {
      setLoading(false);
    }
  }, [invoice?.id, organizationId]);

  useEffect(() => {
    if (open && invoice?.id) fetchExpenses();
  }, [open, invoice?.id, fetchExpenses]);

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0].split('-').reverse().join('-'),
      exchange_rate: 89500,
      debit_lines: [{ ...emptyDebitLine }],
      credit_lines: [{ ...emptyCredLine }],
      notes: '',
    });
    setEditingExpense(null);
  };

  const openNewForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (exp) => {
    setEditingExpense(exp);
    setFormData({
      date: exp.date,
      exchange_rate: exp.exchange_rate || 89500,
      debit_lines: exp.debit_lines.length > 0 ? exp.debit_lines.map(l => ({ ...emptyDebitLine, ...l })) : [{ ...emptyDebitLine }],
      credit_lines: exp.credit_lines.length > 0 ? exp.credit_lines.map(l => ({ ...emptyCredLine, ...l })) : [{ ...emptyCredLine }],
      notes: exp.notes || '',
    });
    setShowForm(true);
  };

  // Calculate totals
  const totalDebitUsd = formData.debit_lines.reduce((s, l) => s + (parseFloat(l.amount_usd) || 0), 0);
  const totalCreditUsd = formData.credit_lines.reduce((s, l) => s + (parseFloat(l.amount_usd) || 0), 0);
  const totalDebitLbp = formData.debit_lines.reduce((s, l) => s + (parseFloat(l.amount_lbp) || 0), 0);
  const totalCreditLbp = formData.credit_lines.reduce((s, l) => s + (parseFloat(l.amount_lbp) || 0), 0);
  const isBalanced = Math.abs(totalDebitUsd - totalCreditUsd) < 0.01;

  const updateDebitLine = (idx, field, value) => {
    const lines = [...formData.debit_lines];
    lines[idx] = { ...lines[idx], [field]: value };
    // Auto-calc LBP from USD
    if (field === 'amount_usd') {
      lines[idx].amount_lbp = (parseFloat(value) || 0) * formData.exchange_rate;
    }
    setFormData({ ...formData, debit_lines: lines });
  };

  const updateCreditLine = (idx, field, value) => {
    const lines = [...formData.credit_lines];
    lines[idx] = { ...lines[idx], [field]: value };
    if (field === 'amount_usd') {
      lines[idx].amount_lbp = (parseFloat(value) || 0) * formData.exchange_rate;
    }
    setFormData({ ...formData, credit_lines: lines });
  };

  const addDebitLine = () => setFormData({ ...formData, debit_lines: [...formData.debit_lines, { ...emptyDebitLine }] });
  const addCreditLine = () => setFormData({ ...formData, credit_lines: [...formData.credit_lines, { ...emptyCredLine }] });
  const removeDebitLine = (idx) => {
    if (formData.debit_lines.length <= 1) return;
    setFormData({ ...formData, debit_lines: formData.debit_lines.filter((_, i) => i !== idx) });
  };
  const removeCreditLine = (idx) => {
    if (formData.credit_lines.length <= 1) return;
    setFormData({ ...formData, credit_lines: formData.credit_lines.filter((_, i) => i !== idx) });
  };

  const handleAccountSelect = (type, idx, accountId, accountData) => {
    if (type === 'debit') {
      const lines = [...formData.debit_lines];
      lines[idx] = { ...lines[idx], account_id: accountId, account_code: accountData?.code || '', account_name: accountData?.name || '' };
      setFormData({ ...formData, debit_lines: lines });
    } else {
      const lines = [...formData.credit_lines];
      lines[idx] = { ...lines[idx], account_id: accountId, account_code: accountData?.code || '', account_name: accountData?.name || '' };
      setFormData({ ...formData, credit_lines: lines });
    }
  };

  const handleSave = async () => {
    if (!isBalanced) {
      toast.error('Total debit must equal total credit');
      return;
    }
    const hasDebit = formData.debit_lines.some(l => l.account_code && parseFloat(l.amount_usd) > 0);
    const hasCredit = formData.credit_lines.some(l => l.account_code && parseFloat(l.amount_usd) > 0);
    if (!hasDebit || !hasCredit) {
      toast.error('Add at least one debit and one credit line with amounts');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        purchase_invoice_id: invoice.id,
        date: formData.date,
        exchange_rate: parseFloat(formData.exchange_rate) || 89500,
        debit_lines: formData.debit_lines.filter(l => l.account_code).map(l => ({
          ...l, amount_usd: parseFloat(l.amount_usd) || 0, amount_lbp: parseFloat(l.amount_lbp) || 0,
          exchange_rate: parseFloat(formData.exchange_rate) || 89500,
        })),
        credit_lines: formData.credit_lines.filter(l => l.account_code).map(l => ({
          ...l, amount_usd: parseFloat(l.amount_usd) || 0, amount_lbp: parseFloat(l.amount_lbp) || 0,
          exchange_rate: parseFloat(formData.exchange_rate) || 89500,
        })),
        total_usd: totalDebitUsd,
        total_lbp: totalDebitLbp,
        notes: formData.notes,
        organization_id: organizationId,
      };
      if (editingExpense) {
        await axios.put(`${API}/purchase-expenses/${editingExpense.id}`, payload);
        toast.success('Purchase expense updated');
      } else {
        await axios.post(`${API}/purchase-expenses`, payload);
        toast.success('Purchase expense created');
      }
      setShowForm(false);
      resetForm();
      fetchExpenses();
      if (onSaved) onSaved();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async (expId) => {
    setPosting(true);
    try {
      const res = await axios.post(`${API}/purchase-expenses/${expId}/post`);
      toast.success('Expense posted & inventory costs updated');
      fetchExpenses();
      if (onSaved) onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  const handleUnpost = async (expId) => {
    try {
      await axios.post(`${API}/purchase-expenses/${expId}/unpost`);
      toast.success('Expense unposted & inventory costs reverted');
      fetchExpenses();
      if (onSaved) onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to unpost');
    }
  };

  const handleDelete = async (expId) => {
    try {
      await axios.delete(`${API}/purchase-expenses/${expId}`);
      toast.success('Expense deleted');
      fetchExpenses();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    }
  };

  const handlePreviewDistribution = async (expId) => {
    if (showDistribution === expId) {
      setShowDistribution(null);
      setDistributionData(null);
      return;
    }
    try {
      const res = await axios.get(`${API}/purchase-expenses/${expId}/distribution-preview`);
      setDistributionData(res.data);
      setShowDistribution(expId);
    } catch (err) {
      toast.error('Failed to load distribution preview');
    }
  };

  const renderExpenseLineTable = (type, lines, updateFn, addFn, removeFn, disabled) => (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <Label className="text-sm font-semibold">
          {type === 'debit' ? 'Debit Accounts (Expenses)' : 'Credit Accounts (Payables)'}
        </Label>
        {!disabled && (
          <Button variant="outline" size="sm" onClick={addFn} data-testid={`add-${type}-line-btn`}>
            <Plus className="w-3 h-3 mr-1" /> Add
          </Button>
        )}
      </div>
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2 w-[280px]">Account</th>
              <th className="text-left p-2">Description</th>
              <th className="text-left p-2 w-[80px]">Ref</th>
              <th className="text-right p-2 w-[120px]">Amount USD</th>
              <th className="text-right p-2 w-[140px]">Amount LBP</th>
              {!disabled && <th className="w-[40px]"></th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="border-t">
                <td className="p-1">
                  <AccountSelector
                    fetchUrl="/accounts/movable/list"
                    fetchParams={{ organization_id: organizationId }}
                    value={line.account_id}
                    onChange={(id) => {
                      axios.get(`${API}/accounts/${id}`).then(res => {
                        updateFn(idx, 'account_id', id);
                        const lines2 = type === 'debit' ? [...formData.debit_lines] : [...formData.credit_lines];
                        lines2[idx] = { ...lines2[idx], account_id: id, account_code: res.data.code, account_name: res.data.name };
                        setFormData(prev => ({
                          ...prev,
                          [type === 'debit' ? 'debit_lines' : 'credit_lines']: lines2
                        }));
                      }).catch(() => updateFn(idx, 'account_id', id));
                    }}
                    placeholder="Select..."
                    showBalance={false}
                    disabled={disabled}
                    data-testid={`${type}-account-${idx}`}
                  />
                </td>
                <td className="p-1">
                  <Input value={line.description || ''} onChange={e => updateFn(idx, 'description', e.target.value)} placeholder="Description" className="h-8 text-xs" disabled={disabled} />
                </td>
                <td className="p-1">
                  <Input value={line.reference || ''} onChange={e => updateFn(idx, 'reference', e.target.value)} placeholder="Ref" className="h-8 text-xs" disabled={disabled} />
                </td>
                <td className="p-1">
                  <Input type="number" step="0.01" value={line.amount_usd || ''} onChange={e => updateFn(idx, 'amount_usd', e.target.value)} className="h-8 text-xs text-right" disabled={disabled} data-testid={`${type}-amount-usd-${idx}`} />
                </td>
                <td className="p-1">
                  <Input type="number" step="1" value={Math.round(line.amount_lbp) || ''} onChange={e => updateFn(idx, 'amount_lbp', e.target.value)} className="h-8 text-xs text-right" disabled={disabled} />
                </td>
                {!disabled && (
                  <td className="p-1 text-center">
                    {lines.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeFn(idx)} className="h-7 w-7 p-0 text-red-400 hover:text-red-600">
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30 font-semibold">
            <tr className="border-t">
              <td colSpan={3} className="p-2 text-right text-xs">Total:</td>
              <td className="p-2 text-right text-xs">${formatUSD(type === 'debit' ? totalDebitUsd : totalCreditUsd)}</td>
              <td className="p-2 text-right text-xs">{(type === 'debit' ? totalDebitLbp : totalCreditLbp).toLocaleString()} LBP</td>
              {!disabled && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] w-full max-h-[95vh] overflow-y-auto" data-testid="purchase-expense-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Purchase Expenses - {invoice?.invoice_number}
          </DialogTitle>
          <DialogDescription>
            Additional costs (shipping, customs, insurance) for this purchase invoice.
            Costs are distributed proportionally across items when posted.
          </DialogDescription>
        </DialogHeader>

        {/* Expense List */}
        {!showForm && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{expenses.length} expense(s)</span>
              <Button onClick={openNewForm} size="sm" data-testid="add-purchase-expense-btn">
                <Plus className="w-4 h-4 mr-1" /> New Expense
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No expenses yet. Click "New Expense" to add shipping, customs, or other costs.
              </div>
            ) : (
              <div className="space-y-3">
                {expenses.map(exp => (
                  <Card key={exp.id} className="border">
                    <CardContent className="p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold">{exp.expense_number}</span>
                            <Badge variant={exp.is_posted ? 'default' : 'secondary'} className="text-[10px]">
                              {exp.is_posted ? 'Posted' : 'Draft'}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Date: {exp.date} | Total: <span className="font-semibold text-foreground">${formatUSD(exp.total_usd)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Debit: {exp.debit_lines?.length || 0} lines | Credit: {exp.credit_lines?.length || 0} lines
                          </div>
                          {exp.notes && <div className="text-xs text-muted-foreground mt-0.5 italic">{exp.notes}</div>}
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handlePreviewDistribution(exp.id)} title="Distribution Preview" data-testid={`preview-dist-${exp.id}`}>
                            {showDistribution === exp.id ? <ChevronUp className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                          {!exp.is_posted && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => openEditForm(exp)} title="Edit"><Save className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="sm" onClick={() => handlePost(exp.id)} disabled={posting} title="Post" className="text-green-500 hover:text-green-700" data-testid={`post-expense-${exp.id}`}>
                                <Send className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(exp.id)} title="Delete" className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></Button>
                            </>
                          )}
                          {exp.is_posted && (
                            <Button variant="ghost" size="sm" onClick={() => handleUnpost(exp.id)} title="Unpost" className="text-orange-400 hover:text-orange-600"><Undo2 className="w-4 h-4" /></Button>
                          )}
                        </div>
                      </div>
                      {/* Distribution Preview */}
                      {showDistribution === exp.id && distributionData && (
                        <div className="mt-3 border-t pt-3">
                          <Label className="text-xs font-semibold mb-2 block">Cost Distribution Preview</Label>
                          <div className="border rounded overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/50">
                                <tr>
                                  <th className="text-left p-1.5">Item</th>
                                  <th className="text-right p-1.5">Qty</th>
                                  <th className="text-right p-1.5">Line Value</th>
                                  <th className="text-right p-1.5">Proportion</th>
                                  <th className="text-right p-1.5">Expense Share</th>
                                  <th className="text-right p-1.5">Per Unit</th>
                                  <th className="text-right p-1.5">Orig Cost</th>
                                  <th className="text-right p-1.5">New Cost</th>
                                </tr>
                              </thead>
                              <tbody>
                                {distributionData.items?.map((d, i) => (
                                  <tr key={i} className="border-t">
                                    <td className="p-1.5">{d.item_name}</td>
                                    <td className="p-1.5 text-right">{d.quantity}</td>
                                    <td className="p-1.5 text-right">${formatUSD(d.line_value_usd)}</td>
                                    <td className="p-1.5 text-right">{(d.proportion * 100).toFixed(2)}%</td>
                                    <td className="p-1.5 text-right font-semibold">${formatUSD(d.expense_share_usd)}</td>
                                    <td className="p-1.5 text-right">${formatUSD(d.expense_per_unit_usd)}</td>
                                    <td className="p-1.5 text-right">${formatUSD(d.original_unit_cost)}</td>
                                    <td className="p-1.5 text-right font-semibold text-green-500">${formatUSD(d.new_unit_cost)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-muted/30">
                                <tr className="border-t font-semibold">
                                  <td colSpan={4} className="p-1.5 text-right">Total Expense:</td>
                                  <td className="p-1.5 text-right">${formatUSD(distributionData.total_expense_usd)}</td>
                                  <td colSpan={3}></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create/Edit Form */}
        {showForm && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">{editingExpense ? 'Edit Expense' : 'New Expense'}</h3>
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); resetForm(); }}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            </div>

            {/* Header fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Date</Label>
                <DateInput value={formData.date} onChange={val => setFormData({ ...formData, date: val })} />
              </div>
              <div>
                <Label>Exchange Rate (LBP/USD)</Label>
                <Input type="number" value={formData.exchange_rate} onChange={e => {
                  const rate = parseFloat(e.target.value) || 89500;
                  const dl = formData.debit_lines.map(l => ({ ...l, amount_lbp: (parseFloat(l.amount_usd) || 0) * rate }));
                  const cl = formData.credit_lines.map(l => ({ ...l, amount_lbp: (parseFloat(l.amount_usd) || 0) * rate }));
                  setFormData({ ...formData, exchange_rate: rate, debit_lines: dl, credit_lines: cl });
                }} data-testid="expense-exchange-rate" />
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="e.g., Shipping & customs for container X" />
              </div>
            </div>

            {/* Debit Lines */}
            {renderExpenseLineTable('debit', formData.debit_lines, updateDebitLine, addDebitLine, removeDebitLine, false)}

            {/* Credit Lines */}
            {renderExpenseLineTable('credit', formData.credit_lines, updateCreditLine, addCreditLine, removeCreditLine, false)}

            {/* Balance indicator */}
            <div className={`flex justify-between items-center p-3 rounded-md border ${isBalanced ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              <div className="text-sm">
                <span className="font-semibold">Debit:</span> ${formatUSD(totalDebitUsd)} | <span className="font-semibold">Credit:</span> ${formatUSD(totalCreditUsd)}
              </div>
              <Badge variant={isBalanced ? 'default' : 'destructive'} data-testid="balance-indicator">
                {isBalanced ? 'Balanced' : `Diff: $${formatUSD(Math.abs(totalDebitUsd - totalCreditUsd))}`}
              </Badge>
            </div>

            {/* Save button */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !isBalanced} data-testid="save-expense-btn">
                {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving...</> : <><Save className="w-4 h-4 mr-1" /> {editingExpense ? 'Update' : 'Save'} Expense</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PurchaseExpenseDialog;
