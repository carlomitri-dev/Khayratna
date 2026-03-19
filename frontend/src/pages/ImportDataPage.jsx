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
  Upload, FileSpreadsheet, CheckCircle, AlertCircle,
  BookOpen, Receipt, Loader2, Info, Package, FolderOpen, MapPin, Columns
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '../components/ui/dialog';
import axios from 'axios';
import FieldMapper from '../components/shared/FieldMapper';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// System field definitions per import type
const COA_FIELDS = [
  { key: 'account_code', label: 'Account Code', required: true, defaultCol: 0, keywords: ['كود الحساب', 'code', 'كود'] },
  { key: 'account_name', label: 'Account Name', required: true, defaultCol: 2, keywords: ['اسم الحساب', 'name', 'اسم'] },
  { key: 'account_type', label: 'Type', required: false, defaultCol: 3, keywords: ['النوع', 'type'] },
  { key: 'contact_name', label: 'Contact Name', required: false, defaultCol: 13, keywords: ['NAME', 'contact'] },
  { key: 'address', label: 'Address', required: false, defaultCol: 14, keywords: ['ADDRESS', 'عنوان'] },
  { key: 'phone', label: 'Phone', required: false, defaultCol: 15, keywords: ['PHONE', 'تلفون', 'هاتف'] },
  { key: 'reg_id', label: 'Region ID', required: false, defaultCol: 18, keywords: ['REG_ID', 'region'] },
  { key: 'regno', label: 'Registration No', required: false, defaultCol: 27, keywords: ['REGNO', 'registration', 'ض.ق.م'] },
];

const VOUCHER_FIELDS = [
  { key: 'tran', label: 'Transaction ID', required: true, defaultCol: 0, keywords: ['TRAN', 'transaction'] },
  { key: 'account_code', label: 'Account Code', required: true, defaultCol: 3, keywords: ['كود', 'code', 'account'] },
  { key: 'date', label: 'Date', required: true, defaultCol: 5, keywords: ['DATE', 'تاريخ'] },
  { key: 'cr_lbp', label: 'Credit LBP', required: true, defaultCol: 8, keywords: ['TOTCL', 'credit.*lbp'] },
  { key: 'dr_lbp', label: 'Debit LBP', required: true, defaultCol: 10, keywords: ['TOTDL', 'debit.*lbp'] },
  { key: 'cr_usd', label: 'Credit USD', required: false, defaultCol: 11, keywords: ['TOTCU', 'credit.*usd'] },
  { key: 'dr_usd', label: 'Debit USD', required: false, defaultCol: 12, keywords: ['TOTDU', 'debit.*usd'] },
  { key: 'description', label: 'Description', required: false, defaultCol: 14, keywords: ['الوصف', 'desc'] },
  { key: 'currency', label: 'Currency (1=LBP,2=USD)', required: false, defaultCol: 17, keywords: ['CUR', 'currency'] },
];

const INVENTORY_FIELDS = [
  { key: 'item_code', label: 'Item Code', required: true, defaultCol: 0, keywords: ['كود', 'code', 'item'] },
  { key: 'name', label: 'Item Name (Arabic)', required: true, defaultCol: 2, keywords: ['ADESC', 'اسم', 'name', 'arabic'] },
  { key: 'description', label: 'Description', required: false, defaultCol: 1, keywords: ['الوصف', 'desc'] },
  { key: 'category_id', label: 'Category ID', required: false, defaultCol: 3, keywords: ['CAT_ID', 'category'] },
  { key: 'supplier_id', label: 'Supplier Code', required: false, defaultCol: 4, keywords: ['SUP_ID', 'supplier'] },
  { key: 'package', label: 'Package (numeric)', required: false, defaultCol: 5, keywords: ['PAK', 'package', 'pack'] },
  { key: 'pack_desc', label: 'Pack Description', required: false, defaultCol: 6, keywords: ['PACK'] },
  { key: 'price', label: 'Selling Price', required: false, defaultCol: 7, keywords: ['PRICE', 'سعر', 'sell'] },
  { key: 'cost', label: 'Cost Price', required: false, defaultCol: 8, keywords: ['COST', 'تكلفة'] },
  { key: 'tva', label: 'TVA (11=Taxed)', required: false, defaultCol: 22, keywords: ['TVA', 'tax', 'ضريبة'] },
];

