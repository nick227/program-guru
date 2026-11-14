import { formatProgramLevel } from '@/lib/browse'
import { formatDurationMinutes } from '@/lib/durationMinutes'
import { formatTargetTime } from '@/lib/targetTime'
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
  const levelLabel = program.level !== 'ALL_LEVELS' ? formatProgramLevel(program.level) : null
  const sessionLabel = program.sessionMinutes ? `${program.sessionMinutes} min` : null
  return {
    id: program.id,
    title: program.title,
    meta: [
      program.focus?.label ?? program.type.label,
      levelLabel,
      sessionLabel,
      program.frequencyLabel || null,
      weeks,
    ]
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
  // "Completed" is the generic completion metric's label; on a card it reads as the viewer's status.
  const metrics = activity.metricLabels.filter((label) => {
    const l = label.toLowerCase()
    return !l.startsWith('duration') && l !== 'completed'
  })
  return {
    id: activity.id,
    title: activity.title,
    meta:
      [
        // Suggested place, never a host (08 §2a).
        activity.place ? `${activity.place.name}, ${activity.place.locality}` : null,
        formatDurationMinutes(activity.durationMinutes),
        formatTargetTime(activity.targetTime),
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
