/**
 * Invoice Template Editor Component
 * Visual drag-and-drop editor for positioning invoice fields on paper
 * Enhanced with custom text, images, and shapes
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { 
  Move, Save, Eye, Trash2, RotateCcw, 
  FileText, Hash, Calendar, User, DollarSign, 
  MapPin, Phone, Mail, Package, Percent, List,
  Type, Image, Square, Circle, Minus, Plus, X
} from 'lucide-react';

// Available invoice fields that can be positioned
const AVAILABLE_FIELDS = [
  // Header fields
  { id: 'invoice_number', label: 'Invoice Number', icon: Hash, category: 'header', defaultValue: 'INV-2025-00001' },
  { id: 'date', label: 'Date', icon: Calendar, category: 'header', defaultValue: '29-12-2025' },
  { id: 'due_date', label: 'Due Date', icon: Calendar, category: 'header', defaultValue: '29-01-2026' },
  
  // Customer fields
  { id: 'customer_name', label: 'Customer Name', icon: User, category: 'customer', defaultValue: 'Ahmad Trading Co.' },
  { id: 'customer_address', label: 'Customer Address', icon: MapPin, category: 'customer', defaultValue: '123 Main St, Beirut' },
  { id: 'customer_account', label: 'Account Code', icon: Hash, category: 'customer', defaultValue: '41101' },
  
  // Company fields
  { id: 'company_name', label: 'Company Name', icon: FileText, category: 'company', defaultValue: 'G.C. GROUP' },
  { id: 'company_phone', label: 'Company Phone', icon: Phone, category: 'company', defaultValue: '+961 1 234 567' },
  { id: 'company_email', label: 'Company Email', icon: Mail, category: 'company', defaultValue: 'info@company.com' },
  { id: 'company_address', label: 'Company Address', icon: MapPin, category: 'company', defaultValue: 'Beirut, Lebanon' },
  { id: 'company_registration', label: 'Registration No.', icon: Hash, category: 'company', defaultValue: 'RC 12345' },
  
  // Totals fields
  { id: 'subtotal', label: 'Subtotal', icon: DollarSign, category: 'totals', defaultValue: '$ 1,000.00' },
  { id: 'discount', label: 'Discount', icon: Percent, category: 'totals', defaultValue: '$ 50.00' },
  { id: 'tax', label: 'Tax', icon: Percent, category: 'totals', defaultValue: '$ 104.50' },
  { id: 'total', label: 'Total', icon: DollarSign, category: 'totals', defaultValue: '$ 1,054.50' },
  { id: 'amount_words', label: 'Amount in Words', icon: FileText, category: 'totals', defaultValue: 'One Thousand Fifty-Four Dollars Only' },
];

// Line item column fields
const LINE_ITEM_FIELDS = [
  { id: 'line_item_no', label: 'Item #', icon: Hash, category: 'line_items', defaultValue: '1' },
  { id: 'line_description', label: 'Description', icon: Package, category: 'line_items', defaultValue: 'Product Name' },
  { id: 'line_quantity', label: 'Quantity', icon: Hash, category: 'line_items', defaultValue: '10' },
  { id: 'line_unit', label: 'Unit', icon: Package, category: 'line_items', defaultValue: 'pcs' },
  { id: 'line_unit_price', label: 'Unit Price', icon: DollarSign, category: 'line_items', defaultValue: '$ 100.00' },
  { id: 'line_discount', label: 'Line Discount', icon: Percent, category: 'line_items', defaultValue: '5%' },
  { id: 'line_total', label: 'Line Total', icon: DollarSign, category: 'line_items', defaultValue: '$ 950.00' },
];

// Custom element types
const CUSTOM_ELEMENT_TYPES = [
  { type: 'text', label: 'Free Text', icon: Type, description: 'Add custom text' },
  { type: 'image', label: 'Image', icon: Image, description: 'Add logo or image' },
  { type: 'rectangle', label: 'Rectangle', icon: Square, description: 'Add rectangle shape' },
  { type: 'line', label: 'Line', icon: Minus, description: 'Add horizontal line' },
];

// Combine all fields
const ALL_FIELDS = [...AVAILABLE_FIELDS, ...LINE_ITEM_FIELDS];

const InvoiceTemplateEditor = ({ 
  template, 
  onSave, 
  organizationId = '',
  organizationName = 'Organization' 
}) => {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // State
  const [paperSize, setPaperSize] = useState({
    width: template?.page_width || 210,  // A4 default
    height: template?.page_height || 297
  });
  const [fieldPositions, setFieldPositions] = useState(
    template?.field_positions || []
  );
  const [customElements, setCustomElements] = useState(
    template?.custom_elements || []
  );
  const [lineItemsConfig, setLineItemsConfig] = useState(
    template?.line_items_config || {
      start_y: 35,
      row_height: 3,
      max_rows: 10
    }
  );
  // Company info for template header
  const [companyInfo, setCompanyInfo] = useState({
    company_name: template?.company_name || organizationName || '',
    company_type: template?.company_type || '',
    address: template?.address || '',
    tel_fax: template?.tel_fax || '',
    mobile: template?.mobile || '',
    email: template?.email || '',
    footer_text: template?.footer_text || 'Thank you for your business!'
  });
  // Background image for printed invoices
  const [backgroundImage, setBackgroundImage] = useState(template?.background_image || '');
  const [backgroundSettings, setBackgroundSettings] = useState({
    position: template?.background_position || 'center',  // center, top, bottom, stretch
    opacity: template?.background_opacity || 100,         // 0-100
    size: template?.background_size || 'cover'            // cover, contain, stretch
  });
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [showBackgroundPreview, setShowBackgroundPreview] = useState(false);
  const backgroundInputRef = useRef(null);
  
  const [selectedField, setSelectedField] = useState(null);
  const [selectedCustomElement, setSelectedCustomElement] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [draggingCustom, setDraggingCustom] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCompanyInfo, setShowCompanyInfo] = useState(false);

  // Add field to canvas
  const addFieldToCanvas = (fieldId) => {
    const field = ALL_FIELDS.find(f => f.id === fieldId);
    if (!field) return;
    
    // Check if field already exists
    if (fieldPositions.find(f => f.field_name === fieldId)) {
      alert('This field is already on the template');
      return;
    }
    
    // Default position based on category
    let defaultY = 10;
    if (field.category === 'customer') defaultY = 20;
    if (field.category === 'line_items') defaultY = lineItemsConfig.start_y;
    if (field.category === 'totals') defaultY = 75;
    
    setFieldPositions([
      ...fieldPositions,
      {
        field_name: fieldId,
        x: 10,
        y: defaultY,
        font_size: 11,
        font_weight: 'normal',
        text_align: 'left',
        text_wrap: 'nowrap',
        max_width: 100,
        visible: true
      }
    ]);
    setSelectedCustomElement(null);
  };

  // Add custom element (text, image, shape)
  const addCustomElement = (type) => {
    const elementId = `${type}_${Date.now()}`;
    const newElement = {
      id: elementId,
      type: type,
      x: 50,
      y: 50,
      // Type-specific defaults
      ...(type === 'text' && {
        content: 'Enter text here',
        font_size: 12,
        font_weight: 'normal',
        color: '#000000',
        max_width: 100
      }),
      ...(type === 'image' && {
        url: '',
        width: 30,
        height: 20
      }),
      ...(type === 'rectangle' && {
        width: 20,
        height: 10,
        fill_color: 'transparent',
        border_color: '#000000',
        border_width: 1
      }),
      ...(type === 'line' && {
        width: 50,
        color: '#000000',
        thickness: 1
      })
    };
    setCustomElements([...customElements, newElement]);
    setSelectedCustomElement(elementId);
    setSelectedField(null);
  };

  // Remove custom element
  const removeCustomElement = (elementId) => {
    setCustomElements(customElements.filter(e => e.id !== elementId));
    if (selectedCustomElement === elementId) setSelectedCustomElement(null);
  };

  // Update custom element property
  const updateCustomElementProperty = (elementId, property, value) => {
    setCustomElements(elements =>
      elements.map(el =>
        el.id === elementId
          ? { ...el, [property]: value }
          : el
      )
    );
  };

  // Handle image upload
  const handleImageUpload = async (e, elementId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Convert to base64 for preview (in production, you'd upload to S3)
    const reader = new FileReader();
    reader.onload = (event) => {
      updateCustomElementProperty(elementId, 'url', event.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Handle custom element drag start
  const handleCustomDragStart = (e, elementId) => {
    e.preventDefault();
    setDraggingCustom(elementId);
    setSelectedCustomElement(elementId);
    setSelectedField(null);
  };

  // Remove field from canvas
  const removeField = (fieldName) => {
    setFieldPositions(fieldPositions.filter(f => f.field_name !== fieldName));
    if (selectedField === fieldName) setSelectedField(null);
  };

  // Handle drag start
  const handleDragStart = (e, fieldName) => {
    e.preventDefault();
    setDragging(fieldName);
    setSelectedField(fieldName);
    setSelectedCustomElement(null);
  };

  // Handle drag on canvas (for both fields and custom elements)
  const handleCanvasMouseMove = useCallback((e) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    if (dragging) {
      setFieldPositions(positions => 
        positions.map(pos => 
          pos.field_name === dragging 
            ? { ...pos, x: Math.max(0, Math.min(95, x)), y: Math.max(0, Math.min(95, y)) }
            : pos
        )
      );
    }
    
    if (draggingCustom) {
      setCustomElements(elements =>
        elements.map(el =>
          el.id === draggingCustom
            ? { ...el, x: Math.max(0, Math.min(95, x)), y: Math.max(0, Math.min(95, y)) }
            : el
        )
      );
    }
  }, [dragging, draggingCustom]);

  // Handle drag end
  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setDraggingCustom(null);
  }, []);

  // Add event listeners
  useEffect(() => {
    if (dragging || draggingCustom) {
      window.addEventListener('mousemove', handleCanvasMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleCanvasMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, draggingCustom, handleCanvasMouseMove, handleMouseUp]);

  // Update field property
  const updateFieldProperty = (fieldName, property, value) => {
    setFieldPositions(positions =>
      positions.map(pos =>
        pos.field_name === fieldName
          ? { ...pos, [property]: value }
          : pos
      )
    );
  };

  // Handle background image upload
  const handleBackgroundUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size should be less than 5MB');
      return;
    }
    
    if (!organizationId) {
      alert('Organization not selected. Please try again.');
      return;
    }
    
    setUploadingBackground(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('organization_id', organizationId);
      formData.append('file_type', 'document');
      
      const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API}/files/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Upload failed');
      }
      
      const data = await response.json();
      if (data.url) {
        setBackgroundImage(data.url);
      }
    } catch (error) {
      console.error('Background upload failed:', error);
      alert('Failed to upload background image: ' + error.message);
    } finally {
      setUploadingBackground(false);
      if (backgroundInputRef.current) {
        backgroundInputRef.current.value = '';
      }
    }
  };

  // Get CSS for background based on settings
  const getBackgroundStyles = () => {
    if (!backgroundImage) return {};
    
    let backgroundSize = 'cover';
    let backgroundPosition = 'center center';
    
    switch (backgroundSettings.size) {
      case 'contain':
        backgroundSize = 'contain';
        break;
      case 'stretch':
        backgroundSize = '100% 100%';
        break;
      default:
        backgroundSize = 'cover';
    }
    
    switch (backgroundSettings.position) {
      case 'top':
        backgroundPosition = 'center top';
        break;
      case 'bottom':
        backgroundPosition = 'center bottom';
        break;
      default:
        backgroundPosition = 'center center';
    }
    
    return {
      backgroundImage: `url('${backgroundImage}')`,
      backgroundSize,
      backgroundPosition,
      backgroundRepeat: 'no-repeat',
      opacity: backgroundSettings.opacity / 100
    };
  };

  // Save template
  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        page_width: paperSize.width,
        page_height: paperSize.height,
        field_positions: fieldPositions,
        custom_elements: customElements,
        line_items_config: lineItemsConfig,
        background_image: backgroundImage,
        background_position: backgroundSettings.position,
        background_opacity: backgroundSettings.opacity,
        background_size: backgroundSettings.size,
        // Company info for print header
        ...companyInfo
      });
    } finally {
      setSaving(false);
    }
  };

  // Reset template
  const handleReset = () => {
    if (window.confirm('Reset all field positions and custom elements? This cannot be undone.')) {
      setFieldPositions([]);
      setCustomElements([]);
      setLineItemsConfig({
        start_y: 35,
        row_height: 3,
        max_rows: 10
      });
    }
  };

  // Get field info
  const getFieldInfo = (fieldName) => {
    return ALL_FIELDS.find(f => f.id === fieldName);
  };

  // Get selected field position
  const selectedFieldPosition = fieldPositions.find(f => f.field_name === selectedField);
  
  // Get selected custom element
  const selectedCustomElementData = customElements.find(e => e.id === selectedCustomElement);

  // Group fields by category
  const fieldsByCategory = {
    header: AVAILABLE_FIELDS.filter(f => f.category === 'header'),
    customer: AVAILABLE_FIELDS.filter(f => f.category === 'customer'),
    company: AVAILABLE_FIELDS.filter(f => f.category === 'company'),
    totals: AVAILABLE_FIELDS.filter(f => f.category === 'totals'),
    line_items: LINE_ITEM_FIELDS
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          {/* Paper Size */}
          <div className="flex items-center gap-2">
            <Label className="text-sm whitespace-nowrap">Paper Size (mm):</Label>
            <Input
              type="number"
              value={paperSize.width}
              onChange={(e) => setPaperSize({ ...paperSize, width: parseFloat(e.target.value) || 210 })}
              className="w-20 h-8"
              placeholder="Width"
            />
            <span className="text-muted-foreground">×</span>
            <Input
              type="number"
              value={paperSize.height}
              onChange={(e) => setPaperSize({ ...paperSize, height: parseFloat(e.target.value) || 297 })}
              className="w-20 h-8"
              placeholder="Height"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye className="w-4 h-4 mr-2" />
            {showPreview ? 'Edit Mode' : 'Preview'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
        <Button onClick={handleSave} disabled={saving} className="btn-glow">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Template'}
        </Button>
      </div>

      {/* Company Info Section (Collapsible) */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowCompanyInfo(!showCompanyInfo)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Company Info (for Print Header)
            </CardTitle>
            <span className="text-muted-foreground text-xs">
              {showCompanyInfo ? '▼ Hide' : '▶ Show'}
            </span>
          </div>
        </CardHeader>
        {showCompanyInfo && (
          <CardContent className="space-y-3 pt-0">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Company Name</Label>
                <Input
                  value={companyInfo.company_name}
                  onChange={(e) => setCompanyInfo({...companyInfo, company_name: e.target.value})}
                  placeholder="Company Name"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Company Type</Label>
                <Input
                  value={companyInfo.company_type}
                  onChange={(e) => setCompanyInfo({...companyInfo, company_type: e.target.value})}
                  placeholder="e.g., S.A.R.L., LLC"
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Address</Label>
              <Input
                value={companyInfo.address}
                onChange={(e) => setCompanyInfo({...companyInfo, address: e.target.value})}
                placeholder="Company Address"
                className="h-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tel/Fax</Label>
                <Input
                  value={companyInfo.tel_fax}
                  onChange={(e) => setCompanyInfo({...companyInfo, tel_fax: e.target.value})}
                  placeholder="Tel/Fax number"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mobile</Label>
                <Input
                  value={companyInfo.mobile}
                  onChange={(e) => setCompanyInfo({...companyInfo, mobile: e.target.value})}
                  placeholder="Mobile number"
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                value={companyInfo.email}
                onChange={(e) => setCompanyInfo({...companyInfo, email: e.target.value})}
                placeholder="contact@company.com"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Footer Text</Label>
              <Input
                value={companyInfo.footer_text}
                onChange={(e) => setCompanyInfo({...companyInfo, footer_text: e.target.value})}
                placeholder="Thank you for your business!"
                className="h-8 text-sm"
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Background Image Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Image className="w-4 h-4" />
            Print Background Image
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Upload an image to use as background when printing. This could be a letterhead, watermark, or decorative border.
          </p>
          
          {backgroundImage ? (
            <div className="space-y-4">
              {/* Image thumbnail with remove button */}
              <div className="relative border rounded-lg overflow-hidden bg-muted/30 p-2">
                <img 
                  src={backgroundImage} 
                  alt="Background preview"
                  className="w-full h-20 object-contain"
                />
                <button
                  type="button"
                  onClick={() => setBackgroundImage('')}
                  className="absolute top-1 right-1 bg-destructive text-white rounded-full p-1 hover:bg-destructive/80"
                  title="Remove background"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              
              {/* Position & Size Controls */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Position</label>
                  <select
                    value={backgroundSettings.position}
                    onChange={(e) => setBackgroundSettings(prev => ({ ...prev, position: e.target.value }))}
                    className="w-full h-8 text-xs border rounded px-2 bg-background"
                  >
                    <option value="center">Center</option>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Size</label>
                  <select
                    value={backgroundSettings.size}
                    onChange={(e) => setBackgroundSettings(prev => ({ ...prev, size: e.target.value }))}
                    className="w-full h-8 text-xs border rounded px-2 bg-background"
                  >
                    <option value="cover">Cover (fill)</option>
                    <option value="contain">Contain (fit)</option>
                    <option value="stretch">Stretch</option>
                  </select>
                </div>
              </div>
              
              {/* Opacity Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium">Opacity</label>
                  <span className="text-xs text-muted-foreground">{backgroundSettings.opacity}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={backgroundSettings.opacity}
                  onChange={(e) => setBackgroundSettings(prev => ({ ...prev, opacity: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Watermark</span>
                  <span>Full</span>
                </div>
              </div>
              
              {/* Preview Button */}
              <button
                type="button"
                onClick={() => setShowBackgroundPreview(true)}
                className="w-full py-2 text-xs border rounded-lg hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Preview Background on Page
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div 
                onClick={() => backgroundInputRef.current?.click()}
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <Image className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">
                  {uploadingBackground ? 'Uploading...' : 'Click to upload background image'}
                </p>
              </div>
              <input
                ref={backgroundInputRef}
                type="file"
                accept="image/*"
                onChange={handleBackgroundUpload}
                className="hidden"
              />
            </div>
          )}
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">Tip</span>
            <span>Use PNG with transparency for best results as a letterhead or watermark</span>
          </div>
        </CardContent>
      </Card>

      {/* Background Preview Modal */}
      {showBackgroundPreview && backgroundImage && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowBackgroundPreview(false)}>
          <div className="bg-background rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Background Preview
              </h3>
              <button
                onClick={() => setShowBackgroundPreview(false)}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div 
                className="mx-auto border shadow-lg"
                style={{
                  width: `${Math.min(paperSize.width * 2.5, 500)}px`,
                  height: `${Math.min(paperSize.height * 2.5, 700)}px`,
                  position: 'relative',
                  background: 'white'
                }}
              >
                {/* Background layer */}
                <div 
                  style={{
                    position: 'absolute',
                    inset: 0,
                    ...getBackgroundStyles()
                  }}
                />
                {/* Content overlay preview */}
                <div className="absolute inset-0 p-6 flex flex-col" style={{ opacity: 0.7 }}>
                  <div className="text-center mb-4">
                    <div className="text-lg font-bold text-gray-800">{companyInfo.company_name || 'Company Name'}</div>
                    <div className="text-xs text-gray-600">{companyInfo.company_type || 'Company Type'}</div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600 mb-4">
                    <div>
                      <div className="font-medium">Customer Name</div>
                      <div>123 Customer Street</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">Invoice #INV-001</div>
                      <div>Date: {new Date().toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="flex-1 border-t border-gray-300 pt-2">
                    <div className="grid grid-cols-4 gap-2 text-xs font-medium text-gray-700 border-b pb-1">
                      <div>Item</div>
                      <div className="text-center">Qty</div>
                      <div className="text-right">Price</div>
                      <div className="text-right">Total</div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs text-gray-600 py-1">
                      <div>Sample Item 1</div>
                      <div className="text-center">2</div>
                      <div className="text-right">$50.00</div>
                      <div className="text-right">$100.00</div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs text-gray-600 py-1">
                      <div>Sample Item 2</div>
                      <div className="text-center">1</div>
                      <div className="text-right">$75.00</div>
                      <div className="text-right">$75.00</div>
                    </div>
                  </div>
                  <div className="text-right text-sm font-bold text-gray-800 mt-2 pt-2 border-t">
                    Total: $175.00
                  </div>
                  <div className="text-center text-xs text-gray-500 mt-4">
                    {companyInfo.footer_text || 'Thank you for your business!'}
                  </div>
                </div>
              </div>
              <div className="mt-4 text-center text-xs text-muted-foreground">
                Preview shows how the background will appear on printed documents
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Available Fields Panel */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Available Fields</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[600px] overflow-y-auto">
            {/* Header Fields */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Header</p>
              {fieldsByCategory.header.map(field => {
                const isUsed = fieldPositions.find(f => f.field_name === field.id);
                const Icon = field.icon;
                return (
                  <button
                    key={field.id}
                    onClick={() => addFieldToCanvas(field.id)}
                    disabled={isUsed}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors
                      ${isUsed ? 'bg-green-500/10 text-green-400' : 'hover:bg-accent cursor-pointer'}`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{field.label}</span>
                    {isUsed && <span className="ml-auto">✓</span>}
                  </button>
                );
              })}
            </div>

            {/* Customer Fields */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Customer</p>
              {fieldsByCategory.customer.map(field => {
                const isUsed = fieldPositions.find(f => f.field_name === field.id);
                const Icon = field.icon;
                return (
                  <button
                    key={field.id}
                    onClick={() => addFieldToCanvas(field.id)}
                    disabled={isUsed}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors
                      ${isUsed ? 'bg-green-500/10 text-green-400' : 'hover:bg-accent cursor-pointer'}`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{field.label}</span>
                    {isUsed && <span className="ml-auto">✓</span>}
                  </button>
                );
              })}
            </div>

            {/* Company Fields */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Company</p>
              {fieldsByCategory.company.map(field => {
                const isUsed = fieldPositions.find(f => f.field_name === field.id);
                const Icon = field.icon;
                return (
                  <button
                    key={field.id}
                    onClick={() => addFieldToCanvas(field.id)}
                    disabled={isUsed}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors
                      ${isUsed ? 'bg-green-500/10 text-green-400' : 'hover:bg-accent cursor-pointer'}`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{field.label}</span>
                    {isUsed && <span className="ml-auto">✓</span>}
                  </button>
                );
              })}
            </div>

            {/* Line Items Fields */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                <List className="w-3 h-3" />
                Line Items (per row)
              </p>
              {fieldsByCategory.line_items.map(field => {
                const isUsed = fieldPositions.find(f => f.field_name === field.id);
                const Icon = field.icon;
                return (
                  <button
                    key={field.id}
                    onClick={() => addFieldToCanvas(field.id)}
                    disabled={isUsed}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors
                      ${isUsed ? 'bg-orange-500/10 text-orange-400' : 'hover:bg-accent cursor-pointer'}`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{field.label}</span>
                    {isUsed && <span className="ml-auto">✓</span>}
                  </button>
                );
              })}
            </div>

            {/* Totals Fields */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Totals</p>
              {fieldsByCategory.totals.map(field => {
                const isUsed = fieldPositions.find(f => f.field_name === field.id);
                const Icon = field.icon;
                return (
                  <button
                    key={field.id}
                    onClick={() => addFieldToCanvas(field.id)}
                    disabled={isUsed}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors
                      ${isUsed ? 'bg-green-500/10 text-green-400' : 'hover:bg-accent cursor-pointer'}`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{field.label}</span>
                    {isUsed && <span className="ml-auto">✓</span>}
                  </button>
                );
              })}
            </div>

            {/* Custom Elements */}
            <div className="border-t pt-3 mt-3">
              <p className="text-xs font-semibold text-purple-400 mb-1 flex items-center gap-1">
                <Plus className="w-3 h-3" />
                Add Custom Elements
              </p>
              <p className="text-[10px] text-muted-foreground mb-2">Add text, images, or shapes</p>
              <div className="grid grid-cols-2 gap-1">
                {CUSTOM_ELEMENT_TYPES.map(elType => {
                  const Icon = elType.icon;
                  return (
                    <button
                      key={elType.type}
                      onClick={() => addCustomElement(elType.type)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded text-xs hover:bg-purple-500/10 transition-colors text-left"
                      title={elType.description}
                    >
                      <Icon className="w-3 h-3 text-purple-400" />
                      <span>{elType.label}</span>
                    </button>
                  );
                })}
              </div>
              
              {/* List of added custom elements */}
              {customElements.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] text-muted-foreground">Added elements:</p>
                  {customElements.map(el => {
                    const elType = CUSTOM_ELEMENT_TYPES.find(t => t.type === el.type);
                    const Icon = elType?.icon || Square;
                    return (
                      <div
                        key={el.id}
                        onClick={() => {
                          setSelectedCustomElement(el.id);
                          setSelectedField(null);
                        }}
                        className={`flex items-center justify-between px-2 py-1 rounded text-xs cursor-pointer
                          ${selectedCustomElement === el.id ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-accent'}`}
                      >
                        <span className="flex items-center gap-1">
                          <Icon className="w-3 h-3" />
                          {el.type === 'text' ? (el.content?.substring(0, 15) + (el.content?.length > 15 ? '...' : '')) : elType?.label}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCustomElement(el.id);
                          }}
                          className="text-destructive hover:bg-destructive/20 p-0.5 rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Canvas Area */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Template Canvas ({paperSize.width} × {paperSize.height} mm)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={canvasRef}
              className="relative border-2 rounded-lg overflow-hidden bg-white"
              style={{
                aspectRatio: `${paperSize.width} / ${paperSize.height}`,
                cursor: dragging ? 'grabbing' : 'default',
                backgroundImage: 'linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)',
                backgroundSize: '5% 5%'
              }}
            >
              {/* Line Items Area Indicator */}
              {!showPreview && (
                <div
                  className="absolute left-0 right-0 border-2 border-dashed border-orange-400/50 bg-orange-500/5"
                  style={{
                    top: `${lineItemsConfig.start_y}%`,
                    height: `${lineItemsConfig.row_height * lineItemsConfig.max_rows}%`
                  }}
                >
                  <span className="absolute top-0 left-2 text-[10px] text-orange-500 bg-white px-1">
                    Line Items Area ({lineItemsConfig.max_rows} rows)
                  </span>
                </div>
              )}
              
              {/* Positioned Fields */}
              {fieldPositions.map(pos => {
                const fieldInfo = getFieldInfo(pos.field_name);
                if (!fieldInfo) return null;
                
                const isLineItem = fieldInfo.category === 'line_items';
                
                return (
                  <div
                    key={pos.field_name}
                    className={`absolute px-1 py-0.5 rounded cursor-grab select-none transition-all text-black
                      ${selectedField === pos.field_name 
                        ? 'ring-2 ring-primary bg-primary/30' 
                        : isLineItem 
                          ? 'bg-orange-500/20 hover:bg-orange-500/30'
                          : 'bg-blue-500/20 hover:bg-blue-500/30'
                      }
                      ${dragging === pos.field_name ? 'cursor-grabbing opacity-75' : ''}
                    `}
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      fontSize: `${pos.font_size}px`,
                      fontWeight: pos.font_weight,
                      textAlign: pos.text_align,
                      maxWidth: pos.text_wrap === 'wrap' ? `${pos.max_width || 100}%` : 'none',
                      whiteSpace: pos.text_wrap === 'wrap' ? 'normal' : 'nowrap',
                      wordWrap: pos.text_wrap === 'wrap' ? 'break-word' : 'normal',
                    }}
                    onMouseDown={(e) => handleDragStart(e, pos.field_name)}
                    onClick={() => setSelectedField(pos.field_name)}
                  >
                    <div className="flex items-center gap-1">
                      <Move className="w-3 h-3 text-gray-500 flex-shrink-0" />
                      <span>
                        {showPreview ? fieldInfo.defaultValue : fieldInfo.label}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Custom Elements on Canvas */}
              {customElements.map(el => {
                const isSelected = selectedCustomElement === el.id;
                
                return (
                  <div
                    key={el.id}
                    className={`absolute cursor-grab select-none transition-all
                      ${isSelected ? 'ring-2 ring-purple-500' : ''}
                      ${draggingCustom === el.id ? 'cursor-grabbing opacity-75' : ''}
                    `}
                    style={{
                      left: `${el.x}%`,
                      top: `${el.y}%`,
                    }}
                    onMouseDown={(e) => handleCustomDragStart(e, el.id)}
                    onClick={() => {
                      setSelectedCustomElement(el.id);
                      setSelectedField(null);
                    }}
                  >
                    {/* Text Element */}
                    {el.type === 'text' && (
                      <div
                        className="px-1 py-0.5 rounded bg-purple-500/20"
                        style={{
                          fontSize: `${el.font_size || 12}px`,
                          fontWeight: el.font_weight || 'normal',
                          color: el.color || '#000000',
                          maxWidth: `${el.max_width || 100}px`,
                          whiteSpace: 'pre-wrap'
                        }}
                      >
                        <div className="flex items-start gap-1">
                          <Move className="w-3 h-3 text-purple-500 flex-shrink-0 mt-0.5" />
                          <span>{el.content || 'Text'}</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Image Element */}
                    {el.type === 'image' && (
                      <div
                        className="rounded border-2 border-dashed border-purple-500/50 bg-purple-500/10 flex items-center justify-center overflow-hidden"
                        style={{
                          width: `${el.width || 30}%`,
                          height: `${el.height || 20}%`,
                          minWidth: '40px',
                          minHeight: '30px'
                        }}
                      >
                        {el.url ? (
                          <img 
                            src={el.url} 
                            alt="Template image" 
                            className="w-full h-full object-contain"
                            draggable={false}
                          />
                        ) : (
                          <div className="text-center p-1">
                            <Image className="w-4 h-4 mx-auto text-purple-500" />
                            <span className="text-[8px] text-purple-500">Image</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Rectangle Element */}
                    {el.type === 'rectangle' && (
                      <div
                        className="flex items-center justify-center"
                        style={{
                          width: `${(el.width || 20) * 3}px`,
                          height: `${(el.height || 10) * 3}px`,
                          minWidth: '30px',
                          minHeight: '20px',
                          backgroundColor: el.fill_color || 'transparent',
                          border: `${el.border_width || 1}px solid ${el.border_color || '#000000'}`
                        }}
                      >
                        <Move className="w-3 h-3 text-purple-500" />
                      </div>
                    )}
                    
                    {/* Line Element */}
                    {el.type === 'line' && (
                      <div className="flex items-center gap-1">
                        <Move className="w-3 h-3 text-purple-500 flex-shrink-0" />
                        <div
                          style={{
                            width: `${(el.width || 50) * 2}px`,
                            height: `${el.thickness || 1}px`,
                            backgroundColor: el.color || '#000000'
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Empty state */}
              {fieldPositions.length === 0 && customElements.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Click fields on the left to add them</p>
                    <p className="text-xs">Then drag to position</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Properties Panel */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selectedCustomElementData ? 'Element Properties' : 'Field Properties'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-h-[500px] overflow-y-auto">
            {/* Custom Element Properties */}
            {selectedCustomElementData ? (
              <>
                <div className="p-2 bg-purple-500/10 rounded">
                  <p className="font-medium text-sm text-purple-400">
                    {CUSTOM_ELEMENT_TYPES.find(t => t.type === selectedCustomElementData.type)?.label}
                  </p>
                  <p className="text-xs text-muted-foreground">Custom element</p>
                </div>
                
                {/* Position */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">X (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={selectedCustomElementData.x?.toFixed(1)}
                      onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'x', parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Y (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={selectedCustomElementData.y?.toFixed(1)}
                      onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'y', parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                
                {/* Text-specific properties */}
                {selectedCustomElementData.type === 'text' && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Text Content</Label>
                      <Textarea
                        value={selectedCustomElementData.content || ''}
                        onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'content', e.target.value)}
                        className="text-sm min-h-[60px]"
                        placeholder="Enter your text..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Font Size</Label>
                        <Input
                          type="number"
                          min="8"
                          max="48"
                          value={selectedCustomElementData.font_size || 12}
                          onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'font_size', parseInt(e.target.value) || 12)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Weight</Label>
                        <select
                          value={selectedCustomElementData.font_weight || 'normal'}
                          onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'font_weight', e.target.value)}
                          className="w-full h-8 text-sm border rounded px-2 bg-background"
                        >
                          <option value="normal">Normal</option>
                          <option value="bold">Bold</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Text Color</Label>
                        <Input
                          type="color"
                          value={selectedCustomElementData.color || '#000000'}
                          onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'color', e.target.value)}
                          className="h-8 w-full"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max Width (px)</Label>
                        <Input
                          type="number"
                          min="50"
                          max="500"
                          value={selectedCustomElementData.max_width || 100}
                          onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'max_width', parseInt(e.target.value) || 100)}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </>
                )}
                
                {/* Image-specific properties */}
                {selectedCustomElementData.type === 'image' && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Upload Image</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e, selectedCustomElement)}
                        className="text-sm"
                        ref={fileInputRef}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Or Image URL</Label>
                      <Input
                        type="text"
                        value={selectedCustomElementData.url || ''}
                        onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'url', e.target.value)}
                        className="h-8 text-sm"
                        placeholder="https://..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Width (%)</Label>
                        <Input
                          type="number"
                          min="5"
                          max="100"
                          value={selectedCustomElementData.width || 30}
                          onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'width', parseInt(e.target.value) || 30)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Height (%)</Label>
                        <Input
                          type="number"
                          min="5"
                          max="100"
                          value={selectedCustomElementData.height || 20}
                          onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'height', parseInt(e.target.value) || 20)}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </>
                )}
                
                {/* Rectangle-specific properties */}
                {selectedCustomElementData.type === 'rectangle' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Width (mm)</Label>
                        <Input
                          type="number"
                          min="5"
                          max="200"
                          value={selectedCustomElementData.width || 20}
                          onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'width', parseInt(e.target.value) || 20)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Height (mm)</Label>
                        <Input
                          type="number"
                          min="5"
                          max="200"
                          value={selectedCustomElementData.height || 10}
                          onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'height', parseInt(e.target.value) || 10)}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Fill Color</Label>
                        <div className="flex gap-1">
                          <Input
                            type="color"
                            value={selectedCustomElementData.fill_color === 'transparent' ? '#ffffff' : (selectedCustomElementData.fill_color || '#ffffff')}
                            onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'fill_color', e.target.value)}
                            className="h-8 w-12"
                          />
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 text-xs"
                            onClick={() => updateCustomElementProperty(selectedCustomElement, 'fill_color', 'transparent')}
                          >
                            None
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Border Color</Label>
                        <Input
                          type="color"
                          value={selectedCustomElementData.border_color || '#000000'}
                          onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'border_color', e.target.value)}
                          className="h-8 w-full"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Border Width (px)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        value={selectedCustomElementData.border_width || 1}
                        onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'border_width', parseInt(e.target.value) || 1)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </>
                )}
                
                {/* Line-specific properties */}
                {selectedCustomElementData.type === 'line' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Width (mm)</Label>
                        <Input
                          type="number"
                          min="10"
                          max="200"
                          value={selectedCustomElementData.width || 50}
                          onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'width', parseInt(e.target.value) || 50)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Thickness (px)</Label>
                        <Input
                          type="number"
                          min="1"
                          max="10"
                          value={selectedCustomElementData.thickness || 1}
                          onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'thickness', parseInt(e.target.value) || 1)}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Line Color</Label>
                      <Input
                        type="color"
                        value={selectedCustomElementData.color || '#000000'}
                        onChange={(e) => updateCustomElementProperty(selectedCustomElement, 'color', e.target.value)}
                        className="h-8 w-full"
                      />
                    </div>
                  </>
                )}
                
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => removeCustomElement(selectedCustomElement)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove Element
                </Button>
              </>
            ) : selectedFieldPosition ? (
              <>
                <div className="p-2 bg-muted/30 rounded">
                  <p className="font-medium text-sm">
                    {getFieldInfo(selectedField)?.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getFieldInfo(selectedField)?.category}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">X (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={selectedFieldPosition.x.toFixed(1)}
                      onChange={(e) => updateFieldProperty(selectedField, 'x', parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Y (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={selectedFieldPosition.y.toFixed(1)}
                      onChange={(e) => updateFieldProperty(selectedField, 'y', parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs">Font Size (px)</Label>
                  <Input
                    type="number"
                    min="8"
                    max="24"
                    value={selectedFieldPosition.font_size}
                    onChange={(e) => updateFieldProperty(selectedField, 'font_size', parseInt(e.target.value) || 11)}
                    className="h-8 text-sm"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Weight</Label>
                    <select
                      value={selectedFieldPosition.font_weight}
                      onChange={(e) => updateFieldProperty(selectedField, 'font_weight', e.target.value)}
                      className="w-full h-8 text-sm border rounded px-2 bg-background"
                    >
                      <option value="normal">Normal</option>
                      <option value="bold">Bold</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Align</Label>
                    <select
                      value={selectedFieldPosition.text_align}
                      onChange={(e) => updateFieldProperty(selectedField, 'text_align', e.target.value)}
                      className="w-full h-8 text-sm border rounded px-2 bg-background"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Text Wrap</Label>
                    <select
                      value={selectedFieldPosition.text_wrap || 'nowrap'}
                      onChange={(e) => updateFieldProperty(selectedField, 'text_wrap', e.target.value)}
                      className="w-full h-8 text-sm border rounded px-2 bg-background"
                    >
                      <option value="nowrap">No Wrap</option>
                      <option value="wrap">Wrap Text</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Width (%)</Label>
                    <Input
                      type="number"
                      min="10"
                      max="100"
                      step="5"
                      value={selectedFieldPosition.max_width || 100}
                      onChange={(e) => updateFieldProperty(selectedField, 'max_width', parseInt(e.target.value) || 100)}
                      className="h-8 text-sm"
                      disabled={selectedFieldPosition.text_wrap !== 'wrap'}
                    />
                  </div>
                </div>
                
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => removeField(selectedField)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove Field
                </Button>
              </>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                <Move className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Select a field or element</p>
                <p className="text-xs">Click on the canvas to select</p>
              </div>
            )}

            {/* Line Items Config */}
            <div className="border-t pt-4">
              <p className="font-medium text-sm mb-3 flex items-center gap-2">
                <List className="w-4 h-4" />
                Line Items Config
              </p>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">Start Y (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="80"
                    value={lineItemsConfig.start_y}
                    onChange={(e) => setLineItemsConfig({
                      ...lineItemsConfig,
                      start_y: parseFloat(e.target.value) || 35
                    })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Row Height (%)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      step="0.5"
                      value={lineItemsConfig.row_height}
                      onChange={(e) => setLineItemsConfig({
                        ...lineItemsConfig,
                        row_height: parseFloat(e.target.value) || 3
                      })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Rows</Label>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={lineItemsConfig.max_rows}
                      onChange={(e) => setLineItemsConfig({
                        ...lineItemsConfig,
                        max_rows: parseInt(e.target.value) || 10
                      })}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px]">1</span>
              <span>Set paper size (mm)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px]">2</span>
              <span>Click fields to add</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px]">3</span>
              <span>Drag to position</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px]">4</span>
              <span>Click Preview to test</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px]">5</span>
              <span>Save Template</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InvoiceTemplateEditor;
