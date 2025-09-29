import { InstructorIntentV1, RawBlock } from './extract.ts';

export interface StyleProfileV1 {
  common_block_types: string[];
  allowed_block_types: Array<'WARMUP'|'INTERVAL'|'COOLDOWN'|'COMBO'|'TABATA'|'EMOM'>;
  timing_motifs: string[];
  rest_labels: string[];
  prefer_increments_sec: number[];
}

export function deriveStyleProfile(past: string[]): StyleProfileV1 {
  const text = (past||[]).join('\n').toLowerCase();
  return {
    common_block_types: ['WARMUP','INTERVAL','TABATA','EMOM','COOLDOWN'],
    allowed_block_types: ['WARMUP','INTERVAL','COOLDOWN','COMBO','TABATA','EMOM'],
    timing_motifs: [
      text.includes('20/10') ? '20/10' : '',
      text.includes('30/30') ? '30/30' : '',
      text.includes('45/15') ? '45/15' : '',
      text.includes('60/30') ? '60/30' : '',
    ].filter(Boolean),
    rest_labels: ['REST', 'RECOVER', 'BREAK'],
    prefer_increments_sec: [15, 30, 45, 60, 90, 120, 180],
  };
}

function parseDurationToSec(s?: string): number | null {
    if (!s) return null;
    const m_min = s.match(/(\d+)\s*min/i);
    if (m_min) return parseInt(m_min[1], 10) * 60;
    const m_sec = s.match(/(\d+)\s*sec/i);
    if (m_sec) return parseInt(m_sec[1], 10);
    return null;
}

function sumLinesSec(lines: string[]): number {
  return lines.reduce((acc, l) => acc + (parseDurationToSec(l) || 0), 0);
}

function allocateDurations(hints: number[], totalSec: number): number[] {
    const sumHints = hints.reduce((a,b)=>a+b,0) || hints.length; // if no hints, split evenly
    if (sumHints === 0 || hints.length === 0) return [];
    const raw = hints.map(h => (h || (totalSec / hints.length)) / sumHints * totalSec);

    const snap5 = (v:number)=> Math.max(5, Math.round(v/5)*5);
    let snapped = raw.map(snap5);
    let diff = totalSec - snapped.reduce((a,b)=>a+b,0);

    let attempts = 0;
    while (diff !== 0 && attempts < 100) {
        const idx = Math.floor(Math.random() * snapped.length);
        const op = diff > 0 ? 5 : -5;
        if (snapped[idx] + op > 0) {
            snapped[idx] += op;
            diff -= op;
        }
        attempts++;
    }
    return snapped;
}

function mapType(t?: string): string {
    const s = (t || '').toUpperCase();
    if (s.includes('WARMUP')) return 'WARMUP';
    if (s.includes('COOLDOWN')) return 'COOLDOWN';
    if (s.includes('TABATA')) return 'TABATA';
    if (s.includes('EMOM')) return 'EMOM';
    return 'INTERVAL';
}

export function normalizeAndStructure(
  intent: InstructorIntentV1,
  style: StyleProfileV1
): InstructorIntentV1 {
  const { raw_blocks } = intent;
  if (!raw_blocks) return intent;

  const totalSec = intent.target_duration_sec || 0;
  const hints = raw_blocks.map(b => parseDurationToSec(b.duration_hint) || 0);
  const durations = allocateDurations(hints, totalSec);

  const structured = raw_blocks.map((b, i) => {
    const duration_sec = durations[i] || parseDurationToSec(b.duration_hint) || sumLinesSec(b.timeline_lines || []);
    return {
      ...b,
      duration_sec,
      type: mapType(b.type),
    };
  });

  return {
    ...intent,
    raw_blocks: structured,
  };
}
