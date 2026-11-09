import { Button } from '@/components/ui/Button'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { useLibraryBrowser } from '@/components/LibraryBrowser'
import { WorkspaceActivityRow } from './WorkspaceActivityRow'
import { CreateActivitySection } from './CreateActivitySection'
import type { Workspace } from '../../types'

export function ActivitiesStep({
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

