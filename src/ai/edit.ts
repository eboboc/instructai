import { workoutSchemaV2 } from '@/ai/generate';

export async function editPlanWithMessage({ plan, message, constraints }: any) {
  const system = `You are an editor for EnhancedClassPlan v2. Apply the user edit to the provided plan. Preserve exact math and class total unless the user explicitly changes duration. Keep WARMUP first and COOLDOWN last. Respect avoid list and transition policy. Return ONLY JSON; match schema exactly.` ;

  const user = {
    plan,
    edit_message: message,
    constraints
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.VITE_OPENAI_API_KEY}`  },
    body: JSON.stringify({
      model: process.env.VITE_OPENAI_MODEL || 'gpt-4o-mini',
      messages: [ { role:'system', content: system }, { role:'user', content: JSON.stringify(user) } ],
      response_format: { type: 'json_schema', json_schema: workoutSchemaV2.schema },
      temperature: 0,
      max_tokens: 8192
    })
  });

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content from editor');
  return JSON.parse(content);
}
