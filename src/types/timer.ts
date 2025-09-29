// TypeScript types for the Seconds-style interval timer

export type BlockType = 
  | "WARMUP" 
  | "COMBO" 
  | "PYRAMID" 
  | "RANDOMIZED" 
  | "LADDER" 
  | "COOLDOWN"
  | "EMOM"
  | "TABATA"
  | "INTERVAL"
  | "FINISHER"
  | string;

export interface TimelineItem {
  time: number;
  activity: string;
}

// Legacy format support
export interface ClassBlock {
  name: string;
  type?: BlockType;
  timeline: TimelineItem[];
  repeat?: number;
  rest_between_sets?: number;
}

export interface ClassPlan {
  class_name?: string;
  total_duration?: string | number;
  blocks: ClassBlock[];
}

// New enhanced format support
export interface EnhancedBlock {
  id: string;
  name: string;
  type: BlockType;
  duration: string; // For display
  duration_sec?: number; // For calculations
  pattern?: string;
  rounds?: number;
  work_rest?: string;
  timeline: string[];
  cues?: string[];
  intensity_target_rpe?: number;
  target_muscles?: Record<string, number>;
}

export interface EnhancedClassPlan {
  version?: string;
  metadata?: {
    class_name: string;
    duration_min: number;
    modality: string;
    level: string;
    intensity_curve?: string;
    impact_level?: 'low' | 'moderate' | 'high';
    avoid_list?: string[];
    required_moves?: string[];
    equipment?: string[];
    space_notes?: string;
    transition_policy?: 'manual' | 'auto';
  };
  blocks: EnhancedBlock[];
  time_audit?: {
    sum_min: number;
    buffer_min: number;
  };
}

export type AnyClassPlan = ClassPlan | EnhancedClassPlan;

export interface FlattenedInterval {
  id: string;
  activity: string;
  duration: number;
  blockName: string;
  blockType: BlockType;
  blockId?: string;
  setNumber?: number;
  totalSets?: number;
  isRest: boolean;
  cues?: string[];
  targetMuscles?: Record<string, number>;
}

export interface TimerState {
  isRunning: boolean;
  isPaused: boolean;
  isCompleted: boolean;
  currentIntervalIndex: number;
  currentTime: number;
  totalElapsed: number;
  totalDuration: number;
}

export interface AudioSettings {
  enabled: boolean;
  ttsEnabled: boolean;
  beepsEnabled: boolean;
}

export interface ClassSettings {
  blockBreakDuration: number; // 0 = no break, -1 = manual, or seconds
}