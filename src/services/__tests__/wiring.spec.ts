import { describe, it, expect, beforeEach } from 'vitest';
import { usePlanStore } from '../../state/planStore';
import { EnhancedClassPlan } from '../../ai/zodSchema';

describe('PDF Upload to Generate Wiring', () => {
  beforeEach(() => {
    // Reset store before each test
    usePlanStore.getState().reset();
  });

  it('should store uploaded text and baseline plan', () => {
    const store = usePlanStore.getState();
    
    // Simulate upload pipeline
    const mockText = 'WARMUP (5:00)\n20s | Jumping Jacks\n40s | Rest\n\nMAIN SET (10:00)\n30s | Burpees\n30s | Rest';
    store.setUploadedText(mockText);
    
    const mockPlan: EnhancedClassPlan = {
      version: 'enhanced',
      metadata: {
        class_name: 'Test Workout',
        duration_min: 15,
        modality: 'HIIT',
        level: 'Intermediate',
        intensity_curve: 'Variable',
        transition_policy: 'manual'
      },
      blocks: [
        {
          name: 'Warmup',
          normalized_type: 'WARMUP',
          duration: '5:00',
          duration_sec: 300,
          timeline: [
            { time_s: 20, text: 'Jumping Jacks', original_time: '20s' },
            { time_s: 40, text: 'Rest', original_time: '40s' }
          ]
        },
        {
          name: 'Main Set',
          normalized_type: 'INTERVAL',
          duration: '10:00',
          duration_sec: 600,
          timeline: [
            { time_s: 30, text: 'Burpees', original_time: '30s' },
            { time_s: 30, text: 'Rest', original_time: '30s' }
          ]
        }
      ],
      time_audit: {
        sum_min: 15,
        buffer_min: 0
      }
    };
    
    store.setBaselinePlan(mockPlan, ['Test warning']);
    
    // Verify state
    const state = usePlanStore.getState();
    expect(state.uploadedText).toBe(mockText);
    expect(state.baselinePlan).toEqual(mockPlan);
    expect(state.warnings).toEqual(['Test warning']);
  });

  it('should handle missing baseline plan gracefully', () => {
    const store = usePlanStore.getState();
    
    // No baseline plan set
    expect(store.baselinePlan).toBeNull();
    expect(store.uploadedText).toBeNull();
    expect(store.warnings).toEqual([]);
  });

  it('should reset state correctly', () => {
    const store = usePlanStore.getState();
    
    // Set some state
    store.setUploadedText('test text');
    store.setBaselinePlan({
      version: 'enhanced',
      metadata: {
        class_name: 'Test',
        duration_min: 5,
        modality: 'Test',
        level: 'Test',
        intensity_curve: 'Variable',
        transition_policy: 'manual'
      },
      blocks: [],
      time_audit: { sum_min: 5, buffer_min: 0 }
    });
    
    // Reset
    store.reset();
    
    // Verify reset
    const state = usePlanStore.getState();
    expect(state.uploadedText).toBeNull();
    expect(state.baselinePlan).toBeNull();
    expect(state.warnings).toEqual([]);
  });

  it('should preserve block structure from baseline plan', () => {
    const store = usePlanStore.getState();
    
    const mockPlan: EnhancedClassPlan = {
      version: 'enhanced',
      metadata: {
        class_name: 'Complex Workout',
        duration_min: 45,
        modality: 'Mixed',
        level: 'Advanced',
        intensity_curve: 'Variable',
        transition_policy: 'manual'
      },
      blocks: [
        {
          name: 'Skull Crusher Set',
          normalized_type: 'INTERVAL',
          duration: '8:00',
          duration_sec: 480,
          timeline: [
            { time_s: 45, text: 'Skull Crushers', original_time: '45s' },
            { time_s: 15, text: 'Rest', original_time: '15s' }
          ]
        },
        {
          name: 'Thunder Run Block',
          normalized_type: 'INTERVAL',
          duration: '12:00',
          duration_sec: 720,
          timeline: [
            { time_s: 60, text: 'High Knees', original_time: '1:00' },
            { time_s: 30, text: 'Mountain Climbers', original_time: '30s' }
          ]
        }
      ],
      time_audit: {
        sum_min: 20,
        buffer_min: 0
      }
    };
    
    store.setBaselinePlan(mockPlan);
    
    // Verify the plan preserves arbitrary block names
    const state = usePlanStore.getState();
    expect(state.baselinePlan?.blocks).toHaveLength(2);
    expect(state.baselinePlan?.blocks?.[0]?.name).toBe('Skull Crusher Set');
    expect(state.baselinePlan?.blocks?.[1]?.name).toBe('Thunder Run Block');
    
    // Verify exercises are preserved
    expect(state.baselinePlan?.blocks?.[0]?.timeline?.[0]?.text).toBe('Skull Crushers');
    expect(state.baselinePlan?.blocks?.[1]?.timeline?.[0]?.text).toBe('High Knees');
  });
});
