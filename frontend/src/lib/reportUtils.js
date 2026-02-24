// Print and Export utilities for reports

export const printReport = (reportTitle) => {
  // Add print-specific styles
  const printStyles = `
    @media print {
      body * {
        visibility: hidden;
      }
      [data-testid*="report"], [data-testid*="report"] * {
        visibility: visible;
      }
      [data-testid*="report"] {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        background: white !important;
        color: black !important;
      }
      .no-print {
        display: none !important;
      }
      table {
        border-collapse: collapse;
        width: 100%;
      }
      th, td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
      }
      th {
        background-color: #f5f5f5 !important;
      }
      .text-emerald-400 { color: #059669 !important; }
      .text-red-400 { color: #dc2626 !important; }
      .text-blue-400 { color: #2563eb !important; }
    }
  `;

  // Create and append style element
  const styleEl = document.createElement('style');
  styleEl.id = 'print-styles';
  styleEl.textContent = printStyles;
  document.head.appendChild(styleEl);

  // Trigger print
  window.print();

  // Remove style element after print
  setTimeout(() => {
    const el = document.getElementById('print-styles');
    if (el) el.remove();
  }, 1000);
};

export const exportToCSV = (data, filename, columns) => {
  // Build CSV content
  let csvContent = columns.map(col => `"${col.header}"`).join(',') + '\n';
  
  data.forEach(row => {
    const values = columns.map(col => {
      let value = row[col.key];
      if (typeof value === 'number') {
        value = value.toFixed(2);
      }
      // Escape quotes and wrap in quotes
      return `"${String(value || '').replace(/"/g, '""')}"`;
    });
    csvContent += values.join(',') + '\n';
  });

  // Create and download file
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
};

export const exportIncomeStatementToCSV = (data, orgName) => {
  const rows = [];
  
  // Revenue section
  rows.push({ section: 'REVENUE (Class 7)', code: '', name: '', balance_lbp: '', balance_usd: '' });
  data.revenue.accounts.forEach(acc => {
    rows.push({
      section: '',
      code: acc.code,
      name: acc.name,
      balance_lbp: acc.balance_lbp,
      balance_usd: acc.balance_usd
    });
  });
  rows.push({ section: 'Total Revenue', code: '', name: '', balance_lbp: data.revenue.total_lbp, balance_usd: data.revenue.total_usd });
  
  // Expenses section
  rows.push({ section: '', code: '', name: '', balance_lbp: '', balance_usd: '' });
  rows.push({ section: 'EXPENSES (Class 6)', code: '', name: '', balance_lbp: '', balance_usd: '' });
  data.expenses.accounts.forEach(acc => {
    rows.push({
      section: '',
      code: acc.code,
      name: acc.name,
      balance_lbp: acc.balance_lbp,
      balance_usd: acc.balance_usd
    });
  });
  rows.push({ section: 'Total Expenses', code: '', name: '', balance_lbp: data.expenses.total_lbp, balance_usd: data.expenses.total_usd });
  
  // Net Income
  rows.push({ section: '', code: '', name: '', balance_lbp: '', balance_usd: '' });
  rows.push({ section: 'NET INCOME', code: '', name: '', balance_lbp: data.net_income.lbp, balance_usd: data.net_income.usd });

  const columns = [
    { key: 'section', header: 'Section' },
    { key: 'code', header: 'Code' },
    { key: 'name', header: 'Account Name' },
    { key: 'balance_lbp', header: 'Amount (LBP)' },
    { key: 'balance_usd', header: 'Amount (USD)' }
  ];

  exportToCSV(rows, `${orgName}_Income_Statement`, columns);
};

export const exportTrialBalanceToCSV = (data, orgName) => {
  const rows = data.accounts.map(acc => ({
    code: acc.code,
    name: acc.name,
    debit_lbp: acc.debit_lbp || 0,
    credit_lbp: acc.credit_lbp || 0,
    debit_usd: acc.debit_usd || 0,
    credit_usd: acc.credit_usd || 0,
    net_lbp: acc.net_lbp || 0,
    net_usd: acc.net_usd || 0
  }));

  // Add totals row
  rows.push({
    code: '',
    name: 'TOTALS',
    debit_lbp: data.totals.debit_lbp,
    credit_lbp: data.totals.credit_lbp,
    debit_usd: data.totals.debit_usd,
    credit_usd: data.totals.credit_usd,
    net_lbp: '',
    net_usd: ''
  });

  const columns = [
    { key: 'code', header: 'Code' },
    { key: 'name', header: 'Account Name' },
    { key: 'debit_lbp', header: 'Debit (LBP)' },
    { key: 'credit_lbp', header: 'Credit (LBP)' },
    { key: 'debit_usd', header: 'Debit (USD)' },
    { key: 'credit_usd', header: 'Credit (USD)' },
    { key: 'net_lbp', header: 'Net (LBP)' },
    { key: 'net_usd', header: 'Net (USD)' }
  ];

  exportToCSV(rows, `${orgName}_Trial_Balance`, columns);
};

export const exportGeneralLedgerToCSV = (ledgerData, orgName) => {
  const rows = ledgerData.entries.map(entry => ({
    date: entry.date,
    voucher_number: entry.voucher_number,
    voucher_type: entry.voucher_type,
    description: entry.description,
    debit_lbp: entry.debit_lbp || 0,
    credit_lbp: entry.credit_lbp || 0,
    debit_usd: entry.debit_usd || 0,
    credit_usd: entry.credit_usd || 0,
    balance_lbp: entry.balance_lbp || 0,
    balance_usd: entry.balance_usd || 0
  }));

  // Add closing balance row
  rows.push({
    date: '',
    voucher_number: '',
    voucher_type: '',
    description: 'CLOSING BALANCE',
    debit_lbp: '',
    credit_lbp: '',
    debit_usd: '',
    credit_usd: '',
    balance_lbp: ledgerData.closing_balance.lbp,
    balance_usd: ledgerData.closing_balance.usd
  });

  const columns = [
    { key: 'date', header: 'Date' },
    { key: 'voucher_number', header: 'Voucher #' },
    { key: 'voucher_type', header: 'Type' },
    { key: 'description', header: 'Description' },
    { key: 'debit_lbp', header: 'Debit (LBP)' },
    { key: 'credit_lbp', header: 'Credit (LBP)' },
    { key: 'debit_usd', header: 'Debit (USD)' },
    { key: 'credit_usd', header: 'Credit (USD)' },
    { key: 'balance_lbp', header: 'Balance (LBP)' },
    { key: 'balance_usd', header: 'Balance (USD)' }
  ];

  exportToCSV(rows, `${orgName}_General_Ledger_${ledgerData.account.code}`, columns);
};
