import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Link,
  Outlet,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import {
  ApiError,
  useAddProgramActivities,
  useRemoveProgramActivity,
  useCopyActivity,
  useCurrentUser,
  useMyEnrollments,
  useCreateActivity,
  useProgramWorkspace,
  useUpdateProgram,
  useActivity,
  useUpdateActivityDraft,
  usePublishCheck,
  usePublishProgram,
  type components,
} from '@project/sdk'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Page, Stage, Stack, Row, Panel } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/Navigation'
import { MediaAttachments } from '@/components/MediaAttachments'
import { ProgramHeader } from '@/components/ProgramHeader'
import { ChangeImage } from '@/components/ChangeImage'
import { MultiMediaCanvas } from '@/components/MultiMediaCanvas'
import { EntityHero, useCategorySlugOf } from '@/components/EntityHero'
import {
  useLibraryBrowser,
  type LibraryBrowserContext,
} from '@/components/LibraryBrowser'
import { ProgramGroups } from '@/components/ProgramGroups'
import {
  ProgramStepper,
  type ProgramStep,
} from '@/components/ProgramStepper'
import { activityHero, programHero } from '@/lib/hero'
import { useActivityCover, useProgramCover } from '@/lib/useEntityCover'
import { useAutosave } from '@/lib/useAutosave'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { buildProgramUrl } from '@/lib/urls'

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

  const stepParam = pathStep || params.get('step')
  const panelParam = params.get('panel')

  // Map step param or legacy panel param into a valid 3-step ProgramStep
  const currentStep: ProgramStep = useMemo(() => {
    if (stepParam === 'details' || stepParam === '1') return 'details'
    if (stepParam === 'activities' || stepParam === '2') return 'activities'
    if (stepParam === 'publish' || stepParam === '3' || stepParam === '4') return 'publish'

    if (panelParam === 'edit') return 'details'
    if (panelParam === 'activities') return 'activities'
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
      <Stage className="w-full max-w-2xl mx-auto space-y-6">
        <Row className="justify-between items-center">
          <Back to={panelParam ? base : '/library'}>
            {panelParam ? 'Workspace' : 'My Programs'}
          </Back>
          <Link
            to={buildProgramUrl({ id: ws.id, title: ws.title })}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:opacity-90"
          >
            <ExternalLink size={13} />
            <span>View Program Page</span>
          </Link>
        </Row>

        {/* Title header with autosave & version CAS */}
        <TitleEditor key={ws.id} ws={ws} />

        {/* Persistent 3-step stepper */}
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
            onBack={() => setStep('details')}
            onContinue={() => setStep('publish')}
          />
        )}

        {/* 3. PUBLISH & SHARE */}
        {currentStep === 'publish' && (
          <PublishStep
            ws={ws}
            onBack={() => setStep('activities')}
          />
        )}
      </Stage>
      <WorkspaceBrowserOutlet ws={ws} />
    </Page>
  )
}

