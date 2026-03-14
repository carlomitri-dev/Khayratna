import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Settings, Upload, Trash2, Save, Loader2, ImageIcon } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ReceiptSettingsDialog = ({ open, onOpenChange, organizationId }) => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (open && organizationId) {
      setLoading(true);
      axios.get(`${API}/receipt-settings?organization_id=${organizationId}`)
        .then(res => setSettings(res.data))
        .catch(() => toast.error('Failed to load receipt settings'))
        .finally(() => setLoading(false));
    }
  }, [open, organizationId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await axios.put(
        `${API}/receipt-settings?organization_id=${organizationId}`,
        settings
      );
      setSettings(res.data);
      toast.success('Receipt settings saved');
    } catch {
      toast.error('Failed to save settings');
    }
    setSaving(false);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500000) {
      toast.error('Logo must be under 500KB');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(
        `${API}/receipt-settings/logo?organization_id=${organizationId}`,
        fd, { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setSettings(prev => ({ ...prev, logo_url: res.data.logo_url }));
      toast.success('Logo uploaded');
    } catch {
      toast.error('Failed to upload logo');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDeleteLogo = async () => {
    try {
      await axios.delete(`${API}/receipt-settings/logo?organization_id=${organizationId}`);
      setSettings(prev => ({ ...prev, logo_url: null }));
      toast.success('Logo removed');
    } catch {
      toast.error('Failed to remove logo');
    }
  };

  const update = (field, value) => setSettings(prev => ({ ...prev, [field]: value }));

  if (!settings) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="receipt-settings-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Receipt Settings
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Logo Section */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Store Logo</Label>
              <div className="flex items-center gap-4">
                {settings.logo_url ? (
                  <div className="relative w-24 h-24 border rounded-lg overflow-hidden bg-white flex items-center justify-center">
                    <img src={settings.logo_url} alt="Logo" className="max-w-full max-h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-24 h-24 border border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground">
                    <ImageIcon className="w-8 h-8 mb-1 opacity-40" />
                    <span className="text-[10px]">No logo</span>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  <Button
                    variant="outline" size="sm"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    data-testid="upload-logo-btn"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                    Upload Logo
                  </Button>
                  {settings.logo_url && (
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDeleteLogo} data-testid="delete-logo-btn">
                      <Trash2 className="w-4 h-4 mr-2" /> Remove
                    </Button>
                  )}
                  <p className="text-[10px] text-muted-foreground">Max 500KB. PNG/JPG recommended.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={settings.show_logo} onCheckedChange={v => update('show_logo', v)} />
                <Label className="text-xs">Show logo on receipt</Label>
              </div>
            </div>

            {/* Store Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Store Name</Label>
                <Input value={settings.store_name || ''} onChange={e => update('store_name', e.target.value)} placeholder="Store name" data-testid="store-name-input" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Store Name (Arabic)</Label>
                <Input value={settings.store_name_ar || ''} onChange={e => update('store_name_ar', e.target.value)} placeholder="اسم المتجر" dir="rtl" data-testid="store-name-ar-input" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Address Line 1</Label>
                <Input value={settings.address_line1 || ''} onChange={e => update('address_line1', e.target.value)} placeholder="Street address" data-testid="address1-input" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Address Line 2</Label>
                <Input value={settings.address_line2 || ''} onChange={e => update('address_line2', e.target.value)} placeholder="City, Region" data-testid="address2-input" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={settings.phone || ''} onChange={e => update('phone', e.target.value)} placeholder="+961 1 234 567" data-testid="phone-input" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">VAT Number</Label>
                <Input value={settings.vat_number || ''} onChange={e => update('vat_number', e.target.value)} placeholder="VAT registration #" data-testid="vat-number-input" />
              </div>
            </div>

            {/* Footer */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Footer Message</Label>
                <Input value={settings.footer_message || ''} onChange={e => update('footer_message', e.target.value)} placeholder="Thank you for your business!" data-testid="footer-input" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Footer (Arabic)</Label>
                <Input value={settings.footer_message_ar || ''} onChange={e => update('footer_message_ar', e.target.value)} placeholder="شكراً لتعاملكم" dir="rtl" data-testid="footer-ar-input" />
              </div>
            </div>

            {/* Printer & Display */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Printer Width</Label>
                <Select value={settings.printer_width || '80mm'} onValueChange={v => update('printer_width', v)}>
                  <SelectTrigger data-testid="printer-width-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58mm">58mm (Mini)</SelectItem>
                    <SelectItem value="72mm">72mm (Standard)</SelectItem>
                    <SelectItem value="80mm">80mm (Wide)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Font Size</Label>
                <Select value={settings.font_size || '12px'} onValueChange={v => update('font_size', v)}>
                  <SelectTrigger data-testid="font-size-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10px">Small (10px)</SelectItem>
                    <SelectItem value="12px">Normal (12px)</SelectItem>
                    <SelectItem value="14px">Large (14px)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2">
                  <Switch checked={settings.show_vat_number} onCheckedChange={v => update('show_vat_number', v)} />
                  <Label className="text-xs">Show VAT #</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={settings.show_barcode} onCheckedChange={v => update('show_barcode', v)} />
                  <Label className="text-xs">Show Barcode</Label>
                </div>
              </div>
            </div>

            {/* Live Preview */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Receipt Preview</Label>
              <div
                className="mx-auto bg-white text-black rounded-md shadow-inner border overflow-hidden"
                style={{ width: settings.printer_width || '80mm', fontSize: settings.font_size || '12px', fontFamily: "'Courier New', monospace", padding: '5mm' }}
                data-testid="receipt-preview"
              >
                {settings.show_logo && settings.logo_url && (
                  <div style={{ textAlign: 'center', marginBottom: '3mm' }}>
                    <img src={settings.logo_url} alt="Logo" style={{ maxHeight: '40px', maxWidth: '80%', margin: '0 auto' }} />
                  </div>
                )}
                <div style={{ textAlign: 'center', marginBottom: '2mm' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '1.2em' }}>{settings.store_name || 'Store Name'}</div>
                  {settings.store_name_ar && <div style={{ fontWeight: 'bold', fontSize: '1.1em' }} dir="rtl">{settings.store_name_ar}</div>}
                  {settings.address_line1 && <div style={{ fontSize: '0.85em' }}>{settings.address_line1}</div>}
                  {settings.address_line2 && <div style={{ fontSize: '0.85em' }}>{settings.address_line2}</div>}
                  {settings.phone && <div style={{ fontSize: '0.85em' }}>Tel: {settings.phone}</div>}
                  {settings.show_vat_number && settings.vat_number && <div style={{ fontSize: '0.85em' }}>VAT: {settings.vat_number}</div>}
                </div>
                <div style={{ borderTop: '2px solid #000', margin: '2mm 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9em' }}>
                  <span>Receipt #:</span><span>POS-2026-XXXXX</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9em' }}>
                  <span>Date:</span><span>14-03-2026 12:00</span>
                </div>
                <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />
                <div>
                  <div style={{ fontSize: '0.9em' }}>Sample Item</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', color: '#333' }}>
                    <span>2 x $3.500</span><span>$7.000</span>
                  </div>
                </div>
                <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1em' }}>
                  <span>TOTAL:</span><span>$7.000</span>
                </div>
                <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />
                <div style={{ textAlign: 'center', fontSize: '0.85em', marginTop: '2mm' }}>
                  {settings.footer_message && <div>{settings.footer_message}</div>}
                  {settings.footer_message_ar && <div dir="rtl">{settings.footer_message_ar}</div>}
                </div>
                {settings.show_barcode && (
                  <div style={{ textAlign: 'center', fontSize: '0.75em', border: '1px dashed #999', padding: '2mm', marginTop: '2mm' }}>
                    [Barcode: POS-2026-XXXXX]
                  </div>
                )}
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={saving} data-testid="save-receipt-settings-btn">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Settings
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ReceiptSettingsDialog;
