import { formatProgramDuration } from '@/components/program-authoring/programFields'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { buildBrowseUrl } from '@/pages/Browse'
import { WorkspaceActivityRow } from '@/components/program-authoring/WorkspaceActivityRow'
import { CreateActivitySection } from '@/components/program-authoring/CreateActivitySection'
import type { Workspace } from '@/components/program-authoring/types'

export function ActivitiesStep({
  ws,
  onBack,
  onContinue,
}: {
  ws: Workspace
  onBack: () => void
  onContinue: () => void
}) {
  const base = `/programs/${ws.id}/workspace?step=activities`
  const browseHref = buildBrowseUrl({
    kind: 'activities',
    programId: ws.id,
    facet: ws.type.categoryId || undefined,
    returnTo: base,
  })

  return (
    <Stack className="gap-6">
      <Row className="justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Activities</h2>
          <span className="text-xs text-muted">
            {ws.activityCount} {ws.activityCount === 1 ? 'activity' : 'activities'} ·{' '}
            {formatProgramDuration(ws.durationDays)}
          </span>
        </div>
        <Link
          to={browseHref}
          className="btn btn--outline btn--sm h-9 px-4 font-semibold"
        >
          Browse Library
        </Link>
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

