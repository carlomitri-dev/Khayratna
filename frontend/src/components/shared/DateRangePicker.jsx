/**
 * Date Range Picker Component
 * Used for filtering data by date range
 */
import React from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Calendar } from 'lucide-react';

const DateRangePicker = ({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  fromLabel = 'From',
  toLabel = 'To',
  className = ''
}) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-center gap-1">
        <Label className="text-xs text-muted-foreground">{fromLabel}:</Label>
        <div className="relative">
          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
            className="h-8 w-32 text-xs pl-7"
          />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Label className="text-xs text-muted-foreground">{toLabel}:</Label>
        <div className="relative">
          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            type="date"
            value={toDate}
            onChange={(e) => onToDateChange(e.target.value)}
            className="h-8 w-32 text-xs pl-7"
          />
        </div>
      </div>
    </div>
  );
};

export default DateRangePicker;
