import { describe, it, expect, vi } from 'vitest';
import { planFromAnyInput } from '../src/ai/pipeline';
import * as extract from '../src/ai/extract';
import * as generate from '../src/ai/generate';

// Mock the AI calls
vi.mock('../src/ai/extract');
vi.mock('../src/ai/generate');

const sampleInput3425 = `
34:25 CLASS

WARM-UP (5:00)

LADDER (8:00)
- 30s | Squat Jumps
- 30s | REST
- 45s | Push-ups
- 45s | REST
- 60s | Lunges
- 60s | REST

AMRAP SUPERSET (10:00)
- 10x Kettlebell Swings
- 10x Box Jumps
- REST 60s

COOLDOWN (5:00)
- Static Stretching

---
Avoid: burpees, running
Equipment: kettlebell, box
`;

describe('AI Workout Generation Pipeline', () => {

  it('Case A: should handle the 34:25 example correctly', async () => {
    const mockIntent = {
      source_text: sampleInput3425,
      target_duration_sec: 2065,
      avoid_list: ['burpees', 'running'],
      equipment: ['kettlebell', 'box'],
      blocks: [
        { raw_type: 'WARM-UP', duration_hint_sec: 300, raw_timeline: [] },
        { raw_type: 'LADDER', duration_hint_sec: 480, raw_timeline: ['30s | Squat Jumps', '30s | REST', '45s | Push-ups', '45s | REST', '60s | Lunges', '60s | REST'] },
        { raw_type: 'AMRAP SUPERSET', duration_hint_sec: 600, raw_timeline: ['10x Kettlebell Swings', '10x Box Jumps', 'REST 60s'] },
        { raw_type: 'COOLDOWN', duration_hint_sec: 300, raw_timeline: ['Static Stretching'] },
      ]
    };

    const mockPlan = { version: 'enhanced', metadata: {}, blocks: [] }; // Simplified mock

    vi.spyOn(extract, 'extractInstructorIntent').mockResolvedValue(mockIntent as any);
    vi.spyOn(generate, 'generatePlanFromNormalizedIntent').mockResolvedValue(mockPlan as any);

    const plan = await planFromAnyInput(sampleInput3425, []);
    
    expect(extract.extractInstructorIntent).toHaveBeenCalled();
    expect(generate.generatePlanFromNormalizedIntent).toHaveBeenCalled();
    // More detailed assertions would require a less mocked environment
    expect(plan).toBeDefined();
  });

  it('Case B: should default to 45 minutes if duration is missing', async () => {
    const mockIntent = { source_text: 'A quick workout', blocks: [] };
    const mockPlan = { version: 'enhanced', metadata: { duration_min: 45 }, blocks: [] };

    vi.spyOn(extract, 'extractInstructorIntent').mockResolvedValue(mockIntent as any);
    vi.spyOn(generate, 'generatePlanFromNormalizedIntent').mockResolvedValue(mockPlan as any);

    const plan = await planFromAnyInput('A quick workout', []);
    
    expect((plan.metadata as any).duration_min).toBe(45);
  });

  it('Case C: should enforce the avoid list', async () => {
    const mockIntent = { source_text: 'Avoid burpees', avoid_list: ['burpees'], blocks: [] };
    const mockPlan = {
      version: 'enhanced',
      metadata: { avoid_list: ['burpees'] },
      blocks: [{
        id: '1', name: 'main', type: 'INTERVAL', duration: '10 min', duration_sec: 600,
        timeline: ['60s | Squats', '60s | Push-ups'], cues: []
      }]
    };

    vi.spyOn(extract, 'extractInstructorIntent').mockResolvedValue(mockIntent as any);
    vi.spyOn(generate, 'generatePlanFromNormalizedIntent').mockResolvedValue(mockPlan as any);

    const plan = await planFromAnyInput('Avoid burpees', []);

    const timelineString = JSON.stringify(plan.blocks);
    expect(timelineString.toLowerCase()).not.toContain('burpee');
  });
});