// ── Title Editor ─────────────────────────────────────────────────────────────

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
        <Panel className="rounded-xl border border-border p-4">
          <Stack className="gap-3">
            <p className="font-semibold text-sm">Version Conflict</p>
            <p className="text-xs text-muted">Server title: {ws.title}</p>
            <Row className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => draft.reload(ws.title, ws.draftRevision)}
              >
                Discard My Edit
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const value = draft.value
                  draft.reload(ws.title, ws.draftRevision)
                  draft.setValue(value)
                }}
              >
                Overwrite Version
              </Button>
            </Row>
          </Stack>
        </Panel>
      )}
      {draft.blocker.state === 'blocked' && (
        <Panel aria-label="Unsaved changes" className="rounded-xl border border-border p-4">
          <Stack className="gap-3">
            <p className="font-semibold text-sm">Unsaved Changes</p>
            <p className="text-xs text-muted">You have unsaved edits in progress.</p>
            <Row className="gap-2">
              <Button size="sm" autoFocus onClick={() => draft.blocker.reset?.()}>
                Keep Editing
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={draft.pending}
                onClick={() => draft.blocker.proceed?.()}
              >
                Discard and Leave
              </Button>
            </Row>
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
    <Stack className="gap-6">
      {/* Program Type Tag */}
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="font-semibold text-foreground">{ws.type.label}</span>
        {ws.focus && <span>· {ws.focus.label}</span>}
        <span>· {ws.durationDays ? `${ws.durationDays / 7} weeks` : 'Ongoing'}</span>
      </div>

      {/* 3/4 Canvas Cover Image */}
      <Panel className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Cover Image
        </h3>
        <ProgramCover ws={ws} />
      </Panel>

      {/* Description */}
      <Panel className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Description
        </h3>
        <textarea
          className="textarea min-h-28 w-full rounded-lg border border-border p-3 text-sm"
          maxLength={20000}
          value={description}
          placeholder="Program goals, requirements, target audience..."
          disabled={!online}
          onChange={(e) => setDescription(e.target.value)}
        />
        {savingDesc && <p className="text-xs text-muted">Saving…</p>}
        <ErrorMessage error={descError} />
      </Panel>

      {/* Duration */}
      <Panel className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Duration
        </h3>
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
            : 'Ongoing program that repeats until completed or paused.'}
        </p>
      </Panel>

      {/* Consistent Bottom Navigation */}
      <Row className="justify-between items-center pt-6 border-t border-border mt-8">
        <Link to="/library" className={linkButton + ' h-11 px-6 font-semibold'}>
          Back
        </Link>
        <Button
          size="lg"
          className="h-11 px-8 font-semibold"
          onClick={onContinue}
        >
          Continue
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
      canEdit={ws.status !== 'ARCHIVED'}
      cover={cover}
      hero={programHero(ws, categorySlugOf)}
    />
  )
}

// ── Step 2: ACTIVITIES ──────────────────────────────────────────────────────

