import { AnyClassPlan } from '../types/timer';
import * as logger from '../utils/logger';
import { DEFAULT_MODEL } from '../ai/constants';
import { workoutSchemaV2, EnhancedClassPlan } from '../ai/zodSchema';
import { normalizeUploadedFile, uploadNormalizer } from './normalizeUploadedFile';
import { parseUploadedPlan } from './parseUploadedPlan';

// Import PDF parsing library
let pdfParse: any = null;
try {
    pdfParse = require('pdf-parse');
} catch (e) {
    console.warn('pdf-parse not available, PDF parsing will be disabled');
}

// Simplified Type Definitions as requested
export interface PlanPatch { [key: string]: any }
export interface SerializedFile {
    name: string;
    type: string;
    size: number;
    lastModified: number;
    data: number[]; // Uint8Array converted to regular array for JSON serialization
}

export interface AIGenerationRequest {
    clarifyingQuestions: any;
    instructorProfile: any;
    currentFormat?: string;
    uploadedFiles?: File[];
    serializedFiles?: SerializedFile[];
    [key: string]: any; // To allow other properties without TS complaining
}
export interface AIGenerationResponse {
    success: boolean;
    data?: any;
    error?: string;
    warning?: string
}

function secondsFromLine(line: string): number {
    const s = (line || '').trim();
    let m = s.match(/^(\d+)\s*(s|sec)\s*\|/i); if (m) return +m[1];
    m = s.match(/^(\d+):(\d+)\s*\|/); if (m) return (+m[1]) * 60 + (+m[2]);
    m = s.match(/\((\d+):(\d+)\)\s*$/); if (m) return (+m[1]) * 60 + (+m[2]);
    return 0;
}

export class AIWorkoutGeneratorService {
    private apiKey: string;
    private model: string;
    private debug: boolean;
    private responseLog: string[] = [];

    constructor(apiKey: string, model: string = DEFAULT_MODEL, debug = false) {
        this.apiKey = apiKey;
        this.model = model;
        this.debug = debug;
    }

    private secondsFromEntry(entry: string): number {
        const e = entry.trim().toLowerCase();
        const m = e.match(/^(\d+)\s*(s|sec)\s*\|/);
        return m ? Number(m[1]) : 0;
    }

    private sumTimelineSeconds(entries: string[] = []): number {
        const sec = (e: string) => {
            const m = e.trim().match(/^(\d+)\s*s\s*\|/i);
            return m ? Number(m[1]) : 0;
        };
        return entries.reduce((acc, e) => acc + sec(e), 0);
    }

    /**
     * Convert serialized files back to File objects
     */
    private deserializeFiles(serializedFiles: SerializedFile[]): File[] {
        return serializedFiles.map(serializedFile => {
            const uint8Array = new Uint8Array(serializedFile.data);
            const blob = new Blob([uint8Array], { type: serializedFile.type });
            return new File([blob], serializedFile.name, {
                type: serializedFile.type,
                lastModified: serializedFile.lastModified
            });
        });
    }

    /**
     * Truncate request content to avoid OpenAI token limits
     */
    private truncateRequestForAPI(request: AIGenerationRequest): AIGenerationRequest {
        const MAX_CHARS = 50000; // Rough estimate to stay under token limits
        const truncated = { ...request };

        // Truncate large text fields
        if (truncated.instructorProfile?.pastClasses) {
            truncated.instructorProfile.pastClasses = truncated.instructorProfile.pastClasses.map((text: string) => {
                if (text.length > MAX_CHARS) {
                    return text.substring(0, MAX_CHARS) + '\n\n[Content truncated due to length...]';
                }
                return text;
            });
        }

        // Remove file data to reduce payload size
        if (truncated.serializedFiles) {
            truncated.serializedFiles = truncated.serializedFiles.map(file => ({
                ...file,
                data: [] // Remove binary data from API request
            }));
        }

        return truncated;
    }

    public sanitizePlan(plan: EnhancedClassPlan, request: AIGenerationRequest): EnhancedClassPlan {
        const sanitized = JSON.parse(JSON.stringify(plan));
        const allowedEquipment = request.instructorProfile.currentFormat || 'bodyweight';
        const MAX_ENTRY_SEC = 180;

        // Validate all expected block types are present
        const expectedBlockTypes = ['WARMUP', 'COMBO', 'INTERVAL', 'PYRAMID', 'SUPERSET', 'CHALLENGE', 'COOLDOWN', 'TRANSITION'];
        const presentBlockTypes = sanitized.blocks.map(b => b.normalized_type || b.type?.toUpperCase()).filter(Boolean);
        const missingBlockTypes = expectedBlockTypes.filter(type => !presentBlockTypes.includes(type));
        
        if (missingBlockTypes.length > 0) {
            logger.warn('[SANITIZE] Missing block types detected', 'Some block types not found in plan', {
                missing: missingBlockTypes,
                present: presentBlockTypes,
                totalBlocks: sanitized.blocks.length
            });
        }

        for (const block of sanitized.blocks) {
            if (!block.timeline) continue;
            block.timeline = block.timeline
                .map((entry: string) => {
                    const match = entry.match(/^(\d+)s/i);
                    if (match && parseInt(match[1], 10) > MAX_ENTRY_SEC) {
                        return entry.replace(match[1], MAX_ENTRY_SEC.toString());
                    }
                    return entry;
                })
        }

        let totalPlanSeconds = 0;
        for (const block of sanitized.blocks) {
            block.duration = `${Math.round(block.duration_sec / 60)} min`;
            totalPlanSeconds += block.duration_sec;
        }
        
        // Validate duration vs block count
        const expectedDurationMin = request.clarifyingQuestions?.classLength || sanitized.metadata.duration_min;
        const actualDurationMin = Math.round(totalPlanSeconds / 60);
        const durationDiff = Math.abs(actualDurationMin - expectedDurationMin);
        
        if (durationDiff > 5) { // More than 5 minutes difference
            logger.warn('[SANITIZE] Duration mismatch detected', 'Block duration does not match expected class length', {
                expectedMin: expectedDurationMin,
                actualMin: actualDurationMin,
                blockCount: sanitized.blocks.length,
                blocks: sanitized.blocks.map(b => ({ name: b.name, type: b.type, duration_sec: b.duration_sec }))
            });
        }
        
        sanitized.metadata.duration_min = actualDurationMin;

        return sanitized;
    }

