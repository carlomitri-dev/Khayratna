import React from 'react';
import html2pdf from 'html2pdf.js';

/**
 * Sales Invoice Print Template - Khayratna / Michel Matar Trading Est.
 * Monochrome (white bg, black text), bilingual Arabic/English, 20 items per page with multi-page printing
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

  // Use absolute URL so the popup window can load the logo
  const logoUrl = `${window.location.origin}/assets/khayratna-logo.png`;

  // Build the invoice body HTML (shared between print and PDF)
  const buildInvoiceHtml = () => {
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

    return { itemRows, emptyRowsHtml };
  };

  // CSS styles shared between print and PDF
  const getStyles = () => `
    body, .invoice-container {
      font-family: Arial, sans-serif;
      font-size: 15px;
      color: #000;
      background: #fff;
      margin: 0;
      padding: 10px;
    }
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
    .header h2 { font-size: 18px; margin: 0 0 3px 0; color: #000; }
    .header p { margin: 1px 0; font-size: 14px; color: #000; }
    .logo-img { max-height: 80px; max-width: 140px; }
    .invoice-title {
      text-align: center;
      font-size: 22px;
      font-weight: bold;
      color: #000;
      margin: 6px 0;
      border: 2px solid #000;
      padding: 3px;
    }
    .customer-section {
      display: flex;
      justify-content: space-between;
      margin: 6px 0;
      border: 1px solid #000;
      padding: 6px 8px;
    }
    .customer-left { text-align: left; }
    .customer-right { text-align: right; direction: rtl; }
    .customer-field { margin: 2px 0; font-size: 15px; }
    .customer-label { font-weight: bold; color: #000; }
    table.items {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0 4px 0;
    }
    table.items thead { display: table-header-group; }
    table.items th {
      background: #fff;
      color: #000;
      padding: 4px 3px;
      font-size: 14px;
      border: 1px solid #000;
      font-weight: bold;
    }
    table.items td { font-size: 14px; }
    table.items tbody tr { page-break-inside: avoid; }
    .totals-section { display: flex; justify-content: flex-end; margin-top: 4px; }
    .totals-table { width: 300px; border-collapse: collapse; }
    .totals-table td { padding: 3px 8px; font-size: 15px; border: 1px solid #000; color: #000; }
    .totals-table .label { text-align: right; direction: rtl; font-weight: bold; background: #fff; }
    .totals-table .value { text-align: right; font-family: monospace; background: #fff; }
    .totals-table .grand-total td { font-size: 17px; font-weight: bold; border: 2px solid #000; }
    .star-note { font-size: 13px; color: #000; margin-top: 4px; direction: rtl; text-align: right; font-weight: bold; }
    .footer { margin-top: 10px; font-size: 13px; color: #000; direction: rtl; text-align: right; }
    .signature-area { display: flex; justify-content: space-between; margin-top: 16px; }
    .signature-box { width: 200px; text-align: center; }
    .signature-line { border-top: 1px solid #000; margin-top: 35px; padding-top: 4px; font-size: 14px; }
  `;

  // Build invoice body HTML (without <html>/<head> wrapper)
  const getBodyHtml = () => {
    const { itemRows, emptyRowsHtml } = buildInvoiceHtml();
    return `
  <div class="header">
    <div class="header-left">
      <h2>${companyEn}</h2>
      <p>${addressEn}</p>
      <p>Tel: ${phone}</p>
      <p>Email: ${email}</p>
      <p>T.V.A.: ${regNumber}</p>
    </div>
    <div class="header-center">
      <img class="logo-img" src="${logoUrl}" alt="Khayratna" />
    </div>
    <div class="header-right">
      <h2>${companyAr}</h2>
      <p>${addressAr}</p>
      <p>تلفون: ${phone}</p>
      <p>بريد: ${email}</p>
      <p>ض.ق.م.: ${regNumber}</p>
    </div>
  </div>
  <div class="invoice-title">فاتورة - Invoice</div>
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
  <div class="totals-section">
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
        <td class="label">المجموع العام / General Total</td>
        <td class="value">${total.toFixed(3)}</td>
      </tr>
    </table>
  </div>
  <div class="footer">
    <p>استلمت البضاعة طبقاً للمبين في الفاتورة أعلاه بحالة جيدة وتأكدت من سلامتها ونوعيتها ومن صلاحية تاريخ الصنع</p>
  </div>
  <div class="signature-area">
    <div class="signature-box">
      <div class="signature-line">الإدارة / Administration</div>
    </div>
    <div class="signature-box">
      <div class="signature-line">إمضاء الزبون / Customer Signature</div>
    </div>
  </div>`;
  };

  const printInvoice = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
<!DOCTYPE html>
<html dir="ltr">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice?.invoice_number || ''}</title>
  <style>
    @page { size: A4; margin: 8mm 10mm; }
    ${getStyles()}
    @media print {
      body { padding: 0; background: #fff; }
      .no-break { page-break-inside: avoid; }
      table.items thead { display: table-header-group; }
      table.items tfoot { display: table-footer-group; }
    }
  </style>
</head>
<body>
  ${getBodyHtml()}
  <script>
    var img = document.querySelector('.logo-img');
    if (img && !img.complete) {
      img.onload = function() { window.print(); };
      img.onerror = function() { window.print(); };
    } else {
      window.onload = function() { window.print(); };
    }
  </script>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const downloadPdf = async () => {
    const filename = `Invoice-${invoice?.invoice_number || 'draft'}.pdf`;

    // Create a hidden container in the current page
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '210mm';
    container.style.background = '#fff';

    // Add styles inline
    const styleEl = document.createElement('style');
    styleEl.textContent = getStyles();
    container.appendChild(styleEl);

    // Add body content
    const content = document.createElement('div');
    content.className = 'invoice-container';
    content.innerHTML = getBodyHtml();
    container.appendChild(content);

    document.body.appendChild(container);

    // Wait for logo image to load
    const img = container.querySelector('.logo-img');
    if (img && !img.complete) {
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 3000); // fallback timeout
      });
    }

    try {
      await html2pdf()
        .set({
          margin: [8, 10, 8, 10],
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, letterRendering: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        })
        .from(content)
        .save();
    } finally {
      document.body.removeChild(container);
    }
  };

  return { printInvoice, downloadPdf };
};

export default SalesInvoicePrint;
