import { useRef, useState } from 'react'
import {
  useBeforeUnload,
  useBlocker,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import {
  useCreateSession,
  useCurrentUser,
  useAttachSessionMedia,
  useInboundMedia,
  getOrCreateSessionResultEntry,
  useOccurrence,
  useSaveResults,
  useSessionAction,
  useUndoCompletion,
  useActivity,
  type components,
} from '@project/sdk'
import { toast } from 'sonner'
import { Users } from 'lucide-react'
import { Page, Panel, Stack, Row } from '@/components/ui/Layout'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { StatusText, type ParticipationStatus } from '@/components/ui/StatusText'
import { EntityHero, useCategorySlugOf } from '@/components/EntityHero'
import { activityHero } from '@/lib/hero'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back } from '@/components/Navigation'
import { MetricInput } from '@/components/MetricInput'
import { ActivityTogether } from '@/components/ActivityTogether'
import { OccurrenceInstructions } from '@/components/OccurrenceInstructions'
import { OccurrenceMedia } from '@/components/OccurrenceMedia'
import { SessionUpload } from '@/components/SessionUpload'
import { calendarUrl, dateLabel, safeReturn } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
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
      : occurrence.isPending
        ? 'Occurrence'
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
function OccurrenceContent({
  occurrence: o,
  refresh,
}: {
  occurrence: S['ActivityOccurrence']
  refresh: () => void
}) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
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
  const inbound = useInboundMedia({ purpose: 'JOURNAL' })
  const me = useCurrentUser()
  const [dirty, setDirty] = useState<Record<string, string | number | boolean>>(
    {},
  )
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const working = useRef(false)
  const createKey = useRef(crypto.randomUUID())
  const created = useRef<S['ActivitySession'] | null>(null)
  const leavingAfterFinish = useRef(false)
  const unsaved = Object.keys(dirty).length > 0
  const blocker = useBlocker(
    () => (unsaved || busy) && !leavingAfterFinish.current,
  )
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
  async function attachToSession(fileOrMediaId: File | string) {
    if (!online) throw new Error('Connect to attach media.')
    if (working.current) throw new Error('Wait for the current save to finish.')
    working.current = true
    setBusy(true)
    try {
      const current =
        o.session && o.session.status !== 'ABANDONED'
          ? o.session
          : await getSession()
      if (typeof fileOrMediaId === 'string') {
        await attach.mutateAsync({ mediaId: fileOrMediaId, sessionId: current.id })
      } else {
        const resultEntryId = await getOrCreateSessionResultEntry(current.id)
        await inbound.upload(fileOrMediaId, {
          target: { kind: 'RESULT_ENTRY', id: resultEntryId },
          purpose: 'JOURNAL',
        })
      }
    } finally {
      working.current = false
      setBusy(false)
    }
  }
  async function perform(nextAction?: S['SessionAction']) {
    if (working.current) return
    working.current = true
    setBusy(true)
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
          const url = new URL(origin, window.location.origin)
          url.searchParams.set('completed', o.item.id)
          leavingAfterFinish.current = true
          navigate(url.pathname + url.search)
          toast.success('Activity finished')
        }
      } else toast.success('Results saved')
    } catch (error) {
      setFailure(error)
    } finally {
      working.current = false
      setBusy(false)
    }
  }
  // One state for the whole page, so the header and the session never disagree.
  const itemDone = o.item.status === 'DONE'
  const phase: Phase = itemDone
    ? 'completed'
    : status === 'ACTIVE'
      ? 'active'
      : status === 'PAUSED'
        ? 'paused'
        : o.item.status === 'NOT_PARTICIPATING'
          ? 'not-participating'
          : 'ready'
  const timed = o.resultInputs.some((metric) => metric.valueType === 'DURATION')
  const finishedSession = session?.status === 'FINISHED' ? session : null
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
  return (
    <div className="activity-page">
      <Back to={origin}>{origin.startsWith('/library') ? 'My Programs' : 'Calendar'}</Back>
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

      {/* 1 · Identity */}
      <ActivityIdentity occurrence={o} phase={phase} />

      <div className="activity-layout">
        {/* 2 · Today's Results: what to do, what you record, how you're doing */}
        <section aria-labelledby="results-heading" className="activity-layout__main space-y-6">
          <SectionHeader id="results-heading" title="Today's Results" />
          <OccurrenceInstructions instructions={o.instructions} locked={o.item.locked} />
          {resultInputs.length > 0 ? (
            <div className="activity-metrics">
              {resultInputs.map((m) => (
                <MetricInput
                  key={metricKey(m)}
                  metric={m}
                  value={dirty[metricKey(m)] ?? m.recorded}
                  disabled={disabled || phase === 'completed'}
                  onChange={(value) =>
                    setDirty((prev) => ({ ...prev, [metricKey(m)]: value }))
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Nothing to record. Mark it complete when you&apos;re done.
            </p>
          )}
          {unsaved && (
            <Button variant="outline" disabled={disabled} onClick={() => void perform()}>
              Save results
            </Button>
          )}
          {o.personalStats.length > 0 && (
            <div className="activity-progress">
              <h3>Your progress</h3>
              <dl>
                {o.personalStats.slice(0, 3).map((stat) => (
                  <div key={stat.key}>
                    <dt>{stat.label}</dt>
                    <dd>{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>

        {/* 3 · Doing this together (hidden when solo) */}
        {o.collaborators && (
          <div className="activity-layout__main">
            <ActivityTogether
              collaborators={o.collaborators}
              viewerId={me.data?.data.id}
              sharedMediaCount={o.sharedMedia.length}
              sharedCommentCount={o.sharedMedia.reduce((n, m) => n + m.commentCount, 0)}
              disabled={disabled}
            />
          </div>
        )}

        {/* 4 · Session: one primary action per state; sticky beside the content on desktop */}
        <div className="activity-layout__rail">
          <Panel aria-labelledby="session-heading" className="activity-session">
            <Stack className="gap-4">
              <Row className="justify-between">
                <h2 id="session-heading">Session</h2>
                <StatusText status={PHASE_TONE[phase]}>{sessionLabel(phase, finishedSession)}</StatusText>
              </Row>
              <ErrorMessage error={failure || undo.error} />
              {!!failure && (
                <Button variant="outline" onClick={refresh}>
                  Refresh Activity
                </Button>
              )}
              <div className="activity-session__actions">
                {(phase === 'ready' || phase === 'not-participating') &&
                  (timed ? (
                    <>
                      <Button size="lg" disabled={disabled} onClick={() => void perform('START')}>
                        Start
                      </Button>
                      <Button variant="outline" disabled={disabled} onClick={() => void perform('FINISH')}>
                        Mark complete
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="lg" disabled={disabled} onClick={() => void perform('FINISH')}>
                        Mark complete
                      </Button>
                      <Button variant="outline" disabled={disabled} onClick={() => void perform('START')}>
                        Start timer
                      </Button>
                    </>
                  ))}
                {phase === 'active' && (
                  <>
                    <Button size="lg" disabled={disabled} onClick={() => void perform('FINISH')}>
                      Finish
                    </Button>
                    <Button variant="outline" disabled={disabled} onClick={() => void perform('PAUSE')}>
                      Pause
                    </Button>
                  </>
                )}
                {phase === 'paused' && (
                  <>
                    <Button size="lg" disabled={disabled} onClick={() => void perform('FINISH')}>
                      Finish
                    </Button>
                    <Button variant="outline" disabled={disabled} onClick={() => void perform('RESUME')}>
                      Resume
                    </Button>
                  </>
                )}
                {phase === 'completed' && (
                  <Button size="lg" disabled={disabled} onClick={() => void perform('START')}>
                    Start again
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted">
                {phase === 'active' || phase === 'paused'
                  ? 'Pause for breaks; only active time is counted.'
                  : phase === 'completed'
                    ? 'Starting again begins a new attempt and keeps this one.'
                    : timed
                      ? 'The timer records active time, never pauses.'
                      : 'No timer needed. Use Start timer if you want to track time.'}
              </p>
              <Row className="flex-wrap gap-2">
                <SessionUpload attach={attachToSession} disabled={disabled} />
                {phase === 'completed' && (
                  <Button
                    variant="ghost"
                    disabled={disabled || undo.isPending}
                    onClick={() => undo.mutate(o.item.id)}
                  >
                    Undo completion
                  </Button>
                )}
              </Row>
              {busy && <p role="status" className="text-sm text-muted">Saving…</p>}
            </Stack>
          </Panel>
        </div>

        {/* 5 · Related Media: one compact section */}
        <div className="activity-layout__main">
          <OccurrenceMedia
            activityId={o.item.activityId}
            sessionId={o.session?.id}
            onAttach={(asset) => attachToSession(asset.id)}
            myMedia={o.myMedia}
            sharedMedia={o.sharedMedia}
            communityMedia={o.communityMedia}
            locked={o.item.locked}
            group={
              o.collaborators?.occurrenceKey
                ? { groupId: o.collaborators.groupId, occurrenceKey: o.collaborators.occurrenceKey }
                : null
            }
            onShared={refresh}
          />
        </div>

        {/* 6 · Community (only when there is something to say; small counts are withheld) */}
        {communityLine && (
          <p className="activity-layout__main activity-community">
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

function sessionLabel(phase: Phase, finished: S['ActivitySession'] | null) {
  if (phase === 'ready') return 'Ready to start'
  if (phase === 'completed' && finished)
    return finished.isManualCompletion
      ? 'Completed · no timer'
      : `Completed · ${formatElapsed(finished.activeSeconds)}`
  return PHASE_LABEL[phase]
}

/** Row 1: artwork, Program context, title, state and what the Activity is about. */
function ActivityIdentity({ occurrence: o, phase }: { occurrence: S['ActivityOccurrence']; phase: Phase }) {
  // The Activity summary and category come from the Activity itself; both are optional.
  const activity = useActivity(o.item.locked ? '' : o.item.activityId)
  const categorySlugOf = useCategorySlugOf()
  const hero = activityHero(
    {
      title: o.item.title,
      thumbnailUrl: o.item.thumbnailUrl,
      categoryId: activity.data?.categoryId,
    },
    categorySlugOf,
  )
  const context = [
    o.item.programTitle,
    o.item.programDayIndex !== null ? `Day ${o.item.programDayIndex + 1}` : null,
    dateLabel(o.item.localDate),
  ].filter(Boolean)
  return (
    <header className="activity-identity">
      <EntityHero hero={hero} size="card" className="activity-identity__art aspect-preview w-28 sm:w-44" />
      <div className="activity-identity__text">
        <p className="activity-identity__context">{context.join(' · ')}</p>
        <h1>{o.item.title}</h1>
        <p role="status">
          <StatusText status={PHASE_TONE[phase]}>{PHASE_LABEL[phase]}</StatusText>
        </p>
        {activity.data?.summary && (
          <p className="activity-identity__summary">{activity.data.summary}</p>
        )}
      </div>
    </header>
  )
}
