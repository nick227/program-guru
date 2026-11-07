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
  sessionId,
  onAttach,
  myMedia,
  sharedMedia,
  communityMedia,
  locked,
}: {
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
  return (
    <>
      <Panel>
        <Stack>
          <h2>My Media</h2>
          <ErrorMessage
            error={session.error}
            retry={() => void session.refetch()}
          />
          <ThumbnailGrid
            items={myMedia}
            empty="No private media yet."
            onAdd={() => setPicking(true)}
            onSelect={(id) =>
              setViewer({
                items: toViewer(myMedia),
                index: myMedia.findIndex((m) => m.id === id),
              })
            }
          />
          {sessionId && (
            <Button
              variant="outline"
              onClick={() => setManaging((value) => !value)}
              aria-expanded={managing}
            >
              Manage attachments
            </Button>
          )}
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
        </Stack>
      </Panel>
      {sharedMedia.length > 0 && (
        <Panel>
          <Stack>
            <h2>Shared Media</h2>
            <ThumbnailGrid
              items={sharedMedia}
              onSelect={(id) =>
                setViewer({
                  items: toViewer(
                    sharedMedia,
                    (i) => sharedMedia[i]?.owner.displayName ?? null,
                  ),
                  index: sharedMedia.findIndex((m) => m.id === id),
                })
              }
            />
          </Stack>
        </Panel>
      )}
      {!locked && communityMedia.length > 0 && (
        <Panel>
          <Stack>
            <h2>Community Media</h2>
            <ThumbnailGrid
              items={communityMedia}
              onSelect={(id) =>
                setViewer({
                  items: toViewer(communityMedia, (i) =>
                    [
                      communityMedia[i]?.creator?.displayName,
                      communityMedia[i]?.attribution,
                      communityMedia[i]?.license,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  ),
                  index: communityMedia.findIndex((m) => m.id === id),
                })
              }
            />
          </Stack>
        </Panel>
      )}
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
