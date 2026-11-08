import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ApiError,
  useActivities,
  useAddProgramPlacement,
  useAddProgramActivities,
  useAttachMedia,
  useCategories,
  useCopyActivity,
  useCurrentUser,
  useMyEnrollments,
  useJoinProgram,
  useCreateActivity,
  useProgramWorkspace,
  usePutActivityInstructions,
  useUpdateProgram,
  useActivity,
  useUpdateActivityDraft,
  useProgramPlacements,
  useDeleteProgramPlacement,
  useUpdateProgramPlacement,
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
import { MediaPicker } from '@/components/MediaPicker'
import { MediaAttachments } from '@/components/MediaAttachments'
import { Select } from '@/components/ui/Select'
import { useAutosave } from '@/lib/useAutosave'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { buildProgramUrl } from '@/lib/urls'
import { calendarUrl, today } from '@/lib/dates'
type Workspace = components['schemas']['ProgramWorkspace']
export function ProgramWorkspacePage() {
  const { id = '' } = useParams()
  const workspace = useProgramWorkspace(id)
  useDocumentTitle(
    workspace.data?.title
      ? `Workspace: ${workspace.data.title}`
      : workspace.isPending
        ? 'Workspace'
        : 'Workspace',
  )
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
          <TitleEditor key={ws.id} ws={ws} heading />
        ) : panel === 'calendar' ? (
          <ScheduleEditor ws={ws} />
        ) : panel === 'publish' ? (
          <PublishPreview ws={ws} />
        ) : (
          <>
            <Stack className="gap-2">
              <Row className="items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h1 className="sr-only">{ws.title}</h1>
                  <TitleEditor key={ws.id} ws={ws} />
                </div>
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
                  <WorkspaceActivity
                    key={a.activityId}
                    activity={a}
                    returnTo={base}
                  />
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
            <ScheduleEditor ws={ws} />
            {ws.visibility === 'PRIVATE' && ws.status !== 'ARCHIVED' && (
              <AddToCalendar
                ws={ws}
                refresh={() => void workspace.refetch()}
              />
            )}
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

function AddToCalendar({
  ws,
  refresh,
}: {
  ws: Workspace
  refresh: () => void
}) {
  const me = useCurrentUser()
  const enrollments = useMyEnrollments()
  const publish = usePublishProgram(ws.id)
  const join = useJoinProgram(ws.id)
  const navigate = useNavigate()
  const online = useOnline()
  const timezone =
    me.data?.data.preferences.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone
  const [startDate, setStartDate] = useState('')
  const idempotencyKeys = useRef(new Map<string, string>())
  useEffect(() => {
    setStartDate((current) => current || today(timezone))
  }, [timezone])
  const alreadyOnCalendar =
    enrollments.data?.pages
      .flatMap((page) => page.data)
      .some(
        (enrollment) =>
          enrollment.program.id === ws.id &&
          ['ACTIVE', 'PAUSED'].includes(enrollment.status),
      ) ?? false
  const busy = publish.isPending || join.isPending

  async function addToCalendar() {
    if (!online || busy || !startDate || alreadyOnCalendar) return

    try {
      let versionId = ws.latestPublishedVersionId
      if (ws.status !== 'PUBLISHED' || ws.hasUnpublishedChanges) {
        const published = await publish.mutateAsync({
          visibility: 'PRIVATE',
          accessMode: 'OPEN',
          expectedRevision: ws.draftRevision,
        })
        versionId = published.latestPublishedVersionId
      }
      if (!versionId) {
        throw new Error('The Program could not be prepared for your Calendar.')
      }

      await join.mutateAsync({
        programVersionId: versionId,
        startLocalDate: startDate,
        timezone,
        idempotencyKey: getIdempotencyKey(
          idempotencyKeys.current,
          versionId,
          startDate,
          timezone,
        ),
      })
      toast.success('Program added to Calendar')
      navigate(calendarUrl(startDate))
    } catch (error) {
      refresh()
      if (!(error instanceof ApiError)) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'The Program could not be added to your Calendar.',
        )
      }
    }
  }

  return (
    <Panel className="border-accent/30">
      <Stack className="gap-3">
        <div>
          <p className="page-kicker">03 · Put your Program on the Calendar</p>
          <h2>Add to Calendar</h2>
          <p className="mt-1 text-sm text-muted">
            Save a private snapshot of this Program and schedule it for
            yourself. The original source stays unchanged.
          </p>
        </div>
        {ws.activityCount === 0 && (
          <p className="text-sm text-attention">
            Add at least one Activity before scheduling this Program.
          </p>
        )}
        {alreadyOnCalendar ? (
          <p role="status" className="text-sm text-muted">
            This Program is already on your Calendar.
          </p>
        ) : (
          <>
            {enrollments.isPending && (
              <p role="status" className="text-sm text-muted">
                Checking your Calendar…
              </p>
            )}
            <Row className="justify-between">
              <label className="space-y-2">
                <span className="text-sm font-semibold">Start date</span>
                <Input
                  type="date"
                  required
                  min={today(timezone)}
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value)
                  }}
                />
              </label>
              <Button
                disabled={
                  !online ||
                  busy ||
                  ws.activityCount === 0 ||
                  !startDate ||
                  enrollments.isPending
                }
                loading={busy}
                onClick={() => void addToCalendar()}
              >
                Add to Calendar
              </Button>
            </Row>
          </>
        )}
        <ErrorMessage
          error={enrollments.error || publish.error || join.error}
          retry={
            enrollments.error
              ? () => void enrollments.refetch()
              : undefined
          }
        />
      </Stack>
    </Panel>
  )
}

