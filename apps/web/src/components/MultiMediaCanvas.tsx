import React, { useRef, useState } from 'react'
import { ImagePlus, Loader2, Upload, X } from 'lucide-react'
import { useInboundMedia, type components } from '@project/sdk'
import { Button } from './ui/Button'
import { ErrorMessage } from './ui/Feedback'
import { cn } from '@/lib/utils'

export type UploadedMediaItem = {
  id: string
  url?: string | null
  name?: string
  mime?: string
}

export function MultiMediaCanvas({
  target,
  purpose = 'DEMONSTRATION',
  disabled = false,
  items = [],
  onUploaded,
  onRemove,
  className,
}: {
  target?: components['schemas']['AttachmentTarget']
  purpose?: components['schemas']['MediaPurpose']
  disabled?: boolean
  items?: UploadedMediaItem[]
  onUploaded?: (asset: components['schemas']['MediaAsset']) => void
  onRemove?: (id: string) => void
  className?: string
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<unknown>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadingCount, setUploadingCount] = useState(0)

  const inbound = useInboundMedia({
    target,
    purpose,
    onError: setError,
  })

  const working = inbound.busy || inbound.stage === 'processing' || uploadingCount > 0

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
    )
    if (!list.length) {
      setError(new Error('Select images or videos to upload.'))
      return
    }

    setError(null)
    setUploadingCount(list.length)

    try {
      for (const file of list) {
        const asset = await inbound.upload(file)
        if (asset) {
          onUploaded?.(asset)
        }
      }
    } catch (err) {
      setError(err)
    } finally {
      setUploadingCount(0)
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        disabled={disabled || working}
        onChange={async (e) => {
          if (e.target.files) {
            await handleFiles(e.target.files)
            e.target.value = ''
          }
        }}
      />

      <div className="flex flex-wrap items-start gap-3">
        {/* 3/4 Canvas Dropzone */}
        <div
          role="button"
          tabIndex={disabled || working ? -1 : 0}
          aria-label="Upload demonstration media"
          onClick={() => {
            if (!disabled && !working) fileInputRef.current?.click()
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled && !working) {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            if (!disabled && !working) setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={async (e) => {
            e.preventDefault()
            setIsDragging(false)
            if (disabled || working) return
            if (e.dataTransfer.files) {
              await handleFiles(e.dataTransfer.files)
            }
          }}
          className={cn(
            'relative aspect-[3/4] w-36 sm:w-44 shrink-0 overflow-hidden rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center p-3 text-center cursor-pointer select-none',
            isDragging
              ? 'border-accent bg-accent/10'
              : 'border-border bg-surface-raised/40 hover:border-accent hover:bg-surface-raised',
            (disabled || working) && 'opacity-60 cursor-not-allowed',
          )}
        >
          {working ? (
            <div className="flex flex-col items-center justify-center">
              <Loader2 size={24} className="animate-spin text-accent mb-1" />
              <span className="text-xs font-semibold text-foreground">
                Uploading {uploadingCount > 1 ? `(${uploadingCount})` : ''}…
              </span>
            </div>
          ) : (
            <>
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
                <ImagePlus size={18} aria-hidden />
              </div>
              <span className="text-xs font-semibold text-foreground">
                Upload media
              </span>
              <span className="mt-1 text-[10px] text-muted leading-tight">
                3/4 canvas<br />Multiple files
              </span>
            </>
          )}
        </div>

        {/* Uploaded media previews in 3/4 aspect */}
        {items.map((item) => (
          <div
            key={item.id}
            className="relative aspect-[3/4] w-36 sm:w-44 shrink-0 overflow-hidden rounded-xl border border-border bg-surface group"
          >
            {item.url ? (
              <img
                src={item.url}
                alt={item.name || ''}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-surface-raised text-muted text-xs p-2 text-center">
                {item.name || 'Media item'}
              </div>
            )}
            {onRemove && !disabled && (
              <button
                type="button"
                aria-label={`Remove ${item.name || 'media'}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(item.id)
                }}
                className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-black group-hover:opacity-100 focus:opacity-100"
              >
                <X size={12} aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>

      <ErrorMessage error={error || inbound.error} />
    </div>
  )
}
