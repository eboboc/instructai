import React from 'react';
import { 
  Dumbbell, 
  Circle, 
  Square, 
  Triangle,
  Minus,
  RotateCw,
  Target,
  Box,
  Activity
} from 'lucide-react';

interface EquipmentItem {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}

const equipmentOptions: EquipmentItem[] = [
  { id: 'dumbbells', name: 'Dumbbells', icon: Dumbbell },
  { id: 'kettlebells', name: 'Kettlebells', icon: Circle },
  { id: 'resistance-bands', name: 'Resistance Bands', icon: Minus },
  { id: 'trx', name: 'TRX', icon: Triangle },
  { id: 'benches', name: 'Benches', icon: Square },
  { id: 'barbells', name: 'Barbells', icon: Minus },
  { id: 'bodyweight', name: 'Bodyweight Only', icon: Activity },
  { id: 'boxes', name: 'Plyo Boxes', icon: Box },
  { id: 'yoga-mats', name: 'Yoga Mats', icon: Square },
  { id: 'medicine-balls', name: 'Medicine Balls', icon: Circle },
  { id: 'foam-rollers', name: 'Foam Rollers', icon: RotateCw },
  { id: 'battle-ropes', name: 'Battle Ropes', icon: Minus },
  { id: 'pull-up-bar', name: 'Pull-up Bar', icon: Minus },
  { id: 'agility-ladders', name: 'Agility Ladders', icon: Target },
  { id: 'stability-balls', name: 'Stability Balls', icon: Circle }
];

interface EquipmentSelectorProps {
  selected: string[];
  onSelectionChange: (selected: string[]) => void;
}

export const EquipmentSelector: React.FC<EquipmentSelectorProps> = ({
  selected,
  onSelectionChange
}) => {
  const toggleEquipment = (equipmentId: string) => {
    if (selected.includes(equipmentId)) {
      onSelectionChange(selected.filter(id => id !== equipmentId));
    } else {
      onSelectionChange([...selected, equipmentId]);
    }
  };

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mt-2">
      {equipmentOptions.map((equipment) => {
        const Icon = equipment.icon;
        const isSelected = selected.includes(equipment.id);
        
        return (
          <button
            key={equipment.id}
            onClick={() => toggleEquipment(equipment.id)}
            className={`
              flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all
              ${isSelected 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border hover:border-primary/50 hover:bg-muted/50 text-muted-foreground hover:text-foreground'
              }
            `}
          >
            <Icon className="w-6 h-6 mb-2" />
            <span className="text-xs text-center font-medium leading-tight">
              {equipment.name}
            </span>
          </button>
        );
      })}
    </div>
  );
};