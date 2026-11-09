import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Link,
  Outlet,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import {
  ApiError,
  useActivitySuggestions,
  useAddProgramPlacement,
  useAddProgramActivities,
  useRemoveProgramActivity,
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
  useInboundMedia,
  type components,
} from '@project/sdk'
import { Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Page, Stage, Stack, Row, Panel } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/Navigation'
import { CalendarSurface } from '@/components/CalendarSurface'
import { MediaAttachments } from '@/components/MediaAttachments'
import { ActivityBasicsFields } from '@/components/ActivityBasicsFields'
import { ProgramHeader } from '@/components/ProgramHeader'
import { ChangeImage } from '@/components/ChangeImage'
import { EntityHero, useCategorySlugOf } from '@/components/EntityHero'
import {
  useLibraryBrowser,
  type LibraryBrowserContext,
} from '@/components/LibraryBrowser'
import { SuggestionRail } from '@/components/SuggestionRail'
import { ProgramGroups } from '@/components/ProgramGroups'
import {
  ProgramStepper,
  type ProgramStep,
} from '@/components/ProgramStepper'
import {
  dayDifference,
  projectProgramPlacements,
} from '@/lib/scheduleProjection'
import { activityCard } from '@/lib/discoveryCards'
import { activityHero, programHero } from '@/lib/hero'
import { useActivityCover, useProgramCover } from '@/lib/useEntityCover'
import { useAutosave } from '@/lib/useAutosave'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { buildProgramUrl } from '@/lib/urls'
import {
  addMonths,
  calendarUrl,
  dateLabel,
  monthBounds,
  monthGrid,
  today,
} from '@/lib/dates'

type Workspace = components['schemas']['ProgramWorkspace']

export function ProgramWorkspacePage() {
  const { id = '', step: pathStep } = useParams()
  const [params, setParams] = useSearchParams()
  const workspace = useProgramWorkspace(id)

  useDocumentTitle(
    workspace.data?.title
      ? `Workspace: ${workspace.data.title}`
      : 'Workspace',
  )

  // Map step param or legacy panel param into a valid ProgramStep
  const stepParam = pathStep || params.get('step')
  const panelParam = params.get('panel')

  const currentStep: ProgramStep = useMemo(() => {
    if (stepParam === 'details' || stepParam === '1') return 'details'
    if (stepParam === 'activities' || stepParam === '2') return 'activities'
    if (stepParam === 'schedule' || stepParam === '3') return 'schedule'
    if (stepParam === 'publish' || stepParam === '4') return 'publish'

    if (panelParam === 'edit') return 'details'
    if (panelParam === 'activities') return 'activities'
    if (panelParam === 'calendar') return 'schedule'
    if (panelParam === 'publish') return 'publish'

    return 'details'
  }, [stepParam, panelParam])

  const setStep = (next: ProgramStep) => {
    setParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev)
        nextParams.delete('panel')
        nextParams.set('step', next)
        return nextParams
      },
      { replace: false },
    )
  }

  if (!workspace.data) {
    return (
      <Page>
        <Back to="/library">My Programs</Back>
        <ErrorMessage
          error={workspace.error}
          retry={() => void workspace.refetch()}
        />
        {workspace.isPending && <Loading />}
      </Page>
    )
  }

  const ws = workspace.data
  const base = `/programs/${id}/workspace`

  return (
    <Page>
      <Stage className="w-full">
        <Back to={panelParam ? base : '/library'}>
          {panelParam ? 'Workspace' : 'My Programs'}
        </Back>

        {/* Title header with autosave & version CAS stays mounted across all 4 steps */}
        <TitleEditor key={ws.id} ws={ws} />

        {/* Persistent 4-step stepper */}
        <ProgramStepper
          currentStep={currentStep}
          onSelectStep={setStep}
        />

        <ErrorMessage error={workspace.error} />

        {/* 1. DETAILS */}
        {currentStep === 'details' && (
          <DetailsStep
            ws={ws}
            onContinue={() => setStep('activities')}
          />
        )}

        {/* 2. ACTIVITIES */}
        {currentStep === 'activities' && (
          <ActivitiesStep
            ws={ws}
            isPanelMode={panelParam === 'activities'}
            onBack={() => setStep('details')}
            onContinue={() => setStep('schedule')}
          />
        )}

        {/* 3. SCHEDULE */}
        {currentStep === 'schedule' && (
          <ScheduleStep
            ws={ws}
            onBack={() => setStep('activities')}
            onContinue={() => setStep('publish')}
          />
        )}

        {/* 4. PUBLISH & SHARE */}
        {currentStep === 'publish' && (
          <PublishStep
            ws={ws}
            onBack={() => setStep('schedule')}
            refresh={() => void workspace.refetch()}
          />
        )}
      </Stage>
      <WorkspaceBrowserOutlet ws={ws} />
    </Page>
  )
}

