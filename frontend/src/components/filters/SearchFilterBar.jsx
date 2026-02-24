import React from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Search, Filter, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

/**
 * Reusable Search and Filter Bar Component
 * Used across invoice lists, voucher lists, etc.
 */
const SearchFilterBar = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters = [],
  onClearFilters,
  showClearButton = true,
  className = ''
}) => {
  const hasActiveFilters = filters.some(f => f.value && f.value !== 'all');

  return (
    <div className={`flex flex-col lg:flex-row gap-3 ${className}`}>
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filter Selects */}
      <div className="flex gap-2 flex-wrap">
        {filters.map((filter, index) => (
          <Select
            key={index}
            value={filter.value}
            onValueChange={filter.onChange}
          >
            <SelectTrigger className="w-[140px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder={filter.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        {/* Clear Filters Button */}
        {showClearButton && hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="text-muted-foreground"
          >
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
};

export default SearchFilterBar;