    public async parseUploadedFile(file: File): Promise<{ blocks: any[], error?: string, normalizedText?: string }> {
        try {
            const fileType = file.type;
            const fileName = file.name.toLowerCase();

            logger.info('[PARSE_FILE] Starting file parsing', 'Processing uploaded file', {
                name: file.name,
                type: fileType,
                size: file.size
            });

            let rawText = '';

            if (fileType.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.csv')) {
                // Handle text files
                rawText = await file.text();
            } else if (fileName.endsWith('.pdf')) {
                // Handle PDF files with pdf-parse library
                if (!pdfParse) {
                    logger.warn('[PARSE_FILE] PDF parsing library not available', 'pdf-parse not installed', { fileName });
                    return {
                        blocks: [],
                        error: 'PDF parsing library not available. Please copy the text content from your PDF and paste it into a .txt file, or use the Chat Editor to input your workout manually.'
                    };
                }

                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdfData = await pdfParse(Buffer.from(arrayBuffer));
                    rawText = pdfData.text;
                    logger.info('[PARSE_FILE] Successfully extracted text from PDF', 'PDF text extraction complete', {
                        fileName,
                        textLength: rawText.length
                    });
                } catch (error) {
                    logger.error('[PARSE_FILE] PDF parsing failed', 'Error extracting text from PDF', {
                        fileName,
                        error: error instanceof Error ? error.message : String(error)
                    });
                    return {
                        blocks: [],
                        error: `Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}. Please try converting to a .txt file or use the Chat Editor.`
                    };
                }
            } else if (fileName.endsWith('.docx')) {
                // For DOCX files, we need a Word document parsing library
                logger.warn('[PARSE_FILE] DOCX parsing not available', 'Word documents need to be converted to text first', { fileName });
                return {
                    blocks: [],
                    error: 'Word document parsing requires additional setup. Please copy the text content from your document and paste it into a .txt file, or use the Chat Editor to input your workout manually.'
                };
            } else if (fileType.startsWith('image/')) {
                // For images, we need OCR functionality
                logger.warn('[PARSE_FILE] Image OCR not available', 'Image parsing requires OCR service', { fileName });
                return {
                    blocks: [],
                    error: 'Image text extraction requires additional setup. Please copy the text content from your image and paste it into a .txt file, or use the Chat Editor to input your workout manually.'
                };
            } else {
                return {
                    blocks: [],
                    error: `Unsupported file type: ${fileType}. Please try the Chat Editor for manual input.`
                };
            }

            // Step 1: Normalize the raw text
            const normalizedText = normalizeUploadedFile(rawText);

            // Step 2: Parse into structured plan
            const parseResult = parseUploadedPlan(normalizedText);

            if (!parseResult.success) {
                return {
                    blocks: [],
                    error: parseResult.error || 'Failed to parse file content. Please try the Chat Editor for manual input.',
                    normalizedText: normalizedText
                };
            }

            logger.info('[PARSE_FILE] Successfully parsed and normalized file', 'File processing complete', {
                fileName: file.name,
                blockCount: parseResult.plan?.blocks.length || 0,
                totalDuration: parseResult.plan?.metadata.duration_min || 0
            });

            // Return the parsed blocks
            return {
                blocks: parseResult.plan?.blocks || [],
                normalizedText: normalizedText
            };

        } catch (error) {
            logger.error('[PARSE_FILE] File parsing failed', 'Error processing uploaded file', { 
                fileName: file.name, 
                error: error instanceof Error ? error.message : String(error) 
            });
            return { 
                blocks: [], 
                error: `Failed to parse ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}. Please try the Chat Editor for manual input.` 
            };
        }
    }

    private parseDurationToSeconds(duration: string): number {
        const match = duration.match(/(\d+)/);
        return match ? parseInt(match[1]) * 60 : 300; // Default to 5 minutes
    }


    private normalizeBlockType(type: string): string {
        const normalized = type.toLowerCase().replace(/[^a-z]/g, '');
        
        if (normalized.includes('warm')) return 'WARMUP';
        if (normalized.includes('cool') || normalized.includes('stretch')) return 'COOLDOWN';
        if (normalized.includes('main') || normalized.includes('interval')) return 'INTERVAL';
        if (normalized.includes('finisher')) return 'FINISHER';
        if (normalized.includes('transition')) return 'TRANSITION';
        
        return 'INTERVAL'; // Default
    }

    public async integrateUploadedFiles(plan: EnhancedClassPlan, request: AIGenerationRequest): Promise<EnhancedClassPlan> {
        try {
            const uploadedFiles = request.uploadedFiles as File[];
            const followScale = request.clarifyingQuestions?.followUploadedExamples || 5;
            
            logger.info('[INTEGRATE_FILES] Processing uploaded files', 'Integrating uploaded content', {
                fileCount: uploadedFiles.length,
                followScale
            });

            // Parse all uploaded files
            const allUploadedBlocks: any[] = [];
            const fileErrors: string[] = [];
            const normalizedTexts: string[] = [];
            
            for (const file of uploadedFiles) {
                const parseResult = await this.parseUploadedFile(file);
                if (parseResult.error) {
                    fileErrors.push(`${file.name}: ${parseResult.error}`);
                } else {
                    allUploadedBlocks.push(...parseResult.blocks);
                    if (parseResult.normalizedText) {
                        normalizedTexts.push(parseResult.normalizedText);
                    }
                }
            }

            // If no blocks were successfully parsed, return original plan
            if (allUploadedBlocks.length === 0) {
                if (fileErrors.length > 0) {
                    logger.warn('[INTEGRATE_FILES] No blocks parsed from uploads', 'File parsing failed', { fileErrors });
                }
                return plan;
            }

            // Integrate uploaded blocks based on follow scale
            const integratedPlan = JSON.parse(JSON.stringify(plan));
            
            if (followScale >= 8) {
                // High follow scale: Replace most blocks with uploaded content
                logger.info('[INTEGRATE_FILES] High follow scale - replacing blocks', 'Using uploaded structure', { followScale });
                
                // Keep warmup and cooldown from AI, replace middle blocks with uploads
                const aiWarmup = integratedPlan.blocks.find(b => b.normalized_type === 'WARMUP');
                const aiCooldown = integratedPlan.blocks.find(b => b.normalized_type === 'COOLDOWN');
                
                integratedPlan.blocks = [
                    ...(aiWarmup ? [aiWarmup] : []),
                    ...allUploadedBlocks,
                    ...(aiCooldown ? [aiCooldown] : [])
                ];
            } else if (followScale >= 5) {
                // Medium follow scale: Mix uploaded blocks with AI blocks
                logger.info('[INTEGRATE_FILES] Medium follow scale - mixing blocks', 'Blending uploaded and AI content', { followScale });
                
                // Insert uploaded blocks between AI blocks
                const mixedBlocks = [];
                const aiBlocks = integratedPlan.blocks.filter(b => b.normalized_type !== 'WARMUP' && b.normalized_type !== 'COOLDOWN');
                const warmupCooldown = integratedPlan.blocks.filter(b => b.normalized_type === 'WARMUP' || b.normalized_type === 'COOLDOWN');
                
                // Add warmup
                const warmup = warmupCooldown.find(b => b.normalized_type === 'WARMUP');
                if (warmup) mixedBlocks.push(warmup);
                
                // Interleave AI and uploaded blocks
                const maxBlocks = Math.max(aiBlocks.length, allUploadedBlocks.length);
                for (let i = 0; i < maxBlocks; i++) {
                    if (i < aiBlocks.length) mixedBlocks.push(aiBlocks[i]);
                    if (i < allUploadedBlocks.length) mixedBlocks.push(allUploadedBlocks[i]);
                }
                
                // Add cooldown
                const cooldown = warmupCooldown.find(b => b.normalized_type === 'COOLDOWN');
                if (cooldown) mixedBlocks.push(cooldown);
                
                integratedPlan.blocks = mixedBlocks;
            } else {
                // Low follow scale: Use uploads as inspiration only
                logger.info('[INTEGRATE_FILES] Low follow scale - using as inspiration', 'Minimal integration', { followScale });
                
                // Add uploaded content as additional context in rationale
                for (const block of integratedPlan.blocks) {
                    if (allUploadedBlocks.length > 0) {
                        const inspirationBlock = allUploadedBlocks[Math.floor(Math.random() * allUploadedBlocks.length)];
                        block.rationale += ` (Inspired by uploaded content: ${inspirationBlock.name})`;
                    }
                }
            }

            // Update metadata
            integratedPlan.metadata.follow_uploaded_examples = followScale;
            integratedPlan.metadata.uploaded_files = uploadedFiles.map(f => f.name);
            
            // Store normalized texts for potential AI re-generation
            if (normalizedTexts.length > 0) {
                integratedPlan.metadata.normalized_upload_content = normalizedTexts.join('\n\n---\n\n');
            }
            
            // Recalculate total duration
            const totalSeconds = integratedPlan.blocks.reduce((sum, block) => sum + (block.duration_sec || 0), 0);
            integratedPlan.metadata.duration_min = Math.round(totalSeconds / 60);

            logger.info('[INTEGRATE_FILES] Successfully integrated uploaded files', 'File integration complete', {
                originalBlockCount: plan.blocks.length,
                uploadedBlockCount: allUploadedBlocks.length,
                finalBlockCount: integratedPlan.blocks.length,
                followScale,
                normalizedTextsCount: normalizedTexts.length,
                fileErrors: fileErrors.length > 0 ? fileErrors : undefined
            });

            return integratedPlan;
        } catch (error) {
            logger.error('[INTEGRATE_FILES] File integration failed', 'Error integrating uploaded files', {
                error: error instanceof Error ? error.message : String(error)
            });
            return plan; // Return original plan on error
        }
    }

    public insertAutoTransitions(plan: EnhancedClassPlan, transitionSeconds: number): EnhancedClassPlan {
        if (transitionSeconds <= 0) return plan;
        
        const planWithTransitions = JSON.parse(JSON.stringify(plan));
        const originalBlocks = [...planWithTransitions.blocks];
        const newBlocks = [];
        
        for (let i = 0; i < originalBlocks.length; i++) {
            // Add the original block
            newBlocks.push(originalBlocks[i]);
            
            // Add transition after each block except the last one
            if (i < originalBlocks.length - 1) {
                const transitionBlock = {
                    id: `transition-${i + 1}`,
                    name: 'Transition',
                    type: 'TRANSITION',
                    normalized_type: 'TRANSITION',
                    duration: `${transitionSeconds}s`,
                    duration_sec: transitionSeconds,
                    timeline: [`${transitionSeconds}s | Transition to next block`],
                    rationale: 'Auto-generated transition between blocks',
                    safety: 'Use this time to prepare for the next exercise'
                };
                newBlocks.push(transitionBlock);
            }
        }
        
        planWithTransitions.blocks = newBlocks;
        
        // Update total duration
        const totalSeconds = newBlocks.reduce((sum, block) => sum + (block.duration_sec || 0), 0);
        planWithTransitions.metadata.duration_min = Math.round(totalSeconds / 60);
        
        logger.info('[AUTO-TRANSITIONS] Inserted transitions', 'Added transition blocks', {
            originalBlockCount: originalBlocks.length,
            newBlockCount: newBlocks.length,
            transitionSeconds,
            totalDurationMin: planWithTransitions.metadata.duration_min
        });
        
        return planWithTransitions;
    }

    public normalizeDurations(plan: EnhancedClassPlan, targetSeconds: number): { plan: EnhancedClassPlan; normalized: boolean; message?: string } {
        const SOFT_BUFFER_SEC = 180; // ±3 minutes tolerance
        const MIN_REST_SEC = 15; // Minimum rest period
        
        let totalSeconds = plan.blocks.reduce((sum, block) => sum + (block.duration_sec || 0), 0);
        const diff = totalSeconds - targetSeconds;
        
        // If within soft buffer, no normalization needed
        if (Math.abs(diff) <= SOFT_BUFFER_SEC) {
            logger.debug('[NORMALIZE] Plan within acceptable range', 'No changes needed', { 
                totalSeconds, targetSeconds, diff 
            });
            return { plan, normalized: false };
        }
        
        const normalizedPlan = JSON.parse(JSON.stringify(plan)); // Deep copy
        let adjustedSeconds = 0;
        let strategy = '';
        
        if (diff > 0) {
            // Plan is too long - trim it down
            logger.info('[NORMALIZE] Plan too long, trimming', 'Starting normalization', { 
                totalSeconds, targetSeconds, excess: diff 
            });
            
            // Strategy 1: Trim rest periods in timeline entries
            let trimmed = 0;
            for (const block of normalizedPlan.blocks) {
                if (!block.timeline || trimmed >= diff) continue;
                
                const newTimeline = [];
                let blockTrimmed = 0;
                
                for (const entry of block.timeline) {
                    const restMatch = entry.match(/^(\d+)s\s*\|\s*rest/i);
                    if (restMatch && trimmed < diff) {
                        const currentRest = parseInt(restMatch[1]);
                        const newRest = Math.max(MIN_REST_SEC, currentRest - Math.min(currentRest - MIN_REST_SEC, diff - trimmed));
                        const reduction = currentRest - newRest;
                        
                        if (reduction > 0) {
                            newTimeline.push(entry.replace(/^\d+s/, `${newRest}s`));
                            trimmed += reduction;
                            blockTrimmed += reduction;
                        } else {
                            newTimeline.push(entry);
                        }
                    } else {
                        newTimeline.push(entry);
                    }
                }
                
                block.timeline = newTimeline;
                block.duration_sec -= blockTrimmed;
                block.duration = `${Math.round(block.duration_sec / 60)}:${String(block.duration_sec % 60).padStart(2, '0')}`;
            }
            
            adjustedSeconds = trimmed;
            strategy = 'trimmed rest periods';
            
            // Strategy 2: If still too long, shave time from final block
            const remainingExcess = diff - trimmed;
            if (remainingExcess > 30 && normalizedPlan.blocks.length > 0) {
                const finalBlock = normalizedPlan.blocks[normalizedPlan.blocks.length - 1];
                const reduction = Math.min(remainingExcess, finalBlock.duration_sec * 0.2); // Max 20% reduction
                
                finalBlock.duration_sec -= reduction;
                finalBlock.duration = `${Math.round(finalBlock.duration_sec / 60)}:${String(finalBlock.duration_sec % 60).padStart(2, '0')}`;
                
                adjustedSeconds += reduction;
                strategy += ` and reduced final block`;
            }
            
        } else {
            // Plan is too short - pad it
            logger.info('[NORMALIZE] Plan too short, padding', 'Starting normalization', { 
                totalSeconds, targetSeconds, shortage: Math.abs(diff) 
            });
            
            // Add rest/cooldown time to the last block or create a cooldown
            const shortage = Math.abs(diff);
            const lastBlock = normalizedPlan.blocks[normalizedPlan.blocks.length - 1];
            
            if (lastBlock && (lastBlock.type.toLowerCase().includes('cooldown') || lastBlock.normalized_type === 'COOLDOWN')) {
                // Extend existing cooldown
                lastBlock.duration_sec += shortage;
                lastBlock.duration = `${Math.round(lastBlock.duration_sec / 60)}:${String(lastBlock.duration_sec % 60).padStart(2, '0')}`;
                if (lastBlock.timeline) {
                    lastBlock.timeline.push(`${shortage}s | Extended cooldown`);
                }
            } else {
                // Add a new cooldown block
                normalizedPlan.blocks.push({
                    id: `cooldown-${Date.now()}`,
                    name: 'Extended Cooldown',
                    type: 'Cooldown',
                    normalized_type: 'COOLDOWN',
                    duration: `${Math.round(shortage / 60)}:${String(shortage % 60).padStart(2, '0')}`,
                    duration_sec: shortage,
                    timeline: [`${shortage}s | Cool down and stretch`],
                    rationale: 'Added to meet target class duration',
                    safety: 'Focus on deep breathing and gentle stretching'
                });
            }
            
            adjustedSeconds = shortage;
            strategy = 'added cooldown time';
        }
        
        // Update metadata
        const newTotal = normalizedPlan.blocks.reduce((sum, block) => sum + (block.duration_sec || 0), 0);
        normalizedPlan.metadata.duration_min = Math.round(newTotal / 60);
        
        const message = `Generated class was ${Math.round(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}; normalized to ${Math.round(newTotal / 60)}:${String(newTotal % 60).padStart(2, '0')} by ${strategy}.`;
        
        logger.info('[NORMALIZE] Duration normalization completed', 'Normalization applied', {
            originalSeconds: totalSeconds,
            targetSeconds,
            newSeconds: newTotal,
            adjustedSeconds,
            strategy,
            message
        });
        
        return { plan: normalizedPlan, normalized: true, message };
    }

    public validateWorkoutPlan(plan: EnhancedClassPlan, request: AIGenerationRequest): { isValid: boolean; errors: string[]; warnings?: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];
        const requestedSeconds = request.clarifyingQuestions.classLength * 60;

        if (!plan?.blocks?.length) return { isValid: false, errors: ['No workout blocks generated'] };

        // Check for essential structure
        let hasWarmup = false;
        let hasCooldown = false;
        let hasMainContent = false;

        for (const block of plan.blocks) {
            const type = block.normalized_type || block.type?.toUpperCase();
            if (type === 'WARMUP') hasWarmup = true;
            if (type === 'COOLDOWN') hasCooldown = true;
            if (type && !['WARMUP', 'COOLDOWN', 'TRANSITION'].includes(type)) hasMainContent = true;
        }

        // Warnings for missing structure (not errors for uploaded content)
        if (!hasWarmup) warnings.push('No warmup block detected - consider adding one for safety');
        if (!hasCooldown) warnings.push('No cooldown block detected - consider adding one for recovery');
        if (!hasMainContent) warnings.push('No main workout content detected');

        // Duration validation - very lenient for uploaded content
        let total = 0;
        for (const block of plan.blocks) {
            total += Number(block.duration_sec ?? 0);
        }

        const SOFT_BUFFER_SEC = 300; // ±5 minutes tolerance for uploaded content
        const diff = Math.abs(total - requestedSeconds);

        if (diff > SOFT_BUFFER_SEC * 3) {
            // Only error if extremely off (>15 minutes)
            warnings.push(`Plan duration (${Math.round(total/60)} min) differs significantly from target (${Math.round(requestedSeconds/60)} min) - you may want to adjust`);
        } else if (diff > SOFT_BUFFER_SEC) {
            // Just warn for moderate differences
            warnings.push(`Plan duration (${Math.round(total/60)} min) differs from target (${Math.round(requestedSeconds/60)} min) but is acceptable`);
        }

        // For uploaded content, be very permissive - only fail on critical structural issues
        const isCriticalFailure = plan.blocks.length === 0 ||
                                 plan.blocks.every(block => !block.timeline || block.timeline.length === 0);

        return {
            isValid: !isCriticalFailure,
            errors: isCriticalFailure ? ['Workout structure is incomplete - no valid exercises found'] : [],
            warnings
        };
    }

    async generateWorkout(request: AIGenerationRequest): Promise<AIGenerationResponse> {
        logger.debug('[GENERATE] Starting workout generation', 'Request received', {
            ...request,
            uploadedFiles: request.uploadedFiles?.map(f => ({ name: f.name, size: f.size, type: f.type }))
        });

        try {
            // DEBUG: Log uploaded files info
            console.log('[DEBUG] Uploaded files check:', {
                hasUploadedFiles: !!request.uploadedFiles,
                uploadedFilesLength: request.uploadedFiles?.length || 0,
                hasSerializedFiles: !!request.serializedFiles,
                serializedFilesLength: request.serializedFiles?.length || 0,
                uploadedFilesTypes: request.uploadedFiles?.map((f: any) => typeof f),
                uploadedFilesNames: request.uploadedFiles?.map((f: any) => f?.name || 'NO_NAME')
            });

            // PRIORITY: If uploaded files are present, try parsing them first
            // Check both uploadedFiles (direct) and serializedFiles (from navigation)
            const filesToProcess = request.uploadedFiles || this.deserializeFiles(request.serializedFiles || []);

            if (filesToProcess && filesToProcess.length > 0) {
                logger.info('[GENERATE] Uploaded files detected, attempting direct parsing', 'Parsing uploaded files', {
                    fileCount: filesToProcess.length,
                    fileNames: filesToProcess.map((f: any) => f.name),
                    source: request.uploadedFiles ? 'direct' : 'serialized'
                });

                // Try to parse uploaded files directly into a plan
                const uploadedFiles = filesToProcess as File[];
                const allParsedBlocks: any[] = [];
                const parseErrors: string[] = [];
                let hasValidBlocks = false;

                for (const file of uploadedFiles) {
                    const parseResult = await this.parseUploadedFile(file);
                    if (parseResult.error) {
                        parseErrors.push(`${file.name}: ${parseResult.error}`);
                    } else if (parseResult.blocks && parseResult.blocks.length > 0) {
                        allParsedBlocks.push(...parseResult.blocks);
                        hasValidBlocks = true;
                    }
                }

                // If we successfully parsed blocks, create a plan from them
                if (hasValidBlocks && allParsedBlocks.length > 0) {
                    logger.info('[GENERATE] Successfully parsed uploaded files', 'Creating plan from parsed blocks', {
                        blockCount: allParsedBlocks.length,
                        parseErrors: parseErrors.length
                    });

                    // Create plan from parsed blocks
                    const totalDurationSec = allParsedBlocks.reduce((sum, block) => sum + (block.duration_sec || 300), 0);
                    const parsedPlan: EnhancedClassPlan = {
                        version: 'enhanced',
                        metadata: {
                            class_name: `Uploaded ${request.format || 'Workout'}`,
                            duration_min: Math.round(totalDurationSec / 60),
                            modality: request.format || 'Mixed',
                            level: 'All Levels',
                            intensity_curve: 'Variable',
                            transition_policy: request.clarifyingQuestions.transitionTime === 'manual' ? 'manual' : 'auto',
                            uploaded_files: uploadedFiles.map(f => f.name)
                        },
                        blocks: allParsedBlocks,
                        time_audit: {
                            sum_min: Math.round(totalDurationSec / 60),
                            buffer_min: 0
                        }
                    };

                    // Apply duration normalization first (before validation)
                    const targetSeconds = request.clarifyingQuestions.classLength * 60;
                    const { plan: normalizedPlan, normalized, message: normalizationMessage } = this.normalizeDurations(parsedPlan, targetSeconds);

                    // Validate the normalized plan
                    const { isValid, errors, warnings } = this.validateWorkoutPlan(normalizedPlan, request);

                    if (isValid) {
                        let responseWarning = '';
                        if (parseErrors.length > 0) {
                            responseWarning += `Some files had parsing issues: ${parseErrors.join(', ')}. `;
                        }
                        if (normalized && normalizationMessage) {
                            responseWarning += normalizationMessage;
                        }

                        logger.info('[GENERATE] Successfully generated plan from uploaded files', 'Direct parsing successful', {
                            blockCount: normalizedPlan.blocks.length,
                            totalDuration: normalizedPlan.metadata.duration_min,
                            warnings: responseWarning || undefined
                        });

                        return {
                            success: true,
                            data: normalizedPlan,
                            warning: responseWarning || undefined
                        };
                    } else {
                        // For uploaded content, provide more helpful error with option to proceed
                        let errorMsg = `Uploaded workout parsed successfully but has validation issues: ${errors.join(', ')}.`;

                        // If it's just duration issues, we can still proceed
                        const isDurationIssueOnly = errors.every(error => error.includes('duration'));
                        if (isDurationIssueOnly) {
                            logger.warn('[GENERATE] Duration validation failed but proceeding with parsed plan', 'Duration issues only', {
                                errors,
                                warnings,
                                blockCount: normalizedPlan.blocks.length
                            });

                            return {
                                success: true,
                                data: normalizedPlan,
                                warning: `${errorMsg} The workout has been loaded but may need duration adjustments.`
                            };
                        } else {
                            logger.error('[GENERATE] Parsed plan validation failed', errorMsg, {
                                errors,
                                warnings,
                                blockCount: normalizedPlan.blocks.length
                            });

                            return {
                                success: false,
                                error: `${errorMsg} Please check your workout structure or use the Chat Editor to make adjustments.`
                            };
                        }
                    }
                } else {
                    logger.warn('[GENERATE] No valid blocks parsed from uploaded files, falling back to AI generation', 'Parse failure', {
                        parseErrors
                    });
                    // Continue to AI generation as fallback
                }
            }
            const system = `
**CRITICAL: YOU MUST ONLY OUTPUT JSON - NO TEXT, NO EXPLANATIONS, NO MARKDOWN**

You are a JSON-only generator. Your response must be EXACTLY one valid JSON object and nothing else.

**MANDATORY OUTPUT FORMAT:**
Always output a single JSON object.
Do not include any text before or after.
JSON must include: version, metadata, blocks[], time_audit.

Your output MUST be this exact structure:

{
  "version": "1.0.0",
  "metadata": {
    "class_name": "string",
    "duration_min": number,
    "modality": "string",
    "level": "string"
  },
  "blocks": [
    {
      "id": "string",
      "name": "string",
      "type": "string",
      "normalized_type": "WARMUP" | "INTERVAL" | "COOLDOWN" | "COMBO" | "TABATA" | "EMOM" | "PYRAMID" | "RANDOMIZED" | "LADDER" | "FINISHER",
      "duration": "string",
      "duration_sec": number,
      "timeline": ["string"],
      "rationale": "string",
      "safety": "string"
    }
  ],
  "time_audit": {
    "sum_min": number,
    "buffer_min": number
  }
}

**ABSOLUTE RULES - FAILURE TO FOLLOW WILL INVALIDATE THE OUTPUT:**

1.  **MANDATORY FIELDS**: You MUST generate ALL fields listed in the schema. Do NOT omit any. This includes 'version', 'metadata' (with all its sub-fields), 'blocks' (with all sub-fields for each block), and 'time_audit' (with all sub-fields).
2.  **TYPE vs. NORMALIZED_TYPE**: The 'type' field is a descriptive, free-text string (e.g., "AMRAP SUPERSET"). The 'normalized_type' field MUST be the closest matching value from the allowed enum list: 'WARMUP', 'INTERVAL', 'COOLDOWN', 'COMBO', 'TABATA', 'EMOM', 'PYRAMID', 'RANDOMIZED', 'LADDER', 'FINISHER'.
3.  **TIMELINE IS A STRING ARRAY**: The 'timeline' field MUST be an array of strings, e.g., ["30s | Push-ups", "15s | Rest"]. It can NEVER be an array of objects.
4.  **DUAL DURATION**: Each block MUST have both 'duration' (a string in "mm:ss" format) and 'duration_sec' (an integer representing total seconds).
5.  **VALID JSON ONLY**: Your entire output must be a single, perfectly-formed JSON object. Do not include any text, markdown, or explanations before or after the JSON.
6.  **ERROR ON FAILURE**: If you cannot follow this schema exactly, you MUST return: { "error": "Could not generate valid plan" }.
`;

            // Truncate request to avoid token limits
            const truncatedRequest = this.truncateRequestForAPI(request);
            const userPayload = `Instructor's request:\n${JSON.stringify(truncatedRequest, null, 2)}`;
            logger.debug('[GENERATE] Sending generation request to OpenAI', 'Request sent', {
                system_prompt: system,
                user_prompt: userPayload,
                originalRequestSize: JSON.stringify(request).length,
                truncatedRequestSize: JSON.stringify(truncatedRequest).length
            });

            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: this.model, messages: [{ role: 'system', content: system }, { role: 'user', content: userPayload }], temperature: 0.2, max_tokens: 4096, response_format: { type: 'json_object' } })
            });

            const raw = await res.text();
            if (!res.ok) {
                logger.error('[GENERATE] OpenAI API Error', 'API request failed', { status: res.status, response: raw });
                throw new Error(`OpenAI API Error: ${res.status} ${res.statusText} - ${raw}`);
            }

            const result = JSON.parse(raw);
            const responseText = result.choices?.[0]?.message?.content;
            if (!responseText) {
                logger.error('[GENERATE] No content from AI', 'AI response was empty', { result });
                throw new Error('No content from AI');
            }

            // Log the exact raw response from AI before any processing
            logger.info('[AI RAW GENERATE RESPONSE]', responseText);

            // Pre-validation guard: Try to parse JSON first
            let parsedPlan: any;
            try {
                parsedPlan = JSON.parse(responseText);
            } catch {
                logger.error('[GENERATE] AI returned non-JSON response', 'Parse failed', { responseText });
                return { success: false, error: 'Invalid AI response' };
            }

            // Check for AI error response
            if (parsedPlan.error) {
                return { success: false, error: parsedPlan.error };
            }

            // Pre-validation check: Ensure all top-level fields are present
            if (!parsedPlan.version || !parsedPlan.metadata || !parsedPlan.blocks || !parsedPlan.time_audit) {
                const missingFields = ['version', 'metadata', 'blocks', 'time_audit'].filter(f => !parsedPlan[f]);
                logger.error('[GENERATE] AI response missing required fields', 'Pre-validation failed', { 
                    missingFields, 
                    response: parsedPlan 
                });
                return { success: false, error: 'AI did not return a full workout plan' };
            }

            const validationResult = workoutSchemaV2.safeParse(parsedPlan);

            if (!validationResult.success) {
                logger.error('[GENERATE] Zod validation failed', 'AI response did not match schema', { 
                    errors: validationResult.error,
                    response: parsedPlan
                });
                return { success: false, error: 'AI response failed schema validation' };
            }

            const generatedPlan: EnhancedClassPlan = validationResult.data;
            logger.debug('[GENERATE] Parsed & validated AI plan', 'Validated plan', { generatedPlan });

            const sanitizedPlan = this.sanitizePlan(generatedPlan, request);
            logger.debug('[GENERATE] Sanitized plan', 'Sanitized plan', { sanitizedPlan });

            // Process uploaded files if present
            let planWithUploads = sanitizedPlan;
            if (request.uploadedFiles && request.uploadedFiles.length > 0) {
                planWithUploads = await this.integrateUploadedFiles(sanitizedPlan, request);
            }

            // Insert auto-transitions if specified
            let planWithTransitions = planWithUploads;
            if (request.clarifyingQuestions.transitionTime && 
                typeof request.clarifyingQuestions.transitionTime === 'number' && 
                request.clarifyingQuestions.transitionTime > 0) {
                planWithTransitions = this.insertAutoTransitions(planWithUploads, request.clarifyingQuestions.transitionTime);
            }

            // Apply duration normalization
            const targetSeconds = request.clarifyingQuestions.classLength * 60;
            const { plan: normalizedPlan, normalized, message: normalizationMessage } = this.normalizeDurations(planWithTransitions, targetSeconds);
            
            // Validate the normalized plan
            const { isValid, errors, warnings } = this.validateWorkoutPlan(normalizedPlan, request);
            if (!isValid) {
                const errorMsg = `Validation failed after generation: ${errors.join(', ')}`;
                logger.error('[GENERATE] Validation Failed', errorMsg, { errors });
                return { success: false, error: errorMsg };
            }

            // Prepare response with normalization info
            let responseWarning = '';
            if (normalized && normalizationMessage) {
                responseWarning = normalizationMessage;
                logger.info('[GENERATE] Duration normalization applied', normalizationMessage);
            }
            if (warnings && warnings.length > 0) {
                responseWarning = responseWarning ? `${responseWarning} ${warnings.join(', ')}` : warnings.join(', ');
            }

            logger.debug('[GENERATE] Workout generated and validated successfully', 'Final plan', { finalPlan: normalizedPlan });
            return { 
                success: true, 
                data: normalizedPlan,
                warning: responseWarning || undefined
            };
        } catch (err: any) {
            logger.error('[GENERATE] Generation failed with exception', err?.message || 'Unknown error', { stack: err?.stack });
            return { success: false, error: err?.message || 'Generation failed' };
        }
    }

    private deepMerge(target: any, source: any): any {
        const output = { ...target };
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) Object.assign(output, { [key]: source[key] });
                    else output[key] = this.deepMerge(target[key], source[key]);
                } else if (Array.isArray(source[key]) && Array.isArray(target[key]) && key === 'blocks') {
                    const targetBlocks = target[key].map((b: any) => ({ ...b }));
                    source[key].forEach((sourceBlock: any) => {
                        const targetIndex = targetBlocks.findIndex((tb: any) => tb.id === sourceBlock.id);
                        if (targetIndex !== -1) {
                            targetBlocks[targetIndex] = this.deepMerge(targetBlocks[targetIndex], sourceBlock);
                        } else {
                            targetBlocks.push(sourceBlock);
                        }
                    });
                    output[key] = targetBlocks;
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }

    private isObject(item: any): boolean {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }
    
    public applyLocalEdits(plan: EnhancedClassPlan, message: string): { plan: EnhancedClassPlan, editsApplied: boolean } {
      // This is a placeholder for the original applyLocalEdits logic
      return { plan, editsApplied: false };
    }

    async editWorkout(plan: EnhancedClassPlan, message: string, constraints: any): Promise<AIGenerationResponse> {
        try {
            const system = `
            **CRITICAL INSTRUCTION - NO EXCEPTIONS ALLOWED:**
            
            You are a workout plan editor. Your ONLY acceptable output is the ENTIRE, COMPLETE workout plan as a single JSON object with ALL required fields.
            
            **MANDATORY SCHEMA - YOU MUST RETURN THIS EXACT STRUCTURE:**
            {
              "version": "string",
              "metadata": {
                "class_name": "string",
                "duration_min": number,
                "modality": "string",
                "level": "string"
              },
              "blocks": [
                {
                  "id": "string",
                  "name": "string",
                  "type": "string",
                  "normalized_type": "WARMUP|INTERVAL|COOLDOWN|COMBO|TABATA|EMOM|PYRAMID|RANDOMIZED|LADDER|FINISHER",
                  "duration": "string",
                  "duration_sec": number,
                  "timeline": ["string"],
                  "rationale": "string",
                  "safety": "string"
                }
              ],
              "time_audit": {
                "sum_min": number,
                "buffer_min": number
              }
            }
            
            **ABSOLUTE PROHIBITIONS:**
            - You are FORBIDDEN from returning fragments, diffs, patches, or partial objects
            - You are FORBIDDEN from returning prose, explanations, or markdown
            - You are FORBIDDEN from omitting ANY top-level field (version, metadata, blocks, time_audit)
            - Even for single edits, you MUST return the complete, full workout plan
            
            **FAILURE PROTOCOL:**
            If you cannot produce a valid JSON workout plan in this schema, respond with { "error": "Could not apply edit" } only.
            `;

            const userPayload = `Current plan:\n${JSON.stringify(plan, null, 2)}\n\nInstructor's edit request:\n"${message}"`;

            logger.info('[EDIT] Sending full plan request to OpenAI', 'Request sent', { system_prompt: system, user_prompt: userPayload });

            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: this.model, messages: [{ role: 'system', content: system }, { role: 'user', content: userPayload }], temperature: 0, max_tokens: 4096, response_format: { type: 'json_object' } })
            });

            const raw = await res.text();
            if (!res.ok) throw new Error(`OpenAI API Error: ${res.status} ${res.statusText} - ${raw}`);

            const result = JSON.parse(raw);
            const responseText = result.choices?.[0]?.message?.content;
            if (!responseText) throw new Error('No content from editor');

            // Log the exact raw response from AI before any processing
            logger.info('[AI RAW EDIT RESPONSE]', responseText);

            // Pre-validation guard: Try to parse JSON first
            let editedPlan: any;
            try {
                editedPlan = JSON.parse(responseText);
            } catch {
                return { success: false, error: 'AI did not return JSON at all' };
            }

            // Check for AI error response
            if (editedPlan.error) {
                return { success: false, error: editedPlan.error };
            }

            // Pre-validation check: Ensure all top-level fields are present before sanitizePlan
            if (!editedPlan.version || !editedPlan.metadata || !editedPlan.blocks || !editedPlan.time_audit) {
                const missingFields = ['version', 'metadata', 'blocks', 'time_audit'].filter(f => !editedPlan[f]);
                logger.error('[EDIT] AI response missing required fields', 'Pre-validation failed', { 
                    missingFields, 
                    response: editedPlan 
                });
                return { success: false, error: 'AI did not return a full workout plan' };
            }

            const originalTotalSec = plan.blocks.reduce((acc, b) => acc + b.duration_sec, 0);

            const requestForValidation: AIGenerationRequest = {
                clarifyingQuestions: { classLength: Math.round(originalTotalSec / 60) },
                instructorProfile: { currentFormat: 'bodyweight' }
            };

            const fixed = this.sanitizePlan(editedPlan, requestForValidation);
            
            // Apply duration normalization
            const targetSeconds = originalTotalSec; // Use original plan duration as target
            const { plan: normalizedPlan, normalized, message: normalizationMessage } = this.normalizeDurations(fixed, targetSeconds);
            
            // Validate the normalized plan
            const { isValid, errors, warnings } = this.validateWorkoutPlan(normalizedPlan, requestForValidation);
            if (!isValid) {
                const errorMsg = `Validation failed after edit: ${errors.join(', ')}`;
                return { success: false, error: errorMsg };
            }

            // Prepare response with normalization info
            let responseWarning = '';
            if (normalized && normalizationMessage) {
                responseWarning = normalizationMessage;
                logger.info('[EDIT] Duration normalization applied', normalizationMessage);
            }
            if (warnings && warnings.length > 0) {
                responseWarning = responseWarning ? `${responseWarning} ${warnings.join(', ')}` : warnings.join(', ');
            }

            return { 
                success: true, 
                data: normalizedPlan,
                warning: responseWarning || undefined
            };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Edit failed' };
        }
    }
}