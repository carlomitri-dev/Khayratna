/**
 * Print Button Component
 * Reusable print functionality with customizable content
 */
import React from 'react';
import { Button } from '../ui/button';
import { Printer } from 'lucide-react';

const PrintButton = ({
  onClick,
  label = 'Print',
  variant = 'outline',
  size = 'sm',
  className = '',
  disabled = false
}) => {
  return (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      <Printer className="w-4 h-4 mr-2" />
      {label}
    </Button>
  );
};

// Utility function to open print window with HTML content
export const openPrintWindow = (htmlContent, title = 'Print') => {
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.title = title;
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  }
};

export default PrintButton;
