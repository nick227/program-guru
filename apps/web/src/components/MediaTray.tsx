import { usePwaReloadBlocker } from '@/lib/pwaSafety'
import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { AlertCircle, Heart, ImagePlus, Loader2, Play, UploadCloud, X } from 'lucide-react'
import type { components } from '@project/sdk'
import { ErrorMessage } from './ui/Feedback'
import { Avatar } from './ui/Avatar'
import { isMediaFile } from '@/lib/useMediaUploads'
import { formatMediaDuration } from '@/lib/mediaDuration'
import { cn } from '@/lib/utils'

export type MediaTrayItem = {
  mediaId?: string
  key: string
  /** Server thumbnail, or the local preview while the file is still processing. */
  src?: string | null
  type?: components['schemas']['MediaType']
  alt?: string
  status: 'ready' | 'uploading' | 'processing' | 'failed'
  error?: string
  remove?: () => unknown
  /** Offered on a failed upload whose file is still in hand. */
  retry?: () => unknown
  onSelect?: () => void
  menu?: ReactNode
  credit?: string
  avatarUrl?: string | null
  durationMs?: number | null
  timestamp?: string | null
  likes?: number | null
}

const STATUS_LABEL = {
  uploading: 'Uploading…',
  processing: 'Processing…',
} as const

/**
 * The one media control for editing Programs and Activities: every item lines up as a
 * preview tile with an inline remove, followed by one add tile (click or drop).
 */