function getIdempotencyKey(
  keys: Map<string, string>,
  programVersionId: string,
  startDate: string,
  timezone: string,
) {
  const signature = `${programVersionId}:${startDate}:${timezone}`
  let key = keys.get(signature)
  if (!key) {
    key = crypto.randomUUID()
    keys.set(signature, key)
  }
  return key
}

function WorkspaceActivity({
  activity,
  returnTo,
}: {
  activity: Workspace['activities'][number]
  returnTo: string
}) {
  const detail = useActivity(activity.activityId)
  const update = useUpdateActivityDraft(activity.activityId)
  const attachMedia = useAttachMedia()
  const online = useOnline()
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!detail.data) return
    setTitle(detail.data.title)
    setSummary(detail.data.summary ?? '')
  }, [detail.data?.id, detail.data?.draftRevision])
  const context =
    detail.data?.revisionId
      ? {
          kind: 'Activity' as const,
          revisionId: detail.data.revisionId,
        }
      : undefined
  const hasChanges =
    !!detail.data &&
    (title !== detail.data.title ||
      summary !== (detail.data.summary ?? ''))

  return (
    <article className="rounded-lg border p-3">
      <Row className="items-start">
        <Link
          to={`/activities/${activity.activityId}?returnTo=${encodeURIComponent(returnTo)}`}
          className="min-w-0 flex-1 transition-colors hover:text-accent"
        >
          <Row className="justify-between gap-2">
            <strong className="truncate">{activity.title}</strong>
            <span className="shrink-0 text-xs text-muted">
              {activity.instructionCount} instructions · {activity.mediaCount}{' '}
              media
            </span>
          </Row>
          <p className="mt-2 text-xs text-muted">
            {activity.metrics.filter(
              (label) => !label.toLowerCase().startsWith('duration'),
            ).length
              ? activity.metrics
                  .filter(
                    (label) => !label.toLowerCase().startsWith('duration'),
                  )
                  .join(' · ')
              : 'No metrics'}
          </p>
        </Link>
        <span aria-hidden className="text-muted">
          ›
        </span>
      </Row>
      {detail.data?.canEdit ? (
        <details
          className="mt-3 border-t pt-3"
          onToggle={(event) => setEditing(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm font-semibold">
            Edit Activity details
          </summary>
          {editing && <Stack className="mt-3">
            <ErrorMessage
              error={detail.error || update.error || attachMedia.error}
              retry={detail.error ? () => void detail.refetch() : undefined}
            />
            <label className="space-y-2">
              Activity title
              <Input
                maxLength={140}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              Description
              <textarea
                className="textarea min-h-20"
                maxLength={500}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </label>
            <Button
              disabled={
                !hasChanges || !title.trim() || !online || update.isPending
              }
              loading={update.isPending}
              onClick={async () => {
                if (!detail.data) return
                try {
                  const updated = await update.mutateAsync({
                    expectedRevision: detail.data.draftRevision,
                    ...(title.trim() !== detail.data.title
                      ? { title: title.trim() }
                      : {}),
                    ...(summary !== (detail.data.summary ?? '')
                      ? { summary: summary.trim() || null }
                      : {}),
                  })
                  setTitle(updated.title)
                  setSummary(updated.summary ?? '')
                  toast.success('Activity updated')
                } catch {
                  /* Keep edits available for retry. */
                }
              }}
            >
              Save Activity
            </Button>
            {context && (
              <>
                <h3 className="font-semibold">Activity media</h3>
                <Button
                  variant="outline"
                  disabled={!online || attachMedia.isPending}
                  onClick={() => setMediaPickerOpen(true)}
                >
                  Add media
                </Button>
                <MediaAttachments context={context} />
              </>
            )}
          </Stack>}
        </details>
      ) : (
        <p className="mt-3 border-t pt-3 text-xs text-muted">
          Copy this Activity from suggestions to customize its details.
        </p>
      )}
      {mediaPickerOpen && context && (
        <MediaPicker
          context={context}
          title="Add Activity media"
          onClose={() => setMediaPickerOpen(false)}
          onSelect={async (asset) => {
            await attachMedia.mutateAsync({
              mediaId: asset.id,
              target: { kind: 'ACTIVITY_REVISION', id: context.revisionId },
              purpose: 'DEMONSTRATION',
            })
          }}
        />
      )}
    </article>
  )
}
function ActivityPicker({ ws, close }: { ws: Workspace; close: string }) {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<
    components['schemas']['ActivitySummary'][]
  >([])
  const [prepared, setPrepared] = useState<Record<string, string>>({})
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [instruction, setInstruction] = useState('')
  const [instructionSaved, setInstructionSaved] = useState(false)
  const [newActivity, setNewActivity] = useState<
    components['schemas']['ActivityDetail'] | null
  >(null)
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [attachedCount, setAttachedCount] = useState(0)
  const activities = useActivities(q, ws.focus?.id ?? '')
  const categories = useCategories()
  const me = useCurrentUser()
  const add = useAddProgramActivities(ws.id)
  const copy = useCopyActivity()
  const create = useCreateActivity()
  const putInstructions = usePutActivityInstructions()
  const attachMedia = useAttachMedia()
  const navigate = useNavigate()
  const online = useOnline()
  const rows = activities.data?.pages.flatMap((p) => p.data) ?? []
  const selectedRows = selected
  const context =
    newActivity?.revisionId
      ? {
          kind: 'Activity' as const,
          revisionId: newActivity.revisionId,
        }
      : undefined

  async function createActivity() {
    try {
      const created = await create.mutateAsync({
        title: title.trim(),
        categoryId,
        focusIds: ws.focus ? [ws.focus.id] : [],
        summary: summary.trim() || null,
      })
      setNewActivity(created)
      setInstructionSaved(!instruction.trim())
      if (instruction.trim()) {
        const updated = await putInstructions.mutateAsync({
          activityId: created.id,
          instructions: [{ body: instruction.trim() }],
          expectedRevision: created.draftRevision,
        })
        setNewActivity(updated)
        setInstructionSaved(true)
      }
    } catch {
      /* Keep the form and any created draft available for retry. */
    }
  }

  async function saveInstruction() {
    if (!newActivity || !instruction.trim()) return
    try {
      const updated = await putInstructions.mutateAsync({
        activityId: newActivity.id,
        instructions: [{ body: instruction.trim() }],
        expectedRevision: newActivity.draftRevision,
      })
      setNewActivity(updated)
      setInstructionSaved(true)
    } catch {
      /* Preserve the draft text for retry. */
    }
  }

  async function addSelected() {
    try {
      const activityIds: string[] = []
      for (const activity of selectedRows) {
        let id = prepared[activity.id] ?? ''
        if (!id) {
          const ownerId = activity.creator?.id
          id =
            ownerId && ownerId === me.data?.data.id
              ? activity.id
              : (
                  await copy.mutateAsync({
                    activityId: activity.id,
                    ...(activity.revisionId
                      ? { sourceRevisionId: activity.revisionId }
                      : {}),
                  })
                ).id
          setPrepared((previous) => ({ ...previous, [activity.id]: id }))
        }
        activityIds.push(id)
      }
      await add.mutateAsync({
        activityIds,
        expectedRevision: ws.draftRevision,
      })
      toast.success('Activities added')
      navigate(close)
    } catch {
      /* Preserve prepared copies and selections for retry. */
    }
  }

  return (
    <>
      <Stack>
        <h1>Add Activities</h1>
        <Panel>
          <Stack>
            <div>
              <h2>Create a new Activity</h2>
              <p className="text-sm text-muted">
                Start with your own title and description. Add relevant media;
                instructions are optional.
              </p>
            </div>
            {newActivity ? (
              <>
                <div>
                  <h3 className="font-semibold">{newActivity.title}</h3>
                  <p className="text-sm text-muted">
                    {newActivity.summary || 'No description'}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {newActivity.instructionCount} instructions ·{' '}
                    {newActivity.mediaCount + attachedCount}{' '}
                    media
                  </p>
                </div>
                {!instructionSaved && instruction.trim() && (
                  <Button
                    variant="outline"
                    disabled={putInstructions.isPending || !online}
                    loading={putInstructions.isPending}
                    onClick={() => void saveInstruction()}
                  >
                    Retry saving instructions
                  </Button>
                )}
                {context ? (
                  <Button
                    variant="outline"
                    disabled={!online || attachMedia.isPending}
                    onClick={() => setMediaPickerOpen(true)}
                  >
                    Add media
                  </Button>
                ) : (
                  <p className="text-sm text-attention">
                    This Activity draft has no editable media revision.
                  </p>
                )}
                <Button
                  disabled={
                    !online ||
                    !instructionSaved ||
                    add.isPending ||
                    create.isPending
                  }
                  loading={add.isPending}
                  onClick={async () => {
                    try {
                      await add.mutateAsync({
                        activityIds: [newActivity.id],
                        expectedRevision: ws.draftRevision,
                      })
                      toast.success('Activity added')
                      navigate(close)
                    } catch {
                      /* Keep the created Activity available for retry. */
                    }
                  }}
                >
                  Add Activity to Program
                </Button>
              </>
            ) : (
              <>
                <ErrorMessage
                  error={categories.error || create.error || putInstructions.error}
                  retry={
                    categories.error
                      ? () => void categories.refetch()
                      : undefined
                  }
                />
                <label className="space-y-2">
                  Activity title
                  <Input
                    maxLength={140}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label className="space-y-2">
                  Description
                  <textarea
                    className="textarea min-h-24"
                    maxLength={500}
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                  />
                </label>
                {categories.isPending ? (
                  <Loading />
                ) : (
                  <label className="space-y-2">
                    Category
                    <Select
                      value={categoryId}
                      onChange={(event) => setCategoryId(event.target.value)}
                    >
                      <option value="">Choose a category</option>
                      {categories.data?.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
                <label className="space-y-2">
                  Instructions (optional)
                  <textarea
                    className="textarea min-h-24"
                    maxLength={2000}
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                  />
                </label>
                <Button
                  disabled={
                    !title.trim() ||
                    !categoryId ||
                    !online ||
                    create.isPending ||
                    categories.isPending
                  }
                  loading={create.isPending || putInstructions.isPending}
                  onClick={() => void createActivity()}
                >
                  Continue to media
                </Button>
              </>
            )}
          </Stack>
        </Panel>

        <ErrorMessage
          error={
        putInstructions.error ||
        attachMedia.error ||
        add.error ||
        copy.error
          }
        />
        <details className="rounded-lg border bg-surface p-4">
          <summary className="cursor-pointer font-semibold">
            Browse suggestions to customize
          </summary>
          <Stack className="mt-4">
            <p className="text-sm text-muted">
              Suggestions are starting points. Public and platform Activities
              are copied to your library before being added.
            </p>
            <label className="space-y-2">
              Search Activities
              <Input value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <ErrorMessage
              error={activities.error || add.error || copy.error}
              retry={() => void activities.refetch()}
            />
            {activities.isPending ? (
              <Loading />
            ) : (
              <Stack className="gap-2">
                {(q ? rows : rows.slice(0, 4)).map((activity) => {
                  const included = ws.activities.some(
                    (item) => item.activityId === activity.id,
                  )
                  return (
                    <button
                      type="button"
                      key={activity.id}
                      disabled={included || add.isPending || copy.isPending}
                      aria-pressed={
                        selected.some((item) => item.id === activity.id) ||
                        included
                      }
                      onClick={() =>
                        setSelected((ids) =>
                          ids.some((item) => item.id === activity.id)
                            ? ids.filter((item) => item.id !== activity.id)
                            : [...ids, activity],
                        )
                      }
                      className={`min-h-16 rounded-lg border bg-surface p-4 text-left disabled:opacity-60 ${selected.some((item) => item.id === activity.id) ? 'border-accent ring-1 ring-accent' : ''}`}
                    >
                      <Row className="justify-between">
                        <strong>{activity.title}</strong>
                        <span className="text-xs text-muted">
                          {included
                            ? 'Already in Program'
                            : selected.some((item) => item.id === activity.id)
                              ? prepared[activity.id]
                                ? 'Copy ready'
                                : 'Selected'
                              : 'Prefiller'}
                        </span>
                      </Row>
                      <p className="mt-1 text-xs text-muted">
                        {activity.summary || 'No description'}
                      </p>
                    </button>
                  )
                })}
              </Stack>
            )}
            {!activities.isPending && !rows.length && (
              <p>No Activities found.</p>
            )}
            {activities.hasNextPage && (
              <Button
                variant="outline"
                onClick={() => void activities.fetchNextPage()}
              >
                Load more
              </Button>
            )}
            <Button
              disabled={
                !selected.length ||
                !online ||
                add.isPending ||
                copy.isPending
              }
              loading={add.isPending || copy.isPending}
              onClick={() => void addSelected()}
            >
              Use {selected.length || ''} selected {selected.length === 1 ? 'Activity' : 'Activities'}
            </Button>
          </Stack>
        </details>
      </Stack>
      {mediaPickerOpen && context && (
        <MediaPicker
          context={context}
          title="Add Activity media"
          onClose={() => setMediaPickerOpen(false)}
          onSelect={async (asset) => {
            await attachMedia.mutateAsync({
              mediaId: asset.id,
              target: { kind: 'ACTIVITY_REVISION', id: context.revisionId },
              purpose: 'DEMONSTRATION',
            })
            setAttachedCount((count) => count + 1)
          }}
        />
      )}
    </>
  )
}
function TitleEditor({
  ws,
  heading = false,
}: {
  ws: Workspace
  heading?: boolean
}) {
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
    <Stack className="gap-2">
      {heading && <h1>Program name</h1>}
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Program name
        </span>
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
    </Stack>
  )
}
function ScheduleEditor({ ws }: { ws: Workspace }) {
  const placements = useProgramPlacements(ws.id)
  const update = useUpdateProgram(ws.id)
  const addPlacement = useAddProgramPlacement(ws.id)
  const movePlacement = useUpdateProgramPlacement(ws.id)
  const removePlacement = useDeleteProgramPlacement(ws.id)
  const online = useOnline()
  const [week, setWeek] = useState(0)
  const [day, setDay] = useState('0')
  const [activityId, setActivityId] = useState('')
  const cycleDays = ws.durationDays ?? 7
  const selectedPlacements =
    placements.data?.filter((placement) => placement.relativeDay === Number(day)) ??
    []
  const placementBusy =
    addPlacement.isPending ||
    movePlacement.isPending ||
    removePlacement.isPending
  return (
    <Panel>
      <Stack>
      <div>
        <h2>Schedule &amp; placement</h2>
        <p className="text-sm text-muted">
          The schedule is generated from your duration and frequency. Select a
          day to move, remove, or add an Activity.
        </p>
      </div>
      <Panel>
        <Stack>
          <h3>Duration</h3>
          <Row>
            {[7, 14, 28, 56, null].map((days) => (
              <Button
                key={days ?? 'ongoing'}
                variant={ws.durationDays === days ? 'default' : 'outline'}
                disabled={!online || update.isPending}
                onClick={() =>
                  update.mutate({
                    durationDays: days,
                    expectedRevision: ws.draftRevision,
                  })
                }
              >
                {days === null
                  ? 'Ongoing'
                  : `${days / 7} ${days === 7 ? 'week' : 'weeks'}`}
              </Button>
            ))}
          </Row>
          <h3>Frequency</h3>
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
          disabled={(week + 1) * 7 >= cycleDays}
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
      <Stack className="gap-2">
        <h3>Activities on day {Number(day) + 1}</h3>
        {selectedPlacements.map((placement) => (
          <Row
            key={placement.id}
            className="justify-between rounded-lg border p-3"
          >
            <span className="min-w-0 flex-1">
              <strong>{placement.title}</strong>
              {placement.localTime && (
                <span className="ml-2 text-xs text-muted">
                  {placement.localTime}
                </span>
              )}
            </span>
            <Row className="gap-1">
              <Button
                variant="outline"
                aria-label={`Move ${placement.title} one day earlier`}
                disabled={
                  !online ||
                  placementBusy ||
                  placement.relativeDay <= 0 ||
                  (ws.durationDays !== null &&
                    placement.relativeDay > ws.durationDays - 1)
                }
                onClick={() =>
                  movePlacement.mutate({
                    placementId: placement.id,
                    relativeDay: placement.relativeDay - 1,
                    expectedRevision: ws.draftRevision,
                  })
                }
              >
                − Day
              </Button>
              <Button
                variant="outline"
                aria-label={`Move ${placement.title} one day later`}
                disabled={
                  !online ||
                  placementBusy ||
                  placement.relativeDay >= cycleDays - 1
                }
                onClick={() =>
                  movePlacement.mutate({
                    placementId: placement.id,
                    relativeDay: placement.relativeDay + 1,
                    expectedRevision: ws.draftRevision,
                  })
                }
              >
                + Day
              </Button>
              <Button
                variant="ghost"
                disabled={!online || placementBusy}
                onClick={() =>
                  removePlacement.mutate({
                    placementId: placement.id,
                    expectedRevision: ws.draftRevision,
                  })
                }
              >
                Remove
              </Button>
            </Row>
          </Row>
        ))}
        {!selectedPlacements.length && (
          <p className="text-sm text-muted">No Activities on this day yet.</p>
        )}
        {ws.activities.length > 0 && (
          <Row className="items-end">
            <label className="min-w-0 flex-1 space-y-2">
              Add an Activity to this day
              <Select
                value={activityId}
                onChange={(event) => setActivityId(event.target.value)}
              >
                <option value="">Choose an Activity</option>
                {ws.activities.map((activity) => (
                  <option key={activity.activityId} value={activity.activityId}>
                    {activity.title}
                  </option>
                ))}
              </Select>
            </label>
            <Button
              disabled={!activityId || !online || placementBusy}
              loading={addPlacement.isPending}
              onClick={() =>
                addPlacement.mutate({
                  activityId,
                  relativeDay: Number(day),
                  expectedRevision: ws.draftRevision,
                })
              }
            >
              Add to day
            </Button>
          </Row>
        )}
        <ErrorMessage
          error={
            placements.error ||
            addPlacement.error ||
            movePlacement.error ||
            removePlacement.error ||
            update.error
          }
          retry={
            placements.error
              ? () => void placements.refetch()
              : undefined
          }
        />
      </Stack>
      </Stack>
    </Panel>
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
            navigate(buildProgramUrl({ id: ws.id, title: ws.title }))
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
