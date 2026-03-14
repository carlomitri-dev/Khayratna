import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { DateInput } from '../components/ui/date-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  BarChart3, TrendingUp, DollarSign, ShoppingBag, Users,
  Package, CreditCard, Banknote, Award, RefreshCw
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from 'recharts';
import axios from 'axios';
import { formatUSD } from '../lib/utils';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#06b6d4', '#e11d48', '#a855f7', '#22c55e', '#eab308'
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-sm">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }} className="flex justify-between gap-4">
          <span>{entry.name}:</span>
          <span className="font-mono font-medium">
            {entry.name.includes('Txns') || entry.name.includes('Items')
              ? entry.value
              : `$${formatUSD(entry.value)}`}
          </span>
        </p>
      ))}
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, sub, color = 'text-primary' }) => (
  <Card data-testid={`stat-${label.toLowerCase().replace(/\s/g, '-')}`}>
    <CardContent className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className={`text-xl font-bold font-mono mt-1 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg bg-muted/50`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
    </CardContent>
  </Card>
);

const POSAnalyticsPage = () => {
  const { currentOrg } = useAuth();
  const [period, setPeriod] = useState('daily');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [trends, setTrends] = useState(null);
  const [topItems, setTopItems] = useState(null);
  const [cashiers, setCashiers] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const params = `organization_id=${currentOrg.id}&date_from=${dateFrom}&date_to=${dateTo}`;
      const [trendsRes, itemsRes, cashiersRes] = await Promise.all([
        axios.get(`${API}/pos/analytics/sales-trends?${params}&period=${period}`),
        axios.get(`${API}/pos/analytics/top-items?${params}`),
        axios.get(`${API}/pos/analytics/cashier-performance?${params}`)
      ]);
      setTrends(trendsRes.data);
      setTopItems(itemsRes.data);
      setCashiers(cashiersRes.data);
    } catch (err) {
      toast.error('Failed to load analytics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentOrg, period, dateFrom, dateTo]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (!currentOrg) return <div className="p-8 text-center text-muted-foreground">Select an organization</div>;

  const s = trends?.summary;

  return (
    <div className="space-y-6" data-testid="pos-analytics-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            POS Sales Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Revenue trends, top items & cashier performance</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateInput value={dateFrom} onChange={setDateFrom} />
          <span className="text-muted-foreground text-sm">to</span>
          <DateInput value={dateTo} onChange={setDateTo} />
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[120px] h-9" data-testid="period-selector">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchAll} disabled={loading} data-testid="refresh-btn">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard icon={DollarSign} label="Total Sales" value={`$${formatUSD(s.total_sales_usd)}`} color="text-emerald-500" />
          <StatCard icon={TrendingUp} label="Transactions" value={s.total_transactions} sub={`Avg ticket: $${formatUSD(s.avg_ticket)}`} color="text-blue-500" />
          <StatCard icon={ShoppingBag} label="Items Sold" value={s.total_items_sold} color="text-purple-500" />
          <StatCard
            icon={BarChart3}
            label={`Avg / ${period === 'daily' ? 'Day' : period === 'weekly' ? 'Week' : 'Month'}`}
            value={`$${formatUSD(s.avg_per_period)}`}
            color="text-amber-500"
          />
          <StatCard icon={Users} label="Active Cashiers" value={cashiers?.total_cashiers || 0} color="text-cyan-500" />
        </div>
      )}

      {/* Sales Trends Chart */}
      {trends && trends.data.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Sales Trends
              <span className="text-xs font-normal text-muted-foreground ml-1 capitalize">({period})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]" data-testid="sales-trends-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends.data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradTxns" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area yAxisId="left" type="monotone" dataKey="sales_usd" name="Sales $" stroke="#10b981" fill="url(#gradSales)" strokeWidth={2} />
                  <Area yAxisId="right" type="monotone" dataKey="transactions" name="Txns" stroke="#3b82f6" fill="url(#gradTxns)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Breakdown Chart */}
      {trends && trends.data.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-purple-500" />
              Payment Method Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]" data-testid="payment-breakdown-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends.data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="cash_usd" name="Cash $" fill="#10b981" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="card_usd" name="Card $" fill="#8b5cf6" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="credit_usd" name="Credit $" fill="#f59e0b" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Items by Revenue */}
        {topItems && topItems.by_revenue.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-500" />
                Top Items by Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]" data-testid="top-items-revenue-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topItems.by_revenue.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue_usd" name="Revenue $" radius={[0, 4, 4, 0]}>
                      {topItems.by_revenue.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Items by Quantity */}
        {topItems && topItems.by_quantity.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-500" />
                Top Items by Quantity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]" data-testid="top-items-qty-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topItems.by_quantity.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="quantity" name="Items Sold" radius={[0, 4, 4, 0]}>
                      {topItems.by_quantity.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cashier Performance */}
      {cashiers && cashiers.cashiers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-500" />
              Cashier Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[280px]" data-testid="cashier-performance-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashiers.cashiers} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="total_sales_usd" name="Sales $" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="total_transactions" name="Txns" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Cashier Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="cashier-table">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="text-left p-2 text-xs">Cashier</th>
                    <th className="text-right p-2 text-xs">Sessions</th>
                    <th className="text-right p-2 text-xs">Transactions</th>
                    <th className="text-right p-2 text-xs">Items</th>
                    <th className="text-right p-2 text-xs">Sales USD</th>
                    <th className="text-right p-2 text-xs">Avg Ticket</th>
                    <th className="text-right p-2 text-xs">Cash</th>
                    <th className="text-right p-2 text-xs">Card</th>
                  </tr>
                </thead>
                <tbody>
                  {cashiers.cashiers.map((c, i) => (
                    <tr key={c.cashier_id} className="border-b hover:bg-muted/10">
                      <td className="p-2 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: COLORS[i % COLORS.length] }}>
                          {i + 1}
                        </span>
                        {c.name}
                      </td>
                      <td className="p-2 text-right">{c.sessions}</td>
                      <td className="p-2 text-right">{c.total_transactions}</td>
                      <td className="p-2 text-right">{c.total_items}</td>
                      <td className="p-2 text-right font-mono text-emerald-500">{formatUSD(c.total_sales_usd)}</td>
                      <td className="p-2 text-right font-mono">{formatUSD(c.avg_ticket)}</td>
                      <td className="p-2 text-right font-mono">{formatUSD(c.cash_usd)}</td>
                      <td className="p-2 text-right font-mono">{formatUSD(c.card_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && trends && trends.data.length === 0 && (!topItems || topItems.by_revenue.length === 0) && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No POS transactions found for the selected period</p>
            <p className="text-sm mt-2">Start selling through the POS terminal to see analytics here</p>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin" /> Loading analytics...
        </div>
      )}
    </div>
  );
};

export default POSAnalyticsPage;
