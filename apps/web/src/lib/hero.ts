import { domainVisualCategory, type ActivityCategory } from './activityCategory'

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
  return domainVisualCategory(slug) ?? 'custom'
}

/**
 * Returns a high-quality approved platform cover or illustration for an activity or program
 * based on title keywords and domain visual category.
 */
export function getCategoryFallbackImage(title: string, category?: string | null): string {
  const t = title.toLowerCase()
  if (t.includes('push') || t.includes('squat') || t.includes('workout') || t.includes('strength')) {
    return '/assets/covers/starter-build-your-core.jpg'
  }
  if (t.includes('jog') || t.includes('run') || t.includes('cardio')) {
    return '/assets/covers/starter-jog-one-mile.jpg'
  }
  if (t.includes('core') || t.includes('sit-up') || t.includes('plank')) {
    return '/assets/covers/starter-build-your-core.jpg'
  }
  if (t.includes('meditat') || t.includes('breath') || t.includes('mindful')) {
    return '/assets/covers/starter-60-second-meditation.jpg'
  }
  if (t.includes('sleep') || t.includes('relax')) {
    return '/assets/covers/starter-sleep-relaxation-technique.jpg'
  }
  if (t.includes('book') || t.includes('read') || t.includes('fiction')) {
    return '/assets/covers/starter-read-a-fiction-book.jpg'
  }
  if (t.includes('learn') || t.includes('study') || t.includes('event')) {
    return '/assets/covers/starter-attend-learning-event.jpg'
  }
  if (t.includes('budget') || t.includes('finance') || t.includes('money')) {
    return '/assets/covers/starter-balance-monthly-budget.jpg'
  }
  if (t.includes('business') || t.includes('sales') || t.includes('work')) {
    return '/assets/covers/starter-work-on-business-plan.jpg'
  }
  if (t.includes('dinner') || t.includes('friend') || t.includes('social') || t.includes('coffee')) {
    return '/assets/covers/starter-have-dinner-with-a-friend.jpg'
  }
  if (t.includes('sketch') || t.includes('art') || t.includes('paint') || t.includes('draw')) {
    return '/assets/illustrations/group-sketch-session.jpg'
  }
  if (t.includes('puzzle') || t.includes('chess') || t.includes('game')) {
    return '/assets/illustrations/cooperative-puzzle-hour.jpg'
  }
  if (t.includes('film') || t.includes('camera') || t.includes('direct')) {
    return '/assets/illustrations/direct-film-scene.jpg'
  }
  if (t.includes('garden') || t.includes('plant')) {
    return '/assets/illustrations/plant-community-garden.jpg'
  }
  if (t.includes('guitar') || t.includes('music')) {
    return '/assets/illustrations/twenty-minute-guitar-practice.jpg'
  }

  switch (category) {
    case 'fitness':
      return '/assets/covers/starter-jog-one-mile.jpg'
    case 'wellness':
      return '/assets/covers/starter-60-second-meditation.jpg'
    case 'education':
      return '/assets/covers/starter-attend-learning-event.jpg'
    case 'finance':
      return '/assets/covers/starter-balance-monthly-budget.jpg'
    case 'relationships':
      return '/assets/covers/starter-have-dinner-with-a-friend.jpg'
    case 'custom':
    default:
      return '/assets/illustrations/group-sketch-session.jpg'
  }
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
  otherImages: (string | null | undefined)[] = [],
): Hero {
  const base = resolveHero({
    title: activity.title,
    images: [activity.coverMedia?.posterUrl ?? activity.thumbnailUrl, ...otherImages],
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
