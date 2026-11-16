/**
 * Doing an Activity in place (03-UX §5, Calendar inline experience): Preview → Start/Resume →
 * Active (live timer, steps, media, metrics, people) → Complete → Next, on the canonical
 * occurrence/session hooks and mutations (useOccurrence, useCreateSession, useSessionAction,
 * useSaveResults, useUndoCompletion). No second execution engine: the same session the Activity
 * page uses, so the two always agree.
 *
 * Closing never discards unsaved results silently: with unsaved values, every close (Back, the
 * panel's X, Escape) asks Save & close / Discard / Keep editing first. A running session keeps
 * running on the server; reopening resumes it.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ExternalLink, Pause, Play, RotateCcw, SkipForward, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  useActivity,
  useCreateSession,
  useOccurrence,
  useSaveResults,
  useSessionAction,
  useUndoCompletion,
  type components,
} from '@project/sdk'
import { completionOpen, completionOpensLabel } from '@/lib/completionWindow'
import { ActivityInstructions } from '@/components/activity/ActivityInstructions'
import { MetricInput } from '@/components/activity/MetricInput'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { cn } from '@/lib/utils'
import { useEnrollmentProgress } from '@/lib/useEnrollmentProgress'

type S = components['schemas']

export type ActivityExecutionHandle = {
  /** Close through the unsaved-results guard (the host's X, Escape, sheet close). */
  requestClose: () => void
}

export type ActivityExecutionProps = {
  itemId: string
  /** Start the session as soon as it opens (the host's Start button). */
  autoStart?: boolean
  onClose: () => void
  onCompleted?: (title: string) => void
  /** After completing: go to the next entry. Omit when there is none. */
  onNext?: () => void
  nextLabel?: string
  onOpenFullPage: (itemId: string) => void
  onOpenPerson?: (handle: string) => void
  /**
   * `panel` (Calendar): fills the side panel or sheet. `stage` (Home): a centered 620px stage with a
   * full-width hero and a larger title, Home's own presentation of the same execution.
   */
  layout?: 'panel' | 'stage'
  className?: string
}

const metricKey = (m: S['MetricInput']) => `${m.instructionId ?? ''}:${m.metricDefinitionId}`

