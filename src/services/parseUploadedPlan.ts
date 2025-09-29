import * as logger from '../utils/logger';
import { EnhancedClassPlan } from '../ai/zodSchema';

export interface ParsedBlock {
    id: string;
    name: string;
    type: string;
    normalized_type: string;
    duration: string;
    duration_sec: number;
    pattern?: string;
    rounds?: number;
    work_rest?: string;
    timeline: string[];
    cues?: string[];
    intensity_target_rpe?: number;
    target_muscles?: Record<string, number>;
    rationale?: string;
    safety?: string;
}

export interface ParseResult {
    success: boolean;
    plan?: EnhancedClassPlan;
    error?: string;
    warnings?: string[];
}

/**
 * Parse normalized text into a valid ClassPlanV1 structure
 */
export function parseUploadedPlan(normalizedText: string): ParseResult {
    try {
        logger.info('[PARSE] Starting plan parsing', 'Processing normalized text', {
            textLength: normalizedText.length
        });

        const blocks = parseBlocks(normalizedText);
        
        if (blocks.length === 0) {
            return {
                success: false,
                error: 'No workout blocks could be identified in the uploaded file. Please ensure the file contains clear block headers like "Warm-up", "Main Set", "Cool Down", etc.'
            };
        }

        // Calculate total duration
        const totalDurationMin = blocks.reduce((sum, block) => sum + Math.round(block.duration_sec / 60), 0);
        
        // Build the enhanced class plan
        const plan: EnhancedClassPlan = {
            version: 'enhanced',
            metadata: {
                class_name: 'Uploaded Workout',
                duration_min: totalDurationMin,
                modality: 'Mixed',
                level: 'All Levels',
                intensity_curve: 'Variable',
                transition_policy: 'manual'
            },
            blocks: blocks,
            time_audit: {
                sum_min: totalDurationMin,
                buffer_min: 0
            }
        };

        logger.info('[PARSE] Plan parsing complete', 'Successfully parsed blocks', {
            blockCount: blocks.length,
            totalDuration: totalDurationMin
        });

        return {
            success: true,
            plan: plan
        };

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('[PARSE] Plan parsing failed', 'Error processing normalized text', {
            error: errorMsg
        });

        return {
            success: false,
            error: `Failed to parse workout plan: ${errorMsg}`
        };
    }
}

/**
 * Parse duration string into seconds and minutes
 */
export function parseDuration(str: string): { seconds: number; minutes: number } {
    // Handle mm:ss format
    const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
        const minutes = parseInt(timeMatch[1]);
        const seconds = parseInt(timeMatch[2]);
        return { 
            seconds: minutes * 60 + seconds, 
            minutes: minutes + (seconds / 60) 
        };
    }

    // Handle "Xm Ys" format
    const complexMatch = str.match(/(\d+)m\s*(\d+)s/i);
    if (complexMatch) {
        const minutes = parseInt(complexMatch[1]);
        const seconds = parseInt(complexMatch[2]);
        return { 
            seconds: minutes * 60 + seconds, 
            minutes: minutes + (seconds / 60) 
        };
    }

    // Handle "Xm" format
    const minutesMatch = str.match(/(\d+)m/i);
    if (minutesMatch) {
        const minutes = parseInt(minutesMatch[1]);
        return { seconds: minutes * 60, minutes };
    }

    // Handle "Xs" format
    const secondsMatch = str.match(/(\d+)s/i);
    if (secondsMatch) {
        const seconds = parseInt(secondsMatch[1]);
        return { seconds, minutes: seconds / 60 };
    }

    // Default fallback
    return { seconds: 300, minutes: 5 }; // 5 minutes default
}

/**
 * Map type string to normalized workout type
 */
export function mapType(str: string): string {
    const upperStr = str.toUpperCase();
    
    // Direct mappings
    const typeMap: Record<string, string> = {
        'WARM-UP': 'WARMUP',
        'WARMUP': 'WARMUP',
        'COOL-DOWN': 'COOLDOWN',
        'COOLDOWN': 'COOLDOWN',
        'AMRAP SUPERSET': 'SUPERSET',
        'TABATA VARIATION': 'TABATA',
        'GIANT SETS': 'GIANT_SETS',
        'GIANT_SETS': 'GIANT_SETS',
        'SUPERSET': 'SUPERSET',
        'TABATA': 'TABATA',
        'EMOM': 'EMOM',
        'AMRAP': 'AMRAP',
        'LADDER': 'LADDER',
        'PYRAMID': 'PYRAMID',
        'COMBO': 'COMBO',
        'FINISHER': 'FINISHER',
        'CHALLENGE': 'CHALLENGE',
        'RANDOMIZED': 'RANDOMIZED',
        'TRANSITION': 'TRANSITION'
    };

    // Check for exact matches first
    if (typeMap[upperStr]) {
        return typeMap[upperStr];
    }

    // Check for partial matches
    for (const [key, value] of Object.entries(typeMap)) {
        if (upperStr.includes(key.replace(/[-_]/g, ' ')) || upperStr.includes(key.replace(/[-_]/g, ''))) {
            return value;
        }
    }

    // Default to INTERVAL for unrecognized types
    return 'INTERVAL';
}

