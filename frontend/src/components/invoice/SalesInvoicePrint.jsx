import React from 'react';

// Base64-encoded Khayratna logo (grayscale, optimized for print)
const LOGO_BASE64 = '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';

/**
 * Sales Invoice Print Template - Khayratna / Michel Matar Trading Est.
 * Monochrome, bilingual Arabic/English, supports 20 items per page with multi-page printing
 */
const SalesInvoicePrint = ({ invoice, organization, customer }) => {
  const companyEn = organization?.name || 'Michel Matar Trading Est.';
  const companyAr = 'مؤسسة ميشال مطر التجارية';
  const addressEn = organization?.address || 'Kafarakka El-Koura';
  const addressAr = 'كفر عقا - الكورة';
  const phone = organization?.phone || '06/950751';
  const email = organization?.email || 'ets.michelmatar@hotmail.com';
  const regNumber = organization?.registration_number || '601-585164';
  const taxPercent = organization?.tax_percent || 11;

  const subtotal = invoice?.subtotal_usd || invoice?.subtotal || 0;
  const taxAmount = invoice?.tax_amount_usd || invoice?.tax_amount || 0;
  const total = invoice?.total_usd || invoice?.total || 0;
  const discount = invoice?.discount_amount_usd || invoice?.discount_amount || 0;
  const customerName = customer?.name || invoice?.customer_name || '';
  const customerCode = customer?.code || invoice?.customer_code || '';
  const customerAddress = customer?.address || invoice?.customer_address || '';

  const printInvoice = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const lines = invoice?.lines || [];

    const itemRows = lines.map((line, i) => {
      const isTaxed = line.is_taxable !== false;
      const lineTotal = (line.quantity || 0) * (line.unit_price || line.price || 0) * (1 - (line.discount_percent || 0) / 100);
      return `
        <tr>
          <td style="text-align:center;padding:3px 2px;border:1px solid #000;">${i + 1}</td>
          <td style="text-align:right;padding:3px 4px;border:1px solid #000;direction:rtl;">
            ${line.name_ar || line.item_name || line.name || ''}${isTaxed ? ' <span style="font-weight:bold;">*</span>' : ''}
          </td>
          <td style="text-align:center;padding:3px 2px;border:1px solid #000;">${line.pack_description || line.package || '-'}</td>
          <td style="text-align:center;padding:3px 2px;border:1px solid #000;">${line.quantity || 0}</td>
          <td style="text-align:right;padding:3px 4px;border:1px solid #000;">${(line.unit_price || line.price || 0).toFixed(3)}</td>
          <td style="text-align:center;padding:3px 2px;border:1px solid #000;">${line.discount_percent ? line.discount_percent + '%' : '-'}</td>
          <td style="text-align:right;padding:3px 4px;border:1px solid #000;font-weight:bold;">${lineTotal.toFixed(3)}</td>
        </tr>
      `;
    }).join('');

    // Fill empty rows up to 20 per first page
    const emptyRows = Math.max(0, 20 - lines.length);
    const emptyRowsHtml = Array(emptyRows).fill(`
      <tr>
        <td style="padding:3px 2px;border:1px solid #000;">&nbsp;</td>
        <td style="padding:3px 2px;border:1px solid #000;"></td>
        <td style="padding:3px 2px;border:1px solid #000;"></td>
        <td style="padding:3px 2px;border:1px solid #000;"></td>
        <td style="padding:3px 2px;border:1px solid #000;"></td>
        <td style="padding:3px 2px;border:1px solid #000;"></td>
        <td style="padding:3px 2px;border:1px solid #000;"></td>
      </tr>
    `).join('');

    const html = `
<!DOCTYPE html>
<html dir="ltr">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice?.invoice_number || ''}</title>
  <style>
    @page {
      size: A4;
      margin: 8mm 10mm;
    }
    body {
      font-family: Arial, sans-serif;
      font-size: 13px;
      color: #000;
      margin: 0;
      padding: 10px;
    }

    /* --- Header --- */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 6px;
      border-bottom: 2px solid #000;
      padding-bottom: 6px;
    }
    .header-left { text-align: left; flex: 1; }
    .header-center { text-align: center; flex: 0 0 140px; display: flex; align-items: center; justify-content: center; }
    .header-right { text-align: right; flex: 1; direction: rtl; }
    .header h2 { font-size: 16px; margin: 0 0 3px 0; color: #000; }
    .header p { margin: 1px 0; font-size: 12px; color: #000; }
    .logo-img { max-height: 70px; max-width: 130px; }

    /* --- Invoice Title --- */
    .invoice-title {
      text-align: center;
      font-size: 20px;
      font-weight: bold;
      color: #000;
      margin: 6px 0;
      border: 2px solid #000;
      padding: 3px;
    }

    /* --- Customer Section --- */
    .customer-section {
      display: flex;
      justify-content: space-between;
      margin: 6px 0;
      border: 1px solid #000;
      padding: 6px 8px;
    }
    .customer-left { text-align: left; }
    .customer-right { text-align: right; direction: rtl; }
    .customer-field { margin: 2px 0; font-size: 13px; }
    .customer-label { font-weight: bold; color: #000; }

    /* --- Items Table --- */
    table.items {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0 4px 0;
    }
    table.items thead { display: table-header-group; }
    table.items th {
      background: #000;
      color: #fff;
      padding: 4px 3px;
      font-size: 12px;
      border: 1px solid #000;
    }
    table.items td {
      font-size: 12px;
    }
    table.items tbody tr {
      page-break-inside: avoid;
    }

    /* --- Totals --- */
    .totals-section { display: flex; justify-content: flex-end; margin-top: 4px; }
    .totals-table { width: 300px; border-collapse: collapse; }
    .totals-table td { padding: 3px 8px; font-size: 13px; border: 1px solid #000; }
    .totals-table .label { text-align: right; direction: rtl; font-weight: bold; background: #eee; }
    .totals-table .value { text-align: right; font-family: monospace; }
    .totals-table .grand-total td { background: #000; color: #fff; font-size: 15px; font-weight: bold; }

    /* --- Footer / Signatures --- */
    .star-note { font-size: 11px; color: #000; margin-top: 4px; direction: rtl; text-align: right; font-weight: bold; }
    .footer { margin-top: 10px; font-size: 11px; color: #000; direction: rtl; text-align: right; }
    .signature-area { display: flex; justify-content: space-between; margin-top: 16px; }
    .signature-box { width: 200px; text-align: center; }
    .signature-line { border-top: 1px solid #000; margin-top: 35px; padding-top: 4px; font-size: 12px; }
    /* --- Print-specific rules for multi-page --- */
    @media print {
      body { padding: 0; }
      .no-break { page-break-inside: avoid; }
      table.items thead { display: table-header-group; }
      table.items tfoot { display: table-footer-group; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <h2>${companyEn}</h2>
      <p>${addressEn}</p>
      <p>Tel: ${phone}</p>
      <p>Email: ${email}</p>
      <p>T.V.A.: ${regNumber}</p>
    </div>
    <div class="header-center">
      <img class="logo-img" src="data:image/png;base64,${LOGO_BASE64}" alt="Khayratna" />
    </div>
    <div class="header-right">
      <h2>${companyAr}</h2>
      <p>${addressAr}</p>
      <p>تلفون: ${phone}</p>
      <p>بريد: ${email}</p>
      <p>ض.ق.م.: ${regNumber}</p>
    </div>
  </div>

  <!-- Invoice Title -->
  <div class="invoice-title">فاتورة - Invoice</div>

  <!-- Customer Section -->
  <div class="customer-section">
    <div class="customer-left">
      <div class="customer-field"><span class="customer-label">Date:</span> ${invoice?.date || ''}</div>
      <div class="customer-field"><span class="customer-label">Invoice #:</span> ${invoice?.invoice_number || ''}</div>
    </div>
    <div class="customer-right">
      <div class="customer-field"><span class="customer-label">إسم الزبون:</span> ${customerName}</div>
      <div class="customer-field"><span class="customer-label">رقم الزبون:</span> ${customerCode}</div>
      <div class="customer-field"><span class="customer-label">العنوان:</span> ${customerAddress}</div>
    </div>
  </div>

  <!-- Items Table -->
  <table class="items">
    <thead>
      <tr>
        <th style="width:30px;">الرقم<br/>#</th>
        <th style="width:auto;">الصنف<br/>Item</th>
        <th style="width:55px;">صندوق<br/>Box</th>
        <th style="width:45px;">العدد<br/>Qty</th>
        <th style="width:60px;">السعر<br/>Price</th>
        <th style="width:45px;">حسم<br/>Disc</th>
        <th style="width:65px;">المجموع<br/>Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      ${emptyRowsHtml}
    </tbody>
  </table>

  <p class="star-note">* = خاضع للضريبة على القيمة المضافة (Subject to VAT)</p>

  <!-- Totals -->
  <div class="totals-section no-break">
    <table class="totals-table">
      <tr>
        <td class="label">المجموع / Subtotal</td>
        <td class="value">${subtotal.toFixed(3)}</td>
      </tr>
      ${discount > 0 ? `<tr>
        <td class="label">حسم / Discount</td>
        <td class="value">${discount.toFixed(3)}</td>
      </tr>` : ''}
      <tr>
        <td class="label">الضريبة على القيمة المضافة ${taxPercent}% / VAT</td>
        <td class="value">${taxAmount.toFixed(3)}</td>
      </tr>
      <tr class="grand-total">
        <td class="label" style="background:#000;color:#fff;">المجموع العام / General Total</td>
        <td class="value">${total.toFixed(3)}</td>
      </tr>
    </table>
  </div>

  <!-- Receipt Statement -->
  <div class="footer">
    <p>استلمت البضاعة طبقاً للمبين في الفاتورة أعلاه بحالة جيدة وتأكدت من سلامتها ونوعيتها ومن صلاحية تاريخ الصنع</p>
  </div>

  <!-- Signature Areas -->
  <div class="signature-area no-break">
    <div class="signature-box">
      <div class="signature-line">الإدارة / Administration</div>
    </div>
    <div class="signature-box">
      <div class="signature-line">إمضاء الزبون / Customer Signature</div>
    </div>
  </div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return { printInvoice };
};

export default SalesInvoicePrint;
