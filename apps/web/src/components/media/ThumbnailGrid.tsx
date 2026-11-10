import { MediaItem } from '@/components/media/MediaGrid'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Thumb = {
  id: string
  thumbnailUrl?: string | null
  alt?: string | null
  type?: 'PHOTO' | 'VIDEO' | 'AUDIO' | string
  badge?: string
}

export function ThumbnailGrid({
  items,
  onSelect,
  onAdd,
  addLabel = 'Add media',
  columns = 5,
  empty,
}: {
  items: Thumb[]
  onSelect?: (id: string) => void
  onAdd?: () => void
  addLabel?: string
  columns?: 4 | 5 | 6
  empty?: string
}) {
  const cols =
    columns === 6
      ? 'grid-cols-6'
      : columns === 4
        ? 'grid-cols-4'
        : 'grid-cols-5'
  if (!items.length && !onAdd)
    return empty ? <p className="text-muted">{empty}</p> : null
  return (
    <ul className={cn('grid gap-2', cols)}>
      {items.map((item) => (
        <li key={item.id} className="relative">
          {item.badge && (
            <span className="pointer-events-none absolute left-1 top-1 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {item.badge}
            </span>
          )}
          <MediaItem
            asset={item}
            disabled={!onSelect}
            onSelect={() => onSelect?.(item.id)}
          />
        </li>
      ))}
      {onAdd && (
        <li>
          <button
            type="button"
            onClick={(event) => {
              event.currentTarget.focus()
              onAdd()
            }}
            aria-label={addLabel}
            className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed text-muted hover:border-accent hover:text-accent"
          >
            <Plus size={18} />
          </button>
        </li>
      )}
    </ul>
  )
}