/**
 * Parse blocks from normalized text
 */
function parseBlocks(text: string): ParsedBlock[] {
    const blocks: ParsedBlock[] = [];
    const lines = text.split('\n');
    
    // Robust regex for block headers
    const HEADER_RE = new RegExp(
        String.raw`^(?:BLOCK\s*\d+|(?:FIRST|SHORT|MEDIUM|LONG|FINAL)\s+BLOCK|WARM-?UP|COOL-?DOWN|COOLDOWN)[^\n]*\n` +
        String.raw`NAME:\s*(?<name>.+?)\n` +
        String.raw`TYPE:\s*(?<type>.+?)\n` +
        String.raw`DURATION:\s*(?<duration>.+?)\n` +
        String.raw`(?:PATTERN:.*\n)?` + // optional
        String.raw`TIMELINE:\s*\n(?<timeline>(?:.*\n?)+?)(?=\n\n|$)`,
        'gmi'
    );

    let match;
    let blockIndex = 1;
    
    // Try the robust regex first
    while ((match = HEADER_RE.exec(text)) !== null) {
        const { name, type, duration, timeline } = match.groups!;

        const parsedDuration = parseDuration(duration.trim());
        const explicitType = type ? type.trim() : '';
        const normalizedType = explicitType ? mapType(explicitType) : inferTypeFromName(name.trim());

        const timelineItems = parseTimelineItems(timeline);

        blocks.push({
            id: `block-${blockIndex}`,
            name: name.trim(),
            type: explicitType || normalizedType,
            normalized_type: normalizedType,
            duration: `${Math.round(parsedDuration.minutes)} min`,
            duration_sec: parsedDuration.seconds,
            timeline: timelineItems,
            cues: generateDefaultCues(normalizedType),
            target_muscles: { full_body: 100 },
            rationale: `Parsed from uploaded workout: ${name.trim()}`,
            safety: 'Follow standard safety guidelines and proper form'
        });

        blockIndex++;
    }

    // Fallback: simpler parsing if regex doesn't match
    if (blocks.length === 0) {
        blocks.push(...parseBlocksSimple(lines));
    }

    return blocks;
}

/**
 * Simple block parsing fallback
 */
function parseBlocksSimple(lines: string[]): ParsedBlock[] {
    const blocks: ParsedBlock[] = [];
    let currentBlock: Partial<ParsedBlock> | null = null;
    let timelineItems: string[] = [];
    let blockIndex = 1;
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Check for block indicators
        if (trimmed.match(/^(BLOCK|WARM|COOL|TABATA|EMOM|AMRAP|LADDER|PYRAMID|COMBO|SUPERSET|FINISHER)/i)) {
            // Save previous block if exists
            if (currentBlock) {
                blocks.push(completeBlock(currentBlock, timelineItems, blockIndex - 1));
                timelineItems = [];
            }
            
            // Start new block
            const explicitType = inferTypeFromLine(trimmed);
            const duration = findDurationInLine(trimmed) || '5:00';
            const parsedDuration = parseDuration(duration);
            const normalizedType = explicitType ? mapType(explicitType) : inferTypeFromName(trimmed);

            currentBlock = {
                id: `block-${blockIndex}`,
                name: trimmed,
                type: explicitType || normalizedType,
                normalized_type: normalizedType,
                duration: `${Math.round(parsedDuration.minutes)} min`,
                duration_sec: parsedDuration.seconds
            };
            
            blockIndex++;
        } else if (currentBlock && (trimmed.startsWith('-') || trimmed.includes('|'))) {
            // Timeline item
            timelineItems.push(trimmed);
        }
    }
    
    // Add final block
    if (currentBlock) {
        blocks.push(completeBlock(currentBlock, timelineItems, blockIndex - 1));
    }
    
    return blocks;
}

/**
 * Parse timeline items from text
 */
function parseTimelineItems(timelineText: string): string[] {
    const items: string[] = [];
    const lines = timelineText.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parsed = parseTimelineLine(trimmed);
        if (parsed) {
            const timeStr = parsed.time_s ? `${parsed.time_s}s` : '30s';
            const restIndicator = parsed.isRest ? ' (REST)' : '';
            items.push(`${timeStr} | ${parsed.name}${restIndicator}`);
        }
    }

    return items;
}

