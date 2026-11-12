import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react'
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
import { ActivityInstructions } from '@/components/activity/ActivityInstructions'
import { MetricInput } from '@/components/activity/MetricInput'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorMessage } from '@/components/ui/Feedback'
import type { PreviewTarget } from '../engine/types'
import { TransitionSurface } from './TransitionSurface'

type S = components['schemas']

interface InlineExecutionProps {
  itemId: string
  onClose: () => void
  onCompleted?: (title: string) => void
  onNextSuggestion: () => void
  onOpenFullPage: (itemId: string) => void
  onPreviewCreator: (target: PreviewTarget) => void
}

const metricKey = (m: S['MetricInput']) =>
  `${m.instructionId ?? ''}:${m.metricDefinitionId}`

function formatElapsed(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${remainder}s`
  return `${remainder}s`
}

function ExecutionBody({
  occurrence: o,
  onClose,
  onCompleted,
  onNextSuggestion,
  onOpenFullPage,
  onPreviewCreator,
}: {
  occurrence: S['ActivityOccurrence']
  onClose: () => void
  onCompleted?: (title: string) => void
  onNextSuggestion: () => void
  onOpenFullPage: (itemId: string) => void
  onPreviewCreator: (target: PreviewTarget) => void
}) {
  const queryClient = useQueryClient()
  const create = useCreateSession(o.item.id)
  const action = useSessionAction(o.item.id)
  const save = useSaveResults(o.item.id)
  const undo = useUndoCompletion()
  const activity = useActivity(o.item.locked ? '' : o.item.activityId)

  const [dirty, setDirty] = useState<Record<string, string | number | boolean>>({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const working = useRef(false)
  const createKey = useRef(crypto.randomUUID())
  const created = useRef<S['ActivitySession'] | null>(null)

  const session = o.session
  const status = session?.status ?? 'READY'
  const itemDone = o.item.status === 'DONE'
  const phase =
    status === 'ACTIVE'
      ? 'active'
      : status === 'PAUSED'
        ? 'paused'
        : itemDone
          ? 'completed'
          : 'ready'

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (phase !== 'active') return
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  const liveElapsedSeconds = session
    ? session.activeSeconds +
      (session.status === 'ACTIVE' && session.startedAt
        ? Math.max(
            0,
            Math.floor(
              (nowMs - new Date(session.startedAt).getTime()) / 1000,
            ),
          )
        : 0)
    : 0

  const resultInputs = o.resultInputs.filter((m) => m.valueType !== 'DURATION')
  const instructions = activity.data?.instructions ?? []
  const members = o.collaborators?.members ?? []
  const activeNow = members
    .filter((m) => m.status === 'IN_PROGRESS')
    .map((m) => m.user)
  const scheduledToday = members
    .filter((m) => m.status === 'PENDING')
    .map((m) => m.user)
  const completedRecently = members
    .filter((m) => m.status === 'DONE')
    .map((m) => m.user)
  const collaborators = [...activeNow, ...scheduledToday, ...completedRecently].slice(
    0,
    4,
  )

  async function invalidateSignals() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['calendar'] }),
      queryClient.invalidateQueries({ queryKey: ['programs'] }),
      queryClient.invalidateQueries({ queryKey: ['discover'] }),
      queryClient.invalidateQueries({ queryKey: ['enrollments'] }),
    ])
  }

  async function getSession() {
    if (session && !['FINISHED', 'ABANDONED'].includes(session.status)) {
      return session
    }
    if (created.current && created.current.id !== session?.id) {
      return created.current
    }
    const next = await create.mutateAsync({
      calendarItemId: o.item.id,
      idempotencyKey: createKey.current,
    })
    created.current = next
    return next
  }

  async function perform(nextAction?: S['SessionAction']) {
    if (working.current) return
    working.current = true
    setBusy(true)
    setFailure(null)
    try {
      const current = await getSession()

      // Save any dirty metrics before transitioning session state
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

      if (nextAction) {
        await action.mutateAsync({
          sessionId: current.id,
          action: nextAction,
          expectedRevision: current.revision,
        })
        if (nextAction === 'FINISH') {
          createKey.current = crypto.randomUUID()
          created.current = null
          toast.success('Activity completed')
          onCompleted?.(o.item.title)
        }
      }
      await invalidateSignals()
    } catch (error) {
      setFailure(error)
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  async function handleUndo() {
    setFailure(null)
    try {
      await undo.mutateAsync(o.item.id)
      await invalidateSignals()
      toast.success('Completion undone')
    } catch (error) {
      setFailure(error)
    }
  }

  function handleMetricChange(
    metric: S['MetricInput'],
    val: string | number | boolean,
  ) {
    const key = metricKey(metric)
    setDirty((prev) => {
      const next = { ...prev }
      if (val === '' && metric.valueType !== 'TEXT') {
        delete next[key]
      } else {
        next[key] = val
      }
      return next
    })
  }

  const metaParts = [
    o.item.durationMinutes ? `${o.item.durationMinutes} minutes` : null,
    o.item.programTitle,
  ].filter(Boolean)

  const instructionMedia = instructions.flatMap((i) => i.media ?? [])
  const activityMedia = activity.data?.media ?? []
  const primaryMedia = [...instructionMedia, ...activityMedia].find(
    (m) => Boolean(m.thumbnailUrl),
  )
  const heroImageUrl = primaryMedia?.thumbnailUrl ?? o.item.thumbnailUrl ?? null

  return (
    <div className="mx-auto flex w-full max-w-[620px] flex-col items-center gap-5 px-6 py-8 text-center animate-in fade-in duration-200 motion-reduce:animate-none">
      {phase === 'ready' && heroImageUrl && (
        <img
          src={heroImageUrl}
          alt={primaryMedia?.alt || o.item.title}
          className="mx-auto max-h-56 w-full max-w-md rounded-2xl border border-border/40 object-cover"
        />
      )}

      {(phase === 'active' || phase === 'paused') && (
        <div className="space-y-1">
          <p className="font-display text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">
            {formatElapsed(liveElapsedSeconds)}
          </p>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            {phase === 'paused' ? 'Paused' : 'In progress'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {o.item.title}
        </h1>
        {metaParts.length > 0 && (
          <p className="mx-auto max-w-md text-sm text-muted sm:text-base">
            {metaParts.join(' · ')}
          </p>
        )}
      </div>

      {collaborators.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <div className="flex -space-x-2">
            {collaborators.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() =>
                  onPreviewCreator({ kind: 'creator', handle: person.handle })
                }
                aria-label={`Preview ${person.displayName}`}
                className="rounded-full ring-2 ring-surface transition hover:z-10 hover:scale-105"
              >
                <Avatar
                  src={person.avatarUrl}
                  name={person.displayName}
                  size="sm"
                />
              </button>
            ))}
          </div>
          <span className="text-xs text-muted">
            {activeNow.length > 0
              ? `${activeNow.length} in session now`
              : scheduledToday.length > 0
                ? `${scheduledToday.length} scheduled today`
                : `${completedRecently.length} completed recently`}
          </span>
        </div>
      )}

      <ErrorMessage error={failure || undo.error} />

      {phase === 'ready' && (
        <div className="w-full max-w-md space-y-3">
          {activity.data?.summary && (
            <p className="mx-auto text-sm leading-relaxed text-muted">
              {activity.data.summary}
            </p>
          )}
          {instructions.length > 0 && (
            <p className="text-xs text-muted">
              {instructions.length}{' '}
              {instructions.length === 1 ? 'guided step' : 'guided steps'}
            </p>
          )}
        </div>
      )}

      {(phase === 'active' || phase === 'paused') && (
        <div className="w-full max-w-md space-y-4 border-t border-border/50 pt-4 text-left">
          {heroImageUrl && (
            <img
              src={heroImageUrl}
              alt={primaryMedia?.alt || o.item.title}
              className="mx-auto max-h-40 w-full rounded-xl border border-border/40 object-cover"
            />
          )}

          {instructions.length > 0 && (
            <div className="max-h-48 overflow-y-auto pr-1">
              <ActivityInstructions
                instructions={instructions}
                locked={o.item.locked}
              />
            </div>
          )}

          {resultInputs.length > 0 && (
            <div className="space-y-3">
              {resultInputs.map((metric) => {
                const key = metricKey(metric)
                const val =
                  dirty[key] !== undefined
                    ? dirty[key]
                    : (metric.recorded ?? null)
                return (
                  <MetricInput
                    key={key}
                    metric={metric}
                    value={val}
                    disabled={busy}
                    onChange={(v) => handleMetricChange(metric, v)}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {phase === 'completed' && (
        <div className="w-full max-w-md space-y-1.5 border-y border-border/50 py-4 text-center animate-in fade-in duration-200 motion-reduce:animate-none">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
            <Check size={16} aria-hidden />
            <span>
              Completed
              {liveElapsedSeconds > 0
                ? ` in ${formatElapsed(liveElapsedSeconds)}`
                : ''}
            </span>
          </div>
          {resultInputs.some((m) => m.recorded !== null) && (
            <p className="text-xs text-muted">
              {resultInputs
                .filter((m) => m.recorded !== null)
                .map(
                  (m) =>
                    `${m.label}: ${String(m.recorded)}${m.unit ? ` ${m.unit}` : ''}`,
                )
                .join(' · ')}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
        {phase === 'ready' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void perform('START')}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-105 disabled:opacity-50"
          >
            <Play size={14} className="fill-current" aria-hidden />
            <span>{busy ? 'Starting…' : 'Start'}</span>
          </button>
        )}

        {(phase === 'active' || phase === 'paused') && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void perform('FINISH')}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-105 disabled:opacity-50"
            >
              <Check size={15} aria-hidden />
              <span>{busy ? 'Saving…' : 'Finish'}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void perform(phase === 'active' ? 'PAUSE' : 'RESUME')
              }
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-sm font-medium transition hover:bg-surface-muted disabled:opacity-50"
            >
              {phase === 'active' ? (
                <>
                  <Pause size={14} aria-hidden />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play size={14} className="fill-current" aria-hidden />
                  <span>Resume</span>
                </>
              )}
            </button>
          </>
        )}

        {phase === 'completed' && (
          <>
            <button
              type="button"
              onClick={onNextSuggestion}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-105"
            >
              <span>Next suggestion</span>
            </button>
            <button
              type="button"
              disabled={undo.isPending}
              onClick={() => void handleUndo()}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-sm font-medium transition hover:bg-surface-muted disabled:opacity-50"
            >
              <RotateCcw size={14} aria-hidden />
              <span>Undo</span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => onOpenFullPage(o.item.id)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-xs font-medium text-muted transition hover:text-inherit"
        >
          <span>Open Activity Page</span>
          <ExternalLink size={13} aria-hidden />
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted transition hover:text-inherit"
      >
        <ArrowLeft size={13} aria-hidden />
        <span>Back</span>
      </button>
    </div>
  )
}

/**
 * Self-contained inline Activity execution stage inside Home,
 * reusing the Occurrence session, timer, metrics, completion, and Undo APIs.
 */
export function InlineExecution({
  itemId,
  onClose,
  onCompleted,
  onNextSuggestion,
  onOpenFullPage,
  onPreviewCreator,
}: InlineExecutionProps) {
  const occurrence = useOccurrence(itemId)

  return (
    <TransitionSurface ready={!occurrence.isPending}>
      {!occurrence.data ? (
        <div className="mx-auto flex w-full max-w-[620px] flex-col items-center gap-4 px-6 py-8 text-center">
          <ErrorMessage
            error={occurrence.error}
            retry={() => void occurrence.refetch()}
          />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted transition hover:text-inherit"
          >
            <ArrowLeft size={13} aria-hidden />
            <span>Back</span>
          </button>
        </div>
      ) : (
        <ExecutionBody
          key={itemId}
          occurrence={occurrence.data}
          onClose={onClose}
          onCompleted={onCompleted}
          onNextSuggestion={onNextSuggestion}
          onOpenFullPage={onOpenFullPage}
          onPreviewCreator={onPreviewCreator}
        />
      )}
    </TransitionSurface>
  )
}
