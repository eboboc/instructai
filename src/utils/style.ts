import { ClassPlanV1, TimelineItem } from '../state/planStore';

// --- Interfaces ---
export interface StyleProfile {
  blockMixPct: {
    warmup: number;
    work: number;
    cooldown: number;
  };
  avgWorkSec: number;
  avgRestSec: number;
  workRestRatio: number; // work / rest
  schemes: string[];
  movementFamilies: string[];
  intensityRamp: 'low→peak→taper' | 'steady' | 'unknown';
  transitionsPerBlock: number;
  cooldownSec: number;
}

// --- Heuristics & Mappings ---

export const SUBSTITUTION_MAP: Record<string, string> = {
  'burpee': 'squat thrust',
  'jumping jack': 'step-out jack',
  'jump squat': 'bodyweight squat',
  'lunge (jump)': 'alternating lunge',
  'overhead press': 'front raise',
  'push-up': 'incline push-up',
  'pull-up': 'inverted row',
};

const MOVEMENT_FAMILIES: Record<string, string[]> = {
  lower_body: ['squat', 'lunge', 'deadlift', 'glute bridge', 'calf raise', 'step up'],
  upper_body_push: ['push-up', 'press', 'dip', 'plank'],
  upper_body_pull: ['row', 'pull-up', 'chin-up', 'curl'],
  core: ['crunch', 'plank', 'leg raise', 'russian twist', 'hollow hold'],
  locomotor: ['jump', 'jack', 'burpee', 'high knees', 'run', 'skip', 'skater'],
  mobility: ['stretch', 'roll', 'mobilization', 'yoga'],
};

function getMovementFamily(name: string): string {
  const lowerName = name.toLowerCase();
  for (const family in MOVEMENT_FAMILIES) {
    if (MOVEMENT_FAMILIES[family].some(m => lowerName.includes(m))) {
      return family;
    }
  }
  return 'unknown';
}

// --- Main Function ---

export function buildStyleProfile(plan: ClassPlanV1): StyleProfile {
  const allItems = plan.blocks.flatMap(b => b.timeline);
  const totalDuration = plan.total_duration_sec || 1;

  // 1. Block Mix
  const warmupDuration = plan.blocks.find(b => b.type === 'WARMUP')?.duration_sec || 0;
  const cooldownDuration = plan.blocks.find(b => b.type === 'COOLDOWN')?.duration_sec || 0;
  const workDuration = totalDuration - warmupDuration - cooldownDuration;

  // 2. Work/Rest Ratios
  const workItems = allItems.filter(i => !i.rest);
  const restItems = allItems.filter(i => i.rest);
  const totalWorkSec = workItems.reduce((sum, i) => sum + i.length_sec, 0);
  const totalRestSec = restItems.reduce((sum, i) => sum + i.length_sec, 0);

  // 3. Schemes
  const schemes = new Set<string>();
  plan.blocks.forEach(block => {
    if (block.pattern) schemes.add(block.pattern);
    // Simple scheme detection from timeline
    if (block.timeline.length > 2) {
      const first = block.timeline[0];
      const second = block.timeline[1];
      if (!first.rest && second.rest) {
        schemes.add(`${first.length_sec}s on / ${second.length_sec}s off`);
      }
    }
  });

  // 4. Movement Families
  const movementFamilies = new Set<string>();
  workItems.forEach(item => movementFamilies.add(getMovementFamily(item.name)));

  // 5. Transitions
  const transitionItems = allItems.filter(i => i.name.toLowerCase().includes('transition'));
  const transitionsPerBlock = plan.blocks.length > 0 ? transitionItems.length / plan.blocks.length : 0;

  return {
    blockMixPct: {
      warmup: (warmupDuration / totalDuration) * 100,
      work: (workDuration / totalDuration) * 100,
      cooldown: (cooldownDuration / totalDuration) * 100,
    },
    avgWorkSec: workItems.length > 0 ? totalWorkSec / workItems.length : 45,
    avgRestSec: restItems.length > 0 ? totalRestSec / restItems.length : 15,
    workRestRatio: totalRestSec > 0 ? totalWorkSec / totalRestSec : 3,
    schemes: Array.from(schemes),
    movementFamilies: Array.from(movementFamilies),
    intensityRamp: 'low→peak→taper', // Assume standard ramp for now
    transitionsPerBlock: transitionsPerBlock,
    cooldownSec: cooldownDuration,
  };
}

export function buildProfileFromText(text: string): Partial<StyleProfile> {
    // Basic text analysis for now, can be expanded
    const hasTabata = /tabata|20s on, 10s off/i.test(text);
    const hasAmrap = /amrap/i.test(text);
    const schemes: string[] = [];
    if(hasTabata) schemes.push('Tabata');
    if(hasAmrap) schemes.push('AMRAP');

    return {
        schemes,
        movementFamilies: ['lower_body', 'upper_body_push', 'core'], // Assume full body
    }
}
