import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { components } from '@project/sdk'
import { Panel, Stack } from '@/components/ui/Layout'
import { ThumbnailGrid } from '@/components/ThumbnailGrid'
import { MediaViewer, type ViewerItem } from '@/components/MediaViewer'
import { linkButton } from '@/components/Navigation'

type S = components['schemas']

function toViewer(
  items: { id: string; thumbnailUrl?: string | null; type?: string; alt?: string | null }[],
  credit?: (i: number) => string | null,
): ViewerItem[] {
  return items.map((m, i) => ({
    id: m.id,
    thumbnailUrl: m.thumbnailUrl,
    type: m.type,
    alt: m.alt,
    credit: credit?.(i) ?? null,
  }))
}

export function OccurrenceMedia({
  occurrenceId,
  myMedia,
  sharedMedia,
  communityMedia,
  locked,
}: {
  occurrenceId: string
  myMedia: S['MediaThumb'][]
  sharedMedia: S['GroupMediaThumb'][]
  communityMedia: S['PublicMediaThumb'][]
  locked: boolean
}) {
  const [viewer, setViewer] = useState<{
    items: ViewerItem[]
    index: number
  } | null>(null)
  const studio = `/media?returnTo=${encodeURIComponent(`/occurrences/${occurrenceId}`)}`
  return (
    <>
      <Panel>
        <Stack>
          <h2>My Media</h2>
          <ThumbnailGrid
            items={myMedia}
            empty="No private media yet."
            onAdd={() => {
              window.location.assign(studio)
            }}
            onSelect={(id) =>
              setViewer({
                items: toViewer(myMedia),
                index: myMedia.findIndex((m) => m.id === id),
              })
            }
          />
          <Link to={studio} className={linkButton}>
            Open Media Studio
          </Link>
        </Stack>
      </Panel>
      {sharedMedia.length > 0 && (
        <Panel>
          <Stack>
            <h2>Shared Media</h2>
            <ThumbnailGrid
              items={sharedMedia.map((m) => ({
                ...m,
                badge: m.commentCount ? `${m.commentCount}` : undefined,
              }))}
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
              items={communityMedia.map((m) => ({
                ...m,
                badge: m.likes ? `${m.likes}` : undefined,
              }))}
              onSelect={(id) =>
                setViewer({
                  items: toViewer(
                    communityMedia,
                    (i) => communityMedia[i]?.creator?.displayName ?? null,
                  ),
                  index: communityMedia.findIndex((m) => m.id === id),
                })
              }
            />
          </Stack>
        </Panel>
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
