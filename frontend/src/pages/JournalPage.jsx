import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import {
  Calendar, Printer, FileDown, Pencil, Undo2, Trash2,
  AlertTriangle, BookOpen, Filter
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from '../components/ui/dialog';
import axios from 'axios';
import html2pdf from 'html2pdf.js';
import { formatLBP, formatUSD, formatDate } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const JournalPage = () => {
  const { user } = useAuth();
  const { currentOrg, selectedFY } = useFiscalYear();
  const navigate = useNavigate();

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const canEdit = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'accountant';
  const isSuperAdmin = user?.role === 'super_admin';
  const canDelete = user?.role === 'super_admin' || user?.role === 'admin';

  const fetchJournal = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ organization_id: currentOrg.id });
      if (selectedFY?.id) params.append('fy_id', selectedFY.id);
      if (fromDate) params.append('from_date', fromDate);
      if (toDate) params.append('to_date', toDate);
      const response = await axios.get(`${API}/reports/journal?${params.toString()}`);
      setData(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load journal');
    } finally {
      setLoading(false);
    }
  }, [currentOrg, selectedFY, fromDate, toDate]);

  const handleEdit = (voucher) => {
    navigate('/vouchers', { state: { editVoucherId: voucher.id } });
  };

  const handleUnpost = async (voucher) => {
    if (!window.confirm(`Unpost voucher ${voucher.voucher_number}?`)) return;
    try {
      await axios.post(`${API}/vouchers/${voucher.id}/unpost`);
      fetchJournal();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to unpost');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/vouchers/${deleteConfirm.id}`);
      setDeleteConfirm(null);
      fetchJournal();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const buildPrintHtml = () => {
    if (!data) return '';
    const gt = data.grand_total;
    const dateRange = (fromDate || toDate) ?
      `<p style="font-size:12px;margin:2px 0;">Period: ${fromDate || '...'} to ${toDate || '...'}</p>` : '';

    const vouchersHtml = data.vouchers.map(v => {
      const unbalanced = !v.is_balanced_usd || !v.is_balanced_lbp;
      const borderColor = unbalanced ? '#c00' : '#000';
      return `
        <div style="margin-bottom:12px;border:1px solid ${borderColor};page-break-inside:avoid;">
          <div style="padding:4px 8px;background:${unbalanced ? '#ffe0e0' : '#f5f5f5'};border-bottom:1px solid ${borderColor};display:flex;justify-content:space-between;">
            <div>
              <strong>${v.voucher_number}</strong>
              <span style="margin:0 8px;padding:1px 6px;border:1px solid #888;font-size:10px;">${v.voucher_type}</span>
              <span style="margin-left:8px;">${formatDate(v.date)}</span>
              <span style="margin-left:12px;color:#555;">${v.description}</span>
              ${unbalanced ? '<span style="margin-left:8px;color:#c00;font-weight:bold;">UNBALANCED</span>' : ''}
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead>
              <tr>
                <th style="border:1px solid #ccc;padding:3px;text-align:left;">Account</th>
                <th style="border:1px solid #ccc;padding:3px;text-align:left;">Name</th>
                <th style="border:1px solid #ccc;padding:3px;text-align:left;">Description</th>
                <th style="border:1px solid #ccc;padding:3px;text-align:right;">Debit USD</th>
                <th style="border:1px solid #ccc;padding:3px;text-align:right;">Credit USD</th>
                <th style="border:1px solid #ccc;padding:3px;text-align:right;">Debit LBP</th>
                <th style="border:1px solid #ccc;padding:3px;text-align:right;">Credit LBP</th>
              </tr>
            </thead>
            <tbody>
              ${v.lines.map(l => `
                <tr>
                  <td style="border:1px solid #eee;padding:2px 4px;font-family:monospace;">${l.account_code}</td>
                  <td style="border:1px solid #eee;padding:2px 4px;">${l.account_name}</td>
                  <td style="border:1px solid #eee;padding:2px 4px;">${l.description}</td>
                  <td style="border:1px solid #eee;padding:2px 4px;text-align:right;font-family:monospace;">${l.debit_usd > 0 ? formatUSD(l.debit_usd) : '-'}</td>
                  <td style="border:1px solid #eee;padding:2px 4px;text-align:right;font-family:monospace;">${l.credit_usd > 0 ? formatUSD(l.credit_usd) : '-'}</td>
                  <td style="border:1px solid #eee;padding:2px 4px;text-align:right;font-family:monospace;">${l.debit_lbp > 0 ? formatLBP(l.debit_lbp) : '-'}</td>
                  <td style="border:1px solid #eee;padding:2px 4px;text-align:right;font-family:monospace;">${l.credit_lbp > 0 ? formatLBP(l.credit_lbp) : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr style="font-weight:bold;border-top:2px solid #000;">
                <td colspan="3" style="border:1px solid #ccc;padding:3px;">Total</td>
                <td style="border:1px solid #ccc;padding:3px;text-align:right;font-family:monospace;${!v.is_balanced_usd ? 'color:#c00;' : ''}">${formatUSD(v.total_debit_usd)}</td>
                <td style="border:1px solid #ccc;padding:3px;text-align:right;font-family:monospace;${!v.is_balanced_usd ? 'color:#c00;' : ''}">${formatUSD(v.total_credit_usd)}</td>
                <td style="border:1px solid #ccc;padding:3px;text-align:right;font-family:monospace;${!v.is_balanced_lbp ? 'color:#c00;' : ''}">${formatLBP(v.total_debit_lbp)}</td>
                <td style="border:1px solid #ccc;padding:3px;text-align:right;font-family:monospace;${!v.is_balanced_lbp ? 'color:#c00;' : ''}">${formatLBP(v.total_credit_lbp)}</td>
              </tr>
            </tfoot>
          </table>
        </div>`;
    }).join('');

    return `
      <div style="font-family:Arial,sans-serif;padding:10px;font-size:12px;color:#000;background:#fff;">
        <div style="text-align:center;margin-bottom:12px;border-bottom:2px solid #000;padding-bottom:8px;">
          <h1 style="font-size:18px;margin:0;">Journal Report - دفتر اليومية</h1>
          ${dateRange}
          <p style="font-size:11px;color:#555;">${data.total_vouchers} vouchers</p>
        </div>
        ${vouchersHtml}
        <div style="margin-top:16px;border-top:3px solid #000;padding-top:8px;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;font-weight:bold;">
            <tr>
              <td style="padding:6px;">Grand Total</td>
              <td style="padding:6px;text-align:right;font-family:monospace;">Debit USD: ${formatUSD(gt.debit_usd)}</td>
              <td style="padding:6px;text-align:right;font-family:monospace;">Credit USD: ${formatUSD(gt.credit_usd)}</td>
              <td style="padding:6px;text-align:right;font-family:monospace;">Debit LBP: ${formatLBP(gt.debit_lbp)}</td>
              <td style="padding:6px;text-align:right;font-family:monospace;">Credit LBP: ${formatLBP(gt.credit_lbp)}</td>
            </tr>
          </table>
        </div>
      </div>`;
  };

  const handlePrint = () => {
    const html = `<html><head><title>Journal Report</title>
      <style>@page{size:A4 landscape;margin:8mm;}body{margin:0;}</style>
      </head><body>${buildPrintHtml()}<script>window.onload=function(){window.print();}</script></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const handleExportPdf = async () => {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;width:297mm;background:#fff;';
    container.innerHTML = buildPrintHtml();
    document.body.appendChild(container);
    const content = container.querySelector('div');
    if (!content) { document.body.removeChild(container); return; }
    try {
      await html2pdf().set({
        margin: [8, 10, 8, 10],
        filename: `Journal_${fromDate || 'all'}_${toDate || 'all'}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      }).from(content).save();
    } finally {
      document.body.removeChild(container);
    }
  };

  return (
    <div className="space-y-6" data-testid="journal-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Journal - دفتر اليومية</h1>
          <p className="text-muted-foreground text-sm">All posted vouchers with full details</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={!data} data-testid="journal-print-btn">
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={!data} data-testid="journal-pdf-btn">
            <FileDown className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <label className="text-xs text-muted-foreground">From:</label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="h-8 w-[160px] text-xs" data-testid="journal-from-date" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">To:</label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="h-8 w-[160px] text-xs" data-testid="journal-to-date" />
            </div>
            <Button size="sm" onClick={fetchJournal} disabled={loading} data-testid="journal-filter-btn">
              <Filter className="w-4 h-4 mr-1" /> {loading ? 'Loading...' : 'Load Journal'}
            </Button>
            {(fromDate || toDate) && (
              <Button size="sm" variant="ghost" onClick={() => { setFromDate(''); setToDate(''); }} className="text-xs">
                Clear
              </Button>
            )}
            {data && (
              <span className="text-sm text-muted-foreground ml-auto">
                {data.total_vouchers} vouchers found
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">{error}</div>
      )}

      {/* Journal Content */}
      {!data && !loading && !error && (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg">Select a date range and click "Load Journal"</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-16">
          <div className="spinner mx-auto" />
          <p className="text-muted-foreground mt-4">Loading journal entries...</p>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          {data.vouchers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No posted vouchers found for the selected period</p>
            </div>
          ) : (
            <>
              {data.vouchers.map((v) => {
                const unbalanced = !v.is_balanced_usd || !v.is_balanced_lbp;
                return (
                  <Card key={v.id} className={unbalanced ? 'border-red-500/50' : ''} data-testid={`journal-voucher-${v.id}`}>
                    {/* Voucher Header */}
                    <div className={`flex items-center justify-between px-4 py-2 border-b ${unbalanced ? 'bg-red-500/10 border-red-500/30' : 'bg-muted/30'}`}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono font-bold text-sm">{v.voucher_number}</span>
                        <span className={`px-2 py-0.5 rounded text-xs border voucher-${v.voucher_type.toLowerCase()}`}>
                          {v.voucher_type}
                        </span>
                        <span className="text-muted-foreground text-sm">{formatDate(v.date)}</span>
                        <span className="text-sm truncate max-w-[300px]">{v.description}</span>
                        {v.reference && <span className="text-xs text-muted-foreground">Ref: {v.reference}</span>}
                        {unbalanced && (
                          <span className="text-red-400 text-xs font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> UNBALANCED
                          </span>
                        )}
                      </div>
                      {/* Action Buttons */}
                      <div className="flex items-center gap-1" data-testid={`journal-actions-${v.id}`}>
                        {canEdit && (
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleEdit(v)} title="Edit">
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        {isSuperAdmin && (
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleUnpost(v)} title="Unpost">
                            <Undo2 className="w-4 h-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400 hover:text-red-300" onClick={() => setDeleteConfirm(v)} title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {/* Voucher Lines Table */}
                    <CardContent className="p-0 overflow-x-auto">
                      <table className="data-table text-xs w-full">
                        <thead>
                          <tr>
                            <th className="px-3 py-1.5">Account</th>
                            <th className="px-3 py-1.5">Name</th>
                            <th className="px-3 py-1.5">Description</th>
                            <th className="px-3 py-1.5 text-right">Debit (USD)</th>
                            <th className="px-3 py-1.5 text-right">Credit (USD)</th>
                            <th className="px-3 py-1.5 text-right">Debit (LBP)</th>
                            <th className="px-3 py-1.5 text-right">Credit (LBP)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {v.lines.map((line, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-1 font-mono text-xs">{line.account_code}</td>
                              <td className="px-3 py-1">{line.account_name}</td>
                              <td className="px-3 py-1 text-muted-foreground max-w-[200px] truncate">{line.description}</td>
                              <td className="px-3 py-1 text-right font-mono">
                                {line.debit_usd > 0 ? <span className="text-red-400">{formatUSD(line.debit_usd)}</span> : '-'}
                              </td>
                              <td className="px-3 py-1 text-right font-mono">
                                {line.credit_usd > 0 ? <span className="text-green-400">{formatUSD(line.credit_usd)}</span> : '-'}
                              </td>
                              <td className="px-3 py-1 text-right font-mono text-muted-foreground">
                                {line.debit_lbp > 0 ? formatLBP(line.debit_lbp) : '-'}
                              </td>
                              <td className="px-3 py-1 text-right font-mono text-muted-foreground">
                                {line.credit_lbp > 0 ? formatLBP(line.credit_lbp) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 font-semibold">
                            <td colSpan={3} className="px-3 py-1.5 text-sm">Voucher Total</td>
                            <td className={`px-3 py-1.5 text-right font-mono ${!v.is_balanced_usd ? 'text-red-400' : ''}`}>
                              {formatUSD(v.total_debit_usd)}
                            </td>
                            <td className={`px-3 py-1.5 text-right font-mono ${!v.is_balanced_usd ? 'text-red-400' : ''}`}>
                              {formatUSD(v.total_credit_usd)}
                            </td>
                            <td className={`px-3 py-1.5 text-right font-mono ${!v.is_balanced_lbp ? 'text-red-400' : ''}`}>
                              {formatLBP(v.total_debit_lbp)}
                            </td>
                            <td className={`px-3 py-1.5 text-right font-mono ${!v.is_balanced_lbp ? 'text-red-400' : ''}`}>
                              {formatLBP(v.total_credit_lbp)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Grand Totals */}
              <Card className="border-2 border-primary/30">
                <CardContent className="p-4">
                  <h3 className="font-bold text-lg mb-3">Grand Total - المجموع العام</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-3 bg-muted/30 rounded text-center">
                      <p className="text-xs text-muted-foreground mb-1">Debit (USD)</p>
                      <p className="font-mono font-bold text-red-400">{formatUSD(data.grand_total.debit_usd)}</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded text-center">
                      <p className="text-xs text-muted-foreground mb-1">Credit (USD)</p>
                      <p className="font-mono font-bold text-green-400">{formatUSD(data.grand_total.credit_usd)}</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded text-center">
                      <p className="text-xs text-muted-foreground mb-1">Debit (LBP)</p>
                      <p className="font-mono font-bold text-muted-foreground">{formatLBP(data.grand_total.debit_lbp)}</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded text-center">
                      <p className="text-xs text-muted-foreground mb-1">Credit (LBP)</p>
                      <p className="font-mono font-bold text-muted-foreground">{formatLBP(data.grand_total.credit_lbp)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" /> Delete Voucher
            </DialogTitle>
            <DialogDescription>
              Delete voucher <strong>{deleteConfirm?.voucher_number}</strong>?
              <br /><br />
              <span className="text-amber-400">This will unpost and reverse all balance changes.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JournalPage;
