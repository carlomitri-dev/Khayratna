import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Search, Plus, Minus, Trash2, ShoppingCart, CreditCard, Banknote, 
  Package, User, LogOut, X, Check, Printer, 
  Percent, Users, Play, Square, Wallet, Grid3X3, Menu,
  History, BarChart3, Settings, XCircle, Calculator
} from 'lucide-react';
import axios from 'axios';
import NumPad from '../components/NumPad';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Format currency helper
const formatCurrency = (amount, currency = 'USD') => {
  if (currency === 'LBP') {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount) + ' L.L';
  }
  return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
};

// Quick Item Button for touch - Mobile optimized
const QuickItemButton = ({ item, onClick }) => (
  <button
    data-testid={`quick-item-${item.id}`}
    onClick={() => onClick(item)}
    className="flex flex-col items-center justify-center p-2 sm:p-3 bg-white rounded-xl border-2 border-gray-100 hover:border-emerald-400 hover:shadow-lg transition-all active:scale-95 min-h-[80px] sm:min-h-[100px]"
  >
    {item.image_filename ? (
      <img 
        src={`${API}/inventory/image/${encodeURIComponent(item.image_filename)}`}
        alt={item.name}
        className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded-lg mb-1 sm:mb-2"
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    ) : (
      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-lg mb-1 sm:mb-2 flex items-center justify-center">
        <Package className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
      </div>
    )}
    <span className="text-[10px] sm:text-xs font-medium text-gray-700 text-center line-clamp-2">{item.name}</span>
    <span className="text-xs sm:text-sm font-bold text-emerald-600 mt-0.5 sm:mt-1">
      {formatCurrency(item.price, item.currency)}
    </span>
  </button>
);

