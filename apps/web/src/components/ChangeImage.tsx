import React, { useEffect, useRef, useState } from 'react'
import { ImageIcon, Loader2, Upload, X } from 'lucide-react'
import type { Hero } from '@/lib/hero'
import type { CoverController } from '@/lib/useEntityCover'
import { useOnline } from '@/lib/useOnline'
import { useInboundMedia } from '@project/sdk'
import { EntityHero } from './EntityHero'
import { MediaPicker } from './MediaPicker'
import { Button } from './ui/Button'
import { ErrorMessage } from './ui/Feedback'
import { cn } from '@/lib/utils'

/**
 * 3/4 canvas identity-image control:
 * A 3/4 aspect ratio visual canvas dropzone with direct file upload,
 * drag-and-drop, Media Library selection, and cover removal.
 */
export function ChangeImage({
  hero,
  cover,
  label,
  canEdit,
  className,
}: {
  hero: Hero
  cover: CoverController
  /** e.g. "Program cover" or "Activity image" */
  label: string
  canEdit: boolean
  compact?: boolean
  className?: string
}) {
  const online = useOnline()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<unknown>(null)
  const [picking, setPicking] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const inbound = useInboundMedia({
    target: cover.target,
    purpose: 'COVER',
    onError: setError,
  })

  // Once upload reaches ready, notify cover controller to invalidate caches
  useEffect(() => {
    if (inbound.stage === 'ready' && inbound.mediaId) {
      cover.set(inbound.mediaId).catch(() => {})
    }
  }, [inbound.stage, inbound.mediaId, cover])

  const working = inbound.busy || inbound.stage === 'processing' || cover.pending
  const disabled = !online || working

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError(new Error('Choose an image file for this cover.'))
      return
    }
    setError(null)
    try {
      const asset = await inbound.upload(file)
      if (asset?.state === 'READY') {
        await cover.set(asset.id)
      }
    } catch (err) {
      setError(err)
    }
  }

  return (
    <div className={cn('space-y-2', className)} aria-label={label} role="group">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          await handleFile(file)
        }}
      />

      {/* 3/4 Canvas Image Area */}
      <div className="flex flex-col sm:flex-row items-start gap-4">
        <div
          role="button"
          tabIndex={canEdit && !disabled ? 0 : -1}
          aria-label={cover.hasCover ? 'Change image' : 'Upload image'}
          onClick={() => {
            if (canEdit && !disabled) fileInputRef.current?.click()
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && canEdit && !disabled) {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            if (canEdit && !disabled) setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={async (e) => {
            e.preventDefault()
            setIsDragging(false)
            if (!canEdit || disabled) return
            const file = e.dataTransfer.files?.[0]
            if (file) await handleFile(file)
          }}
          className={cn(
            'relative aspect-[3/4] w-44 sm:w-52 shrink-0 overflow-hidden rounded-xl border-2 transition-all select-none',
            cover.hasCover
              ? 'border-border bg-surface'
              : 'border-dashed border-border bg-surface-raised/50 hover:border-accent hover:bg-surface-raised cursor-pointer',
            isDragging && 'border-accent bg-accent/10',
            disabled && 'opacity-60 cursor-not-allowed',
          )}
        >
          {/* 3/4 Canvas visual: shows EntityHero (cover image or category art fallback) */}
          <EntityHero
            hero={hero}
            className="h-full w-full object-cover"
          />

          {/* Interactive dropzone overlay */}
          <div
            className={cn(
              'absolute inset-0 flex flex-col items-center justify-center p-4 text-center transition-opacity cursor-pointer',
              cover.hasCover
                ? 'bg-black/55 text-white opacity-0 hover:opacity-100 focus:opacity-100'
                : 'bg-background/60 hover:bg-background/40 text-foreground backdrop-blur-[1px]',
            )}
          >
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-surface/90 shadow text-accent">
              {working ? (
                <Loader2 size={20} className="animate-spin" aria-hidden />
              ) : (
                <Upload size={20} aria-hidden />
              )}
            </div>
            <span className="text-sm font-semibold">
              {working ? 'Uploading…' : cover.hasCover ? 'Change image' : 'Upload image'}
            </span>
            <span className="mt-1 text-xs opacity-80">
              3/4 canvas · Click or drop
            </span>
          </div>

          {/* Loading overlay */}
          {working && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 text-foreground">
              <Loader2 size={24} className="animate-spin text-accent mb-1" />
              <span className="text-xs font-semibold">Uploading…</span>
            </div>
          )}
        </div>

        {/* Action Controls alongside 3/4 canvas */}
        {canEdit && (
          <div className="flex flex-col items-start gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} className="mr-1.5" aria-hidden />
              Upload image
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => setPicking(true)}
            >
              <ImageIcon size={14} className="mr-1.5" aria-hidden />
              Choose from library
            </Button>
            {cover.hasCover && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger hover:text-danger"
                disabled={disabled}
                onClick={async () => {
                  setError(null)
                  try {
                    await cover.remove()
                  } catch (err) {
                    setError(err)
                  }
                }}
              >
                <X size={14} className="mr-1.5" aria-hidden />
                Remove image
              </Button>
            )}
            <ErrorMessage error={error || cover.error || inbound.error} />
          </div>
        )}
      </div>

      {picking && (
        <MediaPicker
          title={`Choose ${label.toLowerCase()}`}
          allowCapture={false}
          onClose={() => setPicking(false)}
          onSelect={async (asset) => {
            if (asset.type !== 'PHOTO')
              throw new Error('Choose a photo for this image.')
            await cover.set(asset.id)
          }}
        />
      )}
    </div>
  )
}
