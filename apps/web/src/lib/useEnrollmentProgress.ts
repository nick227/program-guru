import { useProgramLibrary } from '@project/sdk'

/**
 * One reading of a Program run's progress (consolidation MR 6): `completed` of `planned` entries, the
 * share done (clamped to 0–1), its whole percent, and the "3 of 12 done" line. Null when nothing is
 * planned, so no surface shows a 0-of-0 bar. Program page, Home preview, execution, Calendar and
 * My Programs read it and keep their own layouts.
 */
export function runProgress(run: { completed: number; planned: number } | null | undefined) {
  if (!run || run.planned <= 0) return null
  const ratio = Math.min(1, Math.max(0, run.completed / run.planned))
  return {
    completed: run.completed,
    planned: run.planned,
    ratio,
    percent: Math.round(ratio * 100),
    label: `${run.completed} of ${run.planned} done`,
  }
}

/**
 * A Program run's completion progress from the personal library (no extra request when the library
 * is cached). Null for standalone entries, before it loads, or when nothing is planned.
 */
export function useEnrollmentProgress(enrollmentId: string | null | undefined) {
  const library = useProgramLibrary(Boolean(enrollmentId))
  if (!enrollmentId) return null
  for (const entry of library.data ?? []) {
    const progress = runProgress(entry.runs.find((r) => r.id === enrollmentId))
    if (progress) return { ...progress, title: entry.program.title }
  }
  return null
}
