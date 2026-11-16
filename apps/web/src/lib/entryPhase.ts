import type { ParticipationStatus } from '@/components/ui/StatusText'

/**
 * One state for a dated entry (consolidation MR 7): its session first (running or paused), then the
 * entry itself. The Occurrence page, the inline execution and Calendar tiles name it with the same
 * words and tone; Calendar adds only its own states (locked, skipped, removed) ahead of it.
 */
export type EntryPhase = 'ready' | 'active' | 'paused' | 'completed' | 'not-participating'

export function entryPhase(itemStatus: string | null | undefined, sessionStatus: string | null | undefined): EntryPhase {
  if (sessionStatus === 'ACTIVE') return 'active'
  if (sessionStatus === 'PAUSED') return 'paused'
  if (itemStatus === 'DONE') return 'completed'
  if (itemStatus === 'NOT_PARTICIPATING') return 'not-participating'
  return 'ready'
}

export const ENTRY_PHASE_LABEL: Record<EntryPhase, string> = {
  ready: 'To do',
  active: 'In progress',
  paused: 'Paused',
  completed: 'Completed',
  'not-participating': 'Not participating',
}

export const ENTRY_PHASE_TONE: Record<EntryPhase, ParticipationStatus> = {
  ready: 'planned',
  active: 'active',
  paused: 'paused',
  completed: 'completed',
  'not-participating': 'unavailable',
}

