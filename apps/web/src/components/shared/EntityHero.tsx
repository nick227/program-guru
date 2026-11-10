import { useState, type CSSProperties } from 'react'
import { Play } from 'lucide-react'
import { useCategories } from '@project/sdk'
import type { CategorySlugOf, Hero } from '@/lib/hero'
import { MediaViewer } from '@/components/media/MediaViewer'
import { cn } from '@/lib/utils'
import { CategoryIcon } from '@/components/shared/CategoryIcon'

const SIZES = {
  /** list rows, rails */
  thumb: 'h-12 w-12 rounded-lg',
  row: 'h-16 w-20 rounded-lg sm:w-24',
  /** browser and storefront cards */
  card: 'aspect-video w-full rounded-lg',
  /** compact Workspace/editor header */
  header: 'h-20 w-20 rounded-xl sm:h-24 sm:w-24',
  /** Program storefront */
  banner: 'aspect-[2/1] w-full rounded-xl',
} as const

const ICON_SIZES = {
  row: 24,
  thumb: 18,
  card: 32,
  header: 28,
  banner: 44,
} as const

/**
 * Render-only identity image with optional video play affordance.
 * Missing or failing images show the category fallback, drawn from design
 * tokens, so there is never a broken image.
 */
export function EntityHero({
  hero,
  size = 'card',
  className,
  onPlay,
}: {
  hero: Hero
  size?: keyof typeof SIZES
  className?: string
  onPlay?: () => void
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const showImage = !!hero.src && failedSrc !== hero.src
  const tone = `var(--cat-${hero.category}, var(--color-accent))`
  const isVideo = hero.media?.type === 'VIDEO' && showImage

  return (
    <div
      aria-hidden={!isVideo ? true : undefined}
      style={
        !showImage
          ? ({
              color: `hsl(${tone})`,
            } as CSSProperties)
          : undefined
      }
      data-hero-category={hero.category}
      data-hero-fallback={showImage ? undefined : 'true'}
      className={cn(
        'relative isolate flex shrink-0 items-center justify-center overflow-hidden',
        SIZES[size],
        className,
      )}
    >
      {!showImage && (
        <CategoryIcon
          category={hero.category}
          size={ICON_SIZES[size]}
          strokeWidth={1.75}
          className="opacity-90"
        />
      )}
      {showImage && (
        <img
          src={hero.src!}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(hero.src)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {isVideo && (
        <button
          type="button"
          aria-label={`Play ${hero.alt || 'video'}`}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (onPlay) {
              onPlay()
            } else {
              setViewerOpen(true)
            }
          }}
          className={cn(
            'absolute inset-0 z-10 flex items-center justify-center transition-colors',
            size === 'thumb' || size === 'row'
              ? 'p-1'
              : 'bg-black/25 hover:bg-black/40',
          )}
        >
          <span
            className={cn(
              'flex items-center justify-center rounded-full bg-black/75 text-white shadow-md transition-transform hover:scale-110',
              size === 'thumb'
                ? 'h-6 w-6'
                : size === 'row'
                  ? 'h-7 w-7'
                  : 'h-11 w-11 sm:h-12 sm:w-12',
            )}
          >
            <Play
              size={size === 'thumb' ? 12 : size === 'row' ? 14 : 20}
              className="fill-current translate-x-0.5"
              aria-hidden
            />
          </span>
        </button>
      )}
      {viewerOpen && hero.media && (
        <MediaViewer
          items={[
            {
              id: hero.media.id,
              url: hero.media.playbackUrl ?? hero.src ?? '',
              type: 'VIDEO',
              alt: hero.alt,
            },
          ]}
          index={0}
          onIndex={() => {}}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  )
}

/** Category id → slug from the cached catalog (shared by every hero). */
export function useCategorySlugOf(): CategorySlugOf {
  const categories = useCategories()
  return (categoryId) =>
    categoryId
      ? (categories.data?.find((category) => category.id === categoryId)
          ?.slug ?? null)
      : null
}
