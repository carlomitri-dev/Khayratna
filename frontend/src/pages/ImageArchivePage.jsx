import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { DateInput } from '../components/ui/date-input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { 
  Plus, Trash2, Eye, Download, Edit, Image, Calendar, Clock, 
  FileText, Upload, Camera, X, Search, Grid, List, Archive,
  ZoomIn, ZoomOut, RotateCw, Maximize2, Send, CreditCard
} from 'lucide-react';
import axios from 'axios';
import { getTodayForInput, formatUSD, formatDate } from '../lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { SearchableAccountSelector } from '../components/shared';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Image Preview Component - Mobile-friendly with axios for CORS handling
const ImagePreviewDialog = ({ image, open, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageBlobUrl, setImageBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  // Reset state when image changes
  React.useEffect(() => {
    if (image && open) {
      setZoom(1);
      setRotation(0);
      setImageError(false);
      setImageLoaded(false);
      setImageBlobUrl(null);
      setLoading(true);
      
      // Load image as blob for better mobile compatibility
      const isImg = image?.content_type?.startsWith('image/');
      if (isImg) {
        const imgUrl = `${API}/image-archive/file/${encodeURIComponent(image.filename)}`;
        
        // Use axios with responseType blob - handles CORS better on mobile
        const loadImage = async () => {
          try {
            // Primary method: Use axios which handles CORS better
            const response = await axios.get(imgUrl, {
              responseType: 'blob',
              timeout: 30000,
              headers: {
                'Accept': 'image/*',
                'Cache-Control': 'no-cache'
              }
            });
            const blobUrl = URL.createObjectURL(response.data);
            setImageBlobUrl(blobUrl);
            setImageLoaded(true);
            setLoading(false);
          } catch (axiosError) {
            console.log('Axios blob fetch failed, trying direct URL:', axiosError.message);
            // Fallback 1: Try direct URL with img element
            try {
              const img = new window.Image();
              img.crossOrigin = 'anonymous';
              
              const loadPromise = new Promise((resolve, reject) => {
                img.onload = () => resolve(img);
                img.onerror = (e) => reject(e);
                // Add cache-busting parameter
                img.src = `${imgUrl}?t=${Date.now()}`;
              });
              
              const loadedImg = await loadPromise;
              // Try to create blob from canvas
              const canvas = document.createElement('canvas');
              canvas.width = loadedImg.naturalWidth;
              canvas.height = loadedImg.naturalHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(loadedImg, 0, 0);
              
              canvas.toBlob((blob) => {
                if (blob) {
                  const blobUrl = URL.createObjectURL(blob);
                  setImageBlobUrl(blobUrl);
                } else {
                  // If blob creation fails, use direct URL
                  setImageBlobUrl(imgUrl);
                }
                setImageLoaded(true);
                setLoading(false);
              }, image.content_type || 'image/png');
            } catch (imgError) {
              console.log('Canvas fallback failed, using direct URL:', imgError);
              // Final fallback: just use the URL directly
              setImageBlobUrl(imgUrl);
              setImageLoaded(true);
              setLoading(false);
            }
          }
        };
        
        loadImage();
      } else {
        setLoading(false);
      }
    }
    
    // Cleanup blob URL on unmount or when dialog closes
    return () => {
      if (imageBlobUrl && imageBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageBlobUrl);
      }
    };
  }, [image, open]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => { setZoom(1); setRotation(0); };

  const isImage = image?.content_type?.startsWith('image/');
  // Use full URL with cache busting for mobile compatibility
  const imageUrl = image ? `${API}/image-archive/file/${encodeURIComponent(image.filename)}` : '';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl max-h-[95vh] p-0 overflow-hidden">
        {image && (
          <>
            <DialogHeader className="p-4 pb-2 border-b border-border">
              <DialogTitle className="flex items-center justify-between">
                <span className="truncate pr-4">{image.title}</span>
                <div className="flex items-center gap-1">
                  {isImage && !imageError && (
                    <>
                      <Button variant="ghost" size="sm" onClick={handleZoomOut} title="Zoom Out">
                        <ZoomOut className="w-4 h-4" />
                      </Button>
                      <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
                      <Button variant="ghost" size="sm" onClick={handleZoomIn} title="Zoom In">
                        <ZoomIn className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleRotate} title="Rotate">
                        <RotateCw className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleReset} title="Reset">
                        <Maximize2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </DialogTitle>
            </DialogHeader>
            
            <div className="flex-1 overflow-auto bg-black/90 flex items-center justify-center min-h-[60vh] max-h-[75vh]">
              {isImage && !imageError ? (
                <>
                  {!imageBlobUrl && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="spinner" />
                    </div>
                  )}
                  {imageBlobUrl && (
                    <img
                      src={imageBlobUrl}
                      alt={image.title}
                      className={`max-w-full max-h-full object-contain transition-transform duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                      style={{ 
                        transform: `scale(${zoom}) rotate(${rotation}deg)`,
                        cursor: zoom > 1 ? 'move' : 'default'
                      }}
                      onLoad={() => setImageLoaded(true)}
                      onError={() => setImageError(true)}
                    />
                  )}
                </>
              ) : (
                <div className="text-center p-8">
                  <FileText className="w-24 h-24 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">
                    {imageError ? 'Failed to load image' : 'Document Preview'}
                  </p>
                  <a 
                    href={imageUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90"
                  >
                    <Eye className="w-4 h-4" />
                    Open in New Tab
                  </a>
                </div>
              )}
            </div>
            
            <div className="p-3 border-t border-border bg-card flex items-center justify-between text-sm">
              <div className="flex items-center gap-4 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(image.date)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {image.time}
                </span>
              </div>
              <a 
                href={imageUrl}
                download={image.original_filename}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Download className="w-3 h-3" />
                Download
              </a>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const ImageArchivePage = () => {
  const { currentOrg, user, token } = useAuth();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [searchTerm, setSearchTerm] = useState('');
  const [viewImage, setViewImage] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [editImage, setEditImage] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  
  // Transfer to Cr/Db Note state
  const [transferImage, setTransferImage] = useState(null);
  const [transfering, setTransfering] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [transferForm, setTransferForm] = useState({
    note_type: 'debit',
    account_id: '',
    amount_usd: 0,
    amount_lbp: 0,
    reason: '',
    date: getTodayForInput(),
    reference: '',
    delete_from_archive: true
  });
  
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  
  const [newImage, setNewImage] = useState({
    title: '',
    description: '',
    date: getTodayForInput(),
    time: new Date().toTimeString().slice(0, 5),
    file: null
  });

  useEffect(() => {
    if (currentOrg) {
      fetchImages();
      fetchAccounts();
    }
  }, [currentOrg]);
  
  const fetchAccounts = async () => {
    try {
      const response = await axios.get(`${API}/accounts?organization_id=${currentOrg.id}`);
      // Filter to show detail accounts (5+ digit codes)
      const detailAccounts = response.data.filter(a => a.code.length >= 5);
      setAccounts(detailAccounts);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  };

  const fetchImages = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/image-archive?organization_id=${currentOrg.id}`);
      setImages(response.data);
    } catch (error) {
      console.error('Failed to fetch images:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const openTransferDialog = (img) => {
    setTransferImage(img);
    setTransferForm({
      note_type: 'debit',
      debit_account_code: '',
      debit_account_name: '',
      credit_account_code: '',
      credit_account_name: '',
      currency: 'USD',
      amount: 0,
      exchange_rate: currentOrg?.base_exchange_rate || 89500,
      description: img.description || `Document: ${img.title}`,
      date: getTodayForInput(),
      delete_from_archive: true
    });
  };
  
  const handleTransferToCrDb = async () => {
    if (!transferForm.debit_account_code || !transferForm.credit_account_code) {
      alert('Please select both debit and credit accounts');
      return;
    }
    if (!transferForm.amount || parseFloat(transferForm.amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (!transferForm.description) {
      alert('Please enter a description');
      return;
    }
    
    setTransfering(true);
    try {
      const response = await axios.post(
        `${API}/image-archive/${transferImage.id}/transfer-to-crdb`,
        transferForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      alert(`Cr/Db Note ${response.data.note_number} created successfully!`);
      
      // If delete_from_archive is true, remove from local state
      if (transferForm.delete_from_archive) {
        // Delete from archive after transfer
        await axios.delete(`${API}/image-archive/${transferImage.id}/after-crdb-post`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setImages(images.filter(img => img.id !== transferImage.id));
      }
      
      setTransferImage(null);
    } catch (error) {
      console.error('Transfer failed:', error);
      alert(error.response?.data?.detail || 'Failed to transfer image to Cr/Db Note');
    } finally {
      setTransfering(false);
    }
  };

  const handleFileSelect = (file) => {
    if (file) {
      setNewImage({ ...newImage, file });
      setShowUploadForm(true);
    }
  };

  const handleUpload = async () => {
    if (!newImage.file) {
      alert('Please select a file');
      return;
    }
    if (!newImage.title) {
      alert('Please enter a title');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', newImage.file);
      formData.append('title', newImage.title);
      formData.append('description', newImage.description || '');
      formData.append('date', newImage.date);
      formData.append('time', newImage.time);
      formData.append('organization_id', currentOrg.id);

      await axios.post(`${API}/image-archive`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      alert('Image archived successfully!');
      setNewImage({
        title: '',
        description: '',
        date: getTodayForInput(),
        time: new Date().toTimeString().slice(0, 5),
        file: null
      });
      setShowUploadForm(false);
      fetchImages();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editImage) return;
    
    try {
      await axios.put(`${API}/image-archive/${editImage.id}`, {
        title: editImage.title,
        description: editImage.description,
        date: editImage.date,
        time: editImage.time
      });
      
      alert('Image updated successfully!');
      setEditImage(null);
      fetchImages();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to update image');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    
    try {
      await axios.delete(`${API}/image-archive/${deleteConfirm.id}`);
      setDeleteConfirm(null);
      fetchImages();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete image');
    }
  };

  const handleDownload = async (image) => {
    try {
      const response = await axios.get(`${API}/image-archive/download/${image.id}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', image.original_filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to download image');
    }
  };

  const filteredImages = images.filter(img => 
    img.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (img.description && img.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
    img.date.includes(searchTerm)
  );

  const canEdit = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'accountant';
  const canDelete = user?.role === 'super_admin' || user?.role === 'admin';

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6" data-testid="image-archive-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Manual Image Archive
          </h1>
          <p className="text-sm text-muted-foreground">
            Archive and manage daily document images
          </p>
        </div>
        
        {canEdit && (
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
              className="hidden"
            />
            <Button variant="outline" onClick={() => cameraInputRef.current?.click()}>
              <Camera className="w-4 h-4 mr-2" />
              Camera
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} className="btn-glow">
              <Upload className="w-4 h-4 mr-2" />
              Upload Image
            </Button>
          </div>
        )}
      </div>

      {/* Upload Form Dialog */}
      <Dialog open={showUploadForm} onOpenChange={setShowUploadForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="w-5 h-5" />
              Archive New Image
            </DialogTitle>
            <DialogDescription>
              Fill in the details for this document
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {newImage.file && (
              <div className="p-3 bg-muted/30 rounded-sm flex items-center gap-3">
                <Image className="w-8 h-8 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{newImage.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(newImage.file.size)}
                  </p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setNewImage({ ...newImage, file: null })}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                placeholder="Enter document title..."
                value={newImage.title}
                onChange={(e) => setNewImage({ ...newImage, title: e.target.value })}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <DateInput
                  value={newImage.date}
                  onChange={(e) => setNewImage({ ...newImage, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={newImage.time}
                  onChange={(e) => setNewImage({ ...newImage, time: e.target.value })}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Textarea
                placeholder="Add a description..."
                value={newImage.description}
                onChange={(e) => setNewImage({ ...newImage, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Archive Image'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Search and View Toggle */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, description, or date..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1 border border-border rounded-sm p-1">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Images Display */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base lg:text-lg flex items-center gap-2">
            <Archive className="w-5 h-5" />
            Archived Documents ({filteredImages.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="spinner" />
            </div>
          ) : filteredImages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Archive className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No archived images found</p>
              {canEdit && (
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Upload First Image
                </Button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            // Grid View
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredImages.map((img) => (
                <div 
                  key={img.id} 
                  className="group border border-border rounded-sm overflow-hidden bg-muted/10 hover:border-primary/50 transition-colors"
                >
                  {/* Image Preview */}
                  <div 
                    className="aspect-video bg-muted/30 relative cursor-pointer overflow-hidden"
                    onClick={() => setPreviewImage(img)}
                  >
                    {img.content_type.startsWith('image/') ? (
                      <img
                        src={`${API}/image-archive/file/${img.filename}`}
                        alt={img.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileText className="w-12 h-12 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setPreviewImage(img); }} title="Preview">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); handleDownload(img); }} title="Download">
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Info */}
                  <div className="p-3">
                    <h3 className="font-medium text-sm truncate">{img.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(img.date)}
                      <Clock className="w-3 h-3 ml-2" />
                      {img.time}
                    </div>
                    {img.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{img.description}</p>
                    )}
                    
                    {/* Actions */}
                    <div className="flex gap-1 mt-2 pt-2 border-t border-border">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setPreviewImage(img)} title="Preview">
                        <Eye className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setViewImage(img)} title="Details">
                        <FileText className="w-3 h-3" />
                      </Button>
                      {canEdit && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditImage(img)} title="Edit">
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-cyan-400" onClick={() => openTransferDialog(img)} title="Transfer to Cr/Db Note">
                            <Send className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleDownload(img)} title="Download">
                        <Download className="w-3 h-3" />
                      </Button>
                      {canDelete && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400" onClick={() => setDeleteConfirm(img)} title="Delete">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // List View
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Preview</th>
                    <th>Title</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Size</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredImages.map((img) => (
                    <tr key={img.id}>
                      <td>
                        <div 
                          className="w-16 h-12 bg-muted/30 rounded overflow-hidden cursor-pointer"
                          onClick={() => setPreviewImage(img)}
                        >
                          {img.content_type.startsWith('image/') ? (
                            <img
                              src={`${API}/image-archive/file/${img.filename}`}
                              alt={img.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <FileText className="w-6 h-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div>
                          <p className="font-medium">{img.title}</p>
                          {img.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{img.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="text-muted-foreground">{img.date}</td>
                      <td className="text-muted-foreground">{img.time}</td>
                      <td className="text-muted-foreground text-sm">{formatFileSize(img.file_size)}</td>
                      <td>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setPreviewImage(img)} title="Preview">
                            <Eye className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setViewImage(img)} title="Details">
                            <FileText className="w-3 h-3" />
                          </Button>
                          {canEdit && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => setEditImage(img)} title="Edit">
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-cyan-400" onClick={() => openTransferDialog(img)} title="Transfer to Cr/Db Note">
                                <Send className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => handleDownload(img)} title="Download">
                            <Download className="w-3 h-3" />
                          </Button>
                          {canDelete && (
                            <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setDeleteConfirm(img)} title="Delete">
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

      {/* Image Preview Dialog */}
      <ImagePreviewDialog
        image={previewImage}
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
      />

      {/* View Image Dialog */}
      <Dialog open={!!viewImage} onOpenChange={() => setViewImage(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewImage?.title}</DialogTitle>
          </DialogHeader>
          
          {viewImage && (
            <div className="space-y-4">
              {/* Image Display */}
              <div className="bg-muted/30 rounded-sm overflow-hidden">
                {viewImage.content_type.startsWith('image/') ? (
                  <img
                    src={`${API}/image-archive/file/${viewImage.filename}`}
                    alt={viewImage.title}
                    className="w-full max-h-[60vh] object-contain"
                  />
                ) : (
                  <div className="h-64 flex items-center justify-center">
                    <div className="text-center">
                      <FileText className="w-16 h-16 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-muted-foreground">PDF Document</p>
                      <Button 
                        variant="outline" 
                        className="mt-3"
                        onClick={() => handleDownload(viewImage)}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download to View
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Date:</span>
                  <span className="ml-2">{formatDate(viewImage.date)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Time:</span>
                  <span className="ml-2">{viewImage.time}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">File Size:</span>
                  <span className="ml-2">{formatFileSize(viewImage.file_size)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Original Name:</span>
                  <span className="ml-2 truncate">{viewImage.original_filename}</span>
                </div>
              </div>
              
              {viewImage.description && (
                <div>
                  <span className="text-muted-foreground text-sm">Description:</span>
                  <p className="mt-1">{viewImage.description}</p>
                </div>
              )}
              
              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button variant="outline" onClick={() => handleDownload(viewImage)}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
                {canEdit && (
                  <Button variant="outline" onClick={() => { setViewImage(null); setEditImage(viewImage); }}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                )}
                {canDelete && (
                  <Button variant="outline" className="text-red-400" onClick={() => { setViewImage(null); setDeleteConfirm(viewImage); }}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editImage} onOpenChange={() => setEditImage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Image Details</DialogTitle>
          </DialogHeader>
          
          {editImage && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={editImage.title}
                  onChange={(e) => setEditImage({ ...editImage, title: e.target.value })}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <DateInput
                    value={editImage.date}
                    onChange={(e) => setEditImage({ ...editImage, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Input
                    type="time"
                    value={editImage.time}
                    onChange={(e) => setEditImage({ ...editImage, time: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editImage.description || ''}
                  onChange={(e) => setEditImage({ ...editImage, description: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditImage(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Image</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteConfirm?.title}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer to Cr/Db Note Dialog */}
      <Dialog open={!!transferImage} onOpenChange={() => setTransferImage(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Transfer to Cr/Db Note
            </DialogTitle>
            <DialogDescription>
              Create a Credit/Debit Note with this image as attachment
            </DialogDescription>
          </DialogHeader>
          
          {transferImage && (
            <div className="space-y-4">
              {/* Image Preview */}
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                {transferImage.content_type?.startsWith('image/') ? (
                  <img
                    src={`${API}/image-archive/file/${transferImage.filename}`}
                    alt={transferImage.title}
                    className="w-16 h-16 object-cover rounded"
                  />
                ) : (
                  <div className="w-16 h-16 bg-muted flex items-center justify-center rounded">
                    <FileText className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="font-medium">{transferImage.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(transferImage.date)}</p>
                </div>
              </div>
              
              {/* Note Type */}
              <div className="space-y-2">
                <Label>Note Type *</Label>
                <Select 
                  value={transferForm.note_type} 
                  onValueChange={(v) => setTransferForm({ ...transferForm, note_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Debit Note (DN)</SelectItem>
                    <SelectItem value="credit">Credit Note (CN)</SelectItem>
                    <SelectItem value="dbcr">Debit/Credit Note (DBCR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Debit Account */}
              <SearchableAccountSelector
                accounts={accounts}
                value={transferForm.debit_account_code}
                valueName={transferForm.debit_account_name}
                onChange={(code, name) => setTransferForm({ 
                  ...transferForm, 
                  debit_account_code: code,
                  debit_account_name: name
                })}
                label="Dr Debit Account"
                labelColor="text-red-400"
                required
              />
              
              {/* Credit Account */}
              <SearchableAccountSelector
                accounts={accounts}
                value={transferForm.credit_account_code}
                valueName={transferForm.credit_account_name}
                onChange={(code, name) => setTransferForm({ 
                  ...transferForm, 
                  credit_account_code: code,
                  credit_account_name: name
                })}
                label="Cr Credit Account"
                labelColor="text-green-400"
                required
              />
              
              {/* Currency and Amount */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select 
                    value={transferForm.currency} 
                    onValueChange={(v) => setTransferForm({ ...transferForm, currency: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="LBP">LBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={transferForm.amount}
                    onChange={(e) => setTransferForm({ ...transferForm, amount: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Exchange Rate</Label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    value={transferForm.exchange_rate}
                    onChange={(e) => setTransferForm({ ...transferForm, exchange_rate: parseFloat(e.target.value) || 1 })}
                    placeholder="89500"
                  />
                </div>
              </div>
              
              {/* Date */}
              <div className="space-y-2">
                <Label>Date</Label>
                <DateInput
                  value={transferForm.date}
                  onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })}
                />
              </div>
              
              {/* Description */}
              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea
                  value={transferForm.description}
                  onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })}
                  placeholder="Description for the credit/debit note"
                  rows={2}
                />
              </div>
              
              {/* Reference */}
              <div className="space-y-2">
                <Label>Reference</Label>
                <Input
                  value={transferForm.reference}
                  onChange={(e) => setTransferForm({ ...transferForm, reference: e.target.value })}
                  placeholder="Optional reference"
                />
              </div>
              
              {/* Delete from Archive checkbox */}
              <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <input
                  type="checkbox"
                  id="delete-from-archive"
                  checked={transferForm.delete_from_archive}
                  onChange={(e) => setTransferForm({ ...transferForm, delete_from_archive: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="delete-from-archive" className="text-sm">
                  Delete from archive after creating the note
                </label>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferImage(null)} disabled={transfering}>
              Cancel
            </Button>
            <Button onClick={handleTransferToCrDb} disabled={transfering}>
              {transfering ? 'Creating...' : 'Create Cr/Db Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ImageArchivePage;