function ActivitiesStep({
  ws,
  onBack,
  onContinue,
}: {
  ws: Workspace
  onBack: () => void
  onContinue: () => void
}) {
  const browser = useLibraryBrowser()
  const base = `/programs/${ws.id}/workspace?step=activities`

  return (
    <Stack className="gap-6">
      <Row className="justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Activities</h2>
          <span className="text-xs text-muted">
            {ws.activityCount} {ws.activityCount === 1 ? 'activity' : 'activities'}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-4 font-semibold"
          onClick={browser.open}
        >
          Browse Library
        </Button>
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
        <Panel className="rounded-xl border border-border bg-surface text-center py-8">
          <p className="text-sm font-semibold text-foreground">No activities yet.</p>
          <p className="text-xs text-muted mt-1">
            Create an activity below or browse the library to add existing ones.
          </p>
        </Panel>
      )}

      {/* Create a new Activity inline */}
      <CreateActivitySection ws={ws} />

      {/* Consistent Bottom Navigation */}
      <Row className="justify-between items-center pt-6 border-t border-border mt-8">
        <Button
          variant="outline"
          size="lg"
          className="h-11 px-6 font-semibold"
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          size="lg"
          className="h-11 px-8 font-semibold"
          onClick={onContinue}
        >
          Continue
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
    <article className="rounded-2xl border border-border bg-surface p-4 transition-all hover:border-accent hover:shadow-sm space-y-3">
      <Row className="items-center justify-between gap-4">
        <Row className="items-center gap-4 min-w-0 flex-1">
          <div className="w-24 shrink-0 sm:w-28">
            <EntityHero
              hero={activityHero(
                {
                  title: detail.data?.title ?? title,
                  thumbnailUrl: detail.data?.thumbnailUrl,
                  categoryId: detail.data?.categoryId,
                },
                categorySlugOf,
              )}
              size="card"
              className="aspect-preview rounded-[var(--radius-media)]"
            />
          </div>
          <div className="min-w-0 flex-1">
            <Link
              to={`/activities/${activity.activityId}?returnTo=${encodeURIComponent(returnTo)}`}
              className="font-semibold truncate block hover:text-accent transition-colors text-sm sm:text-base leading-snug"
            >
              {activity.title}
            </Link>
            {detail.data?.summary && (
              <p className="text-xs text-muted line-clamp-1 mt-0.5">
                {detail.data.summary}
              </p>
            )}
          </div>
        </Row>
        <Row className="gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'Close' : 'Edit'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs text-muted hover:text-danger"
            disabled={!online || removeActivity.isPending}
            loading={removeActivity.isPending}
            onClick={async () => {
              try {
                await removeActivity.mutateAsync({
                  activityId: activity.activityId,
                  expectedRevision: ws.draftRevision,
                })
                toast.success('Activity removed')
              } catch (err: any) {
                toast.error(err?.message || 'Could not remove Activity')
              }
            }}
          >
            Remove
          </Button>
        </Row>
      </Row>

      {/* Expanded Inline Editor (No instructions, with 3/4 canvas multiple upload support) */}
      {editing && (
        <Stack className="mt-3 border-t border-border pt-4 gap-4">
          {detail.data?.canEdit ? (
            <>
              <ErrorMessage error={detail.error || update.error} />
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Title
                </span>
                <Input
                  maxLength={140}
                  className="h-10 text-sm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Description
                </span>
                <textarea
                  className="textarea min-h-20 text-sm"
                  maxLength={500}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
              </label>
              <Button
                size="sm"
                className="h-9 px-4 font-semibold"
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
                Save Changes
              </Button>

              {/* 3/4 Canvas Media Section Supporting Multiple Uploads */}
              {context && detail.data && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Demonstration Media
                  </span>
                  <MultiMediaCanvas
                    target={{ kind: 'ACTIVITY_REVISION', id: context.revisionId }}
                    purpose="DEMONSTRATION"
                    disabled={!online}
                  />
                  <MediaAttachments context={context} />
                </div>
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

function CreateActivitySection({ ws }: { ws: Workspace }) {
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [newActivity, setNewActivity] = useState<components['schemas']['ActivityDetail'] | null>(null)
  const create = useCreateActivity()
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
    } catch {
      /* Keep form for retry */
    }
  }

  return (
    <Panel className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-4">
      <h3 className="text-base font-bold text-foreground">New Activity</h3>

      {newActivity ? (
        <Stack className="gap-4">
          <div>
            <h4 className="font-semibold text-sm">{newActivity.title}</h4>
            <p className="text-xs text-muted mt-0.5">{newActivity.summary || 'No description'}</p>
          </div>

          {/* 3/4 Canvas Multi-Upload */}
          {newActivity.revisionId && (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Media
              </span>
              <MultiMediaCanvas
                target={{ kind: 'ACTIVITY_REVISION', id: newActivity.revisionId }}
                purpose="DEMONSTRATION"
                disabled={!online}
              />
            </div>
          )}

          <ErrorMessage error={add.error} />
          <Button
            size="lg"
            className="h-11 px-6 font-semibold"
            disabled={!online || add.isPending}
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
              } catch {
                /* Keep for retry */
              }
            }}
          >
            Add to Program
          </Button>
        </Stack>
      ) : (
        <Stack className="gap-4">
          <ErrorMessage error={create.error} />
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Activity title
            </span>
            <Input
              aria-label="Activity title"
              maxLength={140}
              placeholder="e.g. Morning Run, Upper Body Strength"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Description (optional)
            </span>
            <textarea
              aria-label="Description (optional)"
              className="textarea min-h-20 text-sm"
              maxLength={500}
              placeholder="Short description of this activity..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>

          <Button
            size="lg"
            className="h-11 px-6 font-semibold self-start"
            disabled={!title.trim() || !online || create.isPending}
            loading={create.isPending}
            onClick={() => void handleCreate()}
          >
            Create Activity
          </Button>
        </Stack>
      )}
    </Panel>
  )
}

// ── Step 3: PUBLISH & SHARE ─────────────────────────────────────────────────

