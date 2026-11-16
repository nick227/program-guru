import type { components } from '@project/sdk'
import { completionOpen, completionOpensLabel } from './completionWindow'
import { entryPhase } from './entryPhase'

type Item = Pick<components['schemas']['CalendarItem'], 'status' | 'locked' | 'localDate' | 'localTime' | 'gatheringId' | 'completionOpensAt'>

/** Shared UI and controller rules for the exact dated entry, never the Activity definition. */
export function resolveSessionEligibility(item: Item, sessionStatus: string | null | undefined, {
  todayIso, online, busy = false, now = Date.now(),
}: { todayIso: string; online: boolean; busy?: boolean; now?: number }) {
  const phase = entryPhase(item.status, sessionStatus)
  const available = online && !busy && !item.locked && !['CANCELLED', 'NOT_PARTICIPATING', 'SKIPPED'].includes(item.status)
  const running = phase === 'active' || phase === 'paused'
  return {
    phase,
    canStart: available && phase === 'ready' && item.localDate <= todayIso,
    canFinish: available && (phase === 'ready' || running) && completionOpen(item, now),
    canPause: available && phase === 'active',
    canResume: available && phase === 'paused',
    canSave: online && !busy && item.status !== 'CANCELLED',
    canUndo: online && !busy && phase === 'completed',
    opensLabel: completionOpensLabel(item),
  }
}

export type SessionEligibility = ReturnType<typeof resolveSessionEligibility>
