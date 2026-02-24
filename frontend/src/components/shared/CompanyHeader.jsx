import React from 'react';
import { useAuth } from '../../context/AuthContext';

/**
 * Unified Company Header for Reports and Invoices
 * Bilingual layout: English (left) | Logo (center) | Arabic (right)
 * Based on Michel Matar Trading Est. invoice template
 */
const CompanyHeader = ({ title, titleAr, subtitle }) => {
  const { currentOrg } = useAuth();
  
  // Company details from organization or defaults
  const companyEn = currentOrg?.name || 'Michel Matar Trading Est.';
  const companyAr = 'مؤسسة ميشال مطر التجارية';
  const addressEn = currentOrg?.address || 'Kafarakka El-Koura';
  const addressAr = 'كفر عقا - الكورة';
  const phone = currentOrg?.phone || '06/950751';
  const email = currentOrg?.email || 'ets.michelmatar@hotmail.com';
  const regNumber = currentOrg?.registration_number || '601-585164';
  
  return (
    <div className="company-header-wrapper mb-6" data-testid="company-header">
      {/* Main Header - Bilingual */}
      <div className="bg-gradient-to-r from-[#1a2744] via-[#1e3a5f] to-[#1a2744] rounded-lg p-5 text-white">
        <div className="flex items-center justify-between">
          {/* English Side (Left) */}
          <div className="flex-1 text-left">
            <h2 className="text-lg font-bold tracking-wide" style={{ fontFamily: 'Manrope, sans-serif' }}>
              {companyEn}
            </h2>
            <p className="text-xs text-blue-200 mt-1">{addressEn}</p>
            <div className="text-xs text-blue-300 mt-1 space-y-0.5">
              <p>Tel: {phone}</p>
              {email && <p>Email: {email}</p>}
            </div>
            {regNumber && (
              <p className="text-xs text-blue-200 mt-1">T.V.A.: {regNumber}</p>
            )}
          </div>
          
          {/* Center Logo */}
          <div className="flex-shrink-0 mx-6 text-center">
            <div className="w-16 h-16 rounded-full bg-white/10 border-2 border-blue-300/40 flex items-center justify-center">
              <span className="text-2xl font-bold text-blue-200" style={{ fontFamily: 'Manrope, sans-serif' }}>
                MM
              </span>
            </div>
            {title && (
              <div className="mt-2">
                <h3 className="text-sm font-semibold text-blue-100">{title}</h3>
                {titleAr && (
                  <p className="text-xs text-blue-200" dir="rtl">{titleAr}</p>
                )}
              </div>
            )}
          </div>
          
          {/* Arabic Side (Right) */}
          <div className="flex-1 text-right" dir="rtl">
            <h2 className="text-lg font-bold tracking-wide" style={{ fontFamily: 'system-ui, sans-serif' }}>
              {companyAr}
            </h2>
            <p className="text-xs text-blue-200 mt-1">{addressAr}</p>
            <div className="text-xs text-blue-300 mt-1 space-y-0.5">
              <p>تلفون: {phone}</p>
              {email && <p>بريد: {email}</p>}
            </div>
            {regNumber && (
              <p className="text-xs text-blue-200 mt-1">ض.ق.م.: {regNumber}</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Subtitle bar */}
      {subtitle && (
        <div className="bg-[#1e3a5f]/20 border-b border-[#1e3a5f]/30 px-4 py-2 rounded-b-lg -mt-1">
          <p className="text-xs text-center text-muted-foreground">{subtitle}</p>
        </div>
      )}
    </div>
  );
};

export default CompanyHeader;
