import { useSessionLeaveGuard } from '@/lib/useSessionLeaveGuard'
import { SessionLeavePrompt } from './SessionLeavePrompt'
import { SessionActions } from './SessionActions'
import type { SessionEligibility } from '@/lib/sessionEligibility'
import { formatDurationMinutes } from '@/lib/durationMinutes'
import { formatTargetTime } from '@/lib/targetTime'
import { useRef } from 'react'
import {
  useCurrentUser,
  useAttachSessionMedia,
  getOrCreateSessionResultEntry,
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
  Target,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react'
import { StatusText } from '@/components/ui/StatusText'
import { useCategorySlugOf } from '@/components/shared/EntityHero'
import { CategoryIcon } from '@/components/shared/CategoryIcon'
import { activityHero } from '@/lib/hero'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/Feedback'
import { MetricInput } from '@/components/activity/MetricInput'
import { ActivityTogether } from '@/components/activity/ActivityTogether'
import { ScheduledPlace } from '@/components/activity/ScheduledPlace'
import { OccurrenceGathering, type HeroPhase } from '@/components/activity/OccurrenceGathering'
import { ActivitySection } from '@/components/activity/ActivitySection'
import { OccurrenceMedia } from '@/components/activity/OccurrenceMedia'
import { dateLabel, today } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'
import { formatElapsed, metricKey, useActivitySession, useElapsedSeconds, entryPhase, ENTRY_PHASE_LABEL, ENTRY_PHASE_TONE, type EntryPhase } from '@/lib/activitySession'

type S = components['schemas']


export function ActivitySessionContent({
  occurrence: o,
  refresh,
}: {
  occurrence: S['ActivityOccurrence']
  refresh: () => void
}) {
  const online = useOnline()
  // Session behavior is the shared controller (lib/activitySession); this page adds its layout,
  // per-button progress, toasts, media and leave-page protection.
  const controller = useActivitySession(o)
  const { session, resultInputs, dirty, unsaved, busy, failure, getSession, exclusive } = controller
  const undo = useUndoCompletion()
  const attach = useAttachSessionMedia()
  const me = useCurrentUser()
  const activity = useActivity(o.item.locked ? '' : o.item.activityId)

  const uploadInputRef = useRef<HTMLInputElement>(null)

  const guard = useSessionLeaveGuard({ unsaved, busy, save: () => controller.perform(), discard: controller.discard })

  const status = session?.status ?? 'READY'
  const disabled = busy || !online

  /** Media goes to the current attempt (an unstarted one is created if needed). */
  const mediaSession = () => (o.session && o.session.status !== 'ABANDONED' ? Promise.resolve(o.session) : getSession())

  async function attachToSession(mediaId: string) {
    if (!online) throw new Error('Connect to attach media.')
    await exclusive(async () => {
      const current = await mediaSession()
      await attach.mutateAsync({ mediaId, sessionId: current.id })
    }, { throwIfBusy: true })
  }

  async function prepareMediaUpload(): Promise<S['AttachmentTarget']> {
    if (!online) throw new Error('Connect to upload media.')
    const target = await exclusive(async () => {
      const current = await mediaSession()
      return { kind: 'RESULT_ENTRY' as const, id: await getOrCreateSessionResultEntry(current.id) }
    }, { throwIfBusy: true })
    return target!
  }

  async function perform(nextAction?: S['SessionAction']) {
    if (busy) return
    const ok = await controller.perform(nextAction)
    if (!ok) return
    if (nextAction === 'FINISH') toast.success('Activity finished')
    else if (!nextAction) toast.success('Results saved')
  }

  const handleMetricChange = controller.setMetric

  function triggerMediaUpload() {
    const input = uploadInputRef.current
    if (input) {
      input.click()
      return
    }
    document.getElementById('related-media')?.scrollIntoView({ behavior: 'smooth' })
  }

  // One state for the whole page, so the header and the session never disagree.
  const phase: Phase = entryPhase(o.item.status, status)
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
      <SessionLeavePrompt guard={guard} />

      {/* Controls for this exact scheduled session. */}
      <OccurrenceControls
        occurrence={o}
        activity={activity.data}
        phase={phase}
        isToday={isToday}
        session={session}
        timed={timed}
        disabled={disabled}
        eligibility={controller.eligibility}
        online={online}
        unsaved={unsaved}
        error={failure || undo.error}
        undoPending={undo.isPending}
        onPerform={perform}
        onUndo={() => { if (controller.eligibility.canUndo) undo.mutate(o.item.id) }}
        onRefresh={refresh}
        onUploadMedia={triggerMediaUpload}
      />

      {/* Results, collaborators, and session media. */}
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
              activityId={o.item.activityId}
              activityTitle={o.item.title}
              calendarItemId={o.item.id}
              gathering={!!o.item.gatheringId}
              canCheckIn={phase === 'completed'}
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
                : [...(activity.data?.media ?? []), ...o.instructions.flatMap((instruction) => instruction.media ?? [])]
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

type Phase = EntryPhase

function SessionElapsed({ session }: { session: S['ActivitySession'] }) {
  const seconds = useElapsedSeconds(session)
  return (
    <p className="activity-timer">
      <span>{session.status === 'PAUSED' ? 'Paused' : 'Active time'}</span>
      <time>{formatElapsed(seconds)}</time>
    </p>
  )
}

/** Session controls embedded in the unified Activity page. */
function OccurrenceControls({
  occurrence: o,
  activity,
  eligibility,
  phase,
  isToday,
  session,
  timed,
  disabled,
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
  eligibility: SessionEligibility
  activity?: S['ActivityDetail']
  phase: Phase
  isToday: boolean
  session: S['ActivitySession'] | null
  timed: boolean
  disabled: boolean
  online: boolean
  unsaved: boolean
  error: unknown
  undoPending: boolean
  onPerform: (nextAction?: S['SessionAction']) => Promise<unknown>
  onUndo: () => void
  onRefresh: () => void
  onUploadMedia: () => void
}) {
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
  const heroPhase: HeroPhase =
    phase === 'completed' ? 'after' : phase === 'active' || phase === 'paused' ? 'during' : 'before'

  return (
    <section className="activity-card space-y-4" aria-label="Your session">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-semibold">Your session</h2>
        <span>{context.join(' · ')}</span>
        <span role="status"><StatusText status={ENTRY_PHASE_TONE[phase]}>{ENTRY_PHASE_LABEL[phase]}</StatusText></span>
      </div>
      {showTimer && session && <SessionElapsed session={session} />}
      <ScheduledPlace item={o.item} />
      {!o.item.locked && !o.item.gatheringId && <OccurrenceGathering item={o.item} activity={activity} phase={heroPhase} sharedCount={o.sharedMedia.length} />}

        <>
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
              <SessionActions eligibility={eligibility} timed={timed} unsaved={unsaved} onPerform={onPerform} onUndo={onUndo} undoPending={undoPending} />
            </div>
            <div className="activity-session__tools">
              <Button variant="outline" disabled={!online} onClick={onUploadMedia}>
                <Upload size={16} aria-hidden />
                Upload media
              </Button>

            </div>
          </div>
        </>
    </section>
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
    <ActivitySection icon={Target} title="Results" className="activity-today">

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
    </ActivitySection>
  )
}