// Cart Item Row - Mobile optimized
const CartItem = ({ item, index, onUpdateQty, onUpdateDiscount, onRemove, isMobile }) => (
  <div className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-white rounded-xl border border-gray-100 shadow-sm ${isMobile ? 'flex-wrap' : ''}`}>
    <div className="flex-1 min-w-0">
      <div className="font-medium text-gray-800 truncate text-sm sm:text-base">{item.item_name}</div>
      <div className="text-xs sm:text-sm text-gray-500">
        {formatCurrency(item.unit_price, item.currency)} × {item.quantity}
      </div>
    </div>
    
    {/* Quantity Controls */}
    <div className="flex items-center gap-1">
      <button
        onClick={() => onUpdateQty(index, -1)}
        className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 active:scale-95 transition-transform"
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="w-8 sm:w-10 text-center font-bold text-gray-800 text-sm sm:text-base">{item.quantity}</span>
      <button
        onClick={() => onUpdateQty(index, 1)}
        className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center text-emerald-600 active:scale-95 transition-transform"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>

    {/* Line Total */}
    <div className="w-20 sm:w-24 text-right">
      <span className="font-bold text-gray-800 text-sm sm:text-base">{formatCurrency(item.line_total_usd)}</span>
    </div>

    {/* Delete Button */}
    <button
      onClick={() => onRemove(index)}
      className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 active:scale-95 transition-transform"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </div>
);

const CashierPOSPage = () => {
  const navigate = useNavigate();
  const barcodeInputRef = useRef(null);
  
  // Auth state
  const [cashier, setCashier] = useState(null);
  const [session, setSession] = useState(null);
  const [organization, setOrganization] = useState(null);
  
  // Data state
  const [inventoryItems, setInventoryItems] = useState([]);
  const [quickItems, setQuickItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [salesAccounts, setSalesAccounts] = useState([]);
  
  // Cart state
  const [cart, setCart] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [taxPercent, setTaxPercent] = useState(11);
  const [notes, setNotes] = useState('');
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  
  // Mobile state
  const [activeTab, setActiveTab] = useState('items'); // 'items', 'cart', 'payment'
  const [isMobile, setIsMobile] = useState(false);
  
  // Dialogs
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showCloseSessionDialog, setShowCloseSessionDialog] = useState(false);
  const [showReceipt, setShowReceipt] = useState(null);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  
  // NumPad state
  const [showNumPad, setShowNumPad] = useState(null); // 'usd', 'lbp', 'openingUsd', 'openingLbp', 'closingUsd', 'closingLbp'
  const [numPadValue, setNumPadValue] = useState('');
  
  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showHistoricalSales, setShowHistoricalSales] = useState(false);
  const [historicalData, setHistoricalData] = useState(null);
  const [allTransactions, setAllTransactions] = useState([]);
  const [showVoidDialog, setShowVoidDialog] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  
  // Session dialog state
  const [openingCashUSD, setOpeningCashUSD] = useState('');
  const [openingCashLBP, setOpeningCashLBP] = useState('');
  const [closingCashUSD, setClosingCashUSD] = useState('');
  const [closingCashLBP, setClosingCashLBP] = useState('');
  
  // Payment state
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentAmountUSD, setPaymentAmountUSD] = useState('');
  const [paymentAmountLBP, setPaymentAmountLBP] = useState('');
  
  // Settings
  const [lbpRate, setLbpRate] = useState(89500);
  const [selectedCashAccount, setSelectedCashAccount] = useState('');
  const [selectedSalesAccount, setSelectedSalesAccount] = useState('');

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Check auth and load data
  useEffect(() => {
    const token = localStorage.getItem('cashier_token');
    const userData = localStorage.getItem('cashier_user');
    const orgId = localStorage.getItem('cashier_org');
    const sessionData = localStorage.getItem('cashier_session');
    
    if (!token || !userData) {
      navigate('/cashier-login');
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    setCashier(parsedUser);
    setIsAdmin(parsedUser.is_admin || parsedUser.role === 'admin' || parsedUser.role === 'super_admin');
    
    if (sessionData) {
      setSession(JSON.parse(sessionData));
    }
    
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    
    loadData(orgId);
  }, [navigate]);

  const loadData = async (orgId) => {
    setLoading(true);
    try {
      const [orgRes, inventoryRes, customersRes, cashRes, salesRes] = await Promise.all([
        axios.get(`${API}/organizations/${orgId}`),
        axios.get(`${API}/pos/inventory?organization_id=${orgId}`),
        axios.get(`${API}/customer-accounts?organization_id=${orgId}`),
        axios.get(`${API}/pos/cash-accounts?organization_id=${orgId}`),
        axios.get(`${API}/sales-accounts?organization_id=${orgId}`)
      ]);
      
      setOrganization(orgRes.data);
      setInventoryItems(inventoryRes.data);
      
      // Show quick items: items marked as show_in_pos_quick_items, or all items if none are marked
      const markedQuickItems = inventoryRes.data.filter(i => i.show_in_pos_quick_items);
      if (markedQuickItems.length > 0) {
        setQuickItems(markedQuickItems.slice(0, 32));
      } else {
        setQuickItems(inventoryRes.data.slice(0, 32));
      }
      
      setCustomers(customersRes.data);
      setCashAccounts(cashRes.data);
      setSalesAccounts(salesRes.data);
      
      // Set defaults
      if (orgRes.data.base_exchange_rate) setLbpRate(orgRes.data.base_exchange_rate);
      if (orgRes.data.tax_percent !== undefined) setTaxPercent(orgRes.data.tax_percent);
      
      if (cashRes.data.length > 0) {
        const cashAcc = cashRes.data.find(a => a.code === '5311') || cashRes.data[0];
        setSelectedCashAccount(cashAcc.id);
      }
      if (salesRes.data.length > 0) {
        const salesAcc = salesRes.data.find(a => a.code === '7011') || salesRes.data[0];
        setSelectedSalesAccount(salesAcc.id);
      }
      
      // Check for active session
      const userData = JSON.parse(localStorage.getItem('cashier_user'));
      const userIsAdmin = userData.is_admin || userData.role === 'admin' || userData.role === 'super_admin';
      
      try {
        const sessionRes = await axios.get(`${API}/cashier/sessions/active?cashier_id=${userData.id}`);
        if (sessionRes.data) {
          setSession(sessionRes.data);
          localStorage.setItem('cashier_session', JSON.stringify(sessionRes.data));
        } else if (!userIsAdmin) {
          // Only show session dialog for non-admin users
          setShowSessionDialog(true);
        }
        // Admins can use POS without a session
      } catch (error) {
        if (!userIsAdmin) {
          setShowSessionDialog(true);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      if (error.response?.status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals
  const totals = useMemo(() => {
    const subtotalUsd = cart.reduce((sum, item) => sum + (item.line_total_usd || 0), 0);
    const taxableSubtotal = cart.reduce((sum, item) => {
      if (item.is_taxable !== false) return sum + (item.line_total_usd || 0);
      return sum;
    }, 0);
    const discountAmount = subtotalUsd * (discountPercent / 100);
    const afterDiscount = subtotalUsd - discountAmount;
    const taxableAfterDiscount = taxableSubtotal * (1 - discountPercent / 100);
    const taxAmount = taxableAfterDiscount * (taxPercent / 100);
    const totalUsd = afterDiscount + taxAmount;
    const totalLbp = totalUsd * lbpRate;
    
    return { subtotalUsd, discountAmount, taxAmount, totalUsd, totalLbp };
  }, [cart, discountPercent, taxPercent, lbpRate]);

  // Calculate total paid and change for split payment (USD + LBP)
  const paymentCalc = useMemo(() => {
    if (paymentMethod === 'customer') return { totalPaidUSD: totals.totalUsd, changeUSD: 0, changeLBP: 0, isExact: true, shortfall: 0, shortfallLBP: 0, overpay: 0, overpayLBP: 0 };
    
    const paidUSD = parseFloat(paymentAmountUSD) || 0;
    const paidLBP = parseFloat(paymentAmountLBP) || 0;
    const paidLBPinUSD = paidLBP / lbpRate;
    const totalPaidUSD = paidUSD + paidLBPinUSD;
    
    const differenceUSD = totalPaidUSD - totals.totalUsd;
    
    let changeUSD = 0;
    let changeLBP = 0;
    let shortfall = 0;
    let shortfallLBP = 0;
    let overpay = 0;
    let overpayLBP = 0;
    
    if (differenceUSD > 0.005) {
      // Customer OVERPAID - calculate change
      overpay = differenceUSD;
      overpayLBP = Math.round(differenceUSD * lbpRate);
      
      // Determine how to return change based on how they paid
      if (paidLBP > 0 && paidUSD === 0) {
        // Paid entirely in LBP - return change in LBP
        changeLBP = Math.round(differenceUSD * lbpRate);
        changeUSD = 0;
      } else if (paidUSD > 0 && paidLBP === 0) {
        // Paid entirely in USD - return change in USD
        changeUSD = Math.round(differenceUSD * 100) / 100;
        changeLBP = 0;
      } else {
        // Mixed payment - return change in USD first, remainder in LBP
        changeUSD = Math.floor(differenceUSD * 100) / 100;
        const remainderUSD = differenceUSD - changeUSD;
        changeLBP = Math.round(remainderUSD * lbpRate);
      }
    } else if (differenceUSD < -0.005) {
      // Customer UNDERPAID - shortfall
      shortfall = Math.abs(differenceUSD);
      shortfallLBP = Math.round(shortfall * lbpRate);
    }
    
    return { 
      totalPaidUSD, 
      changeUSD, 
      changeLBP, 
      isExact: Math.abs(differenceUSD) < 0.01,
      remaining: shortfall,
      remainingLBP: shortfallLBP,
      shortfall,
      shortfallLBP,
      overpay,
      overpayLBP
    };
  }, [paymentAmountUSD, paymentAmountLBP, lbpRate, totals.totalUsd, paymentMethod]);

  // Search items
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const searchLower = query.toLowerCase();
    const results = inventoryItems.filter(item => 
      (item.barcode && item.barcode.toLowerCase().includes(searchLower)) ||
      item.name.toLowerCase().includes(searchLower) ||
      (item.name_ar && item.name_ar.includes(query))
    ).slice(0, 20);
    setSearchResults(results);
  }, [inventoryItems]);

  // Barcode handler
  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    
    const item = inventoryItems.find(i => 
      i.barcode?.toLowerCase() === barcodeInput.trim().toLowerCase()
    );
    
    if (item) {
      addToCart(item);
      setBarcodeInput('');
    } else {
      alert('Item not found');
    }
  };

  // Add item to cart
  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(c => c.inventory_item_id === item.id);
      if (existing) {
        return prev.map(c => 
          c.inventory_item_id === item.id 
            ? { 
                ...c, 
                quantity: c.quantity + 1,
                line_total: (c.quantity + 1) * c.unit_price * (1 - c.discount_percent / 100),
                line_total_usd: ((c.quantity + 1) * c.unit_price * (1 - c.discount_percent / 100)) / (c.exchange_rate || 1)
              }
            : c
        );
      }
      
      const exchangeRate = item.currency === 'LBP' ? lbpRate : 1;
      const lineTotal = item.price;
      const lineTotalUsd = item.currency === 'USD' ? lineTotal : lineTotal / exchangeRate;
      
      return [...prev, {
        inventory_item_id: item.id,
        item_name: item.name,
        item_name_ar: item.name_ar,
        barcode: item.barcode,
        quantity: 1,
        unit: item.unit || 'piece',
        unit_price: item.price,
        currency: item.currency || 'USD',
        exchange_rate: exchangeRate,
        discount_percent: 0,
        line_total: lineTotal,
        line_total_usd: lineTotalUsd,
        is_taxable: item.is_taxable !== false,
        batch_id: ''
      }];
    });
    // Clear all search state
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    setBarcodeInput(''); // Also clear barcode input
    
    // On mobile, switch to cart tab after adding item
    if (isMobile) {
      setActiveTab('cart');
    }
  };

  // Update quantity
  const updateQuantity = (index, delta) => {
    setCart(prev => {
      const newCart = [...prev];
      const item = newCart[index];
      const newQty = Math.max(1, item.quantity + delta);
      const lineTotal = newQty * item.unit_price * (1 - item.discount_percent / 100);
      const lineTotalUsd = item.currency === 'USD' ? lineTotal : lineTotal / (item.exchange_rate || 1);
      newCart[index] = { ...item, quantity: newQty, line_total: lineTotal, line_total_usd: lineTotalUsd };
      return newCart;
    });
  };

  // Update item discount
  const updateItemDiscount = (index, discount) => {
    setCart(prev => {
      const newCart = [...prev];
      const item = newCart[index];
      const discPct = Math.min(100, Math.max(0, parseFloat(discount) || 0));
      const lineTotal = item.quantity * item.unit_price * (1 - discPct / 100);
      const lineTotalUsd = item.currency === 'USD' ? lineTotal : lineTotal / (item.exchange_rate || 1);
      newCart[index] = { ...item, discount_percent: discPct, line_total: lineTotal, line_total_usd: lineTotalUsd };
      return newCart;
    });
  };

  // Remove from cart
  const removeFromCart = (index) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  // Clear cart
  const clearCart = () => {
    setCart([]);
    setDiscountPercent(0);
    setSelectedCustomer(null);
    setNotes('');
    setPaymentAmountUSD('');
    setPaymentAmountLBP('');
  };

  // NumPad handlers
  const openNumPad = (field) => {
    // Set initial value based on field
    const initialValues = {
      'usd': paymentAmountUSD,
      'lbp': paymentAmountLBP,
      'openingUsd': openingCashUSD,
      'openingLbp': openingCashLBP,
      'closingUsd': closingCashUSD,
      'closingLbp': closingCashLBP
    };
    setNumPadValue(initialValues[field] || '');
    setShowNumPad(field);
  };

  const confirmNumPad = () => {
    switch (showNumPad) {
      case 'usd':
        setPaymentAmountUSD(numPadValue);
        break;
      case 'lbp':
        setPaymentAmountLBP(numPadValue);
        break;
      case 'openingUsd':
        setOpeningCashUSD(numPadValue);
        break;
      case 'openingLbp':
        setOpeningCashLBP(numPadValue);
        break;
      case 'closingUsd':
        setClosingCashUSD(numPadValue);
        break;
      case 'closingLbp':
        setClosingCashLBP(numPadValue);
        break;
    }
    setShowNumPad(null);
    setNumPadValue('');
  };

  // Admin functions
  const loadHistoricalSales = async () => {
    if (!organization) return;
    try {
      const res = await axios.get(`${API}/cashier/admin/historical-sales?organization_id=${organization.id}`);
      setHistoricalData(res.data);
    } catch (error) {
      console.error('Error loading historical sales:', error);
    }
  };

  const loadTransactions = async () => {
    if (!organization) return;
    try {
      const res = await axios.get(`${API}/cashier/admin/transactions?organization_id=${organization.id}&limit=50`);
      setAllTransactions(res.data);
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  };

  const handleVoidTransaction = async () => {
    if (!showVoidDialog) return;
    setProcessing(true);
    try {
      await axios.post(`${API}/cashier/admin/void-transaction/${showVoidDialog.id}?reason=${encodeURIComponent(voidReason || 'Admin void')}`);
      setShowVoidDialog(null);
      setVoidReason('');
      loadTransactions();
      // Refresh session if active
      if (session) {
        const sessionRes = await axios.get(`${API}/cashier/sessions/${session.id}`);
        setSession(sessionRes.data);
        localStorage.setItem('cashier_session', JSON.stringify(sessionRes.data));
      }
      alert('Transaction voided successfully');
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to void transaction');
    } finally {
      setProcessing(false);
    }
  };

  // Open session
  const handleOpenSession = async () => {
    if (!cashier) return;
    setProcessing(true);
    try {
      const res = await axios.post(`${API}/cashier/sessions/open`, {
        cashier_id: cashier.id,
        organization_id: organization.id,
        opening_cash_usd: parseFloat(openingCashUSD) || 0,
        opening_cash_lbp: parseFloat(openingCashLBP) || 0
      });
      setSession(res.data);
      localStorage.setItem('cashier_session', JSON.stringify(res.data));
      setShowSessionDialog(false);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to open session');
    } finally {
      setProcessing(false);
    }
  };

  // Close session
  const handleCloseSession = async () => {
    if (!session) return;
    setProcessing(true);
    try {
      const res = await axios.post(`${API}/cashier/sessions/close`, {
        session_id: session.id,
        closing_cash_usd: parseFloat(closingCashUSD) || 0,
        closing_cash_lbp: parseFloat(closingCashLBP) || 0
      });
      setSession(null);
      localStorage.removeItem('cashier_session');
      setShowCloseSessionDialog(false);
      alert(`Session closed!\n\nVariance USD: ${formatCurrency(res.data.difference_usd || 0)}\nVariance LBP: ${formatCurrency(res.data.difference_lbp || 0, 'LBP')}`);
      setShowSessionDialog(true);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to close session');
    } finally {
      setProcessing(false);
    }
  };

  // Process payment
  const handlePayment = async () => {
    if (cart.length === 0) return;
    
    // Allow admins to process without session, but warn
    if (!session && !isAdmin) {
      alert('Please open a session first');
      return;
    }
    
    // Check for shortfall (customer pays less) - not allowed unless discount applied
    if (paymentMethod === 'cash' && paymentCalc.shortfall > 0.01) {
      alert(`Insufficient payment. Still need ${formatCurrency(paymentCalc.shortfall)} (${formatCurrency(paymentCalc.shortfallLBP, 'LBP')}). Use "Apply as Discount" button to proceed.`);
      return;
    }
    
    setProcessing(true);
    try {
      const paidUSD = parseFloat(paymentAmountUSD) || 0;
      const paidLBP = parseFloat(paymentAmountLBP) || 0;
      
      const payload = {
        organization_id: organization.id,
        lines: cart,
        subtotal_usd: totals.subtotalUsd,
        discount_percent: discountPercent,
        discount_amount: totals.discountAmount,
        tax_percent: taxPercent,
        tax_amount: totals.taxAmount,
        total_usd: totals.totalUsd,
        total_lbp: totals.totalLbp,
        payment_method: paymentMethod,
        payment_amount_usd: paidUSD,
        payment_amount_lbp: paidLBP,
        payment_amount: paymentCalc.totalPaidUSD,
        payment_currency: 'SPLIT',
        payment_exchange_rate: lbpRate,
        change_amount: paymentCalc.changeUSD,
        change_amount_lbp: paymentCalc.changeLBP,
        payment_adjustment: discountPercent < 0 ? Math.abs(discountPercent) : 0, // Premium amount
        customer_id: selectedCustomer?.id || null,
        customer_name: selectedCustomer?.name || 'Walk-in',
        customer_code: selectedCustomer?.code || null,
        notes: notes || null,
        debit_account_id: paymentMethod === 'customer' ? selectedCustomer?.id : selectedCashAccount,
        credit_account_id: selectedSalesAccount,
        lbp_rate: lbpRate,
        session_id: session?.id || null
      };
      
      const res = await axios.post(`${API}/pos/transactions`, payload);
      
      // Only record to session if session exists
      if (session) {
        await axios.post(`${API}/cashier/sessions/${session.id}/record-transaction`, {
          total_usd: totals.totalUsd,
          total_lbp: totals.totalLbp,
          payment_method: paymentMethod,
          payment_amount_usd: paidUSD,
          payment_amount_lbp: paidLBP,
          change_amount_usd: paymentCalc.changeUSD,
          change_amount_lbp: paymentCalc.changeLBP,
          lbp_rate: lbpRate
        });
        
        const sessionRes = await axios.get(`${API}/cashier/sessions/${session.id}`);
        setSession(sessionRes.data);
        localStorage.setItem('cashier_session', JSON.stringify(sessionRes.data));
      }
      
      setShowPaymentDialog(false);
      setShowReceipt({...res.data, change_usd: paymentCalc.changeUSD, change_lbp: paymentCalc.changeLBP});
      clearCart();
      
      // Reset to items tab on mobile
      if (isMobile) {
        setActiveTab('items');
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert(error.response?.data?.detail || 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('cashier_token');
    localStorage.removeItem('cashier_user');
    localStorage.removeItem('cashier_org');
    localStorage.removeItem('cashier_session');
    navigate('/cashier-login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading POS...</p>
        </div>
      </div>
    );
  }

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between shadow-sm safe-area-top">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-800 text-sm">{organization?.name || 'KAIROS POS'}</h1>
              <p className="text-[10px] text-gray-500">{cashier?.name}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-[10px] text-gray-500">Sales</div>
              <div className="text-sm font-bold text-emerald-600">{formatCurrency(session?.total_sales_usd || 0)}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCloseSessionDialog(true)}
              className="text-orange-500 p-2"
            >
              <Square className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Search Bar - Always visible */}
        <div className="bg-white px-3 py-2 border-b border-gray-100">
          <form onSubmit={handleBarcodeSubmit} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              ref={barcodeInputRef}
              type="text"
              placeholder="Scan or search..."
              value={barcodeInput}
              onChange={(e) => {
                setBarcodeInput(e.target.value);
                handleSearch(e.target.value);
              }}
              onFocus={() => setShowSearch(true)}
              className="pl-9 h-10 bg-gray-50 border-gray-200 text-gray-900 text-sm"
            />
            {showSearch && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-200 max-h-60 overflow-auto z-50">
                {searchResults.map(item => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-emerald-50 border-b border-gray-100 last:border-0 text-left"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-800 text-sm">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.barcode || 'No barcode'}</div>
                    </div>
                    <div className="text-emerald-600 font-bold text-sm">{formatCurrency(item.price, item.currency)}</div>
                    <Plus className="w-4 h-4 text-emerald-500" />
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>

        {/* Mobile Content */}
        <div className="flex-1 overflow-hidden">
          {/* Quick Items Tab */}
          {activeTab === 'items' && (
            <div className="h-full overflow-auto p-2">
              <div className="grid grid-cols-3 gap-2">
                {quickItems.map(item => (
                  <QuickItemButton key={item.id} item={item} onClick={addToCart} />
                ))}
              </div>
            </div>
          )}

          {/* Cart Tab */}
          {activeTab === 'cart' && (
            <div className="h-full flex flex-col">
              <div className="flex-1 overflow-auto p-2 space-y-2">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <ShoppingCart className="w-16 h-16 mb-3 opacity-30" />
                    <p className="text-base font-medium">Cart is empty</p>
                    <p className="text-xs">Add items from the Items tab</p>
                  </div>
                ) : (
                  cart.map((item, index) => (
                    <CartItem
                      key={index}
                      item={item}
                      index={index}
                      onUpdateQty={updateQuantity}
                      onUpdateDiscount={updateItemDiscount}
                      onRemove={removeFromCart}
                      isMobile={true}
                    />
                  ))
                )}
              </div>
              
              {/* Cart Totals */}
              {cart.length > 0 && (
                <div className="bg-white border-t border-gray-200 p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium">{formatCurrency(totals.subtotalUsd)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tax ({taxPercent}%)</span>
                    <span>{formatCurrency(totals.taxAmount)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-gray-800 pt-2 border-t">
                    <span>Total</span>
                    <div className="text-right">
                      <div className="text-emerald-600">{formatCurrency(totals.totalUsd)}</div>
                      <div className="text-xs font-normal text-gray-500">{formatCurrency(totals.totalLbp, 'LBP')}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Payment Tab */}
          {activeTab === 'payment' && (
            <div className="h-full overflow-auto p-3 pb-20 space-y-3">
              {/* Customer Selection */}
              <button
                onClick={() => setShowCustomerDialog(true)}
                className="w-full p-3 bg-white rounded-xl border border-gray-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-700">{selectedCustomer?.name || 'Walk-in Customer'}</span>
                </div>
                <span className="text-gray-400 text-sm">Change</span>
              </button>

              {/* Payment Methods */}
              <div className="space-y-2">
                <button
                  onClick={() => setPaymentMethod('cash')}
                  className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
                    paymentMethod === 'cash' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    paymentMethod === 'cash' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-800">Cash</div>
                    <div className="text-xs text-gray-500">USD + LBP</div>
                  </div>
                </button>

                <button
                  onClick={() => setPaymentMethod('card')}
                  className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
                    paymentMethod === 'card' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    paymentMethod === 'card' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-800">Card</div>
                    <div className="text-xs text-gray-500">Credit/Debit</div>
                  </div>
                </button>

                <button
                  onClick={() => setPaymentMethod('customer')}
                  disabled={!selectedCustomer}
                  className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
                    paymentMethod === 'customer' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white'
                  } ${!selectedCustomer ? 'opacity-50' : ''}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    paymentMethod === 'customer' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-800">On Credit</div>
                    <div className="text-xs text-gray-500">{selectedCustomer?.name || 'Select customer'}</div>
                  </div>
                </button>
              </div>

              {/* Cash Payment Inputs */}
              {paymentMethod === 'cash' && (
                <div className="space-y-3 bg-white rounded-xl p-3 border border-gray-200">
                  <div className="text-sm font-medium text-gray-700">Amount Received</div>
                  
                  <button
                    onClick={() => openNumPad('usd')}
                    className="w-full flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200 active:scale-98"
                  >
                    <div className="w-12 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
                      USD
                    </div>
                    <div className="flex-1 text-left">
                      <span className={`text-xl font-bold ${paymentAmountUSD ? 'text-gray-900' : 'text-gray-400'}`}>
                        ${paymentAmountUSD || totals.totalUsd.toFixed(3)}
                      </span>
                    </div>
                    <Calculator className="w-5 h-5 text-gray-400" />
                  </button>
                  
                  <button
                    onClick={() => openNumPad('lbp')}
                    className="w-full flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200 active:scale-98"
                  >
                    <div className="w-12 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                      LBP
                    </div>
                    <div className="flex-1 text-left">
                      <span className={`text-xl font-bold ${paymentAmountLBP ? 'text-gray-900' : 'text-gray-400'}`}>
                        {paymentAmountLBP ? parseInt(paymentAmountLBP).toLocaleString() : Math.round(totals.totalLbp).toLocaleString()} L.L
                      </span>
                    </div>
                    <Calculator className="w-5 h-5 text-gray-400" />
                  </button>

                  {/* Quick Buttons */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setPaymentAmountUSD(totals.totalUsd.toFixed(3))}
                      className="p-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 active:scale-95"
                    >
                      Exact USD
                    </button>
                    <button
                      onClick={() => setPaymentAmountLBP(Math.round(totals.totalLbp).toString())}
                      className="p-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 active:scale-95"
                    >
                      Exact LBP
                    </button>
                    <button
                      onClick={() => { setPaymentAmountUSD(''); setPaymentAmountLBP(''); }}
                      className="p-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 active:scale-95"
                    >
                      Clear
                    </button>
                  </div>

                  {/* Change/Remaining */}
                  {paymentCalc.shortfall > 0.01 ? (
                    <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                      <div className="text-xs text-red-700">Customer Pays Less</div>
                      <div className="text-lg font-bold text-red-600">{formatCurrency(paymentCalc.shortfall)}</div>
                      <div className="text-sm text-red-500">{formatCurrency(paymentCalc.shortfallLBP, 'LBP')}</div>
                      <button
                        type="button"
                        onClick={() => {
                          // Apply the shortfall as discount
                          const shortfallPercent = (paymentCalc.shortfall / totals.totalUsd) * 100;
                          const newDiscount = Math.min(100, discountPercent + shortfallPercent);
                          setDiscountPercent(Math.round(newDiscount * 100) / 100);
                        }}
                        className="mt-2 w-full py-1.5 text-xs font-medium bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
                      >
                        Apply as Discount
                      </button>
                    </div>
                  ) : (paymentCalc.overpay > 0.01) ? (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="text-xs text-amber-700">Change Due</div>
                      {paymentCalc.changeUSD > 0 && (
                        <div className="text-lg font-bold text-amber-600">{formatCurrency(paymentCalc.changeUSD)} USD</div>
                      )}
                      {paymentCalc.changeLBP > 0 && (
                        <div className="text-base font-bold text-amber-600">{formatCurrency(paymentCalc.changeLBP, 'LBP')}</div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          // Apply overpayment as premium (negative discount)
                          const premiumPercent = (paymentCalc.overpay / totals.totalUsd) * 100;
                          const newDiscount = Math.max(-100, discountPercent - premiumPercent);
                          setDiscountPercent(Math.round(newDiscount * 100) / 100);
                        }}
                        className="mt-2 w-full py-1.5 text-xs font-medium bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg transition-colors"
                      >
                        Apply as Premium
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Total Display */}
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                <div className="text-center">
                  <div className="text-sm text-emerald-700">Total Amount</div>
                  <div className="text-3xl font-bold text-emerald-600">{formatCurrency(totals.totalUsd)}</div>
                  <div className="text-sm text-emerald-600">{formatCurrency(totals.totalLbp, 'LBP')}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="bg-white border-t border-gray-200 safe-area-bottom">
          {cart.length > 0 && activeTab !== 'payment' && (
            <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100">
              <Button
                onClick={() => setActiveTab('payment')}
                className="w-full h-12 text-base font-bold bg-gradient-to-r from-emerald-500 to-teal-600"
              >
                <Check className="w-5 h-5 mr-2" />
                Pay {formatCurrency(totals.totalUsd)}
              </Button>
            </div>
          )}
          
          {activeTab === 'payment' && cart.length > 0 && (
            <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100">
              <Button
                onClick={handlePayment}
                disabled={processing || (paymentMethod === 'cash' && paymentCalc.shortfall > 0.01)}
                className="w-full h-12 text-base font-bold bg-gradient-to-r from-emerald-500 to-teal-600 disabled:opacity-50"
              >
                {processing ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </div>
                ) : (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    Complete Sale
                  </>
                )}
              </Button>
            </div>
          )}
          
          <div className="flex">
            <button
              onClick={() => setActiveTab('items')}
              className={`flex-1 py-3 flex flex-col items-center gap-1 ${
                activeTab === 'items' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-500'
              }`}
            >
              <Grid3X3 className="w-5 h-5" />
              <span className="text-xs font-medium">Items</span>
            </button>
            <button
              onClick={() => setActiveTab('cart')}
              className={`flex-1 py-3 flex flex-col items-center gap-1 relative ${
                activeTab === 'cart' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-500'
              }`}
            >
              <ShoppingCart className="w-5 h-5" />
              <span className="text-xs font-medium">Cart</span>
              {cart.length > 0 && (
                <span className="absolute top-2 right-1/4 w-5 h-5 bg-emerald-500 text-white text-xs rounded-full flex items-center justify-center">
                  {cart.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('payment')}
              className={`flex-1 py-3 flex flex-col items-center gap-1 ${
                activeTab === 'payment' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-500'
              }`}
            >
              <Wallet className="w-5 h-5" />
              <span className="text-xs font-medium">Payment</span>
            </button>
            {isAdmin && (
              <button
                onClick={() => { setShowHistoricalSales(true); loadHistoricalSales(); loadTransactions(); }}
                className="flex-1 py-3 flex flex-col items-center gap-1 text-purple-500"
              >
                <BarChart3 className="w-5 h-5" />
                <span className="text-xs font-medium">Admin</span>
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex-1 py-3 flex flex-col items-center gap-1 text-gray-500"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-xs font-medium">Exit</span>
            </button>
          </div>
        </div>

        {/* NumPad */}
        {showNumPad && (
          <NumPad
            value={numPadValue}
            onChange={setNumPadValue}
            onClose={() => setShowNumPad(null)}
            onConfirm={confirmNumPad}
            currency={showNumPad.includes('lbp') || showNumPad.includes('Lbp') ? 'LBP' : 'USD'}
            showDecimal={!showNumPad.includes('lbp') && !showNumPad.includes('Lbp')}
          />
        )}

        {/* Dialogs remain the same */}
        {renderDialogs()}
      </div>
    );
  }

  // Desktop Layout
  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-800">{organization?.name || 'KAIROS POS'}</h1>
              <p className="text-xs text-gray-500">{cashier?.name} • Session #{session?.id?.slice(0, 8)}</p>
            </div>
          </div>
        </div>

        {/* Barcode Input */}
        <form onSubmit={handleBarcodeSubmit} className="flex-1 max-w-md mx-4 relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              ref={barcodeInputRef}
              type="text"
              placeholder="Scan barcode or search..."
              value={barcodeInput}
              onChange={(e) => {
                setBarcodeInput(e.target.value);
                handleSearch(e.target.value);
              }}
              onFocus={() => setShowSearch(true)}
              onBlur={() => setTimeout(() => setShowSearch(false), 200)}
              className="pl-10 h-11 bg-gray-50 border-gray-200 focus:bg-white text-gray-900"
            />
          </div>
          
          {/* Search Results Dropdown */}
          {showSearch && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-200 max-h-80 overflow-auto z-50">
              {searchResults.map(item => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-emerald-50 border-b border-gray-100 last:border-0 text-left"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-800">{item.name}</div>
                    <div className="text-sm text-gray-500">{item.barcode || 'No barcode'}</div>
                  </div>
                  <div className="text-emerald-600 font-bold">{formatCurrency(item.price, item.currency)}</div>
                  <Plus className="w-5 h-5 text-emerald-500" />
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {session && (
            <div className="text-right mr-4 hidden md:block">
              <div className="text-xs text-gray-500">Session Sales</div>
              <div className="font-bold text-emerald-600">{formatCurrency(session.total_sales_usd || 0)}</div>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCloseSessionDialog(true)}
            className="border-orange-200 text-orange-600 hover:bg-orange-50"
          >
            <Square className="w-4 h-4 mr-1" />
            End Shift
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowHistoricalSales(true); loadHistoricalSales(); loadTransactions(); }}
              className="border-purple-200 text-purple-600 hover:bg-purple-50"
            >
              <BarChart3 className="w-4 h-4 mr-1" />
              Admin
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-gray-500 hover:text-red-500"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Quick Items */}
        <div className="w-80 lg:w-96 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-500" />
              Quick Items
            </h2>
          </div>
          <div className="flex-1 overflow-auto p-3">
            <div className="grid grid-cols-3 gap-2">
              {quickItems.map(item => (
                <QuickItemButton key={item.id} item={item} onClick={addToCart} />
              ))}
              {quickItems.length === 0 && (
                <div className="col-span-3 text-center py-8 text-gray-400">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No quick items configured</p>
                  <p className="text-xs mt-1">Mark items in Inventory as &ldquo;Show in POS Quick Items&rdquo;</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center Panel - Cart */}
        <div className="flex-1 flex flex-col bg-gray-50">
          {/* Cart Header */}
          <div className="p-3 bg-white border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5 text-emerald-600" />
              <span className="font-semibold text-gray-700">Cart</span>
              <span className="bg-emerald-100 text-emerald-700 text-sm font-bold px-2 py-0.5 rounded-full">
                {cart.length} items
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCustomerDialog(true)}
                className="text-gray-600"
              >
                <User className="w-4 h-4 mr-1" />
                {selectedCustomer?.name || 'Walk-in'}
              </Button>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-500 hover:bg-red-50">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <ShoppingCart className="w-20 h-20 mb-4 opacity-30" />
                <p className="text-lg font-medium">Cart is empty</p>
                <p className="text-sm">Scan an item or select from quick items</p>
              </div>
            ) : (
              cart.map((item, index) => (
                <CartItem
                  key={index}
                  item={item}
                  index={index}
                  onUpdateQty={updateQuantity}
                  onUpdateDiscount={updateItemDiscount}
                  onRemove={removeFromCart}
                  isMobile={false}
                />
              ))
            )}
          </div>

          {/* Cart Footer - Totals */}
          {cart.length > 0 && (
            <div className="bg-white border-t border-gray-200 p-4">
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(totals.subtotalUsd)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Percent className="w-4 h-4 text-orange-500" />
                    <span className="text-gray-600">Discount</span>
                    <Input
                      type="number"
                      value={discountPercent || ''}
                      onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                      className="w-16 h-7 text-center text-sm text-gray-900 bg-white"
                      placeholder="0%"
                    />
                  </div>
                  <span className="text-orange-600">-{formatCurrency(totals.discountAmount)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Tax ({taxPercent}%)</span>
                  <span>{formatCurrency(totals.taxAmount)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold text-gray-800 pt-2 border-t border-gray-200">
                  <span>Total</span>
                  <div className="text-right">
                    <div className="text-emerald-600">{formatCurrency(totals.totalUsd)}</div>
                    <div className="text-sm font-normal text-gray-500">{formatCurrency(totals.totalLbp, 'LBP')}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Payment */}
        <div className="w-72 lg:w-80 bg-white border-l border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-500" />
              Payment
            </h2>
          </div>

          <div className="flex-1 p-4 space-y-3 overflow-auto">
            {/* Payment Method Buttons */}
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => setPaymentMethod('cash')}
                className={`p-3 lg:p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
                  paymentMethod === 'cash' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center ${
                  paymentMethod === 'cash' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  <Banknote className="w-5 h-5 lg:w-6 lg:h-6" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-gray-800">Cash</div>
                  <div className="text-xs text-gray-500">Pay with cash</div>
                </div>
              </button>

              <button
                onClick={() => setPaymentMethod('card')}
                className={`p-3 lg:p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
                  paymentMethod === 'card' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center ${
                  paymentMethod === 'card' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  <CreditCard className="w-5 h-5 lg:w-6 lg:h-6" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-gray-800">Card</div>
                  <div className="text-xs text-gray-500">Credit/Debit card</div>
                </div>
              </button>

              <button
                onClick={() => setPaymentMethod('customer')}
                disabled={!selectedCustomer}
                className={`p-3 lg:p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
                  paymentMethod === 'customer' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                } ${!selectedCustomer ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center ${
                  paymentMethod === 'customer' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  <Users className="w-5 h-5 lg:w-6 lg:h-6" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-gray-800">On Credit</div>
                  <div className="text-xs text-gray-500">
                    {selectedCustomer ? selectedCustomer.name : 'Select a customer first'}
                  </div>
                </div>
              </button>
            </div>

            {/* Amount Input for Cash - Split Payment USD + LBP */}
            {paymentMethod === 'cash' && (
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-600">Amount Received (Split Payment)</label>
                
                {/* USD Input */}
                <div className="flex items-center gap-2">
                  <div className="w-14 lg:w-16 h-11 lg:h-12 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
                    USD
                  </div>
                  <Input
                    type="number"
                    value={paymentAmountUSD}
                    onChange={(e) => setPaymentAmountUSD(e.target.value)}
                    placeholder={totals.totalUsd.toFixed(3)}
                    className="flex-1 h-11 lg:h-12 text-lg font-medium text-gray-900 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => openNumPad('usd')}
                    className="w-11 lg:w-12 h-11 lg:h-12 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
                    title="Open NumPad"
                  >
                    <Calculator className="w-5 h-5" />
                  </button>
                </div>
                
                {/* LBP Input */}
                <div className="flex items-center gap-2">
                  <div className="w-14 lg:w-16 h-11 lg:h-12 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                    LBP
                  </div>
                  <Input
                    type="number"
                    value={paymentAmountLBP}
                    onChange={(e) => setPaymentAmountLBP(e.target.value)}
                    placeholder={Math.round(totals.totalLbp).toString()}
                    className="flex-1 h-11 lg:h-12 text-lg font-medium text-gray-900 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => openNumPad('lbp')}
                    className="w-11 lg:w-12 h-11 lg:h-12 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
                    title="Open NumPad"
                  >
                    <Calculator className="w-5 h-5" />
                  </button>
                </div>
                
                {/* Quick Amount Buttons */}
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => setPaymentAmountUSD(totals.totalUsd.toFixed(3))}
                    className="p-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700"
                  >
                    Exact USD
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentAmountLBP(Math.round(totals.totalLbp).toString())}
                    className="p-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700"
                  >
                    Exact LBP
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPaymentAmountUSD(''); setPaymentAmountLBP(''); }}
                    className="p-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700"
                  >
                    Clear
                  </button>
                </div>
                
                {/* Payment Summary */}
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Due</span>
                    <span className="font-semibold text-gray-800">{formatCurrency(totals.totalUsd)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Paid (USD)</span>
                    <span className="text-emerald-600">{formatCurrency(parseFloat(paymentAmountUSD) || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Paid (LBP)</span>
                    <span className="text-blue-600">{formatCurrency(parseFloat(paymentAmountLBP) || 0, 'LBP')}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-gray-200 pt-1 mt-1">
                    <span className="text-gray-500">Total Paid</span>
                    <span className="font-semibold">{formatCurrency(paymentCalc.totalPaidUSD)}</span>
                  </div>
                </div>
                
                {/* Remaining or Change */}
                {paymentCalc.shortfall > 0.01 ? (
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <div className="text-sm text-red-700">Customer Pays Less</div>
                    <div className="text-xl font-bold text-red-600">{formatCurrency(paymentCalc.shortfall)}</div>
                    <div className="text-sm text-red-500">{formatCurrency(paymentCalc.shortfallLBP, 'LBP')}</div>
                    <button
                      type="button"
                      onClick={() => {
                        // Apply the shortfall as discount
                        const shortfallPercent = (paymentCalc.shortfall / totals.totalUsd) * 100;
                        const newDiscount = Math.min(100, discountPercent + shortfallPercent);
                        setDiscountPercent(Math.round(newDiscount * 100) / 100);
                      }}
                      className="mt-2 w-full py-2 text-sm font-medium bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
                    >
                      Apply as Discount
                    </button>
                  </div>
                ) : (paymentCalc.overpay > 0.01) ? (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="text-sm text-amber-700">Change Due</div>
                    {paymentCalc.changeUSD > 0 && (
                      <div className="text-xl font-bold text-amber-600">{formatCurrency(paymentCalc.changeUSD)} USD</div>
                    )}
                    {paymentCalc.changeLBP > 0 && (
                      <div className="text-lg font-bold text-amber-600">{formatCurrency(paymentCalc.changeLBP, 'LBP')}</div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        // Apply overpayment as premium (negative discount)
                        const premiumPercent = (paymentCalc.overpay / totals.totalUsd) * 100;
                        const newDiscount = Math.max(-100, discountPercent - premiumPercent);
                        setDiscountPercent(Math.round(newDiscount * 100) / 100);
                      }}
                      className="mt-2 w-full py-2 text-sm font-medium bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg transition-colors"
                    >
                      Apply as Premium
                    </button>
                  </div>
                ) : paymentCalc.isExact && (parseFloat(paymentAmountUSD) > 0 || parseFloat(paymentAmountLBP) > 0) ? (
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <div className="text-sm text-emerald-700 flex items-center gap-2">
                      <Check className="w-4 h-4" />
                      Exact Amount - No Change
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Pay Button */}
          <div className="p-4 border-t border-gray-100">
            <Button
              onClick={handlePayment}
              disabled={cart.length === 0 || processing || (!session && !isAdmin)}
              className="w-full h-12 lg:h-14 text-base lg:text-lg font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-lg shadow-emerald-500/30"
            >
              {processing ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 lg:w-6 lg:h-6" />
                  Complete Sale - {formatCurrency(totals.totalUsd)}
                </div>
              )}
            </Button>
          </div>
        </div>
      </div>

      {renderDialogs()}
    </div>
  );

  // Render all dialogs (shared between mobile and desktop)
  function renderDialogs() {
    return (
      <>
        {/* Session Dialog */}
        <Dialog open={showSessionDialog} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Play className="w-5 h-5 text-emerald-500" />
                Open New Session
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-gray-600">Enter your opening drawer cash to start the session.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cash USD</label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={openingCashUSD}
                      onChange={(e) => setOpeningCashUSD(e.target.value)}
                      placeholder="0.00"
                      className="h-12 text-gray-900 bg-white flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => openNumPad('openingUsd')}
                      className="w-12 h-12 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
                    >
                      <Calculator className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cash LBP</label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={openingCashLBP}
                      onChange={(e) => setOpeningCashLBP(e.target.value)}
                      placeholder="0"
                      className="h-12 text-gray-900 bg-white flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => openNumPad('openingLbp')}
                      className="w-12 h-12 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
                    >
                      <Calculator className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={handleLogout}>
                Logout Instead
              </Button>
              {isAdmin && (
                <Button 
                  variant="outline" 
                  onClick={() => setShowSessionDialog(false)}
                  className="text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  Skip (Admin Mode)
                </Button>
              )}
              <Button onClick={handleOpenSession} disabled={processing} className="bg-emerald-500 hover:bg-emerald-600">
                {processing ? 'Opening...' : 'Start Session'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Close Session Dialog */}
        <Dialog open={showCloseSessionDialog} onOpenChange={setShowCloseSessionDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Square className="w-5 h-5 text-orange-500" />
                Close Session
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {session && (
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Transactions</span>
                    <span className="font-bold">{session.transaction_count || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Sales</span>
                    <span className="font-bold text-emerald-600">{formatCurrency(session.total_sales_usd || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Expected Cash USD</span>
                    <span className="font-bold">{formatCurrency(session.expected_cash_usd || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Expected Cash LBP</span>
                    <span className="font-bold">{formatCurrency(session.expected_cash_lbp || 0, 'LBP')}</span>
                  </div>
                </div>
              )}
              <p className="text-gray-600">Count your drawer and enter the closing amounts:</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Closing Cash USD</label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={closingCashUSD}
                      onChange={(e) => setClosingCashUSD(e.target.value)}
                      placeholder="0.00"
                      className="h-12 text-gray-900 bg-white flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => openNumPad('closingUsd')}
                      className="w-12 h-12 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
                    >
                      <Calculator className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Closing Cash LBP</label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={closingCashLBP}
                      onChange={(e) => setClosingCashLBP(e.target.value)}
                      placeholder="0"
                      className="h-12 text-gray-900 bg-white flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => openNumPad('closingLbp')}
                      className="w-12 h-12 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
                    >
                      <Calculator className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowCloseSessionDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCloseSession} disabled={processing} className="bg-orange-500 hover:bg-orange-600">
                {processing ? 'Closing...' : 'Close Session'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Customer Selection Dialog */}
        <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Select Customer</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-96 overflow-auto">
              <button
                onClick={() => { setSelectedCustomer(null); setShowCustomerDialog(false); }}
                className={`w-full p-3 rounded-lg border text-left transition-all ${
                  !selectedCustomer ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">Walk-in Customer</div>
                <div className="text-sm text-gray-500">Cash payment only</div>
              </button>
              {customers.map(customer => (
                <button
                  key={customer.id}
                  onClick={() => { setSelectedCustomer(customer); setShowCustomerDialog(false); }}
                  className={`w-full p-3 rounded-lg border text-left transition-all ${
                    selectedCustomer?.id === customer.id ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{customer.name}</div>
                      <div className="text-sm text-gray-500">{customer.code}</div>
                    </div>
                    <div className={`text-sm font-bold ${(customer.balance_usd || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {formatCurrency(Math.abs(customer.balance_usd || 0))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Receipt Dialog */}
        <Dialog open={!!showReceipt} onOpenChange={() => setShowReceipt(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600">
                <Check className="w-6 h-6" />
                Sale Complete!
              </DialogTitle>
            </DialogHeader>
            {showReceipt && (
              <div className="space-y-4 py-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-emerald-600">{formatCurrency(showReceipt.total_usd)}</div>
                  <div className="text-gray-500">{formatCurrency(showReceipt.total_lbp, 'LBP')}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Receipt #</span>
                    <span className="font-mono">{showReceipt.receipt_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Payment</span>
                    <span className="capitalize">{showReceipt.payment_method}</span>
                  </div>
                  {(showReceipt.change_usd > 0 || showReceipt.change_lbp > 0) && (
                    <div className="border-t border-gray-200 pt-2 mt-2">
                      <div className="text-amber-700 font-medium mb-1">Change Due:</div>
                      {showReceipt.change_usd > 0 && (
                        <div className="flex justify-between text-amber-600">
                          <span>USD</span>
                          <span className="font-bold">{formatCurrency(showReceipt.change_usd)}</span>
                        </div>
                      )}
                      {showReceipt.change_lbp > 0 && (
                        <div className="flex justify-between text-amber-600">
                          <span>LBP</span>
                          <span className="font-bold">{formatCurrency(showReceipt.change_lbp, 'LBP')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReceipt(null)}>
                Close
              </Button>
              <Button className="bg-emerald-500 hover:bg-emerald-600">
                <Printer className="w-4 h-4 mr-2" />
                Print Receipt
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Admin Historical Sales Dialog */}
        <Dialog open={showHistoricalSales} onOpenChange={setShowHistoricalSales}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-500" />
                Sales History & Admin
              </DialogTitle>
            </DialogHeader>
            
            <div className="flex-1 overflow-auto space-y-4">
              {/* Summary Cards */}
              {historicalData && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                    <div className="text-xs text-emerald-600 font-medium">Total Sales</div>
                    <div className="text-xl font-bold text-emerald-700">{formatCurrency(historicalData.summary.total_sales_usd)}</div>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                    <div className="text-xs text-blue-600 font-medium">Transactions</div>
                    <div className="text-xl font-bold text-blue-700">{historicalData.summary.total_transactions}</div>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
                    <div className="text-xs text-purple-600 font-medium">Avg Transaction</div>
                    <div className="text-xl font-bold text-purple-700">{formatCurrency(historicalData.summary.average_transaction_usd)}</div>
                  </div>
                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                    <div className="text-xs text-amber-600 font-medium">LBP Sales</div>
                    <div className="text-xl font-bold text-amber-700">{formatCurrency(historicalData.summary.total_sales_lbp, 'LBP')}</div>
                  </div>
                </div>
              )}

              {/* Payment Method Breakdown */}
              {historicalData?.by_payment_method && (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <h3 className="font-semibold text-gray-700 mb-3">By Payment Method</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(historicalData.by_payment_method).map(([method, data]) => (
                      <div key={method} className="bg-white p-3 rounded-lg border border-gray-100">
                        <div className="text-xs text-gray-500 capitalize">{method}</div>
                        <div className="text-lg font-bold text-gray-800">{formatCurrency(data.total_usd)}</div>
                        <div className="text-xs text-gray-400">{data.count} transactions</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Transactions */}
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="p-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-700">Recent Transactions</h3>
                  <Button variant="ghost" size="sm" onClick={loadTransactions}>
                    <History className="w-4 h-4 mr-1" />
                    Refresh
                  </Button>
                </div>
                <div className="max-h-64 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Receipt</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Customer</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {allTransactions.map(tx => (
                        <tr key={tx.id} className={`hover:bg-gray-50 ${tx.is_voided ? 'bg-red-50 line-through opacity-60' : ''}`}>
                          <td className="px-3 py-2 font-mono text-xs">{tx.receipt_number}</td>
                          <td className="px-3 py-2 text-gray-500">{new Date(tx.date).toLocaleString()}</td>
                          <td className="px-3 py-2">{tx.customer_name || 'Walk-in'}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatCurrency(tx.total_usd)}</td>
                          <td className="px-3 py-2 text-center">
                            {!tx.is_voided && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:bg-red-50 h-7 px-2"
                                onClick={() => setShowVoidDialog(tx)}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            )}
                            {tx.is_voided && (
                              <span className="text-xs text-red-500">Voided</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {allTransactions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                            No transactions found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowHistoricalSales(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Void Transaction Dialog */}
        <Dialog open={!!showVoidDialog} onOpenChange={() => setShowVoidDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <XCircle className="w-5 h-5" />
                Void Transaction
              </DialogTitle>
            </DialogHeader>
            {showVoidDialog && (
              <div className="space-y-4 py-4">
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <div className="text-sm text-red-700">You are about to void this transaction:</div>
                  <div className="mt-2">
                    <div className="text-lg font-bold text-red-800">Receipt #{showVoidDialog.receipt_number}</div>
                    <div className="text-sm text-red-600">Amount: {formatCurrency(showVoidDialog.total_usd)}</div>
                    <div className="text-sm text-red-600">Customer: {showVoidDialog.customer_name || 'Walk-in'}</div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason for voiding</label>
                  <Input
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    placeholder="Enter reason..."
                    className="text-gray-900"
                  />
                </div>
                <p className="text-xs text-gray-500">This action cannot be undone. The transaction will be marked as voided and removed from sales totals.</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowVoidDialog(null)}>
                Cancel
              </Button>
              <Button 
                onClick={handleVoidTransaction} 
                disabled={processing}
                className="bg-red-500 hover:bg-red-600"
              >
                {processing ? 'Voiding...' : 'Void Transaction'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* NumPad for Desktop */}
        {showNumPad && !isMobile && (
          <NumPad
            value={numPadValue}
            onChange={setNumPadValue}
            onClose={() => setShowNumPad(null)}
            onConfirm={confirmNumPad}
            currency={showNumPad.includes('lbp') || showNumPad.includes('Lbp') ? 'LBP' : 'USD'}
            showDecimal={!showNumPad.includes('lbp') && !showNumPad.includes('Lbp')}
          />
        )}
      </>
    );
  }
};

export default CashierPOSPage;
