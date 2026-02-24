import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { 
  Users, UserPlus, Clock, DollarSign, BarChart3, Eye, Trash2, 
  RefreshCw, Check, X, Play, Square, TrendingUp, Wallet, CreditCard,
  AlertTriangle, Banknote, Edit2
} from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatCurrency = (amount, currency = 'USD') => {
  if (currency === 'LBP') {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount) + ' L.L';
  }
  return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
};

const formatDateTime = (isoString) => {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

const CashierSessionsPage = () => {
  const { currentOrg, canAdmin } = useAuth();
  
  // Data
  const [cashiers, setCashiers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [liveSessions, setLiveSessions] = useState([]);
  const [summary, setSummary] = useState(null);
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('live'); // 'live', 'history', 'cashiers'
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionTransactions, setSessionTransactions] = useState([]);
  
  // Dialogs
  const [showAddCashier, setShowAddCashier] = useState(false);
  const [showEditCashier, setShowEditCashier] = useState(null);
  const [showSessionDetail, setShowSessionDetail] = useState(false);
  
  // Form State
  const [cashierForm, setCashierForm] = useState({
    email: '',
    password: '',
    name: '',
    pin: ''
  });

  useEffect(() => {
    if (currentOrg && canAdmin()) {
      loadData();
    }
  }, [currentOrg]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cashiersRes, sessionsRes, liveRes, summaryRes] = await Promise.all([
        axios.get(`${API}/cashier/cashiers?organization_id=${currentOrg.id}`),
        axios.get(`${API}/cashier/sessions?organization_id=${currentOrg.id}&limit=100`),
        axios.get(`${API}/cashier/admin/live-sessions?organization_id=${currentOrg.id}`),
        axios.get(`${API}/cashier/admin/session-summary?organization_id=${currentOrg.id}`)
      ]);
      
      setCashiers(cashiersRes.data);
      setSessions(sessionsRes.data);
      setLiveSessions(liveRes.data);
      setSummary(summaryRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCashier = async () => {
    try {
      await axios.post(`${API}/cashier/cashiers`, {
        ...cashierForm,
        organization_id: currentOrg.id
      });
      setShowAddCashier(false);
      setCashierForm({ email: '', password: '', name: '', pin: '' });
      loadData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to create cashier');
    }
  };

  const handleUpdateCashier = async () => {
    try {
      await axios.put(`${API}/cashier/cashiers/${showEditCashier.id}`, {
        name: cashierForm.name,
        pin: cashierForm.pin || undefined,
        is_active: showEditCashier.is_active
      });
      setShowEditCashier(null);
      setCashierForm({ email: '', password: '', name: '', pin: '' });
      loadData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to update cashier');
    }
  };

  const handleDeleteCashier = async (cashierId) => {
    if (!window.confirm('Are you sure you want to delete this cashier?')) return;
    try {
      await axios.delete(`${API}/cashier/cashiers/${cashierId}`);
      loadData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete cashier');
    }
  };

  const handleViewSession = async (session) => {
    setSelectedSession(session);
    setShowSessionDetail(true);
    try {
      const res = await axios.get(`${API}/cashier/sessions/${session.id}/transactions`);
      setSessionTransactions(res.data);
    } catch (error) {
      console.error('Error loading transactions:', error);
      setSessionTransactions([]);
    }
  };

  if (!canAdmin()) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-700">Access Denied</h2>
            <p className="text-gray-500">You need admin access to view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Cashier Management</h1>
          <p className="text-gray-500">Manage cashiers and monitor sessions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setShowAddCashier(true)} className="bg-emerald-500 hover:bg-emerald-600">
            <UserPlus className="w-4 h-4 mr-2" />
            Add Cashier
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-emerald-600 font-medium">Total Sales</p>
                  <p className="text-2xl font-bold text-emerald-700">{formatCurrency(summary.total_sales_usd)}</p>
                </div>
                <DollarSign className="w-8 h-8 text-emerald-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-600 font-medium">Transactions</p>
                  <p className="text-2xl font-bold text-blue-700">{summary.total_transactions}</p>
                </div>
                <BarChart3 className="w-8 h-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-600 font-medium">Cash</p>
                  <p className="text-2xl font-bold text-green-700">{formatCurrency(summary.total_cash_usd)}</p>
                </div>
                <Banknote className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-purple-600 font-medium">Card</p>
                  <p className="text-2xl font-bold text-purple-700">{formatCurrency(summary.total_card_usd)}</p>
                </div>
                <CreditCard className="w-8 h-8 text-purple-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-600 font-medium">Live Sessions</p>
                  <p className="text-2xl font-bold text-amber-700">{summary.open_sessions}</p>
                </div>
                <Play className="w-8 h-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>

          <Card className={`bg-gradient-to-br ${summary.total_variance_usd >= 0 ? 'from-green-50 to-emerald-50 border-green-200' : 'from-red-50 to-pink-50 border-red-200'}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-xs font-medium ${summary.total_variance_usd >= 0 ? 'text-green-600' : 'text-red-600'}`}>Variance</p>
                  <p className={`text-2xl font-bold ${summary.total_variance_usd >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatCurrency(Math.abs(summary.total_variance_usd))}
                  </p>
                </div>
                <TrendingUp className={`w-8 h-8 ${summary.total_variance_usd >= 0 ? 'text-green-400' : 'text-red-400'}`} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('live')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'live' 
              ? 'text-emerald-600 border-emerald-600' 
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          <Play className="w-4 h-4 inline-block mr-1" />
          Live Sessions ({liveSessions.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'history' 
              ? 'text-emerald-600 border-emerald-600' 
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          <Clock className="w-4 h-4 inline-block mr-1" />
          Session History
        </button>
        <button
          onClick={() => setActiveTab('cashiers')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'cashiers' 
              ? 'text-emerald-600 border-emerald-600' 
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4 inline-block mr-1" />
          Cashiers ({cashiers.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'live' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {liveSessions.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No active sessions</p>
              </CardContent>
            </Card>
          ) : (
            liveSessions.map(session => (
              <Card key={session.id} className="border-l-4 border-l-emerald-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>{session.cashier_name}</span>
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                      Active
                    </span>
                  </CardTitle>
                  <p className="text-xs text-gray-500">Started {formatDateTime(session.opened_at)}</p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Transactions</p>
                      <p className="font-bold text-lg">{session.transaction_count}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Sales</p>
                      <p className="font-bold text-lg text-emerald-600">{formatCurrency(session.total_sales_usd)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Cash</p>
                      <p className="font-semibold">{formatCurrency(session.total_cash_usd)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Card</p>
                      <p className="font-semibold">{formatCurrency(session.total_card_usd)}</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full mt-4"
                    onClick={() => handleViewSession(session)}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    View Details
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Cashier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Opened</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Closed</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Transactions</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Sales</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Variance</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.map(session => (
                  <tr key={session.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{session.cashier_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDateTime(session.opened_at)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDateTime(session.closed_at)}</td>
                    <td className="px-4 py-3 text-right">{session.transaction_count}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatCurrency(session.total_sales_usd)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${(session.difference_usd || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {session.status === 'closed' ? formatCurrency(session.difference_usd || 0) : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        session.status === 'open' 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {session.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button variant="ghost" size="sm" onClick={() => handleViewSession(session)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'cashiers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cashiers.map(cashier => (
            <Card key={cashier.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>{cashier.name}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    cashier.is_active 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {cashier.is_active ? 'Active' : 'Disabled'}
                  </span>
                </CardTitle>
                <p className="text-sm text-gray-500">{cashier.email}</p>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-500 mb-4">
                  Last login: {cashier.last_login ? formatDateTime(cashier.last_login) : 'Never'}
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setCashierForm({ name: cashier.name, email: cashier.email, password: '', pin: '' });
                      setShowEditCashier(cashier);
                    }}
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-red-500 hover:bg-red-50"
                    onClick={() => handleDeleteCashier(cashier.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Cashier Dialog */}
      <Dialog open={showAddCashier} onOpenChange={setShowAddCashier}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Cashier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <Input
                value={cashierForm.name}
                onChange={(e) => setCashierForm({ ...cashierForm, name: e.target.value })}
                placeholder="Cashier name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <Input
                type="email"
                value={cashierForm.email}
                onChange={(e) => setCashierForm({ ...cashierForm, email: e.target.value })}
                placeholder="cashier@store.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <Input
                type="password"
                value={cashierForm.password}
                onChange={(e) => setCashierForm({ ...cashierForm, password: e.target.value })}
                placeholder="Password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN (4-6 digits)</label>
              <Input
                type="password"
                value={cashierForm.pin}
                onChange={(e) => setCashierForm({ ...cashierForm, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                placeholder="Quick login PIN"
                maxLength={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddCashier(false)}>Cancel</Button>
            <Button onClick={handleCreateCashier} className="bg-emerald-500 hover:bg-emerald-600">
              Create Cashier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Cashier Dialog */}
      <Dialog open={!!showEditCashier} onOpenChange={() => setShowEditCashier(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Cashier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <Input
                value={cashierForm.name}
                onChange={(e) => setCashierForm({ ...cashierForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New PIN (leave empty to keep current)</label>
              <Input
                type="password"
                value={cashierForm.pin}
                onChange={(e) => setCashierForm({ ...cashierForm, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                placeholder="New PIN"
                maxLength={6}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={showEditCashier?.is_active}
                onChange={(e) => setShowEditCashier({ ...showEditCashier, is_active: e.target.checked })}
                className="rounded border-gray-300"
              />
              <label htmlFor="is_active" className="text-sm font-medium text-gray-700">Active</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEditCashier(null)}>Cancel</Button>
            <Button onClick={handleUpdateCashier} className="bg-emerald-500 hover:bg-emerald-600">
              Update Cashier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session Detail Dialog */}
      <Dialog open={showSessionDetail} onOpenChange={setShowSessionDetail}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Session Details</DialogTitle>
          </DialogHeader>
          {selectedSession && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-500">Cashier</p>
                  <p className="font-semibold">{selectedSession.cashier_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    selectedSession.status === 'open' 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedSession.status}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Opened</p>
                  <p className="font-semibold">{formatDateTime(selectedSession.opened_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Closed</p>
                  <p className="font-semibold">{selectedSession.closed_at ? formatDateTime(selectedSession.closed_at) : '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-gray-500">Opening Cash</p>
                    <p className="font-bold">{formatCurrency(selectedSession.opening_cash_usd)}</p>
                    <p className="text-xs text-gray-400">{formatCurrency(selectedSession.opening_cash_lbp, 'LBP')}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-gray-500">Expected Cash</p>
                    <p className="font-bold">{formatCurrency(selectedSession.expected_cash_usd || 0)}</p>
                    <p className="text-xs text-gray-400">{formatCurrency(selectedSession.expected_cash_lbp || 0, 'LBP')}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-gray-500">Closing Cash</p>
                    <p className="font-bold">{selectedSession.closing_cash_usd !== null ? formatCurrency(selectedSession.closing_cash_usd) : '-'}</p>
                    <p className="text-xs text-gray-400">{selectedSession.closing_cash_lbp !== null ? formatCurrency(selectedSession.closing_cash_lbp, 'LBP') : '-'}</p>
                  </CardContent>
                </Card>
              </div>

              {selectedSession.status === 'closed' && (
                <div className={`p-4 rounded-lg ${(selectedSession.difference_usd || 0) >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <p className={`text-sm font-medium ${(selectedSession.difference_usd || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    Cash Variance: {formatCurrency(selectedSession.difference_usd || 0)} USD / {formatCurrency(selectedSession.difference_lbp || 0, 'LBP')}
                  </p>
                </div>
              )}

              <div>
                <h3 className="font-semibold mb-2">Transactions ({sessionTransactions.length})</h3>
                <div className="max-h-64 overflow-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Receipt</th>
                        <th className="px-3 py-2 text-left">Time</th>
                        <th className="px-3 py-2 text-left">Payment</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sessionTransactions.map(tx => (
                        <tr key={tx.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-xs">{tx.receipt_number}</td>
                          <td className="px-3 py-2 text-gray-500">{tx.time || formatDateTime(tx.date)}</td>
                          <td className="px-3 py-2 capitalize">{tx.payment_method}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatCurrency(tx.total_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CashierSessionsPage;
