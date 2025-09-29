import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Slider } from './ui/slider';

interface ClassSettings {
  classLength: number;
  intensity: number;
  breakDuration: number | 'manual';
  focus: string;
  wantMusic: boolean;
  musicGenre: string;
  movesToAvoid: string;
  audienceNotes: string;
}

interface PreClassSetupProps {
  open: boolean;
  onClose: () => void;
  onStart: (settings: ClassSettings) => void;
}

export const PreClassSetup: React.FC<PreClassSetupProps> = ({ open, onClose, onStart }) => {
  const [settings, setSettings] = useState<ClassSettings>({
    classLength: 45,
    intensity: 5,
    breakDuration: 'manual',
    focus: 'full-body',
    wantMusic: true,
    musicGenre: 'electronic',
    movesToAvoid: '',
    audienceNotes: ''
  });

  // Load defaults from instructor profile
  useEffect(() => {
    const savedProfile = localStorage.getItem('instructorProfile');
    if (savedProfile) {
      const profile = JSON.parse(savedProfile);
      setSettings(prev => ({
        ...prev,
        classLength: profile.defaultClassLength || 45,
        intensity: typeof profile.defaultRPE === 'number' ? profile.defaultRPE : 5,
        breakDuration: profile.defaultBreakDuration || 'manual'
      }));
    }
  }, [open]);

  const handleStart = () => {
    onStart(settings);
    onClose();
  };

  const updateSetting = (key: keyof ClassSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Class Setup</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Class Length */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Class Length (minutes)
            </Label>
            <Select value={settings.classLength.toString()} onValueChange={(value) => updateSetting('classLength', parseInt(value))}>
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

          {/* Intensity (RPE) */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Intensity (RPE 0–10)
            </Label>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-10 text-right">0</span>
              <div className="flex-1">
                <Slider
                  min={0}
                  max={10}
                  step={1}
                  value={[settings.intensity]}
                  onValueChange={(vals) => updateSetting('intensity', vals[0] ?? 5)}
                />
              </div>
              <span className="text-xs text-muted-foreground w-10">10</span>
              <span className="text-sm font-medium w-10 text-right">{settings.intensity}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Rate of Perceived Exertion (0 = very easy, 10 = maximal)</p>
          </div>

          {/* Break Duration */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Recovery time between blocks
            </Label>
            <Select value={settings.breakDuration.toString()} onValueChange={(value) => {
              updateSetting('breakDuration', value === 'manual' ? 'manual' : parseInt(value));
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual Start (pause between blocks)</SelectItem>
                <SelectItem value="0">No Break (instant transition)</SelectItem>
                <SelectItem value="15">15 seconds</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="45">45 seconds</SelectItem>
                <SelectItem value="60">1 minute</SelectItem>
                <SelectItem value="90">1:30</SelectItem>
                <SelectItem value="120">2 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Specific Focus */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Specific Focus Today
            </Label>
            <Select value={settings.focus} onValueChange={(value) => updateSetting('focus', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upper">Upper Body</SelectItem>
                <SelectItem value="lower">Lower Body</SelectItem>
                <SelectItem value="core">Core</SelectItem>
                <SelectItem value="full-body">Full Body</SelectItem>
                <SelectItem value="conditioning">Conditioning</SelectItem>
                <SelectItem value="balance-mobility">Balance & Mobility</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Music Preferences */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Do you want music today?
              </Label>
              <Select value={settings.wantMusic.toString()} onValueChange={(value) => updateSetting('wantMusic', value === 'true')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {settings.wantMusic && (
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Music Genre
                </Label>
                <Select value={settings.musicGenre} onValueChange={(value) => updateSetting('musicGenre', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="electronic">Electronic</SelectItem>
                    <SelectItem value="hip-hop">Hip-Hop</SelectItem>
                    <SelectItem value="pop">Pop</SelectItem>
                    <SelectItem value="rock">Rock</SelectItem>
                    <SelectItem value="latin">Latin</SelectItem>
                    <SelectItem value="reggaeton">Reggaeton</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Moves to Avoid */}
          <div>
            <Label htmlFor="movesToAvoid" className="text-sm font-medium mb-2 block">
              Any moves to avoid today? (Optional)
            </Label>
            <Input
              id="movesToAvoid"
              value={settings.movesToAvoid}
              onChange={(e) => updateSetting('movesToAvoid', e.target.value)}
              placeholder="e.g., burpees, overhead movements, high-impact"
            />
          </div>

          {/* Audience Notes */}
          <div>
            <Label htmlFor="audienceNotes" className="text-sm font-medium mb-2 block">
              Special notes on audience? (Optional)
            </Label>
            <Textarea
              id="audienceNotes"
              value={settings.audienceNotes}
              onChange={(e) => updateSetting('audienceNotes', e.target.value)}
              placeholder="e.g., Beginners, Advanced, Mixed-level, Athletes"
              rows={2}
            />
          </div>
          
          <Button onClick={handleStart} className="w-full">
            Start Workout
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};