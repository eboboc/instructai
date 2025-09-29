import { parseFiles, parsePastedText } from './fileParser';
import { AIGenerationRequest } from './aiWorkoutGenerator';
import { classPlanV1Schema, ClassPlanV1, WorkoutBlock, TimelineItem } from '../ai/zodSchema';
import { SUBSTITUTION_MAP } from '../utils/style';
import { error, info, warn } from '../utils/logger';

// This is the internal request shape for building the prompt
interface PromptBuildConfig {
  preferences: {
    format: string;
    targetMinutes: number;
    intensity: string;
  };
  examples_raw: string;
  follow_slider: number;
  constraints: {
    mustSumToTarget: true;
    includeTransitionsIfSpecified: boolean;
    safety: {
      avoid: string;
    };
  };
}

export interface BotResponse {
  ok: boolean;
  plan: ClassPlanV1;
  error?: string;
}

const SYSTEM_INSTRUCTION = `You are a top-tier group fitness instructor. Create an easy-to-execute class inspired by the instructor’s pasted example. Treat the example as guidance, not ground truth: clean messy text, deduplicate, infer missing structure and timings, and fix inconsistencies. The plan must match the requested format/type and land within the requested duration tolerance (±2–3 minutes). You may use any block labels you like (e.g., “Primer”, “Build”, “Finisher”, “Core Reset”), and you are not required to use any specific taxonomy (no need to map to AMRAP, Tabata, etc.). Prefer including a brief Warm-up and a brief Cool-down, but names and ordering are up to you. Every step must have an integer length_sec and be runnable as-is. Output ONLY JSON matching the app schema (flexible block types).`;

/**
 * Generate workout using AI bot with specified system instruction.
 * This is the single entry point for the UI.
 */
export async function generateWorkout(request: AIGenerationRequest): Promise<BotResponse> {
  const { clarifyingQuestions, instructorProfile, format } = request;
  const minutes = clarifyingQuestions?.classLength || 45;
  const transitionTime = clarifyingQuestions?.transitionTime || '0';
  const avoidMovements = clarifyingQuestions?.movesToAvoid || '';
  const followSlider = clarifyingQuestions?.followUploadedExamples || 5;
  const pastedText = instructorProfile?.pastClasses?.join('\n\n') || '';

  try {
    let examples_raw = '';
    // Prioritize pasted text and skip file parsing if it exists.
    if (pastedText) {
      const pastedParseResult = parsePastedText(pastedText);
      if (pastedParseResult.ok) {
        examples_raw = pastedParseResult.text;
      }
    } else if (request.uploadedFiles && request.uploadedFiles.length > 0) {
      const fileParseResult = await parseFiles(request.uploadedFiles);
      if (fileParseResult.ok) {
        examples_raw = fileParseResult.text;
      }
    }

    // Build the user payload for the AI
    const userPayload = {
      preferences: {
        format: format || 'Fitness',
        minutes,
      },
      examples_raw: examples_raw.trim(),
      follow_slider: followSlider ?? 6, // Default to 6 if not provided
      constraints: {
        targetMinutes: minutes,
        toleranceSec: 180,
      },
    };

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API key not configured');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-1106-preview', // Use a model that supports JSON mode
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: JSON.stringify(userPayload, null, 2) },
        ],
        response_format: { type: 'json_object' },
        temperature: (followSlider / 10) < 0.5 ? 0.8 : 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('No content received from OpenAI');

    let plan = parseAndValidateWorkoutJSON(content, { targetMinutes: minutes });
    plan = sanitizeAndFinalizePlan(plan, request);
    return { ok: true, plan };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during generation';
    console.error('Workout generation failed, creating fallback:', errorMessage);
        let fallbackPlan = createFallbackWorkout({ format: format || 'Fitness', targetMinutes: minutes });
    const finalFallback = sanitizeAndFinalizePlan(fallbackPlan, request);
    return { ok: false, plan: finalFallback, error: errorMessage };
  }
}

function sanitizeAndFinalizePlan(partialPlan: any, request: AIGenerationRequest): ClassPlanV1 {
  const { clarifyingQuestions, format } = request;
  const minutes = clarifyingQuestions?.classLength || 45;

  // 1. Set Defaults
  const plan: ClassPlanV1 = {
    class_name: partialPlan.class_name || `${format} Workout (${minutes} min)`,
    total_duration_sec: 0, // Will be recomputed
    intensity_rpe: 'Mixed',
    notes: partialPlan.notes || '',
    blocks: partialPlan.blocks || [],
    safety: partialPlan.safety || { avoided_movements_respected: true, substitutions: [] },
  };

  // 2. Sanitize Blocks and Items & Recompute Durations
  let totalDuration = 0;
  plan.blocks.forEach(block => {
    block.type = String(block.type || block.label || "Block");
    block.label = block.label || block.type;
    let cumulativeTime = 0;
    block.timeline.forEach(item => {
      item.length_sec = Math.max(5, Number(item.length_sec) || 0);
      item.rest = !!item.rest;
      item.name = String(item.name || 'Move');
      item.start_sec = cumulativeTime;
      cumulativeTime += item.length_sec;
    });
    block.duration_sec = cumulativeTime;
    totalDuration += cumulativeTime;
  });
  plan.total_duration_sec = totalDuration;

  // 3. Duration Fit
  const targetSec = minutes * 60;
  const toleranceSec = 180;
  let drift = plan.total_duration_sec - targetSec;

  if (Math.abs(drift) > toleranceSec) {
    const lastBlock = plan.blocks[plan.blocks.length - 1];
    if (drift > 0 && lastBlock?.timeline.length) { // Too long
      const lastItem = lastBlock.timeline[lastBlock.timeline.length - 1];
      const reduction = Math.min(drift - toleranceSec, lastItem.length_sec - 5);
      if (reduction > 0) lastItem.length_sec -= reduction;
    } else if (drift < 0 && lastBlock) { // Too short
      const deficit = Math.abs(drift) + toleranceSec;
      lastBlock.timeline.push({
        name: 'Cool-down Finisher',
        length_sec: Math.min(deficit, 120),
        rest: false,
        start_sec: lastBlock.duration_sec,
        details: 'Final push'
      });
    }
  }

  // 4. Final Recalculation
  let finalTotal = 0;
  plan.blocks.forEach(block => {
    let blockTime = 0;
    block.timeline.forEach(item => {
      item.start_sec = blockTime;
      blockTime += item.length_sec;
    });
    block.duration_sec = blockTime;
    finalTotal += block.duration_sec;
  });
  plan.total_duration_sec = finalTotal;

  // 5. Final Validation and Instrumentation
  const validation = classPlanV1Schema.safeParse(plan);
  if (!validation.success) {
    error('sanitizeAndFinalizePlan', 'Plan failed final validation', validation.error.flatten());
  }

  console.log('[PLAN OK]', { 
    total: plan.total_duration_sec, 
    blocks: plan.blocks.map(b => ({label:b.label, type:b.type, dur:b.duration_sec, n:b.timeline.length})), 
    firstItem: plan.blocks?.[0]?.timeline?.[0] 
  });

  return plan;
}

