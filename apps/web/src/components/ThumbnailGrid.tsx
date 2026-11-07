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
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect?.(item.id)}
            className="group relative aspect-square w-full overflow-hidden rounded-md border bg-surface-muted"
            aria-label={item.alt || 'Open media'}
          >
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover transition-transform duration-fast group-hover:scale-105"
              />
            ) : (
              <span className="flex h-full items-center justify-center text-[10px] text-muted">
                {item.type === 'VIDEO' ? 'Video' : 'Media'}
              </span>
            )}
            {item.badge && (
              <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[9px] text-white">
                {item.badge}
              </span>
            )}
          </button>
        </li>
      ))}
      {onAdd && (
        <li>
          <button
            type="button"
            onClick={onAdd}
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
