import { EnhancedClassPlan } from '@/types/timer';

let _canLoad = false;
let _caller: string | null = null;

/**
 * Gatekeeper function to allow a one-time load of a plan into the timer.
 * This prevents rogue, unexpected calls from automatically navigating.
 */
export function allowTimerLoadOnce(caller: string) {
  _canLoad = true;
  _caller = caller;
}

export async function loadPlanIntoTimer(plan: EnhancedClassPlan): Promise<void> {
  if (!_canLoad) {
    console.group('[TIMER] Blocked unexpected loadPlanIntoTimer call');
    console.warn('A component or service tried to load a plan without explicit UI permission.');
    console.trace('Offending call stack');
    console.groupEnd();
    return;
  }

  console.log(`[TIMER] Loading plan into timer (triggered by: ${_caller})`);

  // Save the plan to sessionStorage for the timer page to pick up
  sessionStorage.setItem('selected_class', JSON.stringify({ plan }));

  // Reset the gate
  _canLoad = false;
  _caller = null;
}
