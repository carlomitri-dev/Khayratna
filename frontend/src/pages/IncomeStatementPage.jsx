import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { TrendingUp, TrendingDown, Download, Printer } from 'lucide-react';
import axios from 'axios';
import { formatLBP, formatUSD } from '../lib/utils';
import { printReport, exportIncomeStatementToCSV } from '../lib/reportUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const IncomeStatementPage = () => {
  const { currentOrg } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentOrg) {
      fetchIncomeStatement();
    }
  }, [currentOrg]);

  const fetchIncomeStatement = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/reports/income-statement?organization_id=${currentOrg.id}`);
      setData(response.data);
    } catch (error) {
      console.error('Failed to fetch income statement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    printReport('Income Statement');
  };

  const handleExport = () => {
    if (data && currentOrg) {
      exportIncomeStatementToCSV(data, currentOrg.name.replace(/\s+/g, '_'));
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
    <div className="space-y-4 lg:space-y-6" data-testid="income-statement-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Income Statement
          </h1>
          <p className="text-muted-foreground text-xs lg:text-sm mt-1">
            Revenue, Expenses, and Net Income (Class 7 - Class 6)
          </p>
        </div>
        <div className="flex gap-2">
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

      <Card data-testid="income-statement-report">
        <CardHeader className="border-b border-border p-3 lg:p-6">
          <div className="report-header">
            <CardTitle className="report-title text-base lg:text-xl">{currentOrg.name}</CardTitle>
            <p className="report-subtitle text-sm lg:text-base">Income Statement</p>
            <p className="text-xs text-muted-foreground mt-1">
              For the period ending {(() => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; })()}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-3 lg:p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="spinner" />
            </div>
          ) : !data ? (
            <p className="text-muted-foreground text-center py-12">Failed to load data</p>
          ) : (
            <div className="space-y-6 lg:space-y-8">
              {/* Revenue Section */}
              <div data-testid="revenue-section">
                <div className="flex items-center gap-2 mb-3 lg:mb-4">
                  <div className="p-1.5 lg:p-2 bg-emerald-500/20 rounded-sm">
                    <TrendingUp className="w-4 h-4 lg:w-5 lg:h-5 text-emerald-400" />
                  </div>
                  <h2 className="text-base lg:text-lg font-semibold" style={{ fontFamily: 'Manrope, sans-serif' }}>
                    Revenue (Class 7)
                  </h2>
                </div>
                
                {data.revenue.accounts.length === 0 ? (
                  <p className="text-muted-foreground text-sm pl-8 lg:pl-10">No revenue accounts with balances</p>
                ) : (
                  <div className="pl-2 lg:pl-10 space-y-2">
                    {data.revenue.accounts.map((acc, index) => (
                      <div key={index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 border-b border-border/50 gap-1">
                        <div className="flex items-center gap-2 lg:gap-3">
                          <span className="font-mono text-xs lg:text-sm text-muted-foreground">{acc.code}</span>
                          <span className="text-sm truncate">{acc.name}</span>
                        </div>
                        <div className="flex justify-end gap-3 lg:gap-8 text-sm">
                          <span className="font-mono text-emerald-400 hidden sm:inline">{formatLBP(acc.balance_lbp)} LBP</span>
                          <span className="font-mono text-blue-400">${formatUSD(acc.balance_usd)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 lg:py-3 mt-2 bg-emerald-500/10 rounded-sm px-2 lg:px-3 gap-1" data-testid="total-revenue">
                      <span className="font-semibold text-sm lg:text-base">Total Revenue</span>
                      <div className="flex justify-end gap-3 lg:gap-8 text-sm">
                        <span className="font-mono font-bold text-emerald-400 hidden sm:inline">{formatLBP(data.revenue.total_lbp)} LBP</span>
                        <span className="font-mono font-bold text-blue-400">${formatUSD(data.revenue.total_usd)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Expenses Section */}
              <div data-testid="expenses-section">
                <div className="flex items-center gap-2 mb-3 lg:mb-4">
                  <div className="p-1.5 lg:p-2 bg-red-500/20 rounded-sm">
                    <TrendingDown className="w-4 h-4 lg:w-5 lg:h-5 text-red-400" />
                  </div>
                  <h2 className="text-base lg:text-lg font-semibold" style={{ fontFamily: 'Manrope, sans-serif' }}>
                    Expenses (Class 6)
                  </h2>
                </div>
                
                {data.expenses.accounts.length === 0 ? (
                  <p className="text-muted-foreground text-sm pl-8 lg:pl-10">No expense accounts with balances</p>
                ) : (
                  <div className="pl-2 lg:pl-10 space-y-2">
                    {data.expenses.accounts.map((acc, index) => (
                      <div key={index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 border-b border-border/50 gap-1">
                        <div className="flex items-center gap-2 lg:gap-3">
                          <span className="font-mono text-xs lg:text-sm text-muted-foreground">{acc.code}</span>
                          <span className="text-sm truncate">{acc.name}</span>
                        </div>
                        <div className="flex justify-end gap-3 lg:gap-8 text-sm">
                          <span className="font-mono text-red-400 hidden sm:inline">{formatLBP(acc.balance_lbp)} LBP</span>
                          <span className="font-mono text-blue-400">${formatUSD(acc.balance_usd)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 lg:py-3 mt-2 bg-red-500/10 rounded-sm px-2 lg:px-3 gap-1" data-testid="total-expenses">
                      <span className="font-semibold text-sm lg:text-base">Total Expenses</span>
                      <div className="flex justify-end gap-3 lg:gap-8 text-sm">
                        <span className="font-mono font-bold text-red-400 hidden sm:inline">{formatLBP(data.expenses.total_lbp)} LBP</span>
                        <span className="font-mono font-bold text-blue-400">${formatUSD(data.expenses.total_usd)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Net Income */}
              <div className="border-t-2 border-primary pt-4 lg:pt-6" data-testid="net-income-section">
                <div className="flex items-center gap-2 mb-3 lg:mb-4">
                  <div className={`p-1.5 lg:p-2 rounded-sm ${data.net_income.usd >= 0 ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                    {data.net_income.usd >= 0 ? (
                      <TrendingUp className="w-4 h-4 lg:w-5 lg:h-5 text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-4 h-4 lg:w-5 lg:h-5 text-red-400" />
                    )}
                  </div>
                  <h2 className="text-base lg:text-lg font-semibold" style={{ fontFamily: 'Manrope, sans-serif' }}>
                    Net Income
                  </h2>
                </div>
                
                <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 lg:py-4 px-3 lg:px-6 rounded-sm gap-2 ${
                  data.net_income.usd >= 0 ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-red-500/20 border border-red-500/30'
                }`}>
                  <span className="text-base lg:text-lg font-bold">
                    {data.net_income.usd >= 0 ? 'Net Profit' : 'Net Loss'}
                  </span>
                  <div className="flex justify-end gap-3 lg:gap-8">
                    <span className={`font-mono text-lg lg:text-xl font-bold hidden sm:inline ${data.net_income.lbp >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatLBP(data.net_income.lbp)} LBP
                    </span>
                    <span className={`font-mono text-lg lg:text-xl font-bold ${data.net_income.usd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ${formatUSD(data.net_income.usd)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default IncomeStatementPage;