export function MediaTray({
  label,
  items,
  onAdd,
  multiple = true,
  accept = 'media',
  disabled = false,
  aspect = multiple ? 'preview' : 'hero',
  variant = 'tray',
  inputRef,
  className,
}: {
  /** Accessible group name, e.g. "Program cover" or "Activity media". */
  label: string
  items: MediaTrayItem[]
  onAdd?: (files: File[]) => unknown
  /** Single-item trays (a cover) replace the item instead of adding another. */
  multiple?: boolean
  accept?: 'image' | 'media'
  disabled?: boolean
  /** Aspect ratio: 'hero' (16:9) for Program covers, 'preview' (4:3) for Activities. */
  aspect?: 'hero' | 'preview'
  /** 'gallery' renders upload first and a structured footer for Occurrence/Activity cards. */
  variant?: 'tray' | 'gallery'
  inputRef?: RefObject<HTMLInputElement>
  className?: string
}) {
  const internalRef = useRef<HTMLInputElement>(null)
  const fileInputRef = inputRef ?? internalRef
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const hasItem = items.length > 0
  usePwaReloadBlocker(
    items.some((item) => item.status === 'uploading' || item.status === 'processing') ||
      removing !== null,
  )
  const addLabel =
    !multiple && hasItem
      ? accept === 'image'
        ? 'Replace image'
        : 'Replace media'
      : accept === 'image'
        ? 'Add image'
        : 'Add media'

  function take(list: FileList | null) {
    const files = Array.from(list ?? [])
    const usable = files.filter((file) => isMediaFile(file, accept))
    if (!usable.length) {
      if (files.length)
        setError(
          new Error(
            accept === 'image' ? 'Choose an image file.' : 'Choose images or videos.',
          ),
        )
      return
    }
    setError(null)
    Promise.resolve(onAdd?.(multiple ? usable : usable.slice(0, 1))).catch(setError)
  }

  async function removeItem(item: MediaTrayItem) {
    setError(null)
    setRemoving(item.key)
    try {
      await item.remove?.()
    } catch (err) {
      setError(err)
    } finally {
      setRemoving(null)
    }
  }

  const tileClass =
    variant === 'gallery'
      ? 'w-full'
      : aspect === 'hero'
        ? 'aspect-hero w-48 sm:w-56 shrink-0'
        : 'aspect-preview w-32 sm:w-40 shrink-0'

  const uploadTile = onAdd ? (
    <li key="__add__" className={tileClass}>
      <button
        type="button"
        disabled={disabled}
        aria-label={addLabel}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!disabled) take(event.dataTransfer.files)
        }}
        className={cn(
          'flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-[var(--radius-media)] border-2 border-dashed text-xs font-semibold transition-colors',
          variant === 'gallery' && 'min-h-[9.25rem] bg-background/35 p-4 text-center',
          dragging
            ? 'border-accent bg-accent/10 text-foreground'
            : 'border-border text-muted hover:border-accent hover:text-foreground',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        {variant === 'gallery' ? (
          <>
            <UploadCloud size={22} className="text-muted" aria-hidden />
            <span className="text-sm font-semibold text-text">Upload media</span>
            <span className="text-xs font-normal text-muted">
              Add a photo or video
            </span>
          </>
        ) : (
          <ImagePlus size={20} aria-hidden />
        )}
      </button>
    </li>
  ) : null

  return (
    <div role="group" aria-label={label} className={cn('space-y-2', className)}>
      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        accept={accept === 'image' ? 'image/*' : 'image/*,video/*'}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onChange={(event) => {
          take(event.target.files)
          event.target.value = ''
        }}
      />
      <ul className="flex flex-wrap gap-3">
        {variant === 'gallery' && uploadTile}
        {items.map((item) => {
          const duration = formatMediaDuration(item.durationMs)
          return (
            <li
              key={item.key}
              className={cn(
                'relative rounded-[var(--radius-media)] border border-border bg-surface-muted',
                variant === 'gallery' && 'flex flex-col bg-background/55',
                tileClass,
              )}
            >
              <div
                className={cn(
                  'relative overflow-hidden',
                  variant === 'gallery'
                    ? 'aspect-[16/10] w-full rounded-t-[calc(var(--radius-media)-1px)] bg-surface-muted'
                    : 'h-full w-full rounded-[var(--radius-media)]',
                )}
              >
                <button
                  type="button"
                  className="h-full w-full"
                  disabled={!item.onSelect || item.status !== 'ready'}
                  onClick={item.onSelect}
                  aria-label={item.alt || 'View media'}
                >
                  <TrayPreview item={item} duration={duration} />
                </button>
              </div>
              {variant === 'gallery' ? (
                <div className="flex items-center justify-between gap-2 border-t border-border/60 px-2.5 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar
                      src={item.avatarUrl}
                      name={item.credit || item.alt || 'Media'}
                      size="sm"
                      className="h-6 w-6 text-[10px]"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-text">
                        {item.credit || item.alt || 'Media'}
                      </p>
                      {item.timestamp && (
                        <p className="truncate text-[11px] text-muted">{item.timestamp}</p>
                      )}
                    </div>
                  </div>
                  {typeof item.likes === 'number' && item.likes > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted tabular-nums">
                      <Heart size={12} aria-hidden />
                      {item.likes}
                    </span>
                  )}
                </div>
              ) : (
                item.credit && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate rounded-b-[var(--radius-media)] bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2 pb-2 pt-6 text-xs text-white">
                    {item.credit}
                  </span>
                )
              )}
              {item.menu}
              {item.status !== 'ready' && (
                <div
                  className={cn(
                    'absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-[var(--radius-media)] p-2 text-center text-xs font-semibold',
                    item.status === 'failed'
                      ? 'bg-background/85 text-danger'
                      : 'bg-background/55 text-foreground',
                  )}
                  role="status"
                >
                  {item.status === 'failed' ? (
                    <>
                      <AlertCircle size={18} aria-hidden />
                      <span className="line-clamp-3 font-normal">
                        {item.error || 'Upload failed'}
                      </span>
                      {item.retry && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => void item.retry?.()}
                          className="mt-1 rounded-full border border-current px-2.5 py-0.5 font-semibold hover:bg-danger/10"
                        >
                          Retry
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <Loader2 size={18} className="animate-spin text-accent" aria-hidden />
                      <span>{STATUS_LABEL[item.status]}</span>
                    </>
                  )}
                </div>
              )}
              {item.remove && (
                <button
                  type="button"
                  aria-label={accept === 'image' ? 'Remove image' : 'Remove media'}
                  disabled={disabled || removing === item.key}
                  onClick={() => void removeItem(item)}
                  className="absolute right-1.5 top-1.5 z-20 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90"
                >
                  <X size={14} aria-hidden />
                </button>
              )}
            </li>
          )
        })}
        {variant !== 'gallery' && uploadTile}
      </ul>
      <ErrorMessage error={error} />
    </div>
  )
}

function TrayPreview({
  item,
  duration,
}: {
  item: MediaTrayItem
  duration?: string | null
}) {
  const [broken, setBroken] = useState(false)
  if (!item.src || broken)
    return (
      <div className="flex h-full w-full items-center justify-center text-muted">
        {item.type === 'VIDEO' ? (
          <Play size={20} aria-hidden />
        ) : (
          <ImagePlus size={20} aria-hidden />
        )}
      </div>
    )
  // A local video preview has no thumbnail yet: show its first frame.
  if (item.type === 'VIDEO' && item.src.startsWith('blob:'))
    return (
      <video
        src={item.src}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
    )
  return (
    <>
      <img
        src={item.src}
        alt={item.alt ?? ''}
        loading="lazy"
        onError={() => setBroken(true)}
        className="h-full w-full object-cover"
      />
      {item.type === 'VIDEO' && (
        <>
          <span className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-white">
            <Play size={12} className="translate-x-[1px] fill-current" aria-hidden />
          </span>
          {duration && (
            <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
              {duration}
            </span>
          )}
        </>
      )}
    </>
  )
}
