import { generatePlanFromPreferences } from '../src/ai/generate';
import { AIWorkoutGeneratorService } from '../src/services/aiWorkoutGenerator';
import * as dotenv from 'dotenv';

dotenv.config();

const pastClass = `
LADDER (8:00)
- 30s | Squat Jumps
- 30s | REST
- 45s | Push-ups
- 45s | REST
- 60s | Lunges
- 60s | REST
`;

async function runRepro() {
  const apiKey = process.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    console.error('VITE_OPENAI_API_KEY is not set in your .env file.');
    return;
  }

  console.log('--- Running AI Workout Generation Repro Script ---');
  
  try {
    const plan = await generatePlanFromPreferences({
      prefs: {
        classLengthMin: 35,
        intensityRPE: 8,
        transition: { policy: 'auto', seconds: 15 },
        bodyFocus: 'full',
        movesToAvoid: ['burpees'],
        equipment: ['kettlebell'],
        specialNotes: 'Focus on form over speed.'
      },
      pastClass,
      model: 'gpt-4o-mini',
      apiKey
    });

    const svc = new AIWorkoutGeneratorService(apiKey, undefined, true);
    const clean = (svc as any).normalizePlan(plan);
    const fixed = (svc as any).fixWorkoutPlan(clean, { clarifyingQuestions: { classLength: 35 } } as any);
    const check = (svc as any).validateWorkoutPlan(fixed, { clarifyingQuestions: { classLength: 35, intensity: 8, movesToAvoid: 'burpees' } } as any);

    console.log('\n--- FINAL RESULT ---');
    console.log(`Workout generated successfully!`);
    console.log(`Validation passed: ${check.isValid}`);
    if (!check.isValid) {
      console.error('Validation errors:', check.errors);
    }
    console.log(JSON.stringify(fixed, null, 2));
    const totalSeconds = fixed.blocks.reduce((acc: number, b: any) => acc + b.duration_sec, 0);
    console.log(`\nTotal seconds: ${totalSeconds}`);

  } catch (error: any) {
    console.error('\n--- WORKOUT GENERATION FAILED ---');
    console.error(error.message);
  }
  console.log('--------------------');
}

runRepro();
