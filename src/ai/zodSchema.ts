import { z } from 'zod';

const blockSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  normalized_type: z.enum([
    'WARMUP', 'INTERVAL', 'COOLDOWN', 'COMBO', 'TABATA', 'EMOM',
    'PYRAMID', 'RANDOMIZED', 'LADDER', 'FINISHER', 'TRANSITION',
    'AMRAP', 'SUPERSET', 'GIANT_SETS', 'CHALLENGE'
  ]).optional(),
  duration: z.string(),
  duration_sec: z.number(),
  pattern: z.string().optional(),
  rounds: z.number().optional(),
  work_rest: z.string().optional(),
  timeline: z.array(z.string()).min(0), // Allow empty timeline for format-only blocks
  cues: z.array(z.string()).optional(),
  intensity_target_rpe: z.number().optional(),
  target_muscles: z.record(z.number()).optional(),
});

export const workoutSchemaV2 = z.object({
  version: z.string(),
  metadata: z.object({
    class_name: z.string(),
    duration_min: z.number(),
    modality: z.string(),
    level: z.string(),
    intensity_curve: z.string().optional(),
    impact_level: z.enum(['low', 'moderate', 'high']).optional(),
    avoid_list: z.array(z.string()).optional(),
    required_moves: z.array(z.string()).optional(),
    equipment: z.array(z.string()).optional(),
    space_notes: z.string().optional(),
    transition_policy: z.enum(['manual', 'auto']).optional(),
    follow_uploaded_examples: z.number().optional(),
    uploaded_files: z.array(z.string()).optional(),
    normalized_upload_content: z.string().optional(),
  }),
  blocks: z.array(blockSchema),
  time_audit: z.object({
    sum_min: z.number(),
    buffer_min: z.number(),
  }).optional(), // Make time_audit optional during creation
});

export type EnhancedClassPlan = z.infer<typeof workoutSchemaV2>;

// --- Single Source of Truth Schema ---

export const timelineItemSchemaV1 = z.object({
  name: z.string(),
  length_sec: z.number(),
  rest: z.boolean(),
  start_sec: z.number(),
  details: z.string().optional(),
});

export const workoutBlockSchemaV1 = z.object({
  label: z.string(),
  type: z.string(), // Flexible string type
  duration_sec: z.number(),
  timeline: z.array(timelineItemSchemaV1),
  pattern: z.string().optional(),
});

const safetySchemaV1 = z.object({
  avoided_movements_respected: z.boolean(),
  substitutions: z.array(z.object({ from: z.string(), to: z.string(), reason: z.string() })),
});

export const classPlanV1Schema = z.object({
  class_name: z.string(),
  total_duration_sec: z.number(),
  intensity_rpe: z.enum(['Low', 'Moderate', 'High', 'Mixed']).optional(),
  notes: z.string().optional(),
  blocks: z.array(workoutBlockSchemaV1),
  safety: safetySchemaV1,
});

export type ClassPlanV1 = z.infer<typeof classPlanV1Schema>;
export type WorkoutBlock = z.infer<typeof workoutBlockSchemaV1>;
export type TimelineItem = z.infer<typeof timelineItemSchemaV1>;