import { Link } from 'react-router-dom'
import {
  useMyPrograms,
  useMyActivities,
  useMyMedia,
  type components,
} from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { linkButton } from '@/components/Navigation'
import { buildWorkspaceUrl } from '@/lib/urls'
import { useState } from 'react'

type Kind = 'programs' | 'activities' | 'media' | 'posts'

export function LibraryPanel() {
  const [kind, setKind] = useState<Kind>('programs')
  return (
    <Stack>
      <Panel>
        <Stack>
          <h2>Content Library</h2>
          <p className="text-sm text-muted">
            Programs, Activities, and Media you own. Posts require the channel
            Posts API.
          </p>
          <Row aria-label="Content type">
            {(
              [
                ['programs', 'Programs'],
                ['activities', 'Activities'],
                ['media', 'Media'],
                ['posts', 'Posts'],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                variant={kind === id ? 'default' : 'outline'}
                aria-pressed={kind === id}
                onClick={() => setKind(id)}
              >
                {label}
              </Button>
            ))}
          </Row>
        </Stack>
      </Panel>
      {kind === 'programs' && <ProgramsList />}
      {kind === 'activities' && <ActivitiesList />}
      {kind === 'media' && <MediaList />}
      {kind === 'posts' && (
        <Panel>
          <p role="status">
            Posts are blocked on the channel Posts API. Use Programs, Activities,
            and Media until that contract lands.
          </p>
        </Panel>
      )}
    </Stack>
  )
}

function ProgramsList() {
  const programs = useMyPrograms()
  const rows =
    programs.data?.pages.flatMap((page) => page.data) ??
    ([] as components['schemas']['ProgramSummary'][])
  return (
    <Panel>
      <Stack>
        <Row className="justify-between">
          <h3>Programs</h3>
          <Link to="/programs/new" className={linkButton}>
            Create
          </Link>
        </Row>
        <ErrorMessage
          error={programs.error}
          retry={() => void programs.refetch()}
        />
        {programs.isPending ? <Loading /> : null}
        {!programs.error && !rows.length && !programs.isPending ? (
          <p>No Programs yet.</p>
        ) : null}
        {rows.map((program) => (
          <Row key={program.id} className="justify-between">
            <Stack className="min-w-0 gap-1">
              <span className="truncate font-medium">{program.title}</span>
              <span className="text-sm text-muted">
                {program.visibility} · {program.accessMode}
              </span>
            </Stack>
            <Link
              to={buildWorkspaceUrl(program.id)}
              className={linkButton}
            >
              Open
            </Link>
          </Row>
        ))}
        {programs.hasNextPage && (
          <Button
            variant="outline"
            disabled={programs.isFetchingNextPage}
            onClick={() => void programs.fetchNextPage()}
          >
            More Programs
          </Button>
        )}
      </Stack>
    </Panel>
  )
}

function ActivitiesList() {
  const activities = useMyActivities()
  const rows = activities.data?.pages.flatMap((page) => page.data) ?? []
  return (
    <Panel>
      <Stack>
        <h3>Activities</h3>
        <ErrorMessage
          error={activities.error}
          retry={() => void activities.refetch()}
        />
        {activities.isPending ? <Loading /> : null}
        {!activities.error && !rows.length && !activities.isPending ? (
          <p>No personal Activities yet.</p>
        ) : null}
        {rows.map((activity) => (
          <Row key={activity.id} className="justify-between">
            <Stack className="min-w-0 gap-1">
              <span className="truncate font-medium">{activity.title}</span>
              <span className="text-sm text-muted">
                {activity.status} · {activity.visibility}
              </span>
            </Stack>
            <Link to={`/activities/${activity.id}`} className={linkButton}>
              Open
            </Link>
          </Row>
        ))}
        {activities.hasNextPage && (
          <Button
            variant="outline"
            disabled={activities.isFetchingNextPage}
            onClick={() => void activities.fetchNextPage()}
          >
            More Activities
          </Button>
        )}
      </Stack>
    </Panel>
  )
}

function MediaList() {
  const media = useMyMedia()
  const rows = media.data?.pages.flatMap((page) => page.data) ?? []
  return (
    <Panel>
      <Stack>
        <Row className="justify-between">
          <h3>Media</h3>
          <Link to="/media" className={linkButton}>
            Media Library
          </Link>
        </Row>
        <ErrorMessage error={media.error} retry={() => void media.refetch()} />
        {media.isPending ? <Loading /> : null}
        {!media.error && !rows.length && !media.isPending ? (
          <p>No media yet.</p>
        ) : null}
        {rows.map((asset) => (
          <Row key={asset.id} className="justify-between">
            <Stack className="min-w-0 gap-1">
              <span className="truncate font-medium">
                {asset.alt || asset.type}
              </span>
              <span className="text-sm text-muted">{asset.state}</span>
            </Stack>
          </Row>
        ))}
        {media.hasNextPage && (
          <Button
            variant="outline"
            disabled={media.isFetchingNextPage}
            onClick={() => void media.fetchNextPage()}
          >
            More media
          </Button>
        )}
      </Stack>
    </Panel>
  )
}
