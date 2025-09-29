import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { SavedClass, SavedClassesService } from '@/services/savedClassesService';
import { formatDistanceToNow } from 'date-fns';
import { Clock, Trash2, Play, Loader2 } from 'lucide-react';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

interface SavedClassesProps {
  onLoadClass: (savedClass: SavedClass) => void;
}

export const SavedClasses: React.FC<SavedClassesProps> = ({ onLoadClass }) => {
  const [savedClasses, setSavedClasses] = useState<SavedClass[]>([]);
  const [classToDelete, setClassToDelete] = useState<SavedClass | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  
  useEffect(() => {
    // Load saved classes when component mounts
    loadSavedClasses();
  }, []);
  
  const loadSavedClasses = () => {
    setLoading(true);
    try {
      const classes = SavedClassesService.getLocalSavedClasses();
      setSavedClasses(classes);
    } catch (error) {
      console.error('Error loading saved classes:', error);
      setSavedClasses([]);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeleteClass = (id: string) => {
    setDeleting(true);
    try {
      const success = SavedClassesService.deleteLocalClass(id);
      if (success) {
        loadSavedClasses();
      }
    } catch (error) {
      console.error('Error deleting class:', error);
    } finally {
      setDeleting(false);
      setClassToDelete(null);
    }
  };
  
  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (e) {
      return 'Unknown date';
    }
  };
  
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-[60vh]">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <h2 className="text-xl font-medium">Loading saved workouts...</h2>
      </div>
    );
  }

  if (savedClasses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-[60vh]">
        <div className="mb-4">
          <Clock className="h-12 w-12 text-muted-foreground mx-auto" />
        </div>
        <h2 className="text-2xl font-bold mb-2">No Saved Classes Yet</h2>
        <p className="text-muted-foreground max-w-md">
          Generate a workout and save it to see it here. Your saved classes will be stored on this device.
        </p>
      </div>
    );
  }
  
  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Your Saved Classes</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {savedClasses.map(savedClass => (
          <Card key={savedClass.id} className="p-4 flex flex-col">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-lg font-semibold">{savedClass.name}</h3>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setClassToDelete(savedClass)}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="text-sm text-muted-foreground mb-4 flex-1">
              <p>{savedClass.format} • {savedClass.duration} min</p>
              <p>Created {formatDate(savedClass.createdAt)}</p>
            </div>
            
            <Button 
              onClick={() => onLoadClass(savedClass)} 
              className="w-full"
            >
              <Play className="h-4 w-4 mr-2" /> Start Workout
            </Button>
          </Card>
        ))}
      </div>
      
      <AlertDialog open={!!classToDelete} onOpenChange={(open) => !open && setClassToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved workout?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{classToDelete?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => classToDelete && handleDeleteClass(classToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
