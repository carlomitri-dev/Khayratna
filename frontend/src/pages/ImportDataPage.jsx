import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle, 
  AlertCircle,
  Users,
  Truck,
  BookOpen,
  Receipt,
  Loader2,
  Info
} from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ImportDataPage = () => {
  const { currentOrg } = useAuth();
  const { fiscalYears, selectedFY } = useFiscalYear();
  
  // COA Import state
  const [coaFile, setCoaFile] = useState(null);
  const [coaFYId, setCoaFYId] = useState(selectedFY?.id || '');
  const [coaImporting, setCoaImporting] = useState(false);
  const [coaResult, setCoaResult] = useState(null);
  
  // Voucher Import state
  const [voucherFile, setVoucherFile] = useState(null);
  const [voucherFYId, setVoucherFYId] = useState(selectedFY?.id || '');
  const [voucherImporting, setVoucherImporting] = useState(false);
  const [voucherResult, setVoucherResult] = useState(null);

  const handleCoaImport = async () => {
    if (!coaFile || !currentOrg) return;
    setCoaImporting(true);
    setCoaResult(null);
    
    try {
      const formData = new FormData();
      formData.append('file', coaFile);
      formData.append('organization_id', currentOrg.id);
      if (coaFYId) formData.append('fiscal_year_id', coaFYId);
      
      const response = await axios.post(`${API}/import/chart-of-accounts`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000  // 2 min timeout for large files
      });
      setCoaResult(response.data);
    } catch (err) {
      setCoaResult({ 
        error: true, 
        message: err.response?.data?.detail || 'Import failed. Please check the file format.' 
      });
    } finally {
      setCoaImporting(false);
    }
  };

  const handleVoucherImport = async () => {
    if (!voucherFile || !currentOrg) return;
    setVoucherImporting(true);
    setVoucherResult(null);
    
    try {
      const formData = new FormData();
      formData.append('file', voucherFile);
      formData.append('organization_id', currentOrg.id);
      if (voucherFYId) formData.append('fiscal_year_id', voucherFYId);
      
      const response = await axios.post(`${API}/import/vouchers`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000  // 10 min timeout for large files
      });
      setVoucherResult(response.data);
    } catch (err) {
      setVoucherResult({ 
        error: true, 
        message: err.response?.data?.detail || 'Import failed. Please check the file format.' 
      });
    } finally {
      setVoucherImporting(false);
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
    <div className="space-y-6" data-testid="import-data-page">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Import Data
        </h1>
        <p className="text-muted-foreground text-xs lg:text-sm mt-1">
          Import Chart of Accounts and Voucher History from Excel files for {currentOrg?.name}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* COA Import Card */}
        <Card className="border-blue-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base lg:text-lg" style={{ fontFamily: 'Manrope, sans-serif' }}>
              <BookOpen className="w-5 h-5 text-blue-400" />
              Import Chart of Accounts
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Import accounts from Excel. Accounts with code starting with "40" (length &gt; 4) will be added as suppliers, "41" as customers.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Info Banner */}
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Expected columns:</strong></p>
                  <p>Account Code, Name (Arabic), Type, ADDRESS, PHONE for suppliers/clients</p>
                </div>
              </div>
            </div>

            {/* FY Selector */}
            <div>
              <Label className="text-xs">Fiscal Year (optional)</Label>
              <Select value={coaFYId} onValueChange={setCoaFYId}>
                <SelectTrigger data-testid="coa-fy-select">
                  <SelectValue placeholder="Select fiscal year..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No FY filter</SelectItem>
                  {fiscalYears.map(fy => (
                    <SelectItem key={fy.id} value={fy.id}>{fy.name} ({fy.start_date} to {fy.end_date})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* File Upload */}
            <div>
              <Label className="text-xs">Excel File (.xlsx)</Label>
              <div className="mt-1">
                <label className={`flex items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  coaFile ? 'border-blue-500/50 bg-blue-500/5' : 'border-border hover:border-blue-500/30 hover:bg-blue-500/5'
                }`}>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => { setCoaFile(e.target.files[0]); setCoaResult(null); }}
                    data-testid="coa-file-input"
                  />
                  {coaFile ? (
                    <div className="text-center">
                      <FileSpreadsheet className="w-8 h-8 mx-auto text-blue-400 mb-2" />
                      <p className="text-sm font-medium">{coaFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(coaFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Click to select Chart of Accounts file</p>
                      <p className="text-xs text-muted-foreground">.xlsx format</p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Import Button */}
            <Button 
              onClick={handleCoaImport} 
              disabled={!coaFile || coaImporting}
              className="w-full"
              data-testid="coa-import-btn"
            >
              {coaImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing accounts...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Import Chart of Accounts
                </>
              )}
            </Button>

            {/* Results */}
            {coaResult && (
              <div className={`p-4 rounded-lg border ${
                coaResult.error ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30'
              }`} data-testid="coa-result">
                {coaResult.error ? (
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-400">{coaResult.message}</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                      <p className="text-sm font-medium text-emerald-400">Import Successful</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <BookOpen className="w-3 h-3" />
                        <span>Accounts Created:</span>
                      </div>
                      <span className="font-mono">{coaResult.accounts_created}</span>
                      
                      <div className="flex items-center gap-1">
                        <BookOpen className="w-3 h-3" />
                        <span>Accounts Updated:</span>
                      </div>
                      <span className="font-mono">{coaResult.accounts_updated}</span>
                      
                      <div className="flex items-center gap-1">
                        <Truck className="w-3 h-3 text-orange-400" />
                        <span>Suppliers Detected:</span>
                      </div>
                      <span className="font-mono text-orange-400">{coaResult.suppliers_detected}</span>
                      
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-blue-400" />
                        <span>Customers Detected:</span>
                      </div>
                      <span className="font-mono text-blue-400">{coaResult.customers_detected}</span>
                      
                      {coaResult.error_count > 0 && (
                        <>
                          <div className="flex items-center gap-1 text-amber-400">
                            <AlertCircle className="w-3 h-3" />
                            <span>Errors:</span>
                          </div>
                          <span className="font-mono text-amber-400">{coaResult.error_count}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Voucher Import Card */}
        <Card className="border-emerald-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base lg:text-lg" style={{ fontFamily: 'Manrope, sans-serif' }}>
              <Receipt className="w-5 h-5 text-emerald-400" />
              Import Voucher History
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Import general voucher transactions from Excel. Rows are grouped by transaction ID (TRAN) to form complete vouchers. Auto-posted with new sequence numbers.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Info Banner */}
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Expected columns:</strong></p>
                  <p>TRAN, Account Code, DATE, Debit/Credit (LBP & USD), Description, Currency (1=LBP, 2=USD)</p>
                  <p className="text-amber-400">Rate: 1 USD = 1,507.5 LBP</p>
                </div>
              </div>
            </div>

            {/* FY Selector */}
            <div>
              <Label className="text-xs">Fiscal Year (optional)</Label>
              <Select value={voucherFYId} onValueChange={setVoucherFYId}>
                <SelectTrigger data-testid="voucher-fy-select">
                  <SelectValue placeholder="Select fiscal year..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No FY filter</SelectItem>
                  {fiscalYears.map(fy => (
                    <SelectItem key={fy.id} value={fy.id}>{fy.name} ({fy.start_date} to {fy.end_date})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* File Upload */}
            <div>
              <Label className="text-xs">Excel File (.xlsx)</Label>
              <div className="mt-1">
                <label className={`flex items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  voucherFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border hover:border-emerald-500/30 hover:bg-emerald-500/5'
                }`}>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => { setVoucherFile(e.target.files[0]); setVoucherResult(null); }}
                    data-testid="voucher-file-input"
                  />
                  {voucherFile ? (
                    <div className="text-center">
                      <FileSpreadsheet className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
                      <p className="text-sm font-medium">{voucherFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(voucherFile.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Click to select Voucher History file</p>
                      <p className="text-xs text-muted-foreground">.xlsx format (large files supported)</p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Import Button */}
            <Button 
              onClick={handleVoucherImport} 
              disabled={!voucherFile || voucherImporting}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              data-testid="voucher-import-btn"
            >
              {voucherImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing vouchers... (this may take a few minutes)
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Import Voucher History
                </>
              )}
            </Button>

            {/* Results */}
            {voucherResult && (
              <div className={`p-4 rounded-lg border ${
                voucherResult.error ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30'
              }`} data-testid="voucher-result">
                {voucherResult.error ? (
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-400">{voucherResult.message}</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                      <p className="text-sm font-medium text-emerald-400">Import Successful</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Receipt className="w-3 h-3" />
                        <span>Vouchers Created:</span>
                      </div>
                      <span className="font-mono">{voucherResult.vouchers_created?.toLocaleString()}</span>
                      
                      <span>Lines Processed:</span>
                      <span className="font-mono">{voucherResult.lines_processed?.toLocaleString()}</span>
                      
                      <span>Account Balances Updated:</span>
                      <span className="font-mono">{voucherResult.accounts_balance_updated}</span>
                      
                      <span>Total Excel Rows:</span>
                      <span className="font-mono">{voucherResult.total_rows?.toLocaleString()}</span>
                      
                      {voucherResult.vouchers_failed > 0 && (
                        <>
                          <span className="text-amber-400">Failed:</span>
                          <span className="font-mono text-amber-400">{voucherResult.vouchers_failed}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ImportDataPage;
