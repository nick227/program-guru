import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  useActivity,
  useRemoveProgramActivity,
  useUpdateActivityDraft,
} from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/Input'
import { Row, Stack } from '@/components/ui/Layout'
import { EntityHero, useCategorySlugOf } from '@/components/EntityHero'
import { ActivityMediaTray } from '@/components/EntityMediaTray'
import { activityHero } from '@/lib/hero'
import { useOnline } from '@/lib/useOnline'
import type { Workspace } from '../../types'

export function WorkspaceActivityRow({
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
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Could not remove Activity'
                toast.error(message)
              }
            }}
          >
            Remove
          </Button>
        </Row>
      </Row>

      {/* Expanded inline editor: title, description and media */}
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

              {context && detail.data && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Media
                  </span>
                  <ActivityMediaTray revisionId={context.revisionId} />
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

