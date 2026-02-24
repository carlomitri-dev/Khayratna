import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { InvoiceTemplateEditor } from '../components/shared';
import ServiceManagement from '../components/ServiceManagement';
import { 
  Plus, 
  Users, 
  Building2, 
  Pencil, 
  Trash2, 
  Key,
  UserCheck,
  UserX,
  Shield,
  Coins,
  RefreshCw,
  Check,
  X,
  Database,
  Download,
  Upload,
  AlertTriangle,
  FileJson,
  HardDrive,
  FileText,
  Eye,
  Package,
  WifiOff,
  Hash
} from 'lucide-react';
import axios from 'axios';
import { getRoleDisplayName, formatDate } from '../lib/utils';
import { Textarea } from '../components/ui/textarea';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Document types for templates
const DOCUMENT_TYPES = [
  { value: 'sales_invoice', label: 'Sales Invoice', icon: FileText, color: 'text-blue-500' },
  { value: 'purchase_invoice', label: 'Purchase Invoice', icon: Package, color: 'text-green-500' },
  { value: 'sales_quotation', label: 'Sales Quotation', icon: FileText, color: 'text-purple-500' }
];

// Document Template Manager Component
const DocumentTemplateManager = ({ currentOrg, fetchOrganizations }) => {
  const [selectedDocType, setSelectedDocType] = useState('sales_invoice');
  
  // Default template configurations for each document type
  const DEFAULT_TEMPLATES = {
    sales_quotation: {
      page_width: 210,
      page_height: 297,
      company_name: currentOrg?.name || '',
      company_type: '',
      address: currentOrg?.address || '',
      tel_fax: currentOrg?.phone || '',
      mobile: '',
      email: currentOrg?.email || '',
      footer_text: 'Thank you for your business!',
      field_positions: [
        { field_name: 'invoice_number', x: 75, y: 5, font_size: 14, font_weight: 'bold', text_align: 'left' },
        { field_name: 'date', x: 75, y: 10, font_size: 11, font_weight: 'normal', text_align: 'left' },
        { field_name: 'due_date', x: 75, y: 14, font_size: 11, font_weight: 'normal', text_align: 'left' },
        { field_name: 'customer_name', x: 5, y: 22, font_size: 12, font_weight: 'bold', text_align: 'left' },
        { field_name: 'customer_address', x: 5, y: 27, font_size: 10, font_weight: 'normal', text_align: 'left' },
        { field_name: 'account_code', x: 5, y: 31, font_size: 10, font_weight: 'normal', text_align: 'left' },
        { field_name: 'company_name', x: 5, y: 5, font_size: 16, font_weight: 'bold', text_align: 'left' },
        { field_name: 'company_address', x: 5, y: 11, font_size: 10, font_weight: 'normal', text_align: 'left' },
        { field_name: 'registration_no', x: 5, y: 15, font_size: 10, font_weight: 'normal', text_align: 'left' },
        { field_name: 'subtotal', x: 75, y: 75, font_size: 11, font_weight: 'normal', text_align: 'right' },
        { field_name: 'total', x: 75, y: 85, font_size: 14, font_weight: 'bold', text_align: 'right' },
        { field_name: 'amount_in_words', x: 5, y: 90, font_size: 10, font_weight: 'normal', text_align: 'left' },
      ],
      line_items_config: {
        start_y: 38,
        row_height: 4,
        max_rows: 12
      },
      custom_elements: []
    },
    sales_invoice: {
      page_width: 210,
      page_height: 297,
      company_name: currentOrg?.name || '',
      field_positions: [],
      line_items_config: { start_y: 35, row_height: 3, max_rows: 10 },
      custom_elements: []
    },
    purchase_invoice: {
      page_width: 210,
      page_height: 297,
      company_name: currentOrg?.name || '',
      field_positions: [],
      line_items_config: { start_y: 35, row_height: 3, max_rows: 10 },
      custom_elements: []
    }
  };

  // Get the template for the selected document type
  const getTemplateForType = (docType) => {
    // First check document_templates (new structure)
    if (currentOrg?.document_templates?.[docType]) {
      return currentOrg.document_templates[docType];
    }
    // Fall back to legacy invoice_template for sales_invoice
    if (docType === 'sales_invoice' && currentOrg?.invoice_template) {
      return currentOrg.invoice_template;
    }
    // Return default template for the document type
    return DEFAULT_TEMPLATES[docType] || null;
  };
  
  // Save template for a specific document type
  const handleSaveTemplate = async (templateData) => {
    try {
      // Build the updated document_templates object
      const updatedTemplates = {
        ...(currentOrg?.document_templates || {}),
        [selectedDocType]: templateData
      };
      
      // For backwards compatibility, also update invoice_template when saving sales_invoice
      const updatePayload = {
        document_templates: updatedTemplates
      };
      if (selectedDocType === 'sales_invoice') {
        updatePayload.invoice_template = templateData;
      }
      
      await axios.put(`${API}/organizations/${currentOrg.id}`, updatePayload);
      await fetchOrganizations();
      alert(`${DOCUMENT_TYPES.find(d => d.value === selectedDocType)?.label} template saved successfully!`);
    } catch (error) {
      console.error('Failed to save template:', error);
      alert(error.response?.data?.detail || 'Failed to save template');
      throw error;
    }
  };
  
  const currentTemplate = getTemplateForType(selectedDocType);
  const selectedDocInfo = DOCUMENT_TYPES.find(d => d.value === selectedDocType);
  
  // Check if this is a saved template or default
  const isSavedTemplate = currentOrg?.document_templates?.[selectedDocType] || 
    (selectedDocType === 'sales_invoice' && currentOrg?.invoice_template);
  
  return (
    <div className="space-y-4">
      {/* Document Type Selector */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <Label className="text-sm font-medium mb-2 block">Select Document Type</Label>
              <div className="flex flex-wrap gap-2">
                {DOCUMENT_TYPES.map(docType => {
                  const Icon = docType.icon;
                  const isSelected = selectedDocType === docType.value;
                  const hasTemplate = getTemplateForType(docType.value) !== null;
                  
                  return (
                    <Button
                      key={docType.value}
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedDocType(docType.value)}
                      className={`flex items-center gap-2 ${isSelected ? '' : docType.color}`}
                    >
                      <Icon className="w-4 h-4" />
                      {docType.label}
                      {hasTemplate && (
                        <Check className="w-3 h-3 text-green-400" />
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {isSavedTemplate ? (
                <span className="flex items-center gap-1 text-green-500">
                  <Check className="w-4 h-4" /> Template configured
                </span>
              ) : currentTemplate ? (
                <span className="flex items-center gap-1 text-blue-500">
                  <FileText className="w-4 h-4" /> Using default template
                </span>
              ) : (
                <span className="flex items-center gap-1 text-yellow-500">
                  <AlertTriangle className="w-4 h-4" /> No template
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Info Banner */}
      <div className="bg-muted/30 border rounded-lg p-3">
        <p className="text-sm text-muted-foreground">
          <strong className={selectedDocInfo?.color}>{selectedDocInfo?.label}</strong> template. 
          Each document type can have its own unique layout. Changes here only affect {selectedDocInfo?.label.toLowerCase()} printing.
        </p>
      </div>
      
      {/* Template Editor */}
      <InvoiceTemplateEditor
        key={selectedDocType} // Force re-render when type changes
        template={currentTemplate}
        organizationId={currentOrg?.id}
        organizationName={currentOrg?.name}
        onSave={handleSaveTemplate}
      />
    </div>
  );
};

const SettingsPage = () => {
  const { user, organizations, currentOrg, fetchOrganizations } = useAuth();
  const [users, setUsers] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrgFilter, setSelectedOrgFilter] = useState('all');
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isOrgDialogOpen, setIsOrgDialogOpen] = useState(false);
  const [isCurrencyDialogOpen, setIsCurrencyDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingOrg, setEditingOrg] = useState(null);
  const [editingCurrency, setEditingCurrency] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteOrgConfirm, setDeleteOrgConfirm] = useState(null);
  const [deleteOrgForce, setDeleteOrgForce] = useState(false);
  const [deleteOrgError, setDeleteOrgError] = useState(null);
  const [deleteCurrencyConfirm, setDeleteCurrencyConfirm] = useState(null);
  const [resetPasswordUser, setResetPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [seedingCurrencies, setSeedingCurrencies] = useState(false);
  
  // Backup & Restore state
  const [backupInfo, setBackupInfo] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreMode, setRestoreMode] = useState('merge');
  const [restoreResult, setRestoreResult] = useState(null);
  const restoreFileRef = useRef(null);

  // Invoice Template state
  const [invoiceTemplate, setInvoiceTemplate] = useState({
    company_name: '',
    company_type: 'S.A.R.L.',
    tel_fax: '',
    mobile: '',
    email: '',
    address: '',
    logo_url: '',
    footer_text: 'Thank you for your business!',
    show_tax_column: true,
    show_discount_column: true
  });
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templatePreview, setTemplatePreview] = useState(false);

  // Document Series state
  const [invoiceSeries, setInvoiceSeries] = useState({
    sales_invoice: { prefix: 'INV-', next_number: '', include_year: true },
    purchase_invoice: { prefix: 'PUR-', next_number: '', include_year: true },
    pos: { prefix: 'POS-', next_number: '', include_year: true },
    dbcr: { prefix: 'DBCR-', next_number: '', include_year: true },
    quotation: { prefix: 'QUO-', next_number: '', include_year: true }
  });
  const [seriesSaving, setSeriesSaving] = useState(false);

  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    name: '',
    role: 'viewer',
    organization_id: ''
  });

  const [newOrg, setNewOrg] = useState({
    name: '',
    currency: 'LBP',
    base_exchange_rate: 89500,
    tax_percent: 11,
    tax_name: 'VAT',
    phone: '',
    email: '',
    address: '',
    registration_number: '',
    enable_expiry_tracking: false,
    pos_quick_items_enabled: true
  });

  const [newCurrency, setNewCurrency] = useState({
    code: '',
    name: '',
    symbol: '',
    rate_to_usd: 1,
    rate_to_lbp: 89500,
    is_active: true
  });

  useEffect(() => {
    fetchUsers();
    fetchCurrencies();
    fetchBackupInfo();
  }, [selectedOrgFilter]);

  // Load invoice template when currentOrg changes
  useEffect(() => {
    if (currentOrg?.invoice_template) {
      setInvoiceTemplate({
        company_name: currentOrg.invoice_template.company_name || currentOrg.name || '',
        company_type: currentOrg.invoice_template.company_type || 'S.A.R.L.',
        tel_fax: currentOrg.invoice_template.tel_fax || '',
        mobile: currentOrg.invoice_template.mobile || '',
        email: currentOrg.invoice_template.email || '',
        address: currentOrg.invoice_template.address || '',
        logo_url: currentOrg.invoice_template.logo_url || '',
        footer_text: currentOrg.invoice_template.footer_text || 'Thank you for your business!',
        show_tax_column: currentOrg.invoice_template.show_tax_column ?? true,
        show_discount_column: currentOrg.invoice_template.show_discount_column ?? true
      });
    } else if (currentOrg) {
      setInvoiceTemplate({
        company_name: currentOrg.name || '',
        company_type: 'S.A.R.L.',
        tel_fax: '',
        mobile: '',
        email: '',
        address: '',
        logo_url: '',
        footer_text: 'Thank you for your business!',
        show_tax_column: true,
        show_discount_column: true
      });
    }
  }, [currentOrg]);

  // Load invoice series when currentOrg changes
  useEffect(() => {
    if (currentOrg?.invoice_series) {
      setInvoiceSeries({
        sales_invoice: {
          prefix: currentOrg.invoice_series.sales_invoice?.prefix || 'INV-',
          next_number: currentOrg.invoice_series.sales_invoice?.next_number || '',
          include_year: currentOrg.invoice_series.sales_invoice?.include_year ?? true
        },
        purchase_invoice: {
          prefix: currentOrg.invoice_series.purchase_invoice?.prefix || 'PUR-',
          next_number: currentOrg.invoice_series.purchase_invoice?.next_number || '',
          include_year: currentOrg.invoice_series.purchase_invoice?.include_year ?? true
        },
        pos: {
          prefix: currentOrg.invoice_series.pos?.prefix || 'POS-',
          next_number: currentOrg.invoice_series.pos?.next_number || '',
          include_year: currentOrg.invoice_series.pos?.include_year ?? true
        },
        dbcr: {
          prefix: currentOrg.invoice_series.dbcr?.prefix || 'DBCR-',
          next_number: currentOrg.invoice_series.dbcr?.next_number || '',
          include_year: currentOrg.invoice_series.dbcr?.include_year ?? true
        },
        quotation: {
          prefix: currentOrg.invoice_series.quotation?.prefix || 'QUO-',
          next_number: currentOrg.invoice_series.quotation?.next_number || '',
          include_year: currentOrg.invoice_series.quotation?.include_year ?? true
        }
      });
    } else {
      setInvoiceSeries({
        sales_invoice: { prefix: 'INV-', next_number: '', include_year: true },
        purchase_invoice: { prefix: 'PUR-', next_number: '', include_year: true },
        pos: { prefix: 'POS-', next_number: '', include_year: true },
        dbcr: { prefix: 'DBCR-', next_number: '', include_year: true },
        quotation: { prefix: 'QUO-', next_number: '', include_year: true }
      });
    }
  }, [currentOrg]);

  const fetchBackupInfo = async () => {
    try {
      const response = await axios.get(`${API}/backup/info`);
      setBackupInfo(response.data);
    } catch (error) {
      console.error('Failed to fetch backup info:', error);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const url = selectedOrgFilter === 'all' 
        ? `${API}/users`
        : `${API}/users?organization_id=${selectedOrgFilter}`;
      const response = await axios.get(url);
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrencies = async () => {
    try {
      const response = await axios.get(`${API}/currencies`);
      setCurrencies(response.data);
    } catch (error) {
      console.error('Failed to fetch currencies:', error);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await axios.put(`${API}/users/${editingUser.id}`, {
          name: newUser.name,
          role: newUser.role,
          organization_id: newUser.organization_id || null
        });
      } else {
        await axios.post(`${API}/users`, newUser);
      }
      setIsUserDialogOpen(false);
      resetUserForm();
      fetchUsers();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save user');
    }
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    try {
      if (editingOrg) {
        await axios.put(`${API}/organizations/${editingOrg.id}`, newOrg);
      } else {
        await axios.post(`${API}/organizations`, newOrg);
      }
      setIsOrgDialogOpen(false);
      resetOrgForm();
      fetchOrganizations();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save organization');
    }
  };

  const handleCreateCurrency = async (e) => {
    e.preventDefault();
    try {
      if (editingCurrency) {
        await axios.put(`${API}/currencies/${editingCurrency.id}`, {
          name: newCurrency.name,
          symbol: newCurrency.symbol,
          rate_to_usd: newCurrency.rate_to_usd,
          rate_to_lbp: newCurrency.rate_to_lbp,
          is_active: newCurrency.is_active
        });
      } else {
        await axios.post(`${API}/currencies`, newCurrency);
      }
      setIsCurrencyDialogOpen(false);
      resetCurrencyForm();
      fetchCurrencies();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save currency');
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirm) return;
    try {
      await axios.delete(`${API}/users/${deleteConfirm.id}`);
      setDeleteConfirm(null);
      fetchUsers();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete user');
    }
  };

  const handleDeleteOrg = async (forceDelete = false) => {
    if (!deleteOrgConfirm) return;
    try {
      const url = forceDelete 
        ? `${API}/organizations/${deleteOrgConfirm.id}?force=true`
        : `${API}/organizations/${deleteOrgConfirm.id}`;
      const response = await axios.delete(url);
      alert(response.data.message);
      setDeleteOrgConfirm(null);
      setDeleteOrgForce(false);
      setDeleteOrgError(null);
      fetchOrganizations();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to delete organization';
      // Check if error indicates data exists
      if (errorMsg.includes('has data:') || errorMsg.includes('user(s)') || errorMsg.includes('account(s)')) {
        setDeleteOrgError(errorMsg);
        setDeleteOrgForce(true);
      } else {
        alert(errorMsg);
      }
    }
  };

  const handleDeleteCurrency = async () => {
    if (!deleteCurrencyConfirm) return;
    try {
      await axios.delete(`${API}/currencies/${deleteCurrencyConfirm.id}`);
      setDeleteCurrencyConfirm(null);
      fetchCurrencies();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete currency');
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser || !newPassword) return;
    try {
      await axios.post(`${API}/users/${resetPasswordUser.id}/reset-password?new_password=${encodeURIComponent(newPassword)}`);
      setResetPasswordUser(null);
      setNewPassword('');
      alert('Password reset successfully!');
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to reset password');
    }
  };

  const handleToggleActive = async (u) => {
    try {
      await axios.put(`${API}/users/${u.id}`, { is_active: !u.is_active });
      fetchUsers();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to update user');
    }
  };

  const handleToggleCurrencyActive = async (c) => {
    try {
      await axios.put(`${API}/currencies/${c.id}`, { is_active: !c.is_active });
      fetchCurrencies();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to update currency');
    }
  };

  const handleSeedCurrencies = async () => {
    setSeedingCurrencies(true);
    try {
      await axios.post(`${API}/currencies/seed`);
      fetchCurrencies();
      alert('Currencies seeded successfully!');
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to seed currencies');
    } finally {
      setSeedingCurrencies(false);
    }
  };

  // Backup & Restore handlers
  const handleCreateBackup = async (orgId = null) => {
    setBackupLoading(true);
    try {
      const url = orgId ? `${API}/backup?organization_id=${orgId}` : `${API}/backup`;
      const response = await axios.post(url);
      
      // Download the backup file
      const backupData = response.data.data;
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = response.data.filename;
      link.click();
      window.URL.revokeObjectURL(downloadUrl);
      
      alert(`Backup created successfully!\nFile: ${response.data.filename}`);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to create backup');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.json')) {
      setRestoreFile(file);
      setRestoreConfirmOpen(true);
    } else {
      alert('Please select a valid JSON backup file');
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreFile) return;
    
    setRestoreLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', restoreFile);
      
      const response = await axios.post(
        `${API}/restore?mode=${restoreMode}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      setRestoreResult(response.data);
      
      // Refresh data
      fetchUsers();
      fetchCurrencies();
      fetchOrganizations();
      fetchBackupInfo();
      
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to restore backup');
    } finally {
      setRestoreLoading(false);
      setRestoreFile(null);
      if (restoreFileRef.current) restoreFileRef.current.value = '';
    }
  };

  const handleEditUser = (u) => {
    setEditingUser(u);
    setNewUser({
      email: u.email,
      password: '',
      name: u.name,
      role: u.role,
      organization_id: u.organization_id || ''
    });
    setIsUserDialogOpen(true);
  };

  const handleEditOrg = (org) => {
    setEditingOrg(org);
    setNewOrg({
      name: org.name,
      currency: org.currency,
      base_exchange_rate: org.base_exchange_rate,
      tax_percent: org.tax_percent !== undefined ? org.tax_percent : 11,
      tax_name: org.tax_name || 'VAT',
      phone: org.phone || '',
      email: org.email || '',
      address: org.address || '',
      registration_number: org.registration_number || '',
      enable_expiry_tracking: org.enable_expiry_tracking || false,
      pos_quick_items_enabled: org.pos_quick_items_enabled !== false
    });
    setIsOrgDialogOpen(true);
  };

  // Save Invoice Template
  const handleSaveTemplate = async () => {
    if (!currentOrg) {
      alert('Please select an organization first');
      return;
    }
    
    setTemplateSaving(true);
    try {
      await axios.put(`${API}/organizations/${currentOrg.id}`, {
        invoice_template: invoiceTemplate
      });
      // Refresh organizations to get updated data
      await fetchOrganizations();
      alert('Invoice template saved successfully!');
    } catch (error) {
      console.error('Failed to save template:', error);
      alert(error.response?.data?.detail || 'Failed to save template');
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleSaveInvoiceSeries = async () => {
    if (!currentOrg) {
      alert('Please select an organization first');
      return;
    }
    
    setSeriesSaving(true);
    try {
      // Clean up the series data - convert next_number to integer or null
      const cleanedSeries = {};
      Object.keys(invoiceSeries).forEach(key => {
        cleanedSeries[key] = {
          prefix: invoiceSeries[key].prefix || '',
          next_number: invoiceSeries[key].next_number ? parseInt(invoiceSeries[key].next_number, 10) : null,
          include_year: invoiceSeries[key].include_year
        };
      });
      
      await axios.put(`${API}/organizations/${currentOrg.id}`, {
        invoice_series: cleanedSeries
      });
      // Refresh organizations to get updated data
      await fetchOrganizations();
      alert('Document series settings saved successfully!');
    } catch (error) {
      console.error('Failed to save series settings:', error);
      alert(error.response?.data?.detail || 'Failed to save series settings');
    } finally {
      setSeriesSaving(false);
    }
  };

  const handleEditCurrency = (c) => {
    setEditingCurrency(c);
    setNewCurrency({
      code: c.code,
      name: c.name,
      symbol: c.symbol,
      rate_to_usd: c.rate_to_usd,
      rate_to_lbp: c.rate_to_lbp,
      is_active: c.is_active
    });
    setIsCurrencyDialogOpen(true);
  };

  const resetUserForm = () => {
    setNewUser({
      email: '',
      password: '',
      name: '',
      role: 'viewer',
      organization_id: ''
    });
    setEditingUser(null);
  };

  const resetOrgForm = () => {
    setNewOrg({
      name: '',
      currency: 'LBP',
      base_exchange_rate: 89500,
      tax_percent: 11,
      tax_name: 'VAT',
      phone: '',
      email: '',
      address: '',
      registration_number: '',
      enable_expiry_tracking: false,
      pos_quick_items_enabled: true
    });
    setEditingOrg(null);
  };

  const resetCurrencyForm = () => {
    setNewCurrency({
      code: '',
      name: '',
      symbol: '',
      rate_to_usd: 1,
      rate_to_lbp: 89500,
      is_active: true
    });
    setEditingCurrency(null);
  };

  const roleColors = {
    super_admin: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    admin: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    accountant: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    viewer: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
  };

  if (user?.role !== 'super_admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Access denied. Super Admin only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6" data-testid="settings-page">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Settings
        </h1>
        <p className="text-muted-foreground text-xs lg:text-sm mt-1">
          Manage users, roles, organizations, currencies, and backups
        </p>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="grid w-full grid-cols-8 lg:w-[1050px]">
          <TabsTrigger value="users" className="text-xs lg:text-sm">
            <Users className="w-4 h-4 mr-1 lg:mr-2" />
            <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="organizations" className="text-xs lg:text-sm">
            <Building2 className="w-4 h-4 mr-1 lg:mr-2" />
            <span className="hidden sm:inline">Organizations</span>
          </TabsTrigger>
          <TabsTrigger value="fiscal-years" className="text-xs lg:text-sm" data-testid="tab-fiscal-years">
            <Calendar className="w-4 h-4 mr-1 lg:mr-2" />
            <span className="hidden sm:inline">Fiscal Years</span>
          </TabsTrigger>
          <TabsTrigger value="services" className="text-xs lg:text-sm">
            <Package className="w-4 h-4 mr-1 lg:mr-2" />
            <span className="hidden sm:inline">Services</span>
          </TabsTrigger>
          <TabsTrigger value="invoice-template" className="text-xs lg:text-sm">
            <FileText className="w-4 h-4 mr-1 lg:mr-2" />
            <span className="hidden sm:inline">Invoice Template</span>
          </TabsTrigger>
          <TabsTrigger value="document-series" className="text-xs lg:text-sm">
            <Hash className="w-4 h-4 mr-1 lg:mr-2" />
            <span className="hidden sm:inline">Document Series</span>
          </TabsTrigger>
          <TabsTrigger value="currencies" className="text-xs lg:text-sm">
            <Coins className="w-4 h-4 mr-1 lg:mr-2" />
            <span className="hidden sm:inline">Currencies</span>
          </TabsTrigger>
          <TabsTrigger value="backup" className="text-xs lg:text-sm">
            <Database className="w-4 h-4 mr-1 lg:mr-2" />
            <span className="hidden sm:inline">Backup</span>
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-base lg:text-lg" style={{ fontFamily: 'Manrope, sans-serif' }}>
                  User Management
                </CardTitle>
                <div className="flex gap-2">
                  <Select value={selectedOrgFilter} onValueChange={setSelectedOrgFilter}>
                    <SelectTrigger className="w-[180px] text-xs lg:text-sm" data-testid="org-filter">
                      <SelectValue placeholder="Filter by org" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Organizations</SelectItem>
                      {organizations.map(org => (
                        <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Dialog open={isUserDialogOpen} onOpenChange={(open) => { setIsUserDialogOpen(open); if (!open) resetUserForm(); }}>
                    <DialogTrigger asChild>
                      <Button className="btn-glow text-xs lg:text-sm" data-testid="add-user-btn">
                        <Plus className="w-4 h-4 mr-2" />
                        Add User
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                      <DialogHeader>
                        <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateUser} className="space-y-4 mt-4">
                        {!editingUser && (
                          <>
                            <div className="space-y-2">
                              <Label className="text-sm">Email</Label>
                              <Input
                                type="email"
                                placeholder="user@example.com"
                                value={newUser.email}
                                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                required
                                data-testid="user-email-input"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm">Password</Label>
                              <Input
                                type="password"
                                placeholder="Initial password"
                                value={newUser.password}
                                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                                required={!editingUser}
                                data-testid="user-password-input"
                              />
                            </div>
                          </>
                        )}
                        <div className="space-y-2">
                          <Label className="text-sm">Name</Label>
                          <Input
                            placeholder="Full name"
                            value={newUser.name}
                            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                            required
                            data-testid="user-name-input"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Role</Label>
                          <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value })}>
                            <SelectTrigger data-testid="user-role-select">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="super_admin">Super Admin</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="accountant">Accountant</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Organization</Label>
                          <Select value={newUser.organization_id || 'none'} onValueChange={(value) => setNewUser({ ...newUser, organization_id: value === 'none' ? '' : value })}>
                            <SelectTrigger data-testid="user-org-select">
                              <SelectValue placeholder="Select organization" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Organization</SelectItem>
                              {organizations.map(org => (
                                <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                          <Button type="button" variant="outline" onClick={() => { setIsUserDialogOpen(false); resetUserForm(); }}>
                            Cancel
                          </Button>
                          <Button type="submit" data-testid="save-user-btn">
                            {editingUser ? 'Update' : 'Create'}
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8"><div className="spinner" /></div>
              ) : users.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No users found</p>
              ) : (
                <>
                  {/* Mobile view */}
                  <div className="lg:hidden space-y-3">
                    {users.map((u) => (
                      <div key={u.id} className="p-3 bg-muted/20 rounded-sm border border-border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            <span className="font-medium text-sm">{u.name}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-sm text-xs border ${roleColors[u.role]}`}>
                            {getRoleDisplayName(u.role)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                        <p className="text-xs text-muted-foreground mt-1">{u.organization_name || 'No organization'}</p>
                        <div className="flex gap-1 mt-2">
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleEditUser(u)}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setResetPasswordUser(u)}>
                            <Key className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleToggleActive(u)}>
                            {u.is_active ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                          </Button>
                          {u.id !== user.id && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400" onClick={() => setDeleteConfirm(u)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop view */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Organization</th>
                          <th>Created</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.id} data-testid={`user-row-${u.id}`}>
                            <td>
                              <span className={`w-2 h-2 rounded-full inline-block ${u.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            </td>
                            <td className="font-medium">{u.name}</td>
                            <td className="text-muted-foreground">{u.email}</td>
                            <td>
                              <span className={`px-2 py-0.5 rounded-sm text-xs border ${roleColors[u.role]}`}>
                                {getRoleDisplayName(u.role)}
                              </span>
                            </td>
                            <td className="text-muted-foreground">{u.organization_name || '-'}</td>
                            <td className="text-muted-foreground text-xs">{formatDate(u.created_at)}</td>
                            <td>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => handleEditUser(u)} title="Edit">
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setResetPasswordUser(u)} title="Reset Password">
                                  <Key className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleToggleActive(u)} title={u.is_active ? 'Deactivate' : 'Activate'}>
                                  {u.is_active ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                                </Button>
                                {u.id !== user.id && (
                                  <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setDeleteConfirm(u)} title="Delete">
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
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organizations Tab */}
        <TabsContent value="organizations" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base lg:text-lg" style={{ fontFamily: 'Manrope, sans-serif' }}>
                  Organizations
                </CardTitle>
                <Dialog open={isOrgDialogOpen} onOpenChange={(open) => { setIsOrgDialogOpen(open); if (!open) resetOrgForm(); }}>
                  <DialogTrigger asChild>
                    <Button className="btn-glow text-xs lg:text-sm" data-testid="add-org-btn">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Organization
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingOrg ? 'Edit Organization' : 'Add New Organization'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateOrg} className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label className="text-sm">Organization Name</Label>
                        <Input
                          placeholder="e.g., Beirut Trading Co."
                          value={newOrg.name}
                          onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                          required
                          data-testid="org-name-input"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">Base Currency</Label>
                        <Select value={newOrg.currency} onValueChange={(value) => setNewOrg({ ...newOrg, currency: value })}>
                          <SelectTrigger data-testid="org-currency-select">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="LBP">LBP - Lebanese Pound</SelectItem>
                            <SelectItem value="USD">USD - US Dollar</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">Base Exchange Rate (LBP/USD)</Label>
                        <Input
                          type="number"
                          value={newOrg.base_exchange_rate}
                          onChange={(e) => setNewOrg({ ...newOrg, base_exchange_rate: parseFloat(e.target.value) })}
                          required
                          className="font-mono"
                          data-testid="org-rate-input"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-sm">Default Tax Rate (%)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={newOrg.tax_percent}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNewOrg({ ...newOrg, tax_percent: val === '' ? 0 : parseFloat(val) });
                            }}
                            className="font-mono"
                            data-testid="org-tax-input"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Tax Name</Label>
                          <Select value={newOrg.tax_name} onValueChange={(v) => setNewOrg({ ...newOrg, tax_name: v })}>
                            <SelectTrigger data-testid="org-tax-name-select">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="VAT">VAT</SelectItem>
                              <SelectItem value="Sales Tax">Sales Tax</SelectItem>
                              <SelectItem value="GST">GST</SelectItem>
                              <SelectItem value="Tax">Tax</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      {/* Contact Information */}
                      <div className="border-t pt-4 mt-4">
                        <h4 className="text-sm font-medium mb-3">Contact Information</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label className="text-sm">Phone</Label>
                            <Input
                              placeholder="e.g., +961 1 234 567"
                              value={newOrg.phone}
                              onChange={(e) => setNewOrg({ ...newOrg, phone: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Email</Label>
                            <Input
                              type="email"
                              placeholder="e.g., info@company.com"
                              value={newOrg.email}
                              onChange={(e) => setNewOrg({ ...newOrg, email: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="space-y-2 mt-3">
                          <Label className="text-sm">Address</Label>
                          <Textarea
                            placeholder="e.g., Beirut, Lebanon"
                            value={newOrg.address}
                            onChange={(e) => setNewOrg({ ...newOrg, address: e.target.value })}
                            rows={2}
                          />
                        </div>
                        <div className="space-y-2 mt-3">
                          <Label className="text-sm">Registration Number</Label>
                          <Input
                            placeholder="e.g., RC 12345"
                            value={newOrg.registration_number}
                            onChange={(e) => setNewOrg({ ...newOrg, registration_number: e.target.value })}
                          />
                        </div>
                        
                        {/* Inventory Settings */}
                        <div className="border-t pt-4 mt-4">
                          <h4 className="text-sm font-medium mb-3">Inventory Settings</h4>
                          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                            <div>
                              <Label className="text-sm font-medium">Enable Expiry Tracking</Label>
                              <p className="text-xs text-muted-foreground mt-1">
                                Track inventory by batches with expiry dates and lot numbers
                              </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={newOrg.enable_expiry_tracking}
                                onChange={(e) => setNewOrg({ ...newOrg, enable_expiry_tracking: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                            </label>
                          </div>
                        </div>
                        
                        {/* POS Settings */}
                        <div className="border-t pt-4 mt-4">
                          <h4 className="text-sm font-medium mb-3">POS Settings</h4>
                          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                            <div>
                              <Label className="text-sm font-medium">Show Quick Items Panel</Label>
                              <p className="text-xs text-muted-foreground mt-1">
                                Display quick item buttons in POS. Turn off for full-screen cart view.
                              </p>
                              <p className="text-xs text-cyan-400 mt-1">
                                Tip: Mark items as &quot;Show in POS Quick Items&quot; in Inventory to customize which items appear.
                              </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={newOrg.pos_quick_items_enabled}
                                onChange={(e) => setNewOrg({ ...newOrg, pos_quick_items_enabled: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                            </label>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => { setIsOrgDialogOpen(false); resetOrgForm(); }}>
                          Cancel
                        </Button>
                        <Button type="submit" data-testid="save-org-btn">{editingOrg ? 'Update' : 'Create'}</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {organizations.map((org) => (
                  <div key={org.id} className="p-4 bg-muted/20 rounded-sm border border-border" data-testid={`org-card-${org.id}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium">{org.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Currency: {org.currency}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Rate: {org.base_exchange_rate.toLocaleString()} LBP/USD
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Tax: {org.tax_percent !== undefined ? org.tax_percent : 11}% ({org.tax_name || 'VAT'})
                        </p>
                      </div>
                      <Building2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {users.filter(u => u.organization_id === org.id).length} users assigned
                      </p>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleEditOrg(org)} title="Edit">
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400" onClick={() => setDeleteOrgConfirm(org)} title="Delete">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Service Items Tab */}
        <TabsContent value="services" className="space-y-4">
          <ServiceManagement />
        </TabsContent>

        {/* Invoice Template Tab */}
        <TabsContent value="invoice-template" className="space-y-4">
          {!currentOrg ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Please select an organization to configure its invoice template.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <DocumentTemplateManager 
              currentOrg={currentOrg}
              fetchOrganizations={fetchOrganizations}
            />
          )}
        </TabsContent>

        {/* Document Series Tab */}
        <TabsContent value="document-series" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base lg:text-lg" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Document Number Series
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Configure the prefix and starting number for each document type. 
                Useful when migrating from another system or continuing an existing series.
              </p>
            </CardHeader>
            <CardContent>
              {!currentOrg ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Hash className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Please select an organization to configure document series.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Sales Invoice Series */}
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Sales Invoice Series
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs">Prefix</Label>
                        <Input
                          value={invoiceSeries.sales_invoice.prefix}
                          onChange={(e) => setInvoiceSeries({
                            ...invoiceSeries,
                            sales_invoice: { ...invoiceSeries.sales_invoice, prefix: e.target.value }
                          })}
                          placeholder="INV-"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">e.g., INV-, SI-, SALE-</p>
                      </div>
                      <div>
                        <Label className="text-xs">Next Number (Override)</Label>
                        <Input
                          type="number"
                          value={invoiceSeries.sales_invoice.next_number}
                          onChange={(e) => setInvoiceSeries({
                            ...invoiceSeries,
                            sales_invoice: { ...invoiceSeries.sales_invoice, next_number: e.target.value }
                          })}
                          placeholder="Auto"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Leave empty for auto-increment</p>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={invoiceSeries.sales_invoice.include_year}
                            onChange={(e) => setInvoiceSeries({
                              ...invoiceSeries,
                              sales_invoice: { ...invoiceSeries.sales_invoice, include_year: e.target.checked }
                            })}
                            className="rounded"
                          />
                          Include Year (e.g., INV-2026-)
                        </label>
                      </div>
                    </div>
                    <p className="text-xs text-cyan-500 mt-2">
                      Preview: {invoiceSeries.sales_invoice.prefix}{invoiceSeries.sales_invoice.include_year ? `${new Date().getFullYear()}-` : ''}{String(invoiceSeries.sales_invoice.next_number || 1).padStart(5, '0')}
                    </p>
                  </div>

                  {/* Purchase Invoice Series */}
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Purchase Invoice Series
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs">Prefix</Label>
                        <Input
                          value={invoiceSeries.purchase_invoice.prefix}
                          onChange={(e) => setInvoiceSeries({
                            ...invoiceSeries,
                            purchase_invoice: { ...invoiceSeries.purchase_invoice, prefix: e.target.value }
                          })}
                          placeholder="PUR-"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">e.g., PUR-, PI-, PINV-</p>
                      </div>
                      <div>
                        <Label className="text-xs">Next Number (Override)</Label>
                        <Input
                          type="number"
                          value={invoiceSeries.purchase_invoice.next_number}
                          onChange={(e) => setInvoiceSeries({
                            ...invoiceSeries,
                            purchase_invoice: { ...invoiceSeries.purchase_invoice, next_number: e.target.value }
                          })}
                          placeholder="Auto"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Leave empty for auto-increment</p>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={invoiceSeries.purchase_invoice.include_year}
                            onChange={(e) => setInvoiceSeries({
                              ...invoiceSeries,
                              purchase_invoice: { ...invoiceSeries.purchase_invoice, include_year: e.target.checked }
                            })}
                            className="rounded"
                          />
                          Include Year
                        </label>
                      </div>
                    </div>
                    <p className="text-xs text-cyan-500 mt-2">
                      Preview: {invoiceSeries.purchase_invoice.prefix}{invoiceSeries.purchase_invoice.include_year ? `${new Date().getFullYear()}-` : ''}{String(invoiceSeries.purchase_invoice.next_number || 1).padStart(5, '0')}
                    </p>
                  </div>

                  {/* POS Receipt Series */}
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Coins className="w-4 h-4" />
                      POS Receipt Series
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs">Prefix</Label>
                        <Input
                          value={invoiceSeries.pos.prefix}
                          onChange={(e) => setInvoiceSeries({
                            ...invoiceSeries,
                            pos: { ...invoiceSeries.pos, prefix: e.target.value }
                          })}
                          placeholder="POS-"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">e.g., POS-, REC-, CASH-</p>
                      </div>
                      <div>
                        <Label className="text-xs">Next Number (Override)</Label>
                        <Input
                          type="number"
                          value={invoiceSeries.pos.next_number}
                          onChange={(e) => setInvoiceSeries({
                            ...invoiceSeries,
                            pos: { ...invoiceSeries.pos, next_number: e.target.value }
                          })}
                          placeholder="Auto"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Leave empty for auto-increment</p>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={invoiceSeries.pos.include_year}
                            onChange={(e) => setInvoiceSeries({
                              ...invoiceSeries,
                              pos: { ...invoiceSeries.pos, include_year: e.target.checked }
                            })}
                            className="rounded"
                          />
                          Include Year
                        </label>
                      </div>
                    </div>
                    <p className="text-xs text-cyan-500 mt-2">
                      Preview: {invoiceSeries.pos.prefix}{invoiceSeries.pos.include_year ? `${new Date().getFullYear()}-` : ''}{String(invoiceSeries.pos.next_number || 1).padStart(5, '0')}
                    </p>
                  </div>

                  {/* Debit/Credit Note Series */}
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Debit/Credit Note Series
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs">Prefix</Label>
                        <Input
                          value={invoiceSeries.dbcr.prefix}
                          onChange={(e) => setInvoiceSeries({
                            ...invoiceSeries,
                            dbcr: { ...invoiceSeries.dbcr, prefix: e.target.value }
                          })}
                          placeholder="DBCR-"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">e.g., DBCR-, DC-, NOTE-</p>
                      </div>
                      <div>
                        <Label className="text-xs">Next Number (Override)</Label>
                        <Input
                          type="number"
                          value={invoiceSeries.dbcr.next_number}
                          onChange={(e) => setInvoiceSeries({
                            ...invoiceSeries,
                            dbcr: { ...invoiceSeries.dbcr, next_number: e.target.value }
                          })}
                          placeholder="Auto"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Leave empty for auto-increment</p>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={invoiceSeries.dbcr.include_year}
                            onChange={(e) => setInvoiceSeries({
                              ...invoiceSeries,
                              dbcr: { ...invoiceSeries.dbcr, include_year: e.target.checked }
                            })}
                            className="rounded"
                          />
                          Include Year
                        </label>
                      </div>
                    </div>
                    <p className="text-xs text-cyan-500 mt-2">
                      Preview: {invoiceSeries.dbcr.prefix}{invoiceSeries.dbcr.include_year ? `${new Date().getFullYear()}-` : ''}{String(invoiceSeries.dbcr.next_number || 1).padStart(5, '0')}
                    </p>
                  </div>

                  {/* Sales Quotation Series */}
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Sales Quotation Series
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs">Prefix</Label>
                        <Input
                          value={invoiceSeries.quotation.prefix}
                          onChange={(e) => setInvoiceSeries({
                            ...invoiceSeries,
                            quotation: { ...invoiceSeries.quotation, prefix: e.target.value }
                          })}
                          placeholder="QUO-"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">e.g., QUO-, QUOTE-, EST-</p>
                      </div>
                      <div>
                        <Label className="text-xs">Next Number (Override)</Label>
                        <Input
                          type="number"
                          value={invoiceSeries.quotation.next_number}
                          onChange={(e) => setInvoiceSeries({
                            ...invoiceSeries,
                            quotation: { ...invoiceSeries.quotation, next_number: e.target.value }
                          })}
                          placeholder="Auto"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Leave empty for auto-increment</p>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={invoiceSeries.quotation.include_year}
                            onChange={(e) => setInvoiceSeries({
                              ...invoiceSeries,
                              quotation: { ...invoiceSeries.quotation, include_year: e.target.checked }
                            })}
                            className="rounded"
                          />
                          Include Year
                        </label>
                      </div>
                    </div>
                    <p className="text-xs text-cyan-500 mt-2">
                      Preview: {invoiceSeries.quotation.prefix}{invoiceSeries.quotation.include_year ? `${new Date().getFullYear()}-` : ''}{String(invoiceSeries.quotation.next_number || 1).padStart(5, '0')}
                    </p>
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end pt-4 border-t">
                    <Button onClick={handleSaveInvoiceSeries} disabled={seriesSaving}>
                      {seriesSaving ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Save Series Settings
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Currencies Tab */}
        <TabsContent value="currencies" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-base lg:text-lg" style={{ fontFamily: 'Manrope, sans-serif' }}>
                  Currency Management
                </CardTitle>
                <div className="flex gap-2">
                  {currencies.length === 0 && (
                    <Button variant="outline" onClick={handleSeedCurrencies} disabled={seedingCurrencies} className="text-xs lg:text-sm">
                      <RefreshCw className={`w-4 h-4 mr-2 ${seedingCurrencies ? 'animate-spin' : ''}`} />
                      Seed Currencies
                    </Button>
                  )}
                  <Dialog open={isCurrencyDialogOpen} onOpenChange={(open) => { setIsCurrencyDialogOpen(open); if (!open) resetCurrencyForm(); }}>
                    <DialogTrigger asChild>
                      <Button className="btn-glow text-xs lg:text-sm" data-testid="add-currency-btn">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Currency
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{editingCurrency ? 'Edit Currency' : 'Add New Currency'}</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateCurrency} className="space-y-4 mt-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm">Currency Code (ISO)</Label>
                            <Input
                              placeholder="e.g., EUR"
                              value={newCurrency.code}
                              onChange={(e) => setNewCurrency({ ...newCurrency, code: e.target.value.toUpperCase() })}
                              required
                              disabled={!!editingCurrency}
                              maxLength={3}
                              className="font-mono"
                              data-testid="currency-code-input"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Symbol</Label>
                            <Input
                              placeholder="e.g., €"
                              value={newCurrency.symbol}
                              onChange={(e) => setNewCurrency({ ...newCurrency, symbol: e.target.value })}
                              required
                              data-testid="currency-symbol-input"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Currency Name</Label>
                          <Input
                            placeholder="e.g., Euro"
                            value={newCurrency.name}
                            onChange={(e) => setNewCurrency({ ...newCurrency, name: e.target.value })}
                            required
                            data-testid="currency-name-input"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm">Rate to USD</Label>
                            <Input
                              type="number"
                              step="0.0001"
                              value={newCurrency.rate_to_usd}
                              onChange={(e) => setNewCurrency({ ...newCurrency, rate_to_usd: parseFloat(e.target.value) || 0 })}
                              required
                              className="font-mono"
                              data-testid="currency-rate-usd-input"
                            />
                            <p className="text-xs text-muted-foreground">1 {newCurrency.code || 'XXX'} = {newCurrency.rate_to_usd} USD</p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Rate to LBP</Label>
                            <Input
                              type="number"
                              step="1"
                              value={newCurrency.rate_to_lbp}
                              onChange={(e) => setNewCurrency({ ...newCurrency, rate_to_lbp: parseFloat(e.target.value) || 0 })}
                              required
                              className="font-mono"
                              data-testid="currency-rate-lbp-input"
                            />
                            <p className="text-xs text-muted-foreground">1 {newCurrency.code || 'XXX'} = {newCurrency.rate_to_lbp.toLocaleString()} LBP</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="currency-active"
                            checked={newCurrency.is_active}
                            onChange={(e) => setNewCurrency({ ...newCurrency, is_active: e.target.checked })}
                            className="rounded"
                          />
                          <Label htmlFor="currency-active" className="text-sm cursor-pointer">Active (available for voucher entry)</Label>
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                          <Button type="button" variant="outline" onClick={() => { setIsCurrencyDialogOpen(false); resetCurrencyForm(); }}>
                            Cancel
                          </Button>
                          <Button type="submit" data-testid="save-currency-btn">{editingCurrency ? 'Update' : 'Create'}</Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {currencies.length === 0 ? (
                <div className="text-center py-8">
                  <Coins className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No currencies configured</p>
                  <Button variant="outline" onClick={handleSeedCurrencies} disabled={seedingCurrencies}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${seedingCurrencies ? 'animate-spin' : ''}`} />
                    Seed World Currencies
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Code</th>
                        <th>Symbol</th>
                        <th>Name</th>
                        <th className="text-right">Rate to USD</th>
                        <th className="text-right">Rate to LBP</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currencies.map((c) => (
                        <tr key={c.id} data-testid={`currency-row-${c.code}`}>
                          <td>
                            <span className={`w-2 h-2 rounded-full inline-block ${c.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          </td>
                          <td className="font-mono font-medium">{c.code}</td>
                          <td>{c.symbol}</td>
                          <td className="text-muted-foreground">{c.name}</td>
                          <td className="text-right font-mono">{c.rate_to_usd.toFixed(4)}</td>
                          <td className="text-right font-mono">{c.rate_to_lbp.toLocaleString()}</td>
                          <td>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handleEditCurrency(c)} title="Edit">
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleToggleCurrencyActive(c)} title={c.is_active ? 'Deactivate' : 'Activate'}>
                                {c.is_active ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                              </Button>
                              {!['USD', 'LBP'].includes(c.code) && (
                                <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setDeleteCurrencyConfirm(c)} title="Delete">
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Backup & Restore Tab */}
        <TabsContent value="backup" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base lg:text-lg flex items-center gap-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
                <Database className="w-5 h-5" />
                Backup & Restore
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Backup Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold">Create Backup</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Download a complete backup of your database including all organizations, users, accounts, vouchers, and currencies.
                </p>
                
                {backupInfo && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {Object.entries(backupInfo.collections || {}).map(([name, count]) => (
                      <div key={name} className="p-3 bg-muted/30 rounded-sm text-center">
                        <p className="text-lg font-bold">{count}</p>
                        <p className="text-xs text-muted-foreground capitalize">{name}</p>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button 
                    onClick={() => handleCreateBackup()} 
                    disabled={backupLoading}
                    className="btn-glow"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {backupLoading ? 'Creating Backup...' : 'Download Full Backup'}
                  </Button>
                  {currentOrg && (
                    <Button 
                      variant="outline"
                      onClick={() => handleCreateBackup(currentOrg.id)} 
                      disabled={backupLoading}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Backup {currentOrg.name} Only
                    </Button>
                  )}
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Restore Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-orange-400" />
                  <h3 className="font-semibold">Restore from Backup</h3>
                </div>
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-sm">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-400">Warning</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Restoring a backup will modify your existing data. Make sure to download a backup of your current data first.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  <div className="flex-1">
                    <input
                      ref={restoreFileRef}
                      type="file"
                      accept=".json"
                      onChange={handleRestoreFileSelect}
                      className="hidden"
                      id="restore-file"
                    />
                    <label htmlFor="restore-file">
                      <Button variant="outline" asChild className="cursor-pointer">
                        <span>
                          <FileJson className="w-4 h-4 mr-2" />
                          Select Backup File (.json)
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>

                {restoreResult && (
                  <div className={`p-4 rounded-sm ${restoreResult.success ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {restoreResult.success ? (
                        <Check className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <X className="w-5 h-5 text-red-400" />
                      )}
                      <span className="font-medium">{restoreResult.message}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                      {Object.entries(restoreResult.restored_counts || {}).map(([name, counts]) => (
                        <div key={name} className="text-xs">
                          <span className="text-muted-foreground capitalize">{name}:</span>
                          {typeof counts === 'object' ? (
                            <span className="ml-1">
                              {counts.inserted > 0 && <span className="text-emerald-400">+{counts.inserted}</span>}
                              {counts.updated > 0 && <span className="text-blue-400 ml-1">↻{counts.updated}</span>}
                              {counts.error && <span className="text-red-400">{counts.error}</span>}
                            </span>
                          ) : (
                            <span className="ml-1">{counts}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Restore Confirmation Dialog */}
      <Dialog open={restoreConfirmOpen} onOpenChange={(open) => { setRestoreConfirmOpen(open); if (!open) { setRestoreFile(null); if (restoreFileRef.current) restoreFileRef.current.value = ''; } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Confirm Restore
            </DialogTitle>
            <DialogDescription>
              You are about to restore from: <strong>{restoreFile?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Restore Mode</Label>
              <Select value={restoreMode} onValueChange={setRestoreMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">Merge (Add new, update existing)</SelectItem>
                  <SelectItem value="replace">Replace (Clear and restore)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {restoreMode === 'merge' 
                  ? 'Existing records will be updated, new records will be added.'
                  : 'Warning: This will delete existing data before restoring!'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRestoreConfirmOpen(false); setRestoreFile(null); }}>
              Cancel
            </Button>
            <Button 
              variant={restoreMode === 'replace' ? 'destructive' : 'default'}
              onClick={() => { setRestoreConfirmOpen(false); handleRestoreBackup(); }}
              disabled={restoreLoading}
            >
              {restoreLoading ? 'Restoring...' : 'Restore Backup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.name}</strong> ({deleteConfirm?.email})?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteUser}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Organization Confirmation */}
      <Dialog open={!!deleteOrgConfirm} onOpenChange={() => { setDeleteOrgConfirm(null); setDeleteOrgForce(false); setDeleteOrgError(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Organization</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteOrgConfirm?.name}</strong>?
              {!deleteOrgForce && (
                <span className="block mt-2 text-muted-foreground">
                  This will check if the organization has any data before deleting.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {deleteOrgError && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-sm">
              <p className="text-amber-400 text-sm font-medium mb-2">⚠️ Organization has existing data:</p>
              <p className="text-sm text-muted-foreground">{deleteOrgError}</p>
              <p className="text-sm text-red-400 mt-2 font-medium">
                Click "Force Delete" to permanently delete the organization and ALL its data.
              </p>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteOrgConfirm(null); setDeleteOrgForce(false); setDeleteOrgError(null); }}>Cancel</Button>
            {deleteOrgForce ? (
              <Button variant="destructive" onClick={() => handleDeleteOrg(true)}>
                Force Delete All Data
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => handleDeleteOrg(false)}>Delete</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Currency Confirmation */}
      <Dialog open={!!deleteCurrencyConfirm} onOpenChange={() => setDeleteCurrencyConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Currency</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteCurrencyConfirm?.code} - {deleteCurrencyConfirm?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCurrencyConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteCurrency}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetPasswordUser} onOpenChange={() => { setResetPasswordUser(null); setNewPassword(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Enter a new password for <strong>{resetPasswordUser?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                data-testid="new-password-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetPasswordUser(null); setNewPassword(''); }}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={!newPassword}>Reset Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;
