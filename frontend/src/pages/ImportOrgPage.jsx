import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { FolderInput, Calendar, Loader2, CheckCircle, AlertTriangle, Eye, Play } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ImportOrgPage = () => {
  const { token, currentOrg, organizations } = useAuth();

  const [tables, setTables] = useState([]);
  const [selectedTables, setSelectedTables] = useState({});
  const [sourceOrgId, setSourceOrgId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  // Fetch table list
  useEffect(() => {
    const fetchTables = async () => {
      try {
        const res = await axios.get(`${API}/import-org/tables`, { headers });
        setTables(res.data);
        const initial = {};
        res.data.forEach(t => { initial[t.key] = false; });
        setSelectedTables(initial);
      } catch (err) {
        toast.error('Failed to load table list');
      }
    };
    fetchTables();
  }, []);

  const sourceOrgs = organizations.filter(o => o.id !== currentOrg?.id);

  const toggleTable = (key) => {
    setSelectedTables(prev => ({ ...prev, [key]: !prev[key] }));
    setPreviewData(null);
    setImportResult(null);
  };

  const selectAll = () => {
    const all = {};
    tables.forEach(t => { all[t.key] = true; });
    setSelectedTables(all);
    setPreviewData(null);
    setImportResult(null);
  };

  const deselectAll = () => {
    const none = {};
    tables.forEach(t => { none[t.key] = false; });
    setSelectedTables(none);
    setPreviewData(null);
    setImportResult(null);
  };

  const getSelectedKeys = useCallback(() => {
    return Object.entries(selectedTables).filter(([, v]) => v).map(([k]) => k);
  }, [selectedTables]);

  const handlePreview = async () => {
    const selected = getSelectedKeys();
    if (!sourceOrgId) return toast.error('Select a source organization');
    if (selected.length === 0) return toast.error('Select at least one table');

    setPreviewLoading(true);
    setPreviewData(null);
    setImportResult(null);
    try {
      const res = await axios.post(`${API}/import-org/preview`, {
        source_org_id: sourceOrgId,
        target_org_id: currentOrg.id,
        tables: selected,
        from_date: fromDate || null,
        to_date: toDate || null,
      }, { headers });
      setPreviewData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleImport = async () => {
    const selected = getSelectedKeys();
    if (!sourceOrgId) return toast.error('Select a source organization');
    if (selected.length === 0) return toast.error('Select at least one table');

    setImportLoading(true);
    setImportResult(null);
    try {
      const res = await axios.post(`${API}/import-org/execute`, {
        source_org_id: sourceOrgId,
        target_org_id: currentOrg.id,
        tables: selected,
        from_date: fromDate || null,
        to_date: toDate || null,
      }, { headers });
      setImportResult(res.data);
      toast.success('Import completed successfully');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed');
    } finally {
      setImportLoading(false);
    }
  };

  const totalPreview = previewData ? Object.values(previewData.counts).reduce((a, b) => a + b, 0) : 0;

  const tableLabelMap = {};
  tables.forEach(t => { tableLabelMap[t.key] = t.label; });

  return (
    <div className="space-y-4 p-4 lg:p-6" data-testid="import-org-page">
      <div className="flex items-center gap-3">
        <FolderInput className="w-6 h-6" />
        <h1 className="text-xl lg:text-2xl font-bold">Import from Organization</h1>
      </div>

      {/* Config Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Source Org + Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Source Organization</label>
              <Select value={sourceOrgId} onValueChange={(v) => { setSourceOrgId(v); setPreviewData(null); setImportResult(null); }}>
                <SelectTrigger data-testid="source-org-select">
                  <SelectValue placeholder="Select source org..." />
                </SelectTrigger>
                <SelectContent>
                  {sourceOrgs.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" /> From Date
              </label>
              <Input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPreviewData(null); }}
                className="h-9" data-testid="import-from-date" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" /> To Date
              </label>
              <Input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPreviewData(null); }}
                className="h-9" data-testid="import-to-date" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Target: <strong>{currentOrg?.name || '—'}</strong> &nbsp;|&nbsp; Date filter applies only to date-based tables (marked with *)
          </p>
        </CardContent>
      </Card>

      {/* Tables Selection */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Select Tables to Import</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={selectAll} data-testid="select-all-btn">Select All</Button>
              <Button size="sm" variant="ghost" onClick={deselectAll} data-testid="deselect-all-btn">Deselect All</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {tables.map(t => (
              <label key={t.key}
                className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors
                  ${selectedTables[t.key] ? 'bg-primary/5 border-primary/30' : 'border-border hover:bg-muted/30'}`}
                data-testid={`table-${t.key}`}
              >
                <Checkbox
                  checked={selectedTables[t.key] || false}
                  onCheckedChange={() => toggleTable(t.key)}
                />
                <span className="text-sm">{t.label}{t.has_date ? ' *' : ''}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={handlePreview} disabled={previewLoading || !sourceOrgId || getSelectedKeys().length === 0}
          variant="outline" data-testid="preview-btn">
          {previewLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />}
          Preview
        </Button>
        <Button onClick={handleImport} disabled={importLoading || !sourceOrgId || getSelectedKeys().length === 0}
          data-testid="execute-import-btn">
          {importLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
          Execute Import
        </Button>
      </div>

      {/* Preview Results */}
      {previewData && (
        <Card data-testid="preview-results">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="w-4 h-4" /> Preview: {previewData.source_org} &rarr; {currentOrg?.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {Object.entries(previewData.counts).map(([key, count]) => (
                <div key={key} className="flex items-center justify-between p-2 rounded border text-sm">
                  <span>{tableLabelMap[key] || key}</span>
                  <span className={`font-mono font-bold ${count > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{count}</span>
                </div>
              ))}
            </div>
            <p className="text-sm mt-3 font-medium">Total records: {totalPreview}</p>
          </CardContent>
        </Card>
      )}

      {/* Import Results */}
      {importResult && (
        <Card data-testid="import-results" className="border-green-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-green-500">
              <CheckCircle className="w-4 h-4" /> Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{importResult.source_org} &rarr; {importResult.target_org}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {Object.entries(importResult.results).map(([key, res]) => (
                <div key={key} className="p-2 rounded border text-sm">
                  <div className="font-medium">{tableLabelMap[key] || key}</div>
                  <div className="flex gap-3 text-xs mt-1">
                    <span className="text-green-500">Imported: {res.imported}</span>
                    {res.skipped > 0 && <span className="text-amber-500">Skipped: {res.skipped}</span>}
                  </div>
                </div>
              ))}
            </div>
            {importResult.auto_created_accounts?.length > 0 && (
              <div className="mt-2 p-2 rounded border border-amber-500/30 bg-amber-500/5">
                <div className="flex items-center gap-1 text-sm font-medium text-amber-500">
                  <AlertTriangle className="w-4 h-4" /> Auto-created {importResult.auto_created_accounts.length} missing accounts
                </div>
                <p className="text-xs mt-1 text-muted-foreground">
                  Codes: {importResult.auto_created_accounts.join(', ')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ImportOrgPage;
