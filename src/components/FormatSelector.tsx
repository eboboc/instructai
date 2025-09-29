import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface FormatSelectorProps {
  availableFormats: string[];
  selectedFormat: string;
  onFormatChange: (format: string) => void;
  className?: string;
}

export const FormatSelector: React.FC<FormatSelectorProps> = ({
  availableFormats,
  selectedFormat,
  onFormatChange,
  className = ""
}) => {
  if (availableFormats.length === 0) {
    return (
      <div className={`text-center p-4 ${className}`}>
        <p className="text-muted-foreground mb-2">No formats configured in your profile</p>
        <Badge variant="outline">Set up your teaching formats in Settings</Badge>
      </div>
    );
  }

  if (availableFormats.length === 1) {
    return (
      <div className={`text-center ${className}`}>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {availableFormats[0]}
        </Badge>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="text-sm font-medium text-foreground">
        Select Format:
      </label>
      <Select value={selectedFormat} onValueChange={onFormatChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose your teaching format" />
        </SelectTrigger>
        <SelectContent>
          {availableFormats.map((format) => (
            <SelectItem key={format} value={format}>
              {format}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};