// Result Display
const ResultDisplay = ({ result }) => {
  if (!result) return null;
  return (
    <div className={`p-3 rounded-lg border text-xs ${result.error ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
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
  );
};

// File Upload
const FileUploader = ({ file, setFile, color, onClear }) => (
  <label className={`flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
    file ? 'border-blue-400 bg-blue-50/50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'
  }`}>
    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { setFile(e.target.files[0]); if(onClear) onClear(); }} />
    {file ? (
      <div className="text-center">
        <FileSpreadsheet className="w-6 h-6 mx-auto text-blue-500 mb-1" />
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
  
  // Import states
  const [coaFile, setCoaFile] = useState(null);
  const [coaResult, setCoaResult] = useState(null);
  const [coaImporting, setCoaImporting] = useState(false);
  
  const [voucherFile, setVoucherFile] = useState(null);
  const [voucherResult, setVoucherResult] = useState(null);
  const [voucherImporting, setVoucherImporting] = useState(false);
  const [voucherFYId, setVoucherFYId] = useState(selectedFY?.id || '');
  const [voucherProgress, setVoucherProgress] = useState(0);
  const [voucherStatusMsg, setVoucherStatusMsg] = useState('');
  
  const [catFile, setCatFile] = useState(null);
  const [catResult, setCatResult] = useState(null);
  const [catImporting, setCatImporting] = useState(false);
  
  const [regionFile, setRegionFile] = useState(null);
  const [regionResult, setRegionResult] = useState(null);
  const [regionImporting, setRegionImporting] = useState(false);
  
  const [itemsFile, setItemsFile] = useState(null);
  const [itemsResult, setItemsResult] = useState(null);
  const [itemsImporting, setItemsImporting] = useState(false);

  // Field mapping state
  const [mapperOpen, setMapperOpen] = useState(false);
  const [mapperType, setMapperType] = useState(null); // 'coa', 'voucher', 'inventory'
  const [mapperHeaders, setMapperHeaders] = useState([]);
  const [mapperSamples, setMapperSamples] = useState([]);
  const [mapperFile, setMapperFile] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Background voucher import with progress polling
  const doVoucherImport = async (file, extraMapping = null) => {
    if (!file || !currentOrg) return;
    setVoucherImporting(true);
    setVoucherResult(null);
    setVoucherProgress(0);
    setVoucherStatusMsg('Uploading file...');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('organization_id', currentOrg.id);
      if (voucherFYId) formData.append('fiscal_year_id', voucherFYId);
      if (extraMapping) formData.append('field_mapping', extraMapping);
      
      const response = await axios.post(`${API}/import/vouchers`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000
      });
      
      const { job_id } = response.data;
      if (!job_id) {
        setVoucherResult(response.data);
        setVoucherImporting(false);
        return;
      }
      
      // Poll for progress
      setVoucherStatusMsg('Processing...');
      const pollInterval = setInterval(async () => {
        try {
          const status = await axios.get(`${API}/import/vouchers/status/${job_id}`);
          const data = status.data;
          setVoucherProgress(data.progress || 0);
          setVoucherStatusMsg(data.message || 'Processing...');
          
          if (data.status === 'completed' || data.status === 'failed') {
            clearInterval(pollInterval);
            setVoucherResult(data);
            setVoucherImporting(false);
          }
        } catch (pollErr) {
          // Keep polling even if one request fails
        }
      }, 2000);
      
    } catch (err) {
      setVoucherResult({ error: true, message: err.response?.data?.detail || 'Import failed: ' + err.message });
      setVoucherImporting(false);
    }
  };

  // Simple import (no mapping needed)
  const doSimpleImport = async (endpoint, file, setImporting, setResult, extraData = {}) => {
    if (!file || !currentOrg) return;
    setImporting(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('organization_id', currentOrg.id);
      Object.entries(extraData).forEach(([k, v]) => { if(v) formData.append(k, v); });
      const response = await axios.post(`${API}${endpoint}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 600000
      });
      setResult(response.data);
    } catch (err) {
      setResult({ error: true, message: err.response?.data?.detail || 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  // Start field mapping flow: preview headers then show mapper
  const startMapping = async (type, file) => {
    if (!file) return;
    setPreviewLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post(`${API}/import/preview-headers`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMapperHeaders(response.data.headers);
      setMapperSamples(response.data.sample_rows);
      setMapperType(type);
      setMapperFile(file);
      setMapperOpen(true);
    } catch (err) {
      alert('Failed to read file headers: ' + (err.response?.data?.detail || err.message));
    } finally {
      setPreviewLoading(false);
    }
  };

  // Execute import with mapping
  const doMappedImport = async (mapping) => {
    setMapperOpen(false);
    const mappingJson = JSON.stringify(mapping);
    
    if (mapperType === 'coa') {
      setCoaImporting(true);
      setCoaResult(null);
      try {
        const formData = new FormData();
        formData.append('file', mapperFile);
        formData.append('organization_id', currentOrg.id);
        formData.append('field_mapping', mappingJson);
        const r = await axios.post(`${API}/import/chart-of-accounts`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000
        });
        setCoaResult(r.data);
      } catch (err) {
        setCoaResult({ error: true, message: err.response?.data?.detail || 'Import failed' });
      } finally {
        setCoaImporting(false);
      }
    } else if (mapperType === 'voucher') {
      doVoucherImport(mapperFile, mappingJson);
    } else if (mapperType === 'inventory') {
      setItemsImporting(true);
      setItemsResult(null);
      try {
        const formData = new FormData();
        formData.append('file', mapperFile);
        formData.append('organization_id', currentOrg.id);
        formData.append('field_mapping', mappingJson);
        const r = await axios.post(`${API}/import/inventory`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000
        });
        setItemsResult(r.data);
      } catch (err) {
        setItemsResult({ error: true, message: err.response?.data?.detail || 'Import failed' });
      } finally {
        setItemsImporting(false);
      }
    }
  };

  const getSystemFields = () => {
    if (mapperType === 'coa') return COA_FIELDS;
    if (mapperType === 'voucher') return VOUCHER_FIELDS;
    if (mapperType === 'inventory') return INVENTORY_FIELDS;
    return [];
  };

  if (!currentOrg) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Please select an organization</p></div>;
  }

  return (
    <div className="space-y-6" data-testid="import-data-page">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>Import Data</h1>
        <p className="text-muted-foreground text-xs lg:text-sm mt-1">
          Import from Excel for <strong>{currentOrg?.name}</strong> — Use "Match Fields" to map custom column layouts.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Order: 1) Categories &amp; Regions → 2) Chart of Accounts → 3) Inventory → 4) Vouchers
        </p>
      </div>

      {/* Step 1 */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Step 1 — Reference Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm"><FolderOpen className="w-4 h-4 text-purple-500" />Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <FileUploader file={catFile} setFile={setCatFile} onClear={() => setCatResult(null)} />
              <Button onClick={() => doSimpleImport('/import/categories', catFile, setCatImporting, setCatResult)} disabled={!catFile || catImporting} className="w-full" size="sm">
                {catImporting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}{catImporting ? 'Importing...' : 'Import Categories'}
              </Button>
              <ResultDisplay result={catResult} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm"><MapPin className="w-4 h-4 text-teal-500" />Regions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <FileUploader file={regionFile} setFile={setRegionFile} onClear={() => setRegionResult(null)} />
              <Button onClick={() => doSimpleImport('/import/regions', regionFile, setRegionImporting, setRegionResult)} disabled={!regionFile || regionImporting} className="w-full" size="sm">
                {regionImporting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}{regionImporting ? 'Importing...' : 'Import Regions'}
              </Button>
              <ResultDisplay result={regionResult} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Step 2 */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Step 2 — Chart of Accounts</h2>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm"><BookOpen className="w-4 h-4 text-blue-500" />Chart of Accounts</CardTitle>
            <p className="text-xs text-muted-foreground">Auto-detects suppliers (40*), customers (41* + region), registration numbers</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <FileUploader file={coaFile} setFile={setCoaFile} onClear={() => setCoaResult(null)} />
            <div className="flex gap-2">
              <Button onClick={() => doSimpleImport('/import/chart-of-accounts', coaFile, setCoaImporting, setCoaResult)} disabled={!coaFile || coaImporting} className="flex-1" size="sm">
                {coaImporting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}{coaImporting ? 'Importing...' : 'Quick Import (Default Mapping)'}
              </Button>
              <Button variant="outline" onClick={() => startMapping('coa', coaFile)} disabled={!coaFile || coaImporting || previewLoading} size="sm">
                <Columns className="w-3 h-3 mr-1" />Match Fields
              </Button>
            </div>
            <ResultDisplay result={coaResult} />
          </CardContent>
        </Card>
      </div>

      {/* Step 3 */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Step 3 — Inventory Items</h2>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm"><Package className="w-4 h-4 text-amber-500" />Inventory Items</CardTitle>
            <p className="text-xs text-muted-foreground">Links to category (CAT_ID) and supplier (SUP_ID). No barcode, no qty on hand.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <FileUploader file={itemsFile} setFile={setItemsFile} onClear={() => setItemsResult(null)} />
            <div className="flex gap-2">
              <Button onClick={() => doSimpleImport('/import/inventory', itemsFile, setItemsImporting, setItemsResult)} disabled={!itemsFile || itemsImporting} className="flex-1 bg-amber-600 hover:bg-amber-700" size="sm">
                {itemsImporting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}{itemsImporting ? 'Importing...' : 'Quick Import (Default Mapping)'}
              </Button>
              <Button variant="outline" onClick={() => startMapping('inventory', itemsFile)} disabled={!itemsFile || itemsImporting || previewLoading} size="sm">
                <Columns className="w-3 h-3 mr-1" />Match Fields
              </Button>
            </div>
            <ResultDisplay result={itemsResult} />
          </CardContent>
        </Card>
      </div>

      {/* Step 4 */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Step 4 — Voucher History</h2>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm"><Receipt className="w-4 h-4 text-emerald-500" />Voucher History</CardTitle>
            <p className="text-xs text-muted-foreground">Auto-posted. Skips vouchers outside selected FY. Rate: 89,500 LBP (2023+) / 1,507.5 LBP (before 2023)</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs font-medium">Fiscal Year (required — skips outside FY)</Label>
              <Select value={voucherFYId} onValueChange={setVoucherFYId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select fiscal year..." /></SelectTrigger>
                <SelectContent>
                  {fiscalYears.map(fy => (
                    <SelectItem key={fy.id} value={fy.id}>{fy.name} ({fy.start_date} to {fy.end_date})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FileUploader file={voucherFile} setFile={setVoucherFile} onClear={() => setVoucherResult(null)} />
            <div className="flex gap-2">
              <Button onClick={() => doVoucherImport(voucherFile)} 
                disabled={!voucherFile || voucherImporting || !voucherFYId} className="flex-1 bg-emerald-600 hover:bg-emerald-700" size="sm">
                {voucherImporting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}{voucherImporting ? 'Importing...' : 'Quick Import (Default Mapping)'}
              </Button>
              <Button variant="outline" onClick={() => startMapping('voucher', voucherFile)} disabled={!voucherFile || voucherImporting || !voucherFYId || previewLoading} size="sm">
                <Columns className="w-3 h-3 mr-1" />Match Fields
              </Button>
            </div>
            {voucherImporting && (
              <div className="space-y-1">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-emerald-600 h-2 rounded-full transition-all duration-500" style={{ width: `${voucherProgress}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">{voucherStatusMsg} ({voucherProgress}%)</p>
              </div>
            )}
            <ResultDisplay result={voucherResult} />
          </CardContent>
        </Card>
      </div>

      {/* Field Mapping Dialog */}
      <Dialog open={mapperOpen} onOpenChange={setMapperOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Columns className="w-5 h-5 text-blue-500" />
              Field Mapping — {mapperType === 'coa' ? 'Chart of Accounts' : mapperType === 'voucher' ? 'Vouchers' : 'Inventory'}
            </DialogTitle>
            <DialogDescription>
              Match each system field to the correct Excel column. Sample data shown for reference.
            </DialogDescription>
          </DialogHeader>
          {mapperHeaders.length > 0 && (
            <FieldMapper
              headers={mapperHeaders}
              sampleRows={mapperSamples}
              systemFields={getSystemFields()}
              onConfirm={doMappedImport}
              onCancel={() => setMapperOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ImportDataPage;
