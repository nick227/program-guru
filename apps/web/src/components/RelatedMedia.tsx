import { useState, type ReactNode, type RefObject } from 'react'
import { MediaTray, type MediaTrayItem } from './MediaTray'
import { MediaViewer, type ViewerItem } from './MediaViewer'
import { cn } from '@/lib/utils'

export type RelatedMediaItem = ViewerItem & {
  menu?: ReactNode
  avatarUrl?: string | null
  durationMs?: number | null
  timestamp?: string | null
  likes?: number | null
}

/** Shared, uncollapsed media surface for Programs and Activities. */
/** A Related Media item that may carry a title. */
export type RiverItem = RelatedMediaItem & { title?: string | null }

export function RelatedMedia({
  items,
  onAdd,
  pending = [],
  children,
  className,
  disabled = false,
  variant = 'tray',
  inputRef,
}: {
  items: RelatedMediaItem[]
  onAdd?: (files: File[]) => unknown
  pending?: MediaTrayItem[]
  children?: (item: RelatedMediaItem) => ReactNode
  disabled?: boolean
  className?: string
  variant?: 'tray' | 'gallery'
  inputRef?: RefObject<HTMLInputElement>
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const unique = Array.from(new Map(items.map((item) => [item.id, item])).values())
  const index = unique.findIndex((item) => item.id === selected)
  return (
    <section aria-label="Related Media" className={className}>
      <MediaTray
        className={cn(
          'related-media-tray',
          variant === 'gallery' && 'related-media-tray--gallery',
        )}
        variant={variant}
        inputRef={inputRef}
        disabled={disabled}
        label="Related Media"
        onAdd={onAdd}
        items={[
          ...unique.map(
            (item): MediaTrayItem => ({
              key: item.id,
              src: item.thumbnailUrl,
              alt: item.alt ?? undefined,
              type: item.type as MediaTrayItem['type'],
              status: 'ready',
              menu: item.menu,
              credit: item.credit ?? item.attribution ?? undefined,
              avatarUrl: item.avatarUrl,
              durationMs: item.durationMs,
              timestamp: item.timestamp,
              likes: item.likes,
              onSelect: () => setSelected(item.id),
            }),
          ),
          ...pending,
        ]}
      />
      {index >= 0 && (
        <MediaViewer
          items={unique}
          index={index}
          onIndex={(i) => setSelected(unique[i]?.id ?? null)}
          onClose={() => setSelected(null)}
        >
          {unique[index] && children?.(unique[index])}
        </MediaViewer>
      )}
    </section>
  )
}
