import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { FileText, Download, Printer, Filter, RefreshCw } from 'lucide-react';
import axios from 'axios';
import { formatLBP, formatUSD, getNumberClass } from '../lib/utils';
import { printReport, exportTrialBalanceToCSV } from '../lib/reportUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LEVEL_OPTIONS = [
  { value: 'all', label: 'All Accounts' },
  { value: 'leaf', label: 'Leaf Only (No Double Count)' },
  { value: 'gt_4', label: '> 4 Digits (Detail)' },
  { value: 'eq_4', label: '4 Digits' },
  { value: 'eq_3', label: '3 Digits' },
  { value: 'eq_2', label: '2 Digits' },
  { value: 'eq_1', label: '1 Digit (Class Headers)' },
];

const TrialBalancePage = () => {
  const { currentOrg } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState('leaf');
  const [includeZeroBalance, setIncludeZeroBalance] = useState(false);
  const [showCumulative, setShowCumulative] = useState(false);

  useEffect(() => {
    if (currentOrg) {
      fetchTrialBalance();
    }
  }, [currentOrg, level, includeZeroBalance]);

  const fetchTrialBalance = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        organization_id: currentOrg.id,
        include_zero_balance: includeZeroBalance.toString(),
      });
      if (level && level !== 'all') {
        params.append('level', level);
      }
      const response = await axios.get(`${API}/reports/trial-balance?${params.toString()}`);
      setData(response.data);
    } catch (error) {
      console.error('Failed to fetch trial balance:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    printReport('Trial Balance');
  };

  const handleExport = () => {
    if (data && currentOrg) {
      exportTrialBalanceToCSV(data, currentOrg.name.replace(/\s+/g, '_'));
    }
  };

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6" data-testid="trial-balance-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Trial Balance
          </h1>
          <p className="text-muted-foreground text-xs lg:text-sm mt-1">
            Summary of all account balances
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="text-xs" 
            onClick={fetchTrialBalance}
            disabled={loading}
            data-testid="refresh-btn"
          >
            <RefreshCw className={`w-3 h-3 mr-1 lg:w-4 lg:h-4 lg:mr-2 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={handlePrint} disabled={!data}>
            <Printer className="w-3 h-3 mr-1 lg:w-4 lg:h-4 lg:mr-2" />
            <span className="hidden sm:inline">Print</span>
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={handleExport} disabled={!data}>
            <Download className="w-3 h-3 mr-1 lg:w-4 lg:h-4 lg:mr-2" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="no-print" data-testid="trial-balance-filters">
        <CardContent className="p-3 lg:p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Level:</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="level-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVEL_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <Switch 
                id="zero-balance" 
                checked={includeZeroBalance}
                onCheckedChange={setIncludeZeroBalance}
                data-testid="zero-balance-toggle"
              />
              <Label htmlFor="zero-balance" className="text-sm cursor-pointer">
                Include Zero Balances
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch 
                id="show-cumulative" 
                checked={showCumulative}
                onCheckedChange={setShowCumulative}
                data-testid="cumulative-toggle"
              />
              <Label htmlFor="show-cumulative" className="text-sm cursor-pointer">
                Show Cumulative
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="trial-balance-report">
        <CardHeader className="border-b border-border p-3 lg:p-6">
          <div className="report-header">
            <CardTitle className="report-title text-base lg:text-xl">{currentOrg.name}</CardTitle>
            <p className="report-subtitle text-sm lg:text-base">Trial Balance Report</p>
            <p className="text-xs text-muted-foreground mt-1">
              As of {(() => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; })()}
              {data && ` • ${data.total_accounts_shown || data.accounts?.length || 0} accounts`}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="spinner" />
            </div>
          ) : !data || data.accounts.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No account balances to display</p>
              <p className="text-xs text-muted-foreground mt-1">
                Post vouchers to see balances in the trial balance
              </p>
            </div>
          ) : (
            <>
              {/* Mobile view */}
              <div className="lg:hidden divide-y divide-border">
                {data.accounts.map((account, index) => (
                  <div key={index} className="p-3 space-y-2" data-testid={`tb-row-${account.code}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{account.code}</span>
                      <span className="text-sm truncate flex-1">{account.name}</span>
                      {account.is_leaf && (
                        <span className="text-[10px] px-1 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">leaf</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Debit:</span>
                          <span className={account.debit_usd > 0 ? 'text-emerald-400 font-mono' : 'text-muted-foreground'}>
                            ${account.debit_usd > 0 ? formatUSD(account.debit_usd) : '-'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Credit:</span>
                          <span className={account.credit_usd > 0 ? 'text-red-400 font-mono' : 'text-muted-foreground'}>
                            ${account.credit_usd > 0 ? formatUSD(account.credit_usd) : '-'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-muted-foreground text-xs">Net:</span>
                        <p className={`font-mono font-medium ${getNumberClass(account.net_usd)}`}>
                          ${formatUSD(account.net_usd)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {/* Mobile totals */}
                <div className="p-3 bg-muted/50">
                  <div className="grid grid-cols-2 gap-4 text-sm font-bold">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Total Debit</p>
                      <p className="font-mono text-emerald-400">${formatUSD(data.totals.debit_usd)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Total Credit</p>
                      <p className="font-mono text-red-400">${formatUSD(data.totals.credit_usd)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="px-4 py-3 text-left font-medium">Code</th>
                      <th className="px-4 py-3 text-left font-medium">Account Name</th>
                      <th className="px-4 py-3 text-right font-medium">Debit (LBP)</th>
                      <th className="px-4 py-3 text-right font-medium">Credit (LBP)</th>
                      <th className="px-4 py-3 text-right font-medium">Debit (USD)</th>
                      <th className="px-4 py-3 text-right font-medium">Credit (USD)</th>
                      <th className="px-4 py-3 text-right font-medium">Net (LBP)</th>
                      <th className="px-4 py-3 text-right font-medium">Net (USD)</th>
                      {showCumulative && (
                        <>
                          <th className="px-4 py-3 text-right font-medium text-blue-400">Cum. Db (USD)</th>
                          <th className="px-4 py-3 text-right font-medium text-blue-400">Cum. Cr (USD)</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.accounts.map((account, index) => (
                      <tr 
                        key={index} 
                        className={`border-b border-border hover:bg-muted/30 ${!account.is_leaf ? 'bg-muted/10' : ''}`}
                        data-testid={`tb-row-${account.code}`}
                      >
                        <td className="px-4 py-2 font-mono">
                          {account.code}
                          {!account.is_leaf && (
                            <span className="ml-1 text-[10px] px-1 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">parent</span>
                          )}
                        </td>
                        <td className="px-4 py-2">{account.name}</td>
                        <td className={`px-4 py-2 text-right font-mono ${account.debit_lbp > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                          {account.debit_lbp > 0 ? formatLBP(account.debit_lbp) : '-'}
                        </td>
                        <td className={`px-4 py-2 text-right font-mono ${account.credit_lbp > 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                          {account.credit_lbp > 0 ? formatLBP(account.credit_lbp) : '-'}
                        </td>
                        <td className={`px-4 py-2 text-right font-mono ${account.debit_usd > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                          {account.debit_usd > 0 ? formatUSD(account.debit_usd) : '-'}
                        </td>
                        <td className={`px-4 py-2 text-right font-mono ${account.credit_usd > 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                          {account.credit_usd > 0 ? formatUSD(account.credit_usd) : '-'}
                        </td>
                        <td className={`px-4 py-2 text-right font-mono font-medium ${getNumberClass(account.net_lbp)}`}>
                          {formatLBP(account.net_lbp)}
                        </td>
                        <td className={`px-4 py-2 text-right font-mono font-medium ${getNumberClass(account.net_usd)}`}>
                          {formatUSD(account.net_usd)}
                        </td>
                        {showCumulative && (
                          <>
                            <td className="px-4 py-2 text-right font-mono text-blue-400">
                              {formatUSD(account.cumulative_debit_usd)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-blue-400">
                              {formatUSD(account.cumulative_credit_usd)}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/50 border-t-2 border-primary/50">
                    <tr className="font-bold">
                      <td colSpan={2} className="px-4 py-3 text-right">TOTALS:</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-400">
                        {formatLBP(data.totals.debit_lbp)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-red-400">
                        {formatLBP(data.totals.credit_lbp)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-400">
                        {formatUSD(data.totals.debit_usd)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-red-400">
                        {formatUSD(data.totals.credit_usd)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        <span className={getNumberClass(data.totals.net_lbp)}>
                          {formatLBP(data.totals.net_lbp)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        <span className={getNumberClass(data.totals.net_usd)}>
                          {formatUSD(data.totals.net_usd)}
                        </span>
                      </td>
                      {showCumulative && <td colSpan={2}></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Balance check */}
              {data.totals && Math.abs(data.totals.debit_usd - data.totals.credit_usd) > 0.01 && (
                <div className="p-3 bg-yellow-500/10 border-t border-yellow-500/30">
                  <p className="text-sm text-yellow-400 text-center">
                    ⚠️ Trial balance is not balanced. Difference: ${formatUSD(Math.abs(data.totals.debit_usd - data.totals.credit_usd))}
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TrialBalancePage;
