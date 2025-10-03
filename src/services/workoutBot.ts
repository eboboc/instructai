import { parseFiles, parsePastedText } from './fileParser';
import { AIGenerationRequest } from './aiWorkoutGenerator';
import { classPlanV1Schema, ClassPlanV1, WorkoutBlock, TimelineItem } from '../ai/zodSchema';
import { error, info, warn } from '../utils/logger';
import { getFormatGuidance } from './workoutFormats';

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

const SYSTEM_INSTRUCTION = `You are a top-tier group fitness instructor creating personalized workout plans. Your primary responsibility is to strictly follow the user's chosen settings and preferences.

CRITICAL REQUIREMENTS:

1. FORMAT ADHERENCE:
   - Match the requested workout format (HIIT, Strength, Yoga, Pilates, etc.) with appropriate exercises and structure
   - Use terminology and exercise patterns specific to the selected format

2. DURATION PRECISION:
   - The workout MUST match the requested duration EXACTLY
   - total_duration_sec MUST be within 60 seconds of the requested duration (e.g., a 45-minute workout should be 2700±60 seconds)
   - Distribute time appropriately across workout phases (typically 10-15% warm-up, 70-80% main work, 10-15% cool-down)

3. TIMING STANDARDIZATION:
   - ALL exercise durations MUST be multiples of 5 seconds (e.g., 30s, 45s, 60s, 90s)
   - ALL block durations MUST be multiples of 10 seconds (e.g., 60s, 120s, 180s)
   - NEVER use odd durations like 37s, 93s, or 125s
   - Strongly prefer clean, round numbers (30s, 60s, 90s) for better user experience
   - The total workout duration MUST be a multiple of 10 seconds

4. MOVEMENT RESTRICTIONS:
   - NEVER include movements the user has marked as restricted
   - If restrictions are provided, acknowledge them in the safety section

5. EXAMPLE FOLLOWING:
   - When examples are provided, analyze and incorporate their structure, terminology, and style
   - The higher the follow_slider value, the more closely you should match the example
   - At maximum follow_slider (10), copy the example format exactly with minimal modifications

6. BLOCK STRUCTURE:
   - Include appropriate workout blocks (e.g., "Warm-up", "Build", "Core Work", "Cool-down")
   - Each block should have a clear purpose and appropriate exercises
   - Ensure proper exercise sequencing and rest periods

OUTPUT FORMAT:
You must output ONLY valid JSON with these REQUIRED fields:

{
  "class_name": "Descriptive Workout Name",
  "total_duration_sec": number,
  "blocks": [
    {
      "label": "Block Name",
      "type": "BLOCK_TYPE",
      "duration_sec": number,
      "timeline": [
        {
          "name": "Exercise Name",
          "length_sec": number,
          "rest": boolean,
          "start_sec": number,
          "details": "Optional details"
        }
      ]
    }
  ],
  "safety": {
    "avoided_movements_respected": boolean,
    "substitutions": []
  }
}

QUALITY VERIFICATION:
Before finalizing your response, verify that:
1. total_duration_sec is within 60 seconds of the requested duration
2. ALL exercise durations are multiples of 5 seconds
3. The workout structure is logical and executable
4. No restricted movements are included
5. The format aligns with the user's selection

Your response must be valid JSON with all required fields. Do not include any explanation or markdown formatting.`;

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
  
  // Check if the slider is at maximum (10) - "Copy Exactly" mode
  const isExactCopyMode = followSlider === 10;

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
    
    // If in "Copy Exactly" mode and we have examples, parse them directly without AI
    if (isExactCopyMode && examples_raw.trim()) {
      info('generateWorkout', 'Using "Copy Exactly" mode - bypassing AI generation');
      
      try {
        // Try to parse the example as a workout directly
        const parsedWorkout = parseWorkoutFromExample(examples_raw, format || 'Fitness', minutes);
        
        // Apply duration adjustments and ensure all times are multiples of 5
        enforceMultiplesOf5(parsedWorkout);
        
        // Finalize the plan
        const finalizedPlan = sanitizeAndFinalizePlan(parsedWorkout, request);
        return { ok: true, plan: finalizedPlan };
      } catch (parseError) {
        warn('generateWorkout', `Failed to parse example directly in "Copy Exactly" mode: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
        // Continue with AI generation as fallback
      }
    }

    // Build the user payload for the AI
    const userPayload = {
      preferences: {
        format: format || 'Fitness',
        minutes,
        targetDurationSec: minutes * 60,
        followExampleCloseness: followSlider / 10, // Normalized to 0-1 range
      },
      examples_raw: examples_raw.trim(),
      follow_slider: followSlider ?? 6, // Default to 6 if not provided
      constraints: {
        targetMinutes: minutes,
        targetDurationSec: minutes * 60,
        toleranceSec: 60, // Stricter tolerance (±60 seconds)
        mustMatchDuration: true, // Explicit flag to enforce duration matching
        requireMultiplesOf5: true, // All exercise durations must be multiples of 5 seconds
        requireMultiplesOf10ForBlocks: true, // All block durations must be multiples of 10 seconds
        requireMultiplesOf10ForTotal: true, // Total workout duration must be a multiple of 10 seconds
        preferStandardDurations: true, // Prefer standard durations (30s, 60s, 90s) when possible
        avoidMovements: avoidMovements ? avoidMovements.split(',').map(m => m.trim()) : [],
      },
      instructions: [
        `Create a ${format || 'Fitness'} workout that is EXACTLY ${minutes} minutes (${minutes * 60} seconds) in duration.`,
        `The total duration MUST be between ${minutes * 60 - 60} and ${minutes * 60 + 60} seconds.`,
        `ALL exercise durations MUST be multiples of 5 seconds (e.g., 30s, 45s, 60s, 90s).`,
        `ALL block durations MUST be multiples of 10 seconds (e.g., 60s, 120s, 180s).`,
        `The total workout duration MUST be a multiple of 10 seconds.`,
        `NEVER use odd durations like 37s, 93s, or 125s.`,
        `Strongly prefer clean, round numbers (30s, 60s, 90s) for better user experience.`,
        avoidMovements ? `Avoid these movements: ${avoidMovements}` : '',
        followSlider >= 8 ? `Follow the provided example VERY closely, matching its structure and style.` : '',
        followSlider === 10 ? `COPY EXACTLY the format of the provided example with minimal changes.` : '',
      ].filter(Boolean),
      formatGuidance: getFormatGuidance(format || 'Fitness'),
    };

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API key not configured');

    // Prepare the request payload
    const payload = {
      model: import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini', // Use environment variable or fallback
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: JSON.stringify(userPayload, null, 2) },
      ],
      response_format: { type: 'json_object' },
      // Use a very low temperature to ensure strict adherence to formatting rules
      temperature: 0.2,
      max_tokens: 4000,
    };

    // Implement retry logic with exponential backoff
    const maxRetries = 5; // Increased for handling duration validation errors
    let retries = 0;
    let response;
    let data;
    let validationError = false;

    while (retries <= maxRetries) {
      try {
        info('OpenAI API', `Attempt ${retries + 1}/${maxRetries + 1}`);
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        });

        // Handle rate limiting (429 error)
        if (response.status === 429) {
          if (retries >= maxRetries) {
            throw new Error(`OpenAI API rate limit exceeded after ${maxRetries + 1} attempts`);
          }
          
          // Get retry delay from response headers or use exponential backoff
          const retryAfter = response.headers.get('Retry-After');
          const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, retries) * 1000;
          
          warn('OpenAI API', `Rate limit hit, waiting ${delayMs}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          retries++;
          continue;
        }

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }

        data = await response.json();
        
        // Try to validate the content for compliant durations
        try {
          const content = data.choices[0]?.message?.content;
          if (!content) throw new Error('No content received from OpenAI');
          
          // Pre-validate the content to check for non-compliant durations
          validateRawContent(content);
          
          // If we get here, validation passed
          break; // Success, exit the retry loop
        } catch (validError) {
          // If this is a duration validation error, retry
          if (validError instanceof Error && validError.message.includes('Invalid workout format')) {
            validationError = true;
            warn('OpenAI API', `Duration validation failed: ${validError.message}. Retrying...`);
            
            // Lower temperature for next attempt
            payload.temperature = 0.1;
            
            retries++;
            continue;
          }
          // For other validation errors, continue with the response
          break;
        }
      } catch (err) {
        if (retries >= maxRetries || !(err instanceof Error && err.message.includes('429'))) {
          throw err; // Rethrow if max retries reached or not a rate limit error
        }
        retries++;
      }
    }

    if (!data) {
      throw new Error('Failed to get response from OpenAI API');
    }
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('No content received from OpenAI');
    
    // Parse the JSON response (validation already done in the retry loop)
    let plan = parseAndValidateWorkoutJSON(content, { targetMinutes: minutes });
    
    // Enforce all durations to be multiples of 5 seconds
    enforceMultiplesOf5(plan);
    
    // Finalize the plan
    plan = sanitizeAndFinalizePlan(plan, request);
    return { ok: true, plan };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during generation';
    console.error('Workout generation failed, creating fallback:', errorMessage);
    let fallbackPlan = createFallbackWorkout({ format: format || 'Fitness', targetMinutes: minutes });
    
    // Ensure fallback plan also uses multiples of 5 seconds
    enforceMultiplesOf5(fallbackPlan);
    
    const finalFallback = sanitizeAndFinalizePlan(fallbackPlan, request);
    return { ok: false, plan: finalFallback, error: errorMessage };
  }
}

