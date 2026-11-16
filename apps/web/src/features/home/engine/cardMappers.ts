import type { components } from '@project/sdk'
import type { AssistantCard, CardHero } from './types'

type S = components['schemas']

type Covered = { coverMedia?: { posterUrl?: string | null; thumbnailUrl?: string | null } | null }
const coverOf = (e: Covered) => e.coverMedia?.posterUrl ?? e.coverMedia?.thumbnailUrl

export function activityCardHero(a: S['ActivitySummary']): CardHero {
  return { images: [coverOf(a), a.thumbnailUrl], categoryId: a.categoryId }
}

export function programCardHero(p: S['ProgramSummary']): CardHero {
  return { images: [coverOf(p), p.coverUrl], categoryId: p.type?.categoryId ?? null }
}

/**
 * A creator's leading Program among already-loaded discovery lists: the first with a cover, else the
 * first at all. Its cover becomes the creator card's image; nothing is fetched.
 */
export function leadProgramFor(creatorId: string, lists: (S['DiscoverItem'][] | undefined)[]): S['ProgramSummary'] | null {
  let fallback: S['ProgramSummary'] | null = null
  for (const list of lists) {
    if (!list) continue
    for (const item of list) {
      const p = item.program
      if (p?.creator?.id === creatorId) {
        if (coverOf(p) || p.coverUrl) return p
        if (!fallback) fallback = p
      }
    }
  }
  return fallback
}

