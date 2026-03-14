import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Format number with Lebanese accounting standards
export function formatLBP(value) {
  if (value === 0 || value === null || value === undefined) return '0';
  return new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Format USD with 3 decimal places
export function formatUSD(value) {
  if (value === 0 || value === null || value === undefined) return '0.000';
  return new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);
}

// Format currency based on type
export function formatCurrency(value, currency) {
  if (currency === 'LBP') {
    return `${formatLBP(value)} LBP`;
  }
  return `${formatUSD(value)}`;
}

// Get number class for styling
export function getNumberClass(value) {
  if (value > 0) return 'number-positive';
  if (value < 0) return 'number-negative';
  return 'number-zero';
}

// Get account class name
export function getAccountClassName(classNum) {
  const classNames = {
    1: 'Capital Accounts',
    2: 'Fixed Assets',
    3: 'Inventory',
    4: 'Third Party Accounts',
    5: 'Financial Accounts',
    6: 'Expenses',
    7: 'Revenue'
  };
  return classNames[classNum] || 'Unknown';
}

// Get voucher type display name
export function getVoucherTypeName(type) {
  const types = {
    'JV': 'Journal Voucher',
    'RV': 'Receipt Voucher',
    'PV': 'Payment Voucher',
    'SV': 'Sales Voucher',
    'PAYV': 'Payroll Voucher'
  };
  return types[type] || type;
}

// Get role display name
export function getRoleDisplayName(role) {
  const roles = {
    'super_admin': 'Super Admin',
    'admin': 'Admin',
    'accountant': 'Accountant',
    'viewer': 'Viewer'
  };
  return roles[role] || role;
}

// Parse date string
export function parseDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr);
}

// Format date for display (dd-mm-yyyy)
export function formatDate(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

// Format date for input (yyyy-mm-dd for HTML input[type="date"])
export function formatDateForInput(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

// Get today's date formatted for input
export function getTodayForInput() {
  return new Date().toISOString().split('T')[0];
}

// Format date with time for display (dd-mm-yyyy HH:MM)
export function formatDateTime(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

// Validate voucher balance
export function isVoucherBalanced(lines, currency) {
  if (currency === 'LBP') {
    const totalDebit = lines.reduce((sum, line) => sum + (parseFloat(line.debit_lbp) || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + (parseFloat(line.credit_lbp) || 0), 0);
    return Math.abs(totalDebit - totalCredit) < 0.01;
  } else {
    const totalDebit = lines.reduce((sum, line) => sum + (parseFloat(line.debit_usd) || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + (parseFloat(line.credit_usd) || 0), 0);
    return Math.abs(totalDebit - totalCredit) < 0.01;
  }
}

// Calculate voucher totals
export function calculateVoucherTotals(lines) {
  return {
    total_debit_lbp: lines.reduce((sum, line) => sum + (parseFloat(line.debit_lbp) || 0), 0),
    total_credit_lbp: lines.reduce((sum, line) => sum + (parseFloat(line.credit_lbp) || 0), 0),
    total_debit_usd: lines.reduce((sum, line) => sum + (parseFloat(line.debit_usd) || 0), 0),
    total_credit_usd: lines.reduce((sum, line) => sum + (parseFloat(line.credit_usd) || 0), 0),
  };
}
