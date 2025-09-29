// Web Worker for generating workouts in the background
// This ensures the API call continues even when the tab is inactive

// The OpenAI API endpoint
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// Handle messages from the main thread
self.addEventListener('message', async (event) => {
  const { type, apiKey, request, model } = event.data;
  
  if (type === 'GENERATE_WORKOUT') {
    try {
      // Build the prompt
      const systemMessage = buildSystemMessage(request);
      const userMessage = buildUserMessage(request);
      
      // Make the API call
      const response = await fetch(OPENAI_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage }
          ],
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: 4096
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error("No content from AI");
      }
      
      // Parse the JSON response
      const plan = JSON.parse(content);
      
      // Send the result back to the main thread
      self.postMessage({
        type: 'WORKOUT_GENERATED',
        data: plan
      });
    } catch (error) {
      // Send the error back to the main thread
      self.postMessage({
        type: 'WORKOUT_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

// Helper functions to build the prompt
function buildSystemMessage(request) {
  const { clarifyingQuestions } = request;
  const class_len_min = clarifyingQuestions.classLength;
  const class_len_sec = class_len_min * 60;
  
  return `
You are an AI fitness bot that builds live group fitness classes.

Return ONLY JSON. Do not include markdown, code fences, comments, or prose.

CRITICAL WORKOUT STRUCTURE:
- ALWAYS include at least 3-5 blocks for a complete workout
- MUST include a warm-up block (type: 'WARMUP') at the beginning (5-10 min)
- MUST include a cooldown block (type: 'COOLDOWN') at the end (5-10 min)
- MUST include 1-3 main workout blocks in the middle (type: 'INTERVAL', 'COMBO', 'TABATA', or 'EMOM')
- Each block MUST have its own unique 'id', 'name', 'type', 'duration', 'pattern', 'timeline', and 'cues'
- Ensure each block has appropriate exercises that match the block's purpose

CRITICAL MATH REQUIREMENTS (MOST IMPORTANT PART OF THE TASK):
- EXACT MATH IS REQUIRED: Total timeline seconds across ALL blocks MUST EQUAL EXACTLY ${class_len_sec}
- Each block's "duration" must be in format "X min" (e.g., "5 min", "10 min")
- CRITICAL: For each block, the sum of seconds in all timeline entries MUST EQUAL the block's duration in minutes × 60
  Example: If duration is "5 min" (300 seconds), timeline entries must sum to 300 seconds
- Timeline entries must be in format "XXs | Exercise Name" (e.g., "30s | Push-ups")
- DOUBLE CHECK YOUR MATH: Count the seconds in each block and ensure they match the block duration
- TRIPLE CHECK YOUR MATH: Sum all seconds across all blocks and ensure they equal ${class_len_sec}

HARD REQUIREMENTS (TREAT AS CONSTRAINTS):
- Class length is a HARD constraint: Total timeline seconds MUST equal ${class_len_sec} (no more, no less)
- Intensity is a HARD constraint: Reflect the desired effort using RPE ${clarifyingQuestions.intensity}/10 via exercise selection, density, work:rest ratios, and cues
- Never include avoided movements: ${clarifyingQuestions.movesToAvoid || 'none specified'}
- Do not add keys not in schema

STYLE AND INFLUENCE:
- Past Classes should guide style with ~75% influence: preserve block types, pacing, and sequencing patterns
- Questionnaire inputs (length, intensity, etc.) OVERRIDE past style where necessary to satisfy constraints
- When a conflict arises, prefer constraints (length, RPE, avoid list) while keeping the overall style consistent
`.trim();
}

function buildUserMessage(request) {
  const { classDescription, format, clarifyingQuestions, instructorProfile } = request;
  const class_len_min = clarifyingQuestions.classLength;
  const class_len_sec = class_len_min * 60;
  
  const pastClassesContext =
    instructorProfile.pastClasses.length > 0
      ? instructorProfile.pastClasses.slice(0, 3).join('\n\n')
      : 'No past classes available';
  
  return `
Class Idea: ${classDescription}
Class Length: ${class_len_min} minutes (${class_len_sec} seconds total)
Intensity (RPE): ${clarifyingQuestions.intensity}/10
Transition Time: ${clarifyingQuestions.transitionTime === 'manual'
      ? 'Manual start between blocks'
      : `${clarifyingQuestions.transitionTime} seconds`}
Focus Area: ${clarifyingQuestions.bodyFocus} body
Avoid Exercises: ${clarifyingQuestions.movesToAvoid || 'None specified'}
Special Notes: ${clarifyingQuestions.specialNotes || 'None'}

Past Classes:
${pastClassesContext}
`.trim();
}
