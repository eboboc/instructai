import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timer } from '../components/Timer';
import { AIWorkoutGenerator } from '../components/AIWorkoutGenerator';
import { ProgramOutline } from '../components/ProgramOutline';
import { BottomNavigation } from '../components/BottomNavigation';
import { AnyClassPlan, FlattenedInterval } from '../types/timer';
import { AIGenerationRequest } from '@/services/aiWorkoutGenerator';
import { flattenClassPlan, calculateTotalDuration } from '../utils/timerUtils';
import { Button } from '../components/ui/button';
import { ArrowLeft, Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '../components/ui/sheet';

const Index = () => {
  const navigate = useNavigate();
  const [classPlan, setClassPlan] = useState<AnyClassPlan | null>(null);
  const [intervals, setIntervals] = useState<FlattenedInterval[]>([]);
  const [currentIntervalIndex, setCurrentIntervalIndex] = useState(0);
  const [showOutline, setShowOutline] = useState(false);
  const [breakDuration, setBreakDuration] = useState<number | 'manual'>('manual');
  const [availableFormats, setAvailableFormats] = useState<string[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [hasSavedWorkout, setHasSavedWorkout] = useState(false);
  const [savedWorkoutFormat, setSavedWorkoutFormat] = useState<string>('');
  const [isGeneratingWorkout, setIsGeneratingWorkout] = useState(false);

  useEffect(() => {
    // Reset any ongoing workout generation state
    localStorage.removeItem('workout_generation_status');
    localStorage.removeItem('workout_generation_timestamp');
    setIsGeneratingWorkout(false);
    
    // Always provide all default formats for selection
    const defaultFormats = ['HIIT', 'Strength and Conditioning', 'Yoga', 'Pilates', 'Cardio', 'CrossFit', 'Bootcamp'];
    setAvailableFormats(defaultFormats);
    
    // Load saved current format if it exists
    const savedProfile = localStorage.getItem('instructorProfile');
    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile);
        const currentFormat = profile.currentFormat;
        if (currentFormat && defaultFormats.includes(currentFormat)) {
          setSelectedFormat(currentFormat);
        } else {
          setSelectedFormat(defaultFormats[0]);
        }
      } catch (error) {
        console.error('Error loading instructor profile:', error);
        setSelectedFormat(defaultFormats[0]);
      }
    } else {
      setSelectedFormat(defaultFormats[0]);
    }
    
    // Check for selected saved class from session storage
    const selectedClassJson = sessionStorage.getItem('selected_class');
    if (selectedClassJson) {
      try {
        const selectedClass = JSON.parse(selectedClassJson);
        setClassPlan(selectedClass.plan);
        const flatIntervals = flattenClassPlan(selectedClass.plan);
        setIntervals(flatIntervals);
        setCurrentIntervalIndex(0);
        
        // Clear the selected class from session storage
        sessionStorage.removeItem('selected_class');
      } catch (error) {
        console.error('Error loading selected class:', error);
      }
    }
    
    // Check for current workout in localStorage (for tab switching recovery)
    const currentWorkoutJson = localStorage.getItem('current_workout');
    
    // Completely disable automatic workout loading
    // Only show the "Load Saved Workout" button if a workout exists
    const shouldAutoLoad = false;
    
    // Check if a workout is currently being generated
    const generationStatus = localStorage.getItem('workout_generation_status');
    const generationTimestamp = localStorage.getItem('workout_generation_timestamp');
    
    // Check if the generation status is stale (older than 5 minutes)
    let isStaleGeneration = false;
    if (generationTimestamp) {
      const timestamp = new Date(generationTimestamp);
      const now = new Date();
      isStaleGeneration = (now.getTime() - timestamp.getTime()) > 300000; // 5 minutes
    }
    
    if (generationStatus === 'generating' && !isStaleGeneration) {
      setIsGeneratingWorkout(true);
    } else {
      // Clear stale generation status
      if (generationStatus === 'generating') {
        localStorage.removeItem('workout_generation_status');
        localStorage.removeItem('workout_generation_timestamp');
      }
      setIsGeneratingWorkout(false);
    }
    
    if (currentWorkoutJson) {
      try {
        const currentWorkout = JSON.parse(currentWorkoutJson);
        
        // Check if the workout was generated recently (within the last hour)
        const timestamp = new Date(currentWorkout.timestamp);
        const now = new Date();
        const isRecent = (now.getTime() - timestamp.getTime()) < 3600000; // 1 hour in milliseconds
        
        if (isRecent) {
          // Set the saved workout flag and format
          setHasSavedWorkout(true);
          setSavedWorkoutFormat(currentWorkout.format || 'Workout');
          
          // If autoload is requested, load the workout
          if (!classPlan && shouldAutoLoad) {
            setClassPlan(currentWorkout.plan);
            if (currentWorkout.format) {
              setSelectedFormat(currentWorkout.format);
            }
            const flatIntervals = flattenClassPlan(currentWorkout.plan);
            setIntervals(flatIntervals);
            setCurrentIntervalIndex(0);
          }
        } else {
          // If the workout is old, remove it
          localStorage.removeItem('current_workout');
        }
      } catch (error) {
        console.error('Error loading current workout:', error);
      }
    }
  }, []);
  
  // Effect to periodically check if workout generation has completed
  useEffect(() => {
    // Only run this effect if we're currently generating a workout
    if (!isGeneratingWorkout) return;
    
    console.log('Starting workout generation monitoring...');
    
    // Set up an interval to check the generation status
    const checkInterval = setInterval(() => {
      console.log('Checking workout generation status...');
      const generationStatus = localStorage.getItem('workout_generation_status');
      
      // If generation is complete, check for the workout
      if (generationStatus === 'completed') {
        console.log('Workout generation completed!');
        setIsGeneratingWorkout(false);
        
        // Check if a workout was generated
        const currentWorkoutJson = localStorage.getItem('current_workout');
        if (currentWorkoutJson) {
          try {
            console.log('Workout generated and saved to localStorage');
            // Just update the saved workout flag and format, but don't auto-load
            const currentWorkout = JSON.parse(currentWorkoutJson);
            setHasSavedWorkout(true);
            setSavedWorkoutFormat(currentWorkout.format || 'Workout');
            
            // Never automatically load the workout
            // Just update the UI to show that a workout is available
            console.log('Workout generated and available to load');
          } catch (error) {
            console.error('Error processing generated workout:', error);
          }
        } else {
          console.warn('No workout found in localStorage after generation completed');
        }
      }
    }, 1000); // Check every second
    
    // Set a timeout to force completion if it takes too long (3 minutes)
    const timeoutId = setTimeout(() => {
      console.warn('Workout generation timeout reached (3 minutes)');
      
      // If we're still generating, force it to complete with a fallback
      if (localStorage.getItem('workout_generation_status') === 'generating') {
        console.log('Forcing workout generation to complete with fallback...');
        
        // Create a simple fallback workout
        const fallbackPlan = {
          version: 'enhanced',
          metadata: {
            class_name: `${selectedFormat} Workout`,
            duration_min: 45,
            modality: selectedFormat,
            level: 'All Levels',
            intensity_curve: 'RPE 5/10 throughout'
          },
          blocks: [
            {
              id: 'warmup',
              name: 'Dynamic Warm-Up',
              type: 'WARMUP',
              duration: '10 min',
              pattern: 'Light cardio + mobility',
              timeline: ['60s | Jumping Jacks', '60s | Arm Circles', '60s | Squats', '60s | Rest', '60s | Lunges', 
                        '60s | High Knees', '60s | Butt Kicks', '60s | Side Lunges', '60s | Arm Swings', '60s | Hip Circles'],
              cues: ['Move smoothly', 'Control your breathing'],
              target_muscles: { full_body: 100 }
            },
            {
              id: 'main',
              name: 'Main Workout Block',
              type: 'INTERVAL',
              duration: '25 min',
              pattern: 'Strength + cardio intervals',
              timeline: Array(25).fill(0).map((_, i) => `60s | Exercise ${i+1}`),
              cues: ['Keep form tight', 'Breathe through the movement', 'Modify as needed'],
              target_muscles: { full_body: 100 }
            },
            {
              id: 'cooldown',
              name: 'Cool Down',
              type: 'COOLDOWN',
              duration: '10 min',
              pattern: 'Static stretches',
              timeline: ['60s | Hamstring Stretch', '60s | Quad Stretch', '60s | Chest Stretch',
                        '60s | Child\'s Pose', '60s | Deep Breathing', '60s | Hip Flexor Stretch', 
                        '60s | Calf Stretch', '60s | Tricep Stretch', '60s | Spinal Twist', '60s | Final Relaxation'],
              cues: ['Hold each stretch', 'Breathe deeply', 'Relax into the stretch'],
              target_muscles: { full_body: 100 }
            }
          ],
          time_audit: {
            sum_min: 45,
            buffer_min: 0
          }
        };
        
        // Save the fallback workout to localStorage
        localStorage.setItem('current_workout', JSON.stringify({
          plan: fallbackPlan,
          format: selectedFormat,
          timestamp: new Date().toISOString()
        }));
        
        // Mark generation as complete
        localStorage.setItem('workout_generation_status', 'completed');
        
        // Update the UI
        setIsGeneratingWorkout(false);
        setClassPlan(fallbackPlan);
        const flatIntervals = flattenClassPlan(fallbackPlan);
        setIntervals(flatIntervals);
        setCurrentIntervalIndex(0);
        
        console.log('Fallback workout loaded due to timeout');
      }
    }, 180000); // 3 minutes timeout
    
    // Clean up the interval and timeout when the component unmounts or when generation completes
    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeoutId);
    };
  }, [isGeneratingWorkout, selectedFormat]);

  const handleGenerateRequest = async (request: AIGenerationRequest) => {
    // Navigate immediately to ClassBuilder with the request
    // ClassBuilder will handle the generation asynchronously
    navigate('/class-builder', { 
      state: { 
        request,
        format: selectedFormat 
      } 
    });
  };

  const handleBackToLoader = () => {
    setClassPlan(null);
    setIntervals([]);
    setCurrentIntervalIndex(0);
    
    // Clear the current workout from localStorage
    localStorage.removeItem('current_workout');
  };


  const handleOutlineIntervalClick = (index: number) => {
    setCurrentIntervalIndex(index);
    setShowOutline(false);
  };
  
  const handleLoadSavedWorkout = () => {
    const currentWorkoutJson = localStorage.getItem('current_workout');
    if (currentWorkoutJson) {
      try {
        const currentWorkout = JSON.parse(currentWorkoutJson);
        setClassPlan(currentWorkout.plan);
        if (currentWorkout.format) {
          setSelectedFormat(currentWorkout.format);
        }
        const flatIntervals = flattenClassPlan(currentWorkout.plan);
        setIntervals(flatIntervals);
        setCurrentIntervalIndex(0);
      } catch (error) {
        console.error('Error loading saved workout:', error);
      }
    }
  };

  if (!classPlan) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Main content area */}
        <div className="flex-1 flex items-center justify-center p-4 pb-20">
          <div className="w-full max-w-4xl">
            <div className="text-center mb-8">
              <h1 className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-primary via-blue-500 to-purple-600 bg-clip-text text-transparent">
                Instruct AI
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
                The AI fitness bot that powers live group fitness classes.
              </p>
            </div>

            
            {isGeneratingWorkout && (
              <div className="mb-8 p-4 border border-primary/30 bg-primary/5 rounded-lg">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">Your workout is being generated</h3>
                    <p className="text-muted-foreground">Please wait while we create your personalized workout...</p>
                  </div>
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                </div>
              </div>
            )}
            
            {hasSavedWorkout && !isGeneratingWorkout && (
              <div className="mb-8 p-4 border border-primary/30 bg-primary/5 rounded-lg">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">You have a saved {savedWorkoutFormat} workout</h3>
                    <p className="text-muted-foreground">Would you like to continue where you left off?</p>
                  </div>
                  <Button onClick={handleLoadSavedWorkout} className="whitespace-nowrap">
                    Load Saved Workout
                  </Button>
                </div>
              </div>
            )}
            
            
            <AIWorkoutGenerator 
              onGenerateRequest={handleGenerateRequest} 
              format={selectedFormat}
              availableFormats={availableFormats}
              onFormatChange={setSelectedFormat}
            />
          </div>
        </div>
        
        {/* Bottom Navigation - Always visible */}
        <BottomNavigation />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-80 border-r bg-card">
        <div className="p-4 border-b">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/class-builder', { state: { plan: classPlan } })}
            className="mb-4 w-full justify-start"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Builder
          </Button>
        </div>
        
        <ProgramOutline
          intervals={intervals}
          currentIndex={currentIntervalIndex}
          totalDuration={calculateTotalDuration(intervals)}
          breakDuration={breakDuration}
          onIntervalClick={handleOutlineIntervalClick}
        />
      </div>

      {/* Main Timer Area */}
      <div className="flex-1 relative">
        {/* Mobile Menu Button */}
        <div className="lg:hidden absolute top-4 left-4 z-50">
          <Sheet open={showOutline} onOpenChange={setShowOutline}>
            <SheetTrigger asChild>
              <Button 
                variant="outline" 
                size="icon"
                className="bg-white/10 border-white/30 text-white hover:bg-white/20"
              >
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <div className="p-4 border-b">
                <Button 
                  variant="ghost" 
                  onClick={() => navigate('/class-builder', { state: { plan: classPlan } })}
                  className="mb-4 w-full justify-start"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Builder
                </Button>
              </div>
              
              <ProgramOutline
                intervals={intervals}
                currentIndex={currentIntervalIndex}
                totalDuration={calculateTotalDuration(intervals)}
                breakDuration={breakDuration}
                onIntervalClick={handleOutlineIntervalClick}
              />
            </SheetContent>
          </Sheet>
        </div>

        <Timer 
          classPlan={classPlan} 
          breakDuration={breakDuration}
          format={selectedFormat}
          onIntervalChange={(index) => {
            setCurrentIntervalIndex(index);
          }}
        />
        
        <BottomNavigation />
      </div>
    </div>
  );
};

export default Index;
