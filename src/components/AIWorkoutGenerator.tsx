import React, { useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Slider } from './ui/slider';
import { Alert, AlertDescription } from './ui/alert';
import { Sparkles, Play, AlertCircle, Loader2, Upload, FileText } from 'lucide-react';
import { AnyClassPlan } from '../types/timer';
import { toast } from '@/hooks/use-toast';
import { AIWorkoutGeneratorService, AIGenerationRequest } from '@/services/aiWorkoutGenerator';
import { saveWorkout } from '@/services/firebase';
import { useAuth } from '@/contexts/AuthContext';
import * as logger from '@/utils/logger';

interface AIWorkoutInputData {
  classDescription: string;
  classLength: number;
  transitionTime: 'manual' | 0 | 15 | 30;
  movesToAvoid: string;
  pastClassesText: string;
  followUploadedExamples: number; // 0-10 scale
  uploadedFiles: File[];
}

interface AIWorkoutGeneratorProps {
  onGenerateRequest: (request: AIGenerationRequest) => void;
  format?: string;
  availableFormats: string[];
  onFormatChange: (format: string) => void;
}

export const AIWorkoutGenerator: React.FC<AIWorkoutGeneratorProps> = ({ onGenerateRequest, format = "Strength and Conditioning", availableFormats, onFormatChange }) => {
  const { currentUser } = useAuth();
  const [inputData, setInputData] = useState<AIWorkoutInputData>({
    classDescription: '',
    classLength: 45,
    transitionTime: 'manual',
    movesToAvoid: '',
    pastClassesText: '',
    followUploadedExamples: 5,
    uploadedFiles: []
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [needsApiKey, setNeedsApiKey] = useState<boolean>(false);

  useEffect(() => {
    // Check if we have the API key from environment variables (Vite format)
    const hasEnvKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!hasEnvKey) {
      setNeedsApiKey(true);
    }
  }, []);

  // Use a ref to track if the component is mounted
  const isMountedRef = useRef(true);
  
  // Set up the mounted ref and clear any stale generation state
  useEffect(() => {
    isMountedRef.current = true;
    
    // Clear any stale generation state
    localStorage.removeItem('workout_generation_status');
    localStorage.removeItem('workout_generation_timestamp');
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Function to save workout to Firebase
  const saveWorkoutToFirebase = async (plan: AnyClassPlan, workoutFormat: string) => {
    if (!currentUser) return;
    
    try {
      logger.info('AIWorkoutGenerator', 'Saving workout to Firebase');
      
      const workoutData = {
        plan,
        format: workoutFormat,
        timestamp: new Date().toISOString()
      };
      
      const result = await saveWorkout(currentUser.uid, workoutData);
      
      if (result.error) {
        logger.error('AIWorkoutGenerator', 'Error saving workout to Firebase', { error: result.error });
        toast({
          title: "Save Error",
          description: "Your workout was generated but couldn't be saved to your account.",
          variant: "destructive",
        });
      } else {
        logger.info('AIWorkoutGenerator', 'Workout saved to Firebase successfully', { workoutId: result.id });
        toast({
          title: "Workout Saved",
          description: "Your workout has been saved to your account.",
        });
      }
    } catch (error: any) {
      logger.error('AIWorkoutGenerator', 'Exception saving workout to Firebase', { error: error.message });
    }
  };

  const handleGenerate = async () => {
    logger.info('AIWorkoutGenerator', 'Preparing workout generation request');

    const finalApiKey = import.meta.env.VITE_OPENAI_API_KEY || apiKey;
    if (needsApiKey && !finalApiKey) {
      logger.warn('AIWorkoutGenerator', 'API key missing');
      toast({
        title: "API Key Required",
        description: "Please enter your OpenAI API key to generate workouts.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    try {
      const savedProfile = localStorage.getItem('instructorProfile');
      let instructorProfile = {
        pastClasses: [],
        yearsTeaching: 'New Instructor',
        defaultClassLength: 45,
        currentFormat: format
      };

      if (savedProfile) {
        const profile = JSON.parse(savedProfile);
        const currentFormat = format || profile.currentFormat || Object.keys(profile.formatProfiles || {})[0];
        const formatProfile = profile.formatProfiles?.[currentFormat] || {};
        
        const profilePastClasses = formatProfile.pastClasses || [];
        
        let additionalPastClasses: string[] = [];
        if (inputData.pastClassesText.trim()) {
          const pasted = inputData.pastClassesText.trim();
          additionalPastClasses = [pasted];
        }
        
        const combinedPastClasses = [...additionalPastClasses, ...profilePastClasses];
        
        instructorProfile = {
          pastClasses: combinedPastClasses,
          yearsTeaching: profile.yearsTeaching || 'New Instructor',
          defaultClassLength: formatProfile.defaultClassLength || 45,
          currentFormat: currentFormat
        };
      } else if (inputData.pastClassesText.trim()) {
        instructorProfile.pastClasses = [inputData.pastClassesText.trim()];
      }

      // Convert files to serializable format for navigation
      const serializedFiles = await Promise.all(
        inputData.uploadedFiles.map(async (file) => {
          const arrayBuffer = await file.arrayBuffer();
          return {
            name: file.name,
            type: file.type,
            size: file.size,
            lastModified: file.lastModified,
            data: Array.from(new Uint8Array(arrayBuffer)) // Convert to array for JSON serialization
          };
        })
      );

      const request: AIGenerationRequest = {
        format: format || 'Fitness',
        clarifyingQuestions: {
          classLength: inputData.classLength,
          transitionTime: inputData.transitionTime,
          movesToAvoid: inputData.movesToAvoid,
          followUploadedExamples: inputData.followUploadedExamples,
        },
        instructorProfile,
        uploadedFiles: inputData.uploadedFiles, // Keep original files for immediate use
        serializedFiles: serializedFiles // Add serialized version for navigation
      };

      setIsGenerating(true); // Disable button immediately
      onGenerateRequest(request);

    } catch (error) {
      console.error('Critical error in handleGenerate:', error);
      toast({
        title: "Request Failed",
        description: "Could not prepare the workout generation request.",
        variant: "destructive",
      });
    }
  };

  const updateInput = (field: keyof AIWorkoutInputData, value: any) => {
    setInputData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setInputData(prev => ({
      ...prev,
      uploadedFiles: [...prev.uploadedFiles, ...files]
    }));
  };

  const handleFileDrop = (acceptedFiles: File[]) => {
    setInputData(prev => ({
      ...prev,
      uploadedFiles: [...prev.uploadedFiles, ...acceptedFiles]
    }));
  };

  const removeFile = (index: number) => {
    setInputData(prev => ({
      ...prev,
      uploadedFiles: prev.uploadedFiles.filter((_, i) => i !== index)
    }));
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png']
    },
    multiple: true,
    noClick: false
  });

  return (
    <Card className="p-6 max-w-4xl mx-auto">
      <div className="space-y-8">
        {/* Main Prompt */}
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-4 flex items-center justify-center gap-3">
            <Sparkles className="w-8 h-8 text-primary" />
            Hey instructor, what class do you want to teach today?
          </h2>
          <p className="text-muted-foreground">
            Select your workout preferences below and we'll generate a personalized class using your past classes
          </p>
        </div>

        {needsApiKey && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              To use AI workout generation, please enter your OpenAI API key below. 
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">
                Get your API key here
              </a>
            </AlertDescription>
          </Alert>
        )}

        {needsApiKey && (
          <div className="space-y-2">
            <Label htmlFor="api-key">OpenAI API Key</Label>
            <Input
              id="api-key"
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
        )}


        {/* Clarifying Questions */}
        <div className="space-y-6 border-t pt-8">
          <h3 className="text-xl font-semibold">Let's refine the details</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Format Selection */}
            <div className="space-y-2">
              <Label className="font-medium">Class Format</Label>
              <Select value={format} onValueChange={onFormatChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your class format" />
                </SelectTrigger>
                <SelectContent>
                  {availableFormats.map((formatOption) => (
                    <SelectItem key={formatOption} value={formatOption}>
                      {formatOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Class Length */}
            <div className="space-y-2">
              <Label className="font-medium">Class length (minutes)</Label>
              <Select value={inputData.classLength.toString()} onValueChange={(value) => updateInput('classLength', parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                  <SelectItem value="75">75 minutes</SelectItem>
                  <SelectItem value="90">90 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>



            {/* Transition Time */}
            <div className="space-y-2">
              <Label className="font-medium">Transition time between blocks</Label>
              <Select 
                value={inputData.transitionTime.toString()} 
                onValueChange={(value) => updateInput('transitionTime', value === 'manual' ? 'manual' : parseInt(value) as 0 | 15 | 30)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Start</SelectItem>
                  <SelectItem value="0">0s</SelectItem>
                  <SelectItem value="15">15s</SelectItem>
                  <SelectItem value="30">30s</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>

          {/* Open Text Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="movesToAvoid" className="font-medium">Anything to avoid?</Label>
              <Input
                id="movesToAvoid"
                value={inputData.movesToAvoid}
                onChange={(e) => updateInput('movesToAvoid', e.target.value)}
                placeholder="e.g., burpees, overhead movements"
              />
            </div>

          </div>
          
          {/* Unified Upload Section */}
          <div className="space-y-4">
            <Label className="font-medium">Upload or paste past classes (optional)</Label>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Drag & Drop Zone */}
              <div className="space-y-2">
                <Card className="border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors">
                  <div
                    {...getRootProps()}
                    className={`p-6 text-center cursor-pointer transition-colors ${
                      isDragActive ? 'bg-muted/50' : 'hover:bg-muted/25'
                    }`}
                  >
                    <input {...getInputProps()} />
                    <div className="space-y-3">
                      <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        {isDragActive ? (
                          <Upload className="w-5 h-5 text-primary" />
                        ) : (
                          <FileText className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-medium">
                          {isDragActive ? 'Drop your files here!' : 'Upload Files'}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Drag & drop or click to browse
                        </p>
                        <p className="text-xs text-muted-foreground">
                          PDF, DOCX, TXT, CSV, JPG, PNG
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
                
                {inputData.uploadedFiles.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-medium mb-2">Uploaded files:</p>
                    <ul className="space-y-1">
                      {inputData.uploadedFiles.map((file, index) => (
                        <li key={index} className="flex justify-between items-center text-sm bg-muted/30 px-3 py-2 rounded">
                          <span className="truncate">{file.name}</span>
                          <button
                            onClick={() => removeFile(index)}
                            className="text-red-500 hover:text-red-700 ml-2 text-xs"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Text Input */}
              <div className="space-y-2">
                <Label htmlFor="pastClassesText" className="font-medium">Or paste text here</Label>
                <Textarea
                  id="pastClassesText"
                  value={inputData.pastClassesText}
                  onChange={(e) => updateInput('pastClassesText', e.target.value)}
                  placeholder="Paste past class descriptions here, one per line. These will be used as examples for the AI."
                  className="min-h-[140px]"
                />
                <p className="text-xs text-muted-foreground">
                  Alternative to file uploads - paste text descriptions of past classes.
                </p>
              </div>
            </div>

            {/* Follow Uploaded Examples Slider */}
            {(inputData.uploadedFiles.length > 0 || inputData.pastClassesText.trim()) && (
              <div className="space-y-2 pt-2 border-t border-muted">
                <Label className="font-medium">How closely should we follow the examples you provided?</Label>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground w-16 text-right">Ignore</span>
                  <div className="flex-1">
                    <Slider
                      min={0}
                      max={10}
                      step={1}
                      value={[inputData.followUploadedExamples]}
                      onValueChange={(vals) => updateInput('followUploadedExamples', vals[0] ?? 5)}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-16">Copy exactly</span>
                  <span className="text-sm font-medium w-10 text-right">{inputData.followUploadedExamples}/10</span>
                </div>
                <p className="text-xs text-muted-foreground">0 = Ignore examples completely, 10 = Copy structure exactly</p>
              </div>
            )}
          </div>

        </div>

        {/* Generate Button */}
        <div className="pt-6 border-t">
          <Button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full text-lg py-6"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Generating Your Workout...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                Generate Workout
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
};