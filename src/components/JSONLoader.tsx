import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Textarea } from './ui/textarea';
import { Upload, Play } from 'lucide-react';
import { AnyClassPlan } from '../types/timer';
import { validateClassPlan, SAMPLE_CLASS_PLAN, getClassName } from '../utils/timerUtils';
import { toast } from '@/hooks/use-toast';

interface JSONLoaderProps {
  onLoadPlan: (plan: AnyClassPlan) => void;
}

export const JSONLoader: React.FC<JSONLoaderProps> = ({ onLoadPlan }) => {
  const [jsonInput, setJsonInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLoadJSON = async () => {
    if (!jsonInput.trim()) {
      toast({
        title: "No JSON provided",
        description: "Please paste your workout JSON first.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const parsed = JSON.parse(jsonInput);
      const validated = validateClassPlan(parsed);
      
      if (!validated) {
        throw new Error('Invalid class plan format');
      }
      
      onLoadPlan(validated);
      toast({
        title: "Workout Loaded!",
        description: `"${getClassName(validated)}" is ready to start.`
      });
      
    } catch (error) {
      console.error('JSON parsing error:', error);
      toast({
        title: "Invalid JSON",
        description: "Please check your JSON format and try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadSample = () => {
    setJsonInput(JSON.stringify(SAMPLE_CLASS_PLAN, null, 2));
    onLoadPlan(SAMPLE_CLASS_PLAN);
    toast({
      title: "Sample Loaded!",
      description: "HIIT Blast workout is ready to start."
    });
  };

  return (
    <Card className="p-6 max-w-2xl mx-auto">
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
            <Upload className="w-6 h-6" />
            Load Workout Plan
          </h2>
          <p className="text-muted-foreground">
            Paste your JSON workout plan or try our sample HIIT session
          </p>
        </div>

        <div className="space-y-4">
          <Textarea
            placeholder="Paste your JSON workout here..."
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            rows={12}
            className="font-mono text-sm"
          />
          
          <Button 
            onClick={handleLoadJSON}
            disabled={isLoading || !jsonInput.trim()}
            className="w-full"
          >
            <Play className="w-4 h-4 mr-2" />
            Load & Start Workout
          </Button>
        </div>

        {/* Sample JSON Format Guide */}
        <div className="border-t pt-6">
          <details className="space-y-3">
            <summary className="cursor-pointer font-semibold text-sm uppercase tracking-wide">
              JSON Format Guide
            </summary>
            <div className="space-y-3 text-sm">
              <div className="bg-muted p-3 rounded font-mono text-xs overflow-auto">
                <pre>{JSON.stringify({
                  "class_name": "My Workout",
                  "blocks": [
                    {
                      "name": "Warm-up",
                      "type": "WARMUP",
                      "timeline": [
                        { "time": 30, "activity": "Jumping Jacks" },
                        { "time": 30, "activity": "Stretches" }
                      ]
                    },
                    {
                      "name": "Main Set",
                      "type": "RANDOMIZED", 
                      "timeline": [
                        { "time": 45, "activity": "Push-ups" },
                        { "time": 15, "activity": "REST" }
                      ],
                      "repeat": 3,
                      "rest_between_sets": 60
                    }
                  ]
                }, null, 2)}</pre>
              </div>
              
              <div className="space-y-2 text-xs">
                <p><strong>Block Types:</strong> WARMUP, COMBO, PYRAMID, RANDOMIZED, LADDER, COOLDOWN</p>
                <p><strong>Timeline:</strong> Array of {`{ "time": seconds, "activity": "name" }`}</p>
                <p><strong>Rest:</strong> Any activity containing "REST" is treated as rest period</p>
                <p><strong>Repeat:</strong> Optional number of times to repeat the timeline</p>
                <p><strong>Rest Between Sets:</strong> Optional rest time between repeats</p>
              </div>
            </div>
          </details>
        </div>
      </div>
    </Card>
  );
};