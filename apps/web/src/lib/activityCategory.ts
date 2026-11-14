export type ActivityCategory =
  | 'fitness'
  | 'wellness'
  | 'education'
  | 'finance'
  | 'relationships'
  | 'custom'

export type CategoryStyle = {
  slug: ActivityCategory
  label: string
  pillClass: string
  badgeClass: string
  borderClass: string
  textClass: string
  bgClass: string
}

export const CATEGORY_DEFINITIONS: Record<ActivityCategory, { label: string }> = {
  fitness: { label: 'Fitness & Sports' },
  wellness: { label: 'Health & Wellness' },
  education: { label: 'Learning' },
  finance: { label: 'Work & Finance' },
  relationships: { label: 'Social' },
  custom: { label: 'Custom' },
}

/**
 * Domains added by the Catalog Expansion (02-DOMAIN §2) reuse the closest existing visual family
 * (`--cat-*` tokens and icon) instead of new tokens. Unknown slugs fall back to `custom`.
 */
const DOMAIN_VISUAL_FAMILY: Record<string, ActivityCategory> = {
  'arts-creativity': 'custom',
  music: 'custom',
  entertainment: 'custom',
  games: 'relationships',
  'home-community': 'relationships',
  'outdoors-nature': 'wellness',
  'food-cooking': 'wellness',
}

/** The visual family for a stored Domain slug, or null when the slug is unknown. */
export function domainVisualCategory(slug?: string | null): ActivityCategory | null {
  if (!slug) return null
  if (slug in CATEGORY_DEFINITIONS) return slug as ActivityCategory
  return DOMAIN_VISUAL_FAMILY[slug] ?? null
}

const FITNESS_KEYWORDS = [
  'strength', 'workout', 'run', 'cardio', 'mobility', 'stretching', 'squat', 'push-up',
  'pull-up', 'lift', 'hiit', 'upper body', 'lower body', 'full body', 'recovery',
  'trail', 'hike', 'swim', 'cycling', 'exercise', 'training', 'circuit', 'core', 'stability'
]

const WELLNESS_KEYWORDS = [
  'meditation', 'breathwork', 'yoga', 'mindfulness', 'journal', 'sleep', 'relax',
  'reflect', 'nutrition', 'meal prep', 'habit', 'gratitude', 'fasting', 'hydration'
]

const FINANCE_KEYWORDS = [
  'budget', 'finance', 'spending', 'expense', 'invest', 'net worth', 'savings',
  'money', 'bills', 'accounting', 'portfolio', 'tax'
]

const EDUCATION_KEYWORDS = [
  'lesson', 'spanish', 'language', 'read', 'book', 'theory', 'study', 'course',
  'practice', 'listen', 'learn', 'lecture', 'chapter', 'homework', 'exam'
]

const RELATIONSHIPS_KEYWORDS = [
  'team', 'call', 'meeting', 'family', 'partner', 'mentor', 'community',
  'sync', 'check-in', '1:1', 'coffee', 'dinner'
]

export function resolveActivityCategory(
  title: string = '',
  programTitle: string = '',
  explicitCategory?: string | null,
): ActivityCategory {
  const explicit = domainVisualCategory(explicitCategory)
  if (explicit) return explicit

  const text = `${title} ${programTitle}`.toLowerCase()

  if (FINANCE_KEYWORDS.some((kw) => text.includes(kw))) {
    return 'finance'
  }
  if (FITNESS_KEYWORDS.some((kw) => text.includes(kw))) {
    return 'fitness'
  }
  if (WELLNESS_KEYWORDS.some((kw) => text.includes(kw))) {
    return 'wellness'
  }
  if (EDUCATION_KEYWORDS.some((kw) => text.includes(kw))) {
    return 'education'
  }
  if (RELATIONSHIPS_KEYWORDS.some((kw) => text.includes(kw))) {
    return 'relationships'
  }

  return 'custom'
}
