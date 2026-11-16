/**
 * One Activity preview controller (consolidation MR 3): the data, image, text and owner action every
 * Activity preview shows, so Home's inline preview, the Community drawer and the Calendar panel agree.
 * Each surface keeps its own layout. Participation (status, people, Join / Resume / Start / Schedule)
 * stays in the shared resolver and ActivityParticipation; this owns what they did not:
 *
 * - the Activity itself (one query, deduplicated across surfaces by its key);
 * - one image rule (lib/hero), with a surface's own image (a dated entry's thumbnail) as fallback;
 * - the summary, withheld when the entry is locked;
 * - the steps worth listing (never a step that only repeats the summary; none when locked);
 * - Manage for the owner (the Activity page's editor), never for anyone else.
 */
import { useActivity, type components } from '@project/sdk'
import { useCategorySlugOf } from '@/components/shared/EntityHero'
import { activityHero, type Hero } from '@/lib/hero'
import { buildActivityUrl } from '@/lib/urls'

type Instruction = components['schemas']['Instruction']

/** Steps worth listing: with text, and not just the summary again. */
export function distinctSteps(instructions: Instruction[], summary: string | null): Instruction[] {
  const repeated = summary?.trim().toLowerCase() ?? null
  return instructions.filter((step) => {
    const text = [step.title, step.body].filter(Boolean).join(' ').trim()
    if (!text) return false
    return !(repeated && text.toLowerCase() === repeated)
  })
}

/** The preview's image: the Activity's own (cover, else thumbnail), else the surface's, else art. */
export function previewHero(hero: Hero, fallbackImageUrl?: string | null): Hero {
  return hero.src || !fallbackImageUrl ? hero : { ...hero, src: fallbackImageUrl }
}

export function useActivityPreview(
  activityId: string | null | undefined,
  options: {
    /** The entry is locked (access lapsed): no summary, no steps (07 §3). */
    locked?: boolean
    /** The surface's own steps (an occurrence's respect locking); defaults to the Activity's. */
    instructions?: Instruction[] | null
    /** A surface image used only when the Activity has none (a dated entry's thumbnail). */
    fallbackImageUrl?: string | null
    returnTo?: string
  } = {},
) {
  const query = useActivity(options.locked ? '' : (activityId ?? ''))
  const categorySlugOf = useCategorySlugOf()
  const activity = query.data ?? null
  const summary = options.locked ? null : activity?.summary?.trim() || null
  const steps = options.locked ? [] : distinctSteps(options.instructions ?? activity?.instructions ?? [], summary)
  const hero = activity ? previewHero(activityHero(activity, categorySlugOf), options.fallbackImageUrl) : null
  const canManage = Boolean(activity?.canEdit)
  return {
    query,
    activity,
    hero,
    summary,
    steps,
    canManage,
    /** The Activity page, opened in its editor (owner only). */
    manageHref: activity && canManage ? buildActivityUrl(activity, { edit: true, returnTo: options.returnTo }) : null,
    pageHref: activity ? buildActivityUrl(activity, { returnTo: options.returnTo }) : null,
  }
}
