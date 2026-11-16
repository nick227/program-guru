/**
 * The one Activity session controller (consolidation MR 2): shared by the full Occurrence page and
 * the inline ActivityExecution (Calendar panel, Home stage), so every surface creates, reuses and
 * advances the same session with the same rules. Layout, navigation and toasts stay with each
 * surface; this owns only behavior.
 *
 * - One session per entry: an open session is reused; otherwise one is created with an
 *   idempotency key that lives until it finishes (a double tap never creates two).
 * - Only values the person entered are saved, grouped by step, before any session action; targets
 *   never become recorded results implicitly.
 * - Actions carry the session revision (version check); one action runs at a time.
 */
import { useEffect, useRef, useState } from 'react'
import { useCreateSession, useSaveResults, useSessionAction, type components } from '@project/sdk'
import type { ParticipationStatus } from '@/components/ui/StatusText'

type S = components['schemas']
export type MetricValue = string | number | boolean
export type DirtyResults = Record<string, MetricValue>

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

export const metricKey = (m: S['MetricInput']) => `${m.instructionId ?? ''}:${m.metricDefinitionId}`

export function formatElapsed(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${remainder}s`
  return `${remainder}s`
}

/**
 * Live active time. The server's `activeSeconds` already includes the running stretch up to the
 * response, so only the time since this value arrived is added (never `startedAt`, which would
 * count that stretch twice and also count paused time).
 */
export function useElapsedSeconds(session: S['ActivitySession'] | null | undefined) {
  const [seconds, setSeconds] = useState(session?.activeSeconds ?? 0)
  useEffect(() => {
    setSeconds(session?.activeSeconds ?? 0)
    if (!session || session.status !== 'ACTIVE') return
    const receivedAt = Date.now()
    const timer = window.setInterval(
      () => setSeconds(session.activeSeconds + Math.floor((Date.now() - receivedAt) / 1000)),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [session?.id, session?.status, session?.activeSeconds, session?.revision])
  return seconds
}

export function useActivitySession(o: S['ActivityOccurrence']) {
  const create = useCreateSession(o.item.id)
  const action = useSessionAction(o.item.id)
  const save = useSaveResults(o.item.id)
  const [dirty, setDirty] = useState<DirtyResults>({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const working = useRef(false)
  const createKey = useRef(crypto.randomUUID())
  const created = useRef<S['ActivitySession'] | null>(null)

  const session = o.session
  const resultInputs = o.resultInputs.filter((m) => m.valueType !== 'DURATION')
  const unsaved = Object.keys(dirty).length > 0

  /** The open session, or a new one (created once per attempt). */
  async function getSession() {
    if (session && !['FINISHED', 'ABANDONED'].includes(session.status)) return session
    if (created.current && created.current.id !== session?.id) return created.current
    const next = await create.mutateAsync({ calendarItemId: o.item.id, idempotencyKey: createKey.current })
    created.current = next
    return next
  }

  async function saveDirty(current: S['ActivitySession']) {
    const groups = new Map<string, S['MetricInput'][]>()
    for (const m of resultInputs)
      if (dirty[metricKey(m)] !== undefined) {
        const k = m.instructionId ?? ''
        groups.set(k, [...(groups.get(k) ?? []), m])
      }
    for (const [instructionId, metrics] of groups) {
      await save.mutateAsync({
        sessionId: current.id,
        instructionId: instructionId || null,
        values: metrics.map((m) => ({
          metricDefinitionId: m.metricDefinitionId,
          value: dirty[metricKey(m)]!,
          ...(m.unit ? { unit: m.unit } : {}),
        })),
      })
      setDirty((prev) => {
        const copy = { ...prev }
        metrics.forEach((m) => delete copy[metricKey(m)])
        return copy
      })
    }
  }

  /**
   * Runs `fn` exclusively (one save or action at a time). With `throwIfBusy`, a concurrent call
   * throws (media uploads say so); otherwise it is ignored.
   */
  async function exclusive<T>(fn: () => Promise<T>, { throwIfBusy = false } = {}): Promise<T | undefined> {
    if (working.current) {
      if (throwIfBusy) throw new Error('Wait for the current save to finish.')
      return undefined
    }
    working.current = true
    setBusy(true)
    try {
      return await fn()
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  /**
   * Saves entered values, then applies `nextAction` (if any). Returns whether it succeeded; a
   * failure is kept in `failure` and the entered values stay.
   */
  async function perform(nextAction?: S['SessionAction']): Promise<boolean> {
    setFailure(null)
    const ok = await exclusive(async () => {
      try {
        const current = await getSession()
        await saveDirty(current)
        if (nextAction) {
          await action.mutateAsync({ sessionId: current.id, action: nextAction, expectedRevision: current.revision })
          if (nextAction === 'FINISH') {
            createKey.current = crypto.randomUUID()
            created.current = null
          }
        }
        return true
      } catch (error) {
        setFailure(error)
        return false
      }
    })
    return ok ?? false
  }

  function setMetric(metric: S['MetricInput'], val: MetricValue) {
    const key = metricKey(metric)
    setDirty((prev) => {
      const next = { ...prev }
      if (val === '' && metric.valueType !== 'TEXT') delete next[key]
      else next[key] = val
      return next
    })
  }

  const valueOf = (metric: S['MetricInput']) =>
    dirty[metricKey(metric)] !== undefined ? dirty[metricKey(metric)]! : (metric.recorded ?? null)

  return {
    session,
    resultInputs,
    dirty,
    unsaved,
    busy,
    failure,
    setFailure,
    getSession,
    exclusive,
    perform,
    setMetric,
    valueOf,
    discard: () => setDirty({}),
  }
}
