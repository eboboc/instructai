import { AIWorkoutGeneratorService, AIGenerationRequest } from '../src/services/aiWorkoutGenerator.ts';
import { EnhancedClassPlan } from '../src/types/timer.ts';
import * as dotenv from 'dotenv';

dotenv.config();

const service = new AIWorkoutGeneratorService(process.env.VITE_OPENAI_API_KEY || '', undefined, true);

const testPlan: EnhancedClassPlan = {
  version: 'enhanced',
  metadata: {
    class_name: 'Test HIIT Workout',
    duration_min: 10,
    modality: 'HIIT',
    level: 'Intermediate',
    intensity_curve: 'RPE 7/10',
    transition_policy: 'manual',
    impact_level: 'high',
    avoid_list: [],
    equipment: ['bodyweight']
  },
  blocks: [
    {
      id: 'warmup',
      name: 'Dynamic Warm-Up',
      type: 'WARMUP',
      duration: '3 min',
      duration_sec: 180,
      pattern: 'Light cardio + mobility',
      timeline: [
        '60s | Jumping Jacks',
        '60s | Arm Circles',
        '60s | High Knees'
      ],
      cues: [],
      target_muscles: { full_body: 100 }
    },
    {
      id: 'main',
      name: 'Main Workout',
      type: 'AMRAP',
      duration: '5 min',
      duration_sec: 300,
      pattern: 'As Many Rounds As Possible',
      timeline: [
        '300s | 10 Squats, 10 Push-ups, 10 Sit-ups'
      ],
      cues: [],
      target_muscles: { full_body: 100 }
    },
    {
      id: 'cooldown',
      name: 'Cool Down',
      type: 'COOLDOWN',
      duration: '2 min',
      duration_sec: 120,
      pattern: 'Static stretches',
      timeline: [
        '60s | Hamstring Stretch',
        '60s | Quad Stretch'
      ],
      cues: [],
      target_muscles: { full_body: 100 }
    }
  ],
  time_audit: {
    sum_min: 10,
    buffer_min: 0
  }
};

async function runTest() {
  console.log('--- Running Edit Test ---');
  const message = "Replace the first warm-up entry with '30s | Tricep Push-ups'";

  console.log('Warm-up timeline BEFORE edit:', testPlan.blocks[0].timeline);

  const constraints = {
    classTotalSec: 600,
    avoid: [],
    transitionPolicy: 'manual' as 'manual' | 'auto'
  };

  const result = await service.editWorkout(testPlan, message, constraints);

  if (result.success && result.data) {
    console.log('Warm-up timeline AFTER edit:', result.data.blocks[0].timeline);
  } else {
    console.error('Edit failed:', result.error);
  }

  console.log('--- Test Complete ---');
}

runTest();
