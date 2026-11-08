import { Link } from 'react-router-dom'
import { useState } from 'react'
import {
  useMyPrograms,
  useMyActivities,
  useProgramWorkspace,
  usePublishCheck,
  usePublishProgram,
  useArchiveProgram,
  useArchiveActivity,
  useActivity,
  usePublishActivity,
} from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { linkButton } from '@/components/Navigation'
import { buildWorkspaceUrl } from '@/lib/urls'

export function PublishingPanel() {
  const [programId, setProgramId] = useState('')
  const [activityId, setActivityId] = useState('')
  const programs = useMyPrograms()
  const activities = useMyActivities()
  const programRows = programs.data?.pages.flatMap((page) => page.data) ?? []
  const activityRows =
    activities.data?.pages.flatMap((page) => page.data) ?? []
  return (
    <Stack>
      <Panel>
        <Stack>
          <h2>Publishing</h2>
          <p className="text-sm text-muted">
            Publish or archive using existing Program and Activity contracts.
            Scheduled releases need a backend publishAt contract.
          </p>
        </Stack>
      </Panel>
      <Panel>
        <Stack>
          <h3>Program</h3>
          <label>
            Select Program
            <select
              className="mt-1 w-full rounded-lg border bg-surface px-3 py-2"
              value={programId}
              onChange={(event) => setProgramId(event.target.value)}
            >
              <option value="">Choose…</option>
              {programRows.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.title}
                </option>
              ))}
            </select>
          </label>
          {programId ? <ProgramActions programId={programId} /> : null}
        </Stack>
      </Panel>
      <Panel>
        <Stack>
          <h3>Activity</h3>
          <label>
            Select Activity
            <select
              className="mt-1 w-full rounded-lg border bg-surface px-3 py-2"
              value={activityId}
              onChange={(event) => setActivityId(event.target.value)}
            >
              <option value="">Choose…</option>
              {activityRows.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.title} ({activity.status})
                </option>
              ))}
            </select>
          </label>
          {activityId ? <ActivityActions activityId={activityId} /> : null}
        </Stack>
      </Panel>
    </Stack>
  )
}

function ProgramActions({ programId }: { programId: string }) {
  const workspace = useProgramWorkspace(programId)
  const check = usePublishCheck(programId)
  const publish = usePublishProgram(programId)
  const archive = useArchiveProgram()
  const data = workspace.data
  return (
    <Stack>
      <ErrorMessage
        error={workspace.error || check.error || publish.error || archive.error}
        retry={() => void workspace.refetch()}
      />
      {workspace.isPending || check.isPending ? <Loading /> : null}
      {data ? (
        <>
          <p className="text-sm text-muted">
            Status {data.status}
            {data.hasUnpublishedChanges ? ' · unpublished changes' : ''}
          </p>
          <Row>
            <Link
              to={buildWorkspaceUrl(programId)}
              className={linkButton}
            >
              Edit in Workspace
            </Link>
            {data.status !== 'ARCHIVED' && (
              <Button
                variant="outline"
                loading={archive.isPending}
                onClick={() => archive.mutate(programId)}
              >
                Archive
              </Button>
            )}
            {check.data?.canPublish && (
              <Button
                loading={publish.isPending}
                onClick={() =>
                  publish.mutate({
                    visibility: data.visibility,
                    accessMode: data.accessMode,
                    expectedRevision: data.draftRevision,
                  })
                }
              >
                Publish
              </Button>
            )}
          </Row>
          {check.data && !check.data.canPublish && (
            <p className="text-sm text-muted">
              {check.data.issues[0]?.message ?? 'Not ready to publish.'}
            </p>
          )}
          {publish.isSuccess && <p role="status">Program published.</p>}
          {archive.isSuccess && <p role="status">Program archived.</p>}
        </>
      ) : null}
    </Stack>
  )
}

function ActivityActions({ activityId }: { activityId: string }) {
  const detail = useActivity(activityId)
  const publish = usePublishActivity(activityId)
  const archive = useArchiveActivity()
  const data = detail.data
  return (
    <Stack>
      <ErrorMessage
        error={detail.error || publish.error || archive.error}
        retry={() => void detail.refetch()}
      />
      {detail.isPending ? <Loading /> : null}
      {data ? (
        <>
          <p className="text-sm text-muted">
            Status {data.status} · revision {data.draftRevision}
          </p>
          <Row>
            <Link to={`/activities/${activityId}`} className={linkButton}>
              Open Activity
            </Link>
            {data.status !== 'ARCHIVED' && (
              <Button
                variant="outline"
                loading={archive.isPending}
                onClick={() => archive.mutate(activityId)}
              >
                Archive
              </Button>
            )}
            {data.status === 'DRAFT' && (
              <Button
                loading={publish.isPending}
                onClick={() =>
                  publish.mutate({
                    visibility: data.visibility,
                    expectedRevision: data.draftRevision,
                  })
                }
              >
                Publish
              </Button>
            )}
          </Row>
          {publish.isSuccess && <p role="status">Activity published.</p>}
          {archive.isSuccess && <p role="status">Activity archived.</p>}
        </>
      ) : null}
    </Stack>
  )
}
