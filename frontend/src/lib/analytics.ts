const YM_ID = 109983527

export function trackGoal(goal: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  const ym = (window as any).ym
  if (typeof ym === 'function') {
    ym(YM_ID, 'reachGoal', goal, params)
  }
}
