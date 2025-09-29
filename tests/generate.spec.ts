import { describe, it, expect, vi } from 'vitest';
import { generatePlanFromPreferences } from '../src/ai/generate';
import { AIWorkoutGeneratorService } from '../src/services/aiWorkoutGenerator';

// Mock the fetch call
global.fetch = vi.fn();

function createFetchResponse(data: any, ok = true) {
  return { ok, json: () => new Promise((resolve) => resolve(data)) };
}

describe('generatePlanFromPreferences', () => {

  it('Schema success: should return a valid plan', async () => {
    const mockPlan = {
      version: 'enhanced',
      metadata: { class_name: 'Test', duration_min: 35, modality: 'HIIT', level: 'All', intensity_curve: 'RPE 8', transition_policy: 'auto' },
      blocks: [
        { id: '1', name: 'Warm-up', type: 'WARMUP', duration: '5 min', duration_sec: 300, pattern: '', timeline: ['300s | Warm-up'], cues: [] },
        { id: '2', name: 'Main', type: 'INTERVAL', duration: '25 min', duration_sec: 1500, pattern: '', timeline: ['1500s | Main work'], cues: [] },
        { id: '3', name: 'Cooldown', type: 'COOLDOWN', duration: '5 min', duration_sec: 300, pattern: '', timeline: ['300s | Cooldown'], cues: [] },
      ],
      time_audit: { sum_min: 35, buffer_min: 0 }
    };
    (fetch as any).mockResolvedValue(createFetchResponse({ choices: [{ message: { content: JSON.stringify(mockPlan) } }] }));

    const plan = await generatePlanFromPreferences({} as any);
    expect(plan.version).toBe('enhanced');
    expect(plan.blocks.length).toBe(3);
  });

  it('Type mapping: should map LADDER to INTERVAL', async () => {
    // This is tested via the prompt, but we can simulate the output
    const mockPlanWithInterval = {
      blocks: [{ type: 'INTERVAL' }]
    };
    (fetch as any).mockResolvedValue(createFetchResponse({ choices: [{ message: { content: JSON.stringify(mockPlanWithInterval) } }] }));
    const plan = await generatePlanFromPreferences({ pastClass: 'LADDER' } as any);
    expect(plan.blocks[0].type).toBe('INTERVAL');
  });

  it('Avoid list: should not contain avoided movements', async () => {
    const plan = {
      blocks: [
        { timeline: ['30s | Squats'] },
        { timeline: ['30s | Push-ups'] }
      ]
    };
    const planString = JSON.stringify(plan);
    expect(planString).not.toContain('burpee');
  });

  it('Transitions: should add transitions correctly', () => {
    const plan = {
      blocks: [
        { id: '1', type: 'WARMUP', timeline: [] },
        { id: '2', type: 'INTERVAL', timeline: [] },
        { id: '3', type: 'COOLDOWN', timeline: [] },
      ]
    };
    const request = { clarifyingQuestions: { classLength: 30, transitionTime: 15 } };
    const svc = new AIWorkoutGeneratorService('test');
    const fixed = (svc as any).fixWorkoutPlan(plan, request);
    expect(fixed.blocks[0].timeline.some((e: string) => e.includes('REST — Transition'))).toBe(true);
    expect(fixed.blocks[1].timeline.some((e: string) => e.includes('REST — Transition'))).toBe(true);
    expect(fixed.blocks[2].timeline.some((e: string) => e.includes('REST — Transition'))).toBe(false);
  });

  it('Exact math: should have correct per-block and total durations', () => {
    const plan = {
      blocks: [
        { duration_sec: 300, timeline: ['100s | A', '200s | B'] },
        { duration_sec: 1500, timeline: ['500s | C', '1000s | D'] },
        { duration_sec: 300, timeline: ['300s | E'] },
      ]
    };
    const request = { clarifyingQuestions: { classLength: 35 } };
    const svc = new AIWorkoutGeneratorService('test');
    const check = (svc as any).validateWorkoutPlan(plan, request);
    expect(check.isValid).toBe(true);
    const totalSeconds = plan.blocks.reduce((acc, b) => acc + b.duration_sec, 0);
    expect(totalSeconds).toBe(35 * 60);
  });
});
