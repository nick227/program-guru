import type { components } from '@project/sdk'

type S = components['schemas']

/**
 * Start reuses today's planned personal item of the same Activity (03-UX §2a), the same compatibility
 * rule Join uses (10 §9): PLANNED, not in a Program, not in a gathering.
 */
export function reusableTodayItem(
  items: Pick<S['CalendarItem'], 'id' | 'activityId' | 'status' | 'enrollmentId' | 'gatheringId'>[],
  activityId: string,
): string | null {
  const hit = items.find(
    (i) => i.activityId === activityId && i.status === 'PLANNED' && !i.enrollmentId && !i.gatheringId,
  )
  return hit?.id ?? null
}

/** "4 going · 2 doing it now": real gathering counts only; null without a gathering. */
export function peopleLine(g: Pick<S['Gathering'], 'memberCount' | 'activeCount' | 'capacity'> | null): string | null {
  if (!g || g.memberCount <= 0) return null
  const going = `${g.memberCount}${g.capacity ? ` of ${g.capacity}` : ''} going`
  return g.activeCount > 0 ? `${going} · ${g.activeCount} doing it now` : going
}