function sanitizeAndFinalizePlan(partialPlan: any, request: AIGenerationRequest): ClassPlanV1 {
  const { clarifyingQuestions, format } = request;
  const minutes = clarifyingQuestions?.classLength || 45;

  // Check if we have a valid plan to work with
  if (!partialPlan || typeof partialPlan !== 'object') {
    warn('sanitizeAndFinalizePlan', 'Invalid partial plan, creating complete fallback');
    return createFallbackWorkout({ format: format || 'Fitness', targetMinutes: minutes });
  }

  // 1. Set Defaults
  const plan: ClassPlanV1 = {
    class_name: partialPlan.class_name || `${format || 'Fitness'} Workout (${minutes} min)`,
    total_duration_sec: 0, // Will be recomputed
    intensity_rpe: partialPlan.intensity_rpe || 'Mixed',
    notes: partialPlan.notes || '',
    blocks: Array.isArray(partialPlan.blocks) ? partialPlan.blocks : [],
    safety: partialPlan.safety || { avoided_movements_respected: true, substitutions: [] },
  };

  // Check if blocks array is empty or invalid
  if (!plan.blocks.length) {
    warn('sanitizeAndFinalizePlan', 'No blocks in plan, creating fallback blocks');
    const fallback = createFallbackWorkout({ format: format || 'Fitness', targetMinutes: minutes });
    plan.blocks = fallback.blocks;
  }

  // 2. Sanitize Blocks and Items & Recompute Durations
  let totalDuration = 0;
  plan.blocks.forEach(block => {
    // Ensure block has required properties
    block.type = String(block.type || block.label || "Block");
    block.label = block.label || block.type;
    block.pattern = block.pattern || `${block.type} exercises`;
    
    // Ensure timeline exists
    if (!Array.isArray(block.timeline)) {
      block.timeline = [];
      warn('sanitizeAndFinalizePlan', `Block ${block.label} missing timeline, adding empty array`);
    }
    
    // If timeline is empty, add a placeholder exercise
    if (block.timeline.length === 0) {
      block.timeline.push({
        name: `${block.label} Exercise`,
        length_sec: 60,
        rest: false,
        start_sec: 0,
        details: 'Placeholder exercise'
      });
    }
    
    // Sanitize timeline items
    let cumulativeTime = 0;
    block.timeline.forEach(item => {
      // Ensure minimum duration of 5 seconds
      item.length_sec = Math.max(5, Number(item.length_sec) || 0);
      
      // Round to the nearest multiple of 5 seconds
      const originalDuration = item.length_sec;
      if (originalDuration % 5 !== 0) {
        item.length_sec = roundToMultipleOf5(originalDuration);
        info('sanitizeAndFinalizePlan', `Rounded exercise ${item.name} duration from ${originalDuration}s to ${item.length_sec}s to be a multiple of 5`);
      }
      
      item.rest = !!item.rest;
      item.name = String(item.name || 'Move');
      item.start_sec = cumulativeTime;
      item.details = item.details || (item.rest ? 'Rest period' : 'Exercise');
      cumulativeTime += item.length_sec;
    });
    
    block.duration_sec = cumulativeTime;
    totalDuration += cumulativeTime;
  });
  
  plan.total_duration_sec = totalDuration;

  // 3. Duration Fit - STRICT ENFORCEMENT
  const targetSec = minutes * 60;
  const strictToleranceSec = 60; // Stricter tolerance: ±60 seconds
  let drift = plan.total_duration_sec - targetSec;

  if (Math.abs(drift) > 0) { // Any drift at all triggers adjustment
    info('sanitizeAndFinalizePlan', `Adjusting duration: current=${plan.total_duration_sec}s, target=${targetSec}s, drift=${drift}s`);
    
    // If we're significantly off target, log a warning
    if (Math.abs(drift) > strictToleranceSec) {
      warn('sanitizeAndFinalizePlan', `Workout duration is significantly off target: ${plan.total_duration_sec}s vs ${targetSec}s (diff: ${drift}s)`);
    }
    
    if (drift > 0) { // Too long
      // Approach: Proportionally reduce exercise durations to match target time
      const reductionFactor = targetSec / plan.total_duration_sec;
      let totalReduction = 0;
      
      // Start with non-essential exercises (not warm-up or cool-down)
      const middleBlocks = plan.blocks.filter(b => 
        !b.label.toLowerCase().includes('warm') && 
        !b.label.toLowerCase().includes('cool'));
      
      if (middleBlocks.length > 0) {
        // First try proportional reduction on middle blocks
        for (const block of middleBlocks) {
          for (const item of block.timeline) {
            const originalLength = item.length_sec;
            // Don't reduce below 5 seconds
            item.length_sec = Math.max(5, Math.floor(item.length_sec * reductionFactor));
            totalReduction += (originalLength - item.length_sec);
          }
        }
      }
      
      // If we still need to reduce more, carefully trim from all blocks
      if (totalReduction < drift && plan.blocks.length > 0) {
        const remainingReduction = drift - totalReduction;
        const lastBlock = plan.blocks[plan.blocks.length - 1];
        
        if (lastBlock?.timeline.length > 0) {
          const lastItem = lastBlock.timeline[lastBlock.timeline.length - 1];
          const reduction = Math.min(remainingReduction, lastItem.length_sec - 5);
          if (reduction > 0) {
            lastItem.length_sec -= reduction;
            totalReduction += reduction;
            info('sanitizeAndFinalizePlan', `Reduced last item by ${reduction}s`);
          }
        }
      }
      
      info('sanitizeAndFinalizePlan', `Reduced workout duration by ${totalReduction}s`);
    } else { // Too short
      // Approach: Add time to existing exercises or add a finisher
      const deficit = Math.abs(drift);
      let addedTime = 0;
      
      // First try to extend existing exercises proportionally
      if (plan.blocks.length > 0) {
        const extensionFactor = targetSec / plan.total_duration_sec;
        
        // Extend main workout blocks (not warm-up)
        const mainBlocks = plan.blocks.filter(b => !b.label.toLowerCase().includes('warm'));
        
        if (mainBlocks.length > 0) {
          for (const block of mainBlocks) {
            for (const item of block.timeline) {
              if (!item.rest) { // Don't extend rest periods
                const originalLength = item.length_sec;
                item.length_sec = Math.ceil(item.length_sec * extensionFactor);
                addedTime += (item.length_sec - originalLength);
              }
            }
          }
        }
      }
      
      // If we still need to add time, add a finisher exercise
      if (addedTime < deficit) {
        const remainingDeficit = deficit - addedTime;
        
        // Create a new block if needed or use the last block
        let targetBlock;
        if (plan.blocks.length === 0) {
          targetBlock = {
            label: 'Finisher',
            type: 'FINISHER',
            pattern: '1 exercise',
            duration_sec: 0, // Will be updated
            timeline: []
          };
          plan.blocks.push(targetBlock);
        } else {
          // Use the last block that isn't a cool-down
          const nonCooldownBlocks = plan.blocks.filter(b => !b.label.toLowerCase().includes('cool'));
          targetBlock = nonCooldownBlocks.length > 0 ? 
            nonCooldownBlocks[nonCooldownBlocks.length - 1] : 
            plan.blocks[plan.blocks.length - 1];
        }
        
        // Add a finisher exercise
        targetBlock.timeline.push({
          name: 'Finisher Exercise',
          length_sec: remainingDeficit,
          rest: false,
          start_sec: targetBlock.duration_sec || 0,
          details: 'Added to match requested duration'
        });
        
        addedTime += remainingDeficit;
        info('sanitizeAndFinalizePlan', `Added finisher of ${remainingDeficit}s`);
      }
      
      info('sanitizeAndFinalizePlan', `Extended workout duration by ${addedTime}s`);
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
    // Instead of failing, create a complete fallback
    warn('sanitizeAndFinalizePlan', 'Creating complete fallback due to validation failure');
    return createFallbackWorkout({ format: format || 'Fitness', targetMinutes: minutes });
  }

  // Final strict duration check
  const finalDrift = plan.total_duration_sec - (minutes * 60);
  if (Math.abs(finalDrift) > 60) {
    warn('sanitizeAndFinalizePlan', `Final duration still off target by ${finalDrift}s. Creating fallback plan.`);
    return createFallbackWorkout({ format: format || 'Fitness', targetMinutes: minutes });
  }
  
  info('sanitizeAndFinalizePlan', 'Plan successfully sanitized and finalized', { 
    total: plan.total_duration_sec, 
    blockCount: plan.blocks.length,
    targetMinutes: minutes,
    driftFromTarget: finalDrift
  });

  return plan;
}

/**
 * Validates the raw content from the AI to ensure it doesn't contain non-compliant durations
 * Throws an error if any non-compliant durations are found
 */
function validateRawContent(content: string): void {
  try {
    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = content.trim();
    
    // Remove markdown code block markers if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    
    // Parse the JSON
    const parsedContent = JSON.parse(jsonStr);
    
    // Check for non-compliant durations in the blocks
    if (parsedContent.blocks && Array.isArray(parsedContent.blocks)) {
      for (const block of parsedContent.blocks) {
        // Check block duration
        if (block.duration_sec !== undefined) {
          // Block durations must be multiples of 10
          if (block.duration_sec % 10 !== 0) {
            throw new Error(`Block '${block.label || 'Unknown'}' has a duration of ${block.duration_sec}s which is not a multiple of 10`);
          }
        }
        
        // Check timeline items
        if (block.timeline && Array.isArray(block.timeline)) {
          for (const item of block.timeline) {
            // Exercise durations must be multiples of 5
            if (item.length_sec !== undefined) {
              // Check if it's a multiple of 5
              if (item.length_sec % 5 !== 0) {
                throw new Error(`Exercise '${item.name || 'Unknown'}' has a duration of ${item.length_sec}s which is not a multiple of 5`);
              }
              
              // Check for odd durations that should be avoided
              const oddDurations = [25, 35, 55, 65, 85, 95, 115, 125, 145, 155, 175, 185];
              if (oddDurations.includes(item.length_sec)) {
                throw new Error(`Exercise '${item.name || 'Unknown'}' has an odd duration of ${item.length_sec}s which should be avoided`);
              }
            }
            
            // Check for missing length_sec
            if (item.length_sec === undefined || item.length_sec === null) {
              throw new Error(`Exercise '${item.name || 'Unknown'}' is missing a duration`);
            }
            
            // Check for very short or very long durations
            if (item.length_sec < 5) {
              throw new Error(`Exercise '${item.name || 'Unknown'}' has a duration of ${item.length_sec}s which is too short (minimum 5s)`);
            }
            
            if (item.length_sec > 300 && !item.name.toLowerCase().includes('rest')) {
              throw new Error(`Exercise '${item.name || 'Unknown'}' has a very long duration of ${item.length_sec}s which is unusual`);
            }
          }
          
          // Verify that the sum of timeline durations matches the block duration
          const timelineSum = block.timeline.reduce((sum, item) => sum + item.length_sec, 0);
          if (block.duration_sec !== timelineSum) {
            throw new Error(`Block '${block.label || 'Unknown'}' has a duration mismatch: declared ${block.duration_sec}s but timeline sum is ${timelineSum}s`);
          }
        }
      }
      
      // Verify that the sum of block durations matches the total duration
      const blockSum = parsedContent.blocks.reduce((sum, block) => sum + block.duration_sec, 0);
      if (parsedContent.total_duration_sec !== blockSum) {
        throw new Error(`Total duration mismatch: declared ${parsedContent.total_duration_sec}s but block sum is ${blockSum}s`);
      }
    }
    
    // Check total duration
    if (parsedContent.total_duration_sec !== undefined && parsedContent.total_duration_sec % 10 !== 0) {
      throw new Error(`Total duration ${parsedContent.total_duration_sec}s is not a multiple of 10`);
    }
    
  } catch (error) {
    // If we find any non-compliant durations, throw an error to trigger a retry
    if (error instanceof Error && (error.message.includes('duration') || error.message.includes('multiple') || error.message.includes('mismatch'))) {
      error.message = 'Invalid workout format: ' + error.message;
      throw error;
    }
    
    // For other parsing errors, just log and continue
    warn('validateRawContent', `Error validating content: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Rounds a duration to the nearest multiple of 5 seconds
 * If the value is already a multiple of 5, it is returned unchanged
 * Otherwise, it is rounded to the nearest multiple of 5
 */
function roundToMultipleOf5(seconds: number): number {
  // First ensure we're working with an integer
  const intSeconds = Math.round(seconds);
  
  // If already a multiple of 5, return as is
  if (intSeconds % 5 === 0) {
    return intSeconds;
  }
  
  // Otherwise round to nearest multiple of 5
  return Math.round(intSeconds / 5) * 5;
}

/**
 * Force all durations to be clean multiples of 5 or 10 seconds
 */
function enforceMultiplesOf5(plan: ClassPlanV1): void {
  // Track if any changes were made
  let changesCount = 0;
  
  // Process each block and timeline item
  for (const block of plan.blocks) {
    let blockDuration = 0;
    
    // First pass: fix all individual exercise durations
    for (const item of block.timeline) {
      const originalDuration = item.length_sec;
      
      // Force to be a multiple of 5
      if (originalDuration % 5 !== 0) {
        // Round to the nearest multiple of 5
        item.length_sec = roundToMultipleOf5(originalDuration);
        changesCount++;
        warn('enforceMultiplesOf5', `Rounded exercise "${item.name}" duration from ${originalDuration}s to ${item.length_sec}s`);
      }
      
      // Enforce minimum duration of 5 seconds
      if (item.length_sec < 5) {
        const oldDuration = item.length_sec;
        item.length_sec = 5;
        changesCount++;
        warn('enforceMultiplesOf5', `Increased exercise "${item.name}" duration from ${oldDuration}s to minimum 5s`);
      }
      
      // Prefer standard durations when possible (multiples of 10, 15, 20, 30)
      const preferredDurations = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300];
      if (!preferredDurations.includes(item.length_sec) && item.length_sec <= 300) {
        // Find the closest preferred duration
        const closest = preferredDurations.reduce((prev, curr) => 
          Math.abs(curr - item.length_sec) < Math.abs(prev - item.length_sec) ? curr : prev
        );
        
        // Only adjust if it's within 10 seconds of a preferred duration
        if (Math.abs(closest - item.length_sec) <= 10) {
          const oldDuration = item.length_sec;
          item.length_sec = closest;
          changesCount++;
          info('enforceMultiplesOf5', `Adjusted exercise "${item.name}" from ${oldDuration}s to standard duration of ${closest}s`);
        }
      }
      
      blockDuration += item.length_sec;
    }
    
    // Second pass: ensure block duration is a multiple of 10
    const originalBlockDuration = blockDuration;
    
    // If block duration is not a multiple of 10, adjust it
    if (blockDuration % 10 !== 0) {
      // Round to the nearest multiple of 10
      const targetBlockDuration = Math.round(blockDuration / 10) * 10;
      const adjustment = targetBlockDuration - blockDuration;
      
      // Find the best exercise to adjust
      if (block.timeline.length > 0) {
        // Look for exercises that aren't rest periods first
        const nonRestExercises = block.timeline.filter(item => !item.rest && item.length_sec >= 15);
        const exerciseToAdjust = nonRestExercises.length > 0 ? 
          nonRestExercises[nonRestExercises.length - 1] : // Use the last non-rest exercise
          block.timeline[block.timeline.length - 1]; // Or just use the last exercise
        
        // Adjust the selected exercise
        const oldDuration = exerciseToAdjust.length_sec;
        exerciseToAdjust.length_sec += adjustment;
        
        // Ensure it's still a multiple of 5
        exerciseToAdjust.length_sec = Math.round(exerciseToAdjust.length_sec / 5) * 5;
        
        // Ensure minimum duration
        exerciseToAdjust.length_sec = Math.max(5, exerciseToAdjust.length_sec);
        
        changesCount++;
        info('enforceMultiplesOf5', `Adjusted exercise "${exerciseToAdjust.name}" from ${oldDuration}s to ${exerciseToAdjust.length_sec}s to make block duration a multiple of 10`);
        
        // Recalculate block duration
        blockDuration = block.timeline.reduce((sum, item) => sum + item.length_sec, 0);
      }
    }
    
    // Update block duration
    if (block.duration_sec !== blockDuration) {
      const oldBlockDuration = block.duration_sec;
      block.duration_sec = blockDuration;
      if (oldBlockDuration !== originalBlockDuration) {
        info('enforceMultiplesOf5', `Updated block "${block.label}" duration from ${oldBlockDuration}s to ${blockDuration}s`);
      }
    }
  }
  
  // Final pass: ensure total workout duration is a multiple of 10
  let totalDuration = plan.blocks.reduce((sum, block) => sum + block.duration_sec, 0);
  
  // If total duration is not a multiple of 10, adjust the last block
  if (totalDuration % 10 !== 0 && plan.blocks.length > 0) {
    const targetTotalDuration = Math.round(totalDuration / 10) * 10;
    const adjustment = targetTotalDuration - totalDuration;
    
    // Adjust the last block's last exercise
    const lastBlock = plan.blocks[plan.blocks.length - 1];
    if (lastBlock.timeline.length > 0) {
      const lastExercise = lastBlock.timeline[lastBlock.timeline.length - 1];
      const oldDuration = lastExercise.length_sec;
      
      lastExercise.length_sec += adjustment;
      // Ensure it's still a multiple of 5
      lastExercise.length_sec = Math.round(lastExercise.length_sec / 5) * 5;
      // Ensure minimum duration
      lastExercise.length_sec = Math.max(5, lastExercise.length_sec);
      
      changesCount++;
      info('enforceMultiplesOf5', `Adjusted final exercise "${lastExercise.name}" from ${oldDuration}s to ${lastExercise.length_sec}s to make total duration a multiple of 10`);
      
      // Update the block duration
      lastBlock.duration_sec = lastBlock.timeline.reduce((sum, item) => sum + item.length_sec, 0);
    }
  }
  
  // Recalculate start_sec values for all exercises
  for (const block of plan.blocks) {
    let startSec = 0;
    for (const item of block.timeline) {
      item.start_sec = startSec;
      startSec += item.length_sec;
    }
  }
  
  // Final recalculation of total duration
  totalDuration = plan.blocks.reduce((sum, block) => sum + block.duration_sec, 0);
  plan.total_duration_sec = totalDuration;
  
  if (changesCount > 0) {
    info('enforceMultiplesOf5', `Made ${changesCount} duration adjustments to ensure clean exercise and block timings`);
  }
}

function validatePlan(plan: ClassPlanV1, preferences: { targetMinutes: number }): void {
  const targetDurationSec = preferences.targetMinutes * 60;
  const strictTolerance = 60; // ±60 seconds for strict validation
  
  // Calculate total duration from timeline items
  let totalDuration = 0;
  for (const block of plan.blocks) {
    for (const item of block.timeline) {
      totalDuration += item.length_sec;
    }
  }
  
  // Check if plan's reported total_duration_sec matches the calculated total
  if (Math.abs(plan.total_duration_sec - totalDuration) > 5) {
    warn('validatePlan', `Plan's reported duration (${plan.total_duration_sec}s) doesn't match calculated duration (${totalDuration}s)`);
    // Fix the reported duration
    plan.total_duration_sec = totalDuration;
  }
  
  // Check duration is within tolerance - STRICT CHECK
  const durationDiff = Math.abs(totalDuration - targetDurationSec);
  if (durationDiff > strictTolerance) {
    error('validatePlan', `Duration mismatch: generated ${totalDuration}s, expected ${targetDurationSec}s (±${strictTolerance}s)`);
    throw new Error(`Duration mismatch: generated ${totalDuration}s, expected ${targetDurationSec}s (±${strictTolerance}s). ` + 
                  `Difference of ${durationDiff}s exceeds the allowed tolerance of ${strictTolerance}s.`);
  } else if (durationDiff > 0) {
    // Log even small differences
    info('validatePlan', `Duration within tolerance: ${totalDuration}s vs expected ${targetDurationSec}s (diff: ${durationDiff}s)`);
  }
  
  // Validate timeline consistency within blocks
  for (const block of plan.blocks) {
    let expectedStart = 0;
    let blockDuration = 0;
    
    for (const item of block.timeline) {
      if (item.start_sec !== expectedStart) {
        warn('validatePlan', `Timeline inconsistency in block ${block.label}: item starts at ${item.start_sec}s, expected ${expectedStart}s`);
        // Fix the inconsistency
        item.start_sec = expectedStart;
      }
      
      // Validate exercise duration - must be at least 5s and a multiple of 5s
      if (item.length_sec < 5) {
        warn('validatePlan', `Exercise ${item.name} has very short duration (${item.length_sec}s), minimum should be 5s`);
        item.length_sec = 5; // Enforce minimum duration
      }
      
      // Round to the nearest multiple of 5 seconds
      const originalDuration = item.length_sec;
      if (originalDuration % 5 !== 0) {
        item.length_sec = roundToMultipleOf5(originalDuration);
        warn('validatePlan', `Rounded exercise ${item.name} duration from ${originalDuration}s to ${item.length_sec}s to be a multiple of 5`);
      }
      
      expectedStart += item.length_sec;
      blockDuration += item.length_sec;
    }
    
    // Verify block duration
    if (block.duration_sec !== blockDuration) {
      warn('validatePlan', `Block ${block.label} reported duration (${block.duration_sec}s) doesn't match calculated (${blockDuration}s)`);
      block.duration_sec = blockDuration; // Fix the inconsistency
    }
  }
  
  // Check for recommended block types
  const blockLabels = plan.blocks.map(b => b.label.toUpperCase());
  const blockTypes = plan.blocks.map(b => b.type.toUpperCase());
  
  const hasWarmup = blockLabels.some(l => l.includes('WARM')) || blockTypes.some(t => t.includes('WARM'));
  const hasCooldown = blockLabels.some(l => l.includes('COOL')) || blockTypes.some(t => t.includes('COOL'));
  
  if (!hasWarmup) {
    warn('validatePlan', 'No warm-up block found in plan');
  }
  
  if (!hasCooldown) {
    warn('validatePlan', 'No cool-down block found in plan');
  }
}

/**
 * Parse workout directly from example text when in "Copy Exactly" mode
 */
function parseWorkoutFromExample(exampleText: string, format: string, targetMinutes: number): ClassPlanV1 {
  info('parseWorkoutFromExample', 'Parsing workout directly from example');
  
  // Split the example text into lines and filter out empty lines
  const lines = exampleText.split('\n').filter(line => line.trim().length > 0);
  
  // Try to extract a title from the first line
  let className = format + ' Workout';
  if (lines.length > 0 && !lines[0].includes(':')) {
    className = lines[0].trim();
    lines.shift(); // Remove the title line
  }
  
  // Group lines into blocks based on formatting patterns
  const blocks: WorkoutBlock[] = [];
  let currentBlock: { label: string; exercises: { name: string; length_sec: number; rest: boolean }[] } | null = null;
  
  // Common block headers to recognize
  const blockHeaderPatterns = [
    /^(warm[\s-]*up|warmup)[:.]?\s*/i,
    /^(cool[\s-]*down|cooldown)[:.]?\s*/i,
    /^(main|work|circuit|set|round|block|interval|tabata|emom|amrap)\s*\d*[:.]?\s*/i,
    /^(core|abs|finisher|burnout|mobility|stretch|recovery)[:.]?\s*/i
  ];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Check if this line looks like a block header
    const isBlockHeader = 
      // Standard format with colon (e.g., "Warm-up:" or "BLOCK 1: Warm-up")
      (line.includes(':') && !line.match(/^\d+s|^\d+m|^\d+ sec|^\d+ min/i)) ||
      // Common block headers without colon
      blockHeaderPatterns.some(pattern => trimmedLine.match(pattern));
    
    if (isBlockHeader) {
      // If we have a current block, finalize it and add to blocks
      if (currentBlock && currentBlock.exercises.length > 0) {
        blocks.push(createBlockFromExercises(currentBlock.label, currentBlock.exercises));
      }
      
      // Start a new block - extract the block name
      let blockName = trimmedLine;
      if (line.includes(':')) {
        blockName = line.split(':')[0].trim();
      } else {
        // For headers without colons, use the whole line
        blockName = trimmedLine;
      }
      
      currentBlock = { label: blockName, exercises: [] };
    } 
    // Otherwise, try to parse as an exercise with duration
    else if (currentBlock) {
      // Try to extract duration and exercise name
      // Patterns: 
      // - "60s Jumping Jacks", "60 sec Jumping Jacks", "1m Jumping Jacks", "1 min Jumping Jacks"
      // - "Jumping Jacks - 60s", "Jumping Jacks (60 sec)", "Jumping Jacks for 60 seconds"
      // - "Jumping Jacks x 10 reps"
      const durationPatterns = [
        // Duration first: "60s Jumping Jacks"
        /^(\d+)\s*(s|sec|seconds|m|min|minutes)\s+(.+)$/i,
        // Duration last: "Jumping Jacks - 60s" or "Jumping Jacks (60 sec)"
        /^(.+?)(?:[-–—]|\(|\s+for\s+)(\d+)\s*(s|sec|seconds|m|min|minutes)\)?$/i,
        // Duration with 'for': "Jumping Jacks for 60 seconds"
        /^(.+?)\s+for\s+(\d+)\s*(s|sec|seconds|m|min|minutes)$/i,
        // Reps format: "Jumping Jacks x 10 reps"
        /^(.+?)\s*(?:x|×)\s*(\d+)\s*(?:reps?|times?|counts?)$/i
      ];
      
      let matched = false;
      let duration = 60; // Default duration
      let exerciseName = trimmedLine;
      let isRest = false;
      
      // Try each pattern
      for (const pattern of durationPatterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          matched = true;
          
          // Extract exercise name and duration based on pattern
          if (pattern.toString().includes('reps')) {
            // Handle rep-based exercises (convert to time-based)
            exerciseName = match[1].trim();
            const reps = parseInt(match[2]);
            // Estimate 3-5 seconds per rep
            duration = Math.max(30, Math.min(120, reps * 4)); // Between 30s and 120s
            // Round to nearest 5 seconds
            duration = Math.round(duration / 5) * 5;
          } else {
            // Handle time-based exercises
            const durationValue = match[1] || match[2];
            const unit = match[2] || match[3];
            const nameIndex = pattern.toString().startsWith('/^(\\d+)') ? 3 : 1;
            exerciseName = match[nameIndex].trim();
            
            if (unit && unit.toLowerCase().startsWith('m')) {
              // Minutes format
              duration = parseInt(durationValue) * 60;
            } else {
              // Seconds format
              duration = parseInt(durationValue);
            }
          }
          
          break;
        }
      }
      
      // Check if this is a rest period
      isRest = exerciseName.toLowerCase().includes('rest') || 
              exerciseName.toLowerCase().includes('break') || 
              exerciseName.toLowerCase().includes('recovery') ||
              exerciseName.toLowerCase().includes('pause');
      
      // Ensure duration is a multiple of 5 seconds
      duration = Math.round(duration / 5) * 5;
      
      // Ensure minimum duration
      duration = Math.max(5, duration);
      
      currentBlock.exercises.push({
        name: exerciseName,
        length_sec: duration,
        rest: isRest
      });
    }
  }
  
  // Add the final block if it exists
  if (currentBlock && currentBlock.exercises.length > 0) {
    blocks.push(createBlockFromExercises(currentBlock.label, currentBlock.exercises));
  }
  
  // If no blocks were created, create a simple block structure
  if (blocks.length === 0) {
    warn('parseWorkoutFromExample', 'Could not parse blocks from example, creating default structure');
    
    // Create a simple workout with the example text as exercises
    const exercises = lines.map(line => ({
      name: line.trim(),
      length_sec: 60, // Default duration
      rest: line.toLowerCase().includes('rest')
    }));
    
    if (exercises.length > 0) {
      blocks.push(createBlockFromExercises('Main Workout', exercises));
    } else {
      throw new Error('Could not parse any exercises from the example');
    }
  }
  
  // Calculate total duration
  const totalDurationSec = blocks.reduce((sum, block) => sum + block.duration_sec, 0);
  
  // Adjust to match target duration if significantly different
  const targetDurationSec = targetMinutes * 60;
  const durationDiff = Math.abs(totalDurationSec - targetDurationSec);
  
  if (durationDiff > 300) { // If more than 5 minutes off
    warn('parseWorkoutFromExample', `Example duration (${Math.round(totalDurationSec/60)}min) differs significantly from target (${targetMinutes}min), adjusting`);
    
    // Scale the workout to match the target duration
    const scaleFactor = targetDurationSec / totalDurationSec;
    
    blocks.forEach(block => {
      block.timeline.forEach(item => {
        // Scale each exercise duration, ensuring it's a multiple of 5
        const newDuration = Math.round((item.length_sec * scaleFactor) / 5) * 5;
        item.length_sec = Math.max(5, newDuration); // Minimum 5 seconds
      });
      
      // Recalculate block duration
      block.duration_sec = block.timeline.reduce((sum, item) => sum + item.length_sec, 0);
    });
  }
  
  // Ensure all block durations are multiples of 10
  blocks.forEach(block => {
    // Calculate current block duration
    const blockDuration = block.timeline.reduce((sum, item) => sum + item.length_sec, 0);
    
    // If not a multiple of 10, adjust the last exercise
    if (blockDuration % 10 !== 0 && block.timeline.length > 0) {
      const targetDuration = Math.round(blockDuration / 10) * 10;
      const adjustment = targetDuration - blockDuration;
      
      // Adjust the last exercise
      const lastExercise = block.timeline[block.timeline.length - 1];
      lastExercise.length_sec += adjustment;
      
      // Ensure it's still a multiple of 5
      lastExercise.length_sec = Math.round(lastExercise.length_sec / 5) * 5;
      
      // Ensure minimum duration
      lastExercise.length_sec = Math.max(5, lastExercise.length_sec);
      
      info('parseWorkoutFromExample', `Adjusted exercise "${lastExercise.name}" to make block duration a multiple of 10`);
    }
    
    // Recalculate block duration
    block.duration_sec = block.timeline.reduce((sum, item) => sum + item.length_sec, 0);
  });
  
  // Recalculate start_sec values
  blocks.forEach(block => {
    let startSec = 0;
    block.timeline.forEach(item => {
      item.start_sec = startSec;
      startSec += item.length_sec;
    });
  });
  
  // Calculate total duration and ensure it's a multiple of 10
  let adjustedTotalDurationSec = blocks.reduce((sum, block) => sum + block.duration_sec, 0);
  
  // If total duration is not a multiple of 10, adjust the last exercise of the last block
  if (adjustedTotalDurationSec % 10 !== 0 && blocks.length > 0) {
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock.timeline.length > 0) {
      const lastExercise = lastBlock.timeline[lastBlock.timeline.length - 1];
      
      const targetDuration = Math.round(adjustedTotalDurationSec / 10) * 10;
      const adjustment = targetDuration - adjustedTotalDurationSec;
      
      lastExercise.length_sec += adjustment;
      // Ensure it's still a multiple of 5
      lastExercise.length_sec = Math.round(lastExercise.length_sec / 5) * 5;
      // Ensure minimum duration
      lastExercise.length_sec = Math.max(5, lastExercise.length_sec);
      
      // Update block duration
      lastBlock.duration_sec = lastBlock.timeline.reduce((sum, item) => sum + item.length_sec, 0);
      
      // Recalculate total duration
      adjustedTotalDurationSec = blocks.reduce((sum, block) => sum + block.duration_sec, 0);
    }
  }
  
  // Create the workout plan
  const plan: ClassPlanV1 = {
    class_name: className,
    total_duration_sec: adjustedTotalDurationSec,
    blocks,
    safety: {
      avoided_movements_respected: true,
      substitutions: []
    }
  };
  
  return plan;
}