function validatePlan(plan: ClassPlanV1, preferences: { targetMinutes: number }): void {
  const targetDurationSec = preferences.targetMinutes * 60;
  const tolerance = 10; // ±10 seconds
  
  // Calculate total duration from timeline items
  let totalDuration = 0;
  for (const block of plan.blocks) {
    for (const item of block.timeline) {
      totalDuration += item.length_sec;
    }
  }
  
  // Check duration is within tolerance
  if (Math.abs(totalDuration - targetDurationSec) > tolerance) {
    throw new Error(`Duration mismatch: generated ${totalDuration}s, expected ${targetDurationSec}s (±${tolerance}s)`);
  }
  
  // Validate timeline consistency within blocks
  for (const block of plan.blocks) {
    let expectedStart = 0;
    for (const item of block.timeline) {
      if (item.start_sec !== expectedStart) {
        console.warn(`Timeline inconsistency in block ${block.label}: item starts at ${item.start_sec}s, expected ${expectedStart}s`);
      }
      expectedStart += item.length_sec;
    }
  }
  
  // Check for required block types
  const blockTypes = plan.blocks.map(b => b.type);
  if (!blockTypes.includes('WARMUP')) {
    console.warn('No WARMUP block found in plan');
  }
  if (!blockTypes.includes('COOLDOWN')) {
    console.warn('No COOLDOWN block found in plan');
  }
}

/**
 * Parse and validate the workout JSON from AI response
 */
function parseAndValidateWorkoutJSON(content: string, preferences: { targetMinutes: number }): ClassPlanV1 {
  // Extract JSON from the response (handle markdown code blocks)
  let jsonStr = content.trim();
  
  // Remove markdown code block markers if present
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  
  try {
    const parsed = JSON.parse(jsonStr);
    
    // Validate required fields
    if (!parsed.class_name || !parsed.total_duration_sec || !parsed.blocks) {
      throw new Error('Missing required fields in workout plan');
    }
    
    // Ensure blocks have proper timeline structure
    parsed.blocks = parsed.blocks.map((block: any) => ({
      ...block,
      timeline: block.timeline || []
    }));
    
    // Ensure safety object exists
    if (!parsed.safety) {
      parsed.safety = {
        avoided_movements_respected: true,
        substitutions: []
      };
    }
    
    validatePlan(parsed, preferences);
    return parsed as ClassPlanV1;
    
  } catch (error) {
    throw new Error(`Failed to parse workout JSON: ${error instanceof Error ? error.message : 'Invalid JSON'}`);
  }
}

/**
 * Create a fallback workout when generation fails
 */
export function createFallbackWorkout(preferences: { format: string; targetMinutes: number }): Partial<ClassPlanV1> {
  const createBlock = (label: string, items: { name: string; length_sec: number; rest?: boolean }[]): WorkoutBlock => {
    const timeline: TimelineItem[] = items.map((item, i) => ({
      name: item.name,
      length_sec: item.length_sec,
      rest: !!item.rest,
      start_sec: items.slice(0, i).reduce((sum, curr) => sum + curr.length_sec, 0),
    }));
    return {
      label,
      type: label.toUpperCase(),
      duration_sec: timeline.reduce((sum, item) => sum + item.length_sec, 0),
      pattern: `${items.length} exercises`,
      timeline,
    };
  };

  return {
    class_name: `Fallback ${preferences.format} Class`,
    blocks: [
      createBlock('Warm-up', [{ name: 'Jumping Jacks', length_sec: 60 }, { name: 'Arm Circles', length_sec: 60 }]),
      createBlock('Build', [{ name: 'Squats', length_sec: 90 }, { name: 'Push-ups', length_sec: 90 }, { name: 'Rest', length_sec: 30, rest: true }]),
      createBlock('Core Reset', [{ name: 'Plank', length_sec: 60 }, { name: 'Crunches', length_sec: 60 }]),
      createBlock('Cool-down', [{ name: 'Hamstring Stretch', length_sec: 60 }, { name: 'Quad Stretch', length_sec: 60 }]),
    ],
  };
}
