import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { DateInput } from '../components/ui/date-input';
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
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { 
  Plus, Trash2, Send, Printer, Search, 
  Camera, Upload, FileText, Image, X, Paperclip, Eye, Download,
  ZoomIn, ZoomOut, RotateCw, Maximize2, ChevronDown, Filter, Pencil, Undo2, Loader2
} from 'lucide-react';
import axios from 'axios';
import { formatLBP, formatUSD, getTodayForInput, formatDateTime, formatDate } from '../lib/utils';
import { printReport } from '../lib/reportUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Attachment Preview Component - Mobile-friendly with axios for CORS handling
const AttachmentPreviewDialog = ({ attachment, open, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageBlobUrl, setImageBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  // Reset state when attachment changes
  React.useEffect(() => {
    if (attachment && open) {
      setZoom(1);
      setRotation(0);
      setImageError(false);
      setImageLoaded(false);
      setImageBlobUrl(null);
      setLoading(true);
      
      // Load image as blob for better mobile compatibility
      const isImg = attachment?.content_type?.startsWith('image/');
      if (isImg) {
        const imgUrl = `${API}/crdb-notes/attachment/${encodeURIComponent(attachment.filename)}`;
        
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
              }, attachment.content_type || 'image/png');
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
  }, [attachment, open]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => { setZoom(1); setRotation(0); };

  const isImage = attachment?.content_type?.startsWith('image/');
  const imageUrl = attachment ? `${API}/crdb-notes/attachment/${encodeURIComponent(attachment.filename)}` : '';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl max-h-[95vh] p-0 overflow-hidden">
        {attachment && (
          <>
            <DialogHeader className="p-4 pb-2 border-b border-border">
              <DialogTitle className="flex items-center justify-between">
                <span className="truncate pr-4">{attachment.original_filename}</span>
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
                      alt={attachment.original_filename}
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
              <span className="text-muted-foreground">
                Uploaded: {formatDateTime(attachment.uploaded_at)}
              </span>
              <a 
                href={imageUrl}
                download={attachment.original_filename}
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

// Use shared remote account selector
import RemoteAccountSelector from '../components/shared/RemoteAccountSelector';

const CrDbNotesPage = () => {
  const { currentOrg, user } = useAuth();
  const { selectedFY } = useFiscalYear();
  const [accounts, setAccounts] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewNote, setViewNote] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [editingNote, setEditingNote] = useState(null);
  const [unpostConfirm, setUnpostConfirm] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const createFileInputRef = useRef(null);

  // Helper function to format API error messages
  const formatErrorMessage = (error, defaultMsg = 'An error occurred') => {
    const detail = error.response?.data?.detail;
    if (!detail) return defaultMsg;
    if (Array.isArray(detail)) {
      return detail.map(e => `${e.loc?.slice(-1)[0] || 'Field'}: ${e.msg}`).join('\n');
    }
    if (typeof detail === 'string') return detail;
    if (typeof detail === 'object') return JSON.stringify(detail);
    return defaultMsg;
  };
  const createCameraInputRef = useRef(null);

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 20;

  const [note, setNote] = useState({
    note_type: 'debit',
    date: getTodayForInput(),
    debit_account_code: '',
    debit_account_name: '',
    debit_account_id: '',
    credit_account_code: '',
    credit_account_name: '',
    credit_account_id: '',
    currency: 'USD',
    amount: '',
    exchange_rate: currentOrg?.base_exchange_rate || 89500,
    description: ''
  });

  useEffect(() => {
    if (currentOrg) {
      fetchData();
    }
  }, [currentOrg]);

  // Refetch notes when search/filter changes
  useEffect(() => {
    if (currentOrg) {
      setCurrentPage(0);
      fetchNotes(true);
    }
  }, [searchTerm, filterType, filterStatus]);

  const fetchData = async () => {
    setLoading(true);
    try {
      setCurrencies([
        { code: 'USD', name: 'US Dollar', symbol: '$' },
        { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل' }
      ]);
      await fetchNotes(true);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (!error.response && error.message === 'Network Error') {
        alert('Connection Error: Unable to connect to the server. Please check your internet connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchNotes = async (reset = false) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    
    try {
      const params = new URLSearchParams({
        organization_id: currentOrg.id,
        skip: reset ? 0 : currentPage * PAGE_SIZE,
        limit: PAGE_SIZE
      });
      
      if (searchTerm) params.append('search', searchTerm);
      if (filterType !== 'all') params.append('note_type', filterType);
      if (filterStatus !== 'all') params.append('status', filterStatus);
      
      const [notesRes, countRes] = await Promise.all([
        axios.get(`${API}/crdb-notes?${params.toString()}`),
        axios.get(`${API}/crdb-notes/count?${params.toString()}`)
      ]);
      
      if (reset) {
        setNotes(notesRes.data);
        setCurrentPage(1);
      } else {
        setNotes(prev => [...prev, ...notesRes.data]);
        setCurrentPage(prev => prev + 1);
      }
      setTotalCount(countRes.data.count);
    } catch (error) {
      console.error('Failed to fetch notes:', error);
      if (!error.response && error.message === 'Network Error') {
        alert('Connection Error: Unable to connect to the server. Please check your internet connection.');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    fetchNotes(false);
  };

  const hasMore = notes.length < totalCount;

  const handleSave = async () => {
    if (!note.debit_account_code || !note.credit_account_code) {
      alert('Please select both debit and credit accounts');
      return;
    }
    if (!note.amount || parseFloat(note.amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (!note.description) {
      alert('Please enter a description');
      return;
    }

    setSaving(true);
    try {
      let noteId;
      if (editingNote) {
        // Update existing note - send account IDs (with codes as fallback)
        const updatePayload = {
          note_type: note.note_type,
          date: note.date,
          description: note.description,
          currency: note.currency,
          amount: parseFloat(note.amount),
          exchange_rate: parseFloat(note.exchange_rate) || 1,
          organization_id: currentOrg.id,
          debit_account_id: note.debit_account_id || null,
          debit_account_code: note.debit_account_code,
          credit_account_id: note.credit_account_id || null,
          credit_account_code: note.credit_account_code
        };
        await axios.put(`${API}/crdb-notes/${editingNote.id}`, updatePayload);
        noteId = editingNote.id;
        alert('Note updated successfully!');
      } else {
        // Create new note - send account codes and names
        const createPayload = {
          note_type: note.note_type,
          date: note.date,
          description: note.description,
          currency: note.currency,
          amount: parseFloat(note.amount),
          exchange_rate: parseFloat(note.exchange_rate) || 1,
          organization_id: currentOrg.id,
          debit_account_code: note.debit_account_code,
          debit_account_name: note.debit_account_name,
          credit_account_code: note.credit_account_code,
          credit_account_name: note.credit_account_name
        };
        const response = await axios.post(`${API}/crdb-notes`, createPayload);
        noteId = response.data.id;
        
        // If there's a pending attachment, upload it
        if (pendingAttachment) {
          const formData = new FormData();
          formData.append('file', pendingAttachment);
          await axios.post(
            `${API}/crdb-notes/${noteId}/attachment`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
          );
        }
        
        alert('Note saved successfully!' + (pendingAttachment ? ' Attachment uploaded.' : ''));
      }
      
      fetchData();
      resetForm();
    } catch (error) {
      alert(formatErrorMessage(error, 'Failed to save note'));
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async (noteId) => {
    try {
      const response = await axios.post(`${API}/crdb-notes/${noteId}/post`);
      alert(`Note posted! Voucher: ${response.data.voucher_number}`);
      fetchData();
    } catch (error) {
      alert(formatErrorMessage(error, 'Failed to post note'));
    }
  };

  const handleUnpost = async (noteId) => {
    try {
      await axios.post(`${API}/crdb-notes/${noteId}/unpost`);
      alert('Note unposted successfully');
      setUnpostConfirm(null);
      setViewNote(null);
      fetchData();
    } catch (error) {
      alert(formatErrorMessage(error, 'Failed to unpost note'));
    }
  };

  const handleEdit = (noteToEdit) => {
    setEditingNote(noteToEdit);
    setNote({
      note_type: noteToEdit.note_type,
      date: noteToEdit.date,
      debit_account_code: noteToEdit.debit_account_code,
      debit_account_name: noteToEdit.debit_account_name,
      debit_account_id: noteToEdit.debit_account_id || '',
      credit_account_code: noteToEdit.credit_account_code,
      credit_account_name: noteToEdit.credit_account_name,
      credit_account_id: noteToEdit.credit_account_id || '',
      currency: noteToEdit.currency,
      amount: noteToEdit.amount,
      exchange_rate: noteToEdit.exchange_rate,
      description: noteToEdit.description
    });
    setViewNote(null);
  };

  const resetForm = () => {
    setEditingNote(null);
    setNote({
      note_type: 'debit',
      date: getTodayForInput(),
      debit_account_code: '',
      debit_account_name: '',
      debit_account_id: '',
      credit_account_code: '',
      credit_account_name: '',
      credit_account_id: '',
      currency: 'USD',
      amount: '',
      exchange_rate: currentOrg?.base_exchange_rate || 89500,
      description: ''
    });
    setPendingAttachment(null);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await axios.delete(`${API}/crdb-notes/${deleteConfirm.id}`);
      setDeleteConfirm(null);
      fetchData();
    } catch (error) {
      alert(formatErrorMessage(error, 'Failed to delete note'));
    }
  };

  const handleFileUpload = async (noteId, file) => {
    if (!file) return;
    
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      await axios.post(
        `${API}/crdb-notes/${noteId}/attachment`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      fetchData();
      if (viewNote) {
        const response = await axios.get(`${API}/crdb-notes?organization_id=${currentOrg.id}`);
        const updated = response.data.find(n => n.id === viewNote.id);
        if (updated) setViewNote(updated);
      }
    } catch (error) {
      alert(formatErrorMessage(error, 'Failed to upload file'));
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteAttachment = async (noteId, attachmentId) => {
    try {
      await axios.delete(`${API}/crdb-notes/${noteId}/attachment/${attachmentId}`);
      fetchData();
      if (viewNote) {
        const response = await axios.get(`${API}/crdb-notes?organization_id=${currentOrg.id}`);
        const updated = response.data.find(n => n.id === viewNote.id);
        if (updated) setViewNote(updated);
      }
    } catch (error) {
      alert(formatErrorMessage(error, 'Failed to delete attachment'));
    }
  };

  const handlePrint = (noteData) => {
    // Get note type display name
    const getNoteTypeName = (type) => {
      if (type === 'credit') return 'CREDIT NOTE';
      if (type === 'dbcr') return 'DB/CR NOTE';
      return 'DEBIT NOTE';
    };
    const getNoteTypeColor = (type) => {
      if (type === 'credit') return '#33a550';
      if (type === 'dbcr') return '#4285f4';
      return '#e65540';
    };
    
    // Create printable content
    const printContent = `
      <html>
        <head>
          <title>${getNoteTypeName(noteData.note_type)} - ${noteData.note_number}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #4285f4; }
            .note-type { font-size: 20px; margin-top: 10px; color: ${getNoteTypeColor(noteData.note_type)}; }
            .details { margin: 20px 0; }
            .row { display: flex; margin: 10px 0; }
            .label { width: 150px; font-weight: bold; }
            .value { flex: 1; }
            .amount { font-size: 24px; font-weight: bold; margin: 20px 0; text-align: center; }
            .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px; }
            .signature { margin-top: 60px; display: flex; justify-content: space-between; }
            .signature div { text-align: center; width: 200px; border-top: 1px solid #333; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">KAIROS</div>
            <div class="note-type">${getNoteTypeName(noteData.note_type)}</div>
            <div>${noteData.note_number}</div>
          </div>
          <div class="details">
            <div class="row"><span class="label">Date:</span><span class="value">${(() => { const d = new Date(noteData.date); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; })()}</span></div>
            <div class="row"><span class="label">Debit Account:</span><span class="value">${noteData.debit_account_code} - ${noteData.debit_account_name}</span></div>
            <div class="row"><span class="label">Credit Account:</span><span class="value">${noteData.credit_account_code} - ${noteData.credit_account_name}</span></div>
            <div class="row"><span class="label">Description:</span><span class="value">${noteData.description}</span></div>
          </div>
          <div class="amount">
            ${noteData.currency} ${noteData.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
            <br/>
            <small style="font-size: 14px; color: #666;">
              (USD ${noteData.amount_usd.toLocaleString(undefined, {minimumFractionDigits: 2})} / LBP ${noteData.amount_lbp.toLocaleString()})
            </small>
          </div>
          <div class="footer">
            <div class="row"><span class="label">Status:</span><span class="value">${noteData.is_posted ? 'Posted' : 'Draft'}</span></div>
            ${noteData.voucher_id ? `<div class="row"><span class="label">Voucher:</span><span class="value">${noteData.voucher_id}</span></div>` : ''}
          </div>
          <div class="signature">
            <div>Prepared By</div>
            <div>Approved By</div>
            <div>Received By</div>
          </div>
        </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  const canEdit = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'accountant';

  // Helper functions for note type display
  const getNoteTypeLabel = (type) => {
    if (type === 'credit') return 'CN';
    if (type === 'dbcr') return 'DC';
    return 'DN';
  };
  const getNoteTypeColor = (type) => {
    if (type === 'credit') return 'bg-green-500/20 text-green-400';
    if (type === 'dbcr') return 'bg-blue-500/20 text-blue-400';
    return 'bg-red-500/20 text-red-400';
  };
  const getNoteTypeName = (type) => {
    if (type === 'credit') return 'Credit Note';
    if (type === 'dbcr') return 'DB/CR Note';
    return 'Debit Note';
  };

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6" data-testid="crdb-notes-page">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Credit / Debit Notes
        </h1>
        <p className="text-muted-foreground text-xs lg:text-sm mt-1">
          Create quick credit or debit notes with attachments
        </p>
      </div>

      {/* New Note Form */}
      {canEdit && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base lg:text-lg" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {editingNote ? (
                  <>
                    <Pencil className="w-5 h-5 inline mr-2" />
                    Edit Note: {editingNote.note_number}
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5 inline mr-2" />
                    New Note
                  </>
                )}
              </CardTitle>
              {editingNote && (
                <Button variant="ghost" size="sm" onClick={resetForm}>
                  <X className="w-4 h-4 mr-1" /> Cancel Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Note Type */}
              <div className="space-y-2">
                <Label className="text-xs lg:text-sm">Note Type</Label>
                <Select value={note.note_type} onValueChange={(value) => setNote({ ...note, note_type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">
                      <span className="text-red-400">Debit Note (DN)</span>
                    </SelectItem>
                    <SelectItem value="credit">
                      <span className="text-green-400">Credit Note (CN)</span>
                    </SelectItem>
                    <SelectItem value="dbcr">
                      <span className="text-blue-400">DB/CR Note</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date */}
              <div className="space-y-2">
                <Label className="text-xs lg:text-sm">Date *</Label>
                <DateInput
                  value={note.date}
                  onChange={(e) => setNote({ ...note, date: e.target.value })}
                  required
                />
              </div>

              {/* Currency */}
              <div className="space-y-2">
                <Label className="text-xs lg:text-sm">Currency</Label>
                <Select value={note.currency} onValueChange={(value) => setNote({ ...note, currency: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map(curr => (
                      <SelectItem key={curr.code} value={curr.code}>
                        {curr.code} - {curr.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Exchange Rate */}
              <div className="space-y-2">
                <Label className="text-xs lg:text-sm">Exchange Rate (LBP)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="89500"
                  value={note.exchange_rate}
                  onChange={(e) => setNote({ ...note, exchange_rate: parseFloat(e.target.value) || 1 })}
                  className="font-mono"
                  data-testid="exchange-rate-input"
                />
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label className="text-xs lg:text-sm">Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={note.amount}
                  onChange={(e) => setNote({ ...note, amount: e.target.value })}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Debit Account */}
              <RemoteAccountSelector
                organizationId={currentOrg?.id}
                fyId={selectedFY?.id}
                value={note.debit_account_code}
                onChange={(code, name, id) => setNote({ ...note, debit_account_code: code, debit_account_name: name, debit_account_id: id })}
                placeholder="Select debit account..."
                label="Debit Account"
              />

              {/* Credit Account */}
              <RemoteAccountSelector
                organizationId={currentOrg?.id}
                fyId={selectedFY?.id}
                value={note.credit_account_code}
                onChange={(code, name, id) => setNote({ ...note, credit_account_code: code, credit_account_name: name, credit_account_id: id })}
                placeholder="Select credit account..."
                label="Credit Account"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-xs lg:text-sm">Description</Label>
              <Input
                placeholder="Enter description..."
                value={note.description}
                onChange={(e) => setNote({ ...note, description: e.target.value })}
              />
            </div>

            {/* Attachment Section */}
            <div className="space-y-2 p-3 border border-border rounded-sm bg-muted/20">
              <Label className="text-xs lg:text-sm flex items-center gap-2">
                <Paperclip className="w-4 h-4" />
                Attachment (Optional)
              </Label>
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  ref={createFileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={(e) => setPendingAttachment(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <input
                  ref={createCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setPendingAttachment(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <Button 
                  type="button"
                  variant="outline" 
                  size="sm" 
                  onClick={() => createCameraInputRef.current?.click()}
                >
                  <Camera className="w-4 h-4 mr-1" />
                  Camera
                </Button>
                <Button 
                  type="button"
                  variant="outline" 
                  size="sm" 
                  onClick={() => createFileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-1" />
                  Upload File
                </Button>
                {pendingAttachment && (
                  <div className="flex items-center gap-2 px-2 py-1 bg-primary/10 rounded text-sm">
                    <Image className="w-4 h-4" />
                    <span className="max-w-[150px] truncate">{pendingAttachment.name}</span>
                    <button 
                      type="button"
                      onClick={() => setPendingAttachment(null)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="btn-glow">
                <FileText className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : editingNote ? 'Update Note' : 'Save Note'}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                {editingNote ? 'Cancel' : 'Clear'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base lg:text-lg" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Notes ({totalCount})
            </CardTitle>
            
            {/* Search and Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search note #, desc, account..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="debit">Debit (DN)</SelectItem>
                  <SelectItem value="credit">Credit (CN)</SelectItem>
                  <SelectItem value="dbcr">DB/CR</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="posted">Posted</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><div className="spinner" /></div>
          ) : notes.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {searchTerm || filterType !== 'all' || filterStatus !== 'all' 
                ? 'No notes match your search' 
                : 'No notes found'}
            </p>
          ) : (
            <>
              {/* Mobile view */}
              <div className="lg:hidden space-y-3">
                {notes.map((n) => (
                  <div key={n.id} className="p-3 bg-muted/20 rounded-sm border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getNoteTypeColor(n.note_type)}`}>
                        {n.note_number}
                      </span>
                      <span className={n.is_posted ? 'status-posted' : 'status-draft'}>
                        {n.is_posted ? 'Posted' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(n.date)}</p>
                    <p className="text-sm truncate mt-1">{n.description}</p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                      <span className="font-mono font-bold">
                        {n.currency} {n.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setViewNote(n)}>
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handlePrint(n)}>
                          <Printer className="w-3 h-3" />
                        </Button>
                        {!n.is_posted && canEdit && (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleEdit(n)}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handlePost(n.id)}>
                              <Send className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400" onClick={() => setDeleteConfirm(n)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                        {n.is_posted && user?.role === 'super_admin' && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-amber-400" onClick={() => setUnpostConfirm(n)}>
                            <Undo2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {n.attachments?.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <Paperclip className="w-3 h-3" />
                        {n.attachments.length} attachment(s)
                      </div>
                    )}
                  </div>
                ))}
                
                {/* Load More Button - Mobile */}
                {hasMore && (
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <><div className="spinner-sm mr-2" /> Loading...</>
                    ) : (
                      <><ChevronDown className="w-4 h-4 mr-2" /> Load More ({notes.length} of {totalCount})</>
                    )}
                  </Button>
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Note #</th>
                      <th>Type</th>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Debit Account</th>
                      <th>Credit Account</th>
                      <th className="text-right">Amount</th>
                      <th className="text-right">Rate</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notes.map((n) => (
                      <tr key={n.id}>
                        <td className="font-mono text-sm">{n.note_number}</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded text-xs ${getNoteTypeColor(n.note_type)}`}>
                            {getNoteTypeLabel(n.note_type)}
                          </span>
                        </td>
                        <td className="text-muted-foreground">{formatDate(n.date)}</td>
                        <td className="max-w-[200px] truncate">{n.description}</td>
                        <td className="font-mono text-xs">{n.debit_account_code}</td>
                        <td className="font-mono text-xs">{n.credit_account_code}</td>
                        <td className="text-right font-mono">
                          {n.currency} {n.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </td>
                        <td className="text-right font-mono text-xs text-muted-foreground">
                          {n.exchange_rate ? n.exchange_rate.toLocaleString() : '-'}
                        </td>
                        <td>
                          <span className={n.is_posted ? 'status-posted' : 'status-draft'}>
                            {n.is_posted ? 'Posted' : 'Draft'}
                          </span>
                          {n.attachments?.length > 0 && (
                            <Paperclip className="w-3 h-3 inline ml-1 text-muted-foreground" />
                          )}
                        </td>
                        <td>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setViewNote(n)} title="View">
                              <Eye className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handlePrint(n)} title="Print">
                              <Printer className="w-3 h-3" />
                            </Button>
                            {!n.is_posted && canEdit && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => handleEdit(n)} title="Edit">
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handlePost(n.id)} title="Post">
                                  <Send className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setDeleteConfirm(n)} title="Delete">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                            {n.is_posted && user?.role === 'super_admin' && (
                              <Button variant="ghost" size="sm" className="text-amber-400" onClick={() => setUnpostConfirm(n)} title="Unpost">
                                <Undo2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* Load More Button - Desktop */}
                {hasMore && (
                  <div className="mt-4 text-center">
                    <Button 
                      variant="outline" 
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <><div className="spinner-sm mr-2" /> Loading...</>
                      ) : (
                        <><ChevronDown className="w-4 h-4 mr-2" /> Load More ({notes.length} of {totalCount})</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* View Note Dialog */}
      <Dialog open={!!viewNote} onOpenChange={() => setViewNote(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={viewNote?.note_type === 'credit' ? 'text-green-400' : viewNote?.note_type === 'dbcr' ? 'text-blue-400' : 'text-red-400'}>
                {getNoteTypeName(viewNote?.note_type)}
              </span>
              <span className="font-mono">{viewNote?.note_number}</span>
            </DialogTitle>
          </DialogHeader>
          
          {viewNote && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Date:</span>
                  <span className="ml-2">{formatDate(viewNote.date)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <span className={`ml-2 ${viewNote.is_posted ? 'text-green-400' : 'text-amber-400'}`}>
                    {viewNote.is_posted ? 'Posted' : 'Draft'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Debit:</span>
                  <span className="ml-2 font-mono">{viewNote.debit_account_code} - {viewNote.debit_account_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Credit:</span>
                  <span className="ml-2 font-mono">{viewNote.credit_account_code} - {viewNote.credit_account_name}</span>
                </div>
              </div>
              
              <div className="p-4 bg-muted/30 rounded-sm text-center">
                <p className="text-2xl font-bold font-mono">
                  {viewNote.currency} {viewNote.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  USD {formatUSD(viewNote.amount_usd)} / LBP {formatLBP(viewNote.amount_lbp)}
                </p>
              </div>
              
              <div>
                <span className="text-muted-foreground text-sm">Description:</span>
                <p className="mt-1">{viewNote.description}</p>
              </div>
              
              {/* Attachments Section */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    Attachments ({viewNote.attachments?.length || 0})
                  </h4>
                  {!viewNote.is_posted && canEdit && (
                    <div className="flex gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.pdf,.doc,.docx"
                        onChange={(e) => handleFileUpload(viewNote.id, e.target.files?.[0])}
                        className="hidden"
                        id="file-upload"
                      />
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleFileUpload(viewNote.id, e.target.files?.[0])}
                        className="hidden"
                        id="camera-upload"
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={uploadingFile}
                      >
                        <Camera className="w-4 h-4 mr-1" />
                        Camera
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingFile}
                      >
                        <Upload className="w-4 h-4 mr-1" />
                        Upload
                      </Button>
                    </div>
                  )}
                </div>
                
                {viewNote.attachments?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No attachments</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {viewNote.attachments?.map((att) => (
                      <div key={att.id} className="relative group p-2 bg-muted/30 rounded-sm cursor-pointer" onClick={() => setPreviewAttachment(att)}>
                        {att.content_type?.startsWith('image/') ? (
                          <img 
                            src={`${API}/crdb-notes/attachment/${att.filename}`}
                            alt={att.original_name}
                            className="w-full h-24 object-cover rounded"
                          />
                        ) : (
                          <div className="w-full h-24 flex items-center justify-center bg-muted rounded">
                            <FileText className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                        <p className="text-xs truncate mt-1">{att.original_name}</p>
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setPreviewAttachment(att); }}
                            className="p-1 bg-background/80 rounded"
                            title="Preview"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                          <a 
                            href={`${API}/crdb-notes/attachment/${att.filename}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 bg-background/80 rounded"
                            onClick={(e) => e.stopPropagation()}
                            title="Download"
                          >
                            <Download className="w-3 h-3" />
                          </a>
                          {!viewNote.is_posted && canEdit && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeleteAttachment(viewNote.id, att.id); }}
                              className="p-1 bg-red-500/80 rounded"
                              title="Delete"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => handlePrint(viewNote)}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
            {!viewNote?.is_posted && canEdit && (
              <>
                <Button variant="outline" onClick={() => handleEdit(viewNote)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Button onClick={() => { handlePost(viewNote.id); setViewNote(null); }}>
                  <Send className="w-4 h-4 mr-2" />
                  Post
                </Button>
              </>
            )}
            {viewNote?.is_posted && user?.role === 'super_admin' && (
              <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => { setUnpostConfirm(viewNote); setViewNote(null); }}>
                <Undo2 className="w-4 h-4 mr-2" />
                Unpost
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Note</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.note_number}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unpost Confirmation */}
      <Dialog open={!!unpostConfirm} onOpenChange={() => setUnpostConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <Undo2 className="w-5 h-5" />
              Unpost Note
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to unpost <strong>{unpostConfirm?.note_number}</strong>?
              This will reverse the account balance changes and delete the associated voucher.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnpostConfirm(null)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => handleUnpost(unpostConfirm.id)}>Unpost</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attachment Preview Dialog */}
      <AttachmentPreviewDialog
        attachment={previewAttachment}
        open={!!previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </div>
  );
};

export default CrDbNotesPage;
