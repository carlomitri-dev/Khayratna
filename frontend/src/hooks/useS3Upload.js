/**
 * S3 File Upload Hook for KAIROS
 * Provides functionality for uploading files to AWS S3 through the backend
 */
import { useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Allowed file types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_PDF_TYPES = ['application/pdf'];
const ALLOWED_ALL_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_PDF_TYPES];

const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Hook for handling S3 file uploads
 */
export const useS3Upload = () => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  /**
   * Check if S3 is configured
   */
  const checkS3Config = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/files/config`);
      return response.data;
    } catch (err) {
      console.error('Failed to check S3 config:', err);
      return { s3_enabled: false };
    }
  }, []);

  /**
   * Upload a file directly to S3 through the backend
   * 
   * @param {File} file - The file to upload
   * @param {Object} options - Upload options
   * @param {string} options.organizationId - Organization ID
   * @param {string} options.fileType - Type of file (inventory, logo, invoice, document)
   * @param {string} options.relatedEntityType - Related entity type (optional)
   * @param {string} options.relatedEntityId - Related entity ID (optional)
   * @returns {Promise<Object>} Upload result with file URL
   */
  const uploadFile = useCallback(async (file, options) => {
    const { organizationId, fileType, relatedEntityType, relatedEntityId } = options;

    // Validate file type
    if (!ALLOWED_ALL_TYPES.includes(file.type)) {
      const error = `File type "${file.type}" is not allowed. Allowed types: images (JPEG, PNG, GIF, WebP) and PDF.`;
      setError(error);
      toast.error(error);
      return null;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const error = `File size exceeds maximum of ${MAX_FILE_SIZE_MB}MB`;
      setError(error);
      toast.error(error);
      return null;
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('organization_id', organizationId);
      formData.append('file_type', fileType);
      if (relatedEntityType) formData.append('related_entity_type', relatedEntityType);
      if (relatedEntityId) formData.append('related_entity_id', relatedEntityId);

      const response = await axios.post(`${API}/files/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setProgress(percentCompleted);
        },
      });

      setProgress(100);
      toast.success(`File "${file.name}" uploaded successfully`);
      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Failed to upload file';
      setError(errorMsg);
      toast.error(errorMsg);
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  /**
   * Upload an inventory item image
   */
  const uploadInventoryImage = useCallback(async (file, organizationId, inventoryItemId) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Only image files (JPEG, PNG, GIF, WebP) are allowed for inventory images');
      return null;
    }

    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('organization_id', organizationId);
      formData.append('inventory_item_id', inventoryItemId);

      const response = await axios.post(`${API}/files/inventory-image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setProgress(percentCompleted);
        },
      });

      toast.success('Inventory image uploaded');
      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Failed to upload inventory image';
      toast.error(errorMsg);
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  /**
   * Upload an organization logo
   */
  const uploadOrganizationLogo = useCallback(async (file, organizationId) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Only image files (JPEG, PNG, GIF, WebP) are allowed for logos');
      return null;
    }

    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('organization_id', organizationId);

      const response = await axios.post(`${API}/files/organization-logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setProgress(percentCompleted);
        },
      });

      toast.success('Organization logo uploaded');
      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Failed to upload logo';
      toast.error(errorMsg);
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  /**
   * Upload an invoice attachment
   */
  const uploadInvoiceAttachment = useCallback(async (file, organizationId, invoiceId, invoiceType) => {
    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('organization_id', organizationId);
      formData.append('invoice_id', invoiceId);
      formData.append('invoice_type', invoiceType);

      const response = await axios.post(`${API}/files/invoice-attachment`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setProgress(percentCompleted);
        },
      });

      toast.success('Invoice attachment uploaded');
      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Failed to upload attachment';
      toast.error(errorMsg);
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  /**
   * Delete a file
   */
  const deleteFile = useCallback(async (fileId) => {
    try {
      await axios.delete(`${API}/files/${fileId}`);
      toast.success('File deleted');
      return true;
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Failed to delete file';
      toast.error(errorMsg);
      return false;
    }
  }, []);

  /**
   * Get download URL for a file
   */
  const getDownloadUrl = useCallback(async (fileId) => {
    try {
      const response = await axios.get(`${API}/files/download/${fileId}`);
      return response.data.download_url;
    } catch (err) {
      toast.error('Failed to get download URL');
      return null;
    }
  }, []);

  /**
   * List files for an organization
   */
  const listFiles = useCallback(async (organizationId, options = {}) => {
    try {
      const params = new URLSearchParams({ organization_id: organizationId });
      if (options.fileType) params.append('file_type', options.fileType);
      if (options.relatedEntityType) params.append('related_entity_type', options.relatedEntityType);
      if (options.relatedEntityId) params.append('related_entity_id', options.relatedEntityId);

      const response = await axios.get(`${API}/files/list?${params.toString()}`);
      return response.data;
    } catch (err) {
      console.error('Failed to list files:', err);
      return [];
    }
  }, []);

  return {
    uploading,
    progress,
    error,
    checkS3Config,
    uploadFile,
    uploadInventoryImage,
    uploadOrganizationLogo,
    uploadInvoiceAttachment,
    deleteFile,
    getDownloadUrl,
    listFiles,
    ALLOWED_IMAGE_TYPES,
    ALLOWED_PDF_TYPES,
    ALLOWED_ALL_TYPES,
    MAX_FILE_SIZE_MB,
  };
};

export default useS3Upload;
