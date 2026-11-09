// Program participation signals for My Programs and Program Detail (01 §B.2 "participants (if
// shared)", 10 §4, 12 §10). Two kinds of data, with different privacy rules:
//
// - Aggregates (participants, active members): coarse counts, suppressed below MIN_PUBLIC_SAMPLE so
//   no individual can be inferred (12 §10). Identical for every viewer, including the creator.
// - Participating friends: only people the viewer can already see participating — fellow active
//   members of a group the viewer belongs to for this Program who share completion with it (10 §4
//   "If shared"). A follow alone never reveals someone's participation (10 §4 "Follower not in group:
//   No"; 12 §2 "Follow never implies enrollment"). Blocks either way hide the person.
//
// Computed live from existing tables; no new aggregation infrastructure (POC scope).
import { db, type ProgramEnrollment } from '@project/db'
import { toUserSummary } from '../users/mapper'
import { MIN_PUBLIC_SAMPLE } from './browse.service'

export const ACTIVE_WINDOW_DAYS = 7
export const FRIEND_AVATAR_LIMIT = 4

const LIVE: ProgramEnrollment['status'][] = ['ACTIVE', 'PAUSED']

export type ProgramParticipation = {
  /** Distinct people with a live (active or paused) run; null below the minimum sample. */
  participantCount: number | null
  /** Participants who finished at least one Activity in the last 7 days; null below the minimum sample. */
  activeMemberCount: number | null
  /** Up to four fellow group members, people the viewer follows first. */
  friends: (ReturnType<typeof toUserSummary> & { viewerFollows: boolean })[]
  /** All fellow group members currently participating (may exceed `friends.length`). */
  friendCount: number
}

const empty = (): ProgramParticipation => ({ participantCount: null, activeMemberCount: null, friends: [], friendCount: 0 })

/** One query per signal for the whole page of Programs, not per Program. */
export async function participationSummaries(viewerId: string | null, programIds: string[], now = new Date()) {
  const out = new Map<string, ProgramParticipation>(programIds.map((id) => [id, empty()]))
  if (!programIds.length) return out
  const since = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 86_400_000)
  const live = { programId: { in: programIds }, status: { in: LIVE }, user: { status: 'ACTIVE' as const } }

  const [participants, active] = await Promise.all([
    db.programEnrollment.groupBy({ by: ['programId', 'userId'], where: live }),
    db.programEnrollment.groupBy({
      by: ['programId', 'userId'],
      where: {
        ...live,
        calendarItems: { some: { status: 'DONE', sessions: { some: { status: 'FINISHED', endedAt: { gte: since } } } } },
      },
    }),
  ])
  const count = (rows: { programId: string }[]) => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.programId, (m.get(r.programId) ?? 0) + 1)
    return m
  }
  const participantCounts = count(participants)
  const activeCounts = count(active)
  for (const id of programIds) {
    const n = participantCounts.get(id) ?? 0
    if (n >= MIN_PUBLIC_SAMPLE) Object.assign(out.get(id)!, { participantCount: n, activeMemberCount: activeCounts.get(id) ?? 0 })
  }

  if (viewerId) {
    for (const [programId, friends] of await groupFriends(viewerId, programIds)) {
      const row = out.get(programId)!
      row.friendCount = friends.length
      row.friends = friends.slice(0, FRIEND_AVATAR_LIMIT)
    }
  }
  return out
}

export async function participationSummary(viewerId: string | null, programId: string, now = new Date()) {
  return (await participationSummaries(viewerId, [programId], now)).get(programId)!
}

/** Fellow active members, with a live run in that group, of the viewer's active groups per Program. */
async function groupFriends(viewerId: string, programIds: string[]) {
  const mine = await db.groupMember.findMany({
    where: { userId: viewerId, status: 'ACTIVE', group: { status: 'ACTIVE', version: { programId: { in: programIds } } } },
    select: { groupId: true, group: { select: { version: { select: { programId: true } } } } },
  })
  const result = new Map<string, ProgramParticipation['friends']>()
  if (!mine.length) return result
  const groupProgram = new Map(mine.map((m) => [m.groupId, m.group.version.programId]))
  const [members, follows, blocks] = await Promise.all([
    db.groupMember.findMany({
      where: {
        groupId: { in: [...groupProgram.keys()] },
        status: 'ACTIVE',
        // Only members who share their participation with the group (10 §4 "If shared").
        sharedCompletionEnabled: true,
        userId: { not: viewerId },
        user: { status: 'ACTIVE' },
      },
      include: { user: { include: { profile: true, enrollments: { where: { status: { in: LIVE } }, select: { groupId: true } } } } },
      orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
    }),
    db.userFollow.findMany({ where: { followerId: viewerId }, select: { followedId: true } }),
    db.userBlock.findMany({ where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] }, select: { blockerId: true, blockedId: true } }),
  ])
  const followed = new Set(follows.map((f) => f.followedId))
  const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]))
  const seen = new Set<string>()
  for (const m of members) {
    const programId = groupProgram.get(m.groupId)!
    const key = `${programId}:${m.userId}`
    if (seen.has(key) || blocked.has(m.userId) || !m.user.profile) continue
    // Participating means a live run linked to this group, not just membership.
    if (!m.user.enrollments.some((e) => e.groupId === m.groupId)) continue
    seen.add(key)
    const list = result.get(programId) ?? []
    list.push({ ...toUserSummary(m.user.profile), viewerFollows: followed.has(m.userId) })
    result.set(programId, list)
  }
  // Stable sort: people the viewer follows first, then by join order.
  for (const list of result.values()) list.sort((a, b) => Number(b.viewerFollows) - Number(a.viewerFollows))
  return result
}