function PublishStep({
  ws,
  onBack,
}: {
  ws: Workspace
  onBack: () => void
}) {
  const check = usePublishCheck(ws.id)
  const publish = usePublishProgram(ws.id)
  const online = useOnline()
  const navigate = useNavigate()
  const categorySlugOf = useCategorySlugOf()
  const [visibility, setVisibility] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>(
    ws.visibility === 'PRIVATE' ? 'PUBLIC' : ws.visibility,
  )

  const handlePublish = async () => {
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
  }

  return (
    <Stack className="gap-6">
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        Publish &amp; Share
      </h2>

      {/* Program Summary */}
      <Panel className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Summary
        </h3>
        <Row className="gap-4 items-center">
          <EntityHero hero={programHero(ws, categorySlugOf)} size="thumb" />
          <div className="min-w-0 flex-1">
            <h4 className="font-display text-lg font-bold truncate">{ws.title}</h4>
            <p className="text-xs text-muted mt-0.5">
              {ws.type.label} · {ws.durationDays ? `${ws.durationDays / 7} weeks` : 'Ongoing'} · {ws.activityCount} Activities
            </p>
          </div>
        </Row>
        {ws.description && (
          <p className="text-xs text-muted whitespace-pre-wrap">{ws.description}</p>
        )}
      </Panel>

      {/* Combined Visibility & Group Sharing (No sentence titles) */}
      <Panel className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-5">
        <h3 className="text-base font-bold text-foreground">
          Visibility &amp; Group Sharing
        </h3>

        {/* Visibility Controls */}
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Visibility
          </span>
          <Row className="gap-2">
            {(['PUBLIC', 'UNLISTED', 'PRIVATE'] as const).map((v) => (
              <Button
                key={v}
                aria-pressed={visibility === v}
                variant={visibility === v ? 'default' : 'outline'}
                size="sm"
                className="h-9 px-4 font-semibold"
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
          <p className="text-xs text-muted">
            {visibility === 'PUBLIC'
              ? 'Visible to anyone in the discovery library.'
              : visibility === 'UNLISTED'
                ? 'Only accessible to people with the link.'
                : 'Private to you and members you invite.'}
          </p>
        </div>

        {/* Group Sharing & Invites */}
        {ws.status !== 'ARCHIVED' && (
          <div className="pt-4 border-t border-border space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Group Invitations
            </span>
            <WorkspaceTogether ws={ws} />
          </div>
        )}

        <ErrorMessage
          error={check.error || publish.error}
          retry={() => void check.refetch()}
        />
        {check.isPending && <Loading />}
        {check.data?.issues.map((issue) => (
          <p
            role="alert"
            className="text-xs text-danger font-medium"
            key={`${issue.code}:${issue.field}:${issue.activityId}`}
          >
            {issue.message}
          </p>
        ))}
      </Panel>

      {/* Consistent Bottom Navigation */}
      <Row className="justify-between items-center pt-6 border-t border-border mt-8">
        <Button
          variant="outline"
          size="lg"
          className="h-11 px-6 font-semibold"
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          size="lg"
          className="h-11 px-8 font-semibold"
          disabled={!online || !check.data?.canPublish || publish.isPending}
          loading={publish.isPending}
          onClick={handlePublish}
        >
          {ws.status === 'PUBLISHED' ? 'Publish Update' : 'Publish Program'}
        </Button>
      </Row>
    </Stack>
  )
}

function WorkspaceTogether({ ws }: { ws: Workspace }) {
  const me = useCurrentUser()
  const enrollments = useMyEnrollments()
  const enrollment = enrollments.data?.pages.flatMap((page) => page.data).find(
    (entry) => entry.program.id === ws.id && ['ACTIVE', 'PAUSED'].includes(entry.status),
  )
  return (
    <ProgramGroups
      key={ws.latestPublishedVersionId}
      programId={ws.id}
      versionId={ws.latestPublishedVersionId}
      enrollmentId={enrollment?.id ?? null}
      isProgramOwner
      timezone={me.data?.data.preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
      title={null}
    />
  )
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
