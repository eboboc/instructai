import { ClassPlan, ClassBlock, FlattenedInterval, BlockType, AnyClassPlan, EnhancedClassPlan, EnhancedBlock } from '../types/timer';
import { ClassPlanV1 } from '../ai/zodSchema';

// Parse duration string to seconds (e.g., "04:00" -> 240, "30s" -> 30)
function parseDuration(duration: string): number {
  // Handle format like "04:00" (mm:ss)
  if (duration.includes(':')) {
    const [minutes, seconds] = duration.split(':').map(Number);
    return (minutes || 0) * 60 + (seconds || 0);
  }
  
  // Handle format like "30s", "2m", etc.
  const match = duration.match(/^(\d+(?:\.\d+)?)\s*([smh]?)$/i);
  if (match) {
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    
    switch (unit) {
      case 'h': return value * 3600;
      case 'm': return value * 60;
      case 's':
      default: return value;
    }
  }
  
  return 0;
}

// Parse timeline entry (e.g., "30s | Jumping Jacks" or "REST")
function parseTimelineEntry(entry: string): { time: number; activity: string } | null {
  const trimmed = entry.trim();
  
  // Skip round headers and labels
  if (trimmed.startsWith('ROUND') || trimmed.startsWith('SET') || !trimmed.includes('|')) {
    return null;
  }
  
  // Parse format like "30s | Activity Name"
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([smh]?)\s*\|\s*(.+)$/);
  if (match) {
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase() || 's';
    const activity = match[3].trim();
    
    let time = value;
    switch (unit) {
      case 'h': time = value * 3600; break;
      case 'm': time = value * 60; break;
      case 's':
      default: time = value; break;
    }
    
    return { time, activity };
  }
  
  return null;
}

// Check if this is the new enhanced format
function isEnhancedFormat(data: any): data is EnhancedClassPlan {
  return data && data.blocks && data.blocks[0] && typeof data.blocks[0].timeline === 'object' && Array.isArray(data.blocks[0].timeline) && typeof data.blocks[0].timeline[0] === 'string';
}

// Flatten enhanced format
function flattenEnhancedClassPlan(classPlan: EnhancedClassPlan): FlattenedInterval[] {
  const intervals: FlattenedInterval[] = [];
  
  classPlan.blocks.forEach((block, blockIndex) => {
    let intervalIndex = 0;
    
    block.timeline.forEach((entry) => {
      const parsed = parseTimelineEntry(entry);
      if (parsed) {
        intervals.push({
          id: `${block.id}-${intervalIndex}`,
          activity: parsed.activity,
          duration: parsed.time,
          blockName: block.name,
          blockType: block.type as BlockType,
          blockId: block.id,
          isRest: parsed.activity.toLowerCase().includes('rest'),
          cues: block.cues,
          targetMuscles: block.target_muscles
        });
        intervalIndex++;
      }
    });
  });
  
  return intervals;
}

// Legacy format flattening
export function flattenClassPlan(classPlan: AnyClassPlan): FlattenedInterval[] {
  // Check if it's the new enhanced format
  if (isEnhancedFormat(classPlan)) {
    return flattenEnhancedClassPlan(classPlan);
  }
  
  // Legacy format handling
  const legacyPlan = classPlan as ClassPlan;
  const intervals: FlattenedInterval[] = [];
  let intervalId = 0;

  legacyPlan.blocks.forEach((block, blockIndex) => {
    const repeats = block.repeat || 1;
    
    for (let setNumber = 1; setNumber <= repeats; setNumber++) {
      // Add the main timeline items
      block.timeline.forEach((item, itemIndex) => {
        intervals.push({
          id: `${blockIndex}-${setNumber}-${itemIndex}`,
          activity: item.activity,
          duration: item.time,
          blockName: block.name,
          blockType: (block.type || 'default') as BlockType,
          blockId: `block-${blockIndex}`,
          setNumber: repeats > 1 ? setNumber : undefined,
          totalSets: repeats > 1 ? repeats : undefined,
          isRest: item.activity.toLowerCase().includes('rest'),
          cues: undefined, // Legacy format doesn't have cues
          targetMuscles: undefined // Legacy format doesn't have target muscles
        });
      });

      // Add rest between sets if needed (except after the last set)
      if (setNumber < repeats && block.rest_between_sets && block.rest_between_sets > 0) {
        intervals.push({
          id: `${blockIndex}-${setNumber}-rest`,
          activity: 'REST',
          duration: block.rest_between_sets,
          blockName: block.name,
          blockType: (block.type || 'default') as BlockType,
          blockId: `block-${blockIndex}`,
          setNumber,
          totalSets: repeats,
          isRest: true,
          cues: undefined,
          targetMuscles: undefined
        });
      }
    }
  });

  return intervals;
}

