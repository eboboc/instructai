import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timer } from '../components/Timer';
import { Setup } from '../components/Setup';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { ArrowLeft, Upload, FileText, Zap, CheckCircle, AlertCircle } from 'lucide-react';
import { usePlanStore } from '../state/planStore';
import { extractTextFromFiles } from '../services/extractTextFromFile';
import { normalizeUploadedFile } from '../services/normalizeUploadedFile';
import { aiExtract } from '../services/aiExtractor';
import { aiPlan } from '../services/aiPlanner';
import { toast } from '@/hooks/use-toast';
import { flattenClassPlan } from '../utils/timerUtils';
import { AnyClassPlan, FlattenedInterval } from '../types/timer';

const Index = () => {
  const navigate = useNavigate();
  const { 
    currentStage, 
    preferences, 
    contentSource,
    uploadedText,
    extractedSignals,
    baselinePlan,
    finalPlan,
    assumptions,
    warnings,
    setStage,
    setUploadedText,
    setNormalizedText,
    setExtractedSignals,
    setBaselinePlan,
    setFinalPlan,
    reset
  } = usePlanStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [classPlan, setClassPlan] = useState<AnyClassPlan | null>(null);
  const [intervals, setIntervals] = useState<FlattenedInterval[]>([]);

  // File upload handler
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    setIsProcessing(true);
    try {
      const fileArray = Array.from(files);
      setUploadedFiles(fileArray);
      
      const extractionResult = await extractTextFromFiles(fileArray);
      
      if (!extractionResult.success || !extractionResult.combinedText) {
        toast({
          title: "Extraction Failed",
          description: extractionResult.errors.join(', ') || "Could not extract text from files",
          variant: "destructive",
        });
        return;
      }

      setUploadedText(extractionResult.combinedText);
      setStage('extract');
      
    } catch (error) {
      toast({
        title: "Upload Error",
        description: "Failed to process uploaded files",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [setUploadedText, setStage]);

  // AI Extract handler
  const handleAIExtract = useCallback(async () => {
    if (!uploadedText && !pastedText) return;
    
    setIsProcessing(true);
    try {
      const rawText = uploadedText || pastedText;
      const normalizedText = normalizeUploadedFile(rawText);
      setNormalizedText(normalizedText);
      
      const signals = await aiExtract(normalizedText, {
        target_duration: preferences?.duration,
        modality: preferences?.modality,
        level: preferences?.level
      });
      
      setExtractedSignals(signals);
      setStage('plan');
      
      toast({
        title: "Extraction Complete",
        description: `Found ${signals.blocks.length} workout blocks`,
      });
      
    } catch (error) {
      toast({
        title: "Extraction Failed",
        description: "Could not extract workout structure",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [uploadedText, pastedText, preferences, setNormalizedText, setExtractedSignals, setStage]);

  // AI Plan handler
  const handleAIPlan = useCallback(async () => {
    if (!extractedSignals || !preferences) return;
    
    setIsProcessing(true);
    try {
      const planResult = await aiPlan(extractedSignals, {
        duration_min: preferences.duration,
        modality: preferences.modality,
        level: preferences.level,
        adherence: preferences.adherence,
        coach_tone: preferences.tone,
        music: preferences.music ? 'Upbeat' : undefined
      });
      
      setBaselinePlan(planResult.plan, planResult.assumptions, planResult.warnings);
      setStage('review');
      
      toast({
        title: "Plan Generated",
        description: `Created ${planResult.plan.blocks?.length || 0} block workout`,
      });
      
    } catch (error) {
      toast({
        title: "Planning Failed",
        description: "Could not generate workout plan",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [extractedSignals, preferences, setBaselinePlan, setStage]);

  // Send to Timer handler
  const handleSendToTimer = useCallback(() => {
    const planToUse = finalPlan || baselinePlan;
    if (!planToUse) return;
    
    setClassPlan(planToUse as AnyClassPlan);
    const flatIntervals = flattenClassPlan(planToUse as AnyClassPlan);
    setIntervals(flatIntervals);
    setStage('timer');
  }, [finalPlan, baselinePlan, setStage]);

  // Progress calculation
  const getProgress = () => {
    switch (currentStage) {
      case 'setup': return 20;
      case 'extract': return 40;
      case 'plan': return 60;
      case 'review': return 80;
      case 'timer': return 100;
      default: return 0;
    }
  };

  // Render different stages
  const renderStageContent = () => {
    switch (currentStage) {
      case 'setup':
        return <Setup />;
        
      case 'extract':
        return (
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            <div className="text-center space-y-2">
              <FileText className="h-12 w-12 mx-auto text-primary" />
              <h2 className="text-2xl font-bold">AI Extract</h2>
              <p className="text-muted-foreground">
                Upload your content or paste text to extract workout signals
              </p>
            </div>

            {contentSource === 'upload' && (
              <Card>
                <CardHeader>
                  <CardTitle>Upload Files</CardTitle>
                  <CardDescription>
                    Upload PDF, TXT, or CSV files containing your workout content
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                    <Upload className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.txt,.csv"
                      onChange={(e) => handleFileUpload(e.target.files)}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <Button variant="outline" asChild>
                        <span>Choose Files</span>
                      </Button>
                    </label>
                    <p className="text-sm text-muted-foreground mt-2">
                      Supports PDF, TXT, and CSV files
                    </p>
                  </div>
                  
                  {uploadedFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="font-medium">Uploaded Files:</p>
                      {uploadedFiles.map((file, index) => (
                        <div key={index} className="flex items-center space-x-2 text-sm">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span>{file.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {contentSource === 'paste' && (
              <Card>
                <CardHeader>
                  <CardTitle>Paste Text</CardTitle>
                  <CardDescription>
                    Paste your workout content directly
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste your workout content here..."
                    className="w-full h-40 p-3 border rounded-md resize-none"
                  />
                </CardContent>
              </Card>
            )}

            {(uploadedText || pastedText) && (
              <div className="flex justify-center">
                <Button
                  onClick={handleAIExtract}
                  disabled={isProcessing}
                  size="lg"
                  className="px-8"
                >
                  {isProcessing ? 'Extracting...' : 'Extract Signals'}
                </Button>
              </div>
            )}
          </div>
        );
        
      case 'plan':
        return (
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            <div className="text-center space-y-2">
              <Zap className="h-12 w-12 mx-auto text-primary" />
              <h2 className="text-2xl font-bold">AI Plan</h2>
              <p className="text-muted-foreground">
                Generate a complete workout plan from extracted signals
              </p>
            </div>

            {extractedSignals && (
              <Card>
                <CardHeader>
                  <CardTitle>Extracted Signals</CardTitle>
                  <CardDescription>
                    Found {extractedSignals.blocks.length} workout blocks
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {extractedSignals.blocks.map((block, index) => (
                      <div key={index} className="border rounded-lg p-3">
                        <h4 className="font-medium">{block.title || `Block ${index + 1}`}</h4>
                        {block.moves && block.moves.length > 0 && (
                          <p className="text-sm text-muted-foreground">
                            {block.moves.slice(0, 3).map(m => m.name).join(', ')}
                            {block.moves.length > 3 && '...'}
                          </p>
                        )}
                        {block.pattern_hint && (
                          <p className="text-xs text-blue-600">Pattern: {block.pattern_hint}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {extractedSignals.assumptions.length > 0 && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <h5 className="font-medium text-blue-900">Assumptions:</h5>
                      <ul className="text-sm text-blue-800 list-disc list-inside">
                        {extractedSignals.assumptions.map((assumption, index) => (
                          <li key={index}>{assumption}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="flex justify-center">
              <Button
                onClick={handleAIPlan}
                disabled={isProcessing || !extractedSignals}
                size="lg"
                className="px-8"
              >
                {isProcessing ? 'Generating Plan...' : 'Generate Plan'}
              </Button>
            </div>
          </div>
        );
        
      case 'review':
        return (
          <div className="max-w-4xl mx-auto p-6 space-y-6">
            <div className="text-center space-y-2">
              <CheckCircle className="h-12 w-12 mx-auto text-primary" />
              <h2 className="text-2xl font-bold">Review & Edit</h2>
              <p className="text-muted-foreground">
                Review your generated workout plan and make any adjustments
              </p>
            </div>

            {baselinePlan && (
              <Card>
                <CardHeader>
                  <CardTitle>{baselinePlan.metadata?.class_name || 'Generated Workout'}</CardTitle>
                  <CardDescription>
                    {baselinePlan.metadata?.duration_min} minutes • {baselinePlan.metadata?.modality} • {baselinePlan.metadata?.level}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {baselinePlan.blocks?.map((block, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium">{block.name}</h4>
                          <span className="text-sm text-muted-foreground">{block.duration_min} min</span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">Type: {block.type}</p>
                        {block.exercises && block.exercises.length > 0 && (
                          <div className="space-y-1">
                            {block.exercises.slice(0, 4).map((exercise, exIndex) => (
                              <div key={exIndex} className="text-sm">
                                <span className="font-medium">{exercise.name}</span>
                                {exercise.reps_or_time && (
                                  <span className="text-muted-foreground"> - {exercise.reps_or_time}</span>
                                )}
                              </div>
                            ))}
                            {block.exercises.length > 4 && (
                              <p className="text-xs text-muted-foreground">
                                +{block.exercises.length - 4} more exercises
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {assumptions && assumptions.length > 0 && (
                    <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                      <h5 className="font-medium text-blue-900 mb-2">AI Assumptions:</h5>
                      <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
                        {assumptions.map((assumption, index) => (
                          <li key={index}>{assumption}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {warnings && warnings.length > 0 && (
                    <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
                      <h5 className="font-medium text-yellow-900 mb-2 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        Warnings:
                      </h5>
                      <ul className="text-sm text-yellow-800 list-disc list-inside space-y-1">
                        {warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="flex justify-center space-x-4">
              <Button variant="outline" onClick={() => setStage('plan')}>
                Back to Plan
              </Button>
              <Button onClick={handleSendToTimer} size="lg" className="px-8">
                Send to Timer
              </Button>
            </div>
          </div>
        );
        
      case 'timer':
        return classPlan ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setStage('review')}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Review</span>
              </Button>
            </div>
            <Timer
              classPlan={classPlan}
              intervals={intervals}
              currentIntervalIndex={0}
              breakDuration="manual"
            />
          </div>
        ) : null;
        
      default:
        return <Setup />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold">JSON Flow Timer</h1>
              {currentStage !== 'setup' && (
                <Button variant="ghost" size="sm" onClick={reset}>
                  Start Over
                </Button>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-muted-foreground">
                Step {currentStage === 'setup' ? 1 : currentStage === 'extract' ? 2 : 
                      currentStage === 'plan' ? 3 : currentStage === 'review' ? 4 : 5} of 5
              </div>
              <Progress value={getProgress()} className="w-32" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto py-6">
        {renderStageContent()}
      </main>
    </div>
  );
};

export default Index;
