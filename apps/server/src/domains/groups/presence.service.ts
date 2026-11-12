import { db } from '@project/db'
import { notFound } from '../../lib/errors'
import { mediaUrl } from '../media/urls'
import { discoverableProgramWhere } from '../programs/access'
import { blockedIds } from '../users/follow.service'
import { toUserSummary } from '../users/mapper'

export const PRESENCE_TTL_MS = 45_000

interface PresenceEntry {
  user: ReturnType<typeof toUserSummary>
  activityTitle: string | null
  joinedAt: number
  lastSeenAt: number
  expiresAt: number
}

const presenceByGroup = new Map<string, Map<string, PresenceEntry>>()

function pruneExpired(now = Date.now()) {
  for (const [groupId, entries] of presenceByGroup.entries()) {
    for (const [userId, entry] of entries.entries()) {
      if (entry.expiresAt <= now) entries.delete(userId)
    }
    if (entries.size === 0) presenceByGroup.delete(groupId)
  }
}

export function clearPresenceForTests() {
  presenceByGroup.clear()
}

export async function heartbeat(
  userId: string,
  groupId: string,
  input?: { activityTitle?: string },
  now = Date.now(),
) {
  pruneExpired(now)

  const member = await db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    include: {
      group: { select: { status: true } },
      user: { include: { profile: true } },
    },
  })
  if (!member || member.status !== 'ACTIVE' || member.group.status !== 'ACTIVE') {
    throw notFound('Group')
  }

  let groupMap = presenceByGroup.get(groupId)
  if (!groupMap) {
    groupMap = new Map<string, PresenceEntry>()
    presenceByGroup.set(groupId, groupMap)
  }

  const existing = groupMap.get(userId)
  const cleanTitle = input?.activityTitle?.trim() || null
  const userSummary = member.user.profile
    ? toUserSummary(member.user.profile)
    : {
        id: member.user.id,
        handle: `user-${member.user.id.slice(0, 8)}`,
        displayName: 'Member',
        avatarUrl: null,
      }

  groupMap.set(userId, {
    user: userSummary,
    activityTitle: cleanTitle ?? existing?.activityTitle ?? null,
    joinedAt: existing?.joinedAt ?? now,
    lastSeenAt: now,
    expiresAt: now + PRESENCE_TTL_MS,
  })

  const entries = [...groupMap.values()].sort((a, b) => a.joinedAt - b.joinedAt)
  return {
    groupId,
    activeCount: entries.length,
    participants: entries.slice(0, 6).map((e) => e.user),
    startedAt: entries.length > 0 ? new Date(entries[0]!.joinedAt).toISOString() : null,
  }
}

export function leave(userId: string, groupId: string) {
  const groupMap = presenceByGroup.get(groupId)
  if (!groupMap) return
  groupMap.delete(userId)
  if (groupMap.size === 0) presenceByGroup.delete(groupId)
}

export async function listLivePublicSessions(
  viewerId: string | null,
  now = Date.now(),
) {
  pruneExpired(now)
  const liveGroupIds = [...presenceByGroup.keys()]
  if (liveGroupIds.length === 0) return []

  const blocked = await blockedIds(viewerId)
  const blockedSet = new Set(blocked)

  const groups = await db.programGroup.findMany({
    where: {
      id: { in: liveGroupIds },
      status: 'ACTIVE',
      visibility: 'PUBLIC',
      joinPolicy: 'OPEN',
      owner: { status: 'ACTIVE', ...(blocked.length ? { id: { notIn: blocked } } : {}) },
      version: { program: discoverableProgramWhere },
    },
    include: {
      version: {
        select: {
          title: true,
          programId: true,
          sessionMinutes: true,
          program: {
            select: {
              id: true,
              title: true,
              categoryId: true,
              sessionMinutes: true,
              coverMediaId: true,
              coverMedia: true,
            },
          },
          items: {
            orderBy: [{ relativeDay: 'asc' }, { position: 'asc' }],
            take: 1,
            include: {
              activity: {
                select: {
                  title: true,
                  durationMinutes: true,
                },
              },
            },
          },
        },
      },
      ...(viewerId
        ? {
            members: {
              where: { userId: viewerId, status: 'ACTIVE' },
              select: { userId: true },
            },
          }
        : {}),
    },
  })

  const sessions = groups.flatMap((g) => {
    const groupMap = presenceByGroup.get(g.id)
    if (!groupMap) return []

    const entries = [...groupMap.entries()]
      .filter(([uid]) => !blockedSet.has(uid))
      .map(([, entry]) => entry)
      .sort((a, b) => a.joinedAt - b.joinedAt)

    if (entries.length === 0) return []

    const firstActivity = g.version.items[0]?.activity ?? null
    const program = g.version.program
    const customActivityTitle = entries.find((e) => e.activityTitle)?.activityTitle ?? null
    const activityTitle = customActivityTitle || firstActivity?.title || program.title

    const media =
      program.coverMedia && program.coverMedia.state === 'READY'
        ? program.coverMedia
        : null

    const thumbnailUrl = media
      ? media.type === 'VIDEO'
        ? mediaUrl(media.id, 'poster')
        : mediaUrl(media.id, 'thumb')
      : null

    const coverMedia = media
      ? {
          id: media.id,
          type: media.type as 'PHOTO' | 'VIDEO',
          thumbnailUrl: mediaUrl(media.id, 'thumb'),
          posterUrl:
            media.type === 'VIDEO'
              ? mediaUrl(media.id, 'poster')
              : mediaUrl(media.id, 'original'),
          playbackUrl: media.type === 'VIDEO' ? mediaUrl(media.id, 'stream') : null,
          durationMs: media.type === 'VIDEO' ? media.durationMs : null,
        }
      : null

    const startedAt = new Date(Math.min(...entries.map((e) => e.joinedAt))).toISOString()
    const lastActiveAt = new Date(Math.max(...entries.map((e) => e.lastSeenAt))).toISOString()

    return [
      {
        groupId: g.id,
        groupName: g.name?.trim() || null,
        programId: program.id,
        programTitle: program.title,
        activityTitle,
        durationMinutes:
          firstActivity?.durationMinutes ??
          g.version.sessionMinutes ??
          program.sessionMinutes ??
          null,
        thumbnailUrl,
        coverMedia,
        categoryId: program.categoryId,
        activeCount: entries.length,
        participants: entries.slice(0, 5).map((e) => e.user),
        startedAt,
        lastActiveAt,
        viewerIsMember: (g.members?.length ?? 0) > 0,
        joinPolicy: g.joinPolicy,
      },
    ]
  })

  sessions.sort((a, b) => {
    if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount
    return b.lastActiveAt.localeCompare(a.lastActiveAt)
  })

  return sessions
}

