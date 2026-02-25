import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { useSync } from '../context/SyncContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import OfflineBanner from '../components/OfflineBanner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { 
  Truck, Search, Edit, Eye, Phone, MapPin, User, Mail, FileText,
  DollarSign, Building, List, WifiOff
} from 'lucide-react';
import axios from 'axios';
import { formatLBP, formatUSD } from '../lib/utils';
import LedgerDialog from '../components/LedgerDialog';
import db from '../lib/db';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SuppliersPage = () => {
  const { currentOrg, user } = useAuth();
  const { selectedFY } = useFiscalYear();
  const { isOnline } = useSync();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewSupplier, setViewSupplier] = useState(null);
  const [editSupplier, setEditSupplier] = useState(null);
  const [ledgerAccount, setLedgerAccount] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    if (currentOrg) {
      setCurrentPage(0);
      fetchSuppliers(true);
    }
  }, [currentOrg, isOnline, selectedFY, searchTerm]);

  const fetchSuppliers = async (reset = false) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      if (isOnline) {
        const params = new URLSearchParams({ 
          organization_id: currentOrg.id,
          skip: reset ? 0 : currentPage * PAGE_SIZE,
          limit: PAGE_SIZE
        });
        if (selectedFY?.id) params.append('fy_id', selectedFY.id);
        if (searchTerm) params.append('search', searchTerm);
        
        const [dataRes, countRes] = await Promise.all([
          axios.get(`${API}/suppliers?${params.toString()}`),
          axios.get(`${API}/suppliers/count?organization_id=${currentOrg.id}${searchTerm ? '&search=' + searchTerm : ''}`)
        ]);
        
        if (reset) {
          setSuppliers(dataRes.data);
          setCurrentPage(1);
        } else {
          setSuppliers(prev => [...prev, ...dataRes.data]);
          setCurrentPage(prev => prev + 1);
        }
        setTotalCount(countRes.data.count);
        
        // Cache in IndexedDB
        try {
          const suppliersToCache = response.data.map(s => ({ ...s, organization_id: currentOrg.id }));
          await db.suppliers.where('organization_id').equals(currentOrg.id).delete();
          if (suppliersToCache.length > 0) {
            await db.suppliers.bulkPut(suppliersToCache);
          }
        } catch (cacheError) {
          console.warn('[Suppliers] Error caching:', cacheError);
        }
      } else {
        // Load from IndexedDB when offline
        console.log('[Suppliers] Offline mode - loading from cache');
        const cachedSuppliers = await db.suppliers.where('organization_id').equals(currentOrg.id).toArray();
        setSuppliers(cachedSuppliers);
      }
    } catch (error) {
      console.error('Failed to fetch suppliers:', error);
      // Fallback to cache
      try {
        const cachedSuppliers = await db.suppliers.where('organization_id').equals(currentOrg.id).toArray();
        if (cachedSuppliers.length > 0) {
          setSuppliers(cachedSuppliers);
        }
      } catch (cacheError) {
        console.error('[Suppliers] Cache fallback failed:', cacheError);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => fetchSuppliers(false);
  const hasMore = suppliers.length < totalCount;

  const handleUpdateContact = async () => {
    if (!editSupplier) return;
    
    try {
      await axios.put(`${API}/accounts/${editSupplier.id}/contact-info`, {
        mobile: editSupplier.mobile || '',
        address: editSupplier.address || '',
        contact_person: editSupplier.contact_person || '',
        email: editSupplier.email || '',
        notes: editSupplier.notes || ''
      });
      
      alert('Supplier information updated successfully!');
      setEditSupplier(null);
      fetchSuppliers(true);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to update supplier');
    }
  };

  const filteredSuppliers = suppliers;

  const canEdit = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'accountant';

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6" data-testid="suppliers-page">
      {/* Offline Banner */}
      <OfflineBanner />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Suppliers File
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage supplier accounts and contact information (Account codes starting with 40)
          </p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="py-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by code, name, contact person, or mobile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Suppliers List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base lg:text-lg flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Suppliers ({totalCount})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="spinner" />
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No suppliers found</p>
              <p className="text-xs mt-2">Add supplier accounts in Chart of Accounts with codes starting with "40" and more than 4 digits</p>
            </div>
          ) : (
            <>
              {/* Mobile View */}
              <div className="lg:hidden space-y-3">
                {filteredSuppliers.map((supplier) => (
                  <div key={supplier.id} className="p-3 bg-muted/20 rounded-sm border border-border">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-xs text-amber-400">{supplier.code}</span>
                        <h3 className="font-medium">{supplier.name}</h3>
                        {supplier.name_ar && (
                          <p className="text-xs text-muted-foreground">{supplier.name_ar}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setViewSupplier(supplier)} title="View">
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setLedgerAccount(supplier)} title="Ledger">
                          <List className="w-3 h-3" />
                        </Button>
                        {canEdit && (
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditSupplier(supplier)} title="Edit">
                            <Edit className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-2 pt-2 border-t border-border/50 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Balance USD:</span>
                        <span className="ml-1 font-mono">${formatUSD(supplier.balance_usd)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Balance LBP:</span>
                        <span className="ml-1 font-mono">{formatLBP(supplier.balance_lbp)}</span>
                      </div>
                    </div>
                    
                    {(supplier.mobile || supplier.contact_person) && (
                      <div className="mt-2 pt-2 border-t border-border/50 flex gap-3 text-xs text-muted-foreground">
                        {supplier.contact_person && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {supplier.contact_person}
                          </span>
                        )}
                        {supplier.mobile && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {supplier.mobile}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Contact Person</th>
                      <th>Mobile</th>
                      <th>Email</th>
                      <th className="text-right">Balance USD</th>
                      <th className="text-right">Balance LBP</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSuppliers.map((supplier) => (
                      <tr key={supplier.id}>
                        <td className="font-mono text-sm text-amber-400">{supplier.code}</td>
                        <td>
                          <div>
                            <p className="font-medium">{supplier.name}</p>
                            {supplier.name_ar && (
                              <p className="text-xs text-muted-foreground">{supplier.name_ar}</p>
                            )}
                          </div>
                        </td>
                        <td className="text-muted-foreground">{supplier.contact_person || '-'}</td>
                        <td className="text-muted-foreground">{supplier.mobile || '-'}</td>
                        <td className="text-muted-foreground text-sm">{supplier.email || '-'}</td>
                        <td className="text-right font-mono">${formatUSD(supplier.balance_usd)}</td>
                        <td className="text-right font-mono">{formatLBP(supplier.balance_lbp)}</td>
                        <td>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setViewSupplier(supplier)} title="View">
                              <Eye className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setLedgerAccount(supplier)} title="Ledger">
                              <List className="w-3 h-3" />
                            </Button>
                            {canEdit && (
                              <Button variant="ghost" size="sm" onClick={() => setEditSupplier(supplier)} title="Edit">
                                <Edit className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {hasMore && (
                <div className="text-center py-4">
                  <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                    {loadingMore ? 'Loading...' : `Load More (${suppliers.length} of ${totalCount})`}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Ledger Dialog */}
      <LedgerDialog
        account={ledgerAccount}
        organizationId={currentOrg?.id}
        open={!!ledgerAccount}
        onClose={() => setLedgerAccount(null)}
        userRole={user?.role}
      />

      {/* View Supplier Dialog */}
      <Dialog open={!!viewSupplier} onOpenChange={() => setViewSupplier(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Supplier Details
            </DialogTitle>
          </DialogHeader>
          
          {viewSupplier && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/30 rounded-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/20 rounded">
                    <Building className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <p className="font-mono text-sm text-amber-400">{viewSupplier.code}</p>
                    <h3 className="font-bold text-lg">{viewSupplier.name}</h3>
                    {viewSupplier.name_ar && (
                      <p className="text-muted-foreground">{viewSupplier.name_ar}</p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-red-500/10 rounded-sm">
                  <p className="text-xs text-muted-foreground">Balance USD (Payable)</p>
                  <p className="text-xl font-bold font-mono text-red-400">${formatUSD(viewSupplier.balance_usd)}</p>
                </div>
                <div className="p-3 bg-orange-500/10 rounded-sm">
                  <p className="text-xs text-muted-foreground">Balance LBP (Payable)</p>
                  <p className="text-xl font-bold font-mono text-orange-400">{formatLBP(viewSupplier.balance_lbp)}</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-medium text-sm border-b border-border pb-2">Contact Information</h4>
                
                <div className="grid gap-3">
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{viewSupplier.contact_person || 'Not specified'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{viewSupplier.mobile || 'Not specified'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{viewSupplier.email || 'Not specified'}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <span className="text-sm">{viewSupplier.address || 'Not specified'}</span>
                  </div>
                </div>
                
                {viewSupplier.notes && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-start gap-3">
                      <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Notes</p>
                        <p className="text-sm">{viewSupplier.notes}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {canEdit && (
                <DialogFooter>
                  <Button onClick={() => { setViewSupplier(null); setEditSupplier(viewSupplier); }}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Contact Info
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Supplier Dialog */}
      <Dialog open={!!editSupplier} onOpenChange={() => setEditSupplier(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Supplier Contact Info</DialogTitle>
            <DialogDescription>
              Update contact information for {editSupplier?.name}
            </DialogDescription>
          </DialogHeader>
          
          {editSupplier && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-sm">
                <p className="font-mono text-sm text-amber-400">{editSupplier.code}</p>
                <p className="font-medium">{editSupplier.name}</p>
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Contact Person
                </Label>
                <Input
                  placeholder="Enter contact person name..."
                  value={editSupplier.contact_person || ''}
                  onChange={(e) => setEditSupplier({ ...editSupplier, contact_person: e.target.value })}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Mobile
                  </Label>
                  <Input
                    placeholder="Enter mobile number..."
                    value={editSupplier.mobile || ''}
                    onChange={(e) => setEditSupplier({ ...editSupplier, mobile: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email
                  </Label>
                  <Input
                    type="email"
                    placeholder="Enter email..."
                    value={editSupplier.email || ''}
                    onChange={(e) => setEditSupplier({ ...editSupplier, email: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Address
                </Label>
                <Textarea
                  placeholder="Enter address..."
                  value={editSupplier.address || ''}
                  onChange={(e) => setEditSupplier({ ...editSupplier, address: e.target.value })}
                  rows={2}
                />
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Notes
                </Label>
                <Textarea
                  placeholder="Additional notes..."
                  value={editSupplier.notes || ''}
                  onChange={(e) => setEditSupplier({ ...editSupplier, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSupplier(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateContact}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuppliersPage;