export function formatElapsed(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${remainder}s`
  return `${remainder}s`
}

const primaryBtn =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-105 disabled:opacity-50'
const secondaryBtn =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-sm font-medium transition hover:bg-surface-muted disabled:opacity-50'

type Dirty = Record<string, string | number | boolean>

const Body = forwardRef<ActivityExecutionHandle, ActivityExecutionProps & { occurrence: S['ActivityOccurrence'] }>(
  function Body({ occurrence: o, autoStart, onClose, onCompleted, onNext, nextLabel, onOpenFullPage, onOpenPerson, layout = 'panel', className }, ref) {
    const queryClient = useQueryClient()
    const create = useCreateSession(o.item.id)
    const action = useSessionAction(o.item.id)
    const save = useSaveResults(o.item.id)
    const undo = useUndoCompletion()
    const activity = useActivity(o.item.locked ? '' : o.item.activityId)

    const [dirty, setDirty] = useState<Dirty>({})
    const [busy, setBusy] = useState(false)
    const [failure, setFailure] = useState<unknown>(null)
    const [confirmingClose, setConfirmingClose] = useState(false)
    const [step, setStep] = useState(0)
    const progress = useEnrollmentProgress(o.item.enrollmentId)
    const working = useRef(false)
    const createKey = useRef(crypto.randomUUID())
    const created = useRef<S['ActivitySession'] | null>(null)
    const autoStarted = useRef(false)

    const session = o.session
    const status = session?.status ?? 'READY'
    const itemDone = o.item.status === 'DONE'
    const phase = status === 'ACTIVE' ? 'active' : status === 'PAUSED' ? 'paused' : itemDone ? 'completed' : 'ready'
    const hasDirty = Object.keys(dirty).length > 0

    const [nowMs, setNowMs] = useState(() => Date.now())
    useEffect(() => {
      if (phase !== 'active') return
      const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
      return () => window.clearInterval(timer)
    }, [phase])
    const elapsed = session
      ? session.activeSeconds +
        (session.status === 'ACTIVE' && session.startedAt
          ? Math.max(0, Math.floor((nowMs - new Date(session.startedAt).getTime()) / 1000))
          : 0)
      : 0

    // Leaving the page with unsaved results asks the browser to confirm too.
    useEffect(() => {
      if (!hasDirty) return
      const onBeforeUnload = (event: BeforeUnloadEvent) => {
        event.preventDefault()
      }
      window.addEventListener('beforeunload', onBeforeUnload)
      return () => window.removeEventListener('beforeunload', onBeforeUnload)
    }, [hasDirty])

    const resultInputs = o.resultInputs.filter((m) => m.valueType !== 'DURATION')
    const instructions = o.instructions?.length ? o.instructions : (activity.data?.instructions ?? [])
    const members = o.collaborators?.members ?? []
    const activeNow = members.filter((m) => m.status === 'IN_PROGRESS').map((m) => m.user)
    const scheduledToday = members.filter((m) => m.status === 'PENDING').map((m) => m.user)
    const completedRecently = members.filter((m) => m.status === 'DONE').map((m) => m.user)
    const people = [...activeNow, ...scheduledToday, ...completedRecently].slice(0, 5)

    const invalidate = () =>
      Promise.all(
        [['calendar'], ['programs'], ['enrollments'], ['occurrences']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      )

    async function getSession() {
      if (session && !['FINISHED', 'ABANDONED'].includes(session.status)) return session
      if (created.current && created.current.id !== session?.id) return created.current
      const next = await create.mutateAsync({ calendarItemId: o.item.id, idempotencyKey: createKey.current })
      created.current = next
      return next
    }

    async function saveDirty(current: S['ActivitySession']) {
      const groups = new Map<string, S['MetricInput'][]>()
      for (const m of resultInputs) {
        if (dirty[metricKey(m)] !== undefined) {
          const k = m.instructionId ?? ''
          groups.set(k, [...(groups.get(k) ?? []), m])
        }
      }
      for (const [instructionId, metrics] of groups) {
        await save.mutateAsync({
          sessionId: current.id,
          instructionId: instructionId || null,
          values: metrics.map((m) => ({ metricDefinitionId: m.metricDefinitionId, value: dirty[metricKey(m)]!, ...(m.unit ? { unit: m.unit } : {}) })),
        })
        setDirty((prev) => {
          const copy = { ...prev }
          metrics.forEach((m) => delete copy[metricKey(m)])
          return copy
        })
      }
    }

    async function perform(nextAction?: S['SessionAction']) {
      if (working.current) return false
      working.current = true
      setBusy(true)
      setFailure(null)
      try {
        const current = await getSession()
        await saveDirty(current)
        if (nextAction) {
          await action.mutateAsync({ sessionId: current.id, action: nextAction, expectedRevision: current.revision })
          if (nextAction === 'FINISH') {
            createKey.current = crypto.randomUUID()
            created.current = null
            toast.success('Activity completed')
            onCompleted?.(o.item.title)
          }
        }
        await invalidate()
        return true
      } catch (error) {
        setFailure(error)
        return false
      } finally {
        working.current = false
        setBusy(false)
      }
    }

    // Start right away when the host's Start opened this (Preview → Start without a second tap).
    useEffect(() => {
      if (autoStart && !autoStarted.current && phase === 'ready' && !o.item.locked) {
        autoStarted.current = true
        void perform('START')
      }
    })

    const requestClose = () => {
      if (hasDirty) setConfirmingClose(true)
      else onClose()
    }
    useImperativeHandle(ref, () => ({ requestClose }))

    async function handleUndo() {
      setFailure(null)
      try {
        await undo.mutateAsync(o.item.id)
        await invalidate()
        toast.success('Completion undone')
      } catch (error) {
        setFailure(error)
      }
    }

    const setMetric = (metric: S['MetricInput'], val: string | number | boolean) => {
      const key = metricKey(metric)
      setDirty((prev) => {
        const next = { ...prev }
        if (val === '' && metric.valueType !== 'TEXT') delete next[key]
        else next[key] = val
        return next
      })
    }

    const programLine = o.item.programTitle
      ? `${o.item.programTitle}${o.item.programDayIndex != null ? ` · Day ${o.item.programDayIndex + 1}` : ''}`
      : null
    const instructionMedia = instructions.flatMap((i) => i.media ?? [])
    const activityMedia = activity.data?.media ?? []
    const primaryMedia = [...instructionMedia, ...activityMedia].find((m) => Boolean(m.thumbnailUrl))
    const heroImageUrl = primaryMedia?.thumbnailUrl ?? o.item.thumbnailUrl ?? null
    const running = phase === 'active' || phase === 'paused'

    return (
      <div className={cn('activity-exec', layout === 'stage' && 'activity-exec--stage', className)}>
        <div className="activity-exec__head">
          <button type="button" onClick={requestClose} className="activity-exec__back">
            <ArrowLeft size={16} aria-hidden />
            <span>Back</span>
          </button>
          <span className={cn('activity-exec__status', phase === 'paused' && 'activity-exec__status--paused', !running && 'activity-exec__status--idle')} aria-live="polite">
            {phase === 'paused' ? 'Paused' : running ? 'In progress' : phase === 'completed' ? 'Completed' : 'Ready'}
          </span>
          {/* Close goes through the same unsaved-results guard as Back. */}
          <button type="button" onClick={requestClose} aria-label="Close" className="activity-exec__close">
            <X size={18} aria-hidden />
          </button>
        </div>

        {confirmingClose && (
          <div className="activity-exec__confirm" role="alertdialog" aria-label="Unsaved results">
            <p className="text-sm font-semibold">You have results that are not saved yet.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className={primaryBtn}
                onClick={async () => {
                  if (await perform()) {
                    setConfirmingClose(false)
                    onClose()
                  }
                }}
              >
                Save and close
              </button>
              <button
                type="button"
                className={secondaryBtn}
                onClick={() => {
                  setDirty({})
                  setConfirmingClose(false)
                  onClose()
                }}
              >
                Discard
              </button>
              <button type="button" className={secondaryBtn} onClick={() => setConfirmingClose(false)}>
                Keep editing
              </button>
            </div>
          </div>
        )}

        {!running && heroImageUrl && (
          <img src={heroImageUrl} alt={primaryMedia?.alt || o.item.title} className="activity-exec__hero" />
        )}

        <div className="activity-exec__title">
          <h2 className={cn('font-display font-semibold tracking-tight', layout === 'stage' ? 'text-2xl' : 'text-xl')}>{o.item.title}</h2>
          <p className="text-sm text-muted">
            {[o.item.durationMinutes ? `${o.item.durationMinutes} min` : null, programLine, progress ? `${progress.completed} of ${progress.planned} done` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        {running && (
          <div className="activity-exec__timer" aria-label={`Elapsed ${formatElapsed(elapsed)}`}>
            <span className="activity-exec__timer-value">{formatElapsed(elapsed)}</span>
            {o.item.durationMinutes ? <span className="activity-exec__timer-of">of {o.item.durationMinutes} min</span> : null}
          </div>
        )}

        {people.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex -space-x-2">
              {people.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => onOpenPerson?.(person.handle)}
                  aria-label={person.displayName}
                  className="rounded-full ring-2 ring-surface"
                >
                  <Avatar src={person.avatarUrl} name={person.displayName} size="sm" />
                </button>
              ))}
            </div>
            <span className="text-xs text-muted">
              {activeNow.length > 0
                ? `${activeNow.length} doing it now`
                : scheduledToday.length > 0
                  ? `${scheduledToday.length} scheduled today`
                  : `${completedRecently.length} completed recently`}
            </span>
          </div>
        )}

        <ErrorMessage error={failure || undo.error} />

        {phase === 'ready' && activity.data?.summary && (
          <p className="text-sm leading-relaxed text-muted">{activity.data.summary}</p>
        )}

        {phase === 'ready' && instructions.length > 0 && (
          <section aria-label="Steps" className="activity-exec__steps activity-exec__steps--preview">
            <ActivityInstructions instructions={instructions} locked={o.item.locked} />
          </section>
        )}

        {/* While doing it: the current step, prominent, with its own media; earlier/later one tap away. */}
        {running && instructions.length > 0 && (() => {
          const at = Math.min(step, instructions.length - 1)
          const current = instructions[at]!
          const media = current.media?.find((m) => m.thumbnailUrl) ?? (at === 0 ? primaryMedia : undefined)
          return (
            <section aria-label="Current step" className="activity-exec__step">
              <p className="activity-exec__step-count">
                Step {at + 1} of {instructions.length}
              </p>
              {media?.thumbnailUrl && <img src={media.thumbnailUrl} alt={media.alt ?? current.title ?? ''} className="activity-exec__media" />}
              {current.title && <h3 className="text-lg font-semibold leading-snug">{current.title}</h3>}
              {current.body && <p className="text-base leading-relaxed">{current.body}</p>}
              {instructions.length > 1 && (
                <div className="activity-exec__step-nav">
                  <button type="button" disabled={at === 0} onClick={() => setStep(at - 1)} className={secondaryBtn}>
                    <ChevronLeft size={16} aria-hidden />
                    Previous step
                  </button>
                  <button type="button" disabled={at === instructions.length - 1} onClick={() => setStep(at + 1)} className={secondaryBtn}>
                    Next step
                    <ChevronRight size={16} aria-hidden />
                  </button>
                </div>
              )}
            </section>
          )
        })()}
        {running && instructions.length === 0 && heroImageUrl && (
          <img src={heroImageUrl} alt={primaryMedia?.alt || o.item.title} className="activity-exec__media" />
        )}

        {running && resultInputs.length > 0 && (
          <section aria-label="Results" className="activity-exec__results">
            {resultInputs.map((metric) => {
              const key = metricKey(metric)
              return (
                <MetricInput
                  key={key}
                  metric={metric}
                  value={dirty[key] !== undefined ? dirty[key] : (metric.recorded ?? null)}
                  disabled={busy}
                  onChange={(v) => setMetric(metric, v)}
                />
              )
            })}
            {hasDirty && <p className="text-xs text-muted">Not saved yet: saved when you pause, finish or choose Save.</p>}
          </section>
        )}

        {phase === 'completed' && (
          <div className="activity-exec__done">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
              <Check size={16} aria-hidden />
              Completed{elapsed > 0 ? ` in ${formatElapsed(elapsed)}` : ''}
            </span>
            {resultInputs.some((m) => m.recorded !== null) && (
              <p className="text-xs text-muted">
                {resultInputs
                  .filter((m) => m.recorded !== null)
                  .map((m) => `${m.label}: ${String(m.recorded)}${m.unit ? ` ${m.unit}` : ''}`)
                  .join(' · ')}
              </p>
            )}
          </div>
        )}

        <div className={cn('activity-exec__actions', running && 'activity-exec__actions--running')}>
          {phase === 'ready' && (
            <button type="button" disabled={busy || o.item.locked} onClick={() => void perform('START')} className={primaryBtn}>
              <Play size={14} className="fill-current" aria-hidden />
              {busy ? 'Starting…' : 'Start'}
            </button>
          )}
          {running && (
            <>
              <button
                type="button"
                disabled={busy || !completionOpen(o.item)}
                title={completionOpensLabel(o.item) ?? undefined}
                onClick={() => void perform('FINISH')}
                className={primaryBtn}
              >
                <Check size={15} aria-hidden />
                {busy ? 'Saving…' : (completionOpensLabel(o.item) ?? 'Finish')}
              </button>
              <button type="button" disabled={busy} onClick={() => void perform(phase === 'active' ? 'PAUSE' : 'RESUME')} className={secondaryBtn}>
                {phase === 'active' ? <Pause size={14} aria-hidden /> : <Play size={14} className="fill-current" aria-hidden />}
                {phase === 'active' ? 'Pause' : 'Resume'}
              </button>
              {hasDirty && (
                <button type="button" disabled={busy} onClick={() => void perform()} className={secondaryBtn}>
                  Save
                </button>
              )}
            </>
          )}
          {phase === 'completed' && (
            <>
              {onNext && (
                <button type="button" onClick={onNext} className={primaryBtn}>
                  <SkipForward size={14} aria-hidden />
                  {nextLabel ?? 'Next'}
                </button>
              )}
              <button type="button" disabled={undo.isPending} onClick={() => void handleUndo()} className={secondaryBtn}>
                <RotateCcw size={14} aria-hidden />
                Undo
              </button>
            </>
          )}
        </div>

        <button type="button" onClick={() => onOpenFullPage(o.item.id)} className="activity-exec__full">
          Open Activity Page
          <ExternalLink size={13} aria-hidden />
        </button>
      </div>
    )
  },
)

/** Loads the occurrence and renders the execution body (or its error with Back). */
export const ActivityExecution = forwardRef<ActivityExecutionHandle, ActivityExecutionProps>(function ActivityExecution(props, ref) {
  const occurrence = useOccurrence(props.itemId)
  const stage = props.layout === 'stage' && 'activity-exec--stage'
  if (occurrence.isPending) return <div className={cn('activity-exec activity-exec--loading', stage)}><Loading /></div>
  if (!occurrence.data)
    return (
      <div className={cn('activity-exec', stage)}>
        <ErrorMessage error={occurrence.error} retry={() => void occurrence.refetch()} />
        <button type="button" onClick={props.onClose} className="activity-exec__back">
          <ArrowLeft size={14} aria-hidden />
          Back
        </button>
      </div>
    )
  return <Body key={props.itemId} ref={ref} occurrence={occurrence.data} {...props} />
})
