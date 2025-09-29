import React, { useState } from 'react';
import { Button } from './ui/button';
import { Save, Check, Loader2 } from 'lucide-react';
import { AnyClassPlan } from '@/types/timer';
import { SavedClassesService } from '@/services/savedClassesService';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';

interface SaveWorkoutButtonProps {
  plan: AnyClassPlan;
  format: string;
}

export const SaveWorkoutButton: React.FC<SaveWorkoutButtonProps> = ({ plan, format }) => {
  const [isSaved, setIsSaved] = useState(false);
  const navigate = useNavigate();
  
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    
    try {
      SavedClassesService.saveToLocalStorage(plan, format);
      setIsSaved(true);
      
      toast({
        title: "Workout Saved",
        description: "Your workout has been saved to your library.",
      });
      
      // Navigate to saved classes after a short delay
      setTimeout(() => {
        navigate('/saved-classes');
      }, 1500);
    } catch (error) {
      console.error('Error saving workout:', error);
      toast({
        title: "Error Saving Workout",
        description: "There was a problem saving your workout.",
        variant: "destructive",
      });
      setIsSaving(false);
    }
  };
  
  if (isSaved) {
    return (
      <Button 
        disabled
        className="w-full text-lg py-6 bg-green-600 hover:bg-green-700"
        size="lg"
      >
        <Check className="w-5 h-5 mr-2" />
        Workout Saved!
      </Button>
    );
  }
  
  return (
    <Button 
      onClick={handleSave}
      className="w-full text-lg py-6"
      size="lg"
      disabled={isSaving}
    >
      {isSaving ? (
        <>
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Saving Workout...
        </>
      ) : (
        <>
          <Save className="w-5 h-5 mr-2" />
          Save This Workout
        </>
      )}
    </Button>
  );
};
