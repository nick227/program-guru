import { ProgramGroups } from '@/components/ProgramGroups'
import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ApiError,
  useActivitySuggestions,
  useAddProgramPlacement,
  useAddProgramActivities,
  useAttachMedia,
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
  useMediaUpload,
  useInboundMedia,
  type components,
} from '@project/sdk'
import { Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Page, Stage, Stack, Row, Grid, Panel } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/Navigation'
import { CalendarSurface } from '@/components/CalendarSurface'
import { MediaAttachments } from '@/components/MediaAttachments'
import { ActivityBasicsFields } from '@/components/ActivityBasicsFields'
import { ProgramHeader } from '@/components/ProgramHeader'
import { ChangeImage } from '@/components/ChangeImage'
import { useCategorySlugOf } from '@/components/EntityHero'
import {
  useLibraryBrowser,
  type LibraryBrowserContext,
} from '@/components/LibraryBrowser'
import { SuggestionRail } from '@/components/SuggestionRail'
import { activityCard } from '@/lib/discoveryCards'
import { activityHero, programHero } from '@/lib/hero'
import { useActivityCover, useProgramCover } from '@/lib/useEntityCover'
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
        <TitleEditor key={ws.id} ws={ws} />
        <ErrorMessage error={workspace.error} />
        {panel === 'activities' ? (
          <ActivityPicker ws={ws} close={base} />
        ) : panel === 'edit' ? (
          <ProgramCover ws={ws} />
        ) : panel === 'calendar' ? (
          <ScheduleEditor ws={ws} />
        ) : panel === 'publish' ? (
          <PublishPreview ws={ws} />
        ) : (
          <>
            <Stack className="gap-2">
              <p className="text-muted">
                {ws.type.label}
                {ws.focus ? ` · ${ws.focus.label}` : ''} ·{' '}
                {ws.durationDays ? `${ws.durationDays / 7} weeks` : 'Ongoing'}
              </p>
              <p className="text-muted">
                {ws.frequencyLabel} · {ws.programDays ?? 0} program days
              </p>
            </Stack>
            {ws.description && <p className="whitespace-pre-wrap text-muted">{ws.description}</p>}
            <ProgramCover ws={ws} />
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
                      New Activity
                    </Link>
                  </Stack>
                )}
              </Stack>
            </Panel>
            <ScheduleEditor ws={ws} />
            {ws.visibility === 'PRIVATE' && ws.status !== 'ARCHIVED' && (
              <StartProgram
                ws={ws}
                refresh={() => void workspace.refetch()}
              />
            )}
            {ws.status !== 'ARCHIVED' && <WorkspaceTogether ws={ws} />}
            <Link
              to={`${base}?panel=publish`}
              className={linkButton + ' bg-accent text-white'}
            >
              Preview &amp; Publish
            </Link>
          </>
        )}
      </Stage>
      <WorkspaceBrowserOutlet ws={ws} />
    </Page>
  )
}

function WorkspaceTogether({ ws }: { ws: Workspace }) {
  const me = useCurrentUser()
  const enrollments = useMyEnrollments()
  const enrollment = enrollments.data?.pages.flatMap((page) => page.data).find(
    (entry) => entry.program.id === ws.id && entry.programVersionId === ws.latestPublishedVersionId && ['ACTIVE', 'PAUSED'].includes(entry.status),
  )
  return <ProgramGroups key={ws.latestPublishedVersionId} programId={ws.id} versionId={ws.latestPublishedVersionId} enrollmentId={enrollment?.id ?? null} isProgramOwner timezone={me.data?.data.preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone} />
}

/** Program image attachment below the Program details. */
function ProgramCover({ ws }: { ws: Workspace }) {
  const categorySlugOf = useCategorySlugOf()
  const cover = useProgramCover(ws)
  return (
    <ChangeImage
      label="Program cover"
      compact
      canEdit={ws.status !== 'ARCHIVED'}
      cover={cover}
      hero={programHero(ws, categorySlugOf)}
    />
  )
}