/**
 * Parse individual timeline line
 */
export function parseTimelineLine(line: string): { time_s?: number; name: string; isRest?: boolean } | null {
    if (!line || line.length === 0) return null;
    
    // Remove bullet points
    const cleaned = line.replace(/^[\s\-\*\•●]\s*/, '');
    
    // Tolerant regex for timeline items
    const TL_RE = /^\s*(?:[-*●]\s*)?(?<time>\d+:\d+|\d+\s*(?:s|sec|seconds)?)\s*\|\s*(?<text>.+?)\s*$/i;
    const match = cleaned.match(TL_RE);
    
    if (match) {
        const { time, text } = match.groups!;
        const timeInSeconds = parseTimeToSeconds(time);
        const isRest = /rest|transition|break/i.test(text);
        
        return {
            time_s: timeInSeconds,
            name: text.trim(),
            isRest
        };
    }
    
    // If no time specified, assume it's an exercise
    if (cleaned.length > 0) {
        const isRest = /rest|transition|break/i.test(cleaned);
        return {
            name: cleaned,
            isRest
        };
    }
    
    return null;
}

/**
 * Helper functions
 */
function parseTimeToSeconds(timeStr: string): number {
    if (timeStr.includes(':')) {
        const [min, sec] = timeStr.split(':').map(Number);
        return min * 60 + sec;
    }
    
    const seconds = parseInt(timeStr.replace(/\D/g, ''));
    return seconds || 30;
}

function inferTypeFromLine(line: string): string {
    const upper = line.toUpperCase();
    if (upper.includes('WARM')) return 'WARMUP';
    if (upper.includes('COOL')) return 'COOLDOWN';
    if (upper.includes('TABATA')) return 'TABATA';
    if (upper.includes('EMOM')) return 'EMOM';
    if (upper.includes('AMRAP')) return 'AMRAP';
    if (upper.includes('LADDER')) return 'LADDER';
    if (upper.includes('PYRAMID')) return 'PYRAMID';
    if (upper.includes('COMBO')) return 'COMBO';
    if (upper.includes('SUPERSET')) return 'SUPERSET';
    if (upper.includes('FINISHER')) return 'FINISHER';
    return 'INTERVAL';
}

function findDurationInLine(line: string): string | null {
    const timeMatch = line.match(/(\d{1,2}:\d{2})/);
    if (timeMatch) return timeMatch[1];
    
    const durationMatch = line.match(/(\d+)\s*(min|minutes|m)\b/i);
    if (durationMatch) return `${durationMatch[1]}:00`;
    
    return null;
}

function completeBlock(partial: Partial<ParsedBlock>, timeline: string[], index: number): ParsedBlock {
    return {
        id: partial.id || `block-${index}`,
        name: partial.name || `Block ${index}`,
        type: partial.type || 'INTERVAL',
        normalized_type: partial.normalized_type || 'INTERVAL',
        duration: partial.duration || '5 min',
        duration_sec: partial.duration_sec || 300,
        timeline: timeline.length > 0 ? timeline : ['30s | Exercise 1', '30s | Exercise 2'],
        cues: generateDefaultCues(partial.normalized_type || 'INTERVAL'),
        target_muscles: { full_body: 100 },
        rationale: `Parsed from uploaded workout: ${partial.name || `Block ${index}`}`,
        safety: 'Follow standard safety guidelines and proper form'
    };
}

function generateDefaultCues(type: string): string[] {
    const cueMap: Record<string, string[]> = {
        'WARMUP': ['Move smoothly', 'Prepare your body', 'Focus on mobility'],
        'COOLDOWN': ['Breathe deeply', 'Hold each stretch', 'Relax and recover'],
        'TABATA': ['All out effort', 'Push through fatigue', 'Rest completely'],
        'EMOM': ['Start each minute fresh', 'Maintain good form', 'Use remaining time to rest'],
        'AMRAP': ['Keep moving', 'Pace yourself', 'Quality over quantity'],
        'LADDER': ['Build intensity', 'Focus on progression', 'Control the tempo'],
        'PYRAMID': ['Peak at the middle', 'Manage your energy', 'Stay consistent'],
        'COMBO': ['Flow between exercises', 'Maintain rhythm', 'Keep core engaged'],
        'SUPERSET': ['Minimal rest between exercises', 'Push through the burn', 'Focus on target muscles'],
        'FINISHER': ['Give everything you have', 'This is the final push', 'Finish strong']
    };
    
    return cueMap[type] || ['Maintain good form', 'Control your breathing', 'Stay focused'];
}
