import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { DateInput } from '../components/ui/date-input';
import {
  FileText, Printer, DollarSign, CreditCard, Users, Clock,
  TrendingUp, AlertTriangle, ChevronDown, ChevronRight, Banknote, XCircle
} from 'lucide-react';
import axios from 'axios';
import { formatUSD, formatDate } from '../lib/utils';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const POSClosingReportPage = () => {
  const { currentOrg } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState({});

  useEffect(() => {
    if (currentOrg && date) fetchReport();
  }, [currentOrg, date]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/cashier/admin/daily-closing-report?organization_id=${currentOrg.id}&date=${date}`);
      setReport(res.data);
    } catch (error) {
      toast.error('Failed to load report');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSession = (sessionId) => {
    setExpandedSessions(prev => ({ ...prev, [sessionId]: !prev[sessionId] }));
  };

  const handlePrint = () => {
    if (!report) return;
    const g = report.grand_totals;
    const pw = window.open('', '_blank', 'width=900,height=700');
    pw.document.write(`<!DOCTYPE html><html><head><title>POS Closing Report - ${date}</title>
      <style>
        body{font-family:Arial,sans-serif;margin:20px;color:#333;font-size:12px}
        .header{text-align:center;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:15px}
        .header h1{margin:0;font-size:20px} .header p{margin:3px 0;font-size:11px;color:#666}
        .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:15px}
        .summary-card{border:1px solid #ddd;padding:8px;text-align:center;border-radius:4px}
        .summary-card .label{font-size:10px;color:#666;text-transform:uppercase} .summary-card .value{font-size:16px;font-weight:bold;margin-top:2px}
        h2{font-size:14px;margin:15px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}
        table{width:100%;border-collapse:collapse;margin-bottom:12px}
        th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
        th{background:#f0f0f0;font-size:11px}
        .text-right{text-align:right}
        .text-center{text-align:center}
        .variance-ok{color:#16a34a} .variance-bad{color:#dc2626}
        .session-header{background:#f8f9fa;font-weight:bold}
        .voided{text-decoration:line-through;color:#999}
        .footer{margin-top:30px;display:flex;justify-content:space-between}
        .footer div{text-align:center;width:180px;border-top:1px solid #333;padding-top:5px;font-size:11px}
        @media print{body{margin:10px}}
      </style></head><body>
      <div class="header">
        <h1>${currentOrg?.name || 'Company'}</h1>
        <p>Daily POS Closing Report / تقرير إقفال نقطة البيع اليومي</p>
        <p>Date: ${formatDate(date)}</p>
      </div>
      <div class="summary-grid">
        <div class="summary-card"><div class="label">Total Sales</div><div class="value">$ ${formatUSD(g.total_sales_usd)}</div></div>
        <div class="summary-card"><div class="label">Transactions</div><div class="value">${g.total_transactions}</div></div>
        <div class="summary-card"><div class="label">Cash</div><div class="value">$ ${formatUSD(g.cash_usd)}</div></div>
        <div class="summary-card"><div class="label">Card</div><div class="value">$ ${formatUSD(g.card_usd)}</div></div>
      </div>
      ${g.credit_usd > 0 ? `<div class="summary-grid"><div class="summary-card"><div class="label">Credit Sales</div><div class="value">$ ${formatUSD(g.credit_usd)}</div></div><div class="summary-card"><div class="label">Variance</div><div class="value ${Math.abs(g.total_variance_usd) < 0.01 ? 'variance-ok' : 'variance-bad'}">$ ${formatUSD(g.total_variance_usd)}</div></div></div>` : ''}
      ${report.cashier_sessions.map((s, i) => `
        <h2>Session ${i+1}: ${s.cashier_name} (${s.status})</h2>
        <table>
          <tr><td><strong>Opened:</strong> ${s.opened_at || '-'}</td><td><strong>Closed:</strong> ${s.closed_at || '-'}</td><td><strong>Transactions:</strong> ${s.transaction_count}${s.voided_count > 0 ? ` (${s.voided_count} voided)` : ''}</td></tr>
          <tr><td><strong>Cash Sales:</strong> $ ${formatUSD(s.cash_sales_usd)}</td><td><strong>Card Sales:</strong> $ ${formatUSD(s.card_sales_usd)}</td><td><strong>Total:</strong> $ ${formatUSD(s.total_sales_usd)}</td></tr>
          ${s.status === 'closed' ? `<tr><td><strong>Opening Cash:</strong> $ ${formatUSD(s.opening_cash_usd)}</td><td><strong>Closing Cash:</strong> $ ${formatUSD(s.closing_cash_usd)}</td><td class="${Math.abs(s.difference_usd || 0) < 0.01 ? 'variance-ok' : 'variance-bad'}"><strong>Variance:</strong> $ ${formatUSD(s.difference_usd || 0)}</td></tr>` : ''}
        </table>
        ${s.transactions.length > 0 ? `
        <table>
          <thead><tr><th>Receipt</th><th>Time</th><th>Items</th><th>Payment</th><th>Customer</th><th class="text-right">Total USD</th></tr></thead>
          <tbody>
            ${s.transactions.map(t => `<tr class="${t.is_voided ? 'voided' : ''}"><td>${t.receipt_number || '-'}</td><td>${t.time}</td><td class="text-center">${t.items_count}</td><td>${t.payment_method}</td><td>${t.customer_name || '-'}</td><td class="text-right">$ ${formatUSD(t.total_usd)}</td></tr>`).join('')}
          </tbody>
        </table>` : '<p style="color:#999">No transactions</p>'}
      `).join('')}
      ${report.admin_pos.transaction_count > 0 ? `
        <h2>Admin POS (No Session)</h2>
        <table>
          <thead><tr><th>Receipt</th><th>Time</th><th>Items</th><th>Payment</th><th>Customer</th><th class="text-right">Total USD</th></tr></thead>
          <tbody>
            ${report.admin_pos.transactions.map(t => `<tr class="${t.is_voided ? 'voided' : ''}"><td>${t.receipt_number || '-'}</td><td>${t.time}</td><td class="text-center">${t.items_count}</td><td>${t.payment_method}</td><td>${t.customer_name || '-'}</td><td class="text-right">$ ${formatUSD(t.total_usd)}</td></tr>`).join('')}
          </tbody>
        </table>` : ''}
      <div class="footer">
        <div>Admin Signature / توقيع المدير</div>
        <div>Accountant / المحاسب</div>
      </div>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`);
    pw.document.close();
  };

  if (!currentOrg) return <div className="p-8 text-center text-muted-foreground">Select an organization</div>;

  const g = report?.grand_totals;

  return (
    <div className="space-y-6" data-testid="pos-closing-report-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Daily POS Closing Report
          </h1>
          <p className="text-sm text-muted-foreground mt-1">End-of-day reconciliation for all cashier sessions</p>
        </div>
        <div className="flex items-center gap-3">
          <DateInput value={date} onChange={setDate} />
          {report && (
            <Button onClick={handlePrint} data-testid="print-report-btn">
              <Printer className="w-4 h-4 mr-2" /> Print Report
            </Button>
          )}
        </div>
      </div>

      {loading && <div className="p-8 text-center text-muted-foreground">Loading report...</div>}

      {!loading && report && (
        <>
          {/* Grand Totals */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <DollarSign className="w-5 h-5 mx-auto text-emerald-500 mb-1" />
                <p className="text-xs text-muted-foreground">Total Sales</p>
                <p className="text-lg font-bold font-mono text-emerald-500" data-testid="total-sales">{formatUSD(g.total_sales_usd)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-5 h-5 mx-auto text-blue-500 mb-1" />
                <p className="text-xs text-muted-foreground">Transactions</p>
                <p className="text-lg font-bold" data-testid="total-transactions">{g.total_transactions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Banknote className="w-5 h-5 mx-auto text-green-600 mb-1" />
                <p className="text-xs text-muted-foreground">Cash</p>
                <p className="text-lg font-bold font-mono">{formatUSD(g.cash_usd)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <CreditCard className="w-5 h-5 mx-auto text-purple-500 mb-1" />
                <p className="text-xs text-muted-foreground">Card</p>
                <p className="text-lg font-bold font-mono">{formatUSD(g.card_usd)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="w-5 h-5 mx-auto text-orange-500 mb-1" />
                <p className="text-xs text-muted-foreground">Sessions</p>
                <p className="text-lg font-bold">{g.total_sessions} <span className="text-xs text-muted-foreground">({g.open_sessions} open)</span></p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <AlertTriangle className={`w-5 h-5 mx-auto mb-1 ${Math.abs(g.total_variance_usd) < 0.01 ? 'text-emerald-500' : 'text-red-500'}`} />
                <p className="text-xs text-muted-foreground">Variance</p>
                <p className={`text-lg font-bold font-mono ${Math.abs(g.total_variance_usd) < 0.01 ? 'text-emerald-500' : 'text-red-500'}`} data-testid="total-variance">
                  {g.total_variance_usd >= 0 ? '+' : ''}{formatUSD(g.total_variance_usd)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Cashier Sessions */}
          {report.cashier_sessions.length === 0 && report.admin_pos.transaction_count === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg">No cashier sessions or POS transactions for {formatDate(date)}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {report.cashier_sessions.map((session, idx) => (
                <Card key={session.session_id} data-testid={`session-card-${idx}`}>
                  <CardHeader className="pb-3 cursor-pointer" onClick={() => toggleSession(session.session_id)}>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        {expandedSessions[session.session_id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <Users className="w-4 h-4 text-primary" />
                        {session.cashier_name}
                        <Badge variant={session.status === 'closed' ? 'default' : 'secondary'} className={session.status === 'closed' ? 'bg-emerald-600 ml-2' : 'bg-amber-600 ml-2'}>
                          {session.status}
                        </Badge>
                      </CardTitle>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">{session.transaction_count} txns</span>
                        {session.voided_count > 0 && <span className="text-red-400">{session.voided_count} voided</span>}
                        <span className="font-mono font-bold text-emerald-500">{formatUSD(session.total_sales_usd)}</span>
                      </div>
                    </div>
                  </CardHeader>

                  {expandedSessions[session.session_id] && (
                    <CardContent className="pt-0 space-y-4">
                      {/* Session Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-sm">
                        <div className="bg-muted/30 p-3 rounded">
                          <p className="text-xs text-muted-foreground">Opened</p>
                          <p className="font-medium">{session.opened_at ? session.opened_at.substring(11, 19) : '-'}</p>
                        </div>
                        <div className="bg-muted/30 p-3 rounded">
                          <p className="text-xs text-muted-foreground">Closed</p>
                          <p className="font-medium">{session.closed_at ? session.closed_at.substring(11, 19) : 'Still open'}</p>
                        </div>
                        <div className="bg-muted/30 p-3 rounded">
                          <p className="text-xs text-muted-foreground">Cash Sales</p>
                          <p className="font-mono font-medium text-green-600">{formatUSD(session.cash_sales_usd)}</p>
                        </div>
                        <div className="bg-muted/30 p-3 rounded">
                          <p className="text-xs text-muted-foreground">Card Sales</p>
                          <p className="font-mono font-medium text-purple-500">{formatUSD(session.card_sales_usd)}</p>
                        </div>
                        {session.status === 'closed' && (
                          <>
                            <div className="bg-muted/30 p-3 rounded">
                              <p className="text-xs text-muted-foreground">Opening / Closing Cash</p>
                              <p className="font-mono text-xs">{formatUSD(session.opening_cash_usd)} / {formatUSD(session.closing_cash_usd)}</p>
                            </div>
                            <div className={`p-3 rounded ${Math.abs(session.difference_usd || 0) < 0.01 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                              <p className="text-xs text-muted-foreground">Variance</p>
                              <p className={`font-mono font-bold ${Math.abs(session.difference_usd || 0) < 0.01 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {(session.difference_usd || 0) >= 0 ? '+' : ''}{formatUSD(session.difference_usd || 0)}
                              </p>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Transaction List */}
                      {session.transactions.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/20">
                                <th className="text-left p-2 text-xs">Receipt</th>
                                <th className="text-left p-2 text-xs">Time</th>
                                <th className="text-center p-2 text-xs">Items</th>
                                <th className="text-left p-2 text-xs">Payment</th>
                                <th className="text-left p-2 text-xs">Customer</th>
                                <th className="text-right p-2 text-xs">Total USD</th>
                              </tr>
                            </thead>
                            <tbody>
                              {session.transactions.map((txn, i) => (
                                <tr key={i} className={`border-b ${txn.is_voided ? 'opacity-40 line-through' : 'hover:bg-muted/10'}`}>
                                  <td className="p-2 font-mono text-xs">
                                    {txn.receipt_number || '-'}
                                    {txn.is_voided && <XCircle className="w-3 h-3 inline ml-1 text-red-500" />}
                                  </td>
                                  <td className="p-2 text-xs">{txn.time}</td>
                                  <td className="p-2 text-center text-xs">{txn.items_count}</td>
                                  <td className="p-2 text-xs capitalize">{txn.payment_method}</td>
                                  <td className="p-2 text-xs">{txn.customer_name || '-'}</td>
                                  <td className="p-2 text-right font-mono text-xs">{formatUSD(txn.total_usd)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {session.transactions.length === 0 && (
                        <p className="text-center text-muted-foreground text-sm py-4">No transactions in this session</p>
                      )}
                    </CardContent>
                  )}
                </Card>
              ))}

              {/* Admin POS Transactions */}
              {report.admin_pos.transaction_count > 0 && (
                <Card data-testid="admin-pos-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      Admin POS (No Session)
                      <span className="text-sm font-normal text-muted-foreground ml-2">{report.admin_pos.transaction_count} transactions</span>
                      <span className="ml-auto font-mono text-emerald-500">{formatUSD(report.admin_pos.total_sales_usd)}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/20">
                            <th className="text-left p-2 text-xs">Receipt</th>
                            <th className="text-left p-2 text-xs">Time</th>
                            <th className="text-center p-2 text-xs">Items</th>
                            <th className="text-left p-2 text-xs">Payment</th>
                            <th className="text-left p-2 text-xs">Customer</th>
                            <th className="text-right p-2 text-xs">Total USD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.admin_pos.transactions.map((txn, i) => (
                            <tr key={i} className={`border-b ${txn.is_voided ? 'opacity-40 line-through' : 'hover:bg-muted/10'}`}>
                              <td className="p-2 font-mono text-xs">{txn.receipt_number || '-'}</td>
                              <td className="p-2 text-xs">{txn.time}</td>
                              <td className="p-2 text-center text-xs">{txn.items_count}</td>
                              <td className="p-2 text-xs capitalize">{txn.payment_method}</td>
                              <td className="p-2 text-xs">{txn.customer_name || '-'}</td>
                              <td className="p-2 text-right font-mono text-xs">{formatUSD(txn.total_usd)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {!loading && !report && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Select a date to view the closing report</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default POSClosingReportPage;
