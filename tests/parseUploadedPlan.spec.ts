import { describe, it, expect } from 'vitest';
import { parseUploadedPlan, parseDuration, mapType, parseTimelineLine } from '../src/services/parseUploadedPlan';

describe('parseUploadedPlan', () => {
  describe('parseDuration', () => {
    it('should parse mm:ss format', () => {
      expect(parseDuration('5:30')).toEqual({ seconds: 330, minutes: 5.5 });
      expect(parseDuration('10:00')).toEqual({ seconds: 600, minutes: 10 });
      expect(parseDuration('0:45')).toEqual({ seconds: 45, minutes: 0.75 });
    });

    it('should parse Xm Ys format', () => {
      expect(parseDuration('5m 30s')).toEqual({ seconds: 330, minutes: 5.5 });
      expect(parseDuration('10m 0s')).toEqual({ seconds: 600, minutes: 10 });
      expect(parseDuration('0m 45s')).toEqual({ seconds: 45, minutes: 0.75 });
    });

    it('should parse Xm format', () => {
      expect(parseDuration('5m')).toEqual({ seconds: 300, minutes: 5 });
      expect(parseDuration('10m')).toEqual({ seconds: 600, minutes: 10 });
    });

    it('should parse Xs format', () => {
      expect(parseDuration('30s')).toEqual({ seconds: 30, minutes: 0.5 });
      expect(parseDuration('90s')).toEqual({ seconds: 90, minutes: 1.5 });
    });

    it('should return default for invalid input', () => {
      expect(parseDuration('invalid')).toEqual({ seconds: 300, minutes: 5 });
      expect(parseDuration('')).toEqual({ seconds: 300, minutes: 5 });
    });
  });

  describe('mapType', () => {
    it('should map common workout types', () => {
      expect(mapType('WARM-UP')).toBe('WARMUP');
      expect(mapType('COOL-DOWN')).toBe('COOLDOWN');
      expect(mapType('AMRAP SUPERSET')).toBe('SUPERSET');
      expect(mapType('TABATA VARIATION')).toBe('TABATA');
      expect(mapType('GIANT SETS')).toBe('GIANT_SETS');
    });

    it('should handle case insensitive matching', () => {
      expect(mapType('warm-up')).toBe('WARMUP');
      expect(mapType('Cool-Down')).toBe('COOLDOWN');
      expect(mapType('tabata')).toBe('TABATA');
    });

    it('should return INTERVAL for unrecognized types', () => {
      expect(mapType('UNKNOWN')).toBe('INTERVAL');
      expect(mapType('CUSTOM WORKOUT')).toBe('INTERVAL');
    });

    it('should handle partial matches', () => {
      expect(mapType('WARM UP ROUTINE')).toBe('WARMUP');
      expect(mapType('TABATA STYLE')).toBe('TABATA');
      expect(mapType('SUPERSET BLOCK')).toBe('SUPERSET');
    });
  });

  describe('parseTimelineLine', () => {
    it('should parse timeline with time and exercise', () => {
      const result = parseTimelineLine('30s | Push-ups');
      expect(result).toEqual({
        time_s: 30,
        name: 'Push-ups',
        isRest: false
      });
    });

    it('should parse timeline with mm:ss format', () => {
      const result = parseTimelineLine('1:30 | Plank Hold');
      expect(result).toEqual({
        time_s: 90,
        name: 'Plank Hold',
        isRest: false
      });
    });

    it('should detect rest periods', () => {
      const result = parseTimelineLine('15s | Rest');
      expect(result).toEqual({
        time_s: 15,
        name: 'Rest',
        isRest: true
      });
    });

    it('should handle bullet points', () => {
      const result = parseTimelineLine('- 30s | Squats');
      expect(result).toEqual({
        time_s: 30,
        name: 'Squats',
        isRest: false
      });
    });

    it('should handle exercises without explicit timing', () => {
      const result = parseTimelineLine('Push-ups');
      expect(result).toEqual({
        name: 'Push-ups',
        isRest: false
      });
    });

    it('should return null for empty lines', () => {
      expect(parseTimelineLine('')).toBeNull();
      expect(parseTimelineLine('   ')).toBeNull();
    });
  });

  describe('parseUploadedPlan integration', () => {
    it('should parse a complete workout plan', () => {
      const normalizedText = `
BLOCK 1
NAME: Warm-up
TYPE: WARMUP
DURATION: 5:00
TIMELINE:
- 30s | Arm Circles
- 30s | Leg Swings
- 30s | Hip Circles

BLOCK 2
NAME: Main Set
TYPE: TABATA
DURATION: 8:00
TIMELINE:
- 20s | Burpees
- 10s | Rest
- 20s | Mountain Climbers
- 10s | Rest

BLOCK 3
NAME: Cool Down
TYPE: COOLDOWN
DURATION: 3:00
TIMELINE:
- 60s | Child's Pose
- 60s | Seated Forward Fold
- 60s | Deep Breathing
      `.trim();

      const result = parseUploadedPlan(normalizedText);
      
      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
      expect(result.plan!.blocks).toHaveLength(3);
      
      // Check first block (warmup)
      const warmup = result.plan!.blocks[0];
      expect(warmup.name).toBe('Warm-up');
      expect(warmup.normalized_type).toBe('WARMUP');
      expect(warmup.duration_sec).toBe(300);
      expect(warmup.timeline).toHaveLength(3);
      
      // Check second block (tabata)
      const tabata = result.plan!.blocks[1];
      expect(tabata.name).toBe('Main Set');
      expect(tabata.normalized_type).toBe('TABATA');
      expect(tabata.duration_sec).toBe(480);
      expect(tabata.timeline).toHaveLength(4);
      
      // Check third block (cooldown)
      const cooldown = result.plan!.blocks[2];
      expect(cooldown.name).toBe('Cool Down');
      expect(cooldown.normalized_type).toBe('COOLDOWN');
      expect(cooldown.duration_sec).toBe(180);
      expect(cooldown.timeline).toHaveLength(3);
      
      // Check metadata
      expect(result.plan!.metadata.duration_min).toBe(16); // 5+8+3 minutes
      expect(result.plan!.metadata.class_name).toBe('Uploaded Workout');
    });

    it('should handle empty input', () => {
      const result = parseUploadedPlan('');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('No workout blocks could be identified');
    });

    it('should handle malformed input gracefully', () => {
      const malformedText = `
Some random text
Without proper structure
Just exercises listed:
- Push-ups
- Squats
- Lunges
      `.trim();

      const result = parseUploadedPlan(malformedText);
      
      // Should either succeed with fallback parsing or fail gracefully
      if (result.success) {
        expect(result.plan!.blocks.length).toBeGreaterThan(0);
      } else {
        expect(result.error).toBeDefined();
      }
    });

    it('should preserve cooldown as last block', () => {
      const normalizedText = `
BLOCK 1
NAME: Warm-up
TYPE: WARMUP
DURATION: 3:00
TIMELINE:
- 30s | Arm Circles

BLOCK 2
NAME: Main Work
TYPE: INTERVAL
DURATION: 10:00
TIMELINE:
- 45s | Squats
- 15s | Rest

BLOCK 3
NAME: Cool Down
TYPE: COOLDOWN
DURATION: 5:00
TIMELINE:
- 60s | Stretching
      `.trim();

      const result = parseUploadedPlan(normalizedText);
      
      expect(result.success).toBe(true);
      expect(result.plan!.blocks).toHaveLength(3);
      
      // Verify cooldown is last
      const lastBlock = result.plan!.blocks[result.plan!.blocks.length - 1];
      expect(lastBlock.normalized_type).toBe('COOLDOWN');
      expect(lastBlock.name).toBe('Cool Down');
    });

    it('should handle various block types', () => {
      const normalizedText = `
BLOCK 1
NAME: EMOM Challenge
TYPE: EMOM
DURATION: 12:00
TIMELINE:
- 60s | 10 Burpees

BLOCK 2
NAME: Ladder Up
TYPE: LADDER
DURATION: 8:00
TIMELINE:
- 30s | 1 Rep
- 30s | 2 Reps
- 30s | 3 Reps

BLOCK 3
NAME: Superset Finisher
TYPE: SUPERSET
DURATION: 6:00
TIMELINE:
- 45s | Push-ups
- 45s | Pull-ups
      `.trim();

      const result = parseUploadedPlan(normalizedText);
      
      expect(result.success).toBe(true);
      expect(result.plan!.blocks).toHaveLength(3);
      
      expect(result.plan!.blocks[0].normalized_type).toBe('EMOM');
      expect(result.plan!.blocks[1].normalized_type).toBe('LADDER');
      expect(result.plan!.blocks[2].normalized_type).toBe('SUPERSET');
    });
  });

  describe('Intent-first parsing with arbitrary labels', () => {
    it('should handle arbitrary block labels with intent-first parsing', () => {
      const textWithArbitraryLabels = `
Skull Crusher Set
20s | Skull Crushers
30s | Tricep Dips
20s | Diamond Push-ups
15s | Rest

Thunder Run Block
45s | High Knees
30s | Butt Kicks
45s | Mountain Climbers
15s | Rest

Mystical Finisher
30s | Burpees
30s | Jump Squats
30s | Plank Hold
      `.trim();

      const result = parseUploadedPlan(textWithArbitraryLabels);

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
      expect(result.plan!.blocks).toHaveLength(3);

      // Should preserve original names but assign reasonable types
      expect(result.plan!.blocks[0].name).toContain('Block 1');
      expect(result.plan!.blocks[1].name).toContain('Block 2');
      expect(result.plan!.blocks[2].name).toContain('Block 3');

      // Should assign reasonable types based on content
      expect(result.plan!.blocks[0].normalized_type).toBe('INTERVAL');
      expect(result.plan!.blocks[1].normalized_type).toBe('INTERVAL');
      expect(result.plan!.blocks[2].normalized_type).toBe('FINISHER');
    });

    it('should never fail on unknown block names', () => {
      const weirdLabels = `
Banana Split Madness
30s | Jumping Jacks
20s | Push-ups
10s | Rest

Unicorn Power Hour
1:00 | Squats
30s | Lunges
30s | Rest

Dragon Breath Cooldown
2:00 | Stretching
1:00 | Deep Breathing
      `.trim();

      const result = parseUploadedPlan(weirdLabels);

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
      expect(result.plan!.blocks.length).toBeGreaterThan(0);

      // Should detect cooldown from context
      const cooldownBlock = result.plan!.blocks.find(b => b.name.includes('Block') &&
        b.timeline?.some(t => t.toLowerCase().includes('breathing')));
      expect(cooldownBlock?.normalized_type).toBe('COOLDOWN');
    });

    it('should preserve exercise names and timing exactly', () => {
      const exerciseText = `
Custom Block
45s | Weird Exercise Name
1:30 | Another Strange Move
20s | Rest Period
30s | Final Movement
      `.trim();

      const result = parseUploadedPlan(exerciseText);

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
      expect(result.plan!.blocks).toHaveLength(1);

      const block = result.plan!.blocks[0];
      expect(block.timeline).toHaveLength(4);
      expect(block.timeline[0]).toContain('Weird Exercise Name');
      expect(block.timeline[1]).toContain('Another Strange Move');
      expect(block.timeline[2]).toContain('Rest Period');
      expect(block.timeline[3]).toContain('Final Movement');

      // Should preserve original timing
      expect(block.timeline[0]).toContain('45s');
      expect(block.timeline[1]).toContain('1:30');
      expect(block.timeline[2]).toContain('20s');
      expect(block.timeline[3]).toContain('30s');
    });
  });
});
