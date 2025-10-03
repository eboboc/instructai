/**
 * Provides format-specific guidance for workout generation
 */
export function getFormatGuidance(format: string): any {
  // Normalize the format name
  const normalizedFormat = format.toLowerCase().trim();
  
  // Format-specific guidance
  const formatGuidance: Record<string, any> = {
    'hiit': {
      description: 'High Intensity Interval Training',
      structure: [
        { name: 'Warm-up', duration: '10-15%', purpose: 'Prepare the body for intense exercise' },
        { name: 'Work Intervals', duration: '70-80%', purpose: 'Alternate between high-intensity work and recovery periods' },
        { name: 'Cool-down', duration: '5-10%', purpose: 'Gradually reduce heart rate and stretch' }
      ],
      typicalExercises: ['Burpees', 'Mountain Climbers', 'High Knees', 'Jump Squats', 'Plank Jacks'],
      workRestRatio: '30s work / 15s rest or 40s work / 20s rest',
      intensity: 'High with short recovery periods'
    },
    'strength': {
      description: 'Strength and Conditioning',
      structure: [
        { name: 'Warm-up', duration: '10-15%', purpose: 'Dynamic movements to prepare muscles and joints' },
        { name: 'Strength Blocks', duration: '70-80%', purpose: 'Focus on resistance exercises with proper form' },
        { name: 'Cool-down', duration: '5-10%', purpose: 'Static stretching and mobility work' }
      ],
      typicalExercises: ['Push-ups', 'Squats', 'Lunges', 'Planks', 'Dumbbell Rows'],
      setStructure: '3-4 sets of 8-12 reps per exercise',
      intensity: 'Moderate to high with longer rest periods between sets'
    },
    'yoga': {
      description: 'Yoga Flow',
      structure: [
        { name: 'Centering', duration: '5-10%', purpose: 'Connect with breath and set intention' },
        { name: 'Warm-up', duration: '15-20%', purpose: 'Sun salutations and gentle movements' },
        { name: 'Standing Poses', duration: '30-40%', purpose: 'Build strength and focus' },
        { name: 'Floor Poses', duration: '20-30%', purpose: 'Deep stretching and hip openers' },
        { name: 'Final Relaxation', duration: '5-10%', purpose: 'Savasana and meditation' }
      ],
      typicalExercises: ['Downward Dog', 'Warrior Poses', 'Chair Pose', 'Child\'s Pose', 'Savasana'],
      pacing: 'Slow and deliberate movements synchronized with breath',
      intensity: 'Low to moderate with focus on alignment and mindfulness'
    },
    'pilates': {
      description: 'Pilates Method',
      structure: [
        { name: 'Breathing & Centering', duration: '5-10%', purpose: 'Connect with breath and engage core' },
        { name: 'Warm-up', duration: '10-15%', purpose: 'Gentle movements to prepare the body' },
        { name: 'Main Sequence', duration: '60-70%', purpose: 'Core-focused exercises with precision' },
        { name: 'Cool-down', duration: '10-15%', purpose: 'Gentle stretching and release' }
      ],
      typicalExercises: ['The Hundred', 'Roll-ups', 'Single Leg Circles', 'Spine Stretch', 'The Saw'],
      pacing: 'Controlled, precise movements with emphasis on form',
      intensity: 'Low to moderate with focus on control and core engagement'
    },
    'cardio': {
      description: 'Cardiovascular Training',
      structure: [
        { name: 'Warm-up', duration: '10-15%', purpose: 'Gradually increase heart rate' },
        { name: 'Main Cardio Block', duration: '70-80%', purpose: 'Sustained elevated heart rate' },
        { name: 'Cool-down', duration: '10-15%', purpose: 'Gradually decrease heart rate and stretch' }
      ],
      typicalExercises: ['Jumping Jacks', 'High Knees', 'Butt Kicks', 'Skater Hops', 'Jumping Rope'],
      intensity: 'Moderate to high with focus on sustained effort'
    },
    'crossfit': {
      description: 'CrossFit-style Training',
      structure: [
        { name: 'Warm-up', duration: '10-15%', purpose: 'Dynamic movements and mobility work' },
        { name: 'Skill/Strength', duration: '30-40%', purpose: 'Technical movement practice or strength building' },
        { name: 'WOD (Workout of the Day)', duration: '40-50%', purpose: 'High-intensity functional movements' },
        { name: 'Cool-down', duration: '5-10%', purpose: 'Recovery and mobility work' }
      ],
      typicalExercises: ['Thrusters', 'Box Jumps', 'Kettlebell Swings', 'Wall Balls', 'Burpees'],
      workoutTypes: ['AMRAP', 'For Time', 'EMOM', 'Tabata'],
      intensity: 'Very high with focus on performance and completion'
    },
    'bootcamp': {
      description: 'Military-inspired Bootcamp',
      structure: [
        { name: 'Warm-up', duration: '10-15%', purpose: 'Dynamic movements to prepare the body' },
        { name: 'Circuit Training', duration: '70-80%', purpose: 'Rotate through stations of different exercises' },
        { name: 'Finisher', duration: '5-10%', purpose: 'High-intensity challenge to end the workout' },
        { name: 'Cool-down', duration: '5-10%', purpose: 'Recovery and stretching' }
      ],
      typicalExercises: ['Burpees', 'Mountain Climbers', 'Bear Crawls', 'Push-ups', 'Squat Jumps'],
      circuitStructure: '30-60 seconds per station with minimal rest between stations',
      intensity: 'High with team/group motivation'
    }
  };
  
  // Return format-specific guidance or default guidance
  for (const key of Object.keys(formatGuidance)) {
    if (normalizedFormat.includes(key)) {
      return formatGuidance[key];
    }
  }
  
  // Default guidance for any other format
  return {
    description: 'General Fitness Workout',
    structure: [
      { name: 'Warm-up', duration: '10-15%', purpose: 'Prepare the body for exercise' },
      { name: 'Main Workout', duration: '70-80%', purpose: 'Primary exercise focus' },
      { name: 'Cool-down', duration: '10-15%', purpose: 'Recovery and stretching' }
    ],
    typicalExercises: ['Jumping Jacks', 'Squats', 'Push-ups', 'Planks', 'Lunges'],
    intensity: 'Moderate with appropriate progressions and modifications'
  };
}
