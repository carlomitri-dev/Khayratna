import React, { useState } from 'react';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { ArrowRight, Check, Columns } from 'lucide-react';

/**
 * Field Mapping component - lets user match Excel columns to system fields
 */
const FieldMapper = ({ headers, sampleRows, systemFields, onConfirm, onCancel }) => {
  // Auto-detect mapping based on header name matching
  const autoDetect = () => {
    const map = {};
    systemFields.forEach(field => {
      // Try to match by keywords
      const keywords = field.keywords || [field.label.toLowerCase()];
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i].toLowerCase();
        if (keywords.some(kw => h.includes(kw.toLowerCase()))) {
          if (!Object.values(map).includes(String(i))) {
            map[field.key] = String(i);
            break;
          }
        }
      }
      // Use default if not matched
      if (!map[field.key] && field.defaultCol !== undefined) {
        map[field.key] = String(field.defaultCol);
      }
    });
    return map;
  };

  const [mapping, setMapping] = useState(() => autoDetect());

  const updateMapping = (fieldKey, colIndex) => {
    setMapping(prev => ({ ...prev, [fieldKey]: colIndex }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Columns className="w-4 h-4 text-blue-500" />
        <span>Match Excel Columns to System Fields</span>
      </div>

      {/* Mapping Grid */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {systemFields.map(field => (
          <div key={field.key} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 border">
            <div className="w-[140px] flex-shrink-0">
              <Label className="text-xs font-medium">
                {field.label}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </Label>
            </div>
            <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <div className="flex-1">
              <Select value={mapping[field.key] || ''} onValueChange={(v) => updateMapping(field.key, v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="— Skip —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-1">— Skip (don't import) —</SelectItem>
                  {headers.map((h, i) => (
                    <SelectItem key={i} value={String(i)}>
                      <span className="font-mono text-xs mr-1">[{i}]</span> {h}
                      {sampleRows[0] && sampleRows[0][i] && (
                        <span className="text-muted-foreground ml-2">({String(sampleRows[0][i]).substring(0, 20)})</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>

      {/* Sample Data Preview */}
      {sampleRows.length > 0 && (
        <div className="text-xs">
          <p className="font-medium text-muted-foreground mb-1">Sample Data Preview:</p>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100">
                  {headers.map((h, i) => (
                    <th key={i} className="px-2 py-1 text-left font-medium whitespace-nowrap border-r last:border-r-0">
                      <span className="font-mono text-muted-foreground">[{i}]</span> {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.slice(0, 2).map((row, ri) => (
                  <tr key={ri} className="border-t">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2 py-1 whitespace-nowrap border-r last:border-r-0 max-w-[120px] truncate">
                        {cell || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onConfirm(mapping)}>
          <Check className="w-3 h-3 mr-1" />
          Confirm Mapping & Import
        </Button>
      </div>
    </div>
  );
};

export default FieldMapper;
