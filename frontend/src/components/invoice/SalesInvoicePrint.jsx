import React from 'react';

/**
 * Sales Invoice Print Template - matches Michel Matar Trading Est. invoice format
 * Bilingual Arabic/English with company header, customer info, items table, and totals
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
          <td style="text-align:center;padding:4px;border:1px solid #ccc;">${i + 1}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ccc;direction:rtl;">
            ${line.name_ar || line.item_name || line.name || ''}${isTaxed ? ' <span style="color:red;font-weight:bold;">*</span>' : ''}
          </td>
          <td style="text-align:center;padding:4px;border:1px solid #ccc;">${line.pack_description || line.package || '-'}</td>
          <td style="text-align:center;padding:4px;border:1px solid #ccc;">${line.quantity || 0}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ccc;">${(line.unit_price || line.price || 0).toFixed(2)}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ccc;">${line.discount_percent ? line.discount_percent + '%' : '-'}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ccc;font-weight:bold;">${lineTotal.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    // Empty rows to fill page
    const emptyRows = Math.max(0, 15 - lines.length);
    const emptyRowsHtml = Array(emptyRows).fill(`
      <tr>
        <td style="padding:4px;border:1px solid #ccc;">&nbsp;</td>
        <td style="padding:4px;border:1px solid #ccc;"></td>
        <td style="padding:4px;border:1px solid #ccc;"></td>
        <td style="padding:4px;border:1px solid #ccc;"></td>
        <td style="padding:4px;border:1px solid #ccc;"></td>
        <td style="padding:4px;border:1px solid #ccc;"></td>
        <td style="padding:4px;border:1px solid #ccc;"></td>
      </tr>
    `).join('');

    const html = `
<!DOCTYPE html>
<html dir="ltr">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice?.invoice_number || ''}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1a2744; margin: 0; padding: 15px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; border-bottom: 2px solid #1a2744; padding-bottom: 10px; }
    .header-left { text-align: left; flex: 1; }
    .header-center { text-align: center; flex: 0 0 120px; }
    .header-right { text-align: right; flex: 1; direction: rtl; }
    .header h2 { font-size: 14px; margin: 0 0 4px 0; color: #1a2744; }
    .header p { margin: 1px 0; font-size: 10px; color: #333; }
    .logo-circle { width: 60px; height: 60px; border-radius: 50%; border: 2px solid #1a2744; display: flex; align-items: center; justify-content: center; margin: 0 auto; }
    .logo-text { font-size: 22px; font-weight: bold; color: #1a2744; font-family: 'Manrope', sans-serif; }
    .invoice-title { text-align: center; font-size: 18px; font-weight: bold; color: #1a2744; margin: 8px 0; border: 2px solid #1a2744; padding: 4px; }
    .customer-section { display: flex; justify-content: space-between; margin: 10px 0; border: 1px solid #ccc; padding: 8px; }
    .customer-left { text-align: left; }
    .customer-right { text-align: right; direction: rtl; }
    .customer-field { margin: 3px 0; font-size: 11px; }
    .customer-label { font-weight: bold; color: #1a2744; }
    table.items { width: 100%; border-collapse: collapse; margin: 10px 0; }
    table.items th { background: #1a2744; color: white; padding: 6px 4px; font-size: 10px; border: 1px solid #1a2744; }
    table.items td { font-size: 10px; }
    .totals-section { display: flex; justify-content: flex-end; margin-top: 5px; }
    .totals-table { width: 300px; border-collapse: collapse; }
    .totals-table td { padding: 4px 8px; font-size: 11px; border: 1px solid #ccc; }
    .totals-table .label { text-align: right; direction: rtl; font-weight: bold; background: #f0f4f8; }
    .totals-table .value { text-align: right; font-family: monospace; }
    .totals-table .grand-total { background: #1a2744; color: white; font-size: 13px; }
    .footer { margin-top: 15px; font-size: 9px; color: #666; direction: rtl; text-align: right; }
    .footer-line { border-top: 1px solid #ccc; padding-top: 8px; display: flex; justify-content: space-between; }
    .signature-area { display: flex; justify-content: space-between; margin-top: 20px; }
    .signature-box { width: 200px; text-align: center; }
    .signature-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 4px; font-size: 10px; }
    .vat-notice { text-align: center; font-size: 9px; color: #1a2744; font-weight: bold; margin-top: 10px; }
    .star-note { font-size: 9px; color: red; margin-top: 5px; direction: rtl; text-align: right; }
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
      <div class="logo-circle">
        <span class="logo-text">MM</span>
      </div>
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
        <th style="width:60px;">صندوق<br/>Box</th>
        <th style="width:50px;">العدد<br/>Qty</th>
        <th style="width:60px;">السعر<br/>Price</th>
        <th style="width:50px;">حسم<br/>Disc</th>
        <th style="width:70px;">المجموع<br/>Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      ${emptyRowsHtml}
    </tbody>
  </table>

  <p class="star-note">* = خاضع للضريبة على القيمة المضافة (Subject to VAT)</p>

  <!-- Totals -->
  <div class="totals-section">
    <table class="totals-table">
      <tr>
        <td class="label">المجموع / Subtotal</td>
        <td class="value">${subtotal.toFixed(2)}</td>
      </tr>
      <tr>
        <td class="label">الضريبة على القيمة المضافة ${taxPercent}% / VAT</td>
        <td class="value">${taxAmount.toFixed(2)}</td>
      </tr>
      <tr class="grand-total">
        <td class="label" style="background:#1a2744;color:white;">المجموع العام / General Total</td>
        <td class="value" style="font-size:14px;font-weight:bold;">${total.toFixed(2)}</td>
      </tr>
    </table>
  </div>

  <!-- Receipt Statement -->
  <div class="footer">
    <p>استلمت البضاعة طبقاً للمبين في الفاتورة أعلاه بحالة جيدة وتأكدت من سلامتها ونوعيتها ومن صلاحية تاريخ الصنع</p>
  </div>

  <!-- Signature Areas -->
  <div class="signature-area">
    <div class="signature-box">
      <div class="signature-line">الإدارة / Administration</div>
    </div>
    <div class="signature-box">
      <div class="signature-line">إمضاء الزبون / Customer Signature</div>
    </div>
  </div>

  <!-- VAT Notice -->
  <div class="vat-notice">خاضع للضريبة على القيمة المضافة - Subject to Value Added Tax</div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return { printInvoice };
};

export default SalesInvoicePrint;
