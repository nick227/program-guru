import { useEffect, useRef, useState } from 'react'
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
import { Avatar } from '@/components/ui/Avatar'
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
      const current = o.session && o.session.status !== 'ABANDONED' ? o.session : await getSession()
      return { kind: 'RESULT_ENTRY', id: await getOrCreateSessionResultEntry(current.id) }
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
  const phase: Phase = status === 'ACTIVE'
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
        <section aria-labelledby="today-heading" className="activity-today">
          <SectionHeader id="today-heading" title="Today's Activity" />
          <OccurrenceInstructions instructions={o.instructions} locked={o.item.locked} />
          <div className="activity-actions">
            <ErrorMessage error={failure || undo.error} />
            {!!failure && <Button variant="outline" onClick={refresh}>Refresh Activity</Button>}
            <div className="activity-session__actions">
              {(phase === 'ready' || phase === 'not-participating') && (
                timed ? <>
                  <Button size="lg" disabled={disabled} onClick={() => void perform('START')}>Start</Button>
                  <Button variant="ghost" disabled={disabled} onClick={() => void perform('FINISH')}>Complete without timer</Button>
                </> : <Button size="lg" disabled={disabled} onClick={() => void perform('FINISH')}>Complete</Button>
              )}
              {phase === 'active' && <>
                <Button size="lg" disabled={disabled} onClick={() => void perform('FINISH')}>Complete</Button>
                <Button variant="outline" disabled={disabled} onClick={() => void perform('PAUSE')}>Pause</Button>
              </>}
              {phase === 'paused' && <>
                <Button size="lg" disabled={disabled} onClick={() => void perform('RESUME')}>Resume</Button>
                <Button variant="outline" disabled={disabled} onClick={() => void perform('FINISH')}>Complete</Button>
              </>}
              {phase === 'completed' && <Button variant="outline" disabled={disabled || undo.isPending} onClick={() => undo.mutate(o.item.id)}>Undo completion</Button>}
            </div>
            {session && (phase === 'active' || phase === 'paused' || (phase === 'completed' && !session.isManualCompletion)) && <SessionElapsed session={session} />}
            {busy && <p role="status" className="text-sm text-muted">Saving…</p>}
          </div>
        </section>

        {(resultInputs.length > 0 || o.personalStats.length > 0) && <section aria-labelledby="metrics-heading" className="activity-my-metrics">
          <SectionHeader id="metrics-heading" title="My Metrics" />
          {o.personalStats.length > 0 && <dl className="activity-stat-list">
            {o.personalStats.map(stat => <div key={stat.key}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}
          </dl>}
          {resultInputs.length > 0 && <div className="activity-metrics">
            {resultInputs.map(m => <MetricInput key={metricKey(m)} metric={m} value={dirty[metricKey(m)] ?? m.recorded} disabled={disabled || phase === 'completed'} onChange={value => setDirty(prev => ({ ...prev, [metricKey(m)]: value }))} />)}
          </div>}
          {unsaved && <Button variant="outline" disabled={disabled} onClick={() => void perform()}>Save results</Button>}
        </section>}

        {o.collaborators && <div className="activity-social">
          <ActivityTogether collaborators={o.collaborators} viewerId={me.data?.data.id} sharedMediaCount={o.sharedMedia.length} sharedCommentCount={o.sharedMedia.reduce((n, m) => n + m.commentCount, 0)} disabled={disabled} />
        </div>}

        {/* 5 · Related Media: one compact section */}
        <div className="activity-gallery">
          <OccurrenceMedia
            activityId={o.item.activityId}
            siteMedia={o.item.locked ? [] : o.instructions.flatMap(instruction => instruction.media ?? [])}
            sessionId={o.session?.id}
            prepareUpload={prepareMediaUpload}
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

function SessionElapsed({ session }: { session: S['ActivitySession'] }) {
  const [seconds, setSeconds] = useState(session.activeSeconds)
  useEffect(() => {
    setSeconds(session.activeSeconds)
    if (session.status !== 'ACTIVE') return
    const receivedAt = Date.now()
    const timer = window.setInterval(() => setSeconds(session.activeSeconds + Math.floor((Date.now() - receivedAt) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [session.id, session.status, session.activeSeconds, session.revision])
  return <p className="activity-timer"><span>{session.status === 'PAUSED' ? 'Paused' : 'Active time'}</span> <time>{formatElapsed(seconds)}</time></p>
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
    <header className={`activity-identity ${hero.src ? 'activity-identity--photo' : ''}`}>
      {hero.src && <EntityHero hero={hero} size="banner" className="activity-identity__art" />}
      <div className="activity-identity__text">
        <p className="activity-identity__context">{context.join(' · ')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1>{o.item.title}</h1>
          <span role="status"><StatusText status={PHASE_TONE[phase]}>{PHASE_LABEL[phase]}</StatusText></span>
        </div>
        {activity.data?.summary && (
          <p className="activity-identity__summary">{activity.data.summary}</p>
        )}
      </div>
      {(o.personalStats.length > 0 || !!o.collaborators?.members.length) && <div className="activity-identity__progress">
        {o.personalStats.slice(0, 2).map(stat => <span key={stat.key}><strong>{stat.value}</strong> {stat.label}</span>)}
        {!!o.collaborators?.members.length && <a href="#together" className="inline-flex items-center gap-3">
          <span className="flex -space-x-2" aria-hidden>{o.collaborators.members.slice(0, 3).map(member => <Avatar key={member.user.id} src={member.user.avatarUrl} name={member.user.displayName} size="sm" />)}</span>
          Together · {o.collaborators.finishedCount} of {o.collaborators.totalCount} finished
        </a>}
      </div>}
    </header>
  )
}