/**
 * Helper function to create a workout block from exercises
 */
function createBlockFromExercises(label: string, exercises: { name: string; length_sec: number; rest: boolean }[]): WorkoutBlock {
  let startSec = 0;
  const timeline: TimelineItem[] = exercises.map(exercise => {
    const item: TimelineItem = {
      name: exercise.name,
      length_sec: exercise.length_sec,
      rest: exercise.rest,
      start_sec: startSec,
      details: exercise.rest ? 'Rest period' : 'Exercise'
    };
    startSec += exercise.length_sec;
    return item;
  });
  
  return {
    label,
    type: label.toUpperCase(),
    duration_sec: timeline.reduce((sum, item) => sum + item.length_sec, 0),
    pattern: `${exercises.length} exercises`,
    timeline
  };
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
    // Log the raw JSON string for debugging
    info('Workout Parser', 'Attempting to parse JSON response');
    
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (jsonError) {
      error('Workout Parser', 'JSON parse error', { error: String(jsonError) });
      console.error('Invalid JSON received from API:', jsonStr.substring(0, 200) + '...');
      throw new Error('Invalid JSON format received from API');
    }
    
    // Detailed validation of required fields
    const missingFields = [];
    if (!parsed.class_name) missingFields.push('class_name');
    if (!parsed.total_duration_sec) missingFields.push('total_duration_sec');
    if (!parsed.blocks) missingFields.push('blocks');
    
    if (missingFields.length > 0) {
      error('Workout Parser', 'Missing required fields', { missingFields });
      console.error('Parsed response is missing fields:', missingFields.join(', '));
      console.error('Received partial data:', JSON.stringify(parsed, null, 2).substring(0, 200) + '...');
      throw new Error(`Missing required fields in workout plan: ${missingFields.join(', ')}`);
    }
    
    // Ensure blocks have proper timeline structure
    parsed.blocks = parsed.blocks.map((block: any, index: number) => {
      if (!block.timeline) {
        warn('Workout Parser', `Block at index ${index} missing timeline, adding empty array`);
      }
      return {
        ...block,
        timeline: block.timeline || []
      };
    });
    
    // Ensure safety object exists
    if (!parsed.safety) {
      info('Workout Parser', 'Safety object missing, adding default');
      parsed.safety = {
        avoided_movements_respected: true,
        substitutions: []
      };
    }
    
    // Validate the plan structure
    try {
      validatePlan(parsed, preferences);
    } catch (validationError) {
      warn('Workout Parser', 'Plan validation warning', { error: String(validationError) });
      // Continue despite validation warnings
    }
    
    info('Workout Parser', 'Successfully parsed and validated workout JSON');
    return parsed as ClassPlanV1;
    
  } catch (error) {
    error('Workout Parser', 'Failed to parse workout JSON', { error: String(error) });
    throw new Error(`Failed to parse workout JSON: ${error instanceof Error ? error.message : 'Invalid JSON'}`);
  }
}