/**
 * Copy-or-reference, then add: own Activities are referenced, anything else
 * becomes a private copy first (08 §6). Shared by the rail and the browser.
 */
function useAddExistingActivity(ws: Workspace) {
  const me = useCurrentUser()
  const copy = useCopyActivity()
  const add = useAddProgramActivities(ws.id)
  return {
    pending: copy.isPending || add.isPending,
    error: copy.error || add.error,
    run: async (activity: components['schemas']['ActivitySummary']) => {
      const ownerId = activity.creator?.id
      const id =
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
      await add.mutateAsync({ activityIds: [id], expectedRevision: ws.draftRevision })
    },
  }
}

function WorkspaceBrowserOutlet({ ws }: { ws: Workspace }) {
  const addExisting = useAddExistingActivity(ws)
  const navigate = useNavigate()
  const context: LibraryBrowserContext = {
    kind: 'activities',
    categoryId: ws.type.categoryId || undefined,
    exclude: ws.activities.map((a) => a.activityId),
    actionLabel: 'Add to Program',
    onPick: (activity) => {
      void addExisting
        .run(activity)
        .then(() => {
          toast.success('Activity added')
          navigate(`/programs/${ws.id}/workspace`)
        })
        .catch((error: unknown) =>
          toast.error(error instanceof Error ? error.message : 'Could not add the Activity'),
        )
    },
  }
  return <Outlet context={context} />
}

function StartProgram({
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

  async function startProgram() {
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
      toast.success('Program started')
      navigate(calendarUrl(startDate))
    } catch (error) {
      refresh()
      if (!(error instanceof ApiError)) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'The Program could not be started.',
        )
      }
    }
  }

  return (
    <Panel className="border-accent/30">
      <Stack className="gap-3">
        <div>
          <h2>Start Program</h2>
        </div>
        {ws.activityCount === 0 && (
          <p className="text-sm text-attention">
            Add at least one Activity before starting this Program.
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
                onClick={() => void startProgram()}
              >
                Start Program
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
            {context && detail.data && (
              <>
                <ActivityImage
                  activity={detail.data}
                  revisionId={context.revisionId}
                />
                <h3 className="font-semibold">Demonstration media</h3>
                <AddDemonstrationMedia
                  revisionId={context.revisionId}
                  disabled={!online}
                />
                <MediaAttachments context={context} />
              </>
            )}
          </Stack>}
        </details>
      ) : (
        <p className="mt-3 border-t pt-3 text-xs text-muted">
          Copy this Activity to customize its details.
        </p>
      )}
    </article>
  )
}

function AddDemonstrationMedia({
  revisionId,
  disabled,
}: {
  revisionId: string
  disabled?: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<unknown>(null)
  const inbound = useInboundMedia({
    target: { kind: 'ACTIVITY_REVISION', id: revisionId },
    purpose: 'DEMONSTRATION',
    onSuccess: () => toast.success('Demonstration media attached'),
    onError: setError,
  })

  const working = inbound.busy || inbound.stage === 'processing'

  return (
    <div className="space-y-1">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        disabled={disabled || working}
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          setError(null)
          try {
            await inbound.upload(file)
          } catch (err) {
            setError(err)
          }
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || working}
        onClick={() => fileInputRef.current?.click()}
        className="gap-1.5"
      >
        {working ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <Upload size={14} aria-hidden />
        )}
        <span>{working ? 'Uploading…' : 'Add demonstration media'}</span>
      </Button>
      <ErrorMessage error={error || inbound.error} />
    </div>
  )
}

function ActivityImage({
  activity,
  revisionId,
}: {
  activity: components['schemas']['ActivityDetail']
  revisionId: string
}) {
  const categorySlugOf = useCategorySlugOf()
  const cover = useActivityCover(revisionId)
  return (
    <ChangeImage
      label="Activity image"
      canEdit
      cover={cover}
      hero={activityHero(activity, categorySlugOf)}
    />
  )
}

