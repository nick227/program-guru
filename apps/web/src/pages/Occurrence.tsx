import { formatDurationMinutes } from '@/lib/durationMinutes'
import { usePwaReloadBlocker } from '@/lib/pwaSafety'
import { useEffect, useRef, useState } from 'react'
import {
  useBeforeUnload,
  useBlocker,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import {
  useCreateSession,
  useCurrentUser,
  useAttachSessionMedia,
  getOrCreateSessionResultEntry,
  useOccurrence,
  useSaveResults,
  useSessionAction,
  useUndoCompletion,
  useActivity,
  type components,
} from '@project/sdk'
import { toast } from 'sonner'
import {
  Calendar,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Flame,
  Pause,
  Play,
  RotateCcw,
  Target,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react'
import { Page, Panel, Stack } from '@/components/ui/Layout'
import { StatusText, type ParticipationStatus } from '@/components/ui/StatusText'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import { CategoryIcon } from '@/components/shared/CategoryIcon'
import { activityHero } from '@/lib/hero'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back } from '@/components/shared/Navigation'
import { MetricInput } from '@/components/activity/MetricInput'
import { ActivityTogether } from '@/components/activity/ActivityTogether'
import { OccurrenceInstructions } from '@/components/activity/OccurrenceInstructions'
import { OccurrenceMedia } from '@/components/activity/OccurrenceMedia'
import { calendarUrl, dateLabel, safeReturn, today } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { cn } from '@/lib/utils'

type S = components['schemas']

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

export function OccurrencePage() {
  const { id = '' } = useParams()
  const occurrence = useOccurrence(id)
  useDocumentTitle(
    occurrence.data
      ? `${occurrence.data.item.title}${
          occurrence.data.item.programDayIndex !== null
            ? ` (Day ${occurrence.data.item.programDayIndex + 1})`
            : ''
        }`
      : 'Occurrence',
  )
  return (
    <Page className="page--content">
      <div>
        <ErrorMessage
          error={occurrence.error}
          retry={() => void occurrence.refetch()}
        />
        {occurrence.data ? (
          <OccurrenceContent
            key={id}
            occurrence={occurrence.data}
            refresh={() => void occurrence.refetch()}
          />
        ) : occurrence.isPending ? (
          <Loading />
        ) : (
          <Back to="/">Calendar</Back>
        )}
      </div>
    </Page>
  )
}

type PendingButton =
  | 'start'
  | 'finish'
  | 'finish-no-timer'
  | 'pause'
  | 'resume'
  | 'save'
  | null

function OccurrenceContent({
  occurrence: o,
  refresh,
}: {
  occurrence: S['ActivityOccurrence']
  refresh: () => void
}) {
  const [params] = useSearchParams()
  const origin = safeReturn(
    params.get('returnTo'),
    calendarUrl(o.item.localDate),
  )
  const online = useOnline()
  const create = useCreateSession(o.item.id)
  const action = useSessionAction(o.item.id)
  const save = useSaveResults(o.item.id)
  const undo = useUndoCompletion()
  const attach = useAttachSessionMedia()
  const me = useCurrentUser()
  const activity = useActivity(o.item.locked ? '' : o.item.activityId)

  const [dirty, setDirty] = useState<Record<string, string | number | boolean>>(
    {},
  )
  const [busy, setBusy] = useState(false)
  const [pendingButton, setPendingButton] = useState<PendingButton>(null)
  const [failure, setFailure] = useState<unknown>(null)
  const working = useRef(false)
  const createKey = useRef(crypto.randomUUID())
  const created = useRef<S['ActivitySession'] | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const unsaved = Object.keys(dirty).length > 0

  usePwaReloadBlocker(unsaved || busy)
  const blocker = useBlocker(() => unsaved || busy)
  useBeforeUnload((event) => {
    if (unsaved || busy) {
      event.preventDefault()
      event.returnValue = ''
    }
  })

  const session = o.session
  const status = session?.status ?? 'READY'
  const disabled = busy || !online
  const resultInputs = o.resultInputs.filter(
    (metric) => metric.valueType !== 'DURATION',
  )

  async function getSession() {
    if (session && !['FINISHED', 'ABANDONED'].includes(session.status))
      return session
    if (created.current && created.current.id !== session?.id)
      return created.current
    const next = await create.mutateAsync({
      calendarItemId: o.item.id,
      idempotencyKey: createKey.current,
    })
    created.current = next
    return next
  }

  /** Personal media goes to the current attempt, creating an unstarted one if needed. */
  async function attachToSession(mediaId: string) {
    if (!online) throw new Error('Connect to attach media.')
    if (working.current) throw new Error('Wait for the current save to finish.')
    working.current = true
    setBusy(true)
    try {
      const current =
        o.session && o.session.status !== 'ABANDONED'
          ? o.session
          : await getSession()
      await attach.mutateAsync({ mediaId, sessionId: current.id })
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  async function prepareMediaUpload(): Promise<S['AttachmentTarget']> {
    if (!online) throw new Error('Connect to upload media.')
    if (working.current) throw new Error('Wait for the current save to finish.')
    working.current = true
    setBusy(true)
    try {
      const current =
        o.session && o.session.status !== 'ABANDONED'
          ? o.session
          : await getSession()
      return {
        kind: 'RESULT_ENTRY',
        id: await getOrCreateSessionResultEntry(current.id),
      }
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  async function perform(
    nextAction?: S['SessionAction'],
    button: PendingButton = null,
  ) {
    if (working.current) return
    working.current = true
    setBusy(true)
    setPendingButton(button)
    setFailure(null)
    try {
      const current = await getSession()
      // Only user-entered values are written. Targets never become recorded results implicitly.
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
      if (nextAction) {
        await action.mutateAsync({
          sessionId: current.id,
          action: nextAction,
          expectedRevision: current.revision,
        })
        if (nextAction === 'FINISH') {
          createKey.current = crypto.randomUUID()
          created.current = null
          toast.success('Activity finished')
        }
      } else toast.success('Results saved')
    } catch (error) {
      setFailure(error)
    } finally {
      working.current = false
      setBusy(false)
      setPendingButton(null)
    }
  }

  function handleMetricChange(metric: S['MetricInput'], val: string | number | boolean) {
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

  function triggerMediaUpload() {
    const input = uploadInputRef.current
    if (input) {
      input.click()
      return
    }
    document.getElementById('related-media')?.scrollIntoView({ behavior: 'smooth' })
  }

  // One state for the whole page, so the header and the session never disagree.
  const itemDone = o.item.status === 'DONE'
  const phase: Phase =
    status === 'ACTIVE'
      ? 'active'
      : status === 'PAUSED'
        ? 'paused'
        : itemDone
          ? 'completed'
          : o.item.status === 'NOT_PARTICIPATING'
            ? 'not-participating'
            : 'ready'
  const timed = o.resultInputs.some((metric) => metric.valueType === 'DURATION')
  const community = o.communityStats
  const communityLine = community
    ? [
        community.participants ? `${community.participants} participants` : null,
        community.completions ? `${community.completions} completions` : null,
        community.publicMediaCount ? `${community.publicMediaCount} public media` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const viewerTz =
    me.data?.data.preferences.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone
  const isToday = o.item.localDate === today(viewerTz)

  return (
    <div className="activity-page">
      <Back to={origin}>
        {origin.startsWith('/library')
          ? 'My Programs'
          : origin.startsWith('/programs/')
            ? 'Program'
            : 'Calendar'}
      </Back>
      {blocker.state === 'blocked' && (
        <Panel aria-label="Unsaved results">
          <Stack>
            <p>
              {busy
                ? 'Wait for the current save to finish.'
                : 'You have unsaved results.'}
            </p>
            <Button autoFocus onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => blocker.proceed?.()}
            >
              Discard changes and leave
            </Button>
          </Stack>
        </Panel>
      )}

      {/* 1 · Hero Identity Card */}
      <ActivityIdentity
        occurrence={o}
        activity={activity.data}
        phase={phase}
        isToday={isToday}
        session={session}
        timed={timed}
        disabled={disabled}
        pendingButton={pendingButton}
        online={online}
        unsaved={unsaved}
        error={failure || undo.error}
        undoPending={undo.isPending}
        onPerform={(nextAction, button) => void perform(nextAction, button)}
        onUndo={() => undo.mutate(o.item.id)}
        onRefresh={refresh}
        onUploadMedia={triggerMediaUpload}
      />

      {/* 2 · Bento Grid: Today + Together + Related Media */}
      <div className={cn('activity-layout', o.collaborators && 'activity-layout--split')}>
        <OccurrenceToday
          occurrence={o}
          activity={activity.data}
          phase={phase}
          resultInputs={resultInputs}
          dirty={dirty}
          disabled={disabled}
          onMetricChange={handleMetricChange}
        />

        {o.collaborators && (
          <div className="activity-social">
            <ActivityTogether
              collaborators={o.collaborators}
              viewerId={me.data?.data.id}
              sharedMediaCount={o.sharedMedia.length}
              sharedCommentCount={o.sharedMedia.reduce((n, m) => n + m.commentCount, 0)}
              disabled={disabled}
            />
          </div>
        )}

        {/* 3 · Related Media */}
        <div className="activity-gallery">
          <OccurrenceMedia
            activityId={o.item.activityId}
            siteMedia={
              o.item.locked
                ? []
                : o.instructions.flatMap((instruction) => instruction.media ?? [])
            }
            sessionId={o.session?.id}
            prepareUpload={prepareMediaUpload}
            onAttach={(asset) => attachToSession(asset.id)}
            myMedia={o.myMedia}
            sharedMedia={o.sharedMedia}
            communityMedia={o.communityMedia}
            locked={o.item.locked}
            group={
              o.collaborators?.occurrenceKey
                ? {
                    groupId: o.collaborators.groupId,
                    occurrenceKey: o.collaborators.occurrenceKey,
                  }
                : null
            }
            onShared={refresh}
            uploadInputRef={uploadInputRef}
          />
        </div>

        {/* 4 · Community stats (privacy-safe aggregates when available) */}
        {communityLine && (
          <p className="activity-community">
            <Users size={16} aria-hidden />
            <span>
              <span className="sr-only">Community: </span>
              {communityLine}
            </span>
          </p>
        )}
      </div>
    </div>
  )
}

type Phase = 'ready' | 'active' | 'paused' | 'completed' | 'not-participating'

const PHASE_TONE: Record<Phase, ParticipationStatus> = {
  ready: 'planned',
  active: 'active',
  paused: 'paused',
  completed: 'completed',
  'not-participating': 'unavailable',
}

const PHASE_LABEL: Record<Phase, string> = {
  ready: 'To do',
  active: 'In progress',
  paused: 'Paused',
  completed: 'Completed',
  'not-participating': 'Not participating',
}

function SessionElapsed({ session }: { session: S['ActivitySession'] }) {
  const [seconds, setSeconds] = useState(session.activeSeconds)
  useEffect(() => {
    setSeconds(session.activeSeconds)
    if (session.status !== 'ACTIVE') return
    const receivedAt = Date.now()
    const timer = window.setInterval(
      () =>
        setSeconds(
          session.activeSeconds + Math.floor((Date.now() - receivedAt) / 1000),
        ),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [session.id, session.status, session.activeSeconds, session.revision])
  return (
    <p className="activity-timer">
      <span>{session.status === 'PAUSED' ? 'Paused' : 'Active time'}</span>
      <time>{formatElapsed(seconds)}</time>
    </p>
  )
}

/** Hero card: category icon, context, title, status pill, summary, actions and artwork. */
function ActivityIdentity({
  occurrence: o,
  activity,
  phase,
  isToday,
  session,
  timed,
  disabled,
  pendingButton,
  online,
  unsaved,
  error,
  undoPending,
  onPerform,
  onUndo,
  onRefresh,
  onUploadMedia,
}: {
  occurrence: S['ActivityOccurrence']
  activity?: S['ActivityDetail']
  phase: Phase
  isToday: boolean
  session: S['ActivitySession'] | null
  timed: boolean
  disabled: boolean
  pendingButton: PendingButton
  online: boolean
  unsaved: boolean
  error: unknown
  undoPending: boolean
  onPerform: (nextAction?: S['SessionAction'], button?: PendingButton) => void
  onUndo: () => void
  onRefresh: () => void
  onUploadMedia: () => void
}) {
  const categorySlugOf = useCategorySlugOf()
  const hero = activityHero(
    {
      title: o.item.title,
      thumbnailUrl: o.item.thumbnailUrl,
      categoryId: activity?.categoryId,
    },
    categorySlugOf,
  )
  const dateText = isToday
    ? `${dateLabel(o.item.localDate)} (Today)`
    : dateLabel(o.item.localDate)
  const context = [
    o.item.programTitle,
    o.item.programDayIndex !== null ? `Day ${o.item.programDayIndex + 1}` : null,
    dateText,
  ].filter(Boolean)

  return (
    <header className={cn('activity-identity', hero.src && 'activity-identity--photo')}>
      {hero.src && (
        <div className="activity-identity__art-wrap" aria-hidden>
          <EntityHero hero={hero} size="banner" className="activity-identity__art" />
        </div>
      )}
      <div className="activity-identity__body">
        <div className="activity-identity__header">
          <span className="activity-identity__icon" aria-hidden>
            <CategoryIcon category={hero.category} size={22} strokeWidth={1.85} />
          </span>
          <div className="activity-identity__title-group">
            <p className="activity-identity__context">{context.join(' · ')}</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1>{o.item.title}</h1>
              <span role="status">
                <StatusText status={PHASE_TONE[phase]} className="activity-status-pill">
                  {PHASE_LABEL[phase]}
                </StatusText>
              </span>
            </div>
            {(activity?.durationMinutes != null ||
              (session &&
                (phase === 'active' ||
                  phase === 'paused' ||
                  (phase === 'completed' && !session.isManualCompletion)))) && (
              <div className="activity-identity__meta">
                {activity?.durationMinutes != null && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={14} aria-hidden />
                    {formatDurationMinutes(activity.durationMinutes)}
                  </span>
                )}
                {session &&
                  (phase === 'active' ||
                    phase === 'paused' ||
                    (phase === 'completed' && !session.isManualCompletion)) && (
                    <SessionElapsed session={session} />
                  )}
              </div>
            )}

        {activity?.summary && (
          <p className="activity-identity__summary">{activity.summary}</p>
        )}
          </div>
        </div>

        <div className="activity-actions">
          <ErrorMessage error={error} />
          {!!error && (
            <Button variant="outline" size="sm" onClick={onRefresh}>
              Refresh Activity
            </Button>
          )}
          <div className="activity-session__actions">
            {(phase === 'ready' || phase === 'not-participating') &&
              (timed ? (
                <>
                  <Button
                    size="lg"
                    disabled={disabled}
                    loading={pendingButton === 'start'}
                    onClick={() => onPerform('START', 'start')}
                  >
                    {pendingButton !== 'start' && <Play size={16} aria-hidden />}
                    Start
                  </Button>
                  <Button
                    variant="outline"
                    disabled={disabled}
                    loading={pendingButton === 'finish-no-timer'}
                    onClick={() => onPerform('FINISH', 'finish-no-timer')}
                  >
                    Complete without timer
                  </Button>
                </>
              ) : (
                <Button
                  size="lg"
                  disabled={disabled}
                  loading={pendingButton === 'finish'}
                  onClick={() => onPerform('FINISH', 'finish')}
                >
                  {pendingButton !== 'finish' && <Check size={16} aria-hidden />}
                  Complete
                </Button>
              ))}
            {phase === 'active' && (
              <>
                <Button
                  size="lg"
                  disabled={disabled}
                  loading={pendingButton === 'finish'}
                  onClick={() => onPerform('FINISH', 'finish')}
                >
                  {pendingButton !== 'finish' && <Check size={16} aria-hidden />}
                  Complete
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled}
                  loading={pendingButton === 'pause'}
                  onClick={() => onPerform('PAUSE', 'pause')}
                >
                  {pendingButton !== 'pause' && <Pause size={16} aria-hidden />}
                  Pause
                </Button>
              </>
            )}
            {phase === 'paused' && (
              <>
                <Button
                  size="lg"
                  disabled={disabled}
                  loading={pendingButton === 'resume'}
                  onClick={() => onPerform('RESUME', 'resume')}
                >
                  {pendingButton !== 'resume' && <Play size={16} aria-hidden />}
                  Resume
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled}
                  loading={pendingButton === 'finish'}
                  onClick={() => onPerform('FINISH', 'finish')}
                >
                  {pendingButton !== 'finish' && <Check size={16} aria-hidden />}
                  Complete
                </Button>
              </>
            )}
            {phase === 'completed' && (
              <Button
                variant="outline"
                disabled={disabled}
                loading={undoPending}
                onClick={onUndo}
              >
                {!undoPending && <RotateCcw size={16} aria-hidden />}
                Undo completion
              </Button>
            )}
            {unsaved && (
              <Button
                variant="outline"
                disabled={disabled}
                loading={pendingButton === 'save'}
                onClick={() => onPerform(undefined, 'save')}
              >
                Save results
              </Button>
            )}
            <Button
              variant="outline"
              disabled={!online}
              onClick={onUploadMedia}
            >
              <Upload size={16} aria-hidden />
              Upload media
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}

/** Today card: goal progress bar, metric inputs, instructions, and compact stat tiles. */
function OccurrenceToday({
  occurrence: o,
  activity,
  phase,
  resultInputs,
  dirty,
  disabled,
  onMetricChange,
}: {
  occurrence: S['ActivityOccurrence']
  activity?: S['ActivityDetail']
  phase: Phase
  resultInputs: S['MetricInput'][]
  dirty: Record<string, string | number | boolean>
  disabled: boolean
  onMetricChange: (metric: S['MetricInput'], value: string | number | boolean) => void
}) {
  const categorySlugOf = useCategorySlugOf()
  const category = activityHero(
    { title: o.item.title, categoryId: activity?.categoryId },
    categorySlugOf,
  ).category

  const primaryMetric =
    resultInputs.find((m) => m.isPrimary) ?? resultInputs[0] ?? null
  const primaryValue = primaryMetric
    ? dirty[metricKey(primaryMetric)] !== undefined
      ? dirty[metricKey(primaryMetric)]
      : primaryMetric.recorded
    : null
  const numericTarget =
    primaryMetric &&
    typeof primaryMetric.target === 'number' &&
    primaryMetric.target > 0
      ? primaryMetric.target
      : null
  const numericCurrent =
    typeof primaryValue === 'number' && Number.isFinite(primaryValue)
      ? Math.max(0, primaryValue)
      : 0
  const progressPct =
    phase === 'completed'
      ? 100
      : numericTarget !== null
        ? Math.min(100, Math.round((numericCurrent / numericTarget) * 100))
        : 0

  const statTiles = [
    ...(o.item.programDayIndex !== null
      ? [
          {
            key: 'program-day',
            icon: <Flame size={16} aria-hidden />,
            tone: 'warm' as const,
            value: `Day ${o.item.programDayIndex + 1}`,
            label: o.item.programTitle ?? 'Program progress',
          },
        ]
      : []),
    ...(activity?.durationMinutes != null
      ? [
          {
            key: 'duration',
            icon: <Calendar size={16} aria-hidden />,
            tone: 'accent' as const,
            value: formatDurationMinutes(activity.durationMinutes),
            label: 'Target duration',
          },
        ]
      : []),
    ...(numericTarget !== null && primaryMetric
      ? [
          {
            key: 'goal',
            icon: <CategoryIcon category={category} size={16} aria-hidden />,
            tone: 'accent' as const,
            value: `${numericTarget}${primaryMetric.unit ? ` ${primaryMetric.unit}` : ''}`,
            label: "Today's goal",
          },
        ]
      : [
          {
            key: 'goal',
            icon: <CategoryIcon category={category} size={16} aria-hidden />,
            tone: 'accent' as const,
            value: o.item.title,
            label: "Today's goal",
          },
        ]),
    ...o.personalStats.slice(0, 2).map((stat) => ({
      key: `stat-${stat.key}`,
      icon: <TrendingUp size={16} aria-hidden />,
      tone: 'done' as const,
      value: stat.value,
      label: stat.label,
    })),
  ]

  return (
    <section
      aria-labelledby="today-heading"
      className="activity-card activity-today"
    >
      <div className="activity-card__header">
        <div className="activity-card__title">
          <Target size={18} className="shrink-0 text-accent" aria-hidden />
          <h2 id="today-heading">Today</h2>
        </div>
      </div>

      <div className="activity-today__task">
        <div className="activity-today__task-row">
          <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium">
            {phase === 'completed' ? (
              <CheckCircle2
                size={18}
                className="shrink-0 text-status-completed"
                aria-hidden
              />
            ) : (
              <Circle size={18} className="shrink-0 text-muted" aria-hidden />
            )}
            <span className="truncate">
              {phase === 'completed' ? o.item.title : `Complete ${o.item.title}`}
            </span>
          </span>
          {numericTarget !== null ? (
            <span className="shrink-0 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-semibold tabular-nums text-muted">
              {numericCurrent} / {numericTarget}
            </span>
          ) : (
            phase === 'completed' && (
              <span className="shrink-0 rounded-full border border-status-completed/40 bg-status-completed/15 px-2.5 py-0.5 text-xs font-semibold text-status-completed">
                Done
              </span>
            )
          )}
        </div>
        <div
          className="activity-progress-track"
          role="progressbar"
          aria-label="Activity progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
        >
          <div
            className={cn(
              'activity-progress-fill',
              (phase === 'completed' || progressPct >= 100) &&
                'activity-progress-fill--done',
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {resultInputs.length > 0 && (
        <div className="activity-metrics">
          {resultInputs.map((metric) => {
            const key = metricKey(metric)
            const current =
              dirty[key] !== undefined ? dirty[key]! : metric.recorded
            return (
              <div key={key} className="activity-metric-card">
                <MetricInput
                  metric={metric}
                  value={current}
                  disabled={disabled}
                  onChange={(val) => onMetricChange(metric, val)}
                />
              </div>
            )
          })}
        </div>
      )}

      <OccurrenceInstructions
        instructions={o.instructions}
        locked={o.item.locked}
      />

      {statTiles.length > 0 && (
        <div className="activity-stat-grid">
          {statTiles.map((tile) => (
            <div key={tile.key} className="activity-stat-tile">
              <span
                className={cn(
                  'activity-stat-tile__icon',
                  tile.tone === 'warm' && 'activity-stat-tile__icon--warm',
                  tile.tone === 'done' && 'activity-stat-tile__icon--done',
                )}
              >
                {tile.icon}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tabular-nums text-text">
                  {tile.value}
                </p>
                <p className="truncate text-xs text-muted">{tile.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
