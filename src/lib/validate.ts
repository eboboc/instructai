export function validatePlanV2(plan: any, classTotalSec: number) {
  const errors: string[] = [];
  if (!plan?.blocks?.length) errors.push('No blocks');
  if (plan.blocks?.[0]?.type !== 'WARMUP') errors.push('First block must be WARMUP');
  if (plan.blocks?.[plan.blocks.length-1]?.type !== 'COOLDOWN') errors.push('Last block must be COOLDOWN');

  let total = 0;
  for (const b of plan.blocks || []) {
    const sec = (b.timeline||[]).reduce((a: number, e: string)=>{
      const m = e.trim().match(/^(\d+)\s*s\s*\|/i); return a + (m? +m[1] : 0);
    }, 0);
    if (sec !== (b.duration_sec||0)) errors.push(`Block ${b.name} mismatch: ${sec}s vs duration_sec ${(b.duration_sec||0)}s` );
    total += (b.duration_sec||0);
  }
  if (total !== classTotalSec) errors.push(`Total mismatch: ${total}s vs ${classTotalSec}s` );
  return { isValid: errors.length===0, errors };
}
