import React from 'react';
import { Delete, Check, X } from 'lucide-react';

/**
 * On-screen numeric keypad for touch screen POS
 */
const NumPad = ({ value, onChange, onClose, onConfirm, currency = 'USD', showDecimal = true }) => {
  const handleKeyPress = (key) => {
    if (key === 'backspace') {
      onChange(value.slice(0, -1));
    } else if (key === 'clear') {
      onChange('');
    } else if (key === '.') {
      if (!value.includes('.') && showDecimal) {
        onChange(value + '.');
      }
    } else {
      // Limit decimal places
      if (value.includes('.')) {
        const parts = value.split('.');
        if (currency === 'LBP' || parts[1].length >= 2) return;
      }
      onChange(value + key);
    }
  };

  const keys = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    [showDecimal ? '.' : 'clear', '0', 'backspace']
  ];

  const quickAmounts = currency === 'USD' 
    ? ['5', '10', '20', '50', '100'] 
    : ['50000', '100000', '500000', '1000000'];

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div 
        className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-4 text-white">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium opacity-80">Enter Amount ({currency})</span>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="text-3xl font-bold mt-2 font-mono">
            {currency === 'USD' ? '$' : ''}{value || '0'}{currency === 'LBP' ? ' L.L' : ''}
          </div>
        </div>

        {/* Quick Amount Buttons */}
        <div className="p-3 bg-gray-50 flex gap-2 overflow-x-auto">
          {quickAmounts.map((amount) => (
            <button
              key={amount}
              onClick={() => onChange(amount)}
              className="flex-shrink-0 px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:bg-emerald-50 hover:border-emerald-300 active:scale-95 transition-all"
            >
              {currency === 'USD' ? '$' : ''}{parseInt(amount).toLocaleString()}{currency === 'LBP' ? ' L.L' : ''}
            </button>
          ))}
        </div>

        {/* Keypad */}
        <div className="p-3 grid grid-cols-3 gap-2">
          {keys.map((row, rowIndex) => (
            row.map((key, keyIndex) => (
              <button
                key={`${rowIndex}-${keyIndex}`}
                onClick={() => handleKeyPress(key)}
                className={`h-16 rounded-xl text-2xl font-bold flex items-center justify-center transition-all active:scale-95 ${
                  key === 'backspace' 
                    ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                    : key === 'clear' 
                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 text-base'
                    : key === '.'
                    ? 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                    : 'bg-gray-50 text-gray-800 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {key === 'backspace' ? (
                  <Delete className="w-6 h-6" />
                ) : key === 'clear' ? (
                  'Clear'
                ) : (
                  key
                )}
              </button>
            ))
          ))}
        </div>

        {/* Confirm Button */}
        <div className="p-3 pt-0">
          <button
            onClick={onConfirm}
            className="w-full h-14 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-lg font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-emerald-500/30"
          >
            <Check className="w-6 h-6" />
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default NumPad;
