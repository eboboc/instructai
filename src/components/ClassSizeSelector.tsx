import React from 'react';
import { Users } from 'lucide-react';

interface ClassSize {
  id: string;
  name: string;
  range: string;
  figures: number;
}

const classSizeOptions: ClassSize[] = [
  { id: 'small', name: 'Small', range: 'up to 10', figures: 3 },
  { id: 'medium', name: 'Medium', range: '11-20', figures: 6 },
  { id: 'large', name: 'Large', range: '21-40', figures: 12 },
  { id: 'huge', name: 'Huge', range: '40+', figures: 20 },
  { id: 'open', name: 'Open Gym', range: 'varies', figures: 8 }
];

interface ClassSizeSelectorProps {
  selected: string;
  onSelect: (size: string) => void;
}

const FigureIcon: React.FC<{ count: number; isSelected: boolean }> = ({ count, isSelected }) => {
  return (
    <div className="flex flex-wrap justify-center gap-1 mb-2">
      {Array.from({ length: Math.min(count, 12) }).map((_, index) => (
        <div
          key={index}
          className={`w-3 h-3 rounded-full transition-colors ${
            isSelected ? 'bg-primary' : 'bg-muted-foreground'
          }`}
        />
      ))}
      {count > 12 && (
        <div className={`text-xs ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
          +{count - 12}
        </div>
      )}
    </div>
  );
};

export const ClassSizeSelector: React.FC<ClassSizeSelectorProps> = ({
  selected,
  onSelect
}) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mt-2">
      {classSizeOptions.map((size) => {
        const isSelected = selected === size.id;
        
        return (
          <button
            key={size.id}
            onClick={() => onSelect(size.id)}
            className={`
              flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all min-h-[100px]
              ${isSelected 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border hover:border-primary/50 hover:bg-muted/50 text-muted-foreground hover:text-foreground'
              }
            `}
          >
            <FigureIcon count={size.figures} isSelected={isSelected} />
            <span className="text-sm font-medium mb-1">{size.name}</span>
            <span className="text-xs opacity-75">{size.range}</span>
          </button>
        );
      })}
    </div>
  );
};