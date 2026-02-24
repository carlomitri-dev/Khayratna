import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import SyncStatusIndicator from './SyncStatusIndicator';
import {
  LayoutDashboard,
  BookOpen,
  Receipt,
  DollarSign,
  FileBarChart,
  TrendingUp,
  List,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Building2,
  User,
  Menu,
  X,
  Settings,
  FileText,
  Archive,
  Users,
  Truck,
  Package,
  ShoppingCart,
  PanelLeftClose,
  PanelLeft,
  Calendar,
  Lock,
  Unlock,
  Upload
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Button } from '../components/ui/button';
import { getRoleDisplayName } from '../lib/utils';

// KAIROS Logo Component
const KairosLogo = ({ size = 'md' }) => {
  const sizes = {
    sm: { wrapper: 'w-8 h-8' },
    md: { wrapper: 'w-10 h-10' },
    lg: { wrapper: 'w-12 h-12' }
  };
  const s = sizes[size];
  
  return (
    <div className={`${s.wrapper} relative flex-shrink-0`}>
      <img 
        src="/kairos-logo.png" 
        alt="KAIROS" 
        className="w-full h-full object-contain"
      />
    </div>
  );
};

const Sidebar = ({ isOpen, onClose, collapsed, onToggleCollapse }) => {
  const location = useLocation();
  const { canEdit, canAdmin, isSuperAdmin } = useAuth();

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/chart-of-accounts', icon: BookOpen, label: 'Chart of Accounts' },
    { path: '/vouchers', icon: Receipt, label: 'Voucher Entry', requiresEdit: true },
    { path: '/cr-db-notes', icon: FileText, label: 'Cr/Db Notes', requiresEdit: true },
    { path: '/sales-quotations', icon: FileText, label: 'Sales Quotations', requiresEdit: true },
    { path: '/sales-invoices', icon: ShoppingCart, label: 'Sales Invoices', requiresEdit: true },
    { path: '/purchase-invoices', icon: Truck, label: 'Purchase Invoices', requiresEdit: true },
    { path: '/customers', icon: Users, label: 'Customers' },
    { path: '/suppliers', icon: Truck, label: 'Suppliers' },
    { path: '/inventory', icon: Package, label: 'Inventory' },
    { path: '/image-archive', icon: Archive, label: 'Image Archive', requiresEdit: true },
    { path: '/exchange-rates', icon: DollarSign, label: 'Exchange Rates' },
    { path: '/trial-balance', icon: FileBarChart, label: 'Trial Balance' },
    { path: '/income-statement', icon: TrendingUp, label: 'Income Statement' },
    { path: '/general-ledger', icon: List, label: 'General Ledger' },
    { path: '/import-data', icon: Upload, label: 'Import Data', requiresAdmin: true },
    { path: '/settings', icon: Settings, label: 'Settings', requiresSuperAdmin: true },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <aside 
        className={`fixed left-0 top-0 h-full bg-[#1a2744] text-white border-r border-[#1e3a5f] z-50 transform transition-all duration-300 ease-in-out lg:translate-x-0 flex flex-col ${
          collapsed ? 'w-16' : 'w-64'
        } ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        data-testid="sidebar"
      >
        <div className="p-4 flex-shrink-0">
          {/* Mobile close button */}
          <div className="flex items-center justify-between lg:hidden mb-4">
            <div className="flex items-center gap-2">
              <KairosLogo size="sm" />
              {!collapsed && <span className="font-bold text-sm">KAIROS</span>}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Desktop header */}
          <div className={`hidden lg:flex items-center mb-6 ${collapsed ? 'justify-center' : 'gap-3 px-2'}`}>
            <KairosLogo size={collapsed ? 'sm' : 'md'} />
            {!collapsed && (
              <div>
                <h1 className="font-bold text-sm" style={{ fontFamily: 'Manrope, sans-serif' }}>
                  KAIROS
                </h1>
                <p className="text-xs text-muted-foreground">Digital Invoicing</p>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable nav area */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          <nav className="space-y-1">
            {navItems.map((item) => {
              if (item.requiresEdit && !canEdit()) return null;
              if (item.requiresAdmin && !canAdmin()) return null;
              if (item.requiresSuperAdmin && !isSuperAdmin()) return null;
              
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-colors ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive 
                      ? 'bg-white/15 text-white border-l-2 border-blue-300 -ml-0.5 pl-3.5 font-medium' 
                      : 'text-blue-200/70 hover:text-white hover:bg-white/10'
                  }`}
                  data-testid={`nav-${item.path.replace('/', '')}`}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden lg:flex p-3 border-t border-white/10 flex-shrink-0">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onToggleCollapse}
            className={`w-full text-blue-200/70 hover:text-white hover:bg-white/10 ${collapsed ? 'justify-center' : 'justify-start'}`}
            data-testid="sidebar-collapse-btn"
          >
            {collapsed ? (
              <PanelLeft className="w-4 h-4" />
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4 mr-2" />
                <span className="text-xs">Collapse</span>
              </>
            )}
          </Button>
        </div>
      </aside>
    </>
  );
};

