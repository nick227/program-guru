import type { components } from '@project/sdk'
import type { AssistantCard } from './types'

type S = components['schemas']

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

export function mapCreatorToCard(creator: S['UserSummary']): AssistantCard {
  return {
    kind: 'creator',
    id: creator.id,
    title: creator.displayName,
    subtitle: `@${creator.handle} · Creator`,
    thumbnailUrl: creator.avatarUrl,
    previewTarget: { kind: 'creator', handle: creator.handle },
    primaryAction: {
      type: 'preview',
      target: { kind: 'creator', handle: creator.handle },
    },
  }
}
