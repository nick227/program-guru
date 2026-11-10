import { formatDurationMinutes } from '@/lib/durationMinutes'
import { formatTargetTime } from '@/lib/targetTime'
import { usePwaReloadBlocker } from '@/lib/pwaSafety'
import { useEffect, useRef, useState } from 'react'
import {
  Link,
  useBeforeUnload,
  useBlocker,
  useLocation,
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
  Clock,
  Flame,
  Pause,
  Pencil,
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
import { Avatar } from '@/components/ui/Avatar'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { SubHeader } from '@/components/shared/SubHeader'
import { buildOccurrenceBreadcrumbs } from '@/lib/breadcrumbs'
import { MetricInput } from '@/components/activity/MetricInput'
import { ActivityTogether } from '@/components/activity/ActivityTogether'
import { OccurrenceInstructions } from '@/components/activity/OccurrenceInstructions'
import { OccurrenceMedia } from '@/components/activity/OccurrenceMedia'
import { ShareLinkCard } from '@/components/social/ShareLink'
import { buildActivityUrl, buildProfileUrl, toAbsoluteUrl } from '@/lib/urls'
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
  const [params] = useSearchParams()
  const location = useLocation()
  const currentUrl = `${location.pathname}${location.search}`
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

  const o = occurrence.data
  const origin = safeReturn(
    params.get('returnTo'),
    o ? calendarUrl(o.item.localDate) : '/',
  )
  const occurrenceNav = buildOccurrenceBreadcrumbs({
    title: o?.item.title ?? 'Activity',
    programTitle: o?.item.programTitle,
    returnTo: params.get('returnTo') ? origin : null,
  })

  return (
    <Page className="page--wide pb-20">
      <SubHeader
        breadcrumbs={occurrenceNav.items}
        active={occurrenceNav.activeNav}
        returnTo={currentUrl}
      />
      <div className="mx-auto mt-6 w-full max-w-5xl">
        <ErrorMessage
          error={occurrence.error}
          retry={() => void occurrence.refetch()}
        />
        {o ? (
          <OccurrenceContent
            key={id}
            occurrence={o}
            refresh={() => void occurrence.refetch()}
          />
        ) : occurrence.isPending ? (
          <Loading />
        ) : (
          <Link to={origin} className="text-accent underline">
            Return to Calendar
          </Link>
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
  // The occurrence itself is private; share the Activity's public page when others can open it.
  const shareUrl =
    activity.data &&
    activity.data.status === 'PUBLISHED' &&
    activity.data.visibility !== 'PRIVATE'
      ? toAbsoluteUrl(buildActivityUrl(activity.data))
      : null

  return (
    <div className="activity-page">
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

        {/* 4 · Share */}
        <div className="activity-share">
          {shareUrl ? (
            <ShareLinkCard
              title="Share"
              ariaLabel="Share Activity"
              description="Invite others to try this Activity."
              url={shareUrl}
              shareTitle={o.item.title}
              copiedMessage="Activity link copied"
              inputLabel="Activity link"
            />
          ) : (
            <section
              aria-label="Share Activity"
              className="rounded-xl border border-border bg-surface p-5 sm:p-6"
            >
              <SectionHeader
                title="Share"
                className="pb-0"
                description={
                  o.item.locked
                    ? 'This Activity is part of a Program you no longer have access to, so it has no share link.'
                    : activity.isPending
                      ? 'Loading share link…'
                      : 'This Activity is private, so there is no public link to share. Make it public in the Activity editor to share it.'
                }
              />
            </section>
          )}
        </div>

        {/* 5 · Community stats (privacy-safe aggregates when available) */}
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

/** Hero: thumbnail, context and status, title + summary, creator/meta, then the action band. */
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
  const location = useLocation()
  const currentUrl = `${location.pathname}${location.search}`
  const creator = activity?.creator ?? null
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

  const showTimer =
    !!session &&
    (phase === 'active' ||
      phase === 'paused' ||
      (phase === 'completed' && !session.isManualCompletion))
  const hasMeta =
    !!creator ||
    activity?.durationMinutes != null ||
    !!o.item.localTime ||
    !!activity?.targetTime ||
    showTimer

  return (
    <header className="occurrence-hero">
      {/* Thumbnail: the image, or the category fallback tile when there is none. */}
      <EntityHero hero={hero} size="header" className="occurrence-hero__thumb" />

      <div className="occurrence-hero__kicker">
        <p className="occurrence-hero__context">{context.join(' · ')}</p>
        <span role="status">
          <StatusText status={PHASE_TONE[phase]} className="activity-status-pill">
            {PHASE_LABEL[phase]}
          </StatusText>
        </span>
      </div>

      <div className="occurrence-hero__text">
        <h1 className="occurrence-hero__title">{o.item.title}</h1>
        {activity?.summary && (
          <p className="occurrence-hero__summary">{activity.summary}</p>
        )}
      </div>

      {hasMeta && (
        <div className="occurrence-hero__meta">
          {creator && (
            <Link
              to={`${buildProfileUrl(creator.handle)}?returnTo=${encodeURIComponent(currentUrl)}`}
              className="occurrence-hero__creator"
            >
              <Avatar
                src={creator.avatarUrl}
                name={creator.displayName}
                size="sm"
                className="h-6 w-6 ring-1 ring-border"
              />
              <span>
                by <strong className="font-semibold">{creator.displayName}</strong>
              </span>
            </Link>
          )}
          {activity?.durationMinutes != null && (
            <span className="inline-flex items-center gap-1.5">
              <Clock size={14} aria-hidden />
              {formatDurationMinutes(activity.durationMinutes)}
            </span>
          )}
          {(o.item.localTime || activity?.targetTime) && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={14} aria-hidden />
              {o.item.localTime
                ? `Scheduled ${formatTargetTime(o.item.localTime)}`
                : `Target time ${formatTargetTime(activity?.targetTime)}`}
            </span>
          )}
          {showTimer && session && <SessionElapsed session={session} />}
        </div>
      )}

      <div className="activity-actions">
        {!!error && (
          <div className="activity-actions__error">
            <ErrorMessage error={error} />
            <Button variant="outline" size="sm" onClick={onRefresh}>
              Refresh Activity
            </Button>
          </div>
        )}
        <div className="activity-session__actions">
          <div className="activity-session__primary">
            {(phase === 'ready' || phase === 'not-participating') &&
              (timed ? (
                <>
                  <Button
                    size="lg"
                    className="activity-cta"
                    disabled={disabled}
                    loading={pendingButton === 'start'}
                    onClick={() => onPerform('START', 'start')}
                  >
                    {pendingButton !== 'start' && <Play size={18} aria-hidden />}
                    Start
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={disabled}
                    loading={pendingButton === 'finish-no-timer'}
                    onClick={() => onPerform('FINISH', 'finish-no-timer')}
                  >
                    {pendingButton !== 'finish-no-timer' && (
                      <Check size={16} aria-hidden />
                    )}
                    Complete without timer
                  </Button>
                </>
              ) : (
                <Button
                  size="lg"
                  className="activity-cta"
                  disabled={disabled}
                  loading={pendingButton === 'finish'}
                  onClick={() => onPerform('FINISH', 'finish')}
                >
                  {pendingButton !== 'finish' && <Check size={20} strokeWidth={2.5} aria-hidden />}
                  Complete
                </Button>
              ))}
            {phase === 'active' && (
              <>
                <Button
                  size="lg"
                  className="activity-cta"
                  disabled={disabled}
                  loading={pendingButton === 'finish'}
                  onClick={() => onPerform('FINISH', 'finish')}
                >
                  {pendingButton !== 'finish' && <Check size={20} strokeWidth={2.5} aria-hidden />}
                  Complete
                </Button>
                <Button
                  variant="outline"
                  size="lg"
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
                  className="activity-cta"
                  disabled={disabled}
                  loading={pendingButton === 'finish'}
                  onClick={() => onPerform('FINISH', 'finish')}
                >
                  {pendingButton !== 'finish' && <Check size={20} strokeWidth={2.5} aria-hidden />}
                  Complete
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  disabled={disabled}
                  loading={pendingButton === 'resume'}
                  onClick={() => onPerform('RESUME', 'resume')}
                >
                  {pendingButton !== 'resume' && <Play size={16} aria-hidden />}
                  Resume
                </Button>
              </>
            )}
            {phase === 'completed' && (
              <Button
                variant="outline"
                size="lg"
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
                size="lg"
                disabled={disabled}
                loading={pendingButton === 'save'}
                onClick={() => onPerform(undefined, 'save')}
              >
                Save results
              </Button>
            )}
          </div>
          <div className="activity-session__tools">
            <Button variant="outline" disabled={!online} onClick={onUploadMedia}>
              <Upload size={16} aria-hidden />
              Upload media
            </Button>
            {activity?.canEdit && (
              <Link
                to={buildActivityUrl(activity, { returnTo: currentUrl })}
                className="btn btn--outline btn--icon"
                aria-label="Edit Activity"
                title="Edit Activity"
              >
                <Pencil size={16} aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

/** Small ring that replaces the full-width progress bar. */
function CompletionRing({ percent, done }: { percent: number; done: boolean }) {
  const r = 9
  const c = 2 * Math.PI * r
  return (
    <span
      className={cn('activity-ring', done && 'activity-ring--done')}
      role="progressbar"
      aria-label="Activity progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
        <circle className="activity-ring__track" cx="12" cy="12" r={r} />
        <circle
          className="activity-ring__fill"
          cx="12"
          cy="12"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
        />
      </svg>
      {done && <Check size={12} strokeWidth={3} className="activity-ring__check" aria-hidden />}
    </span>
  )
}

/** Today card: completion ring, metric inputs, instructions, and compact stat tiles. */
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
    ...(activity?.targetTime || o.item.localTime
      ? [
          {
            key: 'target-time',
            icon: <Clock size={16} aria-hidden />,
            tone: 'accent' as const,
            value: formatTargetTime(o.item.localTime ?? activity?.targetTime),
            label: o.item.localTime ? 'Scheduled time' : 'Target time',
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
        <CompletionRing
          percent={progressPct}
          done={phase === 'completed' || progressPct >= 100}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {phase === 'completed' ? o.item.title : `Complete ${o.item.title}`}
        </span>
        {numericTarget !== null ? (
          <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
            {numericCurrent} / {numericTarget}
            {primaryMetric?.unit ? ` ${primaryMetric.unit}` : ''}
          </span>
        ) : (
          <span
            className={cn(
              'shrink-0 text-xs font-semibold',
              phase === 'completed' ? 'text-status-completed' : 'text-muted',
            )}
          >
            {phase === 'completed' ? 'Done' : 'Not done'}
          </span>
        )}
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
