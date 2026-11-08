import { useRef, useState } from 'react'
import {
  Link,
  useBeforeUnload,
  useBlocker,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import {
  useAddCompletionReaction,
  useCreateSession,
  useAttachSessionMedia,
  useOccurrence,
  useRemoveCompletionReaction,
  useSaveResults,
  useSessionAction,
  useUndoCompletion,
  type components,
} from '@project/sdk'
import { toast } from 'sonner'
import { Page, Stage, Panel, Stack, Row, Grid } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/Navigation'
import { MetricInput } from '@/components/MetricInput'
import { AvatarStack } from '@/components/AvatarStack'
import { UnreadDot } from '@/components/UnreadDot'
import { OccurrenceInstructions } from '@/components/OccurrenceInstructions'
import { OccurrenceMedia } from '@/components/OccurrenceMedia'
import { SessionCapture } from '@/components/SessionCapture'
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
    <Page>
      <Stage>
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
      </Stage>
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
  const addReaction = useAddCompletionReaction()
  const removeReaction = useRemoveCompletionReaction()
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
  return (
    <>
      <Back to={origin}>Calendar</Back>
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
      <Stack className="gap-2">
        <p className="text-xs text-muted">
          {o.item.programTitle} · {dateLabel(o.item.localDate)}
        </p>
        <h1>{o.item.title}</h1>
        <p role="status" className="text-muted">
          {o.item.status === 'DONE'
            ? 'Completed'
            : status === 'ACTIVE'
              ? 'In progress'
              : status === 'PAUSED'
                ? 'Paused'
                : o.item.status === 'NOT_PARTICIPATING'
                  ? 'Not participating'
                  : 'Ready'}
        </p>
      </Stack>
      <Panel>
        <Stack>
          <h2>Today&apos;s Results</h2>
          <OccurrenceInstructions
            instructions={o.instructions}
            locked={o.item.locked}
          />
          {resultInputs.length ? (
            resultInputs.map((m) => (
              <MetricInput
                key={metricKey(m)}
                metric={m}
                value={dirty[metricKey(m)] ?? m.recorded}
                disabled={disabled || status === 'FINISHED'}
                onChange={(value) =>
                  setDirty((prev) => ({ ...prev, [metricKey(m)]: value }))
                }
              />
            ))
          ) : (
            <p className="text-muted">
              No results to record for this Activity.
            </p>
          )}
          {Object.keys(dirty).length > 0 && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => void perform()}
            >
              Save results
            </Button>
          )}
        </Stack>
      </Panel>
      {o.collaborators && (
        <Panel>
          <Stack>
            <Row className="justify-between">
              <Row className="gap-2">
                <h2>Collaborators</h2>
                <UnreadDot count={o.collaborators.unreadCount} inline />
              </Row>
              <Row className="gap-2">
                <p className="text-xs text-muted">
                  {o.collaborators.finishedCount}/{o.collaborators.totalCount}{' '}
                  finished
                </p>
                <Link
                  to={`/groups/${o.collaborators.groupId}`}
                  className={linkButton}
                >
                  Open Group
                </Link>
              </Row>
            </Row>
            <AvatarStack
              people={o.collaborators.members.map((m) => ({
                id: m.user.id,
                name: m.user.displayName,
                avatarUrl: m.user.avatarUrl,
              }))}
              max={6}
            />
            <Stack className="gap-2">
              {o.collaborators.members.map((member) => (
                <div
                  key={member.user.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted"
                >
                  <span>
                    {member.user.displayName} ·{' '}
                    {member.status === 'DONE'
                      ? 'Completed'
                      : member.status === 'NOT_PARTICIPATING'
                        ? 'Not participating'
                        : member.status === 'UNKNOWN'
                          ? 'Private'
                          : 'Planned'}
                  </span>
                  {member.completionShareId && (
                    <Row className="gap-1">
                      {(['👏', '🔥'] as const).map((emoji) => {
                        const existing = member.reactions.find(
                          (r) => r.emoji === emoji,
                        )
                        const active = existing?.reactedByMe ?? false
                        const count = existing?.count ?? 0
                        return (
                          <button
                            key={emoji}
                            type="button"
                            disabled={disabled}
                            aria-pressed={active}
                            aria-label={`React ${emoji} to ${member.user.displayName}`}
                            onClick={() =>
                              active
                                ? removeReaction.mutate({
                                    shareId: member.completionShareId!,
                                    emoji,
                                  })
                                : addReaction.mutate({
                                    shareId: member.completionShareId!,
                                    emoji,
                                    idempotencyKey: crypto.randomUUID(),
                                  })
                            }
                            className={`min-h-11 rounded-full border px-2.5 py-1 text-xs ${
                              active
                                ? 'border-accent bg-accent/15 text-accent'
                                : 'bg-surface text-muted hover:bg-surface-muted'
                            }`}
                          >
                            {emoji} {count > 0 ? count : ''}
                          </button>
                        )
                      })}
                    </Row>
                  )}
                </div>
              ))}
            </Stack>
          </Stack>
        </Panel>
      )}
      <Panel>
        <Stack>
          <Row className="justify-between">
            <h2>Session</h2>
            <span className="text-xs text-muted">
              {status === 'READY' || status === 'ABANDONED'
                ? 'Ready to start'
                : status === 'ACTIVE'
                  ? 'In progress'
                  : status === 'PAUSED'
                    ? 'Paused'
                    : 'Completed'}
            </span>
          </Row>
          <p className="text-sm text-muted">
            Start when you begin. Pause for breaks; finish when you&apos;re done.
            Active time is calculated automatically.
          </p>
          <ErrorMessage error={failure || undo.error} />
          {!!failure && (
            <Button variant="outline" onClick={refresh}>
              Refresh Activity
            </Button>
          )}
          <Row>
            {(status === 'READY' || status === 'ABANDONED') && (
              <>
                <Button
                  disabled={disabled}
                  onClick={() => void perform('START')}
                >
                  Start
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void perform('FINISH')}
                >
                  Finish now
                </Button>
              </>
            )}
            {status === 'ACTIVE' && (
              <>
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void perform('PAUSE')}
                >
                  Pause
                </Button>
                <Button
                  disabled={disabled}
                  onClick={() => void perform('FINISH')}
                >
                  Finish Activity
                </Button>
              </>
            )}
            {status === 'PAUSED' && (
              <>
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void perform('RESUME')}
                >
                  Resume
                </Button>
                <Button
                  disabled={disabled}
                  onClick={() => void perform('FINISH')}
                >
                  Finish Activity
                </Button>
              </>
            )}
            {status === 'FINISHED' && (
              <>
                <Button
                  disabled={disabled}
                  onClick={() => void perform('START')}
                >
                  Start again
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled || undo.isPending}
                  onClick={() => undo.mutate(o.item.id)}
                >
                  Undo completion
                </Button>
              </>
            )}
            <SessionCapture attach={attachToSession} disabled={disabled} />
          </Row>
          {busy && <p role="status">Saving…</p>}
          {session?.status === 'FINISHED' && (
            <p className="text-muted">
              {session.isManualCompletion
                ? 'Manually completed · no measured duration'
                : `Active time · ${formatElapsed(session.activeSeconds)}`}
            </p>
          )}
        </Stack>
      </Panel>
      <Panel>
        <h2>My Metrics</h2>
        <Grid className="mt-4 grid-cols-3">
          {o.personalStats.slice(0, 3).map((stat) => (
            <div key={stat.key}>
              <p className="text-xs text-muted">{stat.label}</p>
              <p className="mt-2 font-display text-lg">{stat.value}</p>
            </div>
          ))}
        </Grid>
      </Panel>
      <OccurrenceMedia
        activityId={o.item.activityId}
        sessionId={o.session?.id}
        onAttach={(asset) => attachToSession(asset.id)}
        myMedia={o.myMedia}
        sharedMedia={o.sharedMedia}
        communityMedia={o.communityMedia}
        locked={o.item.locked}
      />
      {o.communityStats && (
        <Panel>
          <h2>Community Stats</h2>
          <p>
            {o.communityStats.participants} participants ·{' '}
            {o.communityStats.completions} completions ·{' '}
            {o.communityStats.publicMediaCount} media
          </p>
        </Panel>
      )}
    </>
  )
}
