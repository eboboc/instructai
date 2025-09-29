import { describe, it, expect } from 'vitest';
import { normalizeUploadedFile } from '../src/services/normalizeUploadedFile';

describe('normalizeUploadedFile', () => {
  it('should clean raw PDF text artifacts', () => {
    const rawText = `
Page 1\f
WORKOUT PLAN\r\n
\r
●	Exercise 1\r\n
•	Exercise 2\r\n
*	Exercise 3\r\n
+	Exercise 4\r\n

Page 2
Copyright 2024
    `.trim();

    const result = normalizeUploadedFile(rawText);
    
    // Should remove page numbers, copyright, and normalize bullets
    expect(result).not.toContain('Page 1');
    expect(result).not.toContain('Page 2');
    expect(result).not.toContain('Copyright');
    expect(result).toContain('30s | Exercise 1');
    expect(result).toContain('30s | Exercise 2');
    expect(result).toContain('30s | Exercise 3');
    expect(result).toContain('30s | Exercise 4');
  });

  it('should detect and normalize various block header formats', () => {
    const rawText = `
FIRST BLOCK — Warm-up
- Arm circles
- Leg swings

SHORT BLOCK — Ladder Up & Down
- 1 rep
- 2 reps
- 3 reps

WARMUP
- Joint mobility

Block 2: Main Set
- Burpees
- Push-ups

TABATA
- 20s work
- 10s rest

COOLDOWN
- Stretching
    `.trim();

    const result = normalizeUploadedFile(rawText);
    
    // Should convert to canonical format
    expect(result).toContain('BLOCK 1');
    expect(result).toContain('NAME: Warm-up');
    expect(result).toContain('TYPE: WARMUP');
    expect(result).toContain('DURATION:');
    expect(result).toContain('TIMELINE:');
    
    // Should handle multiple blocks
    expect(result).toMatch(/BLOCK \d+/g);
    expect(result).toContain('TYPE: LADDER');
    expect(result).toContain('TYPE: TABATA');
    expect(result).toContain('TYPE: COOLDOWN');
  });

  it('should normalize timeline items to consistent format', () => {
    const rawText = `
WARMUP
30s | Arm circles
1:30 | Plank hold
45 seconds | Squats
● Jumping jacks
• Mountain climbers
- Push-ups
    `.trim();

    const result = normalizeUploadedFile(rawText);
    
    // Should normalize all timeline items
    expect(result).toContain('- 30s | Arm circles');
    expect(result).toContain('- 1:30 | Plank hold');
    expect(result).toContain('- 45s | Squats');
    expect(result).toContain('- 30s | Jumping jacks');
    expect(result).toContain('- 30s | Mountain climbers');
    expect(result).toContain('- 30s | Push-ups');
  });

  it('should extract duration from context', () => {
    const rawText = `
FIRST BLOCK — Warm-up
Duration: 5:00
- Arm circles
- Leg swings

SHORT BLOCK — Main Set
Total time: 12 minutes
- Burpees
- Push-ups

FINAL BLOCK — Cool Down
3 min
- Stretching
    `.trim();

    const result = normalizeUploadedFile(rawText);
    
    // Should extract durations from various formats
    expect(result).toContain('DURATION: 5:00');
    expect(result).toContain('DURATION: 12:00');
    expect(result).toContain('DURATION: 3:00');
  });

  it('should handle real-world PDF structure', () => {
    const rawText = `
FITNESS CLASS PLAN
Instructor: John Doe
Date: 2024-01-15

WARM-UP BLOCK (5 minutes)
• Dynamic stretching
• Arm circles - 30 seconds
• Leg swings - 30 seconds
• Hip circles - 30 seconds

MAIN WORKOUT - TABATA STYLE (16 minutes)
Work: 20 seconds, Rest: 10 seconds
Round 1:
- Burpees
- Mountain climbers
- Jump squats
- Push-ups

Round 2:
- High knees
- Plank jacks
- Lunges
- Russian twists

COOL DOWN (4 minutes)
• Static stretching
• Child's pose - 60s
• Seated forward fold - 60s
• Deep breathing - 120s

Page 1 of 1
    `.trim();

    const result = normalizeUploadedFile(rawText);
    
    // Should create proper block structure
    expect(result).toContain('BLOCK 1');
    expect(result).toContain('NAME: WARM-UP BLOCK');
    expect(result).toContain('TYPE: WARMUP');
    expect(result).toContain('DURATION: 5:00');
    
    expect(result).toContain('BLOCK 2');
    expect(result).toContain('NAME: MAIN WORKOUT - TABATA STYLE');
    expect(result).toContain('TYPE: TABATA');
    expect(result).toContain('DURATION: 16:00');
    
    expect(result).toContain('BLOCK 3');
    expect(result).toContain('NAME: COOL DOWN');
    expect(result).toContain('TYPE: COOLDOWN');
    expect(result).toContain('DURATION: 4:00');
    
    // Should normalize timeline items
    expect(result).toContain('- 30s | Arm circles');
    expect(result).toContain('- 30s | Leg swings');
    expect(result).toContain('- 60s | Child\'s pose');
    expect(result).toContain('- 120s | Deep breathing');
    
    // Should remove metadata
    expect(result).not.toContain('Instructor: John Doe');
    expect(result).not.toContain('Date: 2024-01-15');
    expect(result).not.toContain('Page 1 of 1');
  });

  it('should handle minimal structure gracefully', () => {
    const rawText = `
Warm up
- Stretching
- Movement prep

Main workout
- Squats
- Push-ups
- Lunges

Cool down
- More stretching
    `.trim();

    const result = normalizeUploadedFile(rawText);
    
    // Should still create some structure
    expect(result).toContain('BLOCK');
    expect(result).toContain('TIMELINE:');
    expect(result).toContain('- 30s | Stretching');
    expect(result).toContain('- 30s | Squats');
  });

  it('should preserve exercise order within blocks', () => {
    const rawText = `
TABATA BLOCK
- First exercise
- Second exercise  
- Third exercise
- Fourth exercise
    `.trim();

    const result = normalizeUploadedFile(rawText);
    
    // Should maintain order
    const lines = result.split('\n');
    const firstIndex = lines.findIndex(line => line.includes('First exercise'));
    const secondIndex = lines.findIndex(line => line.includes('Second exercise'));
    const thirdIndex = lines.findIndex(line => line.includes('Third exercise'));
    const fourthIndex = lines.findIndex(line => line.includes('Fourth exercise'));
    
    expect(firstIndex).toBeLessThan(secondIndex);
    expect(secondIndex).toBeLessThan(thirdIndex);
    expect(thirdIndex).toBeLessThan(fourthIndex);
  });

  it('should handle empty or whitespace-only input', () => {
    expect(normalizeUploadedFile('')).toBe('');
    expect(normalizeUploadedFile('   \n\n   ')).toBe('');
    expect(normalizeUploadedFile('\t\r\n\f')).toBe('');
  });

  it('should collapse excessive whitespace', () => {
    const rawText = `
WARMUP


- Exercise 1


- Exercise 2



COOLDOWN


- Stretch 1
    `.trim();

    const result = normalizeUploadedFile(rawText);
    
    // Should not have excessive blank lines
    expect(result).not.toMatch(/\n\n\n+/);
    // But should preserve paragraph breaks between blocks
    expect(result).toMatch(/BLOCK 1[\s\S]*\n\nBLOCK 2/);
  });
});