export function calculateTotalDuration(intervals: FlattenedInterval[]): number {
  return intervals.reduce((total, interval) => total + interval.duration, 0);
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function getBlockColorClass(blockType: BlockType, isRest: boolean = false): string {
  if (isRest) return 'bg-rest text-rest-foreground';
  
  switch (blockType.toUpperCase()) {
    case 'WARMUP':
      return 'bg-warmup text-warmup-foreground';
    case 'COMBO':
      return 'bg-combo text-combo-foreground';
    case 'PYRAMID':
      return 'bg-pyramid text-pyramid-foreground';
    case 'RANDOMIZED':
      return 'bg-randomized text-randomized-foreground';
    case 'LADDER':
      return 'bg-ladder text-ladder-foreground';
    case 'COOLDOWN':
      return 'bg-cooldown text-cooldown-foreground';
    case 'EMOM':
      return 'bg-combo text-combo-foreground'; // Use blue for EMOM
    case 'TABATA':
      return 'bg-randomized text-randomized-foreground'; // Use rose for Tabata
    case 'INTERVAL':
      return 'bg-pyramid text-pyramid-foreground'; // Use indigo for intervals
    case 'FINISHER':
      return 'bg-ladder text-ladder-foreground'; // Use emerald for finisher
    default:
      return 'bg-secondary text-secondary-foreground';
  }
}

export function getBreakColorClass(): string {
  return 'bg-break text-break-foreground';
}

export function validateClassPlan(data: any): AnyClassPlan | null {
  try {
    if (!data || typeof data !== 'object') return null;
    if (!Array.isArray(data.blocks)) return null;
    
    // Check if it's enhanced format
    if (isEnhancedFormat(data)) {
      for (const block of data.blocks) {
        if (!block.name || typeof block.name !== 'string') return null;
        if (!block.type || typeof block.type !== 'string') return null;
        if (!Array.isArray(block.timeline)) return null;
        
        for (const entry of block.timeline) {
          if (typeof entry !== 'string') return null;
        }
      }
      return data as EnhancedClassPlan;
    }
    
    // Legacy format validation
    for (const block of data.blocks) {
      if (!block.name || typeof block.name !== 'string') return null;
      if (!Array.isArray(block.timeline)) return null;
      
      for (const item of block.timeline) {
        if (typeof item.time !== 'number' || item.time <= 0) return null;
        if (typeof item.activity !== 'string') return null;
      }
      
      if (block.repeat !== undefined && (typeof block.repeat !== 'number' || block.repeat < 1)) {
        return null;
      }
      
      if (block.rest_between_sets !== undefined && typeof block.rest_between_sets !== 'number') {
        return null;
      }
    }
    
    return data as ClassPlan;
  } catch (error) {
    return null;
  }
}

// Get class name from either format
export function getClassName(classPlan: AnyClassPlan): string {
  if (isEnhancedFormat(classPlan)) {
    return classPlan.metadata?.class_name || 'Unnamed Workout';
  }
  return (classPlan as ClassPlan).class_name || 'Unnamed Workout';
}

// Get block progress for the current interval
export function getBlockProgress(intervals: FlattenedInterval[], currentIndex: number): {
  blockName: string;
  blockId?: string;
  blockType: BlockType;
  currentBlockIndex: number;
  totalBlocks: number;
  progressInBlock: number;
  totalBlockIntervals: number;
} {
  if (intervals.length === 0 || currentIndex >= intervals.length) {
    return {
      blockName: '',
      blockType: 'WARMUP' as BlockType,
      currentBlockIndex: 0,
      totalBlocks: 0,
      progressInBlock: 0,
      totalBlockIntervals: 0,
    };
  }

  const currentInterval = intervals[currentIndex];
  const blockName = currentInterval.blockName;
  const blockId = currentInterval.blockId;
  
  // Get all unique blocks in order
  const uniqueBlocks = intervals.reduce((acc, interval, index) => {
    const key = interval.blockId || interval.blockName;
    if (!acc.find(block => block.key === key)) {
      acc.push({
        key,
        name: interval.blockName,
        type: interval.blockType,
        firstIndex: index
      });
    }
    return acc;
  }, [] as Array<{ key: string; name: string; type: BlockType; firstIndex: number }>);
  
  // Find current block
  const currentBlockKey = blockId || blockName;
  const currentBlockInfo = uniqueBlocks.find(block => block.key === currentBlockKey);
  const currentBlockIndex = uniqueBlocks.findIndex(block => block.key === currentBlockKey);
  
  // Count intervals in current block
  const blockIntervals = intervals.filter(interval => 
    (interval.blockId || interval.blockName) === currentBlockKey
  );
  
  const intervalIndexInBlock = blockIntervals.findIndex(interval => 
    intervals.findIndex(i => i.id === interval.id) === currentIndex
  );
  
  return {
    blockName,
    blockId,
    blockType: currentInterval.blockType,
    currentBlockIndex,
    totalBlocks: uniqueBlocks.length,
    progressInBlock: intervalIndexInBlock,
    totalBlockIntervals: blockIntervals.length,
  };
}

export const SAMPLE_CLASS_PLAN: AnyClassPlan = {
  class_name: "HIIT Blast",
  blocks: [
    {
      name: "Warm-up",
      type: "WARMUP",
      timeline: [
        { time: 30, activity: "Jumping Jacks" },
        { time: 30, activity: "High Knees" },
        { time: 30, activity: "Arm Circles" }
      ]
    },
    {
      name: "20/10 HIIT — x4",
      type: "RANDOMIZED",
      timeline: [
        { time: 20, activity: "Burpees" },
        { time: 10, activity: "REST" }
      ],
      repeat: 4,
      rest_between_sets: 0
    },
    {
      name: "Cool Down",
      type: "COOLDOWN",
      timeline: [
        { time: 30, activity: "Deep Breathing" },
        { time: 30, activity: "Stretches" }
      ]
    }
  ]
};

// --- V1 Plan Conversion for Timer ---

export interface TimerSegment {
  label: string;
  start: number;
  duration: number;
  isRest: boolean;
}

export interface TimerPlan {
  total: number;
  segments: TimerSegment[];
  normalized: boolean;
  planV2: AnyClassPlan; // For compatibility with the timer component
}

/**
 * Converts a ClassPlanV1 into a flat list of timer segments.
 * Ensures all items are included and normalizes timing if necessary.
 */
export function convertToTimerFormatV1(plan: ClassPlanV1): TimerPlan {
  const segments: TimerSegment[] = [];
  let cumulativeTime = 0;

  for (const block of plan.blocks) {
    for (const item of block.timeline) {
      segments.push({
        label: item.name || block.label,
        start: cumulativeTime,
        duration: Number(item.length_sec) || 0,
        isRest: !!item.rest,
      });
      cumulativeTime += Number(item.length_sec) || 0;
    }
  }

  const planV2: AnyClassPlan = {
    version: '2.0-from-v1',
    metadata: {
      class_name: plan.class_name,
      duration_min: Math.round(plan.total_duration_sec / 60),
      modality: 'Generated',
      level: 'All Levels',
    },
    blocks: plan.blocks.map(b => ({
      id: b.label,
      name: b.label,
      type: b.type,
      duration: `${b.duration_sec}s`,
      duration_sec: b.duration_sec,
      timeline: b.timeline.map(i => `${i.length_sec}s | ${i.name}`),
    })),
  };

  return {
    total: plan.total_duration_sec,
    segments,
    normalized: false,
    planV2,
  };
}