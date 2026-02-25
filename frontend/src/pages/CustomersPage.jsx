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
  Users, Search, Edit, Eye, Phone, MapPin, User, Mail, FileText,
  DollarSign, Building, List, WifiOff
} from 'lucide-react';
import axios from 'axios';
import { formatLBP, formatUSD } from '../lib/utils';
import LedgerDialog from '../components/LedgerDialog';
import db from '../lib/db';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CustomersPage = () => {
  const { currentOrg, user } = useAuth();
  const { selectedFY } = useFiscalYear();
  const { isOnline } = useSync();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewCustomer, setViewCustomer] = useState(null);
  const [ledgerAccount, setLedgerAccount] = useState(null);
  const [editCustomer, setEditCustomer] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    if (currentOrg) {
      setCurrentPage(0);
      fetchCustomers(true);
    }
  }, [currentOrg, isOnline, selectedFY, searchTerm]);

  const fetchCustomers = async (reset = false) => {
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
          axios.get(`${API}/customers?${params.toString()}`),
          axios.get(`${API}/customers/count?organization_id=${currentOrg.id}${searchTerm ? '&search=' + searchTerm : ''}`)
        ]);
        
        if (reset) {
          setCustomers(dataRes.data);
          setCurrentPage(1);
        } else {
          setCustomers(prev => [...prev, ...dataRes.data]);
          setCurrentPage(prev => prev + 1);
        }
        setTotalCount(countRes.data.count);
        
        // Cache in IndexedDB
        try {
          const customersToCache = response.data.map(c => ({ ...c, organization_id: currentOrg.id }));
          await db.customers.where('organization_id').equals(currentOrg.id).delete();
          if (customersToCache.length > 0) {
            await db.customers.bulkPut(customersToCache);
          }
        } catch (cacheError) {
          console.warn('[Customers] Error caching:', cacheError);
        }
      } else {
        // Load from IndexedDB when offline
        console.log('[Customers] Offline mode - loading from cache');
        const cachedCustomers = await db.customers.where('organization_id').equals(currentOrg.id).toArray();
        setCustomers(cachedCustomers);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
      // Fallback to cache
      try {
        const cachedCustomers = await db.customers.where('organization_id').equals(currentOrg.id).toArray();
        if (cachedCustomers.length > 0) {
          setCustomers(cachedCustomers);
        }
      } catch (cacheError) {
        console.error('[Customers] Cache fallback failed:', cacheError);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => fetchCustomers(false);
  const hasMore = customers.length < totalCount;

  const handleUpdateContact = async () => {
    if (!editCustomer) return;
    
    try {
      await axios.put(`${API}/accounts/${editCustomer.id}/contact-info`, {
        mobile: editCustomer.mobile || '',
        address: editCustomer.address || '',
        contact_person: editCustomer.contact_person || '',
        email: editCustomer.email || '',
        notes: editCustomer.notes || ''
      });
      
      alert('Customer information updated successfully!');
      setEditCustomer(null);
      fetchCustomers(true);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to update customer');
    }
  };

  // Server-side search - no client-side filter needed
  const filteredCustomers = customers;

  const canEdit = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'accountant';

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6" data-testid="customers-page">
      {/* Offline Banner */}
      <OfflineBanner />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Customers File
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage customer accounts and contact information (Account codes starting with 41)
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

      {/* Customers List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base lg:text-lg flex items-center gap-2">
            <Users className="w-5 h-5" />
            Customers ({totalCount})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="spinner" />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No customers found</p>
              <p className="text-xs mt-2">Add customer accounts in Chart of Accounts with codes starting with "41" and more than 4 digits</p>
            </div>
          ) : (
            <>
              {/* Mobile View */}
              <div className="lg:hidden space-y-3">
                {filteredCustomers.map((customer) => (
                  <div key={customer.id} className="p-3 bg-muted/20 rounded-sm border border-border">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-xs text-primary">{customer.code}</span>
                        <h3 className="font-medium">{customer.name}</h3>
                        {customer.name_ar && (
                          <p className="text-xs text-muted-foreground">{customer.name_ar}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setViewCustomer(customer)} title="View">
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setLedgerAccount(customer)} title="Ledger">
                          <List className="w-3 h-3" />
                        </Button>
                        {canEdit && (
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditCustomer(customer)} title="Edit">
                            <Edit className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-2 pt-2 border-t border-border/50 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Balance USD:</span>
                        <span className="ml-1 font-mono">${formatUSD(customer.balance_usd)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Balance LBP:</span>
                        <span className="ml-1 font-mono">{formatLBP(customer.balance_lbp)}</span>
                      </div>
                    </div>
                    
                    {(customer.mobile || customer.contact_person) && (
                      <div className="mt-2 pt-2 border-t border-border/50 flex gap-3 text-xs text-muted-foreground">
                        {customer.contact_person && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {customer.contact_person}
                          </span>
                        )}
                        {customer.mobile && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {customer.mobile}
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
                    {filteredCustomers.map((customer) => (
                      <tr key={customer.id}>
                        <td className="font-mono text-sm text-primary">{customer.code}</td>
                        <td>
                          <div>
                            <p className="font-medium">{customer.name}</p>
                            {customer.name_ar && (
                              <p className="text-xs text-muted-foreground">{customer.name_ar}</p>
                            )}
                          </div>
                        </td>
                        <td className="text-muted-foreground">{customer.contact_person || '-'}</td>
                        <td className="text-muted-foreground">{customer.mobile || '-'}</td>
                        <td className="text-muted-foreground text-sm">{customer.email || '-'}</td>
                        <td className="text-right font-mono">${formatUSD(customer.balance_usd)}</td>
                        <td className="text-right font-mono">{formatLBP(customer.balance_lbp)}</td>
                        <td>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setViewCustomer(customer)} title="View">
                              <Eye className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setLedgerAccount(customer)} title="Ledger">
                              <List className="w-3 h-3" />
                            </Button>
                            {canEdit && (
                              <Button variant="ghost" size="sm" onClick={() => setEditCustomer(customer)} title="Edit">
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

      {/* View Customer Dialog */}
      <Dialog open={!!viewCustomer} onOpenChange={() => setViewCustomer(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Customer Details
            </DialogTitle>
          </DialogHeader>
          
          {viewCustomer && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/30 rounded-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/20 rounded">
                    <Building className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-mono text-sm text-primary">{viewCustomer.code}</p>
                    <h3 className="font-bold text-lg">{viewCustomer.name}</h3>
                    {viewCustomer.name_ar && (
                      <p className="text-muted-foreground">{viewCustomer.name_ar}</p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-green-500/10 rounded-sm">
                  <p className="text-xs text-muted-foreground">Balance USD</p>
                  <p className="text-xl font-bold font-mono text-green-400">${formatUSD(viewCustomer.balance_usd)}</p>
                </div>
                <div className="p-3 bg-blue-500/10 rounded-sm">
                  <p className="text-xs text-muted-foreground">Balance LBP</p>
                  <p className="text-xl font-bold font-mono text-blue-400">{formatLBP(viewCustomer.balance_lbp)}</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-medium text-sm border-b border-border pb-2">Contact Information</h4>
                
                <div className="grid gap-3">
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{viewCustomer.contact_person || 'Not specified'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{viewCustomer.mobile || 'Not specified'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{viewCustomer.email || 'Not specified'}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <span className="text-sm">{viewCustomer.address || 'Not specified'}</span>
                  </div>
                </div>
                
                {viewCustomer.notes && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-start gap-3">
                      <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Notes</p>
                        <p className="text-sm">{viewCustomer.notes}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {canEdit && (
                <DialogFooter>
                  <Button onClick={() => { setViewCustomer(null); setEditCustomer(viewCustomer); }}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Contact Info
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={!!editCustomer} onOpenChange={() => setEditCustomer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer Contact Info</DialogTitle>
            <DialogDescription>
              Update contact information for {editCustomer?.name}
            </DialogDescription>
          </DialogHeader>
          
          {editCustomer && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-sm">
                <p className="font-mono text-sm text-primary">{editCustomer.code}</p>
                <p className="font-medium">{editCustomer.name}</p>
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Contact Person
                </Label>
                <Input
                  placeholder="Enter contact person name..."
                  value={editCustomer.contact_person || ''}
                  onChange={(e) => setEditCustomer({ ...editCustomer, contact_person: e.target.value })}
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
                    value={editCustomer.mobile || ''}
                    onChange={(e) => setEditCustomer({ ...editCustomer, mobile: e.target.value })}
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
                    value={editCustomer.email || ''}
                    onChange={(e) => setEditCustomer({ ...editCustomer, email: e.target.value })}
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
                  value={editCustomer.address || ''}
                  onChange={(e) => setEditCustomer({ ...editCustomer, address: e.target.value })}
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
                  value={editCustomer.notes || ''}
                  onChange={(e) => setEditCustomer({ ...editCustomer, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCustomer(null)}>
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

export default CustomersPage;
