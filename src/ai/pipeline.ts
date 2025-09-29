import { extractInstructorIntent } from './extract';
import { normalizeAndStructure, deriveStyleProfile } from './normalize';
import { generatePlanFromNormalizedIntent } from './generate';
import { AIWorkoutGeneratorService } from '@/services/aiWorkoutGenerator';

export async function planFromAnyInput(inputText: string, past: string[], opts?: { defaultMinutes?: number, debug?: boolean, apiKey?: string }) {
  const apiKey = opts?.apiKey || process.env.VITE_OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key is not provided.');

  const intent = await extractInstructorIntent(inputText, past, apiKey);
  const normalized = normalizeAndStructure(inputText, (opts?.defaultMinutes ?? 45) * 60);
  const style = deriveStyleProfile(past);

  const plan = await generatePlanFromNormalizedIntent({
    ...intent,
    blocks: normalized,
  } as any, style, apiKey);

  const svc = new AIWorkoutGeneratorService(apiKey, undefined, !!opts?.debug);
  const clean = (svc as any).normalizePlan(plan);
  const fixed = (svc as any).fixWorkoutPlan(clean, {
    classDescription: '',
    format: intent.body_focus || 'mixed',
    clarifyingQuestions: {
      classLength: Math.round((intent.target_duration_sec || (opts?.defaultMinutes ?? 45) * 60) / 60),
      intensity: intent.intensity_rpe ?? 7,
      transitionTime: intent.transition_policy === 'auto' ? (intent.transition_sec ?? 0) : 'manual',
      bodyFocus: intent.body_focus ?? 'full',
      movesToAvoid: (intent.avoid_list||[]).join(','),
      specialNotes: ''
    },
    instructorProfile: { pastClasses: past, yearsTeaching: 'N/A' }
  } as any);

  const val = (svc as any).validateWorkoutPlan(fixed, { clarifyingQuestions: { classLength: Math.round((intent.target_duration_sec || (opts?.defaultMinutes ?? 45) * 60) / 60) } } as any);
  if (!val.isValid) throw new Error('Validation failed: ' + val.errors.join('; '));
  return fixed;
}
