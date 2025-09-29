import * as logger from '../utils/logger';

export interface NormalizedBlock {
    type: 'WARMUP' | 'INTERVAL' | 'COOLDOWN' | 'COMBO' | 'TABATA' | 'EMOM' | 'PYRAMID' | 'RANDOMIZED' | 'LADDER' | 'FINISHER' | 'TRANSITION' | 'AMRAP' | 'SUPERSET' | 'GIANT_SETS' | 'CHALLENGE';
    name: string;
    duration: string;
    duration_sec?: number;
    content: string[];
    exercises?: string[];
    pattern?: string;
    warnings?: string[];
}

export interface NormalizedUpload {
    success: boolean;
    blocks: NormalizedBlock[];
    totalDuration: number;
    error?: string;
    rawText?: string;
    warnings?: string[];
}

/**
 * Main function to normalize uploaded file content into canonical format
 */
export function normalizeUploadedFile(rawText: string): string {
    logger.info('[NORMALIZE] Starting text normalization', 'Processing raw text', {
        textLength: rawText.length
    });

    // Step 1: Clean the raw text
    const cleanedText = cleanRawText(rawText);
    
    // Step 2: Normalize to canonical format
    const normalizedText = normalizeToCanonicalFormat(cleanedText);
    
    logger.info('[NORMALIZE] Text normalization complete', 'Canonical format created', {
        originalLength: rawText.length,
        cleanedLength: cleanedText.length,
        normalizedLength: normalizedText.length
    });

    return normalizedText;
}

/**
 * Clean up raw text from PDF/document parsing
 */
function cleanRawText(rawText: string): string {
    let cleaned = rawText;
    
    // Remove common PDF artifacts
    cleaned = cleaned.replace(/\f/g, '\n'); // Form feed to newline
    cleaned = cleaned.replace(/\r\n/g, '\n'); // Windows line endings
    cleaned = cleaned.replace(/\r/g, '\n'); // Mac line endings
    
    // Remove page numbers (standalone numbers on lines)
    cleaned = cleaned.replace(/^\s*\d+\s*$/gm, '');
    
    // Remove common headers/footers
    cleaned = cleaned.replace(/^(page \d+|copyright|confidential|draft).*$/gmi, '');
    
    // Remove timestamps and dates that might appear in headers
    cleaned = cleaned.replace(/^\d{1,2}\/\d{1,2}\/\d{2,4}.*$/gm, '');
    cleaned = cleaned.replace(/^\d{1,2}:\d{2}\s*(AM|PM).*$/gm, '');
    
    // Normalize dashes/bullets to consistent format
    cleaned = cleaned.replace(/[●•]/g, '-');
    cleaned = cleaned.replace(/^\s*[\*\+]\s*/gm, '- ');
    
    // Collapse multiple spaces and tabs
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    
    // Collapse multiple newlines but preserve paragraph breaks
    cleaned = cleaned.replace(/\n\s*\n\s*\n+/g, '\n\n');
    
    // Remove leading/trailing whitespace from lines
    cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');
    
    // Remove empty lines at start and end
    cleaned = cleaned.trim();
    
    return cleaned;
}

/**
 * Normalize text to canonical format with proper block headers
 */
function normalizeToCanonicalFormat(cleanedText: string): string {
    const lines = cleanedText.split('\n');
    const normalizedLines: string[] = [];
    let blockIndex = 1;
    let inTimeline = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Detect block headers - various formats
        const blockMatch = detectBlockHeader(line, lines, i);

        if (blockMatch) {
            // Add empty line before new block (except first)
            if (normalizedLines.length > 0) {
                normalizedLines.push('');
            }

            // Start new block with canonical format
            normalizedLines.push(`BLOCK ${blockIndex}`);
            normalizedLines.push(`NAME: ${blockMatch.name}`);
            normalizedLines.push(`TYPE: ${blockMatch.type}`);
            normalizedLines.push(`DURATION: ${blockMatch.duration}`);
            if (blockMatch.pattern) {
                normalizedLines.push(`PATTERN: ${blockMatch.pattern}`);
            }
            normalizedLines.push('TIMELINE:');

            blockIndex++;
            inTimeline = true;
            continue;
        }

        // If we haven't found any blocks yet and this looks like content, create a default block
        if (blockIndex === 1 && line.length > 0 && !isHeaderOrMetadata(line)) {
            normalizedLines.push('BLOCK 1');
            normalizedLines.push('NAME: Workout');
            normalizedLines.push('TYPE: INTERVAL');
            normalizedLines.push('DURATION: 5:00');
            normalizedLines.push('TIMELINE:');
            blockIndex++;
            inTimeline = true;
            // Continue to process this line as timeline content
        }
        
        // Process timeline items
        if (inTimeline) {
            const timelineItem = normalizeTimelineItem(line);
            if (timelineItem) {
                normalizedLines.push(timelineItem);
            } else if (line.length > 0 && !isHeaderOrMetadata(line)) {
                // Keep other content as potential timeline items
                normalizedLines.push(`- 30s | ${line}`);
            }
        }
    }
    
    return normalizedLines.join('\n');
}

