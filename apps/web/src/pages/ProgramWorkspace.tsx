import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ApiError,
  useActivities,
  useAddProgramActivities,
  useProgramWorkspace,
  useUpdateProgram,
  useProgramPlacements,
  usePublishCheck,
  usePublishProgram,
  type components,
} from '@project/sdk'
import { toast } from 'sonner'
import { Page, Stage, Stack, Row, Grid, Panel } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/Navigation'
import { CalendarSurface } from '@/components/CalendarSurface'
import { useAutosave } from '@/lib/useAutosave'
import { useOnline } from '@/lib/useOnline'
type Workspace = components['schemas']['ProgramWorkspace']
export function ProgramWorkspacePage() {
  const { id = '' } = useParams()
  const workspace = useProgramWorkspace(id)
  const [params] = useSearchParams()
  if (!workspace.data)
    return (
      <Page>
        <Back to="/library" />
        <ErrorMessage
          error={workspace.error}
          retry={() => void workspace.refetch()}
        />
        {workspace.isPending && <Loading />}
      </Page>
    )
  const ws = workspace.data
  const base = `/programs/${id}/workspace`
  const panel = params.get('panel')
  return (
    <Page>
      <Stage>
        <Back to={panel ? base : '/library'}>
          {panel ? 'Workspace' : 'My Programs'}
        </Back>
        <ErrorMessage error={workspace.error} />
        {panel === 'activities' ? (
          <ActivityPicker ws={ws} close={base} />
        ) : panel === 'edit' ? (
          <TitleEditor key={ws.id} ws={ws} />
        ) : panel === 'calendar' ? (
          <ScheduleEditor ws={ws} />
        ) : panel === 'publish' ? (
          <PublishPreview ws={ws} />
        ) : (
          <>
            <Stack className="gap-2">
              <Row className="justify-between">
                <h1>{ws.title}</h1>
                <span className="text-xs text-muted">
                  {ws.hasUnpublishedChanges || ws.status === 'DRAFT'
                    ? 'Draft'
                    : 'Published'}
                </span>
              </Row>
              <p className="text-muted">
                {ws.type.label}
                {ws.focus ? ` · ${ws.focus.label}` : ''} ·{' '}
                {ws.durationDays ? `${ws.durationDays / 7} weeks` : 'Ongoing'}
              </p>
              <p className="text-muted">
                {ws.frequencyLabel} · {ws.programDays ?? 0} program days
              </p>
              <Row className="mt-2">
                <Link to={`${base}?panel=edit`} className={linkButton}>
                  Edit
                </Link>
                <Link to={`${base}?panel=calendar`} className={linkButton}>
                  Calendar
                </Link>
              </Row>
            </Stack>
            <Panel>
              <Row className="justify-between">
                <h2>Activities</h2>
                <Link to={`${base}?panel=activities`} className={linkButton}>
                  + Add
                </Link>
              </Row>
              <p className="my-4 text-xs text-muted">
                {ws.activityCount} activities · {ws.instructionCount}{' '}
                instructions
              </p>
              <Stack className="gap-2">
                {ws.activities.map((a) => (
                  <Link
                    key={a.activityId}
                    to={`/activities/${a.activityId}?returnTo=${encodeURIComponent(base)}`}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-accent"
                  >
                    <span className="min-w-0 flex-1">
                      <Row className="justify-between gap-2">
                        <strong className="truncate">{a.title}</strong>
                        <span className="shrink-0 text-xs text-muted">
                          {a.instructionCount} instructions · {a.mediaCount}{' '}
                          media
                        </span>
                      </Row>
                      <p className="mt-2 text-xs text-muted">
                        {a.metrics.length
                          ? a.metrics.join(' · ')
                          : 'No metrics'}
                      </p>
                    </span>
                    <span aria-hidden className="text-muted">
                      ›
                    </span>
                  </Link>
                ))}
                {!ws.activities.length && (
                  <Stack className="items-start py-2">
                    <p>No activities yet</p>
                    <Link
                      to={`${base}?panel=activities`}
                      className={linkButton}
                    >
                      Add Activity
                    </Link>
                  </Stack>
                )}
              </Stack>
            </Panel>
            <Link
              to={`${base}?panel=publish`}
              className={linkButton + ' bg-accent text-white'}
            >
              Preview &amp; Publish
            </Link>
          </>
        )}
      </Stage>
    </Page>
  )
}
function ActivityPicker({ ws, close }: { ws: Workspace; close: string }) {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const activities = useActivities(q, ws.focus?.id ?? '')
  const add = useAddProgramActivities(ws.id)
  const navigate = useNavigate()
  const online = useOnline()
  const rows = activities.data?.pages.flatMap((p) => p.data) ?? []
  return (
    <>
      <h1>Choose Activities</h1>
      <label className="space-y-2">
        Search Activities
        <Input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <ErrorMessage
        error={activities.error || add.error}
        retry={() => void activities.refetch()}
      />
      {activities.isPending ? (
        <Loading />
      ) : (
        <Stack className="gap-2">
          {rows.map((a) => {
            const included = ws.activities.some((x) => x.activityId === a.id)
            return (
              <button
                type="button"
                key={a.id}
                disabled={included || add.isPending}
                aria-pressed={selected.includes(a.id) || included}
                onClick={() =>
                  setSelected((ids) =>
                    ids.includes(a.id)
                      ? ids.filter((id) => id !== a.id)
                      : [...ids, a.id],
                  )
                }
                className={`min-h-20 rounded-lg border bg-surface p-4 text-left disabled:opacity-60 ${selected.includes(a.id) ? 'border-accent ring-1 ring-accent' : ''}`}
              >
                <Row className="justify-between">
                  <strong>{a.title}</strong>
                  <span className="text-xs text-muted">
                    {included
                      ? 'Added'
                      : selected.includes(a.id)
                        ? 'Selected'
                        : a.isPlatform
                          ? 'Platform'
                          : ''}
                  </span>
                </Row>
                <p className="mt-2 text-xs text-muted">
                  {a.instructionCount} instructions ·{' '}
                  {a.metricLabels.join(' · ')}
                </p>
              </button>
            )
          })}
        </Stack>
      )}
      {!activities.isPending && !rows.length && <p>No Activities found.</p>}
      {activities.hasNextPage && (
        <Button
          variant="outline"
          onClick={() => void activities.fetchNextPage()}
        >
          Load more
        </Button>
      )}
      <Button
        disabled={!selected.length || !online}
        loading={add.isPending}
        onClick={async () => {
          try {
            await add.mutateAsync({
              activityIds: selected,
              expectedRevision: ws.draftRevision,
            })
            toast.success('Activities added')
            navigate(close)
          } catch {
            /* preserve selection */
          }
        }}
      >
        Add {selected.length || ''} Activities
      </Button>
    </>
  )
}
function TitleEditor({ ws }: { ws: Workspace }) {
  const update = useUpdateProgram(ws.id)
  const online = useOnline()
  const draft = useAutosave(
    ws.title,
    ws.draftRevision,
    (title, expectedRevision) =>
      update.mutateAsync({ title, expectedRevision }),
    online,
  )
  const conflict =
    draft.error instanceof ApiError && draft.error.code === 'VERSION_CONFLICT'
  return (
    <>
      <h1>Edit title</h1>
      <label className="space-y-2">
        Program title
        <Input
          maxLength={140}
          value={draft.value}
          onChange={(e) => draft.setValue(e.target.value)}
        />
      </label>
      <p role="status" className="text-xs text-muted">
        {draft.pending
          ? 'Saving…'
          : !online && draft.dirty
            ? 'Offline · changes have not been saved'
            : draft.error
              ? 'Not saved'
              : !draft.value.trim()
                ? 'Enter a title to save'
                : draft.dirty
                  ? online
                    ? 'Unsaved changes'
                    : 'Offline · changes have not been saved'
                  : 'Saved'}
      </p>
      <ErrorMessage
        error={draft.error}
        retry={conflict ? undefined : draft.retry}
      />
      {conflict && (
        <Panel>
          <Stack>
            <p>A newer version exists. Your title is still here.</p>
            <p className="text-muted">Server title: {ws.title}</p>
            <Button
              variant="outline"
              onClick={() => draft.reload(ws.title, ws.draftRevision)}
            >
              Discard my edit and use server title
            </Button>
            <Button
              onClick={() => {
                const value = draft.value
                draft.reload(ws.title, ws.draftRevision)
                draft.setValue(value)
              }}
            >
              Save my title against this version
            </Button>
          </Stack>
        </Panel>
      )}
      {draft.blocker.state === 'blocked' && (
        <Panel aria-label="Unsaved changes">
          <Stack>
            <p>You have unsaved changes.</p>
            <Button autoFocus onClick={() => draft.blocker.reset?.()}>
              Keep editing
            </Button>
            <Button
              variant="outline"
              disabled={draft.pending}
              onClick={() => draft.blocker.proceed?.()}
            >
              Discard changes and leave
            </Button>
          </Stack>
        </Panel>
      )}
    </>
  )
}
function ScheduleEditor({ ws }: { ws: Workspace }) {
  const placements = useProgramPlacements(ws.id)
  const update = useUpdateProgram(ws.id)
  const online = useOnline()
  const [week, setWeek] = useState(0)
  const [day, setDay] = useState('0')
  return (
    <>
      <h1>Review schedule</h1>
      <p className="text-muted">
        {ws.frequencyLabel} · {ws.programDays} program days
      </p>
      <Panel>
        <Stack>
          <h2>Duration</h2>
          <Row>
            {[7, 14, 28, 56].map((days) => (
              <Button
                key={days}
                variant={ws.durationDays === days ? 'default' : 'outline'}
                disabled={!online || update.isPending}
                onClick={() =>
                  update.mutate({
                    durationDays: days,
                    expectedRevision: ws.draftRevision,
                  })
                }
              >
                {days / 7} {days === 7 ? 'week' : 'weeks'}
              </Button>
            ))}
          </Row>
          <h2>Frequency</h2>
          <Row>
            {(
              [
                { kind: 'DAILY', label: 'Daily' },
                { kind: 'WEEKDAYS', label: 'Weekdays' },
                { kind: 'N_PER_WEEK', n: 3, label: '3 days/week' },
              ] as const
            ).map(({ label, ...frequency }) => (
              <Button
                key={label}
                variant={
                  ws.frequency?.kind === frequency.kind ? 'default' : 'outline'
                }
                disabled={!online || update.isPending}
                onClick={() =>
                  update.mutate({
                    frequency,
                    expectedRevision: ws.draftRevision,
                  })
                }
              >
                {label}
              </Button>
            ))}
          </Row>
        </Stack>
      </Panel>
      <ErrorMessage error={placements.error || update.error} />
      <Row className="justify-between">
        <Button
          variant="outline"
          disabled={week === 0}
          onClick={() => {
            setWeek(week - 1)
            setDay(String((week - 1) * 7))
          }}
        >
          Previous
        </Button>
        <span>Week {week + 1}</span>
        <Button
          variant="outline"
          disabled={(week + 1) * 7 >= (ws.durationDays ?? 7)}
          onClick={() => {
            setWeek(week + 1)
            setDay(String((week + 1) * 7))
          }}
        >
          Next
        </Button>
      </Row>
      {placements.isPending ? (
        <Loading />
      ) : (
        <CalendarSurface
          days={Array.from({ length: 7 }, (_, i) => ({
            id: String(week * 7 + i),
            label: 'Day',
            number: String(week * 7 + i + 1),
          }))}
          selected={day}
          onSelect={setDay}
          items={(placements.data ?? []).map((p) => ({
            id: p.id,
            day: String(p.relativeDay),
            title: p.title,
            detail: p.localTime ?? undefined,
          }))}
        />
      )}
    </>
  )
}
function PublishPreview({ ws }: { ws: Workspace }) {
  const check = usePublishCheck(ws.id)
  const publish = usePublishProgram(ws.id)
  const online = useOnline()
  const navigate = useNavigate()
  const [visibility, setVisibility] = useState<
    'PUBLIC' | 'UNLISTED' | 'PRIVATE'
  >('PUBLIC')
  return (
    <>
      <h1>Preview &amp; Publish</h1>
      <Panel>
        <Stack>
          <h2 className="font-display text-xl">{ws.title}</h2>
          <p className="text-muted">
            {ws.type.label} · {ws.frequencyLabel} · {ws.programDays} program
            days
          </p>
          {ws.activities.map((a) => (
            <p key={a.activityId}>
              {a.title} · {a.instructionCount} instructions
            </p>
          ))}
        </Stack>
      </Panel>
      <h2>Who can find it?</h2>
      <Row>
        {(['PUBLIC', 'UNLISTED', 'PRIVATE'] as const).map((v) => (
          <Button
            key={v}
            aria-pressed={visibility === v}
            variant={visibility === v ? 'default' : 'outline'}
            onClick={() => setVisibility(v)}
          >
            {v === 'PUBLIC'
              ? 'Public'
              : v === 'UNLISTED'
                ? 'Link only'
                : 'Private'}
          </Button>
        ))}
      </Row>
      <p className="text-muted">Free access</p>
      <ErrorMessage
        error={check.error || publish.error}
        retry={() => void check.refetch()}
      />
      {check.isPending && <Loading />}
      {check.data?.issues.map((issue) => (
        <p
          role="alert"
          className="text-danger"
          key={`${issue.code}:${issue.field}:${issue.activityId}`}
        >
          {issue.message}
        </p>
      ))}
      <Button
        disabled={!online || !check.data?.canPublish}
        loading={publish.isPending}
        onClick={async () => {
          try {
            await publish.mutateAsync({
              visibility,
              accessMode: 'OPEN',
              expectedRevision: ws.draftRevision,
            })
            toast.success('Program published')
            navigate(`/programs/${ws.id}`)
          } catch {
            /* show validation */
          }
        }}
      >
        Publish Program
      </Button>
    </>
  )
}
