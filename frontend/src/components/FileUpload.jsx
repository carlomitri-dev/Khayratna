/**
 * S3 File Upload Component for KAIROS
 * Reusable component for uploading files to AWS S3
 */
import React, { useRef, useState } from 'react';
import { Upload, X, FileImage, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { useS3Upload } from '../hooks/useS3Upload';
import { cn } from '../lib/utils';

/**
 * File Upload Component
 * 
 * @param {Object} props
 * @param {string} props.organizationId - Organization ID (required)
 * @param {string} props.fileType - Type of file: 'inventory', 'logo', 'invoice', 'document' (required)
 * @param {string} props.relatedEntityType - Related entity type (optional)
 * @param {string} props.relatedEntityId - Related entity ID (optional)
 * @param {Function} props.onUploadComplete - Callback when upload completes with file data
 * @param {Function} props.onError - Callback when upload fails
 * @param {string} props.accept - File types to accept (default: images)
 * @param {boolean} props.multiple - Allow multiple file uploads
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.label - Label text
 * @param {React.ReactNode} props.children - Custom trigger element
 */
const FileUpload = ({
  organizationId,
  fileType = 'document',
  relatedEntityType,
  relatedEntityId,
  onUploadComplete,
  onError,
  accept = 'image/*',
  multiple = false,
  className,
  label = 'Upload File',
  children,
  variant = 'default', // 'default', 'dropzone', 'button'
}) => {
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  
  const {
    uploading,
    progress,
    error,
    uploadFile,
    ALLOWED_IMAGE_TYPES,
    ALLOWED_PDF_TYPES,
    MAX_FILE_SIZE_MB,
  } = useS3Upload();

  const handleFileSelect = async (files) => {
    if (!files || files.length === 0) return;
    
    const filesToUpload = multiple ? Array.from(files) : [files[0]];
    
    for (const file of filesToUpload) {
      const result = await uploadFile(file, {
        organizationId,
        fileType,
        relatedEntityType,
        relatedEntityId,
      });
      
      if (result) {
        setUploadedFiles(prev => [...prev, { ...result, name: file.name }]);
        onUploadComplete?.(result);
      } else {
        onError?.(error || 'Upload failed');
      }
    }
  };

  const handleInputChange = (e) => {
    handleFileSelect(e.target.files);
    // Reset input to allow re-uploading the same file
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const removeUploadedFile = (fileId) => {
    setUploadedFiles(prev => prev.filter(f => f.file_id !== fileId));
  };

  const getAcceptTypes = () => {
    if (accept === 'image/*') return ALLOWED_IMAGE_TYPES.join(',');
    if (accept === 'application/pdf') return ALLOWED_PDF_TYPES.join(',');
    return [...ALLOWED_IMAGE_TYPES, ...ALLOWED_PDF_TYPES].join(',');
  };

  const getFileIcon = (contentType) => {
    if (contentType?.startsWith('image/')) {
      return <FileImage className="w-4 h-4" />;
    }
    return <FileText className="w-4 h-4" />;
  };

  // Button variant - simple button trigger
  if (variant === 'button' || children) {
    return (
      <div className={className}>
        <input
          ref={fileInputRef}
          type="file"
          accept={getAcceptTypes()}
          multiple={multiple}
          onChange={handleInputChange}
          className="hidden"
        />
        {children ? (
          <div onClick={() => fileInputRef.current?.click()} className="cursor-pointer">
            {children}
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            {label}
          </Button>
        )}
        {uploading && (
          <Progress value={progress} className="mt-2 h-1" />
        )}
      </div>
    );
  }

  // Dropzone variant - drag and drop area
  return (
    <div className={cn("space-y-3", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept={getAcceptTypes()}
        multiple={multiple}
        onChange={handleInputChange}
        className="hidden"
      />
      
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
          dragOver 
            ? "border-primary bg-primary/5" 
            : "border-border hover:border-primary/50 hover:bg-muted/30",
          uploading && "pointer-events-none opacity-70"
        )}
      >
        {uploading ? (
          <div className="space-y-3">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Uploading... {progress}%</p>
            <Progress value={progress} className="h-2 max-w-xs mx-auto" />
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Drag and drop or click to select
            </p>
            <p className="text-xs text-muted-foreground">
              Max size: {MAX_FILE_SIZE_MB}MB
            </p>
          </>
        )}
      </div>

      {/* Uploaded files list */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Uploaded files:</p>
          {uploadedFiles.map((file) => (
            <div 
              key={file.file_id} 
              className="flex items-center gap-2 p-2 bg-muted/30 rounded text-sm"
            >
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              {getFileIcon(file.content_type)}
              <span className="truncate flex-1">{file.name || file.file_name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  removeUploadedFile(file.file_id);
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  );
};

export default FileUpload;
