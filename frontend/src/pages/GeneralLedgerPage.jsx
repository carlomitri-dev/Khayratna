import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover';
import { List, Download, Printer, Search, ChevronsUpDown, Check } from 'lucide-react';
import axios from 'axios';
import { formatLBP, formatUSD, formatDate, getNumberClass } from '../lib/utils';
import { printReport, exportGeneralLedgerToCSV } from '../lib/reportUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Searchable Account Selector Component
const AccountSearchSelector = ({ accounts, value, onChange, loading }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredAccounts = useMemo(() => {
    if (!search) return accounts;
    const searchLower = search.toLowerCase();
    return accounts.filter(acc => 
      acc.code.toLowerCase().includes(searchLower) ||
      acc.name.toLowerCase().includes(searchLower) ||
      (acc.name_ar && acc.name_ar.includes(search))
    );
  }, [accounts, search]);

  const selectedAccount = accounts.find(a => a.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-10 text-sm"
          disabled={loading}
          data-testid="account-select"
        >
          {loading ? (
            <span className="text-muted-foreground">Loading accounts...</span>
          ) : selectedAccount ? (
            <span className="truncate">
              <span className="font-mono mr-2">{selectedAccount.code}</span>
              {selectedAccount.name}
            </span>
          ) : (
            <span className="text-muted-foreground">Search and select an account...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(400px,90vw)] p-0" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {filteredAccounts.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No accounts found
            </div>
          ) : (
            filteredAccounts.map(acc => (
              <div
                key={acc.code}
                className={`flex items-center px-3 py-2 cursor-pointer hover:bg-muted text-sm ${
                  value === acc.code ? 'bg-muted' : ''
                }`}
                onClick={() => {
                  onChange(acc.code);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <span className="font-mono w-16 sm:w-20 flex-shrink-0 text-xs sm:text-sm">{acc.code}</span>
                <span className="truncate flex-1">{acc.name}</span>
                {value === acc.code && <Check className="ml-2 h-4 w-4 flex-shrink-0" />}
              </div>
            ))
          )}
        </div>
        <div className="p-2 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">
            {filteredAccounts.length} of {accounts.length} accounts
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const GeneralLedgerPage = () => {
  const { currentOrg } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [ledgerData, setLedgerData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(true);

  useEffect(() => {
    if (currentOrg) {
      fetchAccounts();
    }
  }, [currentOrg]);

  const fetchAccounts = async () => {
    setAccountsLoading(true);
    try {
      const response = await axios.get(`${API}/accounts?organization_id=${currentOrg.id}`);
      setAccounts(response.data);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    } finally {
      setAccountsLoading(false);
    }
  };

  const fetchLedger = async (accountCode) => {
    if (!accountCode) return;
    
    setLoading(true);
    try {
      const response = await axios.get(`${API}/reports/general-ledger/${accountCode}?organization_id=${currentOrg.id}`);
      setLedgerData(response.data);
    } catch (error) {
      console.error('Failed to fetch ledger:', error);
      setLedgerData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAccountChange = (value) => {
    setSelectedAccount(value);
    fetchLedger(value);
  };

  const handlePrint = () => {
    printReport('General Ledger');
  };

  const handleExport = () => {
    if (ledgerData && currentOrg) {
      exportGeneralLedgerToCSV(ledgerData, currentOrg.name.replace(/\s+/g, '_'));
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
    <div className="space-y-4 lg:space-y-6" data-testid="general-ledger-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
            General Ledger
          </h1>
          <p className="text-muted-foreground text-xs lg:text-sm mt-1">
            View all movements for a specific account
          </p>
        </div>
        {ledgerData && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={handlePrint}>
              <Printer className="w-3 h-3 mr-1 lg:w-4 lg:h-4 lg:mr-2" />
              <span className="hidden sm:inline">Print</span>
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={handleExport}>
              <Download className="w-3 h-3 mr-1 lg:w-4 lg:h-4 lg:mr-2" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        )}
      </div>

      {/* Account Selector with Search */}
      <Card data-testid="account-selector">
        <CardContent className="p-3 lg:p-4">
          <div className="space-y-2">
            <label className="text-xs lg:text-sm font-medium">Select Account</label>
            <AccountSearchSelector
              accounts={accounts}
              value={selectedAccount}
              onChange={handleAccountChange}
              loading={accountsLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Ledger Display */}
      {selectedAccount ? (
        <Card data-testid="ledger-report">
          <CardHeader className="border-b border-border p-3 lg:p-6">
            {ledgerData && (
              <div className="report-header">
                <CardTitle className="report-title text-base lg:text-xl">{currentOrg.name}</CardTitle>
                <p className="report-subtitle text-sm lg:text-base">General Ledger</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mt-3">
                  <div className="px-3 py-2 bg-muted/50 rounded-sm text-center sm:text-left">
                    <span className="text-xs sm:text-sm text-muted-foreground">Account: </span>
                    <span className="font-mono font-bold text-sm sm:text-base">{ledgerData.account.code}</span>
                    <span className="ml-2 text-sm">{ledgerData.account.name}</span>
                  </div>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="spinner" />
              </div>
            ) : !ledgerData ? (
              <div className="text-center py-12">
                <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Select an account to view its ledger</p>
              </div>
            ) : ledgerData.entries.length === 0 ? (
              <div className="text-center py-12">
                <List className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No transactions for this account</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Post vouchers with this account to see entries here
                </p>
              </div>
            ) : (
              <>
                {/* Mobile view */}
                <div className="lg:hidden divide-y divide-border">
                  {ledgerData.entries.map((entry, index) => (
                    <div key={index} className="p-3 space-y-2" data-testid={`ledger-row-${index}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                        <span className={`px-2 py-0.5 rounded-sm text-xs border voucher-${entry.voucher_type.toLowerCase()}`}>
                          {entry.voucher_number}
                        </span>
                      </div>
                      <p className="text-sm truncate">{entry.description}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Debit: </span>
                          <span className={entry.debit_usd > 0 ? 'text-emerald-400 font-mono' : 'text-muted-foreground'}>
                            ${entry.debit_usd > 0 ? formatUSD(entry.debit_usd) : '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Credit: </span>
                          <span className={entry.credit_usd > 0 ? 'text-red-400 font-mono' : 'text-muted-foreground'}>
                            ${entry.credit_usd > 0 ? formatUSD(entry.credit_usd) : '-'}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">Balance:</span>
                        <span className={`font-mono font-medium ${getNumberClass(entry.balance_usd)}`}>
                          ${formatUSD(entry.balance_usd)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {/* Mobile footer */}
                  <div className="p-3 bg-muted/50">
                    <div className="flex justify-between text-sm font-bold">
                      <span>Closing Balance:</span>
                      <span className={`font-mono ${getNumberClass(ledgerData.closing_balance.usd)}`}>
                        ${formatUSD(ledgerData.closing_balance.usd)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>LBP:</span>
                      <span className="font-mono">{formatLBP(ledgerData.closing_balance.lbp)}</span>
                    </div>
                  </div>
                </div>

                {/* Desktop table */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="px-4 py-3 text-left font-medium">Date</th>
                        <th className="px-4 py-3 text-left font-medium">Voucher</th>
                        <th className="px-4 py-3 text-left font-medium">Description</th>
                        <th className="px-4 py-3 text-right font-medium">Debit (LBP)</th>
                        <th className="px-4 py-3 text-right font-medium">Credit (LBP)</th>
                        <th className="px-4 py-3 text-right font-medium">Debit (USD)</th>
                        <th className="px-4 py-3 text-right font-medium">Credit (USD)</th>
                        <th className="px-4 py-3 text-right font-medium">Balance (LBP)</th>
                        <th className="px-4 py-3 text-right font-medium">Balance (USD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerData.entries.map((entry, index) => (
                        <tr key={index} className="border-b border-border hover:bg-muted/30" data-testid={`ledger-row-${index}`}>
                          <td className="px-4 py-2 text-muted-foreground">{formatDate(entry.date)}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded-sm text-xs border voucher-${entry.voucher_type.toLowerCase()}`}>
                              {entry.voucher_number}
                            </span>
                          </td>
                          <td className="px-4 py-2 max-w-[200px] truncate">{entry.description}</td>
                          <td className={`px-4 py-2 text-right font-mono ${entry.debit_lbp > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            {entry.debit_lbp > 0 ? formatLBP(entry.debit_lbp) : '-'}
                          </td>
                          <td className={`px-4 py-2 text-right font-mono ${entry.credit_lbp > 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                            {entry.credit_lbp > 0 ? formatLBP(entry.credit_lbp) : '-'}
                          </td>
                          <td className={`px-4 py-2 text-right font-mono ${entry.debit_usd > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            {entry.debit_usd > 0 ? formatUSD(entry.debit_usd) : '-'}
                          </td>
                          <td className={`px-4 py-2 text-right font-mono ${entry.credit_usd > 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                            {entry.credit_usd > 0 ? formatUSD(entry.credit_usd) : '-'}
                          </td>
                          <td className={`px-4 py-2 text-right font-mono font-medium ${getNumberClass(entry.balance_lbp)}`}>
                            {formatLBP(entry.balance_lbp)}
                          </td>
                          <td className={`px-4 py-2 text-right font-mono font-medium ${getNumberClass(entry.balance_usd)}`}>
                            {formatUSD(entry.balance_usd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/50 border-t-2 border-primary/50">
                      <tr className="font-bold">
                        <td colSpan={7} className="px-4 py-3 text-right">Closing Balance:</td>
                        <td className={`px-4 py-3 text-right font-mono ${getNumberClass(ledgerData.closing_balance.lbp)}`}>
                          {formatLBP(ledgerData.closing_balance.lbp)}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono ${getNumberClass(ledgerData.closing_balance.usd)}`}>
                          {formatUSD(ledgerData.closing_balance.usd)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <List className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Select an account to view its general ledger</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default GeneralLedgerPage;
