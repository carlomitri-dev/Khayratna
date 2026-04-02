import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { List, Download, Printer, Eye, Pencil, Trash2, AlertTriangle, FileDown, Calendar } from 'lucide-react';
import axios from 'axios';
import html2pdf from 'html2pdf.js';
import { formatLBP, formatUSD, getNumberClass, formatDate } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LedgerDialog = ({ account, organizationId, open, onClose, userRole, fyId }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [ledgerData, setLedgerData] = useState(null);
  const [error, setError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [viewVoucher, setViewVoucher] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const canEdit = userRole === 'super_admin' || userRole === 'admin' || userRole === 'accountant';
  const canDelete = userRole === 'super_admin' || userRole === 'admin';
  const isSuperAdmin = userRole === 'super_admin';

  const fetchLedger = useCallback(async () => {
    if (!account || !organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ organization_id: organizationId });
      if (fyId) params.append('fy_id', fyId);
      if (fromDate) params.append('from_date', fromDate);
      if (toDate) params.append('to_date', toDate);
      const response = await axios.get(
        `${API}/reports/general-ledger/${account.code}?${params.toString()}`
      );
      setLedgerData(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load ledger');
    } finally {
      setLoading(false);
    }
  }, [account, organizationId, fyId, fromDate, toDate]);

  useEffect(() => {
    if (open && account && organizationId) {
      fetchLedger();
    }
  }, [open, account, organizationId, fyId, fetchLedger]);

  const handleViewVoucher = async (entry) => {
    try {
      const response = await axios.get(`${API}/vouchers/${entry.voucher_id}`);
      setViewVoucher(response.data);
    } catch (err) {
      alert('Failed to load voucher details');
    }
  };

  const handleEditVoucher = (entry) => {
    onClose();
    navigate('/vouchers', { state: { editVoucherId: entry.voucher_id } });
  };

  const handleDeleteVoucher = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/vouchers/${deleteConfirm.voucher_id}`);
      setDeleteConfirm(null);
      fetchLedger();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete voucher');
    } finally {
      setDeleting(false);
    }
  };

  const handleUnpostVoucher = async (voucherId) => {
    if (!window.confirm('Are you sure you want to unpost this voucher?')) return;
    try {
      await axios.post(`${API}/vouchers/${voucherId}/unpost`);
      fetchLedger();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to unpost voucher');
    }
  };

  // Build the ledger HTML for print/PDF
  const buildLedgerHtml = () => {
    if (!ledgerData || !account) return '';
    const ob = ledgerData.opening_balance || { usd: 0, lbp: 0 };
    const cb = ledgerData.closing_balance || { usd: 0, lbp: 0 };
    const dateRange = (fromDate || toDate) ? 
      `<p style="font-size:16px;margin:3px 0;">Period: ${fromDate || '...'} to ${toDate || '...'}</p>` : '';

    // Company info (same as SalesInvoicePrint)
    const companyEn = 'Michel Matar Trading Est.';
    const companyAr = 'مؤسسة ميشال مطر التجارية';
    const addressEn = 'Kafarakka El-Koura';
    const addressAr = 'كفر عقا - الكورة';
    const phone = '06/950751';
    const email = 'ets.michelmatar@hotmail.com';
    const regNumber = '601-585164';

    return `
      <div style="font-family:Arial,sans-serif;padding:10px;font-size:16px;color:#000;background:#fff;">
        <!-- Company Header (same as invoice, no logo) -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;border-bottom:2px solid #000;padding-bottom:6px;">
          <div style="text-align:left;flex:1;">
            <h2 style="font-size:22px;margin:0 0 3px 0;color:#000;font-weight:bold;">${companyEn}</h2>
            <p style="margin:1px 0;font-size:18px;color:#000;">${addressEn}</p>
            <p style="margin:1px 0;font-size:18px;color:#000;">Tel: ${phone}</p>
            <p style="margin:1px 0;font-size:18px;color:#000;">Email: ${email}</p>
            <p style="margin:1px 0;font-size:18px;color:#000;">T.V.A.: ${regNumber}</p>
          </div>
          <div style="text-align:right;flex:1;direction:rtl;">
            <h2 style="font-size:22px;margin:0 0 3px 0;color:#000;font-weight:bold;">${companyAr}</h2>
            <p style="margin:1px 0;font-size:18px;color:#000;">${addressAr}</p>
            <p style="margin:1px 0;font-size:18px;color:#000;">تلفون: ${phone}</p>
            <p style="margin:1px 0;font-size:18px;color:#000;">بريد: ${email}</p>
            <p style="margin:1px 0;font-size:18px;color:#000;">ض.ق.م.: ${regNumber}</p>
          </div>
        </div>

        <!-- Title -->
        <div style="text-align:center;font-size:26px;font-weight:bold;color:#000;margin:6px 0;border:2px solid #000;padding:3px;">
          كشف حساب - Ledger Account
        </div>

        <!-- Account Info -->
        <div style="display:flex;justify-content:space-between;margin:6px 0;border:1px solid #000;padding:6px 8px;">
          <div style="text-align:left;">
            <div style="margin:2px 0;font-size:18px;"><span style="font-weight:bold;">Account Code:</span> ${account.code}</div>
            <div style="margin:2px 0;font-size:18px;"><span style="font-weight:bold;">Account Name:</span> ${account.name}</div>
            ${dateRange}
          </div>
          <div style="text-align:right;direction:rtl;">
            <div style="margin:2px 0;font-size:18px;"><span style="font-weight:bold;">رمز الحساب:</span> ${account.code}</div>
            <div style="margin:2px 0;font-size:18px;"><span style="font-weight:bold;">إسم الحساب:</span> ${account.name_ar || account.name}</div>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-top:8px;">
          <thead>
            <tr>
              <th style="border:1px solid #000;padding:4px;background:#fff;font-size:15px;">Date</th>
              <th style="border:1px solid #000;padding:4px;background:#fff;font-size:15px;">Voucher</th>
              <th style="border:1px solid #000;padding:4px;background:#fff;font-size:15px;">Description</th>
              <th style="border:1px solid #000;padding:4px;background:#fff;font-size:15px;text-align:right;">Debit (USD)</th>
              <th style="border:1px solid #000;padding:4px;background:#fff;font-size:15px;text-align:right;">Credit (USD)</th>
              <th style="border:1px solid #000;padding:4px;background:#fff;font-size:15px;text-align:right;">Balance (USD)</th>
              <th style="border:1px solid #000;padding:4px;background:#fff;font-size:15px;text-align:right;">Balance (LBP)</th>
            </tr>
          </thead>
          <tbody>
            ${(ob.usd !== 0 || ob.lbp !== 0) ? `
              <tr style="font-weight:bold;background:#f5f5f5;">
                <td style="border:1px solid #000;padding:4px;font-size:15px;" colspan="3">Opening Balance / رصيد سابق</td>
                <td style="border:1px solid #000;padding:4px;text-align:right;font-size:15px;">-</td>
                <td style="border:1px solid #000;padding:4px;text-align:right;font-size:15px;">-</td>
                <td style="border:1px solid #000;padding:4px;text-align:right;font-family:monospace;font-size:15px;">${formatUSD(ob.usd)}</td>
                <td style="border:1px solid #000;padding:4px;text-align:right;font-family:monospace;font-size:15px;">${formatLBP(ob.lbp)}</td>
              </tr>` : ''}
            ${ledgerData.entries.map(e => `
              <tr>
                <td style="border:1px solid #000;padding:3px;font-size:15px;">${formatDate(e.date)}</td>
                <td style="border:1px solid #000;padding:3px;font-size:15px;">${e.voucher_number}</td>
                <td style="border:1px solid #000;padding:3px;font-size:15px;">${e.description}</td>
                <td style="border:1px solid #000;padding:3px;text-align:right;font-family:monospace;font-size:15px;">${e.debit_usd > 0 ? formatUSD(e.debit_usd) : '-'}</td>
                <td style="border:1px solid #000;padding:3px;text-align:right;font-family:monospace;font-size:15px;">${e.credit_usd > 0 ? formatUSD(e.credit_usd) : '-'}</td>
                <td style="border:1px solid #000;padding:3px;text-align:right;font-family:monospace;font-size:15px;">${formatUSD(e.balance_usd)}</td>
                <td style="border:1px solid #000;padding:3px;text-align:right;font-family:monospace;font-size:15px;">${formatLBP(e.balance_lbp)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:bold;border-top:2px solid #000;">
              <td style="border:1px solid #000;padding:5px;font-size:16px;" colspan="3">Closing Balance / الرصيد الختامي</td>
              <td style="border:1px solid #000;padding:5px;text-align:right;font-size:16px;">-</td>
              <td style="border:1px solid #000;padding:5px;text-align:right;font-size:16px;">-</td>
              <td style="border:1px solid #000;padding:5px;text-align:right;font-family:monospace;font-size:16px;">${formatUSD(cb.usd)}</td>
              <td style="border:1px solid #000;padding:5px;text-align:right;font-family:monospace;font-size:16px;">${formatLBP(cb.lbp)}</td>
            </tr>
          </tfoot>
        </table>
        <p style="font-size:14px;margin-top:8px;text-align:right;color:#666;">Total entries: ${ledgerData.total_entries}</p>
      </div>`;
  };

  const handlePrint = () => {
    const html = `<html><head><title>Ledger - ${account.code}</title>
      <style>@page{size:A4 landscape;margin:8mm;}body{margin:0;}</style>
      </head><body>${buildLedgerHtml()}<script>window.onload=function(){window.print();}</script></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  const handleExportPdf = async () => {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.width = '297mm';
    container.style.background = '#fff';
    container.innerHTML = buildLedgerHtml();
    document.body.appendChild(container);
    const content = container.querySelector('div');
    if (!content) {
      document.body.removeChild(container);
      return;
    }
    try {
      await html2pdf().set({
        margin: [8, 10, 8, 10],
        filename: `Ledger_${account.code}_${fromDate || 'all'}_${toDate || 'all'}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      }).from(content).save();
    } finally {
      document.body.removeChild(container);
    }
  };

  const handleExportCsv = () => {
    if (!ledgerData) return;
    const headers = ['Date', 'Voucher', 'Type', 'Description', 'Debit USD', 'Credit USD', 'Balance USD', 'Debit LBP', 'Credit LBP', 'Balance LBP'];
    const rows = ledgerData.entries.map(e => [
      e.date, e.voucher_number, e.voucher_type,
      `"${e.description}"`,
      e.debit_usd, e.credit_usd, e.balance_usd,
      e.debit_lbp, e.credit_lbp, e.balance_lbp
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger_${account.code}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <List className="w-5 h-5" />
              Account Ledger
            </DialogTitle>
          </DialogHeader>

          {account && (
            <div className="space-y-3">
              {/* Account info */}
              <div className="p-3 bg-muted/30 rounded-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-primary text-lg">{account.code}</span>
                  <span className="mx-2">-</span>
                  <span className="font-medium">{account.name}</span>
                  {account.name_ar && (
                    <span className="text-muted-foreground ml-2">({account.name_ar})</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrint} disabled={!ledgerData} data-testid="ledger-print-btn">
                    <Printer className="w-4 h-4 mr-1" /> Print
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={!ledgerData} data-testid="ledger-pdf-btn">
                    <FileDown className="w-4 h-4 mr-1" /> PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!ledgerData} data-testid="ledger-csv-btn">
                    <Download className="w-4 h-4 mr-1" /> CSV
                  </Button>
                </div>
              </div>

              {/* Date range filter */}
              <div className="flex items-end gap-3 px-1">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <label className="text-xs text-muted-foreground">From:</label>
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="h-8 w-[150px] text-xs"
                    data-testid="ledger-from-date"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">To:</label>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="h-8 w-[150px] text-xs"
                    data-testid="ledger-to-date"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={fetchLedger} className="h-8" data-testid="ledger-filter-btn">
                  Filter
                </Button>
                {(fromDate || toDate) && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setFromDate(''); setToDate(''); }} data-testid="ledger-clear-btn">
                    Clear
                  </Button>
                )}
                {ledgerData && (
                  <span className="text-xs text-muted-foreground ml-auto">{ledgerData.total_entries} transactions</span>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="spinner" />
              </div>
            ) : error ? (
              <div className="text-center py-12 text-red-400">
                <p>{error}</p>
                <Button variant="outline" className="mt-4" onClick={fetchLedger}>Retry</Button>
              </div>
            ) : ledgerData ? (
              <>
                {ledgerData.entries.length === 0 && (!ledgerData.opening_balance || (ledgerData.opening_balance.usd === 0 && ledgerData.opening_balance.lbp === 0)) ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <List className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No transactions found for this account</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="data-table text-sm">
                        <thead className="sticky top-0 bg-card">
                          <tr>
                            <th>Date</th>
                            <th>Voucher</th>
                            <th>Description</th>
                            <th className="text-right">Debit (USD)</th>
                            <th className="text-right">Credit (USD)</th>
                            <th className="text-right">Balance (USD)</th>
                            <th className="text-right">Balance (LBP)</th>
                            <th className="text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Opening Balance Row */}
                          {ledgerData.opening_balance && (ledgerData.opening_balance.usd !== 0 || ledgerData.opening_balance.lbp !== 0) && (
                            <tr className="bg-muted/40 font-semibold">
                              <td colSpan={3} className="text-sm">Opening Balance / رصيد سابق</td>
                              <td className="text-right">-</td>
                              <td className="text-right">-</td>
                              <td className={`text-right font-mono ${getNumberClass(ledgerData.opening_balance.usd)}`}>
                                {formatUSD(ledgerData.opening_balance.usd)}
                              </td>
                              <td className="text-right font-mono text-muted-foreground">
                                {formatLBP(ledgerData.opening_balance.lbp)}
                              </td>
                              <td></td>
                            </tr>
                          )}
                          {ledgerData.entries.map((entry, idx) => (
                            <tr key={idx}>
                              <td className="text-muted-foreground">{formatDate(entry.date)}</td>
                              <td>
                                <span className={`px-1.5 py-0.5 rounded text-xs voucher-${entry.voucher_type.toLowerCase()}`}>
                                  {entry.voucher_number}
                                </span>
                              </td>
                              <td className="max-w-[200px] truncate">{entry.description}</td>
                              <td className="text-right font-mono">
                                {entry.debit_usd > 0 ? <span className="text-red-400">{formatUSD(entry.debit_usd)}</span> : '-'}
                              </td>
                              <td className="text-right font-mono">
                                {entry.credit_usd > 0 ? <span className="text-green-400">{formatUSD(entry.credit_usd)}</span> : '-'}
                              </td>
                              <td className={`text-right font-mono ${getNumberClass(entry.balance_usd)}`}>
                                {formatUSD(entry.balance_usd)}
                              </td>
                              <td className="text-right font-mono text-muted-foreground">
                                {formatLBP(entry.balance_lbp)}
                              </td>
                              <td>
                                <div className="flex justify-center gap-1">
                                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleViewVoucher(entry)} title="View">
                                    <Eye className="w-3 h-3" />
                                  </Button>
                                  {canEdit && (
                                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleEditVoucher(entry)} title="Edit">
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                  )}
                                  {isSuperAdmin && (
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-amber-400" onClick={() => handleUnpostVoucher(entry.voucher_id)} title="Unpost">
                                      <AlertTriangle className="w-3 h-3" />
                                    </Button>
                                  )}
                                  {canDelete && (
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400" onClick={() => setDeleteConfirm(entry)} title="Delete">
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

                    {/* Closing Balance */}
                    <div className="mt-4 p-4 bg-muted/30 rounded-sm border border-border">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Closing Balance / الرصيد الختامي:</span>
                        <div className="flex gap-6">
                          <div>
                            <span className="text-muted-foreground text-sm mr-2">USD:</span>
                            <span className={`font-mono font-bold ${getNumberClass(ledgerData.closing_balance.usd)}`}>
                              ${formatUSD(ledgerData.closing_balance.usd)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-sm mr-2">LBP:</span>
                            <span className="font-mono font-bold">
                              {formatLBP(ledgerData.closing_balance.lbp)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* View Voucher Dialog */}
      <Dialog open={!!viewVoucher} onOpenChange={() => setViewVoucher(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Voucher Details</DialogTitle>
          </DialogHeader>
          {viewVoucher && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded">
                <div><p className="text-xs text-muted-foreground">Voucher #</p><p className="font-mono font-bold">{viewVoucher.voucher_number}</p></div>
                <div><p className="text-xs text-muted-foreground">Type</p><p className={`inline-block px-2 py-0.5 rounded text-xs voucher-${viewVoucher.voucher_type.toLowerCase()}`}>{viewVoucher.voucher_type}</p></div>
                <div><p className="text-xs text-muted-foreground">Date</p><p>{formatDate(viewVoucher.date)}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><p className={viewVoucher.is_posted ? 'status-posted' : 'status-draft'}>{viewVoucher.is_posted ? 'Posted' : 'Draft'}</p></div>
                <div className="col-span-2"><p className="text-xs text-muted-foreground">Description</p><p>{viewVoucher.description}</p></div>
                {viewVoucher.reference && (<div className="col-span-2"><p className="text-xs text-muted-foreground">Reference</p><p>{viewVoucher.reference}</p></div>)}
              </div>
              <div>
                <h4 className="font-medium mb-2">Lines</h4>
                <table className="data-table text-sm">
                  <thead><tr><th>Account</th><th>Description</th><th className="text-right">Debit (USD)</th><th className="text-right">Credit (USD)</th></tr></thead>
                  <tbody>
                    {viewVoucher.lines.map((line, idx) => (
                      <tr key={idx}>
                        <td><span className="font-mono text-xs">{line.account_code}</span><span className="mx-1">-</span><span className="text-muted-foreground">{line.account_name}</span></td>
                        <td className="text-muted-foreground">{line.description}</td>
                        <td className="text-right font-mono">{line.debit_usd > 0 ? <span className="text-red-400">${formatUSD(line.debit_usd)}</span> : '-'}</td>
                        <td className="text-right font-mono">{line.credit_usd > 0 ? <span className="text-green-400">${formatUSD(line.credit_usd)}</span> : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t-2"><td colSpan={2} className="font-medium">Total</td><td className="text-right font-mono font-bold">${formatUSD(viewVoucher.total_debit_usd)}</td><td className="text-right font-mono font-bold">${formatUSD(viewVoucher.total_credit_usd)}</td></tr></tfoot>
                </table>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setViewVoucher(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400"><AlertTriangle className="w-5 h-5" />Delete Voucher</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete voucher <strong>{deleteConfirm?.voucher_number}</strong>?
              <br /><br />
              <span className="text-amber-400">Warning: This will also unpost the voucher and reverse all account balance changes.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteVoucher} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete Voucher'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LedgerDialog;
