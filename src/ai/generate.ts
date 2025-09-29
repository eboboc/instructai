import { AnyClassPlan, EnhancedClassPlan } from '../types/timer.ts';
import { InstructorIntentV1 } from './extract.ts';
import { StyleProfileV1 } from './normalize.ts';
import { DEFAULT_MODEL, OPENAI_ENDPOINT } from './constants.ts';

export const workoutSchemaV2 = {
  name: "EnhancedClassPlan",
  strict: true,
  schema: {
    type: "object",
    properties: {
      version: { type: "string", enum: ["enhanced"] },
      metadata: {
        type: "object",
        properties: {
          class_name: { type: "string" },
          duration_min: { type: "number" },
          modality: { type: "string" },
          level: { type: "string" },
          intensity_curve: { type: "string" },
          impact_level: { type: "string", enum: ["low", "moderate", "high"] },
          avoid_list: { type: "array", items: { type: "string" } },
          required_moves: { type: "array", items: { type: "string" } },
          equipment: { type: "array", items: { type: "string" } },
          space_notes: { type: "string" },
          transition_policy: { type: "string", enum: ["manual", "auto"] }
        },
        required: ["class_name","duration_min","modality","level","intensity_curve","transition_policy"],
        additionalProperties: false
      },
      blocks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            type: { type: "string", enum: ["WARMUP","INTERVAL","COOLDOWN","COMBO","TABATA","EMOM"] },
            duration: { type: "string" },
            duration_sec: { type: "number" },
            pattern: { type: "string" },
            rounds: { type: "number" },
            work_rest: { type: "string" },
            timeline: { type: "array", items: { type: "string" } },
            cues: { type: "array", items: { type: "string" } },
            intensity_target_rpe: { type: "number" },
            target_muscles: { type: "object", additionalProperties: { type: "number" } }
          },
          required: ["id","name","type","duration","duration_sec","pattern","timeline","cues"],
          additionalProperties: false
        }
      },
      time_audit: {
        type: "object",
        properties: {
          sum_min: { type: "number" },
          buffer_min: { type: "number" }
        },
        required: ["sum_min","buffer_min"],
        additionalProperties: false
      }
    },
    required: ["version","metadata","blocks","time_audit"],
    additionalProperties: false
  }
};

export async function generatePlanFromNormalizedIntent(
  normalizedIntent: InstructorIntentV1,
  style: StyleProfileV1,
  apiKey: string
): Promise<EnhancedClassPlan> {
  const CLASS_TOTAL_SEC = normalizedIntent.target_duration_sec || 0;

  const systemMessage = `
You convert normalized intent + brand style into a clean, coach-ready class plan.
Return ONLY JSON matching the EnhancedClassPlan schema (v2). No extra keys.

Priorities:
1) Safety & constraints
2) Exact math: sum(timeline) == duration_sec for each block; total == CLASS_TOTAL_SEC
3) Structure: WARMUP first, COOLDOWN last; 1–3 main blocks between (INTERVAL/COMBO/TABATA/EMOM)
4) Intensity: match target RPE via density/work:rest
5) Style fidelity: reflect past-class timing motifs and sequencing

Timeline rules:
- Only "XXs | Movement", XX in {10,15,20,30,60} unless intent demands otherwise.
- Use "XXs | REST". If transition_policy="auto", end each non-final block with "Ts | REST — Transition".
- Do not emit "SET" headers or mm:ss.

Self-check BEFORE replying:
- Each block.duration_sec equals sum(timeline).
- Total duration equals CLASS_TOTAL_SEC.
- Avoid-list movements are absent.
`.trim();

  const userMessage = `
CLASS_TOTAL_SEC: ${CLASS_TOTAL_SEC}

NORMALIZED_INTENT:
${JSON.stringify(normalizedIntent, null, 2)}

STYLE_PROFILE:
${JSON.stringify(style, null, 2)}
`.trim();

  const body = {
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_schema', json_schema: workoutSchemaV2.schema },
    temperature: 0,
  };

  const response = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // Retry with json_object if schema fails
    const retryBody = { ...body, response_format: { type: 'json_object' } };
    const retryResponse = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(retryBody),
    });
    if (!retryResponse.ok) {
      const errorText = await retryResponse.text();
      throw new Error(`Failed to generate plan from intent: ${errorText}`);
    }
    const data = await retryResponse.json();
    const content = data.choices?.[0]?.message?.content;
    return JSON.parse(content) as EnhancedClassPlan;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  return JSON.parse(content) as EnhancedClassPlan;
}

