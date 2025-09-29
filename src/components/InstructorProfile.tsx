import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { ClassSizeSelector } from './ClassSizeSelector';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { saveWorkout } from '@/services/firebase';
import { toast } from '@/hooks/use-toast';
import * as logger from '@/utils/logger';

interface InstructorProfileData {
  // Account Basics (Global)
  fullName: string;
  email: string;
  phone: string;
  location: string;
  yearsTeaching: string;
  certifications: string[];

  // Format-Specific Profiles
  currentFormat: string;
  formatProfiles: Record<string, FormatProfile>;
}

interface FormatProfile {
  typicalClassSize: string;
  classLengths: number[];
  pastClasses: string[];
  defaultClassLength: number;
  defaultRPE: number;
  defaultTransitionTime: number;
}

const defaultFormatProfile: FormatProfile = {
  typicalClassSize: 'medium',
  classLengths: [45],
  pastClasses: [],
  defaultClassLength: 45,
  defaultRPE: 5,
  defaultTransitionTime: 30
};

const defaultProfile: InstructorProfileData = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  yearsTeaching: '',
  certifications: [],
  currentFormat: 'HIIT',
  formatProfiles: {
    'HIIT': { ...defaultFormatProfile }
  }
};

const formatOptions = [
  'HIIT', 'Strength Training', 'Conditioning', 'Yoga', 'Barre', 'Dance', 
  'Bootcamp', 'Mobility', 'Functional Training', 'Pilates', 'CrossFit',
  'Cardio', 'Boxing', 'Cycling', 'Running Club'
];

const certificationOptions = [
  'ACE', 'NASM', 'ACSM', 'NSCA', 'Yoga Alliance RYT-200', 'Yoga Alliance RYT-500',
  'Barre Above', 'NETA', 'AFAA', 'ISSA', 'CrossFit Level 1', 'TRX'
];


