import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import OfflineBanner from '../components/OfflineBanner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { 
  Plus, Search, ChevronRight, Download, Trash2, Pencil, 
  Upload, FileText, Check, X, AlertCircle, FileDown, List,
  Filter, Printer, WifiOff, RefreshCw
} from 'lucide-react';
import axios from 'axios';
import { formatLBP, formatUSD, getAccountClassName, getNumberClass } from '../lib/utils';
import LedgerDialog from '../components/LedgerDialog';
import db from '../lib/db';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ChartOfAccountsPage = () => {
  const { currentOrg, canEdit, canAdmin, user } = useAuth();
  const { isOnline } = useSync();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [ledgerAccount, setLedgerAccount] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editingAccount, setEditingAccount] = useState(null);
  
  // CSV Import state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [importStep, setImportStep] = useState('upload'); // upload, preview, result
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  // Retry/Re-update state for handling connection failures
  const [failedOperation, setFailedOperation] = useState(null); // {type: 'create'|'update', account: {...}, error: '...'}
  const [retrying, setRetrying] = useState(false);

  const [newAccount, setNewAccount] = useState({
    code: '',
    name: '',
    name_ar: '',
    account_class: 1,
    account_type: 'asset',
    parent_code: ''
  });

  // Filtered List state
  const [filterListOpen, setFilterListOpen] = useState(false);
  const [filterContent, setFilterContent] = useState('');
  const [filterBalance, setFilterBalance] = useState('all'); // all, non-zero, zero
  const [filterCodeLength, setFilterCodeLength] = useState('all'); // all, 2, 4, more

  useEffect(() => {
    if (currentOrg) {
      fetchAccounts();
    }
  }, [currentOrg]);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        const response = await axios.get(`${API}/accounts?organization_id=${currentOrg.id}`);
        setAccounts(response.data);
        
        // Cache in IndexedDB for offline use
        try {
          const accountsToCache = response.data.map(a => ({ ...a, organization_id: currentOrg.id }));
          await db.chartOfAccounts.where('organization_id').equals(currentOrg.id).delete();
          if (accountsToCache.length > 0) {
            await db.chartOfAccounts.bulkPut(accountsToCache);
          }
        } catch (cacheError) {
          console.warn('[ChartOfAccounts] Error caching accounts:', cacheError);
        }
      } else {
        // Load from IndexedDB when offline
        console.log('[ChartOfAccounts] Offline mode - loading from cache');
        const cachedAccounts = await db.chartOfAccounts
          .where('organization_id')
          .equals(currentOrg.id)
          .toArray();
        setAccounts(cachedAccounts);
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      // Fallback to cached data on error
      try {
        const cachedAccounts = await db.chartOfAccounts
          .where('organization_id')
          .equals(currentOrg.id)
          .toArray();
        if (cachedAccounts.length > 0) {
          setAccounts(cachedAccounts);
          console.log('[ChartOfAccounts] Loaded from cache after error');
        }
      } catch (cacheError) {
        console.error('[ChartOfAccounts] Cache fallback failed:', cacheError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newAccount,
        organization_id: currentOrg.id
      };
      
      if (isOnline) {
        // Online: Send to server
        if (editingAccount) {
          await axios.put(`${API}/accounts/${editingAccount.id}`, payload);
        } else {
          await axios.post(`${API}/accounts`, payload);
        }
        // Clear any previous failed operation on success
        setFailedOperation(null);
      } else {
        // Offline: Save locally and queue for sync
        const offlineId = 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const offlineAccount = {
          id: editingAccount?.id || offlineId,
          ...payload,
          balance_usd: editingAccount?.balance_usd || 0,
          balance_lbp: editingAccount?.balance_lbp || 0,
          created_offline: true,
          created_at: new Date().toISOString()
        };
        
        // Save to IndexedDB
        await db.chartOfAccounts.put(offlineAccount);
        
        // Add to sync queue
        const { addToSyncQueue, OPERATION_TYPES, ACTION_TYPES } = await import('../lib/syncService');
        await addToSyncQueue(
          OPERATION_TYPES.ACCOUNT, 
          editingAccount ? ACTION_TYPES.UPDATE : ACTION_TYPES.CREATE, 
          offlineAccount.id, 
          payload
        );
        
        alert('Account saved offline. It will sync when you\'re back online.');
      }
      
      setIsDialogOpen(false);
      resetForm();
      fetchAccounts();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to save account';
      // Store the failed operation for retry
      setFailedOperation({
        type: editingAccount ? 'update' : 'create',
        accountId: editingAccount?.id,
        payload: {
          ...newAccount,
          organization_id: currentOrg.id
        },
        error: errorMsg
      });
      alert(`Error: ${errorMsg}. You can retry using the "Re-update" button.`);
    }
  };

  // Retry failed operation
  const handleRetryOperation = async () => {
    if (!failedOperation) return;
    
    setRetrying(true);
    try {
      if (failedOperation.type === 'update') {
        await axios.put(`${API}/accounts/${failedOperation.accountId}`, failedOperation.payload);
      } else {
        await axios.post(`${API}/accounts`, failedOperation.payload);
      }
      
      setFailedOperation(null);
      setIsDialogOpen(false);
      resetForm();
      fetchAccounts();
      alert('Account saved successfully!');
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to save account';
      setFailedOperation({
        ...failedOperation,
        error: errorMsg
      });
      alert(`Retry failed: ${errorMsg}`);
    } finally {
      setRetrying(false);
    }
  };

  // Rebuild/Update accounts from historical vouchers
  const [rebuildingFromVouchers, setRebuildingFromVouchers] = useState(false);
  const [rebuildResult, setRebuildResult] = useState(null);

  const handleRebuildFromVouchers = async () => {
    if (!currentOrg) return;
    
    const confirmRebuild = window.confirm(
      'This will scan all vouchers and create/update accounts based on voucher line data.\n\n' +
      'This is useful if accounts are missing or have incorrect data.\n\n' +
      'Continue?'
    );
    
    if (!confirmRebuild) return;
    
    setRebuildingFromVouchers(true);
    setRebuildResult(null);
    
    try {
      const response = await axios.post(`${API}/accounts/rebuild-from-vouchers`, {
        organization_id: currentOrg.id
      });
      
      setRebuildResult(response.data);
      fetchAccounts();
      alert(`Rebuild complete!\nCreated: ${response.data.created || 0}\nUpdated: ${response.data.updated || 0}`);
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to rebuild accounts';
      alert(`Error: ${errorMsg}`);
    } finally {
      setRebuildingFromVouchers(false);
    }
  };

  const handleSeedCOA = async () => {
    setSeeding(true);
    try {
      const response = await axios.post(`${API}/accounts/seed-coa?organization_id=${currentOrg.id}`);
      alert(response.data.message);
      setSeedDialogOpen(false);
      fetchAccounts();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to seed COA');
    } finally {
      setSeeding(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) return;
    try {
      await axios.delete(`${API}/accounts/${deleteConfirm.id}`);
      setDeleteConfirm(null);
      fetchAccounts();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete account');
    }
  };

  const handleEditAccount = (account) => {
    setEditingAccount(account);
    setNewAccount({
      code: account.code,
      name: account.name,
      name_ar: account.name_ar || '',
      account_class: account.account_class,
      account_type: account.account_type,
      parent_code: account.parent_code || ''
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setNewAccount({
      code: '',
      name: '',
      name_ar: '',
      account_class: 1,
      account_type: 'asset',
      parent_code: ''
    });
    setEditingAccount(null);
  };

  // CSV Import handlers
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.csv')) {
      setImportFile(file);
      setImportStep('upload');
      setPreviewData(null);
      setImportResult(null);
    } else {
      alert('Please select a CSV file');
    }
  };

  const handlePreviewImport = async () => {
    if (!importFile) return;
    
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      
      const response = await axios.post(
        `${API}/accounts/import-csv/preview?organization_id=${currentOrg.id}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      setPreviewData(response.data);
      setImportStep('preview');
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to preview CSV');
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importFile) return;
    
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      
      const response = await axios.post(
        `${API}/accounts/import-csv?organization_id=${currentOrg.id}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      setImportResult(response.data);
      setImportStep('result');
      fetchAccounts();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to import CSV');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await axios.get(`${API}/accounts/template-csv`);
      const blob = new Blob([response.data.template], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'accounts_template.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to download template');
    }
  };

  const resetImportDialog = () => {
    setImportFile(null);
    setPreviewData(null);
    setImportResult(null);
    setImportStep('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredAccounts = accounts.filter(account => {
    const matchesSearch = account.code.includes(searchTerm) || 
                         account.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = selectedClass === 'all' || account.account_class === parseInt(selectedClass);
    return matchesSearch && matchesClass;
  });

  const groupedAccounts = filteredAccounts.reduce((groups, account) => {
    const classNum = account.account_class;
    if (!groups[classNum]) {
      groups[classNum] = [];
    }
    groups[classNum].push(account);
    return groups;
  }, {});

  // Filtered list for the advanced filter dialog
  const advancedFilteredAccounts = accounts.filter(account => {
    // Content filter (search in code, name, name_ar)
    const matchesContent = !filterContent || 
      account.code.toLowerCase().includes(filterContent.toLowerCase()) ||
      account.name.toLowerCase().includes(filterContent.toLowerCase()) ||
      (account.name_ar || '').toLowerCase().includes(filterContent.toLowerCase());
    
    // Balance filter
    const hasBalance = (account.balance_usd !== 0) || (account.balance_lbp !== 0);
    let matchesBalance = true;
    if (filterBalance === 'non-zero') {
      matchesBalance = hasBalance;
    } else if (filterBalance === 'zero') {
      matchesBalance = !hasBalance;
    }
    
    // Code length filter
    const codeLen = account.code.length;
    let matchesCodeLength = true;
    if (filterCodeLength === '2') {
      matchesCodeLength = codeLen === 2 || codeLen === 1;
    } else if (filterCodeLength === '4') {
      matchesCodeLength = codeLen === 3 || codeLen === 4;
    } else if (filterCodeLength === 'more') {
      matchesCodeLength = codeLen > 4;
    }
    
    return matchesContent && matchesBalance && matchesCodeLength;
  }).sort((a, b) => a.code.localeCompare(b.code));

  // Print filtered list
  const printFilteredList = () => {
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Chart of Accounts - Filtered List</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
          h1 { font-size: 16px; margin-bottom: 5px; }
          .subtitle { color: #666; font-size: 11px; margin-bottom: 15px; }
          .filters { background: #f5f5f5; padding: 8px; margin-bottom: 15px; font-size: 10px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #f0f0f0; font-weight: bold; }
          .number { text-align: right; font-family: monospace; }
          .code { font-family: monospace; font-weight: bold; }
          .negative { color: red; }
          .positive { color: green; }
          .footer { margin-top: 15px; font-size: 10px; color: #666; }
          @media print { body { margin: 10px; } }
        </style>
      </head>
      <body>
        <h1>Chart of Accounts - Filtered List</h1>
        <div class="subtitle">${currentOrg?.name || 'Organization'} - Printed on ${(() => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; })()}</div>
        <div class="filters">
          <strong>Filters Applied:</strong>
          ${filterContent ? `Content: "${filterContent}" | ` : ''}
          Balance: ${filterBalance === 'all' ? 'All' : filterBalance === 'non-zero' ? 'Non-Zero' : 'Zero'} | 
          Code Length: ${filterCodeLength === 'all' ? 'All' : filterCodeLength === '2' ? '1-2 digits' : filterCodeLength === '4' ? '3-4 digits' : '>4 digits'}
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 80px;">Code</th>
              <th>Account Name</th>
              <th>Arabic Name</th>
              <th style="width: 70px;">Class</th>
              <th style="width: 70px;">Type</th>
              <th style="width: 120px;" class="number">Balance (LBP)</th>
              <th style="width: 100px;" class="number">Balance (USD)</th>
            </tr>
          </thead>
          <tbody>
            ${advancedFilteredAccounts.map(acc => `
              <tr>
                <td class="code">${acc.code}</td>
                <td>${acc.name}</td>
                <td dir="rtl">${acc.name_ar || '-'}</td>
                <td>Class ${acc.account_class}</td>
                <td style="text-transform: capitalize;">${acc.account_type}</td>
                <td class="number ${acc.balance_lbp < 0 ? 'negative' : acc.balance_lbp > 0 ? 'positive' : ''}">${Number(acc.balance_lbp || 0).toLocaleString('en-US')}</td>
                <td class="number ${acc.balance_usd < 0 ? 'negative' : acc.balance_usd > 0 ? 'positive' : ''}">$${Number(acc.balance_usd || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="footer">
          Total Accounts: ${advancedFilteredAccounts.length} | 
          Total LBP: ${advancedFilteredAccounts.reduce((sum, a) => sum + (a.balance_lbp || 0), 0).toLocaleString('en-US')} | 
          Total USD: $${advancedFilteredAccounts.reduce((sum, a) => sum + (a.balance_usd || 0), 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
        </div>
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  const resetFilterList = () => {
    setFilterContent('');
    setFilterBalance('all');
    setFilterCodeLength('all');
  };

  const accountTypeOptions = [
    { value: 'asset', label: 'Asset' },
    { value: 'liability', label: 'Liability' },
    { value: 'equity', label: 'Equity' },
    { value: 'revenue', label: 'Revenue' },
    { value: 'expense', label: 'Expense' },
  ];

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6" data-testid="chart-of-accounts-page">
      {/* Offline Banner */}
      <OfflineBanner />
      
      {/* Failed Operation Banner - Re-update Button */}
      {failedOperation && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-400">
                Failed to {failedOperation.type === 'update' ? 'update' : 'create'} account
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Account: {failedOperation.payload?.code} - {failedOperation.payload?.name}
              </p>
              <p className="text-xs text-red-400/70 mt-0.5">
                Error: {failedOperation.error}
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setFailedOperation(null)}
              className="flex-1 sm:flex-initial text-xs"
            >
              <X className="w-3 h-3 mr-1" />
              Dismiss
            </Button>
            <Button 
              size="sm" 
              onClick={handleRetryOperation}
              disabled={retrying || !isOnline}
              className="flex-1 sm:flex-initial text-xs bg-red-500 hover:bg-red-600"
              data-testid="retry-account-btn"
            >
              {retrying ? (
                <>
                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Re-update Account
                </>
              )}
            </Button>
          </div>
        </div>
      )}
      
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Chart of Accounts
          </h1>
          <p className="text-muted-foreground text-xs lg:text-sm mt-1">
            Lebanese Chart of Accounts (LCOA) - Classes 1-7
          </p>
        </div>
        
        {/* Action buttons - responsive grid */}
        <div className="flex flex-wrap gap-2">
          {canAdmin() && accounts.length === 0 && (
            <Dialog open={seedDialogOpen} onOpenChange={setSeedDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs" data-testid="seed-coa-btn">
                  <Download className="w-3 h-3 mr-1 lg:w-4 lg:h-4 lg:mr-2" />
                  <span className="hidden sm:inline">Seed LCOA</span>
                  <span className="sm:hidden">Seed</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Seed Lebanese Chart of Accounts</DialogTitle>
                  <DialogDescription>
                    This will create 29 standard accounts following the Lebanese Chart of Accounts (LCOA) structure.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <p className="text-sm text-muted-foreground">Includes Classes 1-7:</p>
                  <ul className="text-xs sm:text-sm mt-2 space-y-1 text-muted-foreground">
                    <li>• Capital, Fixed Assets, Inventory</li>
                    <li>• Third Party, Financial Accounts</li>
                    <li>• Expenses, Revenue</li>
                  </ul>
                </div>
                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => setSeedDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
                  <Button onClick={handleSeedCOA} disabled={seeding} className="w-full sm:w-auto">
                    {seeding ? 'Seeding...' : 'Seed Accounts'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          
          {/* CSV Import Button */}
          {canAdmin() && (
            <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) resetImportDialog(); }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs" data-testid="import-csv-btn">
                  <Upload className="w-3 h-3 mr-1 lg:w-4 lg:h-4 lg:mr-2" />
                  <span className="hidden sm:inline">Import CSV</span>
                  <span className="sm:hidden">Import</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Import Accounts from CSV</DialogTitle>
                  <DialogDescription>
                    Upload a CSV file to import accounts. Existing accounts will be updated, new ones created.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  {/* Step 1: Upload */}
                  {importStep === 'upload' && (
                    <>
                      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-sm">
                        <span className="text-sm">Need a template?</span>
                        <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                          <FileDown className="w-4 h-4 mr-2" />
                          Download Template
                        </Button>
                      </div>
                      
                      <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv"
                          onChange={handleFileSelect}
                          className="hidden"
                          id="csv-upload"
                        />
                        <label htmlFor="csv-upload" className="cursor-pointer">
                          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                          <p className="text-sm font-medium">Click to select CSV file</p>
                          <p className="text-xs text-muted-foreground mt-1">or drag and drop</p>
                        </label>
                      </div>
                      
                      {importFile && (
                        <div className="flex items-center justify-between p-3 bg-primary/10 rounded-sm">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            <span className="text-sm font-medium">{importFile.name}</span>
                          </div>
                          <Button size="sm" onClick={handlePreviewImport} disabled={importing}>
                            {importing ? 'Loading...' : 'Preview Import'}
                          </Button>
                        </div>
                      )}
                      
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p><strong>Required columns:</strong> code, name</p>
                        <p><strong>Optional columns:</strong> name_ar, account_class (1-7), account_type, parent_code</p>
                      </div>
                    </>
                  )}
                  
                  {/* Step 2: Preview */}
                  {importStep === 'preview' && previewData && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                        <div className="p-3 bg-muted/30 rounded-sm">
                          <p className="text-lg font-bold">{previewData.total_rows}</p>
                          <p className="text-xs text-muted-foreground">Total Rows</p>
                        </div>
                        <div className="p-3 bg-emerald-500/20 rounded-sm">
                          <p className="text-lg font-bold text-emerald-400">{previewData.new_accounts}</p>
                          <p className="text-xs text-muted-foreground">New</p>
                        </div>
                        <div className="p-3 bg-blue-500/20 rounded-sm">
                          <p className="text-lg font-bold text-blue-400">{previewData.update_accounts}</p>
                          <p className="text-xs text-muted-foreground">Updates</p>
                        </div>
                        <div className="p-3 bg-red-500/20 rounded-sm">
                          <p className="text-lg font-bold text-red-400">{previewData.invalid_rows}</p>
                          <p className="text-xs text-muted-foreground">Errors</p>
                        </div>
                      </div>
                      
                      {previewData.errors.length > 0 && (
                        <div className="p-3 bg-red-500/10 rounded-sm">
                          <p className="text-sm font-medium text-red-400 mb-2">Errors found:</p>
                          <ul className="text-xs text-red-400 space-y-1 max-h-24 overflow-y-auto">
                            {previewData.errors.map((err, i) => (
                              <li key={i}>• {err}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {previewData.preview_data.length > 0 && (
                        <div className="overflow-x-auto max-h-48">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="px-2 py-1 text-left">Action</th>
                                <th className="px-2 py-1 text-left">Code</th>
                                <th className="px-2 py-1 text-left">Name</th>
                                <th className="px-2 py-1 text-left">Class</th>
                                <th className="px-2 py-1 text-left">Type</th>
                              </tr>
                            </thead>
                            <tbody>
                              {previewData.preview_data.slice(0, 10).map((row, i) => (
                                <tr key={i} className="border-t border-border">
                                  <td className="px-2 py-1">
                                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                                      row.action === 'create' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
                                    }`}>
                                      {row.action}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1 font-mono">{row.code}</td>
                                  <td className="px-2 py-1">{row.name}</td>
                                  <td className="px-2 py-1">{row.account_class}</td>
                                  <td className="px-2 py-1">{row.account_type}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {previewData.preview_data.length > 10 && (
                            <p className="text-xs text-muted-foreground text-center py-2">
                              ... and {previewData.preview_data.length - 10} more rows
                            </p>
                          )}
                        </div>
                      )}
                      
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={resetImportDialog} className="flex-1">
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleConfirmImport} 
                          disabled={importing || previewData.valid_rows === 0}
                          className="flex-1"
                        >
                          {importing ? 'Importing...' : `Import ${previewData.valid_rows} Accounts`}
                        </Button>
                      </div>
                    </>
                  )}
                  
                  {/* Step 3: Result */}
                  {importStep === 'result' && importResult && (
                    <div className="text-center space-y-4">
                      <div className={`p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center ${
                        importResult.success ? 'bg-emerald-500/20' : 'bg-red-500/20'
                      }`}>
                        {importResult.success ? (
                          <Check className="w-8 h-8 text-emerald-400" />
                        ) : (
                          <X className="w-8 h-8 text-red-400" />
                        )}
                      </div>
                      <p className="text-lg font-medium">{importResult.message}</p>
                      <div className="flex justify-center gap-4">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-emerald-400">{importResult.created}</p>
                          <p className="text-xs text-muted-foreground">Created</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-blue-400">{importResult.updated}</p>
                          <p className="text-xs text-muted-foreground">Updated</p>
                        </div>
                      </div>
                      {importResult.errors.length > 0 && (
                        <div className="p-3 bg-red-500/10 rounded-sm text-left">
                          <p className="text-sm font-medium text-red-400 mb-2">Some errors occurred:</p>
                          <ul className="text-xs text-red-400 space-y-1">
                            {importResult.errors.map((err, i) => (
                              <li key={i}>• {err}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <Button onClick={() => setImportDialogOpen(false)} className="w-full">
                        Done
                      </Button>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
          
          {/* Rebuild from Vouchers Button */}
          {canAdmin() && (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs"
              onClick={handleRebuildFromVouchers}
              disabled={rebuildingFromVouchers || !isOnline}
              data-testid="rebuild-from-vouchers-btn"
            >
              {rebuildingFromVouchers ? (
                <>
                  <RefreshCw className="w-3 h-3 mr-1 lg:w-4 lg:h-4 lg:mr-2 animate-spin" />
                  <span className="hidden sm:inline">Rebuilding...</span>
                  <span className="sm:hidden">...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3 h-3 mr-1 lg:w-4 lg:h-4 lg:mr-2" />
                  <span className="hidden sm:inline">Rebuild from Vouchers</span>
                  <span className="sm:hidden">Rebuild</span>
                </>
              )}
            </Button>
          )}
          
          {/* Filtered List Button */}
          <Dialog open={filterListOpen} onOpenChange={setFilterListOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs" data-testid="filtered-list-btn">
                <Filter className="w-3 h-3 mr-1 lg:w-4 lg:h-4 lg:mr-2" />
                <span className="hidden sm:inline">Filtered List</span>
                <span className="sm:hidden">Filter</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Advanced Filter & Print</DialogTitle>
                <DialogDescription>
                  Filter accounts by content, balance, and code length. Print or view the filtered list.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="filter-content" className="text-sm">Search Content</Label>
                    <Input
                      id="filter-content"
                      placeholder="Code, name, or Arabic name..."
                      value={filterContent}
                      onChange={(e) => setFilterContent(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="filter-balance" className="text-sm">Balance Filter</Label>
                    <Select value={filterBalance} onValueChange={setFilterBalance}>
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Balances</SelectItem>
                        <SelectItem value="non-zero">Non-Zero Balance</SelectItem>
                        <SelectItem value="zero">Zero Balance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="filter-code-length" className="text-sm">Code Length</Label>
                    <Select value={filterCodeLength} onValueChange={setFilterCodeLength}>
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Lengths</SelectItem>
                        <SelectItem value="2">1-2 Digits</SelectItem>
                        <SelectItem value="4">3-4 Digits</SelectItem>
                        <SelectItem value="more">&gt;4 Digits</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="border rounded-lg p-3 bg-muted/30">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium">Filtered Results</h4>
                    <span className="text-xs text-muted-foreground">
                      {advancedFilteredAccounts.length} accounts
                    </span>
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto">
                    {advancedFilteredAccounts.length > 0 ? (
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="px-2 py-1 text-left">Code</th>
                            <th className="px-2 py-1 text-left">Name</th>
                            <th className="px-2 py-1 text-left">Class</th>
                            <th className="px-2 py-1 text-right">LBP</th>
                            <th className="px-2 py-1 text-right">USD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {advancedFilteredAccounts.slice(0, 50).map((acc) => (
                            <tr key={acc.id} className="border-t border-border">
                              <td className="px-2 py-1 font-mono">{acc.code}</td>
                              <td className="px-2 py-1 truncate max-w-32">{acc.name}</td>
                              <td className="px-2 py-1">{acc.account_class}</td>
                              <td className="px-2 py-1 text-right font-mono">
                                {Number(acc.balance_lbp || 0).toLocaleString()}
                              </td>
                              <td className="px-2 py-1 text-right font-mono">
                                ${Number(acc.balance_usd || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No accounts match the current filters
                      </p>
                    )}
                    {advancedFilteredAccounts.length > 50 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        ... and {advancedFilteredAccounts.length - 50} more accounts
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" onClick={resetFilterList} className="flex-1">
                    Reset Filters
                  </Button>
                  <Button 
                    onClick={printFilteredList} 
                    disabled={advancedFilteredAccounts.length === 0}
                    className="flex-1"
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    Print List ({advancedFilteredAccounts.length})
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          
          {canEdit() && (
            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="btn-glow text-xs" size="sm" data-testid="add-account-btn">
                  <Plus className="w-3 h-3 mr-1 lg:w-4 lg:h-4 lg:mr-2" />
                  <span className="hidden sm:inline">Add Account</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>
                    {editingAccount ? 'Edit Account' : 'Add New Account'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateAccount} className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="code" className="text-xs sm:text-sm">Account Code</Label>
                      <Input
                        id="code"
                        placeholder="e.g., 51201"
                        value={newAccount.code}
                        onChange={(e) => setNewAccount({ ...newAccount, code: e.target.value })}
                        required
                        className="font-mono text-sm"
                        data-testid="account-code-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="class" className="text-xs sm:text-sm">Class</Label>
                      <Select
                        value={String(newAccount.account_class)}
                        onValueChange={(value) => setNewAccount({ ...newAccount, account_class: parseInt(value) })}
                      >
                        <SelectTrigger data-testid="account-class-select" className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7].map(num => (
                            <SelectItem key={num} value={String(num)}>
                              Class {num}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-xs sm:text-sm">Account Name (English)</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Bank of Beirut - LBP"
                      value={newAccount.name}
                      onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                      required
                      className="text-sm"
                      data-testid="account-name-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name_ar" className="text-xs sm:text-sm">Account Name (Arabic)</Label>
                    <Input
                      id="name_ar"
                      placeholder="e.g., بنك بيروت - ليرة"
                      value={newAccount.name_ar}
                      onChange={(e) => setNewAccount({ ...newAccount, name_ar: e.target.value })}
                      dir="rtl"
                      className="text-sm"
                      data-testid="account-name-ar-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="type" className="text-xs sm:text-sm">Account Type</Label>
                    <Select
                      value={newAccount.account_type}
                      onValueChange={(value) => setNewAccount({ ...newAccount, account_type: value })}
                    >
                      <SelectTrigger data-testid="account-type-select" className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {accountTypeOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }} className="w-full sm:w-auto">
                      Cancel
                    </Button>
                    <Button type="submit" className="w-full sm:w-auto" data-testid="save-account-btn">
                      {editingAccount ? 'Update' : 'Create'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by code or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-sm h-9"
                data-testid="account-search"
              />
            </div>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-full sm:w-[140px] text-sm h-9" data-testid="class-filter">
                <SelectValue placeholder="Filter class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {[1, 2, 3, 4, 5, 6, 7].map(num => (
                  <SelectItem key={num} value={String(num)}>Class {num}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Accounts List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="spinner" />
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(groupedAccounts).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([classNum, classAccounts]) => (
            <Card key={classNum} className={`border-l-4 border-l-${['violet', 'blue', 'cyan', 'amber', 'emerald', 'red', 'green'][parseInt(classNum) - 1]}-400`} data-testid={`account-class-${classNum}`}>
              <CardHeader className="py-2 px-3 lg:py-3 lg:px-4">
                <CardTitle className="text-xs lg:text-sm flex items-center gap-1 lg:gap-2">
                  <span className="text-muted-foreground">Class {classNum}</span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  <span className="truncate">{getAccountClassName(parseInt(classNum))}</span>
                  <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{classAccounts.length}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {/* Mobile view */}
                <div className="lg:hidden">
                  {classAccounts.map((account, idx) => (
                    <div key={account.id} className={`p-3 border-b border-border ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}`} data-testid={`account-row-${account.code}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-sm">{account.code}</span>
                            <span className="text-xs text-muted-foreground capitalize">{account.account_type}</span>
                          </div>
                          <p className="text-sm truncate">{account.name}</p>
                          {account.name_ar && <p className="text-xs text-muted-foreground truncate" dir="rtl">{account.name_ar}</p>}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setLedgerAccount(account)} title="View Ledger">
                            <List className="w-3 h-3" />
                          </Button>
                          {canEdit() && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEditAccount(account)} title="Edit">
                                <Pencil className="w-3 h-3" />
                              </Button>
                              {canAdmin() && (
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => setDeleteConfirm(account)} title="Delete">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-3 mt-2 text-xs">
                        <span className={getNumberClass(account.balance_lbp)}>LBP: {formatLBP(account.balance_lbp)}</span>
                        <span className={getNumberClass(account.balance_usd)}>USD: ${formatUSD(account.balance_usd)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <table className="hidden lg:table data-table">
                  <thead>
                    <tr>
                      <th className="w-24">Code</th>
                      <th>Account Name</th>
                      <th>Arabic Name</th>
                      <th>Type</th>
                      <th className="text-right">Balance (LBP)</th>
                      <th className="text-right">Balance (USD)</th>
                      <th className="w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {classAccounts.map((account, idx) => (
                      <tr key={account.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'} hover:bg-blue-50/50 transition-colors`} data-testid={`account-row-${account.code}`}>
                        <td className="font-mono font-medium">{account.code}</td>
                        <td>{account.name}</td>
                        <td className="text-muted-foreground" dir="rtl">{account.name_ar || '-'}</td>
                        <td><span className="text-xs text-muted-foreground capitalize">{account.account_type}</span></td>
                        <td className={`number ${getNumberClass(account.balance_lbp)}`}>{formatLBP(account.balance_lbp)}</td>
                        <td className={`number ${getNumberClass(account.balance_usd)}`}>${formatUSD(account.balance_usd)}</td>
                        <td>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setLedgerAccount(account)} title="View Ledger">
                              <List className="w-3 h-3" />
                            </Button>
                            {canEdit() && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => handleEditAccount(account)} title="Edit">
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                {canAdmin() && (
                                  <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setDeleteConfirm(account)} title="Delete">
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}

          {filteredAccounts.length === 0 && (
            <div className="text-center py-12">
              <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No accounts found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {searchTerm ? 'Try adjusting your search' : accounts.length === 0 ? 'Seed LCOA, import CSV, or add your first account' : 'Add your first account to get started'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete account <strong>{deleteConfirm?.code} - {deleteConfirm?.name}</strong>?
              {(deleteConfirm?.balance_lbp !== 0 || deleteConfirm?.balance_usd !== 0) && (
                <span className="block mt-2 text-red-400">
                  Warning: This account has a non-zero balance and cannot be deleted.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="w-full sm:w-auto">Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteAccount}
              disabled={deleteConfirm?.balance_lbp !== 0 || deleteConfirm?.balance_usd !== 0}
              className="w-full sm:w-auto"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ledger Dialog */}
      <LedgerDialog
        account={ledgerAccount}
        organizationId={currentOrg?.id}
        open={!!ledgerAccount}
        onClose={() => setLedgerAccount(null)}
        userRole={user?.role}
      />
    </div>
  );
};

export default ChartOfAccountsPage;
