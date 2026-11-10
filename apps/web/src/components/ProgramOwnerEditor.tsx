import {
  PROGRAM_DESCRIPTION_MAX,
  PROGRAM_DESCRIPTION_PLACEHOLDER,
  PROGRAM_TITLE_MAX,
  programDescriptionInput,
  programPublishInput,
  programVisibilityLabel,
  type ProgramVisibility,
} from '@/components/program-authoring/programFields'
import { ProgramVisibilityButtons, PublishCheckIssues } from '@/components/program-authoring/PublishControls'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  usePublishCheck,
  usePublishProgram,
  useUpdateProgram,
} from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { StatusText } from '@/components/ui/StatusText'
import { ProgramMediaTray } from '@/components/EntityMediaTray'
import { DeleteProgramDialog } from '@/components/DeleteProgramDialog'
import { ProgramDurationButtons } from '@/components/program-authoring/ScheduleControls'
import { buildWorkspaceUrl } from '@/lib/urls'
import type { Workspace } from '@/components/program-authoring/types'

export function ProgramOwnerBanner({
  ws,
  editing,
  onEdit,
}: {
  ws: Workspace
  editing: boolean
  onEdit: () => void
}) {
  const isDraft = ws.status === 'DRAFT'
  if (!isDraft && !ws.hasUnpublishedChanges) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-attention/30 bg-attention/5 p-4 sm:p-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <StatusText status="planned">
            {isDraft ? 'Draft' : 'Unpublished changes'}
          </StatusText>
          <span className="text-xs text-muted capitalize">
            {programVisibilityLabel(ws.visibility)}
          </span>
        </div>
        <p className="text-sm text-foreground">
          {isDraft
            ? 'This program is still a draft and cannot be joined until published.'
            : 'You have unpublished draft changes that are not live for participants yet.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!editing && (
          <Button size="sm" onClick={onEdit}>
            {isDraft ? 'Edit & Publish' : 'Review & Publish'}
          </Button>
        )}
        <Link
          className="btn btn--outline btn--sm gap-1.5"
          to={buildWorkspaceUrl(ws.id, {
            step: isDraft && ws.activityCount === 0 ? 'activities' : 'publish',
          })}
        >
          <ExternalLink size={14} aria-hidden />
          <span>Open Workspace</span>
        </Link>
      </div>
    </div>
  )
}

export function ProgramOwnerEditPanel({
  ws,
  online,
  onClose,
  onDeleted,
}: {
  ws: Workspace
  online: boolean
  onClose: () => void
  onDeleted: () => void
}) {
  const update = useUpdateProgram(ws.id)
  const check = usePublishCheck(ws.id, true)
  const publish = usePublishProgram(ws.id)

  const [title, setTitle] = useState(ws.title)
  const [description, setDescription] = useState(ws.description ?? '')
  const [visibility, setVisibility] = useState<ProgramVisibility>(
    ws.visibility,
  )
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setTitle(ws.title)
    setDescription(ws.description ?? '')
    setVisibility(ws.visibility)
  }, [ws.id, ws.draftRevision, ws.title, ws.description, ws.visibility])

  const trimmedTitle = title.trim()
  const trimmedDescription = description.trim()
  const hasDetailChanges =
    trimmedTitle !== ws.title ||
    trimmedDescription !== (ws.description ?? '').trim()

  const handleSaveDetails = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!trimmedTitle || !online || update.isPending) return
    try {
      await update.mutateAsync({
        title: trimmedTitle,
        description: programDescriptionInput(description),
        expectedRevision: ws.draftRevision,
      })
      toast.success('Program details saved')
    } catch {
      /* shown below */
    }
  }

  const handlePublish = async () => {
    if (!online || publish.isPending) return
    try {
      if (hasDetailChanges && trimmedTitle) {
        const updated = await update.mutateAsync({
          title: trimmedTitle,
          description: programDescriptionInput(description),
          expectedRevision: ws.draftRevision,
        })
        await publish.mutateAsync(programPublishInput(ws, visibility, updated.draftRevision))
      } else {
        await publish.mutateAsync(programPublishInput(ws, visibility))
      }
      toast.success(
        ws.status === 'PUBLISHED' ? 'Program update published' : 'Program published',
      )
      onClose()
    } catch {
      /* shown below */
    }
  }

  const archived = ws.status === 'ARCHIVED'

  return (
    <section
      aria-label="Edit Program"
      className="rounded-2xl border border-accent/40 bg-surface p-5 sm:p-6 shadow-sm space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Edit Program</h2>
          <p className="text-xs text-muted">
            Update details, cover media, duration, and publishing settings directly here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={buildWorkspaceUrl(ws.id)}
            className="btn btn--outline btn--sm gap-1.5"
          >
            <ExternalLink size={14} aria-hidden />
            <span>Open Workspace</span>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Close editor"
            onClick={onClose}
            className="gap-1"
          >
            <X size={15} />
            <span>Done</span>
          </Button>
        </div>
      </div>

      {/* Title & Description */}
      <form onSubmit={(e) => void handleSaveDetails(e)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Title
            </span>
            <Input
              value={title}
              maxLength={PROGRAM_TITLE_MAX}
              disabled={!online || archived || update.isPending}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Description
            </span>
            <Textarea
              rows={3}
              maxLength={PROGRAM_DESCRIPTION_MAX}
              value={description}
              placeholder={PROGRAM_DESCRIPTION_PLACEHOLDER}
              disabled={!online || archived || update.isPending}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </div>
        <ErrorMessage error={update.error} />
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={!online || archived || !hasDetailChanges || !trimmedTitle || update.isPending}
            loading={update.isPending}
          >
            Save Details
          </Button>
        </div>
      </form>

      {/* Cover Image / Video */}
      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Cover Image or Video
        </h3>
        <ProgramMediaTray program={ws} disabled={archived} />
      </div>

      {/* Duration */}
      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Duration
        </h3>
        <ProgramDurationButtons ws={ws} />
      </div>

      {/* Visibility & Publish */}
      {!archived && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Visibility & Publishing
              </h3>
              <ProgramVisibilityButtons
                value={visibility}
                onChange={setVisibility}
                disabled={!online || publish.isPending}
              />
            </div>
            <Button
              type="button"
              size="md"
              disabled={
                !online ||
                !check.data?.canPublish ||
                publish.isPending ||
                update.isPending
              }
              loading={publish.isPending}
              onClick={() => void handlePublish()}
            >
              {ws.status === 'PUBLISHED' ? 'Publish Update' : 'Publish Program'}
            </Button>
          </div>
          <PublishCheckIssues check={check} error={publish.error} />
        </div>
      )}

      {/* Danger zone */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xs text-muted">
          Need to adjust day-by-day placements or pricing? Use the{' '}
          <Link to={buildWorkspaceUrl(ws.id)} className="text-accent underline">
            Program Workspace
          </Link>
          .
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-danger hover:bg-danger/10 hover:text-danger"
          onClick={() => setDeleting(true)}
        >
          <Trash2 size={14} aria-hidden />
          <span>Delete Program…</span>
        </Button>
      </div>

      {deleting && (
        <DeleteProgramDialog
          program={{ id: ws.id, title: ws.title }}
          onClose={() => setDeleting(false)}
          onDeleted={onDeleted}
        />
      )}
    </section>
  )
}
