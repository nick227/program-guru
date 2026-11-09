import { CATEGORY_DEFINITIONS, type ActivityCategory } from './activityCategory'

/**
 * Identity image for a Program or Activity (11-MEDIA identity media).
 *
 * Resolution order, shared by every surface:
 *   1. the entity's selected hero (Program cover, Activity COVER; the server
 *      already resolves an Activity's `thumbnailUrl` as COVER → ILLUSTRATION →
 *      DEMONSTRATION → any READY attachment)
 *   2. other eligible entity media supplied by the caller, in order
 *   3. a category fallback rendered from `--cat-*` tokens (never stored)
 *   4. the neutral `custom` fallback
 */
export type Hero = {
  src: string | null
  category: ActivityCategory
  alt: string
  media?: {
    id: string
    type: string
    playbackUrl?: string | null
    posterUrl?: string | null
    durationMs?: number | null
  } | null
}

export type CategorySlugOf = (categoryId?: string | null) => string | null

export function toHeroCategory(slug?: string | null): ActivityCategory {
  return slug && slug in CATEGORY_DEFINITIONS
    ? (slug as ActivityCategory)
    : 'custom'
}

export function resolveHero({
  title,
  images,
  category,
}: {
  title: string
  images: (string | null | undefined)[]
  category?: string | null
}): Hero {
  return {
    src: images.find((url): url is string => !!url) ?? null,
    category: toHeroCategory(category),
    alt: title,
  }
}

export function programHero(
  program: {
    title: string
    coverUrl?: string | null
    coverMedia?: {
      id: string
      type?: string
      thumbnailUrl?: string | null
      posterUrl?: string | null
      playbackUrl?: string | null
      durationMs?: number | null
    } | null
    type?: { categoryId?: string | null } | null
  },
  categorySlugOf: CategorySlugOf,
  otherImages: (string | null | undefined)[] = [],
): Hero {
  const base = resolveHero({
    title: program.title,
    images: [program.coverMedia?.posterUrl ?? program.coverUrl, ...otherImages],
    category: categorySlugOf(program.type?.categoryId),
  })
  return {
    ...base,
    media: program.coverMedia
      ? {
          id: program.coverMedia.id,
          type: program.coverMedia.type ?? 'PHOTO',
          playbackUrl: program.coverMedia.playbackUrl,
          posterUrl: program.coverMedia.posterUrl,
          durationMs: program.coverMedia.durationMs,
        }
      : null,
  }
}

export function activityHero(
  activity: {
    title: string
    thumbnailUrl?: string | null
    coverMedia?: {
      id: string
      type?: string
      thumbnailUrl?: string | null
      posterUrl?: string | null
      playbackUrl?: string | null
      durationMs?: number | null
    } | null
    categoryId?: string | null
  },
  categorySlugOf: CategorySlugOf,
): Hero {
  const base = resolveHero({
    title: activity.title,
    images: [activity.coverMedia?.posterUrl ?? activity.thumbnailUrl],
    category: categorySlugOf(activity.categoryId),
  })
  return {
    ...base,
    media: activity.coverMedia
      ? {
          id: activity.coverMedia.id,
          type: activity.coverMedia.type ?? 'PHOTO',
          playbackUrl: activity.coverMedia.playbackUrl,
          posterUrl: activity.coverMedia.posterUrl,
          durationMs: activity.coverMedia.durationMs,
        }
      : null,
  }
}
