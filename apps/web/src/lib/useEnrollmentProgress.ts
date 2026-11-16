import { useProgramLibrary } from '@project/sdk'

/**
 * A Program run's completion progress from the personal library (no extra request when the library
 * is cached): `completed` of `planned` entries. Null for standalone entries or before it loads.
 */
export function useEnrollmentProgress(enrollmentId: string | null | undefined) {
  const library = useProgramLibrary(Boolean(enrollmentId))
  if (!enrollmentId) return null
  for (const entry of library.data ?? []) {
    const run = entry.runs.find((r) => r.id === enrollmentId)
    if (run && run.planned > 0) return { completed: run.completed, planned: run.planned, title: entry.program.title }
  }
  return null
}