function formatMinutes(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

export function mapCalendarItemToCard(item: S['CalendarItem']): AssistantCard {
  const parts = [
    item.localTime ? item.localTime : null,
    formatMinutes(item.durationMinutes),
    item.programTitle,
  ].filter(Boolean)

  const subtitle = parts.length > 0 ? parts.join(' · ') : 'Scheduled for today'

  return {
    kind: 'scheduled',
    id: item.id,
    title: item.title,
    subtitle,
    thumbnailUrl: item.thumbnailUrl,
    hero: { images: [item.thumbnailUrl], categoryId: null },
    status: item.status,
    localTime: item.localTime,
    participants:
      item.participantAvatars && item.participantAvatars.length > 0
        ? {
            label: 'Scheduled today',
            count: item.participantAvatars.length,
            users: [],
            avatarUrls: item.participantAvatars,
          }
        : undefined,
    previewTarget: {
      kind: 'scheduled',
      id: item.id,
      title: item.title,
      subtitle,
    },
    primaryAction: { type: 'open_occurrence', itemId: item.id },
  }
}

export function mapActivityToCard(
  activity: S['ActivitySummary'],
  categoryName?: string,
): AssistantCard {
  const parts = [
    formatMinutes(activity.durationMinutes),
    categoryName ?? (activity.creator ? `by @${activity.creator.handle}` : null),
  ].filter(Boolean)

  return {
    kind: 'activity',
    id: activity.id,
    title: activity.title,
    subtitle: parts.length > 0 ? parts.join(' · ') : 'Activity',
    thumbnailUrl: activity.thumbnailUrl,
    hero: activityCardHero(activity),
    participants: activity.creator
      ? {
          label: `Creator`,
          users: [activity.creator],
        }
      : undefined,
    previewTarget: { kind: 'activity', id: activity.id },
    primaryAction: { type: 'open_activity', activityId: activity.id },
  }
}

export function mapProgramToCard(
  program: S['ProgramSummary'],
  participantCount?: number | null,
  featuredGroup?: S['PublicGroupSummary'] | null,
): AssistantCard {
  const parts = [
    program.durationDays ? `${program.durationDays} days` : program.frequencyLabel,
    program.type?.label,
    participantCount && participantCount > 0
      ? `${participantCount} active`
      : null,
  ].filter(Boolean)

  const memberUsers = featuredGroup?.memberAvatars ?? []
  const participants =
    memberUsers.length > 0
      ? {
          label: featuredGroup?.startingSoon
            ? 'Starting soon'
            : 'In group',
          count: featuredGroup?.memberCount,
          users: memberUsers,
        }
      : program.creator
        ? {
            label: 'Creator',
            users: [program.creator],
          }
        : undefined

  return {
    kind: 'program',
    id: program.id,
    title: program.title,
    subtitle: parts.length > 0 ? parts.join(' · ') : 'Program',
    thumbnailUrl: program.coverUrl,
    hero: programCardHero(program),
    participants,
    previewTarget: { kind: 'program', id: program.id },
    primaryAction: {
      type: 'preview',
      target: { kind: 'program', id: program.id },
    },
  }
}

export function mapSessionToCard(item: S['DiscoverItem']): AssistantCard | null {
  const group = item.featuredGroup
  if (group) {
    const parts = [
      `${group.memberCount} ${group.memberCount === 1 ? 'person' : 'people'}`,
      group.startingSoon ? 'Starting soon' : 'Public session',
    ]
    const title = group.name ?? group.programTitle
    const subtitle = parts.join(' · ')
    return {
      kind: 'session',
      id: group.id,
      title,
      subtitle,
      thumbnailUrl: item.program?.coverUrl ?? null,
      hero: item.program ? programCardHero(item.program) : undefined,
      participants:
        group.memberAvatars && group.memberAvatars.length > 0
          ? {
              label: group.startingSoon ? 'Starting soon' : 'Members',
              count: group.memberCount,
              users: group.memberAvatars,
            }
          : undefined,
      previewTarget: { kind: 'group', id: group.id },
      primaryAction: { type: 'open_group', groupId: group.id },
    }
  }
  if (item.program) {
    return mapProgramToCard(
      item.program,
      item.participantCount,
      item.featuredGroup,
    )
  }
  return null
}

export function mapCreatorToCard(creator: S['UserSummary'], leadProgram?: S['ProgramSummary'] | null): AssistantCard {
  return {
    kind: 'creator',
    id: creator.id,
    title: creator.displayName,
    subtitle: `@${creator.handle} · Creator`,
    thumbnailUrl: creator.avatarUrl,
    hero: {
      ...(leadProgram ? programCardHero(leadProgram) : { images: [], categoryId: null }),
      avatarUrl: creator.avatarUrl,
    },
    previewTarget: { kind: 'creator', handle: creator.handle },
    primaryAction: {
      type: 'preview',
      target: { kind: 'creator', handle: creator.handle },
    },
  }
}

/** An Opportunity Radar recommendation (12 §5b): one primary action, Join, reusing the viewer's item. */
export function mapOpportunityToCard(o: S['Opportunity'], when: string): AssistantCard {
  const g = o.gathering
  return {
    kind: 'session',
    id: g.id,
    title: g.activity.title,
    subtitle: [when, g.place ? `${g.place.name}, ${g.place.locality}` : null].filter(Boolean).join(' · '),
    thumbnailUrl: g.activity.thumbnailUrl,
    hero: activityCardHero(g.activity),
    participants: g.members.length
      ? { label: 'Going', count: g.memberCount, users: g.members }
      : undefined,
    previewTarget: { kind: 'activity', id: g.activity.id },
    primaryAction: { type: 'join_gathering', gatheringId: g.id, calendarItemId: o.calendarItemId },
  }
}

/** Truthful reason first (12 §5c), then the card's own details. */
export function withReason(card: AssistantCard, reason: { label: string } | null | undefined): AssistantCard {
  return reason ? { ...card, subtitle: [reason.label, card.subtitle].filter(Boolean).join(' · ') } : card
}

/** "From Maya, who you follow": for Programs that came from the Following scope. */
export function followedReason(item: S['DiscoverItem']): { label: string } | null {
  const name = item.program?.creator?.displayName
  return name ? { label: `From ${name}, who you follow` } : null
}