// ── Persistent Title Editor ──────────────────────────────────────────────────

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

// ── Step 1: DETAILS ─────────────────────────────────────────────────────────

function DetailsStep({
  ws,
  onContinue,
}: {
  ws: Workspace
  onContinue: () => void
}) {
  const update = useUpdateProgram(ws.id)
  const online = useOnline()
  const [description, setDescription] = useState(ws.description ?? '')
  const [savedDesc, setSavedDesc] = useState(ws.description ?? '')
  const [savingDesc, setSavingDesc] = useState(false)
  const [descError, setDescError] = useState<unknown>(null)

  useEffect(() => {
    setDescription(ws.description ?? '')
    setSavedDesc(ws.description ?? '')
  }, [ws.description])

  // Debounced description save
  useEffect(() => {
    if (description === savedDesc || !online || savingDesc) return
    const timer = setTimeout(() => {
      setSavingDesc(true)
      update
        .mutateAsync({
          description: description.trim() || null,
          expectedRevision: ws.draftRevision,
        })
        .then(() => {
          setSavedDesc(description)
          setDescError(null)
        })
        .catch(setDescError)
        .finally(() => setSavingDesc(false))
    }, 600)
    return () => clearTimeout(timer)
  }, [description, savedDesc, online, savingDesc, ws.draftRevision, update])

  return (
    <Stack className="gap-6 mt-4">
      {/* Category / Type info */}
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="font-semibold text-foreground">{ws.type.label}</span>
        {ws.focus && <span>· {ws.focus.label}</span>}
        <span>· {ws.durationDays ? `${ws.durationDays / 7} weeks` : 'Ongoing'}</span>
      </div>

      {/* Program Cover */}
      <ProgramCover ws={ws} />

      {/* Description */}
      <label className="field space-y-1.5">
        <span className="label font-semibold">Program description (optional)</span>
        <textarea
          className="textarea min-h-28"
          maxLength={20000}
          value={description}
          placeholder="What is this Program about? Goals, requirements, who it is for..."
          disabled={!online}
          onChange={(e) => setDescription(e.target.value)}
        />
        {savingDesc && <p className="text-xs text-muted">Saving description…</p>}
        <ErrorMessage error={descError} />
      </label>

      {/* Duration */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Duration</h3>
        <Row className="flex-wrap gap-2">
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
        <p className="text-xs text-muted">
          {ws.durationDays
            ? `Fixed duration of ${ws.durationDays / 7} weeks (${ws.durationDays} days).`
            : 'Ongoing program that repeats weekly until completed or paused.'}
        </p>
      </div>

      {/* Navigation Controls */}
      <Row className="justify-between pt-4 border-t border-border">
        <Link to="/library" className={linkButton}>
          My Programs
        </Link>
        <Button size="lg" onClick={onContinue}>
          Continue to Activities →
        </Button>
      </Row>
    </Stack>
  )
}

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

// ── Step 2: ACTIVITIES ──────────────────────────────────────────────────────

function ActivitiesStep({
  ws,
  isPanelMode,
  onBack,
  onContinue,
}: {
  ws: Workspace
  isPanelMode?: boolean
  onBack: () => void
  onContinue: () => void
}) {
  const browser = useLibraryBrowser()
  const base = `/programs/${ws.id}/workspace?step=activities`

  return (
    <Stack className="gap-6 mt-4">
      <Row className="justify-between items-baseline">
        <h2 className="text-xl font-bold">Activities</h2>
        <span className="text-xs text-muted">
          {ws.activityCount} {ws.activityCount === 1 ? 'activity' : 'activities'} ·{' '}
          {ws.instructionCount} instructions
        </span>
      </Row>

      {/* Compact Activity Rows */}
      {ws.activities.length > 0 ? (
        <Stack className="gap-3">
          {ws.activities.map((a) => (
            <WorkspaceActivityRow
              key={a.activityId}
              activity={a}
              ws={ws}
              returnTo={base}
            />
          ))}
        </Stack>
      ) : (
        <Panel className="text-center py-6">
          <p className="text-sm text-muted">No activities yet.</p>
          <p className="text-xs text-muted mt-1">
            Add existing activities from the library or create a new one below.
          </p>
        </Panel>
      )}

      {/* Create New Activity Form */}
      <CreateActivitySection
        ws={ws}
        onCreated={isPanelMode ? onContinue : undefined}
      />

      {/* Suggested Activities Rail & Browse Library */}
      <SuggestedActivitiesSection ws={ws} onBrowse={browser.open} />

      {/* Quick Start if private and has activities */}
      {ws.visibility === 'PRIVATE' && ws.status !== 'ARCHIVED' && (
        <StartProgram ws={ws} refresh={() => {}} />
      )}

      {/* Navigation Controls */}
      <Row className="justify-between pt-4 border-t border-border">
        <Button variant="outline" onClick={onBack}>
          ← Back to Details
        </Button>
        <Button size="lg" onClick={onContinue}>
          Continue to Schedule →
        </Button>
      </Row>
    </Stack>
  )
}

function WorkspaceActivityRow({
  activity,
  ws,
  returnTo,
}: {
  activity: Workspace['activities'][number]
  ws: Workspace
  returnTo: string
}) {
  const detail = useActivity(activity.activityId)
  const update = useUpdateActivityDraft(activity.activityId)
  const removeActivity = useRemoveProgramActivity(ws.id)
  const attachMedia = useAttachMedia()
  const online = useOnline()
  const categorySlugOf = useCategorySlugOf()
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
    <article className="rounded-lg border border-border p-3 transition-colors hover:border-border/80">
      <Row className="items-center justify-between gap-3">
        <Row className="items-center gap-3 min-w-0 flex-1">
          <EntityHero
            hero={activityHero(detail.data ?? activity, categorySlugOf)}
            size="thumb"
          />
          <div className="min-w-0 flex-1">
            <Link
              to={`/activities/${activity.activityId}?returnTo=${encodeURIComponent(returnTo)}`}
              className="font-semibold truncate block hover:text-accent transition-colors"
            >
              {activity.title}
            </Link>
            <p className="text-xs text-muted mt-0.5">
              {activity.instructionCount} instructions · {activity.mediaCount} media
              {activity.metrics.length > 0 && (
                <span>
                  {' '}· {activity.metrics.filter((m) => !m.toLowerCase().startsWith('duration')).join(' · ')}
                </span>
              )}
            </p>
          </div>
        </Row>
        <Row className="gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'Close' : 'Edit'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!online || removeActivity.isPending}
            loading={removeActivity.isPending}
            onClick={async () => {
              try {
                await removeActivity.mutateAsync({
                  activityId: activity.activityId,
                  expectedRevision: ws.draftRevision,
                })
                toast.success('Activity removed from Program')
              } catch (err: any) {
                toast.error(err?.message || 'Could not remove Activity')
              }
            }}
          >
            Remove
          </Button>
        </Row>
      </Row>

      {/* Expanded Inline Editor */}
      {editing && (
        <Stack className="mt-3 border-t border-border pt-3 gap-3">
          {detail.data?.canEdit ? (
            <>
              <ErrorMessage
                error={detail.error || update.error || attachMedia.error}
                retry={detail.error ? () => void detail.refetch() : undefined}
              />
              <label className="space-y-1">
                <span className="text-xs font-semibold">Activity title</span>
                <Input
                  maxLength={140}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold">Description</span>
                <textarea
                  className="textarea min-h-20"
                  maxLength={500}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
              </label>
              <Button
                size="sm"
                disabled={!hasChanges || !title.trim() || !online || update.isPending}
                loading={update.isPending}
                onClick={async () => {
                  if (!detail.data) return
                  try {
                    const updated = await update.mutateAsync({
                      expectedRevision: detail.data.draftRevision,
                      ...(title.trim() !== detail.data.title ? { title: title.trim() } : {}),
                      ...(summary !== (detail.data.summary ?? '') ? { summary: summary.trim() || null } : {}),
                    })
                    setTitle(updated.title)
                    setSummary(updated.summary ?? '')
                    toast.success('Activity updated')
                  } catch {
                    /* Keep edits available for retry */
                  }
                }}
              >
                Save Activity
              </Button>
              {context && detail.data && (
                <>
                  <ActivityImage activity={detail.data} revisionId={context.revisionId} />
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold">Demonstration media</h4>
                    <AddDemonstrationMedia revisionId={context.revisionId} disabled={!online} />
                  </div>
                  <MediaAttachments context={context} />
                </>
              )}
            </>
          ) : (
            <p className="text-xs text-muted">
              Copy this Activity to customize its details.
            </p>
          )}
        </Stack>
      )}
    </article>
  )
}

