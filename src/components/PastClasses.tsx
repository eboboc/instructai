import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getUserWorkouts, deleteWorkout } from '@/services/firebase';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Play, Trash2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import * as logger from '@/utils/logger';

export const PastClasses: React.FC = () => {
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWorkouts();
  }, [currentUser]);

  const fetchWorkouts = async () => {
    if (!currentUser) {
      setWorkouts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      logger.info('PastClasses', 'Fetching user workouts');
      const result = await getUserWorkouts(currentUser.uid);
      
      if (result.error) {
        logger.error('PastClasses', 'Error fetching workouts', { error: result.error });
        setError(result.error);
      } else {
        logger.info('PastClasses', 'Workouts fetched successfully', { count: result.data.length });
        // Sort workouts by creation date (newest first)
        const sortedWorkouts = result.data.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
          const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
          return dateB.getTime() - dateA.getTime();
        });
        setWorkouts(sortedWorkouts);
      }
    } catch (err: any) {
      logger.error('PastClasses', 'Failed to fetch workouts', { error: err.message });
      setError(`Failed to fetch workouts: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayWorkout = (workout: any) => {
    // Store the workout in localStorage
    localStorage.setItem('current_workout', JSON.stringify({
      plan: workout.plan,
      format: workout.format || 'Workout',
      timestamp: new Date().toISOString()
    }));
    
    // Navigate to the app page
    navigate('/app');
  };

  const handleDeleteWorkout = async (workoutId: string) => {
    try {
      logger.info('PastClasses', 'Deleting workout', { workoutId });
      const result = await deleteWorkout(workoutId);
      
      if (result.error) {
        logger.error('PastClasses', 'Error deleting workout', { error: result.error });
        toast({
          title: "Delete Failed",
          description: result.error,
          variant: "destructive",
        });
      } else {
        logger.info('PastClasses', 'Workout deleted successfully');
        toast({
          title: "Workout Deleted",
          description: "The workout has been deleted successfully.",
        });
        // Refresh the workouts list
        fetchWorkouts();
      }
    } catch (err: any) {
      logger.error('PastClasses', 'Failed to delete workout', { error: err.message });
      toast({
        title: "Delete Failed",
        description: `Failed to delete workout: ${err.message}`,
        variant: "destructive",
      });
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown date';
    
    try {
      // Handle Firestore Timestamp
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleDateString();
      }
      
      // Handle regular date strings or objects
      return new Date(timestamp).toLocaleDateString();
    } catch (error) {
      return 'Invalid date';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (workouts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">You haven't saved any workouts yet.</p>
        <Button 
          onClick={() => navigate('/app')} 
          className="mt-4"
        >
          Create a Workout
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Your Saved Workouts</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {workouts.map((workout) => (
          <Card key={workout.id} className="overflow-hidden">
            <CardHeader className="bg-muted/50">
              <CardTitle>{workout.plan?.metadata?.class_name || 'Unnamed Workout'}</CardTitle>
              <CardDescription>
                {workout.format || workout.plan?.metadata?.modality || 'Workout'} • {workout.plan?.metadata?.duration_min || '??'} min
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {/* Show description for past classes */}
              {workout.source === 'past_class' && workout.description && (
                <div className="mb-4 p-3 bg-muted/30 rounded-md overflow-auto max-h-[300px]">
                  <pre className="text-sm whitespace-pre-wrap font-mono break-words">{workout.description}</pre>
                </div>
              )}
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Created:</span>
                  <span className="text-sm">{formatDate(workout.createdAt)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Type:</span>
                  <span className="text-sm">{workout.source === 'past_class' ? 'Past Class' : 'Generated Workout'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Intensity:</span>
                  <span className="text-sm">{workout.plan?.metadata?.intensity_curve || 'Standard'}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between bg-muted/30 border-t">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => handleDeleteWorkout(workout.id)}
                className="text-destructive hover:text-destructive/80 hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
              <Button 
                onClick={() => handlePlayWorkout(workout)}
                size="sm"
              >
                <Play className="w-4 h-4 mr-2" />
                Start Workout
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
};
