import type { components } from '@project/sdk'

type S = components['schemas']

/** Where a surfer card came from, in deck order (03-UX §2a). */
export type SurferSource = 'now' | 'radar' | 'upcoming' | 'catalog'

/**
 * One Activity in the Home surfer. A gathering, when present, is a way to do this Activity with
 * others (12 §5a), never its own kind of card. People and counts come only from that gathering.
 */
export interface SurferCard {
  activity: S['ActivitySummary']
  gathering: S['Gathering'] | null
  source: SurferSource
  /** The Radar's first reason, or null. */
  reason: string | null
  /** The viewer's own item that joining would reuse (Radar), or null. */
  calendarItemId: string | null
}

export interface SurferInputs {
  now: S['Gathering'][]
  radar: S['Opportunity'][]
  upcoming: S['Gathering'][]
  catalog: S['ActivitySummary'][]
  limit?: number
}

/**
 * Happening now → Radar → other upcoming public gatherings → varied catalog Activities, each Activity
 * once (its first, best-placed gathering wins). Inputs are already ordered by the server; no ranking here.
 */
export function buildSurferDeck({ now, radar, upcoming, catalog, limit = 40 }: SurferInputs): SurferCard[] {
  const seen = new Set<string>()
  const out: SurferCard[] = []
  const push = (card: SurferCard) => {
    if (out.length >= limit || seen.has(card.activity.id)) return
    seen.add(card.activity.id)
    out.push(card)
  }
  for (const g of now) {
    if (g.activeCount > 0) push({ activity: g.activity, gathering: g, source: 'now', reason: null, calendarItemId: g.viewerCalendarItemId })
  }
  for (const o of radar) {
    if (!o.gathering.isPast) {
      push({
        activity: o.gathering.activity,
        gathering: o.gathering,
        source: 'radar',
        reason: o.reasons[0]?.label ?? null,
        calendarItemId: o.calendarItemId ?? o.gathering.viewerCalendarItemId,
      })
    }
  }
  for (const g of upcoming) {
    if (!g.isPast) push({ activity: g.activity, gathering: g, source: 'upcoming', reason: null, calendarItemId: g.viewerCalendarItemId })
  }
  for (const a of catalog) push({ activity: a, gathering: null, source: 'catalog', reason: null, calendarItemId: null })
  return out
}

/** Moves within the deck without wrapping. */
export function stepIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0
  return Math.min(length - 1, Math.max(0, index + delta))
}

/** A horizontal swipe: left is Next (+1), right is Previous (-1); mostly-vertical drags scroll. */
export function swipeStep(dx: number, dy: number, threshold = 48): -1 | 0 | 1 {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return 0
  return dx < 0 ? 1 : -1
}

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