function ActivityPicker({ ws, close }: { ws: Workspace; close: string }) {
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [instruction, setInstruction] = useState('')
  const [instructionSaved, setInstructionSaved] = useState(false)
  const [newActivity, setNewActivity] = useState<
    components['schemas']['ActivityDetail'] | null
  >(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  const add = useAddProgramActivities(ws.id)
  const addExisting = useAddExistingActivity(ws)
  const create = useCreateActivity()
  const putInstructions = usePutActivityInstructions()
  const navigate = useNavigate()
  const online = useOnline()
  const browser = useLibraryBrowser()
  const categorySlugOf = useCategorySlugOf()
  const cover = useActivityCover(newActivity?.revisionId ?? null)
  const liveActivity = useActivity(newActivity?.id ?? '')
  const programCategoryId = ws.type.categoryId || ws.focus?.categoryId || ''
  const suggestions = useActivitySuggestions({
    categoryId: programCategoryId,
    focusId: ws.focus?.id,
    exclude: ws.activities.map((a) => a.activityId),
  })

  async function createActivity() {
    try {
      const created = await create.mutateAsync({
        title: title.trim(),
        categoryId: programCategoryId,
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

  return (
    <Stack>
      <h1>Add Activities</h1>
      <Panel>
        <Stack>
          <div>
            <h2>Create a new Activity</h2>
            <p className="text-sm text-muted">
              Start with your own title and description. Instructions are
              optional.
            </p>
          </div>
          {newActivity ? (
            <>
              <div>
                <h3 className="font-semibold">{newActivity.title}</h3>
                <p className="text-sm text-muted">
                  {newActivity.summary || 'No description'}
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
              {newActivity.revisionId ? (
                <ChangeImage
                  label="Activity image"
                  canEdit
                  cover={cover}
                  hero={activityHero(liveActivity.data ?? newActivity, categorySlugOf)}
                />
              ) : (
                <p className="text-sm text-attention">
                  This Activity draft has no editable image.
                </p>
              )}
              <ErrorMessage error={add.error} />
              <Button
                disabled={!online || !instructionSaved || add.isPending}
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
              <ErrorMessage error={create.error || putInstructions.error} />
              <ActivityBasicsFields
                title={title}
                summary={summary}
                instruction={instruction}
                onTitleChange={setTitle}
                onSummaryChange={setSummary}
                onInstructionChange={setInstruction}
              />
              <Button
                disabled={!title.trim() || !online || create.isPending}
                loading={create.isPending || putInstructions.isPending}
                onClick={() => void createActivity()}
              >
                Create Activity
              </Button>
            </>
          )}
        </Stack>
      </Panel>
      <ErrorMessage error={addExisting.error} />
      <SuggestionRail
        title="Suggested Activities"
        actionLabel="Add to Program"
        items={suggestions.items.map((activity) =>
          activityCard(activity, categorySlugOf),
        )}
        loading={suggestions.isPending}
        error={suggestions.error}
        retry={() => void suggestions.refetch()}
        selectedId={addingId}
        disabled={!online || addExisting.pending}
        onPick={async (id) => {
          const activity = suggestions.items.find((a) => a.id === id)
          if (!activity) return
          setAddingId(id)
          try {
            await addExisting.run(activity)
            toast.success('Activity added')
            navigate(close)
          } catch {
            /* The error stays visible above the rail; retry by picking again. */
          } finally {
            setAddingId(null)
          }
        }}
        footer={
          <Button variant="outline" className="self-start" onClick={browser.open}>
            Browse Activity Library
          </Button>
        }
      />
    </Stack>
  )
}
function TitleEditor({
  ws,
}: {
  ws: Workspace
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
      <ProgramHeader
        title={draft.value}
        onTitleChange={draft.setValue}
      />
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