interface BlockMatch {
    name: string;
    type: string;
    duration: string;
    pattern?: string;
}

/**
 * Detect various block header formats and extract information
 */
function detectBlockHeader(line: string, allLines: string[], currentIndex: number): BlockMatch | null {
    const upperLine = line.toUpperCase();
    
    // Pattern 1: "FIRST BLOCK — Warm-up" or "SHORT BLOCK — Ladder Up & Down"
    let match = line.match(/^(FIRST|SHORT|MEDIUM|LONG|FINAL)\s+BLOCK\s*[—\-–]\s*(.+)$/i);
    if (match) {
        const name = match[2].trim();
        const type = inferTypeFromName(name);
        const duration = findDurationInContext(allLines, currentIndex);
        return { name, type, duration };
    }
    
    // Pattern 2: "WARMUP", "WARM-UP", "COOLDOWN", "COOL-DOWN"
    if (upperLine.match(/^(WARM-?UP|COOL-?DOWN|COOLDOWN)$/)) {
        const type = upperLine.includes('WARM') ? 'WARMUP' : 'COOLDOWN';
        const duration = findDurationInContext(allLines, currentIndex);
        return { name: line, type, duration };
    }
    
    // Pattern 3: "Block 1:", "BLOCK 2:", etc.
    match = line.match(/^BLOCK\s*(\d+):?\s*(.*)$/i);
    if (match) {
        const name = match[2] || `Block ${match[1]}`;
        const type = inferTypeFromName(name);
        const duration = findDurationInContext(allLines, currentIndex);
        return { name, type, duration };
    }
    
    // Pattern 4: Standalone workout type names
    const workoutTypes = ['TABATA', 'EMOM', 'AMRAP', 'LADDER', 'PYRAMID', 'COMBO', 'SUPERSET', 'FINISHER'];
    for (const workoutType of workoutTypes) {
        if (upperLine.includes(workoutType)) {
            const duration = findDurationInContext(allLines, currentIndex);
            return { name: line, type: workoutType, duration };
        }
    }

    // Pattern 5: Simple section headers like "Warm up", "Main workout", "Cool down"
    if (upperLine.match(/^(WARM\s*UP|MAIN\s*(WORKOUT|SET)|COOL\s*DOWN)/)) {
        const type = inferTypeFromName(line);
        const duration = findDurationInContext(allLines, currentIndex);
        return { name: line, type, duration };
    }

    // Pattern 6: Block headers with duration in parentheses like "WARM-UP BLOCK (5 minutes)"
    const durationInParensMatch = line.match(/^(.+?)\s*\((\d+)\s*min/i);
    if (durationInParensMatch) {
        const name = durationInParensMatch[1].trim();
        const minutes = parseInt(durationInParensMatch[2]);
        const type = inferTypeFromName(name);
        return { name, type, duration: `${minutes}:00` };
    }
    
    return null;
}

/**
 * Infer workout type from block name
 */
function inferTypeFromName(name: string): string {
    const upperName = name.toUpperCase();
    
    if (upperName.includes('WARM')) return 'WARMUP';
    if (upperName.includes('COOL')) return 'COOLDOWN';
    if (upperName.includes('TABATA')) return 'TABATA';
    if (upperName.includes('EMOM')) return 'EMOM';
    if (upperName.includes('AMRAP')) return 'AMRAP';
    if (upperName.includes('LADDER')) return 'LADDER';
    if (upperName.includes('PYRAMID')) return 'PYRAMID';
    if (upperName.includes('COMBO')) return 'COMBO';
    if (upperName.includes('SUPERSET')) return 'SUPERSET';
    if (upperName.includes('FINISHER')) return 'FINISHER';
    if (upperName.includes('GIANT')) return 'GIANT_SETS';
    if (upperName.includes('CHALLENGE')) return 'CHALLENGE';
    
    // Default to INTERVAL for unrecognized types
    return 'INTERVAL';
}

/**
 * Find duration information in surrounding context
 */
function findDurationInContext(lines: string[], currentIndex: number): string {
    // Look in current line and next few lines for duration patterns
    for (let i = currentIndex; i < Math.min(currentIndex + 5, lines.length); i++) {
        const line = lines[i];
        
        // Pattern: "03:00", "3:30", "10:25"
        const timeMatch = line.match(/(\d{1,2}:\d{2})/);
        if (timeMatch) {
            return timeMatch[1];
        }
        
        // Pattern: "5 minutes", "3min", "45s"
        const durationMatch = line.match(/(\d+)\s*(min|minutes|sec|seconds|m|s)\b/i);
        if (durationMatch) {
            const num = parseInt(durationMatch[1]);
            const unit = durationMatch[2].toLowerCase();
            if (unit.startsWith('m')) {
                return `${num}:00`;
            } else {
                const minutes = Math.floor(num / 60);
                const seconds = num % 60;
                return `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        }
    }
    
    // Default duration if none found
    return '5:00';
}

/**
 * Normalize timeline items to consistent format
 */
function normalizeTimelineItem(line: string): string | null {
    // Remove various bullet points and normalize
    let cleaned = line.replace(/^[\s\-\*\•●]\s*/, '');

    // Check if it looks like a timeline item (has timing)
    const timePattern = /^(\d+:\d+|\d+\s*(?:s|sec|seconds?))\s*[\|\-]\s*(.+)$/i;
    const match = cleaned.match(timePattern);

    if (match) {
        const time = match[1];
        const exercise = match[2].trim();

        // Normalize time format
        let normalizedTime = time;
        if (time.includes(':')) {
            normalizedTime = time;
        } else {
            // Convert seconds to proper format
            const seconds = parseInt(time.replace(/\D/g, ''));
            normalizedTime = `${seconds}s`;
        }

        return `- ${normalizedTime} | ${exercise}`;
    }

    // Check for exercise with timing at the end (e.g., "Child's pose - 60s")
    const endTimePattern = /^(.+?)\s*[-–]\s*(\d+)\s*(?:s|sec|seconds?)\s*$/i;
    const endTimeMatch = cleaned.match(endTimePattern);

    if (endTimeMatch) {
        const exercise = endTimeMatch[1].trim();
        const seconds = parseInt(endTimeMatch[2]);
        return `- ${seconds}s | ${exercise}`;
    }

    // Check for exercise without explicit timing
    if (cleaned.length > 0 && !isHeaderOrMetadata(cleaned)) {
        return `- 30s | ${cleaned}`;
    }

    return null;
}

/**
 * Check if line is header or metadata (should be ignored in timeline)
 */
function isHeaderOrMetadata(line: string): boolean {
    const upperLine = line.toUpperCase();

    // Skip common metadata lines
    const metadataPatterns = [
        /^(DURATION|TIME|TOTAL|EQUIPMENT|NOTES?|INSTRUCTIONS?|SETUP):/i,
        /^(RPE|INTENSITY|LEVEL|DIFFICULTY):/i,
        /^\d+\s*(MIN|MINUTES|SEC|SECONDS)\s*$/i,
        /^(REPEAT|ROUNDS?|SETS?):/i,
        /^(INSTRUCTOR|TEACHER|COACH):/i,
        /^(DATE|TIME|CLASS|LOCATION):/i,
        /^(FITNESS\s+CLASS\s+PLAN|WORKOUT\s+PLAN|CLASS\s+PLAN)$/i,
        /^\d{1,2}\/\d{1,2}\/\d{2,4}$/i, // Date patterns
        /^\d{4}-\d{2}-\d{2}$/i // ISO date patterns
    ];

    return metadataPatterns.some(pattern => pattern.test(line));
}

// Legacy class for backward compatibility
export class UploadNormalizer {
    public async normalizeUploadedContent(rawText: string, fileName: string): Promise<NormalizedUpload> {
        try {
            const normalizedText = normalizeUploadedFile(rawText);
            // For now, return a simple success response
            // The actual parsing will be handled by parseUploadedPlan
            return {
                success: true,
                blocks: [],
                totalDuration: 0,
                rawText: normalizedText
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                blocks: [],
                totalDuration: 0,
                error: `Could not normalize ${fileName}: ${errorMsg}`
            };
        }
    }
    
    public convertToExampleFormat(normalized: NormalizedUpload, fileName: string): string {
        return normalized.rawText || '';
    }
}

// Export singleton instance for backward compatibility
export const uploadNormalizer = new UploadNormalizer();
