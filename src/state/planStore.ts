import { create } from 'zustand';
import { EnhancedClassPlan } from '../ai/zodSchema';

// New JSON schema for bot response
export interface TimelineItem {
  start_sec: number;
  length_sec: number;
  name: string;
  details?: string;
  rest: boolean;
}

export interface WorkoutBlock {
  label: string;
  type: string;
  duration_sec: number;
  pattern: string;
  timeline: TimelineItem[];
}

export interface SafetyInfo {
  avoided_movements_respected: boolean;
  substitutions: Array<{
    from: string;
    to: string;
    reason: string;
  }>;
}

export interface ClassPlanV1 {
  class_name: string;
  total_duration_sec: number;
  intensity_rpe?: 'Low' | 'Moderate' | 'High' | 'Mixed';
  notes?: string;
  blocks: WorkoutBlock[];
  safety: SafetyInfo;
}

export interface PlanStore {
  uploadedText: string | null;       // extracted raw text (joined across files)
  normalizedText: string | null;     // cleaned text
  baselinePlan: EnhancedClassPlan | null;  // parsed plan
  warnings: string[];
  
  // New fields for ClassBuilder compatibility
  plan: Partial<ClassPlanV1> | null;
  assumptions: string[];
  
  // Actions
  setUploadedText: (text: string) => void;
  setNormalizedText: (text: string) => void;
  setBaselinePlan: (plan: EnhancedClassPlan, warnings?: string[]) => void;
  setPlan: (plan: Partial<ClassPlanV1>, assumptions?: string[], warnings?: string[]) => void;
  reset: () => void;
}

/**
 * Telemetry helper for import pipeline stages
 */
export function logStage(stage: string, data?: any) {
  console.info(`[IMPORT] ${stage}`, data ?? '');
}

export const usePlanStore = create<PlanStore>((set) => ({
  uploadedText: null,
  normalizedText: null,
  baselinePlan: null,
  warnings: [],
  plan: null,
  assumptions: [],

  setUploadedText: (text: string) => {
    logStage('uploaded_text_set', { chars: text.length });
    set({ uploadedText: text });
  },

  setNormalizedText: (text: string) => {
    logStage('normalized_text_set', { chars: text.length });
    set({ normalizedText: text });
  },

  setBaselinePlan: (plan: EnhancedClassPlan, warnings: string[] = []) => {
    logStage('baseline_plan_set', { 
      blocks: plan.blocks.length, 
      titles: plan.blocks.map(b => b.name || b.type),
      warnings: warnings.length
    });
    set({ baselinePlan: plan, warnings });
  },

  setPlan: (plan: Partial<ClassPlanV1>, assumptions: string[] = [], warnings: string[] = []) => {
    logStage('plan_set', { 
      blocks: plan.blocks.length, 
      duration: plan.total_duration_sec,
      assumptions: assumptions.length,
      warnings: warnings.length
    });
    set({ plan, assumptions, warnings });
  },

  reset: () => {
    logStage('store_reset');
    set({ 
      uploadedText: null, 
      normalizedText: null, 
      baselinePlan: null, 
      plan: null,
      assumptions: [],
      warnings: [] 
    });
  }
}));