export const InstructorProfile: React.FC = () => {
  const [profile, setProfile] = useState<InstructorProfileData>(defaultProfile);
  const [isEditing, setIsEditing] = useState(false);
  const { currentUser } = useAuth();

  useEffect(() => {
    const savedProfile = localStorage.getItem('instructorProfile');
    if (savedProfile) {
      const parsed = JSON.parse(savedProfile);
      
      // Migration: Convert old format to new format-specific structure
      if (!parsed.formatProfiles) {
        const migratedProfile: InstructorProfileData = {
          ...defaultProfile,
          ...parsed,
          currentFormat: parsed.formats?.[0] || 'HIIT',
          formatProfiles: {
            [parsed.formats?.[0] || 'HIIT']: {
              typicalClassSize: parsed.typicalClassSize || 'medium',
              classLengths: parsed.classLengths || [45],
              pastClasses: [],
              defaultClassLength: parsed.defaultClassLength || 45,
              // Migrate old defaultIntensity to numeric RPE heuristically
              defaultRPE: typeof parsed.defaultIntensity === 'string'
                ? (parsed.defaultIntensity === 'gentle' ? 3 : parsed.defaultIntensity === 'high' ? 8 : 5)
                : (typeof parsed.defaultRPE === 'number' ? parsed.defaultRPE : 5),
              defaultTransitionTime: parsed.defaultBreakDuration || 30
            }
          }
        };
        setProfile(migratedProfile);
        localStorage.setItem('instructorProfile', JSON.stringify(migratedProfile));
      } else {
        setProfile({ ...defaultProfile, ...parsed });
      }
    }
  }, []);

  const saveProfile = () => {
    // Save to localStorage
    localStorage.setItem('instructorProfile', JSON.stringify(profile));
    setIsEditing(false);
    
    // Save past classes to Firebase if user is logged in
    if (currentUser) {
      savePastClassesToFirebase();
    }
    
    toast({
      title: "Profile Saved",
      description: "Your instructor profile has been updated.",
    });
  };
  
  // Function to save past classes to Firebase
  const savePastClassesToFirebase = async () => {
    if (!currentUser) return;
    
    try {
      const currentFormat = profile.currentFormat;
      const formatProfile = profile.formatProfiles[currentFormat];
      
      if (!formatProfile || !formatProfile.pastClasses || formatProfile.pastClasses.length === 0) {
        logger.info('InstructorProfile', 'No past classes to save');
        return;
      }
      
      logger.info('InstructorProfile', 'Saving past classes to Firebase', { count: formatProfile.pastClasses.length });
      
      // Save each past class as a separate workout
      for (const pastClass of formatProfile.pastClasses) {
        // Only skip completely empty entries
        if (pastClass.length === 0) continue;
        
        // Create a simple workout plan from the past class
        const workoutPlan = {
          version: 'enhanced',
          metadata: {
            class_name: `${currentFormat} Class`,
            duration_min: formatProfile.defaultClassLength || 45,
            modality: currentFormat,
            level: 'All Levels',
            intensity_curve: `RPE ${formatProfile.defaultRPE ?? 5}/10`
          },
          blocks: [
            {
              id: 'main',
              name: 'Main Workout',
              type: 'MAIN',
              duration: `${formatProfile.defaultClassLength || 45} min`,
              pattern: 'Custom',
              timeline: [pastClass],
              cues: [],
              target_muscles: { full_body: 100 }
            }
          ],
          time_audit: {
            sum_min: formatProfile.defaultClassLength || 45,
            buffer_min: 0
          }
        };
        
        // Save to Firebase
        const workoutData = {
          plan: workoutPlan,
          format: currentFormat,
          timestamp: new Date().toISOString(),
          source: 'past_class',
          description: pastClass
        };
        
        const result = await saveWorkout(currentUser.uid, workoutData);
        
        if (result.error) {
          logger.error('InstructorProfile', 'Error saving past class to Firebase', { error: result.error });
        } else {
          logger.info('InstructorProfile', 'Past class saved to Firebase', { workoutId: result.id });
        }
      }
      
      toast({
        title: "Past Classes Saved",
        description: "Your past classes have been saved to your account.",
      });
      
    } catch (error: any) {
      logger.error('InstructorProfile', 'Exception saving past classes to Firebase', { error: error.message });
      toast({
        title: "Error Saving Classes",
        description: "There was an error saving your past classes.",
        variant: "destructive",
      });
    }
  };

  const updateProfile = (field: keyof InstructorProfileData, value: any) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const updateFormatProfile = (field: keyof FormatProfile, value: any) => {
    setProfile(prev => ({
      ...prev,
      formatProfiles: {
        ...prev.formatProfiles,
        [prev.currentFormat]: {
          ...prev.formatProfiles[prev.currentFormat],
          [field]: value
        }
      }
    }));
  };

  const addToArray = (field: keyof InstructorProfileData, value: string) => {
    const currentArray = profile[field] as string[];
    if (!currentArray.includes(value)) {
      updateProfile(field, [...currentArray, value]);
    }
  };

  const removeFromArray = (field: keyof InstructorProfileData, value: string) => {
    const currentArray = profile[field] as string[];
    updateProfile(field, currentArray.filter(item => item !== value));
  };

  const getCurrentFormatProfile = () => {
    return profile.formatProfiles[profile.currentFormat] || defaultFormatProfile;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Account Basics */}
      <Card>
        <CardHeader>
          <CardTitle>Account Basics</CardTitle>
          <CardDescription>Your personal information and credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={profile.fullName}
                onChange={(e) => updateProfile('fullName', e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                onChange={(e) => updateProfile('email', e.target.value)}
                placeholder="your.email@example.com"
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number (Optional)</Label>
              <Input
                id="phone"
                value={profile.phone}
                onChange={(e) => updateProfile('phone', e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={profile.location}
                onChange={(e) => updateProfile('location', e.target.value)}
                placeholder="City, State"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Years Teaching</Label>
              <Select value={profile.yearsTeaching} onValueChange={(value) => updateProfile('yearsTeaching', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select experience level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0-1">0-1 years</SelectItem>
                  <SelectItem value="2-5">2-5 years</SelectItem>
                  <SelectItem value="6-10">6-10 years</SelectItem>
                  <SelectItem value="10+">10+ years</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Certifications</Label>
              <Select onValueChange={(value) => addToArray('certifications', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Add certification" />
                </SelectTrigger>
                <SelectContent>
                  {certificationOptions.map(cert => (
                    <SelectItem key={cert} value={cert}>{cert}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-2 mt-2">
                {profile.certifications.map(cert => (
                  <Badge key={cert} variant="secondary" className="flex items-center gap-1">
                    {cert}
                    <X 
                      className="w-3 h-3 cursor-pointer" 
                      onClick={() => removeFromArray('certifications', cert)}
                    />
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Format-Specific Teaching Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Teaching Profile - {profile.currentFormat}</CardTitle>
          <CardDescription>Profile settings specific to this class format</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Format Selection */}
          <div>
            <Label>Class Format</Label>
            <Select 
              value={profile.currentFormat} 
              onValueChange={(value) => {
                if (!profile.formatProfiles[value]) {
                  setProfile(prev => ({
                    ...prev,
                    formatProfiles: {
                      ...prev.formatProfiles,
                      [value]: { ...defaultFormatProfile }
                    }
                  }));
                }
                updateProfile('currentFormat', value);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formatOptions.map(format => (
                  <SelectItem key={format} value={format}>{format}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Class Size Selector */}
          <div>
            <Label>Typical Class Size</Label>
            <ClassSizeSelector
              selected={getCurrentFormatProfile().typicalClassSize}
              onSelect={(size) => updateFormatProfile('typicalClassSize', size)}
            />
          </div>

          {/* Default Class Length */}
          <div>
            <Label>Default Class Length (minutes)</Label>
            <Select 
              value={getCurrentFormatProfile().defaultClassLength.toString()} 
              onValueChange={(value) => updateFormatProfile('defaultClassLength', parseInt(value))}
            >
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

          {/* Default Intensity (RPE) */}
          <div>
            <Label>Default Intensity (RPE 0–10)</Label>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-10 text-right">0</span>
              <div className="flex-1">
                {/* Using slider from ui */}
                {/* @ts-ignore Slider is available */}
                {/* We import Slider at top */}
                <Slider
                  min={0}
                  max={10}
                  step={1}
                  value={[getCurrentFormatProfile().defaultRPE]}
                  onValueChange={(vals) => updateFormatProfile('defaultRPE', vals[0] ?? 5)}
                />
              </div>
              <span className="text-xs text-muted-foreground w-10">10</span>
              <span className="text-sm font-medium w-10 text-right">{getCurrentFormatProfile().defaultRPE}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Rate of Perceived Exertion (0 = very easy, 10 = maximal)</p>
          </div>

          {/* Default Transition Time */}
          <div>
            <Label>Default Transition Time Between Blocks (seconds)</Label>
            <Select 
              value={getCurrentFormatProfile().defaultTransitionTime.toString()} 
              onValueChange={(value) => updateFormatProfile('defaultTransitionTime', parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-1">Manual Start</SelectItem>
                <SelectItem value="0">No Transition</SelectItem>
                <SelectItem value="15">15 seconds</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="45">45 seconds</SelectItem>
                <SelectItem value="60">1 minute</SelectItem>
                <SelectItem value="90">1:30</SelectItem>
                <SelectItem value="120">2 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Past Classes */}
          <div>
            <Label htmlFor="pastClasses">Past Classes</Label>
            <Textarea
              id="pastClasses"
              value={getCurrentFormatProfile().pastClasses.join('\n\n---\n\n')}
              onChange={(e) => {
                // Split by the separator but preserve all formatting
                const classes = e.target.value
                  .split(/\n\s*---\s*\n/)
                  // Only filter out completely empty entries
                  .filter(cls => cls.length > 0);
                updateFormatProfile('pastClasses', classes);
              }}
              placeholder="Paste your previous class templates here. Separate multiple classes with '---' on its own line."
              className="min-h-[200px] font-mono text-sm"
              spellCheck="false"
              wrap="soft"
            />
            <p className="text-sm text-muted-foreground mt-2">
              You can paste multiple class templates here with any formatting (tabs, spaces, symbols).
              Use '---' on its own line to separate different classes.
            </p>
          </div>
        </CardContent>
      </Card>


      <div className="flex justify-end">
        <Button onClick={saveProfile} className="px-8">
          Save Profile
        </Button>
      </div>
    </div>
  );
};