function CreateActivitySection({
  ws,
  onCreated,
}: {
  ws: Workspace
  onCreated?: () => void
}) {
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [instruction, setInstruction] = useState('')
  const [instructionSaved, setInstructionSaved] = useState(false)
  const [newActivity, setNewActivity] = useState<components['schemas']['ActivityDetail'] | null>(null)
  const create = useCreateActivity()
  const putInstructions = usePutActivityInstructions()
  const add = useAddProgramActivities(ws.id)
  const online = useOnline()
  const categorySlugOf = useCategorySlugOf()
  const cover = useActivityCover(newActivity?.revisionId ?? null)
  const liveActivity = useActivity(newActivity?.id ?? '')
  const programCategoryId = ws.type.categoryId || ws.focus?.categoryId || ''

  async function handleCreate() {
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
      /* Keep form for retry */
    }
  }

  return (
    <Panel>
      <Stack className="gap-3">
        <div>
          <h3 className="font-semibold text-base">Create a new Activity</h3>
          <p className="text-xs text-muted">
            Start with your own title and description. Instructions are optional.
          </p>
        </div>
        {newActivity ? (
          <Stack className="gap-3">
            <div>
              <h4 className="font-semibold">{newActivity.title}</h4>
              <p className="text-xs text-muted">{newActivity.summary || 'No description'}</p>
            </div>
            {newActivity.revisionId && (
              <ChangeImage
                label="Activity image"
                canEdit
                cover={cover}
                hero={activityHero(liveActivity.data ?? newActivity, categorySlugOf)}
              />
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
                  toast.success('Activity added to Program')
                  setNewActivity(null)
                  setTitle('')
                  setSummary('')
                  setInstruction('')
                  onCreated?.()
                } catch {
                  /* Keep for retry */
                }
              }}
            >
              Add Activity to Program
            </Button>
          </Stack>
        ) : (
          <Stack className="gap-3">
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
              onClick={() => void handleCreate()}
            >
              Create Activity
            </Button>
          </Stack>
        )}
      </Stack>
    </Panel>
  )
}