/**
 * Create a fallback workout when generation fails
 */
export function createFallbackWorkout(preferences: { format: string; targetMinutes: number }): ClassPlanV1 {
  const createBlock = (label: string, items: { name: string; length_sec: number; rest?: boolean }[]): WorkoutBlock => {
    const timeline: TimelineItem[] = items.map((item, i) => ({
      name: item.name,
      length_sec: item.length_sec,
      rest: !!item.rest,
      start_sec: items.slice(0, i).reduce((sum, curr) => sum + curr.length_sec, 0),
      details: item.rest ? 'Rest period' : 'Exercise'
    }));
    return {
      label,
      type: label.toUpperCase(),
      duration_sec: timeline.reduce((sum, item) => sum + item.length_sec, 0),
      pattern: `${items.length} exercises`,
      timeline,
    };
  };

  // Calculate how many blocks we need to fill the target time
  const targetSec = preferences.targetMinutes * 60;
  const baseBlocks = [
    createBlock('Warm-up', [{ name: 'Jumping Jacks', length_sec: 60 }, { name: 'Arm Circles', length_sec: 60 }]),
    createBlock('Build', [{ name: 'Squats', length_sec: 90 }, { name: 'Push-ups', length_sec: 90 }, { name: 'Rest', length_sec: 30, rest: true }]),
    createBlock('Core Reset', [{ name: 'Plank', length_sec: 60 }, { name: 'Crunches', length_sec: 60 }]),
    createBlock('Cool-down', [{ name: 'Hamstring Stretch', length_sec: 60 }, { name: 'Quad Stretch', length_sec: 60 }]),
  ];
  
  // All durations in the fallback workout are already multiples of 5 or 10 seconds (30s, 60s, 90s)
  
  // Calculate total duration of base blocks
  const baseDuration = baseBlocks.reduce((sum, block) => sum + block.duration_sec, 0);
  
  // Add additional blocks if needed to meet target duration
  const blocks = [...baseBlocks];
  if (baseDuration < targetSec) {
    const remainingSec = targetSec - baseDuration;
    
    // Round the durations to multiples of 5 seconds
    const burpeeDuration = roundToMultipleOf5(Math.min(remainingSec, 120));
    let recoveryDuration = 0;
    
    if (remainingSec > burpeeDuration) {
      // Calculate recovery duration and ensure it's a multiple of 5
      recoveryDuration = roundToMultipleOf5(Math.min(remainingSec - burpeeDuration, 60));
    }
    
    const additionalBlock = createBlock('Extra Work', [
      { name: 'Burpees', length_sec: burpeeDuration },
      { name: 'Recovery', length_sec: recoveryDuration, rest: recoveryDuration > 0 }
    ]);
    
    blocks.push(additionalBlock);
  }
  
  // Calculate final total duration
  const totalDuration = blocks.reduce((sum, block) => sum + block.duration_sec, 0);
  
  // Create complete fallback plan with all required fields
  return {
    class_name: `Fallback ${preferences.format} Class (${preferences.targetMinutes} min)`,
    total_duration_sec: totalDuration,
    intensity_rpe: 'Mixed',
    notes: 'This is a fallback workout generated when AI generation failed.',
    blocks: blocks,
    safety: {
      avoided_movements_respected: true,
      substitutions: []
    }
  };
}
