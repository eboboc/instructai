import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ArrowLeft, Send, Sparkles, Loader2 } from 'lucide-react';
import { usePlanStore } from '../state/planStore';
import { ClassPlanV1 } from '../ai/zodSchema';
import { toast } from '@/hooks/use-toast';
import { generateWorkout } from '../services/workoutBot';
import { convertToTimerFormatV1 } from '../utils/timerUtils';
import { AIGenerationRequest } from '../services/aiWorkoutGenerator';
import { SavedClassesService } from '../services/savedClassesService';

export default function ClassBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setPlan } = usePlanStore();
  const [plan, setEditablePlan] = useState<ClassPlanV1 | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastRequest, setLastRequest] = useState<AIGenerationRequest | null>(null);
  const [generationFailed, setGenerationFailed] = useState(false);
  const generationHasBeenTriggered = useRef(false);

  const handleGenerateWorkout = async (request: AIGenerationRequest) => {
    if (isGenerating) return;
    setEditablePlan(null);
    setGenerationFailed(false);
    setIsGenerating(true);

    const res = await generateWorkout(request);
    
    console.log('[UI RECEIVED PLAN]', { 
      total: res.plan.total_duration_sec, 
      firstItem: res.plan.blocks?.[0]?.timeline?.[0] 
    });

    // Ensure the plan is properly typed as ClassPlanV1
    const typedPlan: ClassPlanV1 = {
      class_name: res.plan.class_name || 'Workout',
      total_duration_sec: res.plan.total_duration_sec || 0,
      intensity_rpe: res.plan.intensity_rpe || 'Mixed',
      notes: res.plan.notes || '',
      safety: res.plan.safety || {
        avoided_movements_respected: true,
        substitutions: []
      },
      blocks: res.plan.blocks.map(block => ({
        label: block.label || block.type || 'Block', // Ensure label is always defined
        type: block.type || 'Block',
        duration_sec: block.duration_sec || 0,
        pattern: block.pattern,
        timeline: (block.timeline || []).map(item => ({
          name: item.name || 'Exercise',
          length_sec: item.length_sec || 0,
          rest: !!item.rest,
          start_sec: item.start_sec || 0,
          details: item.details
        }))
      }))
    };
    
    setPlan(typedPlan);
    setEditablePlan(typedPlan);
    setGenerationFailed(!res.ok);
    setIsGenerating(false);

    if (!res.ok) {
      toast({
        title: "Using Fallback Plan",
        description: res.error || "AI service was unavailable.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    // Check if there's a plan in the location state
    const planFromState = location.state?.plan;
    if (planFromState && !plan) {
      // If we received a plan directly, convert it to the proper format
      const typedPlan: ClassPlanV1 = {
        class_name: planFromState.class_name || 'Workout',
        total_duration_sec: planFromState.total_duration_sec || 0,
        intensity_rpe: planFromState.intensity_rpe || 'Mixed',
        notes: planFromState.notes || '',
        safety: planFromState.safety || {
          avoided_movements_respected: true,
          substitutions: []
        },
        blocks: (planFromState.blocks || []).map(block => ({
          label: block.label || block.type || 'Block',
          type: block.type || 'Block',
          duration_sec: block.duration_sec || 0,
          pattern: block.pattern,
          timeline: (block.timeline || []).map(item => ({
            name: item.name || 'Exercise',
            length_sec: item.length_sec || 0,
            rest: !!item.rest,
            start_sec: item.start_sec || 0,
            details: item.details
          }))
        }))
      };
      
      setPlan(typedPlan);
      setEditablePlan(typedPlan);
    }
    
    // Check if there's a request in the location state
    const request = location.state?.request;
    if (request && !generationHasBeenTriggered.current) {
      generationHasBeenTriggered.current = true;
      setLastRequest(request);
      handleGenerateWorkout(request);
    }
  }, [location.state, plan, setPlan]);

  const [isSaving, setIsSaving] = useState(false);
  const [workoutSent, setWorkoutSent] = useState(false);

  const handleSendToTimer = async () => {
    if (!plan) return;
    
    setIsSaving(true);
    
    try {
      // Convert the plan to timer format
      const timerPlan = convertToTimerFormatV1(plan);
      
      // Save the workout to Firebase/localStorage
      const format = location.state?.format || 'Workout';
      
      // Convert the plan to a format compatible with AnyClassPlan
      const savablePlan = {
        version: 'v1',
        class_name: plan.class_name,
        total_duration: plan.total_duration_sec,
        blocks: plan.blocks.map(block => ({
          id: block.label.toLowerCase().replace(/\s+/g, '_'),
          name: block.label,
          type: block.type,
          duration: `${Math.round(block.duration_sec / 60)} min`,
          duration_sec: block.duration_sec,
          pattern: block.pattern || '',
          timeline: block.timeline.map(item => 
            `${item.length_sec}s | ${item.name}${item.rest ? ' (Rest)' : ''}`
          )
        }))
      };
      
      await SavedClassesService.saveClass(savablePlan, format);
      
      // Store the timer plan in localStorage for the timer page to access later
      localStorage.setItem('current_timer_plan', JSON.stringify(timerPlan.planV2));
      
      // Navigate to the success page instead of directly to the timer
      navigate('/timer-success');
      
      // Show success message
      toast({
        title: "Workout Sent to Timer",
        description: "Your workout has been saved and sent to the timer.",
        duration: 3000,
      });
      
      // Update state to show the "Go Home" button
      setWorkoutSent(true);
    } catch (error) {
      console.error('Error saving workout:', error);
      
      // Show error message
      toast({
        title: "Error Saving Workout",
        description: "There was an error saving your workout, but you can still use the timer.",
        variant: "destructive",
        duration: 5000,
      });
      
      // Store the timer plan in localStorage for the timer page to access later
      const timerPlan = convertToTimerFormatV1(plan);
      localStorage.setItem('current_timer_plan', JSON.stringify(timerPlan.planV2));
      
      // Navigate to the success page instead
      navigate('/timer-success');
    } finally {
      setIsSaving(false);
    }
  };

  if (isGenerating || !plan) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <h2 className="text-2xl font-bold">Generating Your Workout</h2>
          <p className="text-muted-foreground">Please wait while we create your personalized class...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => navigate(-1)} className="flex items-center space-x-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
            <h1 className="text-xl font-semibold">Review & Edit</h1>
            {!workoutSent ? (
              <Button 
                onClick={handleSendToTimer} 
                size="lg" 
                className="px-6" 
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send to Timer
                  </>
                )}
              </Button>
            ) : (
              <Button 
                onClick={() => navigate('/app')} 
                size="lg" 
                className="px-6"
                variant="outline"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Home
              </Button>
            )}
          </div>
        </div>
      </div>

      <main className="container mx-auto py-6 max-w-6xl">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{plan.class_name || 'Generated Workout'}</span>
                <Badge variant="secondary">{Math.round(plan.total_duration_sec / 60)} min</Badge>
              </CardTitle>
              <CardDescription>
                {plan.blocks?.length || 0} blocks • Generated with AI assistance
                {plan.notes && <div className="mt-2 text-sm text-muted-foreground">{plan.notes}</div>}
              </CardDescription>
            </CardHeader>
          </Card>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Workout Blocks</h2>
            {plan.blocks?.map((block, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center space-x-2">
                        <span>{block.label}</span>
                        <Badge variant="outline">{block.type}</Badge>
                      </CardTitle>
                      <CardDescription>
                        {Math.round(block.duration_sec / 60)} minutes • {block.timeline?.length || 0} exercises
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                    {block.timeline.map((item, itemIndex) => (
                      <div key={itemIndex} className={`flex items-center gap-2 p-2 rounded ${
                        item.rest ? 'bg-blue-50/50' : 'bg-muted/50'
                      }`}>
                        <span className="flex-grow">{item.name}</span>
                        <span className="w-20 text-center">{item.length_sec}s</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-center items-center pt-6 gap-4">
            {!workoutSent ? (
              <>
                {generationFailed && lastRequest && (
                  <Button onClick={() => handleGenerateWorkout(lastRequest)} variant="outline">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Retry Generation
                  </Button>
                )}
                <Button 
                  onClick={handleSendToTimer} 
                  size="lg" 
                  className="px-8"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send to Timer
                    </>
                  )}
                </Button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="text-center mb-2">
                  <h3 className="text-lg font-medium">Workout sent to timer!</h3>
                  <p className="text-muted-foreground">Your workout has been saved and is ready to use.</p>
                </div>
                <Button 
                  onClick={() => navigate('/app')} 
                  size="lg" 
                  className="px-8"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go Home
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