function SuggestedActivitiesSection({
  ws,
  onBrowse,
}: {
  ws: Workspace
  onBrowse: () => void
}) {
  const categorySlugOf = useCategorySlugOf()
  const addExisting = useAddExistingActivity(ws)
  const [addingId, setAddingId] = useState<string | null>(null)
  const online = useOnline()
  const programCategoryId = ws.type.categoryId || ws.focus?.categoryId || ''
  const suggestions = useActivitySuggestions({
    categoryId: programCategoryId,
    focusId: ws.focus?.id,
    exclude: ws.activities.map((a) => a.activityId),
  })

  return (
    <Stack className="gap-2">
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
          } catch {
            /* Error shows above rail */
          } finally {
            setAddingId(null)
          }
        }}
        footer={
          <Button variant="outline" className="self-start" onClick={onBrowse}>
            Browse Activity Library
          </Button>
        }
      />
    </Stack>
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

// ── Step 3: SCHEDULE ────────────────────────────────────────────────────────

function ScheduleStep({
  ws,
  onBack,
  onContinue,
}: {
  ws: Workspace
  onBack: () => void
  onContinue: () => void
}) {
  const me = useCurrentUser()
  const timezone =
    me.data?.data.preferences.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone
  const todayDate = today(timezone)
  const [startDate, setStartDate] = useState(todayDate)
  const [monthDate, setMonthDate] = useState(todayDate)
  const [selectedDate, setSelectedDate] = useState(todayDate)
  const placements = useProgramPlacements(ws.id)
  const update = useUpdateProgram(ws.id)
  const addPlacement = useAddProgramPlacement(ws.id)
  const movePlacement = useUpdateProgramPlacement(ws.id)
  const removePlacement = useDeleteProgramPlacement(ws.id)
  const online = useOnline()
  const [activityId, setActivityId] = useState('')

  // Compute month calendar days
  const monthDays = useMemo(() => {
    const dates = monthGrid(monthDate)
    const { start: mStart, end: mEnd } = monthBounds(monthDate)
    return dates.map((date) => ({
      id: date,
      label: dateLabel(date, { weekday: 'short' }),
      number: String(Number(date.slice(8, 10))),
      today: date === todayDate,
      inCurrentMonth: date >= mStart && date <= mEnd,
    }))
  }, [monthDate, todayDate])

  // Project placements across the month grid
  const projectedItems = useMemo(() => {
    return projectProgramPlacements({
      placements: placements.data ?? [],
      startDate,
      durationDays: ws.durationDays,
      dates: monthDays.map((d) => d.id),
    })
  }, [placements.data, startDate, ws.durationDays, monthDays])

  // Placements matching the currently selected calendar day
  const selectedDayItems = projectedItems.filter((item) => item.day === selectedDate)
  const offsetFromStart = dayDifference(selectedDate, startDate)
  const cycleDays = ws.durationDays ?? 7
  const placementBusy = addPlacement.isPending || movePlacement.isPending || removePlacement.isPending

  return (
    <Stack className="gap-6 mt-4">
      <Row className="justify-between items-baseline">
        <h2 className="text-xl font-bold">Schedule &amp; placement</h2>
        <span className="text-xs text-muted">
          {ws.frequencyLabel} · {ws.programDays ?? 0} program days
        </span>
      </Row>

      {/* Start Date & Duration Controls */}
      <Panel>
        <Stack className="gap-3">
          <Row className="justify-between items-end flex-wrap gap-4">
            <label className="space-y-1">
              <span className="text-sm font-semibold">Projected start date</span>
              <Input
                type="date"
                min={todayDate}
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setSelectedDate(e.target.value)
                  setMonthDate(e.target.value)
                }}
              />
            </label>
            <div className="space-y-1">
              <span className="text-sm font-semibold">Duration</span>
              <Row className="gap-1 flex-wrap">
                {[7, 14, 28, 56, null].map((days) => (
                  <Button
                    key={days ?? 'ongoing'}
                    size="sm"
                    variant={ws.durationDays === days ? 'default' : 'outline'}
                    disabled={!online || update.isPending}
                    onClick={() =>
                      update.mutate({
                        durationDays: days,
                        expectedRevision: ws.draftRevision,
                      })
                    }
                  >
                    {days === null ? 'Ongoing' : `${days / 7}w`}
                  </Button>
                ))}
              </Row>
            </div>
          </Row>
          <p className="text-xs text-muted">
            Projecting your Program schedule using the selected start date. Your personal calendar is not modified until you start the Program in the final step.
          </p>
        </Stack>
      </Panel>

      {/* Month Navigation */}
      <Row className="justify-between items-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMonthDate((d) => addMonths(d, -1))}
        >
          Previous month
        </Button>
        <h3 className="font-display text-base font-bold">
          {dateLabel(monthDate, { month: 'long', year: 'numeric' })}
        </h3>
        <Row className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMonthDate(todayDate)}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMonthDate((d) => addMonths(d, 1))}
          >
            Next month
          </Button>
        </Row>
      </Row>

      {/* Calendar Surface Month View */}
      {placements.isPending ? (
        <Loading />
      ) : (
        <CalendarSurface
          view="month"
          days={monthDays}
          items={projectedItems}
          selected={selectedDate}
          onSelect={setSelectedDate}
        />
      )}

      {/* Day Details for Selected Date */}
      <Panel>
        <Stack className="gap-3">
          <Row className="justify-between items-center">
            <h3 className="font-semibold text-base">
              Activities on {dateLabel(selectedDate, { weekday: 'short', month: 'short', day: 'numeric' })}
            </h3>
            {offsetFromStart >= 0 && (
              <span className="text-xs text-muted">
                {ws.durationDays !== null
                  ? `Day ${offsetFromStart + 1} of ${ws.durationDays}`
                  : `Cycle Day ${(offsetFromStart % 7) + 1} (repeats weekly)`}
              </span>
            )}
          </Row>

          {offsetFromStart < 0 ? (
            <div className="py-2 text-sm text-muted">
              <p>This date is before the projected start date ({startDate}).</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setStartDate(selectedDate)
                  setMonthDate(selectedDate)
                }}
              >
                Set start date to {selectedDate}
              </Button>
            </div>
          ) : ws.durationDays !== null && offsetFromStart >= ws.durationDays ? (
            <p className="py-2 text-sm text-muted">
              This date is beyond the Program duration of {ws.durationDays} days.
            </p>
          ) : (
            <>
              {selectedDayItems.length > 0 ? (
                <Stack className="gap-2">
                  {selectedDayItems.map((item) => {
                    const placementId = item.id.replace(/^projected-([^-]+)-.*$/, '$1')
                    const rawPlacement = (placements.data ?? []).find((p) => p.id === placementId)

                    return (
                      <Row
                        key={item.id}
                        className="justify-between items-center rounded-lg border border-border p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <strong>{item.title}</strong>
                          {item.localTime && (
                            <span className="ml-2 text-xs text-muted">
                              {item.localTime}
                            </span>
                          )}
                        </div>
                        {rawPlacement && (
                          <Row className="gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Move ${item.title} one day earlier`}
                              disabled={
                                !online ||
                                placementBusy ||
                                rawPlacement.relativeDay <= 0
                              }
                              onClick={() =>
                                movePlacement.mutate({
                                  placementId: rawPlacement.id,
                                  relativeDay: rawPlacement.relativeDay - 1,
                                  expectedRevision: ws.draftRevision,
                                })
                              }
                            >
                              − Day
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Move ${item.title} one day later`}
                              disabled={
                                !online ||
                                placementBusy ||
                                rawPlacement.relativeDay >= cycleDays - 1
                              }
                              onClick={() =>
                                movePlacement.mutate({
                                  placementId: rawPlacement.id,
                                  relativeDay: rawPlacement.relativeDay + 1,
                                  expectedRevision: ws.draftRevision,
                                })
                              }
                            >
                              + Day
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!online || placementBusy}
                              onClick={() =>
                                removePlacement.mutate({
                                  placementId: rawPlacement.id,
                                  expectedRevision: ws.draftRevision,
                                })
                              }
                            >
                              Remove
                            </Button>
                          </Row>
                        )}
                      </Row>
                    )
                  })}
                </Stack>
              ) : (
                <p className="text-sm text-muted py-2">
                  No Activities scheduled on this day.
                </p>
              )}

              {/* Add Activity to this day */}
              {ws.activities.length > 0 && (
                <Row className="items-end gap-2 pt-2">
                  <label className="min-w-0 flex-1 space-y-1">
                    <span className="text-xs font-semibold">Add an Activity to this day</span>
                    <Select
                      value={activityId}
                      onChange={(e) => setActivityId(e.target.value)}
                    >
                      <option value="">Choose an Activity</option>
                      {ws.activities.map((act) => (
                        <option key={act.activityId} value={act.activityId}>
                          {act.title}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button
                    disabled={!activityId || !online || placementBusy}
                    loading={addPlacement.isPending}
                    onClick={() => {
                      const relDay = ws.durationDays !== null ? offsetFromStart : (offsetFromStart % 7)
                      addPlacement.mutate({
                        activityId,
                        relativeDay: relDay,
                        expectedRevision: ws.draftRevision,
                      })
                      setActivityId('')
                    }}
                  >
                    Add to day
                  </Button>
                </Row>
              )}
            </>
          )}

          <ErrorMessage
            error={
              placements.error ||
              addPlacement.error ||
              movePlacement.error ||
              removePlacement.error ||
              update.error
            }
          />
        </Stack>
      </Panel>

      {/* Navigation Controls */}
      <Row className="justify-between pt-4 border-t border-border">
        <Button variant="outline" onClick={onBack}>
          ← Back to Activities
        </Button>
        <Button size="lg" onClick={onContinue}>
          Continue to Publish &amp; Share →
        </Button>
      </Row>
    </Stack>
  )
}

// ── Step 4: PUBLISH & SHARE ─────────────────────────────────────────────────

function PublishStep({
  ws,
  onBack,
  refresh,
}: {
  ws: Workspace
  onBack: () => void
  refresh: () => void
}) {
  const check = usePublishCheck(ws.id)
  const publish = usePublishProgram(ws.id)
  const online = useOnline()
  const navigate = useNavigate()
  const categorySlugOf = useCategorySlugOf()
  const [visibility, setVisibility] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>(
    ws.visibility === 'PRIVATE' ? 'PUBLIC' : ws.visibility,
  )

  return (
    <Stack className="gap-6 mt-4">
      <Row className="justify-between items-baseline">
        <h2 className="text-xl font-bold">Publish &amp; Share</h2>
        <span className="text-xs text-muted">Final review &amp; distribution</span>
      </Row>

      {/* Concise Program Summary */}
      <Panel>
        <Stack className="gap-3">
          <Row className="gap-3 items-center">
            <EntityHero hero={programHero(ws, categorySlugOf)} size="thumb" />
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-bold truncate">{ws.title}</h3>
              <p className="text-xs text-muted">
                {ws.type.label} · {ws.durationDays ? `${ws.durationDays / 7} weeks` : 'Ongoing'} · {ws.frequencyLabel}
              </p>
            </div>
          </Row>
          {ws.description && (
            <p className="text-sm text-muted whitespace-pre-wrap">{ws.description}</p>
          )}
          <div className="border-t border-border pt-2 text-xs text-muted space-y-1">
            <p>
              {ws.activityCount} {ws.activityCount === 1 ? 'Activity' : 'Activities'} ·{' '}
              {ws.instructionCount} Instructions · {ws.programDays ?? 0} Program Days
            </p>
            {ws.activities.map((a) => (
              <p key={a.activityId} className="truncate">
                • {a.title} ({a.instructionCount} instructions)
              </p>
            ))}
          </div>
        </Stack>
      </Panel>

      {/* Publish Validation & Issues */}
      <Panel>
        <Stack className="gap-3">
          <h3 className="font-semibold text-base">Who can find it?</h3>
          <Row className="gap-2">
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

          <ErrorMessage
            error={check.error || publish.error}
            retry={() => void check.refetch()}
          />
          {check.isPending && <Loading />}
          {check.data?.issues.map((issue) => (
            <p
              role="alert"
              className="text-sm text-danger"
              key={`${issue.code}:${issue.field}:${issue.activityId}`}
            >
              {issue.message}
            </p>
          ))}

          <Button
            size="lg"
            disabled={!online || !check.data?.canPublish || publish.isPending}
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
            {ws.status === 'PUBLISHED' ? 'Publish Update' : 'Publish Program'}
          </Button>
        </Stack>
      </Panel>

      {/* Start on Personal Calendar */}
      {ws.status !== 'ARCHIVED' && (
        <StartProgram ws={ws} refresh={refresh} />
      )}

      {/* Group Workflows / Do this together */}
      {ws.status !== 'ARCHIVED' && <WorkspaceTogether ws={ws} />}

      {/* Navigation Controls */}
      <Row className="justify-between pt-4 border-t border-border">
        <Button variant="outline" onClick={onBack}>
          ← Back to Schedule
        </Button>
      </Row>
    </Stack>
  )
}

function WorkspaceTogether({ ws }: { ws: Workspace }) {
  const me = useCurrentUser()
  const enrollments = useMyEnrollments()
  const enrollment = enrollments.data?.pages.flatMap((page) => page.data).find(
    (entry) => entry.program.id === ws.id && entry.programVersionId === ws.latestPublishedVersionId && ['ACTIVE', 'PAUSED'].includes(entry.status),
  )
  return (
    <ProgramGroups
      key={ws.latestPublishedVersionId}
      programId={ws.id}
      versionId={ws.latestPublishedVersionId}
      enrollmentId={enrollment?.id ?? null}
      isProgramOwner
      timezone={me.data?.data.preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
    />
  )
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
          <h3 className="font-semibold text-base">Start Program on Calendar</h3>
        </div>
        {ws.activityCount === 0 && (
          <p className="text-sm text-attention">
            Add at least one Activity before starting this Program.
          </p>
        )}
        {alreadyOnCalendar ? (
          <p role="status" className="text-sm text-muted">
            This Program is already on your Calendar.{' '}
            <Link to={calendarUrl(startDate)} className="text-accent underline font-semibold ml-1">
              View Calendar
            </Link>
          </p>
        ) : (
          <>
            {enrollments.isPending && (
              <p role="status" className="text-sm text-muted">
                Checking your Calendar…
              </p>
            )}
            <Row className="justify-between items-end flex-wrap gap-3">
              <label className="space-y-1">
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
  const [params] = useSearchParams()
  const step = params.get('step') ?? 'activities'
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
          navigate(`/programs/${ws.id}/workspace?step=${step}`)
        })
        .catch((error: unknown) =>
          toast.error(
            error instanceof Error
              ? error.message
              : 'Could not add the Activity',
          ),
        )
    },
  }
  return <Outlet context={context} />
}
