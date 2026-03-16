import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import {
  Plus,
  Building2,
  Pencil,
  Trash2,
  Check,
  X,
  AlertTriangle,
  Package,
  Image as ImageIcon
} from 'lucide-react';
import axios from 'axios';
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ServiceManagement = () => {
  const { currentOrg } = useAuth();
  
  // Service Items state
  const [serviceItems, setServiceItems] = useState([]);
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [deleteServiceConfirm, setDeleteServiceConfirm] = useState(null);
  const [newService, setNewService] = useState({
    name: '',
    name_ar: '',
    description: '',
    price: 0,
    currency: 'USD',
    unit: 'service',
    is_taxable: true,
    image_url: ''
  });
  const [uploadingServiceImage, setUploadingServiceImage] = useState(false);

  // Fetch service items when org changes
  useEffect(() => {
    if (currentOrg?.id) {
      fetchServiceItems();
    }
  }, [currentOrg?.id]);

  const fetchServiceItems = async () => {
    if (!currentOrg?.id) return;
    try {
      const response = await axios.get(`${API}/service-items?organization_id=${currentOrg.id}`);
      setServiceItems(response.data);
    } catch (error) {
      console.error('Failed to fetch service items:', error);
    }
  };

  const handleCreateService = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newService,
        organization_id: currentOrg.id
      };
      
      if (editingService) {
        await axios.put(`${API}/service-items/${editingService.id}`, newService);
      } else {
        await axios.post(`${API}/service-items`, payload);
      }
      
      setIsServiceDialogOpen(false);
      resetServiceForm();
      fetchServiceItems();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save service item');
    }
  };

  const handleEditService = (service) => {
    setEditingService(service);
    setNewService({
      name: service.name,
      name_ar: service.name_ar || '',
      description: service.description || '',
      price: service.price,
      currency: service.currency || 'USD',
      unit: service.unit || 'service',
      is_taxable: service.is_taxable !== false,
      image_url: service.image_url || ''
    });
    setIsServiceDialogOpen(true);
  };

  const handleDeleteService = async (service) => {
    try {
      await axios.delete(`${API}/service-items/${service.id}`);
      setDeleteServiceConfirm(null);
      fetchServiceItems();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete service item');
    }
  };

  const resetServiceForm = () => {
    setNewService({
      name: '',
      name_ar: '',
      description: '',
      price: 0,
      currency: 'USD',
      unit: 'service',
      is_taxable: true,
      image_url: ''
    });
    setEditingService(null);
  };

  // Upload image for service item
  const handleServiceImageUpload = async (e, serviceId = null) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const targetId = serviceId || editingService?.id;
    if (!targetId) {
      alert('Please save the service first, then upload the image.');
      return;
    }
    
    setUploadingServiceImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('organization_id', currentOrg.id);
      formData.append('service_item_id', targetId);
      
      const response = await axios.post(`${API}/files/service-image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      // Update local state
      if (response.data?.url) {
        setNewService(prev => ({ ...prev, image_url: response.data.url }));
      }
      
      // Refresh service items list
      await fetchServiceItems();
      alert('Image uploaded successfully!');
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert(error.response?.data?.detail || 'Failed to upload image');
    } finally {
      setUploadingServiceImage(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-purple-400" />
              Service Items (Non-Stock)
            </CardTitle>
            <Dialog open={isServiceDialogOpen} onOpenChange={(open) => { setIsServiceDialogOpen(open); if (!open) resetServiceForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={!currentOrg} data-testid="add-service-btn">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Service
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingService ? 'Edit Service Item' : 'Add New Service Item'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateService} className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-sm">Service Name *</Label>
                      <Input
                        placeholder="e.g., Consulting"
                        value={newService.name}
                        onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                        required
                        data-testid="service-name-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Name (Arabic)</Label>
                      <Input
                        placeholder="الاسم بالعربية"
                        value={newService.name_ar}
                        onChange={(e) => setNewService({ ...newService, name_ar: e.target.value })}
                        dir="rtl"
                        data-testid="service-name-ar-input"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Description</Label>
                    <Input
                      placeholder="Service description"
                      value={newService.description}
                      onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                      data-testid="service-description-input"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label className="text-sm">Price *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newService.price}
                        onChange={(e) => setNewService({ ...newService, price: parseFloat(e.target.value) || 0 })}
                        required
                        className="font-mono"
                        data-testid="service-price-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Currency</Label>
                      <Select value={newService.currency} onValueChange={(v) => setNewService({ ...newService, currency: v })}>
                        <SelectTrigger data-testid="service-currency-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="LBP">LBP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Unit</Label>
                      <Select value={newService.unit} onValueChange={(v) => setNewService({ ...newService, unit: v })}>
                        <SelectTrigger data-testid="service-unit-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="service">Service</SelectItem>
                          <SelectItem value="hour">Hour</SelectItem>
                          <SelectItem value="day">Day</SelectItem>
                          <SelectItem value="month">Month</SelectItem>
                          <SelectItem value="project">Project</SelectItem>
                          <SelectItem value="unit">Unit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="service-taxable"
                      checked={newService.is_taxable}
                      onChange={(e) => setNewService({ ...newService, is_taxable: e.target.checked })}
                      className="rounded"
                      data-testid="service-taxable-checkbox"
                    />
                    <Label htmlFor="service-taxable" className="text-sm cursor-pointer">Taxable</Label>
                  </div>
                  
                  {/* Image Upload Section */}
                  {editingService && (
                    <div className="space-y-2 border-t pt-4">
                      <Label className="text-sm flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        Service Image
                      </Label>
                      <div className="flex items-center gap-3">
                        {newService.image_url ? (
                          <div className="relative">
                            <img 
                              src={newService.image_url} 
                              alt={newService.name}
                              className="w-16 h-16 object-cover rounded border"
                            />
                            <button
                              type="button"
                              onClick={() => setNewService({ ...newService, image_url: '' })}
                              className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="w-16 h-16 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground">
                            <ImageIcon className="w-6 h-6" />
                          </div>
                        )}
                        <div className="flex-1">
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleServiceImageUpload(e)}
                            disabled={uploadingServiceImage}
                            className="text-sm"
                            data-testid="service-image-input"
                          />
                          {uploadingServiceImage && <p className="text-xs text-muted-foreground mt-1">Uploading...</p>}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => { setIsServiceDialogOpen(false); resetServiceForm(); }}>
                      Cancel
                    </Button>
                    <Button type="submit" data-testid="save-service-btn">{editingService ? 'Update' : 'Create'}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {!currentOrg ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Please select an organization to manage its service items.</p>
            </div>
          ) : serviceItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No service items yet.</p>
              <p className="text-sm mt-1">Add services that don't require inventory tracking.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="service-items-table">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="p-2 font-medium w-12">Image</th>
                    <th className="p-2 font-medium">Name</th>
                    <th className="p-2 font-medium">Description</th>
                    <th className="p-2 font-medium text-right">Price</th>
                    <th className="p-2 font-medium text-center">Unit</th>
                    <th className="p-2 font-medium text-center">Taxable</th>
                    <th className="p-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {serviceItems.map(service => (
                    <tr key={service.id} className="hover:bg-muted/30" data-testid={`service-row-${service.id}`}>
                      <td className="p-2">
                        {service.image_url ? (
                          <img src={service.image_url} alt={service.name} className="w-10 h-10 object-cover rounded" />
                        ) : (
                          <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="font-medium">{service.name}</div>
                        {service.name_ar && <div className="text-xs text-muted-foreground" dir="rtl">{service.name_ar}</div>}
                      </td>
                      <td className="p-2 text-muted-foreground">{service.description || '-'}</td>
                      <td className="p-2 text-right font-mono">
                        <span className="text-purple-400">{service.currency}</span> {parseFloat(service.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-center">{service.unit}</td>
                      <td className="p-2 text-center">
                        {service.is_taxable ? (
                          <Check className="w-4 h-4 text-green-400 mx-auto" />
                        ) : (
                          <X className="w-4 h-4 text-red-400 mx-auto" />
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEditService(service)} title="Edit" data-testid={`edit-service-${service.id}`}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-400 hover:text-red-300"
                            onClick={() => setDeleteServiceConfirm(service)}
                            title="Delete"
                            data-testid={`delete-service-${service.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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
      
      {/* Delete Service Confirmation Dialog */}
      <Dialog open={!!deleteServiceConfirm} onOpenChange={(open) => !open && setDeleteServiceConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Delete Service Item
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteServiceConfirm?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteServiceConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDeleteService(deleteServiceConfirm)} data-testid="confirm-delete-service-btn">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ServiceManagement;
