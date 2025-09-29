import { DEFAULT_MODEL, OPENAI_ENDPOINT } from './constants.ts';

export interface RawBlock {
  name?: string;
  type?: string;
  duration_hint?: string;
  timeline_lines?: string[];
}

export function splitBlocksFromText(input: string): RawBlock[] {
  const lines = input.split(/\r?\n/);
  const blocks: RawBlock[] = [];
  let cur: RawBlock | null = null;
  let inTimeline = false;

  const flush = () => { if (cur) { blocks.push(cur); cur = null; inTimeline = false; } };

  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;

    const m_name = s.match(/^([A-Z0-9\s]+)\s+\((.+)\)$/);
    if (m_name) {
      flush();
      cur = { name: m_name[1].trim(), type: m_name[2].trim(), timeline_lines: [] };
      inTimeline = false;
      continue;
    }

    const m_type = s.match(/^([A-Z]+)$/);
    if (m_type && cur && !cur.type) {
      cur.type = m_type[1];
      continue;
    }

    if (s.match(/^(\d+s\s*\|)/) || s.match(/^(\d+:\d+\s*\|)/)) {
      if (cur) {
        if (!cur.timeline_lines) cur.timeline_lines = [];
        cur.timeline_lines.push(s);
        inTimeline = true;
      }
    } else if (inTimeline && cur) {
      if (!cur.timeline_lines) cur.timeline_lines = [];
      cur.timeline_lines.push(s);
    } else if (cur) {
      // Non-timeline line, could be pattern, etc.
    }
  }
  flush();
  return blocks;
}

export interface InstructorIntentV1 {
  target_duration_sec?: number;
  transition_policy?: 'manual' | 'auto';
  transition_seconds?: number;
  intensity_rpe?: number;
  moves_to_avoid?: string[];
  required_moves?: string[];
  equipment_available?: string[];
  space_notes?: string;
  special_notes?: string;
  raw_blocks?: RawBlock[];
}

export async function extractInstructorIntent(
  classDescription: string,
  apiKey: string
): Promise<InstructorIntentV1> {
  const systemMessage = `
You are an expert at reading unstructured fitness class descriptions and extracting key structured data.
Your output is a JSON object matching the InstructorIntentV1 schema.

RULES:
- target_duration_sec: convert any time format (e.g., "45 minutes") to seconds.
- raw_blocks: use splitBlocksFromText to segment the input into blocks.
- Omit any null or empty fields.
- If a field isn't mentioned, omit it.
`.trim();

  const userMessage = `
CLASS_DESCRIPTION:
${classDescription}
`.trim();

  const body = {
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_object' },
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
    const errorText = await response.text();
    throw new Error(`Failed to extract intent: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  return JSON.parse(content) as InstructorIntentV1;
}