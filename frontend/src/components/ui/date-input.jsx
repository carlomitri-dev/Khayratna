import React, { useState, useRef, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * DateInput Component
 * A custom date input that displays dates in dd-mm-yyyy format
 * Uses a hidden native date picker for the calendar functionality
 */
const DateInput = React.forwardRef(({ 
  value, 
  onChange, 
  className,
  placeholder = "Select date",
  disabled = false,
  required = false,
  ...props 
}, ref) => {
  const hiddenInputRef = useRef(null);
  const [displayValue, setDisplayValue] = useState('');

  // Format date from yyyy-mm-dd to dd-mm-yyyy for display
  const formatForDisplay = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  // Format date from dd-mm-yyyy to yyyy-mm-dd for storage
  const formatForStorage = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  // Update display value when value changes
  useEffect(() => {
    setDisplayValue(formatForDisplay(value));
  }, [value]);

  // Handle click on the visible input - open the date picker
  const handleClick = () => {
    if (hiddenInputRef.current && !disabled) {
      hiddenInputRef.current.showPicker();
    }
  };

  // Handle change from the native date picker
  const handleDateChange = (e) => {
    const newValue = e.target.value;
    setDisplayValue(formatForDisplay(newValue));
    if (onChange) {
      // Create a synthetic event with the correct value format
      const syntheticEvent = {
        ...e,
        target: {
          ...e.target,
          value: newValue
        }
      };
      onChange(syntheticEvent);
    }
  };

  // Handle manual input in dd-mm-yyyy format
  const handleInputChange = (e) => {
    const inputValue = e.target.value;
    setDisplayValue(inputValue);
    
    // Try to parse dd-mm-yyyy format
    const match = inputValue.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (match) {
      const [, day, month, year] = match;
      const isoDate = `${year}-${month}-${day}`;
      // Validate the date
      const dateObj = new Date(isoDate);
      if (!isNaN(dateObj.getTime())) {
        if (onChange) {
          const syntheticEvent = {
            target: { value: isoDate }
          };
          onChange(syntheticEvent);
        }
      }
    }
  };

  return (
    <div className="relative">
      {/* Visible input showing dd-mm-yyyy */}
      <input
        ref={ref}
        type="text"
        value={displayValue}
        onChange={handleInputChange}
        onClick={handleClick}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm pr-10",
          className
        )}
        {...props}
      />
      
      {/* Calendar icon button */}
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <Calendar className="h-4 w-4" />
      </button>
      
      {/* Hidden native date input for the calendar picker */}
      <input
        ref={hiddenInputRef}
        type="date"
        value={value || ''}
        onChange={handleDateChange}
        className="sr-only absolute opacity-0 w-0 h-0"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
});

DateInput.displayName = 'DateInput';

export { DateInput };
