import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SaveWorkoutButton } from '@/components/SaveWorkoutButton';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  SkipForward, 
  SkipBack,
  Volume2,
  VolumeX,
  Trophy,
  ArrowLeft,
  Settings
} from 'lucide-react';
import { FlattenedInterval, TimerState, AudioSettings, ClassSettings, AnyClassPlan } from '@/types/timer';
import { formatTime, getBlockColorClass, getBlockProgress, flattenClassPlan } from '@/utils/timerUtils';

interface TimerProps {
  classPlan: AnyClassPlan;
  breakDuration?: number | 'manual';
  autoStart?: boolean;
  onComplete?: () => void;
  onIntervalChange?: (intervalIndex: number) => void;
  format?: string;
}

export const Timer: React.FC<TimerProps> = ({ 
  classPlan, 
  breakDuration = 'manual',
  autoStart = false, 
  onComplete, 
  onIntervalChange,
  format = 'Workout'
}) => {
  const navigate = useNavigate();
  
  // Flatten the class plan to intervals
  const intervals = useMemo(() => {
    if (!classPlan) return [];
    return flattenClassPlan(classPlan);
  }, [classPlan]);
  const [timerState, setTimerState] = useState<TimerState>({
    isRunning: false,
    isPaused: false,
    isCompleted: false,
    currentIntervalIndex: 0,
    currentTime: intervals[0]?.duration || 0,
    totalElapsed: 0,
    totalDuration: intervals.reduce((sum, interval) => sum + interval.duration, 0)
  });

  const [audioSettings, setAudioSettings] = useState<AudioSettings>({
    enabled: true,
    ttsEnabled: false,
    beepsEnabled: true
  });

  const [classSettings, setClassSettings] = useState<ClassSettings>({
    blockBreakDuration: typeof breakDuration === 'number' ? breakDuration : -1
  });

  const [showPreClassModal, setShowPreClassModal] = useState(false);
  const [currentCueIndex, setCurrentCueIndex] = useState(0);
  const [lastBlockId, setLastBlockId] = useState<string>('');
  const [isInBlockBreak, setIsInBlockBreak] = useState(false);
  const [blockBreakTime, setBlockBreakTime] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize audio context
  useEffect(() => {
    if (typeof window !== 'undefined' && window.AudioContext) {
      audioContextRef.current = new AudioContext();
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Update class settings when breakDuration prop changes
  useEffect(() => {
    setClassSettings(prev => ({
      ...prev,
      blockBreakDuration: typeof breakDuration === 'number' ? breakDuration : -1
    }));
  }, [breakDuration]);

  // Audio functions
  const playBeep = useCallback((frequency: number = 800, duration: number = 200, double: boolean = false) => {
    if (!audioSettings.beepsEnabled || !audioContextRef.current) return;

    try {
      const oscillator = audioContextRef.current.createOscillator();
      const gainNode = audioContextRef.current.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContextRef.current.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + duration / 1000);
      
      oscillator.start(audioContextRef.current.currentTime);
      oscillator.stop(audioContextRef.current.currentTime + duration / 1000);
      
      // Double beep if requested
      if (double) {
        setTimeout(() => {
          const oscillator2 = audioContextRef.current!.createOscillator();
          const gainNode2 = audioContextRef.current!.createGain();
          
          oscillator2.connect(gainNode2);
          gainNode2.connect(audioContextRef.current!.destination);
          
          oscillator2.frequency.value = frequency * 1.2;
          oscillator2.type = 'sine';
          
          gainNode2.gain.setValueAtTime(0.3, audioContextRef.current!.currentTime);
          gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current!.currentTime + duration / 1000);
          
          oscillator2.start(audioContextRef.current!.currentTime);
          oscillator2.stop(audioContextRef.current!.currentTime + duration / 1000);
        }, 300);
      }
    } catch (error) {
      console.warn('Could not play beep:', error);
    }
  }, [audioSettings.beepsEnabled]);

  const playTransitionBeep = useCallback((isBlockEnd: boolean) => {
    if (isBlockEnd) {
      playBeep(1000, 400, true); // Double beep for block end
    } else {
      playBeep(800, 200); // Single beep for interval change
    }
  }, [playBeep]);

  // Main timer effect
  useEffect(() => {
    if (!timerState.isRunning || timerState.isCompleted || isInBlockBreak) return;

    intervalRef.current = setInterval(() => {
      setTimerState(prev => {
        // Don't go below zero
        const newTime = Math.max(0, prev.currentTime - 1);
        const newElapsed = prev.totalElapsed + 1;
        
        // If we've reached zero, don't increment elapsed time further
        // This prevents the elapsed time from exceeding the total duration
        const adjustedElapsed = newTime === 0 && prev.currentTime === 0 ? prev.totalElapsed : newElapsed;

        // Countdown beeps
        if (newTime === 3) playBeep(800, 150);
        if (newTime === 2) playBeep(900, 150);
        if (newTime === 1) playBeep(1000, 200);

        return {
          ...prev,
          currentTime: newTime,
          totalElapsed: Math.min(adjustedElapsed, prev.totalDuration) // Ensure we don't exceed total duration
        };
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [timerState.isRunning, timerState.isCompleted, isInBlockBreak, playBeep]);

  // Handle interval completion and block transitions
  useEffect(() => {
    if (timerState.currentTime > 0 || timerState.isCompleted || isInBlockBreak) return;

    const blockProgress = getBlockProgress(intervals, timerState.currentIntervalIndex);

    // Reset cue index when block changes
    const currentBlockId = intervals[timerState.currentIntervalIndex]?.blockId || '';
    if (currentBlockId !== lastBlockId) {
      setCurrentCueIndex(0);
      setLastBlockId(currentBlockId);
    }

    // Auto-advance when current interval completes
    if (timerState.currentIntervalIndex < intervals.length - 1) {
      const currentBlock = intervals[timerState.currentIntervalIndex];
      const nextInterval = intervals[timerState.currentIntervalIndex + 1];
      
      // Check if we're transitioning to a new block
      const isNewBlock = currentBlock.blockId !== nextInterval.blockId;
      
      if (isNewBlock && classSettings.blockBreakDuration >= 0) {
        // Start block break
        playTransitionBeep(true); // Double beep for block end
        setIsInBlockBreak(true);
        setBlockBreakTime(classSettings.blockBreakDuration);
        
        if (classSettings.blockBreakDuration === 0) {
          // No break, advance immediately
          advanceToNextInterval();
        }
      } else {
        // Regular interval transition
        playTransitionBeep(false);
        advanceToNextInterval();
      }
    } else {
      // Workout completed
      playTransitionBeep(true);
      
      // Calculate total duration to ensure accurate elapsed time
      const totalDuration = intervals.reduce((sum, interval) => sum + interval.duration, 0);
      
      setTimerState(prev => ({
        ...prev,
        isRunning: false,
        isCompleted: true,
        currentTime: 0,
        totalElapsed: totalDuration // Set elapsed time to total duration for accuracy
      }));
      
      // Call onComplete callback if provided
      if (onComplete) {
        onComplete();
      }
    }
  }, [timerState.currentTime, timerState.isCompleted, timerState.currentIntervalIndex, intervals, lastBlockId, classSettings.blockBreakDuration, isInBlockBreak, playTransitionBeep]);

  // Handle block break countdown
  useEffect(() => {
    if (!isInBlockBreak || classSettings.blockBreakDuration <= 0) return;

    const breakInterval = setInterval(() => {
      setBlockBreakTime(prev => {
        if (prev <= 1) {
          // Block break completed, advance to next interval
          setIsInBlockBreak(false);
          advanceToNextInterval();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(breakInterval);
  }, [isInBlockBreak, classSettings.blockBreakDuration]);

  const advanceToNextInterval = useCallback(() => {
    setTimerState(prev => {
      // Calculate the actual elapsed time for the current interval
      const currentInterval = intervals[prev.currentIntervalIndex];
      const currentIntervalElapsed = currentInterval ? currentInterval.duration - prev.currentTime : 0;
      
      // Calculate the new total elapsed time
      // This is the sum of all completed intervals plus the elapsed time of the current interval
      let completedIntervalsDuration = 0;
      for (let i = 0; i < prev.currentIntervalIndex; i++) {
        completedIntervalsDuration += intervals[i].duration;
      }
      
      const newTotalElapsed = completedIntervalsDuration + currentIntervalElapsed;
      
      return {
        ...prev,
        currentIntervalIndex: prev.currentIntervalIndex + 1,
        currentTime: intervals[prev.currentIntervalIndex + 1].duration,
        totalElapsed: Math.min(newTotalElapsed, prev.totalDuration) // Ensure we don't exceed total duration
      };
    });
    onIntervalChange?.(timerState.currentIntervalIndex + 1);
  }, [intervals, onIntervalChange, timerState.currentIntervalIndex]);

  // Cue rotation effect
  useEffect(() => {
    if (!timerState.isRunning || isInBlockBreak) return;

    const currentInterval = intervals[timerState.currentIntervalIndex];
    const cues = currentInterval?.cues;
    
    if (!cues || cues.length <= 1) return;

    const cueInterval = setInterval(() => {
      setCurrentCueIndex(prev => (prev + 1) % cues.length);
    }, 5000);

    return () => clearInterval(cueInterval);
  }, [timerState.isRunning, timerState.currentIntervalIndex, intervals, isInBlockBreak]);

  const handleStartPause = useCallback(() => {
    if (isInBlockBreak && classSettings.blockBreakDuration === -1) {
      // Manual start from block break
      setIsInBlockBreak(false);
      advanceToNextInterval();
      setTimerState(prev => ({ ...prev, isRunning: true, isPaused: false }));
    } else {
      setTimerState(prev => ({
        ...prev,
        isRunning: !prev.isRunning,
        isPaused: prev.isRunning,
        isCompleted: false
      }));
    }
  }, [isInBlockBreak, classSettings.blockBreakDuration, advanceToNextInterval]);

  const handleNext = useCallback(() => {
    // If we're on the last interval, complete the workout
    if (timerState.currentIntervalIndex >= intervals.length - 1) {
      // Calculate total duration
      const totalDuration = intervals.reduce((sum, interval) => sum + interval.duration, 0);
      
      // Set the workout as completed
      setTimerState(prev => ({
        ...prev,
        isRunning: false,
        isCompleted: true,
        currentTime: 0,
        totalElapsed: totalDuration
      }));
      
      return;
    }
    
    // Normal case - move to next interval
    const nextIndex = timerState.currentIntervalIndex + 1;
    const nextInterval = intervals[nextIndex];
    
    setTimerState(prev => {
      // Calculate elapsed time up to the next interval
      let elapsedTime = 0;
      for (let i = 0; i <= timerState.currentIntervalIndex; i++) {
        elapsedTime += intervals[i].duration;
      }
      
      return {
        ...prev,
        currentIntervalIndex: nextIndex,
        currentTime: nextInterval.duration,
        totalElapsed: Math.min(elapsedTime, prev.totalDuration) // Ensure we don't exceed total duration
      };
    });
    
    onIntervalChange?.(nextIndex);
  }, [intervals, timerState.currentIntervalIndex, onIntervalChange]);

  const handlePrevious = useCallback(() => {
    if (timerState.currentIntervalIndex <= 0) return;
    
    const prevIndex = timerState.currentIntervalIndex - 1;
    const prevInterval = intervals[prevIndex];
    
    setTimerState(prev => {
      // Calculate elapsed time up to the previous interval
      let elapsedTime = 0;
      for (let i = 0; i < prevIndex; i++) {
        elapsedTime += intervals[i].duration;
      }
      
      return {
        ...prev,
        currentIntervalIndex: prevIndex,
        currentTime: prevInterval.duration,
        totalElapsed: elapsedTime // This is the elapsed time up to but not including the current interval
      };
    });
    
    onIntervalChange?.(prevIndex);
  }, [intervals, timerState.currentIntervalIndex, onIntervalChange]);

  const handleReset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    // Calculate the total duration from all intervals
    const totalDuration = intervals.reduce((sum, interval) => sum + interval.duration, 0);
    
    setTimerState({
      isRunning: false,
      isPaused: false,
      isCompleted: false,
      currentIntervalIndex: 0,
      currentTime: intervals[0]?.duration || 0,
      totalElapsed: 0,
      totalDuration: totalDuration
    });
    setIsInBlockBreak(false);
    setCurrentCueIndex(0);
  }, [intervals]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      
      switch (e.key) {
        case ' ':
          e.preventDefault();
          handleStartPause();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlePrevious();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handleReset();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleStartPause, handleNext, handlePrevious, handleReset]);

  if (intervals.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">No Intervals Found</h2>
          <p className="text-muted-foreground">Please check your class plan configuration.</p>
        </Card>
      </div>
    );
  }

  const currentInterval = intervals[timerState.currentIntervalIndex];
  const nextInterval = intervals[timerState.currentIntervalIndex + 1];
  const blockProgress = getBlockProgress(intervals, timerState.currentIntervalIndex);
  const overallProgress = (timerState.totalElapsed / timerState.totalDuration) * 100;
  
  // Find next block info
  const nextBlockInterval = intervals.slice(timerState.currentIntervalIndex + 1)
    .find(interval => interval.blockId !== currentInterval?.blockId);

  const handlePreClassSetup = (breakDuration: number) => {
    setClassSettings({ blockBreakDuration: breakDuration });
    setShowPreClassModal(false);
  };

  return (
    <>
      {/* Pre-Class Setup Modal - Removed since handled by Index component */}

      <div className="min-h-screen bg-background">
        {/* Overall Progress Bar */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
          <Progress value={overallProgress} className="h-2 rounded-none" />
        </div>

        {/* Header with Navigation */}
        <div className="fixed top-2 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm">
          <div className="flex justify-between items-center p-2 px-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/class-builder', { state: { plan: classPlan } })}
              className="text-sm font-medium"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Design
            </Button>
            <h2 className="text-lg font-semibold">
              {currentInterval?.blockName || (classPlan as any)?.metadata?.class_name || 'Workout Timer'}
            </h2>
            <Button variant="ghost" size="sm">
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Left Sidebar */}
        <div className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] w-80 bg-card border-r border-border overflow-y-auto">
            <div className="p-4">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-foreground mb-2">Class Overview</h2>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Elapsed: {formatTime(timerState.totalElapsed)}</div>
                  <div>Remaining: {formatTime(timerState.totalDuration - timerState.totalElapsed)}</div>
                  <div>Total: {formatTime(timerState.totalDuration)}</div>
                  <div className="font-medium text-primary">
                    {Math.round(overallProgress)}% Complete
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center space-x-2">
                  {audioSettings.beepsEnabled ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                  <Label htmlFor="beeps-toggle" className="text-xs">Audio Beeps</Label>
                  <Switch
                    id="beeps-toggle"
                    checked={audioSettings.beepsEnabled}
                    onCheckedChange={(checked) => 
                      setAudioSettings(prev => ({ ...prev, beepsEnabled: checked }))
                    }
                  />
                </div>
              </div>

            {/* Block Progress Overview */}
            <div className="space-y-3">
              {Array.from(new Set(intervals.map(i => i.blockId))).map((blockId, index) => {
                const blockIntervals = intervals.filter(i => i.blockId === blockId);
                const firstInterval = blockIntervals[0];
                const blockDuration = blockIntervals.reduce((sum, i) => sum + i.duration, 0);
                const isCurrentBlock = currentInterval?.blockId === blockId;
                const blockCompleted = intervals.slice(0, timerState.currentIntervalIndex)
                  .filter(i => i.blockId === blockId).length === blockIntervals.length;
                
                // Check if this is a transition block
                const isTransition = firstInterval.blockType === 'TRANSITION';
                
                return (
                  <div 
                    key={blockId} 
                    className={`p-2 rounded-lg border text-xs ${
                      isTransition
                        ? 'border-secondary bg-secondary/20'
                        : isCurrentBlock 
                          ? 'border-primary bg-primary/10' 
                          : blockCompleted 
                            ? 'border-success bg-success/10' 
                            : 'border-muted bg-muted/30'
                    }`}
                  >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex-1 min-w-0">
                          <h3 className={`text-xs font-medium truncate ${
                            isTransition 
                              ? 'text-secondary-foreground' 
                              : isCurrentBlock 
                                ? 'text-primary' 
                                : 'text-foreground'
                          }`}>
                            {isTransition ? 'Transition' : firstInterval.blockName}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-1 py-0.5 rounded-full font-medium ${
                              isTransition 
                                ? 'bg-secondary text-secondary-foreground' 
                                : getBlockColorClass(firstInterval.blockType)
                            } text-foreground`}>
                              {isTransition ? 'TRANSITION' : firstInterval.blockType}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              {formatTime(blockDuration)}
                            </p>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground ml-2">
                          {index + 1}/{Array.from(new Set(intervals.map(i => i.blockId))).length}
                        </div>
                      </div>
                    {isCurrentBlock && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Progress</span>
                          <span>{Math.round((blockProgress.progressInBlock / blockProgress.totalBlockIntervals) * 100)}%</span>
                        </div>
                        <Progress value={(blockProgress.progressInBlock / blockProgress.totalBlockIntervals) * 100} className="h-1" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Timer Area */}
        <div className="ml-80 min-h-screen pt-16 pb-20">{/* Added pt-16 for header space and pb-20 for bottom nav space */}
          <div className="flex flex-col items-center justify-center min-h-screen p-8">
            {isInBlockBreak ? (
              <Card className="w-full max-w-2xl p-12 text-center bg-break border-2 border-border">
                <div className="mb-8">
                  <h1 className="text-2xl font-bold mb-2 text-break-foreground">Block Break</h1>
                  <div className="text-lg text-muted-foreground">
                    Get ready for: {nextInterval?.blockName}
                  </div>
                </div>
                
                <div className="mb-8">
                  <div className="text-8xl font-mono font-bold tracking-wider text-break-foreground">
                    {classSettings.blockBreakDuration === -1 ? 'READY?' : formatTime(blockBreakTime)}
                  </div>
                </div>

                {classSettings.blockBreakDuration === -1 ? (
                  <Button size="lg" onClick={handleStartPause} className="px-8 bg-primary text-primary-foreground hover:bg-primary/90 border-2 border-primary">
                    <Play className="h-5 w-5 mr-2" /> Start Next Block
                  </Button>
                ) : (
                  <Button 
                    size="lg" 
                    onClick={() => {
                      setIsInBlockBreak(false);
                      setBlockBreakTime(0);
                      setTimerState(prev => ({ ...prev, isRunning: true }));
                    }}
                    className="px-8 bg-primary text-primary-foreground hover:bg-primary/90 border-2 border-primary"
                  >
                    <SkipForward className="h-5 w-5 mr-2" /> Skip Break
                  </Button>
                )}
              </Card>
            ) : (
              <Card className={`w-full max-w-2xl p-12 text-center ${
                currentInterval?.blockType === 'TRANSITION' 
                  ? 'bg-secondary/20 border-secondary' 
                  : getBlockColorClass(currentInterval?.blockType, currentInterval?.isRest)
              }`}>
                {/* Block Info */}
                <div className="mb-8">
                  <h1 className="text-2xl font-bold mb-2">
                    {currentInterval?.blockType === 'TRANSITION' 
                      ? 'Transition' 
                      : currentInterval?.blockName || 'Ready'}
                  </h1>
                  <div className="text-lg text-muted-foreground">
                    {currentInterval?.blockType === 'TRANSITION' ? (
                      <span className="text-secondary-foreground font-medium">
                        Prepare for next block
                      </span>
                    ) : blockProgress.blockName && (
                      <span>
                        Block {blockProgress.currentBlockIndex + 1} of {blockProgress.totalBlocks} — {Math.round(overallProgress)}% Complete
                      </span>
                    )}
                  </div>
                </div>

                {/* Current Activity */}
                <div className="mb-8">
                  {timerState.isCompleted ? (
                    <>
                      <div className="flex justify-center mb-4">
                        <Trophy className="h-16 w-16 text-yellow-500" />
                      </div>
                      <h2 className="text-4xl font-bold mb-4">Workout Complete!</h2>
                      <div className="text-xl font-medium mb-8">
                        Great job! You've completed your workout.
                      </div>
                      <SaveWorkoutButton plan={classPlan} format={format} />
                    </>
                  ) : (
                    <>
                      <h2 className="text-4xl font-bold mb-4">
                        {currentInterval?.blockType === 'TRANSITION' 
                          ? 'Transition Time' 
                          : currentInterval?.activity || 'Ready to Start'}
                      </h2>
                      <div className={`text-8xl font-mono font-bold tracking-wider ${
                        currentInterval?.blockType === 'TRANSITION' ? 'text-secondary-foreground' : ''
                      }`}>
                        {formatTime(timerState.currentTime)}
                      </div>
                    </>
                  )}
                </div>

                {/* Interval Progress Bar */}
                {!timerState.isCompleted && (
                  <div className="mb-8">
                    <div className="flex justify-between text-sm text-muted-foreground mb-2">
                      <span>Interval Progress</span>
                      <span>
                        {currentInterval ? Math.round(((currentInterval.duration - timerState.currentTime) / currentInterval.duration) * 100) : 0}%
                      </span>
                    </div>
                    <Progress 
                      value={currentInterval ? ((currentInterval.duration - timerState.currentTime) / currentInterval.duration) * 100 : 0} 
                      className="h-3 [&>div]:transition-all [&>div]:duration-1000 [&>div]:ease-linear"
                    />
                  </div>
                )}

                {/* Instructor Cue Bar */}
                {currentInterval?.cues && currentInterval.cues.length > 0 && !timerState.isCompleted && (
                  <div className="mb-8 text-center">
                    <div className="text-3xl font-bold text-foreground leading-tight max-w-xl mx-auto">
                      {currentInterval.cues[currentCueIndex]}
                    </div>
                  </div>
                )}

                {/* Next Move Only */}
                {nextInterval && !timerState.isCompleted && (
                  <div className="mb-8">
                    <div className="p-4 bg-muted rounded-lg text-center">
                      <div className="text-sm text-muted-foreground mb-1">NEXT MOVE</div>
                      <div className="text-lg font-semibold">
                        {nextInterval.activity} — {formatTime(nextInterval.duration)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Controls */}
                {!timerState.isCompleted ? (
                  <div className="flex justify-center space-x-4">
                    <Button 
                      variant="outline" 
                      size="lg" 
                      onClick={handlePrevious}
                      disabled={timerState.currentIntervalIndex === 0}
                      className="bg-background text-foreground border-2 border-border hover:bg-muted"
                    >
                      <SkipBack className="h-5 w-5" />
                    </Button>
                    
                    <Button 
                      size="lg" 
                      onClick={handleStartPause}
                      className="px-8 bg-primary text-primary-foreground hover:bg-primary/90 border-2 border-primary"
                    >
                      {timerState.isRunning ? (
                        <><Pause className="h-5 w-5 mr-2" /> Pause</>
                      ) : timerState.isCompleted ? (
                        <><RotateCcw className="h-5 w-5 mr-2" /> Reset</>
                      ) : (
                        <><Play className="h-5 w-5 mr-2" /> Start</>
                      )}
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      size="lg" 
                      onClick={handleNext}
                      className="bg-background text-foreground border-2 border-border hover:bg-muted"
                    >
                      {timerState.currentIntervalIndex >= intervals.length - 1 ? (
                        <>
                          <SkipForward className="h-5 w-5 mr-2" /> Finish
                        </>
                      ) : (
                        <SkipForward className="h-5 w-5" />
                      )}
                    </Button>
                    
                    <Button 
                      variant="destructive" 
                      size="lg" 
                      onClick={handleReset}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90 border-2 border-destructive"
                    >
                      <RotateCcw className="h-5 w-5" />
                    </Button>
                  </div>
                ) : (
                  <div className="mt-8">
                    <Button 
                      variant="outline" 
                      size="lg" 
                      onClick={handleReset}
                      className="w-full bg-background text-foreground border-2 border-border hover:bg-muted"
                    >
                      <RotateCcw className="h-5 w-5 mr-2" /> Reset Workout
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
};