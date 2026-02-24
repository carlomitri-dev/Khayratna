import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { DateInput } from '../components/ui/date-input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Receipt, 
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Eye,
  Edit,
  Trash2,
  Image,
  FileText,
  Filter,
  RefreshCw,
  Calculator
} from 'lucide-react';
import axios from 'axios';
import { formatLBP, formatUSD, getTodayForInput, formatDate } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MetricCard = ({ title, value, subValue, icon: Icon, trend, trendValue, color = 'primary' }) => {
  const colorClasses = {
    primary: 'bg-primary/20 text-primary',
    blue: 'bg-blue-500/20 text-blue-400',
    red: 'bg-red-500/20 text-red-400',
    green: 'bg-emerald-500/20 text-emerald-400',
    amber: 'bg-amber-500/20 text-amber-400',
  };

  return (
    <Card className="metric-card" data-testid={`metric-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <CardContent className="p-3 lg:p-4">
        <div className="flex items-start justify-between">
          <div className={`p-1.5 lg:p-2 rounded-sm ${colorClasses[color]}`}>
            <Icon className="w-3 h-3 lg:w-4 lg:h-4" />
          </div>
          {trend && (
            <div className={`flex items-center text-xs ${trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
              {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              <span>{trendValue}</span>
            </div>
          )}
        </div>
        <div className="mt-2 lg:mt-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-base lg:text-xl font-bold font-mono mt-1">{value}</p>
          {subValue && <p className="text-xs text-muted-foreground mt-1 hidden sm:block">{subValue}</p>}
        </div>
      </CardContent>
    </Card>
  );
};

const DashboardPage = () => {
  const { currentOrg, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalAccounts: 0,
    totalVouchers: 0,
    totalRevenue: { lbp: 0, usd: 0 },
    totalExpenses: { lbp: 0, usd: 0 },
    netIncome: { lbp: 0, usd: 0 },
    exchangeRate: 89500
  });
  const [allVouchers, setAllVouchers] = useState([]);
  const [filteredVouchers, setFilteredVouchers] = useState([]);
  const [displayCount, setDisplayCount] = useState(10);
  
  // Date filter state
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState(getTodayForInput());
  
  // Activity state
  const [recentActivity, setRecentActivity] = useState([]);
  const [activityDisplayCount, setActivityDisplayCount] = useState(10);
  
  // Dialogs
  const [viewVoucher, setViewVoucher] = useState(null);
  const [viewActivity, setViewActivity] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteActivityConfirm, setDeleteActivityConfirm] = useState(null);
  
  // Recalculate balances state
  const [recalculating, setRecalculating] = useState(false);
  const [recalculateResult, setRecalculateResult] = useState(null);

  useEffect(() => {
    if (currentOrg) {
      fetchDashboardData();
    }
  }, [currentOrg]);

  useEffect(() => {
    filterVouchers();
  }, [allVouchers, dateFrom, dateTo]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [accountsRes, vouchersCountRes, vouchersRes, incomeRes, rateRes, crdbRes, archiveRes] = await Promise.all([
        axios.get(`${API}/accounts?organization_id=${currentOrg.id}`),
        axios.get(`${API}/vouchers/count?organization_id=${currentOrg.id}`),
        axios.get(`${API}/vouchers?organization_id=${currentOrg.id}&limit=100`),  // Get recent 100 for activity
        axios.get(`${API}/reports/income-statement?organization_id=${currentOrg.id}`),
        axios.get(`${API}/exchange-rates/latest?organization_id=${currentOrg.id}`),
        axios.get(`${API}/crdb-notes?organization_id=${currentOrg.id}`),
        axios.get(`${API}/image-archive?organization_id=${currentOrg.id}`)
      ]);

      setMetrics({
        totalAccounts: accountsRes.data.length,
        totalVouchers: vouchersCountRes.data.total || vouchersCountRes.data.count || 0,
        totalRevenue: { 
          lbp: incomeRes.data.revenue.total_lbp, 
          usd: incomeRes.data.revenue.total_usd 
        },
        totalExpenses: { 
          lbp: incomeRes.data.expenses.total_lbp, 
          usd: incomeRes.data.expenses.total_usd 
        },
        netIncome: incomeRes.data.net_income,
        exchangeRate: rateRes.data.rate
      });

      setAllVouchers(vouchersRes.data);
      
      // Combine all activity types
      const activity = [
        ...vouchersRes.data.map(v => ({ ...v, type: 'voucher', sortDate: v.date })),
        ...crdbRes.data.map(n => ({ ...n, type: 'crdb_note', sortDate: n.date })),
        ...archiveRes.data.map(a => ({ ...a, type: 'archive', sortDate: a.date }))
      ].sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));
      
      setRecentActivity(activity);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterVouchers = () => {
    let filtered = [...allVouchers];
    
    if (dateFrom) {
      filtered = filtered.filter(v => v.date >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter(v => v.date <= dateTo);
    }
    
    setFilteredVouchers(filtered.sort((a, b) => new Date(b.date) - new Date(a.date)));
  };

  const handleDeleteVoucher = async () => {
    if (!deleteConfirm) return;
    
    try {
      await axios.delete(`${API}/vouchers/${deleteConfirm.id}`);
      setDeleteConfirm(null);
      fetchDashboardData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete voucher');
    }
  };

  const handleDeleteActivity = async () => {
    if (!deleteActivityConfirm) return;
    
    try {
      if (deleteActivityConfirm.type === 'voucher') {
        await axios.delete(`${API}/vouchers/${deleteActivityConfirm.id}`);
      } else if (deleteActivityConfirm.type === 'crdb_note') {
        await axios.delete(`${API}/crdb-notes/${deleteActivityConfirm.id}`);
      } else if (deleteActivityConfirm.type === 'archive') {
        await axios.delete(`${API}/image-archive/${deleteActivityConfirm.id}`);
      }
      setDeleteActivityConfirm(null);
      fetchDashboardData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete');
    }
  };

  const handleRecalculateBalances = async () => {
    if (!currentOrg) return;
    
    setRecalculating(true);
    setRecalculateResult(null);
    
    try {
      const response = await axios.post(`${API}/accounts/rebuild-from-vouchers`, {
        organization_id: currentOrg.id
      });
      
      setRecalculateResult({
        success: true,
        message: response.data.message,
        created: response.data.created,
        updated: response.data.updated,
        totalVouchers: response.data.total_vouchers_scanned
      });
      
      // Refresh dashboard data after recalculation
      fetchDashboardData();
      
      // Clear result after 5 seconds
      setTimeout(() => setRecalculateResult(null), 5000);
    } catch (error) {
      setRecalculateResult({
        success: false,
        message: error.response?.data?.detail || 'Failed to recalculate balances'
      });
    } finally {
      setRecalculating(false);
    }
  };

  const displayedVouchers = filteredVouchers.slice(0, displayCount);
  const displayedActivity = recentActivity.slice(0, activityDisplayCount);
  
  const canEdit = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'accountant';
  const canDelete = user?.role === 'super_admin' || user?.role === 'admin';
  const canRecalculate = user?.role === 'super_admin' || user?.role === 'admin';

  const renderActivityItem = (item) => {
    if (item.type === 'voucher') {
      return (
        <div key={`v-${item.id}`} className="flex items-center justify-between p-3 bg-muted/20 rounded-sm border border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded">
              <Receipt className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="font-mono text-sm">{item.voucher_number}</p>
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={item.is_posted ? 'status-posted' : 'status-draft'}>
              {item.is_posted ? 'Posted' : 'Draft'}
            </span>
            <span className="text-xs text-muted-foreground">{formatDate(item.date)}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setViewVoucher(item)}>
                <Eye className="w-3 h-3" />
              </Button>
              {!item.is_posted && canDelete && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400" onClick={() => setDeleteActivityConfirm(item)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    } else if (item.type === 'crdb_note') {
      return (
        <div key={`n-${item.id}`} className="flex items-center justify-between p-3 bg-muted/20 rounded-sm border border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded ${item.note_type === 'credit' ? 'bg-green-500/20' : item.note_type === 'dbcr' ? 'bg-blue-500/20' : 'bg-red-500/20'}`}>
              <FileText className={`w-4 h-4 ${item.note_type === 'credit' ? 'text-green-400' : item.note_type === 'dbcr' ? 'text-blue-400' : 'text-red-400'}`} />
            </div>
            <div>
              <p className="font-mono text-sm">{item.note_number}</p>
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</p>
              {item.attachments?.length > 0 && (
                <span className="text-xs text-primary flex items-center gap-1 mt-1">
                  <Image className="w-3 h-3" />
                  {item.attachments.length} attachment(s)
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={item.is_posted ? 'status-posted' : 'status-draft'}>
              {item.is_posted ? 'Posted' : 'Draft'}
            </span>
            <span className="text-xs text-muted-foreground">{formatDate(item.date)}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setViewActivity(item)}>
                <Eye className="w-3 h-3" />
              </Button>
              {!item.is_posted && canDelete && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400" onClick={() => setDeleteActivityConfirm(item)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    } else if (item.type === 'archive') {
      return (
        <div key={`a-${item.id}`} className="flex items-center justify-between p-3 bg-muted/20 rounded-sm border border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded overflow-hidden">
              {item.content_type?.startsWith('image/') ? (
                <img 
                  src={`${API}/image-archive/file/${item.filename}`} 
                  alt={item.title}
                  className="w-8 h-8 object-cover rounded"
                />
              ) : (
                <Image className="w-4 h-4 text-purple-400" />
              )}
            </div>
            <div>
              <p className="font-medium text-sm">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.time} - {item.description || 'Image Archive'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{formatDate(item.date)}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setViewActivity(item)}>
                <Eye className="w-3 h-3" />
              </Button>
              {canDelete && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400" onClick={() => setDeleteActivityConfirm(item)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>
        </div>
      );
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
    <div className="space-y-4 lg:space-y-6" data-testid="dashboard-page">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Dashboard
        </h1>
        <p className="text-muted-foreground text-xs lg:text-sm mt-1">
          Overview for {currentOrg.name}
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <MetricCard
          title="Exchange Rate"
          value={`${formatLBP(metrics.exchangeRate)} LBP`}
          subValue="per 1 USD"
          icon={DollarSign}
          color="blue"
        />
        <MetricCard
          title="Total Revenue"
          value={`$${formatUSD(metrics.totalRevenue.usd)}`}
          subValue={`${formatLBP(metrics.totalRevenue.lbp)} LBP`}
          icon={TrendingUp}
          trend="up"
          trendValue=""
          color="green"
        />
        <MetricCard
          title="Total Expenses"
          value={`$${formatUSD(metrics.totalExpenses.usd)}`}
          subValue={`${formatLBP(metrics.totalExpenses.lbp)} LBP`}
          icon={TrendingDown}
          color="red"
        />
        <MetricCard
          title="Net Income"
          value={`$${formatUSD(metrics.netIncome.usd)}`}
          subValue={`${formatLBP(metrics.netIncome.lbp)} LBP`}
          icon={DollarSign}
          trend={metrics.netIncome.usd >= 0 ? 'up' : 'down'}
          color={metrics.netIncome.usd >= 0 ? 'green' : 'red'}
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard
          title="Chart of Accounts"
          value={metrics.totalAccounts}
          subValue="Active accounts (LCOA)"
          icon={BookOpen}
          color="amber"
        />
        <MetricCard
          title="Total Vouchers"
          value={metrics.totalVouchers}
          subValue="All voucher types"
          icon={Receipt}
          color="primary"
        />
      </div>

      {/* Recalculate Balances Section */}
      {canRecalculate && (
        <Card className="border-dashed" data-testid="recalculate-balances-card">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/20 rounded">
                  <Calculator className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Recalculate Account Balances</p>
                  <p className="text-xs text-muted-foreground">
                    Scan all posted vouchers and recalculate account balances. Useful after data imports.
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleRecalculateBalances}
                disabled={recalculating}
                data-testid="recalculate-balances-btn"
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
                {recalculating ? 'Recalculating...' : 'Recalculate'}
              </Button>
            </div>
            
            {/* Result message */}
            {recalculateResult && (
              <div className={`mt-3 p-3 rounded text-sm ${
                recalculateResult.success 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-red-500/10 text-red-400 border border-red-500/30'
              }`}>
                {recalculateResult.success ? (
                  <div className="flex items-center gap-2">
                    <span>✓</span>
                    <span>
                      {recalculateResult.message}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span>✗</span>
                    <span>{recalculateResult.message}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Vouchers with Date Filter */}
      <Card data-testid="recent-vouchers">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-lg flex items-center gap-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
              <Receipt className="w-5 h-5" />
              Recent Vouchers
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">From:</Label>
                <DateInput
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 w-[130px] text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">To:</Label>
                <DateInput
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 w-[130px] text-xs"
                />
              </div>
              {(dateFrom || dateTo !== getTodayForInput()) && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => { setDateFrom(''); setDateTo(getTodayForInput()); }}
                  className="h-8 text-xs"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {displayedVouchers.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              No vouchers found for the selected date range.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="data-table">
                  <thead className="sticky top-0 bg-card">
                    <tr>
                      <th>Voucher #</th>
                      <th>Type</th>
                      <th>Date</th>
                      <th>Description</th>
                      <th className="text-right">Amount</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedVouchers.map((voucher) => (
                      <tr key={voucher.id}>
                        <td className="font-mono text-sm">{voucher.voucher_number}</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded-sm text-xs border voucher-${voucher.voucher_type.toLowerCase()}`}>
                            {voucher.voucher_type}
                          </span>
                        </td>
                        <td className="text-muted-foreground">{formatDate(voucher.date)}</td>
                        <td className="max-w-[200px] truncate">{voucher.description}</td>
                        <td className="number text-right">
                          {voucher.currency === 'LBP' ? (
                            <span className="currency-lbp">{formatLBP(voucher.total_debit_lbp)} LBP</span>
                          ) : (
                            <span className="currency-usd">${formatUSD(voucher.total_debit_usd)}</span>
                          )}
                        </td>
                        <td>
                          <span className={voucher.is_posted ? 'status-posted' : 'status-draft'}>
                            {voucher.is_posted ? 'Posted' : 'Draft'}
                          </span>
                        </td>
                        <td>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setViewVoucher(voucher)} title="View">
                              <Eye className="w-3 h-3" />
                            </Button>
                            {!voucher.is_posted && canDelete && (
                              <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setDeleteConfirm(voucher)} title="Delete">
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
              
              {filteredVouchers.length > displayCount && (
                <div className="text-center mt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setDisplayCount(prev => prev + 10)}
                  >
                    Load More ({filteredVouchers.length - displayCount} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Transaction Activity */}
      <Card data-testid="transaction-activity">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
            <Calendar className="w-5 h-5" />
            Transaction Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {displayedActivity.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              No recent activity.
            </p>
          ) : (
            <>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {displayedActivity.map(renderActivityItem)}
              </div>
              
              {recentActivity.length > activityDisplayCount && (
                <div className="text-center mt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setActivityDisplayCount(prev => prev + 10)}
                  >
                    Load More ({recentActivity.length - activityDisplayCount} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* View Voucher Dialog */}
      <Dialog open={!!viewVoucher} onOpenChange={() => setViewVoucher(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Voucher Details - {viewVoucher?.voucher_number}</DialogTitle>
          </DialogHeader>
          
          {viewVoucher && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Type:</span>
                  <span className="ml-2">{viewVoucher.voucher_type}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>
                  <span className="ml-2">{formatDate(viewVoucher.date)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <span className={`ml-2 ${viewVoucher.is_posted ? 'text-green-400' : 'text-amber-400'}`}>
                    {viewVoucher.is_posted ? 'Posted' : 'Draft'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Currency:</span>
                  <span className="ml-2">{viewVoucher.currency}</span>
                </div>
              </div>
              
              <div>
                <span className="text-muted-foreground text-sm">Description:</span>
                <p className="mt-1">{viewVoucher.description}</p>
              </div>
              
              {viewVoucher.lines && viewVoucher.lines.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-sm">Line Items:</span>
                  <div className="mt-2 overflow-x-auto">
                    <table className="data-table text-sm">
                      <thead>
                        <tr>
                          <th>Account</th>
                          <th>Currency</th>
                          <th className="text-right">Debit (USD)</th>
                          <th className="text-right">Credit (USD)</th>
                          <th className="text-right">Debit (LBP)</th>
                          <th className="text-right">Credit (LBP)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewVoucher.lines.map((line, idx) => (
                          <tr key={idx}>
                            <td>{line.account_code} - {line.account_name}</td>
                            <td>{line.currency || 'USD'}</td>
                            <td className="text-right font-mono">{(line.debit_usd || 0) > 0 ? formatUSD(line.debit_usd) : '-'}</td>
                            <td className="text-right font-mono">{(line.credit_usd || 0) > 0 ? formatUSD(line.credit_usd) : '-'}</td>
                            <td className="text-right font-mono">{(line.debit_lbp || 0) > 0 ? formatLBP(line.debit_lbp) : '-'}</td>
                            <td className="text-right font-mono">{(line.credit_lbp || 0) > 0 ? formatLBP(line.credit_lbp) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t font-medium">
                        <tr>
                          <td colSpan="2">Totals:</td>
                          <td className="text-right font-mono text-green-400">{formatUSD(viewVoucher.total_debit_usd || 0)}</td>
                          <td className="text-right font-mono text-green-400">{formatUSD(viewVoucher.total_credit_usd || 0)}</td>
                          <td className="text-right font-mono">{formatLBP(viewVoucher.total_debit_lbp || 0)}</td>
                          <td className="text-right font-mono">{formatLBP(viewVoucher.total_credit_lbp || 0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Activity Dialog */}
      <Dialog open={!!viewActivity} onOpenChange={() => setViewActivity(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {viewActivity?.type === 'crdb_note' ? 'Credit/Debit Note' : 'Image Archive'} Details
            </DialogTitle>
          </DialogHeader>
          
          {viewActivity && viewActivity.type === 'crdb_note' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Note #:</span>
                  <span className="ml-2 font-mono">{viewActivity.note_number}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>
                  <span className="ml-2">{formatDate(viewActivity.date)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Debit Account:</span>
                  <span className="ml-2">{viewActivity.debit_account_code}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Credit Account:</span>
                  <span className="ml-2">{viewActivity.credit_account_code}</span>
                </div>
              </div>
              
              <div className="p-4 bg-muted/30 rounded-sm text-center">
                <p className="text-2xl font-bold font-mono">
                  {viewActivity.currency} {viewActivity.amount?.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </p>
              </div>
              
              <div>
                <span className="text-muted-foreground text-sm">Description:</span>
                <p className="mt-1">{viewActivity.description}</p>
              </div>
              
              {viewActivity.attachments && viewActivity.attachments.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-sm">Attachments ({viewActivity.attachments.length}):</span>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {viewActivity.attachments.map((att, idx) => (
                      <a 
                        key={idx}
                        href={`${API}/crdb-notes/attachment/${att.filename}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block border border-border rounded overflow-hidden hover:border-primary transition-colors"
                      >
                        <img 
                          src={`${API}/crdb-notes/attachment/${att.filename}`} 
                          alt={att.original_filename}
                          className="w-full h-24 object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {viewActivity && viewActivity.type === 'archive' && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-sm overflow-hidden">
                {viewActivity.content_type?.startsWith('image/') ? (
                  <img
                    src={`${API}/image-archive/file/${viewActivity.filename}`}
                    alt={viewActivity.title}
                    className="w-full max-h-[400px] object-contain"
                  />
                ) : (
                  <div className="h-40 flex items-center justify-center">
                    <FileText className="w-16 h-16 text-muted-foreground" />
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Title:</span>
                  <span className="ml-2">{viewActivity.title}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Date/Time:</span>
                  <span className="ml-2">{formatDate(viewActivity.date)} {viewActivity.time}</span>
                </div>
              </div>
              
              {viewActivity.description && (
                <div>
                  <span className="text-muted-foreground text-sm">Description:</span>
                  <p className="mt-1">{viewActivity.description}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Voucher Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Voucher</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete voucher &quot;{deleteConfirm?.voucher_number}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteVoucher}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Activity Confirmation */}
      <Dialog open={!!deleteActivityConfirm} onOpenChange={() => setDeleteActivityConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteActivityConfirm?.type === 'voucher' ? 'Voucher' : deleteActivityConfirm?.type === 'crdb_note' ? 'Note' : 'Image'}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteActivityConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteActivity}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DashboardPage;