const Header = ({ onMenuClick }) => {
  const { user, organizations, currentOrg, switchOrganization, logout } = useAuth();
  const { fiscalYears, selectedFY, switchFiscalYear, clearSelection, hasFiscalYears } = useFiscalYear();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-background/80 border-b border-border px-4 lg:px-6 py-3" data-testid="header">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 lg:gap-4">
          {/* Mobile menu button */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden"
            onClick={onMenuClick}
            data-testid="mobile-menu-btn"
          >
            <Menu className="w-5 h-5" />
          </Button>

          {/* Organization switcher - Only visible for super_admin with multiple organizations */}
          {user?.role === 'super_admin' && organizations.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3" data-testid="org-switcher">
                  <Building2 className="w-4 h-4 hidden sm:block" />
                  <span className="max-w-[100px] sm:max-w-[200px] truncate">{currentOrg?.name || 'Select Org'}</span>
                  <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[250px]">
                {organizations.map((org) => (
                  <DropdownMenuItem
                    key={org.id}
                    onClick={() => switchOrganization(org)}
                    className={currentOrg?.id === org.id ? 'bg-primary/10' : ''}
                    data-testid={`org-option-${org.id}`}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm">{org.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {org.currency} | Rate: {org.base_exchange_rate.toLocaleString()}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Fiscal Year Selector */}
          {hasFiscalYears && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  className={`gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 ${
                    selectedFY?.status === 'closed' ? 'border-amber-500/50 text-amber-400' : 'border-emerald-500/50 text-emerald-400'
                  }`}
                  data-testid="fy-selector"
                >
                  <Calendar className="w-4 h-4 hidden sm:block" />
                  <span className="max-w-[120px] sm:max-w-[180px] truncate">
                    {selectedFY ? selectedFY.name : 'All Periods'}
                  </span>
                  {selectedFY?.status === 'closed' ? (
                    <Lock className="w-3 h-3" />
                  ) : selectedFY ? (
                    <Unlock className="w-3 h-3" />
                  ) : null}
                  <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[280px]">
                <DropdownMenuItem
                  onClick={() => clearSelection()}
                  className={!selectedFY ? 'bg-primary/10' : ''}
                  data-testid="fy-option-all"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">All Periods</span>
                    <span className="text-xs text-muted-foreground">No fiscal year filter</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {fiscalYears.map((fy) => (
                  <DropdownMenuItem
                    key={fy.id}
                    onClick={() => switchFiscalYear(fy)}
                    className={selectedFY?.id === fy.id ? 'bg-primary/10' : ''}
                    data-testid={`fy-option-${fy.id}`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex flex-col">
                        <span className="text-sm">{fy.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {fy.start_date} to {fy.end_date}
                        </span>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        fy.status === 'open' 
                          ? 'bg-emerald-500/20 text-emerald-400' 
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {fy.status === 'open' ? 'Open' : 'Closed'}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="flex items-center gap-2 lg:gap-4">
          {/* Sync Status Indicator */}
          <SyncStatusIndicator />
          
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-1 sm:gap-2 px-2 sm:px-3" data-testid="user-menu">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="text-xs sm:text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{getRoleDisplayName(user.role)}</p>
                  </div>
                  <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground text-sm">{user.email}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-400" data-testid="logout-btn">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
};

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // Persist collapse state in localStorage
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });

  const toggleCollapse = () => {
    setSidebarCollapsed(prev => {
      const newValue = !prev;
      localStorage.setItem('sidebarCollapsed', String(newValue));
      return newValue;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleCollapse}
      />
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="p-4 lg:p-6 animate-fade-in" data-testid="main-content">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;