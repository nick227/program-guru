import { formatDurationMinutes } from '@/lib/durationMinutes'
import type { components } from '@project/sdk'
import { activityHero, programHero, type CategorySlugOf } from './hero'
import type { DiscoveryCardModel } from '@/components/shared/SuggestionRail'

type S = components['schemas']

/** API summaries → the one card model used by rails and the browser. */
export function programCard(
  program: S['ProgramSummary'],
  categorySlugOf: CategorySlugOf,
): DiscoveryCardModel {
  const weeks = program.durationDays
    ? `${Math.ceil(program.durationDays / 7)} weeks`
    : null
  return {
    id: program.id,
    title: program.title,
    meta: [program.focus?.label ?? program.type.label, program.frequencyLabel || null, weeks]
      .filter(Boolean)
      .join(' · '),
    hero: programHero(program, categorySlugOf),
    byline: program.creator
      ? `by ${program.creator.displayName}`
      : program.isPlatform
        ? 'by Program Guru'
        : null,
  }
}

export function activityCard(
  activity: S['ActivitySummary'],
  categorySlugOf: CategorySlugOf,
): DiscoveryCardModel {
  const metrics = activity.metricLabels.filter(
    (label) => !label.toLowerCase().startsWith('duration'),
  )
  return {
    id: activity.id,
    title: activity.title,
    meta:
      [
        formatDurationMinutes(activity.durationMinutes),
        activity.instructionCount
          ? `${activity.instructionCount} ${activity.instructionCount === 1 ? 'instruction' : 'instructions'}`
          : null,
        metrics.slice(0, 2).join(' · ') || null,
      ]
        .filter(Boolean)
        .join(' · ') || (activity.summary ?? 'Activity'),
    hero: activityHero(activity, categorySlugOf),
  }
}
