import React, { useState, useEffect } from 'react';
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
import { List, Download, Printer, Eye, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import axios from 'axios';
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

  const canEdit = userRole === 'super_admin' || userRole === 'admin' || userRole === 'accountant';
  const canDelete = userRole === 'super_admin' || userRole === 'admin';
  const isSuperAdmin = userRole === 'super_admin';

  useEffect(() => {
    if (open && account && organizationId) {
      fetchLedger();
    }
  }, [open, account, organizationId, fyId]);

  const fetchLedger = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ organization_id: organizationId });
      if (fyId) params.append('fy_id', fyId);
      const response = await axios.get(
        `${API}/reports/general-ledger/${account.code}?${params.toString()}`
      );
      setLedgerData(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load ledger');
    } finally {
      setLoading(false);
    }
  };

  const handleViewVoucher = async (entry) => {
    try {
      const response = await axios.get(`${API}/vouchers/${entry.voucher_id}`);
      setViewVoucher(response.data);
    } catch (err) {
      alert('Failed to load voucher details');
    }
  };

  const handleEditVoucher = (entry) => {
    // Navigate to voucher page with the voucher data for editing
    onClose();
    navigate('/vouchers', { state: { editVoucherId: entry.voucher_id } });
  };

  const handleDeleteVoucher = async () => {
    if (!deleteConfirm) return;
    
    setDeleting(true);
    try {
      await axios.delete(`${API}/vouchers/${deleteConfirm.voucher_id}`);
      setDeleteConfirm(null);
      fetchLedger(); // Refresh the ledger
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete voucher');
    } finally {
      setDeleting(false);
    }
  };

  const handleUnpostVoucher = async (voucherId) => {
    if (!window.confirm('Are you sure you want to unpost this voucher? This will reverse all account balance updates.')) {
      return;
    }
    
    try {
      await axios.post(`${API}/vouchers/${voucherId}/unpost`);
      fetchLedger(); // Refresh the ledger
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to unpost voucher');
    }
  };

  const handlePrint = () => {
    if (!ledgerData) return;
    
    const printContent = `
      <html>
        <head>
          <title>Ledger - ${account.code} ${account.name}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { font-size: 18px; margin: 0; }
            .header h2 { font-size: 14px; margin: 5px 0; color: #666; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background: #f5f5f5; font-weight: bold; }
            .number { text-align: right; font-family: monospace; }
            .positive { color: #22c55e; }
            .negative { color: #ef4444; }
            .footer { margin-top: 20px; border-top: 2px solid #333; padding-top: 10px; }
            .footer-row { display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>KAIROS - General Ledger</h1>
            <h2>${account.code} - ${account.name}</h2>
            ${account.name_ar ? `<h2 dir="rtl">${account.name_ar}</h2>` : ''}
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher</th>
                <th>Description</th>
                <th class="number">Debit (USD)</th>
                <th class="number">Credit (USD)</th>
                <th class="number">Balance (USD)</th>
                <th class="number">Balance (LBP)</th>
              </tr>
            </thead>
            <tbody>
              ${ledgerData.entries.map(entry => `
                <tr>
                  <td>${(() => { const d = new Date(entry.date); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; })()}</td>
                  <td>${entry.voucher_number}</td>
                  <td>${entry.description}</td>
                  <td class="number">${entry.debit_usd > 0 ? formatUSD(entry.debit_usd) : '-'}</td>
                  <td class="number">${entry.credit_usd > 0 ? formatUSD(entry.credit_usd) : '-'}</td>
                  <td class="number ${entry.balance_usd >= 0 ? 'positive' : 'negative'}">${formatUSD(entry.balance_usd)}</td>
                  <td class="number">${formatLBP(entry.balance_lbp)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">
            <div class="footer-row">
              <strong>Closing Balance:</strong>
              <span>USD ${formatUSD(ledgerData.closing_balance.usd)} | LBP ${formatLBP(ledgerData.closing_balance.lbp)}</span>
            </div>
          </div>
        </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  const handleExport = () => {
    if (!ledgerData) return;
    
    const headers = ['Date', 'Voucher', 'Type', 'Description', 'Debit USD', 'Credit USD', 'Balance USD', 'Debit LBP', 'Credit LBP', 'Balance LBP'];
    const rows = ledgerData.entries.map(e => [
      e.date,
      e.voucher_number,
      e.voucher_type,
      `"${e.description}"`,
      e.debit_usd,
      e.credit_usd,
      e.balance_usd,
      e.debit_lbp,
      e.credit_lbp,
      e.balance_lbp
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
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <List className="w-5 h-5" />
              Account Ledger
            </DialogTitle>
          </DialogHeader>

          {account && (
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
                <Button variant="outline" size="sm" onClick={handlePrint} disabled={!ledgerData}>
                  <Printer className="w-4 h-4 mr-1" />
                  Print
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport} disabled={!ledgerData}>
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
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
                <Button variant="outline" className="mt-4" onClick={fetchLedger}>
                  Retry
                </Button>
              </div>
            ) : ledgerData ? (
              <>
                {ledgerData.entries.length === 0 ? (
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
                                {entry.debit_usd > 0 ? (
                                  <span className="text-red-400">{formatUSD(entry.debit_usd)}</span>
                                ) : '-'}
                              </td>
                              <td className="text-right font-mono">
                                {entry.credit_usd > 0 ? (
                                  <span className="text-green-400">{formatUSD(entry.credit_usd)}</span>
                                ) : '-'}
                              </td>
                              <td className={`text-right font-mono ${getNumberClass(entry.balance_usd)}`}>
                                {formatUSD(entry.balance_usd)}
                              </td>
                              <td className="text-right font-mono text-muted-foreground">
                                {formatLBP(entry.balance_lbp)}
                              </td>
                              <td>
                                <div className="flex justify-center gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 px-2"
                                    onClick={() => handleViewVoucher(entry)}
                                    title="View"
                                  >
                                    <Eye className="w-3 h-3" />
                                  </Button>
                                  {canEdit && (
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-7 px-2"
                                      onClick={() => handleEditVoucher(entry)}
                                      title="Edit"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                  )}
                                  {isSuperAdmin && (
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-7 px-2 text-amber-400"
                                      onClick={() => handleUnpostVoucher(entry.voucher_id)}
                                      title="Unpost"
                                    >
                                      <AlertTriangle className="w-3 h-3" />
                                    </Button>
                                  )}
                                  {canDelete && (
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-7 px-2 text-red-400"
                                      onClick={() => setDeleteConfirm(entry)}
                                      title="Delete"
                                    >
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
                        <span className="font-medium">Closing Balance:</span>
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
                <div>
                  <p className="text-xs text-muted-foreground">Voucher #</p>
                  <p className="font-mono font-bold">{viewVoucher.voucher_number}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className={`inline-block px-2 py-0.5 rounded text-xs voucher-${viewVoucher.voucher_type.toLowerCase()}`}>
                    {viewVoucher.voucher_type}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p>{formatDate(viewVoucher.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className={viewVoucher.is_posted ? 'status-posted' : 'status-draft'}>
                    {viewVoucher.is_posted ? 'Posted' : 'Draft'}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p>{viewVoucher.description}</p>
                </div>
                {viewVoucher.reference && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Reference</p>
                    <p>{viewVoucher.reference}</p>
                  </div>
                )}
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Lines</h4>
                <table className="data-table text-sm">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Description</th>
                      <th className="text-right">Debit (USD)</th>
                      <th className="text-right">Credit (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewVoucher.lines.map((line, idx) => (
                      <tr key={idx}>
                        <td>
                          <span className="font-mono text-xs">{line.account_code}</span>
                          <span className="mx-1">-</span>
                          <span className="text-muted-foreground">{line.account_name}</span>
                        </td>
                        <td className="text-muted-foreground">{line.description}</td>
                        <td className="text-right font-mono">
                          {line.debit_usd > 0 ? <span className="text-red-400">${formatUSD(line.debit_usd)}</span> : '-'}
                        </td>
                        <td className="text-right font-mono">
                          {line.credit_usd > 0 ? <span className="text-green-400">${formatUSD(line.credit_usd)}</span> : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2">
                      <td colSpan={2} className="font-medium">Total</td>
                      <td className="text-right font-mono font-bold">${formatUSD(viewVoucher.total_debit_usd)}</td>
                      <td className="text-right font-mono font-bold">${formatUSD(viewVoucher.total_credit_usd)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewVoucher(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Delete Voucher
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete voucher <strong>{deleteConfirm?.voucher_number}</strong>?
              <br /><br />
              <span className="text-amber-400">
                Warning: This will also unpost the voucher and reverse all account balance changes.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteVoucher} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete Voucher'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LedgerDialog;
