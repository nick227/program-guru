import { ActivityMediaHistory } from './ActivityMediaHistory'
import { MediaAttachments } from './MediaAttachments'
import { ErrorMessage, Loading } from './ui/Feedback'
import { Button } from './ui/Button'
import { useState } from 'react'
import { useMediaSession, type components } from '@project/sdk'
import { Stack } from '@/components/ui/Layout'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Plus } from 'lucide-react'
import { ThumbnailGrid } from '@/components/ThumbnailGrid'
import { MediaViewer, type ViewerItem } from '@/components/MediaViewer'
import { MediaPicker } from './MediaPicker'
import { GroupMediaThread, ShareWithGroup } from './GroupMediaThread'

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
  group,
  onShared,
}: {
  activityId: string
  sessionId?: string
  onAttach: (asset: S['MediaAsset']) => Promise<void>
  myMedia: S['MediaThumb'][]
  sharedMedia: S['GroupMediaThumb'][]
  communityMedia: S['PublicMediaThumb'][]
  locked: boolean
  /** The viewer's group for this occurrence: enables sharing own media and group comments. */
  group?: { groupId: string; occurrenceKey: string } | null
  onShared?: () => void
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
      <section aria-label="Related Media" id="related-media" className="activity-media scroll-mt-20">
        <Stack className="gap-4">
          <SectionHeader
            title="Related Media"
            description={
              related.length
                ? [
                    myMedia.length ? `${myMedia.length} yours (private)` : null,
                    groupCount ? `${groupCount} from your group` : null,
                    communityCount ? `${communityCount} community` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : undefined
            }
          />
          <ErrorMessage
            error={session.error}
            retry={() => void session.refetch()}
          />
          {related.length ? (
            <div className="activity-media__grid">
              <ThumbnailGrid
                items={related.map((item) => ({ ...item, id: item.publicationId ?? `private:${item.id}` }))}
                onAdd={() => setPicking(true)}
                addLabel="Add media to this session"
                columns={6}
                onSelect={(id) =>
                  setViewer({
                    items: related,
                    index: related.findIndex((m) => (m.publicationId ?? `private:${m.id}`) === id),
                  })
                }
              />
            </div>
          ) : (
            <div className="activity-media__empty">
              <p>No media yet. Add a photo or video of this attempt; it stays private unless you share it.</p>
              <Button
                variant="outline"
                size="sm"
                aria-label="Add media to this session"
                onClick={() => setPicking(true)}
              >
                <Plus size={16} aria-hidden /> Add media
              </Button>
            </div>
          )}
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
      </section>
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
        >
          {(() => {
            const current = viewer.items[viewer.index] as (typeof related)[number] | undefined
            if (current?.badge === 'Group' && current.publicationId)
              return <GroupMediaThread key={current.publicationId} publicationId={current.publicationId} />
            if (current?.badge === 'Private' && group && !sharedMedia.some((m) => m.id === current.id))
              return (
                <ShareWithGroup
                  key={current.id}
                  mediaId={current.id}
                  groupId={group.groupId}
                  occurrenceKey={group.occurrenceKey}
                  onShared={onShared}
                />
              )
            return null
          })()}
        </MediaViewer>
      )}
    </>
  )
}
