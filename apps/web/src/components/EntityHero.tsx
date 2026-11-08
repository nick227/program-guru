import { useState, type CSSProperties } from 'react'
import { useCategories } from '@project/sdk'
import type { CategorySlugOf, Hero } from '@/lib/hero'
import { cn } from '@/lib/utils'
import { CategoryIcon } from './CategoryIcon'

const SIZES = {
  /** list rows, rails */
  thumb: 'h-12 w-12 rounded-lg',
  /** browser and storefront cards */
  card: 'aspect-video w-full rounded-lg',
  /** compact Workspace/editor header */
  header: 'h-20 w-20 rounded-xl sm:h-24 sm:w-24',
  /** Program storefront */
  banner: 'aspect-[2/1] w-full rounded-xl',
} as const

const ICON_SIZES = { thumb: 18, card: 32, header: 28, banner: 44 } as const

/**
 * Render-only identity image. Missing or failing images show the category
 * fallback, drawn from design tokens, so there is never a broken image.
 * Decorative: consumers render the entity title next to it.
 */
export function EntityHero({
  hero,
  size = 'card',
  className,
}: {
  hero: Hero
  size?: keyof typeof SIZES
  className?: string
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = !!hero.src && failedSrc !== hero.src
  const tone = `var(--cat-${hero.category}, var(--color-accent))`
  return (
    <div
      aria-hidden
      data-hero-category={hero.category}
      data-hero-fallback={showImage ? undefined : 'true'}
      className={cn(
        'relative isolate flex shrink-0 items-center justify-center overflow-visible',
        SIZES[size],
        className,
      )}
    >
      <CategoryIcon
        category={hero.category}
        size={ICON_SIZES[size]}
        strokeWidth={1.75}
        className="text-white/90"
      />
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
