import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  useCurrentUser,
  useJoinProgram,
  useMyEnrollments,
  usePublishCheck,
  usePublishProgram,
} from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { EntityHero, useCategorySlugOf } from '@/components/EntityHero'
import { programHero } from '@/lib/hero'
import { today } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
import { buildProgramUrl } from '@/lib/urls'
import { WorkspaceTogether } from './WorkspaceTogether'
import type { Workspace } from '../../types'

export function PublishStep({
  ws,
  onBack,
}: {
  ws: Workspace
  onBack: () => void
}) {
  const check = usePublishCheck(ws.id)
  const publish = usePublishProgram(ws.id)
  const join = useJoinProgram(ws.id)
  const me = useCurrentUser()
  const enrollments = useMyEnrollments()
  const online = useOnline()
  const navigate = useNavigate()
  const categorySlugOf = useCategorySlugOf()
  const [visibility, setVisibility] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>(
    ws.visibility === 'PRIVATE' ? 'PUBLIC' : ws.visibility,
  )
  const [startNow, setStartNow] = useState(true)

  const isEnrolled = !!enrollments.data?.pages
    .flatMap((page) => page.data)
    .find((entry) => entry.program.id === ws.id && ['ACTIVE', 'PAUSED'].includes(entry.status))

  const tz =
    me.data?.data.preferences.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone

  const handlePublish = async () => {
    try {
      const published = await publish.mutateAsync({
        visibility,
        accessMode: 'OPEN',
        expectedRevision: ws.draftRevision,
      })

      if (startNow && !isEnrolled) {
        const versionId =
          published.latestPublishedVersionId ?? ws.latestPublishedVersionId
        if (versionId) {
          try {
            await join.mutateAsync({
              programVersionId: versionId,
              startLocalDate: today(tz),
              timezone: tz,
              idempotencyKey: crypto.randomUUID(),
            })
          } catch {
            /* publish still succeeded even if calendar join errored */
          }
        }
      }

      toast.success(
        startNow && !isEnrolled
          ? 'Program published and added to your calendar'
          : 'Program published',
      )
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
        <Row className="items-center gap-4">
          {!isEnrolled && (
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-foreground select-none">
              <input
                type="checkbox"
                checked={startNow}
                onChange={(e) => setStartNow(e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent focus:ring-accent accent-accent cursor-pointer"
              />
              <span>Start now</span>
            </label>
          )}
          <Button
            size="lg"
            className="h-11 px-8 font-semibold"
            disabled={
              !online ||
              !check.data?.canPublish ||
              publish.isPending ||
              join.isPending
            }
            loading={publish.isPending || join.isPending}
            onClick={handlePublish}
          >
            {ws.status === 'PUBLISHED' ? 'Publish Update' : 'Publish Program'}
          </Button>
        </Row>
      </Row>
    </Stack>
  )
}

