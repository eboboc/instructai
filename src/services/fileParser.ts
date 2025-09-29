// Note: For production, install these dependencies:
// npm install pdfjs-dist mammoth tesseract.js
// For now, we'll provide basic text parsing with fallbacks
import { warn, error as logError } from '../utils/logger';

export interface ParseResult {
  ok: boolean;
  text: string;
  meta?: {
    sources: string[];
  };
  blocks?: string[];
  error?: string;
}

/**
 * Parse uploaded files and extract text content
 */
export async function parseFiles(files: File[]): Promise<ParseResult> {
  const allText: string[] = [];
  const sources: string[] = [];

  try {
    for (const file of files) {
      let content = '';
      if (file.type === 'application/pdf') {
        content = await parsePDF(file);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        content = await parseDocx(file);
      } else if (file.type.startsWith('image/')) {
        content = await parseImage(file);
      } else if (file.type === 'text/plain' || file.type === 'text/csv') {
        content = await parseText(file);
      } else {
        warn('fileParser', `Unsupported file type: ${file.type}`);
        continue;
      }

      if (content.trim()) {
        allText.push(content);
        sources.push(file.name);
      }
    }

    const combinedText = allText.join('\n\n').trim();
    const ok = combinedText.length > 0;

    return {
      ok,
      text: combinedText,
      meta: { sources },
      blocks: ok ? extractWorkoutBlocks(combinedText) : [],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
    logError('fileParser', 'Critical error in parseFiles', { error: errorMessage });
    return { ok: false, text: '', error: errorMessage };
  }
}

/**
 * Parse PDF file using PDF.js (fallback implementation)
 */
async function parsePDF(file: File): Promise<string> {
  // Fallback: return filename and basic info
  // In production, implement with pdfjs-dist
  return `PDF file: ${file.name} (${Math.round(file.size / 1024)}KB)\nNote: PDF parsing requires pdfjs-dist library. Please paste content manually.`;
}

/**
 * Parse DOCX file using mammoth (fallback implementation)
 */
async function parseDocx(file: File): Promise<string> {
  // Fallback: return filename and basic info
  // In production, implement with mammoth
  return `DOCX file: ${file.name} (${Math.round(file.size / 1024)}KB)\nNote: DOCX parsing requires mammoth library. Please paste content manually.`;
}

/**
 * Parse plain text or CSV file
 */
async function parseText(file: File): Promise<string> {
  return await file.text();
}

/**
 * Parse image file using OCR (fallback implementation)
 */
async function parseImage(file: File): Promise<string> {
  // Fallback: return filename and basic info
  // In production, implement with tesseract.js
  return `Image file: ${file.name} (${Math.round(file.size / 1024)}KB)\nNote: Image OCR requires tesseract.js library. Please paste content manually.`;
}

/**
 * Parses and sanitizes pasted text.
 */
export function parsePastedText(pasted: string): ParseResult {
  try {
    const text = pasted.trim().replace(/\s+/g, ' ');
    const ok = text.length > 0;
    return {
      ok,
      text,
      meta: { sources: ['pasted_text'] },
      blocks: ok ? extractWorkoutBlocks(text) : [],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
    logError('fileParser', 'Critical error in parsePastedText', { error: errorMessage });
    return { ok: false, text: '', error: errorMessage };
  }
}

/**
 * Extract workout blocks from text content
 * Looks for common workout block patterns
 */
export function extractWorkoutBlocks(text: string): string[] {
  try {
    const blocks: string[] = [];
    const blockKeywords = ['WARMUP', 'WARM-UP', 'LADDER', 'COMBO', 'AMRAP', 'SUPERSET', 'TABATA', 'COOLDOWN', 'COOL-DOWN'];
    const blockRegex = new RegExp(`(?:^|\n)(${blockKeywords.join('|')})[:\s-]*([\s\S]*?)(?=\n(?:${blockKeywords.join('|')})|$)`, 'gi');

    let match;
    while ((match = blockRegex.exec(text)) !== null) {
      const blockContent = match[2].trim();
      if (blockContent.length > 10) { // Only include substantial blocks
        blocks.push(`${match[1].toUpperCase()}: ${blockContent}`);
      }
    }

    // If no keyword blocks found, look for timed lines as a fallback
    if (blocks.length === 0) {
      const timingRegex = /(?:\d{1,2}:\d{2}|\d+\s*(?:min|sec)s?)/i;
      const lines = text.split('\n');
      const timedLines = lines.filter(line => timingRegex.test(line));
      if (timedLines.length > 2) { // Require at least a few timed lines
        return timedLines.map(line => line.trim());
      }
    }

    return blocks;
  } catch (error) {
    logError('fileParser', 'Error extracting workout blocks', { error });
    return []; // Never throw
  }
}

/**
 * Clean and normalize extracted text
 * Remove layout chrome and keep only salient content
 */
