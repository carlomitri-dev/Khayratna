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
  Info,
  Package,
  FolderOpen,
  MapPin
} from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Reusable Import Card Component
const ImportCard = ({ title, icon: Icon, color, description, infoText, onImport, importing, result, children }) => (
  <Card className={`border-${color}-500/20`}>
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-sm lg:text-base" style={{ fontFamily: 'Manrope, sans-serif' }}>
        <Icon className={`w-5 h-5 text-${color}-500`} />
        {title}
      </CardTitle>
      <p className="text-xs text-muted-foreground">{description}</p>
    </CardHeader>
    <CardContent className="space-y-3">
      {infoText && (
        <div className={`p-2 bg-${color}-500/10 border border-${color}-500/20 rounded-lg`}>
          <div className="flex items-start gap-2">
            <Info className={`w-3 h-3 text-${color}-500 mt-0.5 flex-shrink-0`} />
            <p className="text-xs text-muted-foreground">{infoText}</p>
          </div>
        </div>
      )}
      {children}
      {result && (
        <div className={`p-3 rounded-lg border text-xs ${
          result.error ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
        }`}>
          {result.error ? (
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-red-600">{result.message}</p>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <div className="text-muted-foreground">
                {Object.entries(result).filter(([k]) => k !== 'message' && k !== 'errors' && k !== 'error_count').map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <span>{k.replace(/_/g, ' ')}:</span>
                    <span className="font-mono font-medium">{typeof v === 'number' ? v.toLocaleString() : String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </CardContent>
  </Card>
);

// File Upload component
const FileUploader = ({ file, setFile, color, accept = ".xlsx,.xls", onClear }) => (
  <label className={`flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
    file ? `border-${color}-500/50 bg-${color}-50/50` : `border-gray-300 hover:border-${color}-400 hover:bg-${color}-50/30`
  }`}>
    <input type="file" accept={accept} className="hidden" onChange={(e) => { setFile(e.target.files[0]); if(onClear) onClear(); }} />
    {file ? (
      <div className="text-center">
        <FileSpreadsheet className={`w-6 h-6 mx-auto text-${color}-500 mb-1`} />
        <p className="text-xs font-medium truncate max-w-[200px]">{file.name}</p>
        <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
      </div>
    ) : (
      <div className="text-center">
        <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
        <p className="text-xs text-muted-foreground">Click to select file (.xlsx)</p>
      </div>
    )}
  </label>
);

const ImportDataPage = () => {
  const { currentOrg } = useAuth();
  const { fiscalYears, selectedFY } = useFiscalYear();
  
  // State for each import type
  const [coaFile, setCoaFile] = useState(null);
  const [coaResult, setCoaResult] = useState(null);
  const [coaImporting, setCoaImporting] = useState(false);
  
  const [voucherFile, setVoucherFile] = useState(null);
  const [voucherResult, setVoucherResult] = useState(null);
  const [voucherImporting, setVoucherImporting] = useState(false);
  const [voucherFYId, setVoucherFYId] = useState(selectedFY?.id || '');
  
  const [catFile, setCatFile] = useState(null);
  const [catResult, setCatResult] = useState(null);
  const [catImporting, setCatImporting] = useState(false);
  
  const [regionFile, setRegionFile] = useState(null);
  const [regionResult, setRegionResult] = useState(null);
  const [regionImporting, setRegionImporting] = useState(false);
  
  const [itemsFile, setItemsFile] = useState(null);
  const [itemsResult, setItemsResult] = useState(null);
  const [itemsImporting, setItemsImporting] = useState(false);

  const doImport = async (endpoint, file, setImporting, setResult, extraData = {}) => {
    if (!file || !currentOrg) return;
    setImporting(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('organization_id', currentOrg.id);
      Object.entries(extraData).forEach(([k, v]) => { if(v) formData.append(k, v); });
      
      const response = await axios.post(`${API}${endpoint}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000
      });
      setResult(response.data);
    } catch (err) {
      setResult({ error: true, message: err.response?.data?.detail || 'Import failed' });
    } finally {
      setImporting(false);
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
          Import data from Excel files for <strong>{currentOrg?.name}</strong>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Import order: 1) Categories &amp; Regions → 2) Chart of Accounts → 3) Inventory Items → 4) Vouchers
        </p>
      </div>

      {/* Row 1: Reference Data */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Step 1 — Reference Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Categories */}
          <ImportCard
            title="Categories"
            icon={FolderOpen}
            color="purple"
            description="Import product categories (CAT_ID, NAME)"
            infoText="25 categories: حبوب, كبيس, بهارات, زيوت, etc."
            result={catResult}
          >
            <FileUploader file={catFile} setFile={setCatFile} color="purple" onClear={() => setCatResult(null)} />
            <Button onClick={() => doImport('/import/categories', catFile, setCatImporting, setCatResult)} 
              disabled={!catFile || catImporting} className="w-full" size="sm">
              {catImporting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Importing...</> : <><Upload className="w-3 h-3 mr-1" />Import Categories</>}
            </Button>
          </ImportCard>

          {/* Regions */}
          <ImportCard
            title="Regions"
            icon={MapPin}
            color="teal"
            description="Import customer regions (REG_ID, NAME)"
            infoText="16 regions: الكورة, زغرتا, البترون, عكار, etc."
            result={regionResult}
          >
            <FileUploader file={regionFile} setFile={setRegionFile} color="teal" onClear={() => setRegionResult(null)} />
            <Button onClick={() => doImport('/import/regions', regionFile, setRegionImporting, setRegionResult)} 
              disabled={!regionFile || regionImporting} className="w-full" size="sm">
              {regionImporting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Importing...</> : <><Upload className="w-3 h-3 mr-1" />Import Regions</>}
            </Button>
          </ImportCard>
        </div>
      </div>

      {/* Row 2: Chart of Accounts */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Step 2 — Chart of Accounts</h2>
        <div className="grid grid-cols-1 gap-4">
          <ImportCard
            title="Chart of Accounts"
            icon={BookOpen}
            color="blue"
            description="Import accounts with suppliers (40*), customers (41* with region), and all LCOA classes"
            infoText="Auto-detects: Suppliers (code 40*), Customers (code 41* + REG_ID region link), all account classes 1-7"
            result={coaResult}
          >
            <FileUploader file={coaFile} setFile={setCoaFile} color="blue" onClear={() => setCoaResult(null)} />
            <Button onClick={() => doImport('/import/chart-of-accounts', coaFile, setCoaImporting, setCoaResult)} 
              disabled={!coaFile || coaImporting} className="w-full" size="sm">
              {coaImporting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Importing accounts...</> : <><Upload className="w-3 h-3 mr-1" />Import Chart of Accounts</>}
            </Button>
          </ImportCard>
        </div>
      </div>

      {/* Row 3: Inventory */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Step 3 — Inventory Items</h2>
        <div className="grid grid-cols-1 gap-4">
          <ImportCard
            title="Inventory Items"
            icon={Package}
            color="amber"
            description="Import items with code, name, category, supplier link, price, cost, and pack info"
            infoText="Links to: Category (CAT_ID), Supplier (SUP_ID = account code like 40110001). No barcode, no qty on hand."
            result={itemsResult}
          >
            <FileUploader file={itemsFile} setFile={setItemsFile} color="amber" onClear={() => setItemsResult(null)} />
            <Button onClick={() => doImport('/import/inventory', itemsFile, setItemsImporting, setItemsResult)} 
              disabled={!itemsFile || itemsImporting} className="w-full bg-amber-600 hover:bg-amber-700" size="sm">
              {itemsImporting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Importing items...</> : <><Upload className="w-3 h-3 mr-1" />Import Inventory Items</>}
            </Button>
          </ImportCard>
        </div>
      </div>

      {/* Row 4: Vouchers */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Step 4 — Voucher History</h2>
        <div className="grid grid-cols-1 gap-4">
          <ImportCard
            title="Voucher History"
            icon={Receipt}
            color="emerald"
            description="Import journal vouchers grouped by TRAN ID, auto-posted with new sequence. Rate: 1 USD = 1,507.5 LBP"
            infoText="Select a Fiscal Year to only import vouchers within that period. Vouchers outside the FY date range will be skipped."
            result={voucherResult}
          >
            <div>
              <Label className="text-xs font-medium">Fiscal Year (required — skips vouchers outside this period)</Label>
              <Select value={voucherFYId} onValueChange={setVoucherFYId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select fiscal year..." />
                </SelectTrigger>
                <SelectContent>
                  {fiscalYears.map(fy => (
                    <SelectItem key={fy.id} value={fy.id}>{fy.name} ({fy.start_date} to {fy.end_date})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FileUploader file={voucherFile} setFile={setVoucherFile} color="emerald" onClear={() => setVoucherResult(null)} />
            <Button onClick={() => doImport('/import/vouchers', voucherFile, setVoucherImporting, setVoucherResult, { fiscal_year_id: voucherFYId })} 
              disabled={!voucherFile || voucherImporting || !voucherFYId} className="w-full bg-emerald-600 hover:bg-emerald-700" size="sm">
              {voucherImporting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Importing vouchers (may take minutes)...</> : <><Upload className="w-3 h-3 mr-1" />Import Voucher History</>}
            </Button>
          </ImportCard>
        </div>
      </div>
    </div>
  );
};

export default ImportDataPage;