export async function generatePlanFromPreferences(input: {
  prefs: {
    classLengthMin: number;
    intensityRPE: number;
    transition: { policy: 'manual' | 'auto', seconds?: number };
    bodyFocus: 'upper' | 'lower' | 'full';
    movesToAvoid: string[];
    equipment?: string[];
    specialNotes?: string;
  };
  pastClass: string;
  model: string;
  apiKey: string;
}): Promise<EnhancedClassPlan> {

  const systemPrompt = `
You are an AI fitness bot that converts instructor preferences + a past class into a fresh, coach-ready plan.

PRIORITIES: (1) safety/constraints; (2) exact math; (3) structure (WARMUP first, COOLDOWN last; 1–3 main blocks: INTERVAL/COMBO/TABATA/EMOM); (4) intensity via density/work:rest; (5) style fidelity (~75%) to past class.

TIMELINE RULES: "XXs | Movement" lines; XX in {10,15,20,30,60} unless past class clearly uses 25. Label rests as "XXs | REST". If transition_policy=auto, append "Ts | REST — Transition" at END of each non-final block.

TYPE MAPPING: LADDER/MIXED-INTERVALS → INTERVAL; SUPERSET/AMRAP/PROGRESSIVE COMBO/HYBRID → COMBO; TABATA VARIATION → TABATA.

SELF-CHECK: per-block sum(timeline)==duration_sec; total == CLASS_TOTAL_SEC; avoid list absent; WARMUP first; COOLDOWN last.matches schema exactly
  `.trim();

  const { prefs, pastClass, model, apiKey } = input;
  const classTotalSec = prefs.classLengthMin * 60;
  const transitionPolicy = prefs.transition.policy;
  const transitionSuffix = transitionPolicy === 'auto' ? ` with ${prefs.transition.seconds || 0}s between blocks` : '';
  const avoidList = JSON.stringify(prefs.movesToAvoid || []);
  const equipment = JSON.stringify(prefs.equipment || []);

  const userPrompt = `
INSTRUCTOR PREFERENCES
- Class length: ${prefs.classLengthMin} minutes
- CLASS_TOTAL_SEC: ${classTotalSec}
- Target intensity: RPE ${prefs.intensityRPE}/10
- Body focus: ${prefs.bodyFocus}
- Transition policy: ${transitionPolicy}${transitionSuffix}
- Avoid list: ${avoidList}
- Equipment: ${equipment}
- Special notes: ${prefs.specialNotes || 'N/A'}

STYLE REFERENCE (follow ~75% unless it breaks constraints):
${pastClass}

OUTPUT CONTRACT
- Emit a single JSON object for EnhancedClassPlan v2 (no extra keys).
- Exact seconds math per block and for total class.
- WARMUP first; COOLDOWN last; 1–3 main blocks (INTERVAL/COMBO/TABATA/EMOM) in the middle.
  `.trim();

  const body: Record<string, any> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
    response_format: { type: 'json_schema', json_schema: workoutSchemaV2.schema },
  };

  console.log('Attempting generation with json_schema mode...');
  let response = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.log('Schema mode failed, retrying with json_object mode...');
    body.response_format = { type: 'json_object' };
    response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to generate plan from preferences: ${errorText}`);
    }
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  return JSON.parse(content);
}
