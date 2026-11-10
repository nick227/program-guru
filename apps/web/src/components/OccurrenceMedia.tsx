import { useRef, useState, type RefObject } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { useActivityRelatedMedia, type components } from '@project/sdk'
import { RelatedMedia } from './RelatedMedia'
import { RelatedMediaMenu } from './RelatedMediaMenu'
import { GroupMediaThread } from './GroupMediaThread'
import { ErrorMessage } from './ui/Feedback'
import { SectionHeader } from './ui/SectionHeader'
import { mergeRelatedMedia } from '@/lib/activityMediaHistory'
import { useMediaUploads } from '@/lib/useMediaUploads'
import { useOnline } from '@/lib/useOnline'

type S = components['schemas']
const FILTERS = ['All', 'Mine', 'Group', 'Public'] as const

export function OccurrenceMedia({
  activityId,
  onAttach,
  prepareUpload,
  myMedia,
  sharedMedia,
  communityMedia,
  siteMedia = [],
  locked,
  group,
  onShared,
  uploadInputRef,
}: {
  activityId: string
  sessionId?: string
  onAttach: (asset: S['MediaAsset']) => Promise<void>
  prepareUpload?: () => Promise<S['AttachmentTarget']>
  myMedia: S['MediaThumb'][]
  sharedMedia: S['GroupMediaThumb'][]
  communityMedia: S['PublicMediaThumb'][]
  siteMedia?: S['MediaThumb'][]
  locked: boolean
  group?: { groupId: string; occurrenceKey: string } | null
  onShared?: () => void
  uploadInputRef?: RefObject<HTMLInputElement>
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const history = useActivityRelatedMedia(activityId)
  const online = useOnline()
  // Uploads can finish together; attach through the existing session's serialized save path.
  const attaching = useRef<Promise<unknown>>(Promise.resolve())
  const uploads = useMediaUploads({
    onReady: (asset) => {
      if (prepareUpload) return
      const next = attaching.current.catch(() => {}).then(() => onAttach(asset))
      attaching.current = next
      return next
    },
  })
  const mine = [
    ...myMedia,
    ...(history.data ?? []).filter((item) => item.mediaState === 'READY'),
  ]
  const owned = new Set(mine.map((m) => m.id))
  const publicItems = locked ? [] : communityMedia
  const permittedSiteMedia = locked ? [] : siteMedia

  const counts: Record<(typeof FILTERS)[number], number> = {
    All: mergeRelatedMedia<S['MediaThumb']>(
      mine,
      permittedSiteMedia,
      sharedMedia,
      publicItems,
    ).length,
    Mine: mergeRelatedMedia<S['MediaThumb']>(mine).length,
    Group: mergeRelatedMedia<S['MediaThumb']>(sharedMedia).length,
    Public: mergeRelatedMedia<S['MediaThumb']>(permittedSiteMedia, publicItems).length,
  }

  const sources =
    filter === 'Mine'
      ? [mine]
      : filter === 'Group'
        ? [sharedMedia]
        : filter === 'Public'
          ? [permittedSiteMedia, publicItems]
          : [mine, permittedSiteMedia, sharedMedia, publicItems]

  const items = mergeRelatedMedia<S['MediaThumb'] & { publicationId?: string }>(
    ...sources,
  ).map((item) => {
    const shared = sharedMedia.find((m) => m.id === item.id)
    const published = publicItems.find((m) => m.id === item.id)
    const groupPublication = filter === 'Group' ? shared?.publicationId : undefined
    const credit =
      published?.creator?.displayName ??
      shared?.owner.displayName ??
      (owned.has(item.id) ? 'You' : undefined)
    const avatarUrl =
      published?.creator?.avatarUrl ?? shared?.owner.avatarUrl ?? null
    return {
      ...item,
      publicationId: groupPublication ?? item.publicationId,
      credit,
      avatarUrl,
      durationMs: item.durationMs,
      likes: published?.likes ?? null,
      attribution: published?.attribution,
      license: published?.license,
      menu: owned.has(item.id) ? (
        <RelatedMediaMenu
          key={item.id}
          mediaId={item.id}
          activityId={activityId}
          group={group}
          onChanged={onShared}
          publications={[
            ...sharedMedia
              .filter((m) => m.id === item.id)
              .map((m) => ({ id: m.publicationId, audience: 'GROUP' as const })),
            ...publicItems
              .filter((m) => m.id === item.id)
              .map((m) => ({ id: m.publicationId, audience: 'PUBLIC' as const })),
          ]}
        />
      ) : undefined,
    }
  })

  return (
    <div id="related-media" className="activity-card activity-related scroll-mt-20">
      <div className="activity-related__header">
        <div className="flex items-start gap-2.5">
          <ImageIcon size={18} className="mt-1 shrink-0 text-accent" aria-hidden />
          <SectionHeader
            title="Related Media"
            description="Photos and videos from you, your group, and the community."
          />
        </div>
        <div role="group" aria-label="Filter related media" className="media-pill-tabs">
          {FILTERS.map((value) => (
            <button
              type="button"
              key={value}
              aria-label={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              <span>{value}</span>
              <span aria-hidden className="text-xs opacity-80 tabular-nums">
                ({counts[value]})
              </span>
            </button>
          ))}
        </div>
      </div>
      <ErrorMessage error={history.error} retry={() => void history.refetch()} />
      <RelatedMedia
        variant="gallery"
        inputRef={uploadInputRef}
        items={items}
        disabled={!online}
        onAdd={async (files) => {
          setFilter('All')
          const target = await prepareUpload?.()
          return uploads.sendAll(
            files,
            target ? { target, purpose: 'JOURNAL' } : undefined,
          )
        }}
        pending={[
          ...(history.data ?? [])
            .filter(
              (item) =>
                item.mediaState !== 'READY' &&
                !uploads.uploads.some((upload) => upload.mediaId === item.id),
            )
            .map((item) => ({
              key: item.id,
              src: item.thumbnailUrl,
              alt: item.alt,
              type: item.type,
              status:
                item.mediaState === 'FAILED' || item.mediaState === 'BLOCKED'
                  ? ('failed' as const)
                  : ('processing' as const),
            })),
          ...uploads.uploads.map((upload) => ({
            key: upload.key,
            src: upload.previewUrl,
            alt: upload.file.name,
            type: upload.file.type.startsWith('video/')
              ? ('VIDEO' as const)
              : ('PHOTO' as const),
            status: upload.stage,
            error: upload.error?.message,
            retry: () => uploads.retry(upload.key),
          })),
        ]}
      >
        {(item) =>
          sharedMedia.some((m) => m.publicationId === item.publicationId) &&
          item.publicationId ? (
            <GroupMediaThread publicationId={item.publicationId} />
          ) : null
        }
      </RelatedMedia>
    </div>
  )
}
