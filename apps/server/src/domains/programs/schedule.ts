// Automatic scheduling (07-PROGRAMS.md §7). Pure and deterministic: no database access.

export type FrequencyKind = 'DAILY' | 'WEEKDAYS' | 'N_PER_WEEK' | 'FLEXIBLE' | 'CUSTOM'
export type Frequency = { kind: FrequencyKind; n?: number; offsets?: number[] }
export type GenerationMode = 'ALL_EACH_DAY' | 'ROTATE'

export const DEFAULT_FREQUENCY: Frequency = { kind: 'N_PER_WEEK', n: 3 }
export const DEFAULT_DURATION_DAYS = 28
export const DEFAULT_CYCLE_DAYS = 7

const N_PER_WEEK_OFFSETS: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
}

/** Day offsets within each 7-day block counted from Day 1 (index 0). */
export function weeklyOffsets(f: Frequency): number[] {
  switch (f.kind) {
    case 'DAILY':
      return N_PER_WEEK_OFFSETS[7]!
    case 'WEEKDAYS':
      return N_PER_WEEK_OFFSETS[5]!
    case 'N_PER_WEEK':
      return N_PER_WEEK_OFFSETS[Math.min(Math.max(f.n ?? 3, 1), 7)]!
    case 'FLEXIBLE': // a suggestion, labeled as such
      return N_PER_WEEK_OFFSETS[3]!
    case 'CUSTOM': {
      const offsets = [...new Set((f.offsets ?? []).filter((o) => Number.isInteger(o) && o >= 0 && o <= 6))].sort((a, b) => a - b)
      return offsets.length ? offsets : N_PER_WEEK_OFFSETS[3]!
    }
  }
}

export function frequencyLabel(f: Frequency | null): string | null {
  if (!f) return null
  switch (f.kind) {
    case 'DAILY':
      return 'Daily'
    case 'WEEKDAYS':
      return 'Weekdays'
    case 'FLEXIBLE':
      return 'Flexible'
    default:
      return `${weeklyOffsets(f).length} days/week`
  }
}

/** Relative days that receive placements. Ongoing programs (no duration) get one cycle. */
export function programDays(f: Frequency, durationDays: number | null, cycleDays = DEFAULT_CYCLE_DAYS): number[] {
  const span = durationDays ?? cycleDays
  const offsets = weeklyOffsets(f)
  const days: number[] = []
  for (let week = 0; week * 7 < span; week++) {
    for (const o of offsets) {
      const d = week * 7 + o
      if (d < span) days.push(d)
    }
  }
  return days
}

export type GeneratedPlacement = { activityIndex: number; relativeDay: number; position: number }

/**
 * ALL_EACH_DAY puts every selected Activity on every Program Day. ROTATE puts one per day in
 * round-robin order. Example: 3 activities, 3 days/week, 8 weeks → 24 Program Days and
 * 72 placements (ALL_EACH_DAY) or 24 placements (ROTATE).
 */
export function generatePlacements(
  activityCount: number,
  f: Frequency,
  durationDays: number | null,
  mode: GenerationMode,
  cycleDays = DEFAULT_CYCLE_DAYS,
): GeneratedPlacement[] {
  if (activityCount === 0) return []
  const days = programDays(f, durationDays, cycleDays)
  const out: GeneratedPlacement[] = []
  days.forEach((relativeDay, k) => {
    if (mode === 'ROTATE') {
      out.push({ activityIndex: k % activityCount, relativeDay, position: 0 })
    } else {
      for (let a = 0; a < activityCount; a++) out.push({ activityIndex: a, relativeDay, position: a })
    }
  })
  // ROTATE with more Activities than Program Days: every selected Activity still gets a placement,
  // stacked onto the days in order, so nothing silently disappears from the Workspace.
  if (mode === 'ROTATE' && activityCount > days.length) {
    for (let a = days.length; a < activityCount; a++) {
      out.push({ activityIndex: a, relativeDay: days[a % days.length]!, position: Math.floor(a / days.length) })
    }
  }
  return out
}

export function countPlacements(items: { relativeDay: number }[]) {
  return { programDayCount: new Set(items.map((i) => i.relativeDay)).size, placementCount: items.length }
}

export function parseFrequency(json: unknown): Frequency {
  const f = json as Partial<Frequency> | null
  if (!f || typeof f !== 'object' || !f.kind) return DEFAULT_FREQUENCY
  return { kind: f.kind, ...(f.n !== undefined ? { n: f.n } : {}), ...(f.offsets ? { offsets: f.offsets } : {}) }
}
