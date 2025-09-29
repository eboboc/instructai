'use client';
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AIWorkoutGeneratorService, AIGenerationRequest } from '@/services/aiWorkoutGenerator';
import { loadPlanIntoTimer, allowTimerLoadOnce } from '@/timer/loader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Sparkles, Send, Loader2, Eye, FileText } from 'lucide-react';
import { usePlanStore, logStage } from '@/state/planStore';

const service = new AIWorkoutGeneratorService(import.meta.env.VITE_OPENAI_API_KEY, undefined, true);

export default function ClassBuilder() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [plan, setPlan] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('Loading your workout...');

  // Get durable state
  const { baselinePlan, uploadedText, normalizedText, warnings } = usePlanStore();

  useEffect(() => {
    logStage('classbuilder_init', {
      hasLocationPlan: !!location.state?.plan,
      hasLocationRequest: !!location.state?.request,
      hasBaselinePlan: !!baselinePlan,
      hasUploadedText: !!uploadedText
    });

    // Priority 1: Use baseline plan from durable state if available
    if (baselinePlan) {
      setPlan(baselinePlan);
      sessionStorage.setItem('flow.plan', JSON.stringify(baselinePlan));
      setStatus(`Parsed workout ready! ${baselinePlan.blocks?.length || 0} blocks loaded.`);
      return;
    }

    // Priority 2: Check if we're coming back from timer with a plan
    if (location.state?.plan) {
      setPlan(location.state.plan);
      sessionStorage.setItem('flow.plan', JSON.stringify(location.state.plan));
      setStatus('Workout loaded from timer. Ready to edit!');
    } else if (location.state?.request) {
      onGenerate(location.state.request);
    } else {
      // Try to restore from sessionStorage
      const savedPlan = sessionStorage.getItem('flow.plan');
      if (savedPlan) {
        try {
          const parsedPlan = JSON.parse(savedPlan);
          setPlan(parsedPlan);
          setStatus('Workout restored from previous session!');
        } catch (error) {
          console.error('Error parsing saved plan:', error);
          setStatus('No request found. Please go back and generate a class.');
        }
      } else {
        setStatus('No request found. Please go back and generate a class.');
      }
    }
  }, [location.state, baselinePlan]);

  async function onGenerate(request: AIGenerationRequest) {
    logStage('generate_start', { hasBaseline: !!baselinePlan, hasRequest: !!request });

    // Force use of baseline plan if present - NO FALLBACK
    if (baselinePlan) {
      logStage('using_baseline_plan', { blocks: baselinePlan.blocks?.length || 0 });
      setPlan(baselinePlan);
      sessionStorage.setItem('flow.plan', JSON.stringify(baselinePlan));
      setStatus(`Using parsed workout with ${baselinePlan.blocks?.length || 0} blocks!`);

      if (warnings && warnings.length > 0) {
        toast({
          title: "Plan Ready with Warnings",
          description: warnings.join('. '),
        });
      }
      return;
    }

    // Only use AI generation if no baseline plan exists
    setLoading(true);
    setStatus('Generating your personalized workout...');
    const result = await service.generateWorkout(request);
    setLoading(false);
    if (!result.success) {
      // Log the full error for debugging
      console.error('[ClassBuilder] Generation failed:', result.error);
      console.log('[ClassBuilder] Full result:', result);
      
      // Handle structured errors for AI response issues
      if (result.error === 'AI did not return a full workout plan' ||
          result.error === 'Invalid AI response' ||
          result.error === 'AI response failed schema validation') {
        setStatus('Generation failed — AI did not return a valid workout. Please try again.');
      } else if (result.error?.includes('Chat Editor')) {
        // File parsing errors with Chat Editor suggestion
        setStatus(`Upload failed: ${result.error}`);
      } else if (result.error?.includes('not yet implemented')) {
        // File type not supported
        setStatus(`File type not supported: ${result.error}`);
      } else if (result.error?.includes('No workout blocks could be identified')) {
        // Parsing failed - no blocks found
        setStatus(`Upload parsing failed: Could not identify workout blocks in the uploaded file. Please ensure your file contains clear section headers like "Warm-up", "Main Set", "Cool Down", etc. You can also try the Chat Editor to manually input your workout.`);
      } else if (result.error?.includes('Failed to parse workout plan')) {
        // Parsing failed - structure issues
        setStatus(`Upload parsing failed: ${result.error} Please check your file format or try the Chat Editor to manually input your workout.`);
      } else if (result.error?.includes('Validation failed after generation')) {
        // Parsed but validation failed
        setStatus(`Upload processed but validation failed: ${result.error} The parsed workout structure may be incomplete. Try the Chat Editor to review and fix the content.`);
      } else {
        setStatus(`Generation failed: ${result.error || 'Unknown error occurred'}`);
      }
      return;
    }
    setPlan(result.data);
    setStatus(result.warning ? `Generated with warnings: ${result.warning}` : 'Generated successfully!');
  }

  async function onEdit() {
    if (!plan || !message.trim()) return;
    setLoading(true);
    setStatus('Applying your edits...');

    const requestForValidation: AIGenerationRequest = {
        classDescription: '',
        format: plan.metadata.modality || 'custom',
        clarifyingQuestions: {
            classLength: plan.metadata.duration_min,
            intensity: 7, // Default RPE for validation
            transitionTime: 'manual', // Default for validation
            bodyFocus: 'full',
            movesToAvoid: (plan.metadata.avoid_list || []).join(','),
            specialNotes: '',
        },
        instructorProfile: { pastClasses: [], yearsTeaching: '5' },
    };

    // 1. Attempt local edits first
    const { plan: locallyEditedPlan, editsApplied } = service.applyLocalEdits(plan, message);

    if (editsApplied) {
        const sanitizedPlan = service.sanitizePlan(locallyEditedPlan, requestForValidation);
        const { isValid, errors } = service.validateWorkoutPlan(sanitizedPlan, requestForValidation);

        if (isValid) {
            setPlan(sanitizedPlan);
            setMessage('');
            setStatus('Edits applied successfully!');
            setLoading(false);
            return;
        }
        setStatus(`Local edit was invalid (${errors.join(', ')}), falling back to AI...`);
    }

    // 2. Fallback to AI for complex edits
    const constraints = {
      classTotalSec: (plan?.metadata?.duration_min ?? 0) * 60,
      avoid: plan?.metadata?.avoid_list ?? [],
      transitionPolicy: plan?.metadata?.transition_policy ?? 'manual',
      transitionSec: plan?.metadata?.transition_policy === 'auto' ? (plan?.metadata?.transition_sec ?? 15) : 0
    };

    try {
      const result = await service.editWorkout(plan, message, constraints);
      setLoading(false);
      if (!result.success) {
        // Log the full error for debugging
        console.error('[ClassBuilder] Edit failed:', result.error);
        console.log('[ClassBuilder] Full edit result:', result);
        
        // Handle structured errors for AI response issues
        if (result.error === 'AI did not return a full workout plan' || 
            result.error === 'AI did not return JSON at all' ||
            result.error === 'Invalid AI response' ||
            result.error === 'AI response failed schema validation') {
          setStatus('Edit failed — AI did not return a valid workout. Please try again.');
        } else if (result.error?.includes('Chat Editor')) {
          setStatus(`Edit failed: ${result.error}`);
        } else {
          setStatus(`Edit failed: ${result.error || 'Could not apply changes. Please try rephrasing or make the change manually.'}`);
        }
        return;
      }
      console.log('[UI] before setPlan', plan);
      console.log('[UI] applying patch result', result.data);
      setPlan(result.data);
      setMessage('');
      setStatus(result.warning ? `AI edited with warnings: ${result.warning}` : 'AI edits applied successfully!');
    } catch (err: any) {
      setLoading(false);
      setStatus('Edit could not be applied. Please try rephrasing or make the change manually.');
    }
  }

  async function onSendToTimer() {
    if (!plan) {
      toast({
        title: 'Cannot Send to Timer',
        description: 'No valid plan to send to Timer. Please generate first.',
        variant: 'destructive',
      });
      return;
    }

    // Re-validate the plan before sending to the timer
    const requestForValidation: AIGenerationRequest = {
        classDescription: '',
        format: plan.metadata.modality || 'custom',
        clarifyingQuestions: {
            classLength: plan.metadata.duration_min,
            intensity: 7, transitionTime: 'manual', bodyFocus: 'full', movesToAvoid: '', specialNotes: '',
        },
        instructorProfile: { pastClasses: [], yearsTeaching: '5' },
    };

    const { isValid, errors } = service.validateWorkoutPlan(plan, requestForValidation);

    if (!isValid) {
        setStatus(`Error: Plan is invalid. Cannot send to timer. Issues: ${errors.join(', ')}`);
        toast({
          title: 'Invalid Plan',
          description: `Cannot send to timer. Issues: ${errors.join(', ')}`,
          variant: 'destructive',
        });
        return;
    }

    setStatus('Sending to Timer…');
    allowTimerLoadOnce('ui');
    await loadPlanIntoTimer(plan);
    navigate('/app');
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center justify-between p-4 border-b bg-background/80 backdrop-blur-sm">
        <Button variant="ghost" onClick={() => navigate('/app')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Setup
        </Button>
        <div className="flex flex-col items-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary via-blue-500 to-purple-600 bg-clip-text text-transparent">
            Review & Edit Your Class
          </h1>
          {baselinePlan && (
            <Badge variant="secondary" className="mt-1">
              {baselinePlan.blocks?.length || 0} Blocks Parsed
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Debug Preview Buttons */}
          {uploadedText && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Eye className="w-4 h-4 mr-2" />
                  👁 Text
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Extracted Text Preview</DialogTitle>
                  <DialogDescription>
                    First 1200 characters of extracted text from uploaded files
                  </DialogDescription>
                </DialogHeader>
                <div className="bg-muted p-4 rounded-md">
                  <pre className="text-sm whitespace-pre-wrap">
                    {uploadedText.substring(0, 1200)}
                    {uploadedText.length > 1200 && '\n\n... (truncated)'}
                  </pre>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {baselinePlan && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <FileText className="w-4 h-4 mr-2" />
                  👁 Blocks
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Parsed Blocks Preview</DialogTitle>
                  <DialogDescription>
                    Block structure extracted from your content
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  {baselinePlan.blocks?.map((block, index) => (
                    <div key={index} className="bg-muted p-3 rounded-md">
                      <div className="font-medium">{block.name || `Block ${index + 1}`}</div>
                      <div className="text-sm text-muted-foreground">
                        Type: {block.normalized_type} | Duration: {block.duration || 'Unknown'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Exercises: {block.timeline?.length || 0}
                      </div>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          )}

          <Button onClick={onSendToTimer} disabled={!plan || loading}>
            <Send className="w-4 h-4 mr-2" />
            Send to Timer
          </Button>
        </div>
      </header>

      <main className="p-4 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Side: Plan Preview */}
        <div className="space-y-6">
          <PlanMetadataHeader plan={plan} status={status} loading={loading} />
          {plan?.blocks?.map((block: any, index: number) => (
            <PlanBlockCard key={index} block={block} />
          ))}
          {!plan && !loading && (
            <Card><CardContent className="p-6 text-center text-muted-foreground">{status}</CardContent></Card>
          )}
        </div>

        {/* Right Side: Chat Editor */}
        <div className="sticky top-24 self-start space-y-4">
          <h2 className="text-xl font-semibold">Chat Editor</h2>
          <Card>
            <CardContent className="p-4 space-y-4">
              <Textarea
                placeholder='Suggest edits (e.g., "Make Block 2 EMOM 45/15 x 6; remove burpees; add 15s transitions")'
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[200px] bg-muted/50"
                disabled={!plan || loading}
              />
              <Button onClick={onEdit} disabled={!plan || loading} className="w-full">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Apply Edit
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function PlanMetadataHeader({ plan, status, loading }: { plan: any, status: string, loading: boolean }) {
  if (!plan) {
    return (
      <Card className="text-center p-6">
        {loading ? <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" /> : <Sparkles className="w-8 h-8 mx-auto text-muted-foreground" />}
        <p className="mt-4 text-muted-foreground font-medium">{status}</p>
      </Card>
    );
  }

  const { class_name, duration_min, modality, level } = plan.metadata;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{class_name || 'Generated Workout'}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-4 text-sm">
        <Badge variant="outline">{duration_min} min</Badge>
        <Badge variant="outline">{modality}</Badge>
        <Badge variant="outline">{level}</Badge>
      </CardContent>
    </Card>
  );
}

function PlanBlockCard({ block }: { block: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>{block.name}</span>
          <Badge>{block.type}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">
          <p><strong>Duration:</strong> {Math.round(block.duration_sec / 60)} min</p>
          {block.pattern && <p><strong>Pattern:</strong> {block.pattern}</p>}
        </div>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          {block.timeline?.map((item: string, i: number) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
