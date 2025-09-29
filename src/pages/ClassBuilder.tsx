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

    setPlan(res.plan);
    setEditablePlan(res.plan);
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
    const request = location.state?.request;
    if (request && !generationHasBeenTriggered.current) {
      generationHasBeenTriggered.current = true;
      setLastRequest(request);
      handleGenerateWorkout(request);
    }
  }, [location.state]);

  const handleSendToTimer = () => {
    if (!plan) return;
    const timerPlan = convertToTimerFormatV1(plan);
    navigate('/timer', { state: { plan: timerPlan.planV2 } });
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
            <Button variant="ghost" onClick={() => navigate('/')} className="flex items-center space-x-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Setup</span>
            </Button>
            <h1 className="text-xl font-semibold">Review & Edit</h1>
            <Button onClick={handleSendToTimer} size="lg" className="px-6">
              <Send className="h-4 w-4 mr-2" />
              Send to Timer
            </Button>
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
            {generationFailed && lastRequest && (
              <Button onClick={() => handleGenerateWorkout(lastRequest)} variant="outline">
                <Sparkles className="h-4 w-4 mr-2" />
                Retry Generation
              </Button>
            )}
            <Button onClick={handleSendToTimer} size="lg" className="px-8">
              <Send className="h-4 w-4 mr-2" />
              Send to Timer
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
