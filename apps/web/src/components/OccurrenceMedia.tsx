import { ActivityMediaHistory } from './ActivityMediaHistory'
import { MediaAttachments } from './MediaAttachments'
import { ErrorMessage, Loading } from './ui/Feedback'
import { Button } from './ui/Button'
import { useState } from 'react'
import { useMediaSession, type components } from '@project/sdk'
import { Panel, Stack } from '@/components/ui/Layout'
import { ThumbnailGrid } from '@/components/ThumbnailGrid'
import { MediaViewer, type ViewerItem } from '@/components/MediaViewer'
import { MediaPicker } from './MediaPicker'

type S = components['schemas']

function toViewer(
  items: {
    id: string
    thumbnailUrl?: string | null
    type?: string
    alt?: string | null
    publicationId?: string
  }[],
  credit?: (i: number) => string | null,
): ViewerItem[] {
  return items.map((m, i) => ({
    id: m.id,
    publicationId: m.publicationId,
    thumbnailUrl: m.thumbnailUrl,
    type: m.type,
    alt: m.alt,
    credit: credit?.(i) ?? null,
  }))
}

export function OccurrenceMedia({
  activityId,
  sessionId,
  onAttach,
  myMedia,
  sharedMedia,
  communityMedia,
  locked,
}: {
  activityId: string
  sessionId?: string
  onAttach: (asset: S['MediaAsset']) => Promise<void>
  myMedia: S['MediaThumb'][]
  sharedMedia: S['GroupMediaThumb'][]
  communityMedia: S['PublicMediaThumb'][]
  locked: boolean
}) {
  const [viewer, setViewer] = useState<{
    items: ViewerItem[]
    index: number
  } | null>(null)
  const session = useMediaSession(sessionId)
  const entry = session.data?.entries.find(
    (entry) => entry.instructionId === null,
  )
  const [managing, setManaging] = useState(false)
  const [picking, setPicking] = useState(false)
  // One attributed strip: yours first, then group media, then public community
  // examples (withheld while access is locked). Credits show in the viewer.
  const related: (ViewerItem & { badge?: string })[] = [
    ...toViewer(myMedia).map((item) => ({ ...item, badge: 'Private' })),
    ...toViewer(sharedMedia, (i) => sharedMedia[i] ? `Shared by ${sharedMedia[i].owner.displayName} · Group only` : null).map(
      (item) => ({ ...item, badge: 'Group' }),
    ),
    ...(locked
      ? []
      : toViewer(communityMedia, (i) =>
          [
            communityMedia[i]?.creator?.displayName,
            communityMedia[i]?.attribution,
            communityMedia[i]?.license,
          ]
            .filter(Boolean)
            .join(' · '),
        ).map((item) => ({ ...item, badge: 'Community' }))),
  ]
  const groupCount = sharedMedia.length
  const communityCount = locked ? 0 : communityMedia.length
  return (
    <>
      <Panel aria-label="Related Media">
        <Stack>
          <div>
            <h2>Related Media</h2>
            <p className="text-sm text-muted">
              {myMedia.length} yours (private)
              {groupCount ? ` · ${groupCount} from your group` : ''}
              {communityCount ? ` · ${communityCount} community` : ''}
            </p>
          </div>
          <ErrorMessage
            error={session.error}
            retry={() => void session.refetch()}
          />
          <ThumbnailGrid
            items={related.map((item) => ({ ...item, id: item.publicationId ?? `private:${item.id}` }))}
            empty="No media yet."
            onAdd={() => setPicking(true)}
            addLabel="Add media to this session"
            columns={5}
            onSelect={(id) =>
              setViewer({
                items: related,
                index: related.findIndex((m) => (m.publicationId ?? `private:${m.id}`) === id),
              })
            }
          />
          <div className="flex flex-wrap items-start gap-2">
            {sessionId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setManaging((value) => !value)}
                aria-expanded={managing}
              >
                Manage attachments
              </Button>
            )}
          </div>
          {managing && (
            <Stack>
              <p className="text-sm text-muted">Attachments for this attempt</p>
              {session.isPending ? (
                <Loading />
              ) : !session.error && !session.data?.entries.length ? (
                <p>No attachments yet.</p>
              ) : null}
              {!session.error &&
                session.data?.entries.map((entry) => (
                  <MediaAttachments
                    key={entry.id}
                    context={{ kind: 'Activity', resultEntryId: entry.id }}
                  />
                ))}
            </Stack>
          )}
          <ActivityMediaHistory
            key={activityId}
            activityId={activityId}
            currentSessionId={sessionId}
          />
        </Stack>
      </Panel>
      {picking && (
        <MediaPicker
          context={
            entry ? { kind: 'Activity', resultEntryId: entry.id } : undefined
          }
          onClose={() => setPicking(false)}
          onSelect={onAttach}
          selected={myMedia.map((m) => m.id)}
        />
      )}
      {viewer && viewer.index >= 0 && (
        <MediaViewer
          items={viewer.items}
          index={viewer.index}
          onClose={() => setViewer(null)}
          onIndex={(i) => setViewer({ ...viewer, index: i })}
        />
      )}
    </>
  )
}
