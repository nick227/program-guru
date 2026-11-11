// Program Groups (10-COLLABORATION.md). Members keep independent calendars and private results;
// the group overlays consented completion, reactions, and explicitly shared media.
import { db, type Prisma, type ProgramGroup } from '@project/db'
import { newToken, sha256 } from '../../lib/auth'
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { withIdempotency } from '../../lib/idempotency'
import { enqueue } from '../../lib/outbox'
import { afterCursor, offsetArgs, pageArgs, pageOrder, toOffsetPage, toPage, type PageQuery } from '../../lib/paging'
import { addDays, fromDbDate, isValidTimeZone, toDbDate, todayIn } from '../../lib/time'
import { occurrenceKey, sameDayOrdinals } from '../calendar/materialize'
import { blockedIds, isBlockedEitherWay } from '../users/follow.service'
import { normalizeEmail } from '../users/auth.service'
import { toUserSummary } from '../users/mapper'
import { canUseActivity } from '../activities/access'
import { canSeeProgram, discoverableProgramWhere, hasActiveGrant, isProgramOwner } from '../programs/access'
import { preview as programPreview } from '../programs/browse.service'
import { thumbFor } from '../media/media.service'
import { enrollInTx, joinableVersion } from '../programs/enrollment.service'

const INVITE_TTL_MS = 14 * 24 * 3600_000
export const STARTING_SOON_DAYS = 14
export const REACTIONS = ['👏', '🔥', '💪', '❤️', '🎉', '👍'] // a small fixed set (10 §2)

const appBase = () => (process.env.PUBLIC_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')

async function activeMember(userId: string, groupId: string) {
  const m = await db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } }, include: { group: true } })
  if (!m || m.status !== 'ACTIVE') throw notFound('Group')
  return m
}

async function ownedGroup(userId: string, groupId: string) {
  const m = await activeMember(userId, groupId)
  if (m.role !== 'OWNER') throw forbidden('Only the group owner can do that')
  return m.group
}

async function toSummary(
  g: ProgramGroup & { version: { title: string; programId: string } },
  userId: string,
  agg?: GroupAggregates,
) {
  const [memberCount, me, fallbackAgg] = await Promise.all([
    db.groupMember.count({ where: { groupId: g.id, status: 'ACTIVE' } }),
    db.groupMember.findUnique({ where: { groupId_userId: { groupId: g.id, userId } } }),
    agg ? Promise.resolve(agg) : loadGroupAggregates(userId, [g.id]),
  ])
  return {
    id: g.id,
    programId: g.version.programId,
    programVersionId: g.programVersionId,
    programTitle: g.version.title,
    name: g.name,
    mode: g.mode,
    visibility: g.visibility,
    joinPolicy: g.joinPolicy,
    startLocalDate: g.startLocalDate ? fromDbDate(g.startLocalDate) : null,
    timezone: g.timezone,
    memberCount,
    myRole: me?.role ?? 'MEMBER',
    memberAvatars: fallbackAgg.avatars.get(g.id) ?? [],
    recentCheckInCount: fallbackAgg.checkInCounts.get(g.id) ?? 0,
    latestCheckIn: fallbackAgg.latestCheckIn.get(g.id) ?? null,
  }
}

export function isStartingSoonGroup(g: Pick<ProgramGroup, 'mode' | 'startLocalDate' | 'timezone'>, now = new Date()): boolean {
  if (g.mode !== 'SYNC' || !g.startLocalDate) return false
  const tz = g.timezone && isValidTimeZone(g.timezone) ? g.timezone : 'UTC'
  const today = todayIn(tz, now)
  const start = fromDbDate(g.startLocalDate)
  return start >= today && start <= addDays(today, STARTING_SOON_DAYS)
}

const VALID_STAGE_THEMES = ['constellation', 'campfire', 'sprout'] as const

type RecentCheckInDto = {
  id: string
  user: ReturnType<typeof toUserSummary>
  activityTitle: string
  completedAt: string
}

type GroupAggregates = {
  avatars: Map<string, ReturnType<typeof toUserSummary>[]>
  checkInCounts: Map<string, number>
  latestCheckIn: Map<string, RecentCheckInDto | null>
}

async function recentCheckInCounts(groupIds: string[], now = new Date()): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (!groupIds.length) return counts
  const cutoff = new Date(now.getTime() - 7 * 86_400_000)
  const grouped = await db.completionShare.groupBy({
    by: ['groupId'],
    where: { groupId: { in: groupIds }, revokedAt: null, completedAt: { gte: cutoff } },
    _count: { _all: true },
  })
  for (const row of grouped) counts.set(row.groupId, row._count._all)
  return counts
}

async function loadGroupAggregates(
  viewerId: string | null,
  groupIds: string[],
  now = new Date(),
  memberGroupIds = groupIds,
): Promise<GroupAggregates> {
  const avatars = new Map<string, ReturnType<typeof toUserSummary>[]>()
  const latestCheckIn = new Map<string, RecentCheckInDto | null>()
  if (!groupIds.length) {
    return { avatars, checkInCounts: new Map(), latestCheckIn }
  }
  const blocked = memberGroupIds.length ? await blockedIds(viewerId) : []
  const [members, checkInCounts, recentShares] = await Promise.all([
    memberGroupIds.length
      ? db.groupMember.findMany({
          where: {
            groupId: { in: memberGroupIds },
            status: 'ACTIVE',
            user: { status: 'ACTIVE', ...(blocked.length ? { id: { notIn: blocked } } : {}) },
          },
          orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }, { createdAt: 'asc' }],
          include: { user: { include: { profile: true } } },
        })
      : Promise.resolve([]),
    recentCheckInCounts(groupIds, now),
    memberGroupIds.length
      ? db.completionShare.findMany({
          where: {
            groupId: { in: memberGroupIds },
            revokedAt: null,
            ...(blocked.length ? { userId: { notIn: blocked } } : {}),
            user: { status: 'ACTIVE' },
          },
          orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
          distinct: ['groupId'],
          include: { user: { include: { profile: true } }, activity: { select: { title: true } } },
        })
      : Promise.resolve([]),
  ])

  for (const m of members) {
    if (!m.user.profile) continue
    const list = avatars.get(m.groupId) ?? []
    if (list.length < 4) {
      list.push(toUserSummary(m.user.profile))
      avatars.set(m.groupId, list)
    }
  }
  for (const share of recentShares) {
    if (!share.user.profile) continue
    latestCheckIn.set(share.groupId, {
      id: share.id,
      user: toUserSummary(share.user.profile),
      activityTitle: share.activity.title,
      completedAt: share.completedAt.toISOString(),
    })
  }
  return { avatars, checkInCounts, latestCheckIn }
}

function toPublicGroupSummary(
  g: ProgramGroup & { version: { title: string; programId: string }; _count: { members: number }; members?: { userId: string }[] },
  now = new Date(),
  agg?: GroupAggregates,
) {
  const viewerIsMember = (g.members?.length ?? 0) > 0
  return {
    id: g.id,
    programId: g.version.programId,
    programVersionId: g.programVersionId,
    programTitle: g.version.title,
    name: g.name,
    mode: g.mode,
    visibility: g.visibility,
    joinPolicy: g.joinPolicy,
    memberCount: g._count.members,
    startLocalDate: g.startLocalDate ? fromDbDate(g.startLocalDate) : null,
    timezone: g.timezone,
    startingSoon: isStartingSoonGroup(g, now),
    viewerIsMember,
    memberAvatars: viewerIsMember ? (agg?.avatars.get(g.id) ?? []) : [],
    recentCheckInCount: agg?.checkInCounts.get(g.id) ?? 0,
    latestCheckIn: viewerIsMember ? (agg?.latestCheckIn.get(g.id) ?? null) : null,
  }
}

function comparePublicGroups(
  a: ReturnType<typeof toPublicGroupSummary> & { createdAt: Date },
  b: ReturnType<typeof toPublicGroupSummary> & { createdAt: Date },
  preferMember = false,
) {
  if (preferMember && a.viewerIsMember !== b.viewerIsMember) return a.viewerIsMember ? -1 : 1
  if (a.joinPolicy !== b.joinPolicy) return a.joinPolicy === 'OPEN' ? -1 : 1
  if (a.startingSoon !== b.startingSoon) return a.startingSoon ? -1 : 1
  if (a.startingSoon && b.startingSoon && a.startLocalDate && b.startLocalDate && a.startLocalDate !== b.startLocalDate) {
    return a.startLocalDate.localeCompare(b.startLocalDate)
  }
  if (a.memberCount !== b.memberCount) return b.memberCount - a.memberCount
  const timeDiff = b.createdAt.getTime() - a.createdAt.getTime()
  return timeDiff !== 0 ? timeDiff : b.id.localeCompare(a.id)
}

export async function startingSoonProgramIds(viewerId: string | null, now = new Date()) {
  const blocked = await blockedIds(viewerId)
  const minDate = toDbDate(addDays(fromDbDate(now), -1))
  const maxDate = toDbDate(addDays(fromDbDate(now), STARTING_SOON_DAYS + 1))
  const groups = await db.programGroup.findMany({
    where: {
      status: 'ACTIVE',
      visibility: 'PUBLIC',
      mode: 'SYNC',
      startLocalDate: { gte: minDate, lte: maxDate },
      owner: { status: 'ACTIVE', ...(blocked.length ? { id: { notIn: blocked } } : {}) },
      version: { program: discoverableProgramWhere },
    },
    select: { mode: true, startLocalDate: true, timezone: true, version: { select: { programId: true } } },
  })
  const ids = new Set<string>()
  for (const g of groups) if (isStartingSoonGroup(g, now)) ids.add(g.version.programId)
  return [...ids]
}

/** Batch-load up to one relevant discoverable public Group per Program for discovery feeds. */
export async function featuredGroupsForPrograms(
  viewerId: string | null,
  programIds: string[],
  timing?: 'ALL' | 'STARTING_SOON' | 'HAPPENING_NOW',
  now = new Date(),
) {
  const out = new Map<string, ReturnType<typeof toPublicGroupSummary>>()
  if (!programIds.length || timing === 'HAPPENING_NOW') return out
  const blocked = await blockedIds(viewerId)
  const rows = await db.programGroup.findMany({
    where: {
      status: 'ACTIVE',
      visibility: 'PUBLIC',
      owner: { status: 'ACTIVE', ...(blocked.length ? { id: { notIn: blocked } } : {}) },
      version: { programId: { in: programIds }, program: discoverableProgramWhere },
    },
    include: {
      version: { select: { title: true, programId: true } },
      _count: { select: { members: { where: { status: 'ACTIVE' } } } },
      ...(viewerId ? { members: { where: { userId: viewerId, status: 'ACTIVE' }, select: { userId: true } } } : {}),
    },
  })
  const agg = await loadGroupAggregates(
    viewerId,
    rows.map((r) => r.id),
    now,
    rows.filter((r) => (r.members?.length ?? 0) > 0).map((r) => r.id),
  )
  const grouped = new Map<string, (ReturnType<typeof toPublicGroupSummary> & { createdAt: Date })[]>()
  for (const r of rows) {
    if (timing === 'STARTING_SOON' && !isStartingSoonGroup(r, now)) continue
    const summary = { ...toPublicGroupSummary(r, now, agg), createdAt: r.createdAt }
    const list = grouped.get(summary.programId) ?? []
    list.push(summary)
    grouped.set(summary.programId, list)
  }
  for (const [programId, list] of grouped) {
    list.sort((a, b) => comparePublicGroups(a, b, true))
    const { createdAt: _c, ...best } = list[0]!
    out.set(programId, best)
  }
  return out
}

export async function listByProgram(
  viewerId: string | null,
  programId: string,
  query: PageQuery & { timing?: 'ALL' | 'STARTING_SOON' | 'HAPPENING_NOW' },
  now = new Date(),
) {
  const program = await db.program.findUnique({ where: { id: programId } })
  if (!program || !(await canSeeProgram(viewerId, program))) throw notFound('Program')
  const { limit, skip } = offsetArgs(query)
  const emptyPage = () => toOffsetPage([] as ReturnType<typeof toPublicGroupSummary>[], limit, skip, (g) => g)
  if (
    program.status !== 'PUBLISHED' ||
    program.visibility !== 'PUBLIC' ||
    program.moderatedAt ||
    program.deletedAt ||
    !program.latestPublishedVersionId ||
    query.timing === 'HAPPENING_NOW'
  ) {
    return emptyPage()
  }
  const blocked = await blockedIds(viewerId)
  const rows = await db.programGroup.findMany({
    where: {
      status: 'ACTIVE',
      visibility: 'PUBLIC',
      owner: { status: 'ACTIVE', ...(blocked.length ? { id: { notIn: blocked } } : {}) },
      version: { programId },
    },
    include: {
      version: { select: { title: true, programId: true } },
      _count: { select: { members: { where: { status: 'ACTIVE' } } } },
      ...(viewerId ? { members: { where: { userId: viewerId, status: 'ACTIVE' }, select: { userId: true } } } : {}),
    },
  })
  const agg = await loadGroupAggregates(
    viewerId,
    rows.map((r) => r.id),
    now,
    rows.filter((r) => (r.members?.length ?? 0) > 0).map((r) => r.id),
  )
  const items = rows
    .filter((r) => query.timing !== 'STARTING_SOON' || isStartingSoonGroup(r, now))
    .map((r) => ({ ...toPublicGroupSummary(r, now, agg), createdAt: r.createdAt }))
    .sort((a, b) => comparePublicGroups(a, b, false))
  const window = items.slice(skip, skip + limit + 1)
  return toOffsetPage(window, limit, skip, ({ createdAt: _c, ...g }) => g)
}

export async function listByActivity(
  viewerId: string | null,
  activityId: string,
  query: PageQuery & { programId?: string },
  now = new Date(),
) {
  const activity = await db.activity.findUnique({ where: { id: activityId } })
  if (!activity || activity.moderatedAt) throw notFound('Activity')
  let canRead = canUseActivity(activity, viewerId)
  if (!canRead && viewerId) {
    const enrolled = await db.programScheduleItem.findFirst({
      where: {
        activityId,
        version: {
          program: {
            deletedAt: null,
            moderatedAt: null,
            OR: [
              { creatorId: viewerId },
              { enrollments: { some: { userId: viewerId, status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED'] } } } },
              { accessGrants: { some: { userId: viewerId, revokedAt: null } } },
            ],
          },
        },
      },
      select: { id: true },
    })
    canRead = !!enrolled
  }
  if (!canRead) throw notFound('Activity')

  const { limit, skip } = offsetArgs(query)
  const blocked = await blockedIds(viewerId)
  const rows = await db.programGroup.findMany({
    where: {
      status: 'ACTIVE',
      version: {
        ...(query.programId ? { programId: query.programId } : {}),
        items: { some: { activityId } },
      },
      OR: [
        ...(viewerId ? [{ members: { some: { userId: viewerId, status: 'ACTIVE' as const } } }] : []),
        {
          visibility: 'PUBLIC',
          owner: { status: 'ACTIVE', ...(blocked.length ? { id: { notIn: blocked } } : {}) },
          version: { program: discoverableProgramWhere },
        },
      ],
    },
    include: {
      version: { select: { title: true, programId: true } },
      _count: { select: { members: { where: { status: 'ACTIVE' } } } },
      ...(viewerId ? { members: { where: { userId: viewerId, status: 'ACTIVE' }, select: { userId: true } } } : {}),
    },
  })
  const agg = await loadGroupAggregates(
    viewerId,
    rows.map((r) => r.id),
    now,
    rows.filter((r) => (r.members?.length ?? 0) > 0).map((r) => r.id),
  )
  const items = rows
    .map((r) => ({ ...toPublicGroupSummary(r, now, agg), createdAt: r.createdAt }))
    .sort((a, b) => comparePublicGroups(a, b, true))
  const window = items.slice(skip, skip + limit + 1)
  return toOffsetPage(window, limit, skip, ({ createdAt: _c, ...g }) => g)
}

async function toDetail(groupId: string, userId: string) {
  const g = await db.programGroup.findUniqueOrThrow({ where: { id: groupId }, include: { version: true } })
  const [members, mine, checkInMap] = await Promise.all([
    db.groupMember.findMany({ where: { groupId, status: 'ACTIVE' }, include: { user: { include: { profile: true } } }, orderBy: { createdAt: 'asc' } }),
    db.programEnrollment.findFirst({ where: { userId, groupId, status: { in: ['ACTIVE', 'PAUSED'] } }, orderBy: { createdAt: 'desc' } }),
    recentCheckInCounts([groupId]),
  ])
  const me = members.find((m) => m.userId === userId)
  const shared = g.mode === 'SYNC' && g.startLocalDate ? fromDbDate(g.startLocalDate) : null
  const stageTheme = VALID_STAGE_THEMES.includes(g.stageTheme as (typeof VALID_STAGE_THEMES)[number])
    ? (g.stageTheme as (typeof VALID_STAGE_THEMES)[number])
    : 'constellation'
  return {
    ...(await toSummary(g, userId)),
    startLocalDate: g.startLocalDate ? fromDbDate(g.startLocalDate) : null,
    timezone: g.timezone,
    joinLinkEnabled: g.joinLinkEnabled,
    memberLinkSharingEnabled: g.memberLinkSharingEnabled,
    members: members.map((m) => ({ user: toUserSummary(m.user.profile!), role: m.role, status: m.status, sharedCompletion: m.sharedCompletionEnabled })),
    mySharedCompletion: me?.sharedCompletionEnabled ?? true,
    myEnrollment: mine
      ? { enrollmentId: mine.id, startLocalDate: fromDbDate(mine.startLocalDate), startDateDiffers: !!shared && shared !== fromDbDate(mine.startLocalDate) }
      : null,
    stageTheme,
    recentCheckInCount: checkInMap.get(groupId) ?? 0,
  }
}

/**
 * Links a member's live enrollment for this Program, whichever version it follows, to the group and
 * stamps the version-independent group occurrence key on its items. The calendar itself (dates,
 * statuses, results) is never changed.
 */
async function linkEnrollment(tx: Prisma.TransactionClient, userId: string, group: ProgramGroup & { version: { programId: string } }) {
  const e = await tx.programEnrollment.findFirst({ where: { userId, programId: group.version.programId, status: { in: ['ACTIVE', 'PAUSED'] } } , orderBy: { createdAt: 'desc' } })
  if (!e) return
  await tx.programEnrollment.update({ where: { id: e.id }, data: { groupId: group.id } })
  const items = await tx.calendarItem.findMany({
    where: { enrollmentId: e.id, sourceScheduleItemId: { not: null }, programDayIndex: { not: null } },
    select: { id: true, activityId: true, programDayIndex: true, sourceScheduleItemId: true, scheduleItem: { select: { programVersionId: true } } },
  })
  // Kept items may come from an earlier version than the enrollment's: rank within each one's own version.
  const versionIds = [...new Set(items.map((i) => i.scheduleItem!.programVersionId))]
  const placements = await tx.programScheduleItem.findMany({ where: { programVersionId: { in: versionIds } }, select: { id: true, programVersionId: true, activityId: true, relativeDay: true, position: true } })
  const ordinals = new Map<string, number>()
  for (const v of versionIds) for (const [id, n] of sameDayOrdinals(placements.filter((p) => p.programVersionId === v))) ordinals.set(id, n)
  await Promise.all(
    items.map((i) =>
      tx.calendarItem.update({
        where: { id: i.id },
        data: { groupOccurrenceKey: occurrenceKey(group.version.programId, i.activityId, i.programDayIndex!, ordinals.get(i.sourceScheduleItemId!) ?? 0) },
      }),
    ),
  )
}

async function unlinkEnrollment(tx: Prisma.TransactionClient, userId: string, groupId: string) {
  const enrollments = await tx.programEnrollment.findMany({ where: { userId, groupId } })
  for (const e of enrollments) {
    await tx.programEnrollment.update({ where: { id: e.id }, data: { groupId: null } })
    await tx.calendarItem.updateMany({ where: { enrollmentId: e.id }, data: { groupOccurrenceKey: null } })
  }
}

/**
 * Leaving or removal (10 §3): group access ends with the status change; the enrollment is unlinked,
 * the member's completion shares and pending invitations they created are revoked. Calendar items,
 * sessions, results and media stay exactly as they are.
 */
async function depart(tx: Prisma.TransactionClient, groupId: string, userId: string, status: 'LEFT' | 'REMOVED') {
  await tx.groupMember.update({ where: { groupId_userId: { groupId, userId } }, data: { status, role: 'MEMBER' } })
  await unlinkEnrollment(tx, userId, groupId)
  await tx.completionShare.updateMany({ where: { groupId, userId, revokedAt: null }, data: { revokedAt: new Date() } })
  await tx.groupInvitation.updateMany({ where: { groupId, createdById: userId, status: 'PENDING' }, data: { status: 'REVOKED' } })
  if (status === 'REMOVED') {
    // Invitations already addressed to them would otherwise undo the removal.
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    await tx.groupInvitation.updateMany({
      where: { groupId, status: 'PENDING', OR: [{ invitedUserId: userId }, { invitedEmailHash: sha256(normalizeEmail(user.email)) }] },
      data: { status: 'REVOKED' },
    })
  }
}

export async function listMine(userId: string, query: PageQuery) {
  const { limit, take } = pageArgs(query)
  const rows = await db.programGroup.findMany({
    where: { status: 'ACTIVE', members: { some: { userId, status: 'ACTIVE' } }, ...afterCursor(query.cursor) },
    orderBy: pageOrder,
    take,
    include: { version: true },
  })
  const page = toPage(rows, limit, (g) => g)
  const agg = await loadGroupAggregates(userId, page.data.map((g) => g.id))
  return { data: await Promise.all(page.data.map((g) => toSummary(g, userId, agg))), meta: page.meta }
}

export async function create(
  userId: string,
  input: {
    programVersionId: string
    name?: string | null
    mode: 'SYNC' | 'ASYNC'
    visibility?: 'PRIVATE' | 'PUBLIC'
    joinPolicy?: 'INVITE_ONLY' | 'OPEN'
    startLocalDate?: string | null
    timezone?: string
  },
) {
  const version = await db.programVersion.findUnique({ where: { id: input.programVersionId }, include: { program: true } })
  if (!version?.publishedAt || !(await canSeeProgram(userId, version.program))) throw notFound('Program')
  const visibility = input.visibility ?? 'PRIVATE'
  const joinPolicy = input.joinPolicy ?? (visibility === 'PUBLIC' ? 'OPEN' : 'INVITE_ONLY')
  if (visibility === 'PRIVATE' && joinPolicy === 'OPEN') {
    throw badRequest('Private groups must be invite-only', { joinPolicy: 'cannot be OPEN for a PRIVATE group' })
  }
  if (visibility === 'PUBLIC' && (version.program.visibility !== 'PUBLIC' || version.program.status !== 'PUBLISHED' || version.program.moderatedAt || version.program.deletedAt)) {
    throw badRequest('Public groups are only allowed on public published programs', { visibility: 'requires a public published program' })
  }
  const enrolled = await db.programEnrollment.findFirst({ where: { userId, programId: version.programId, status: { in: ['ACTIVE', 'PAUSED'] } } , orderBy: { createdAt: 'desc' } })
  // 10 §3: created by an enrolled participant or the Program owner.
  if (!enrolled && !isProgramOwner(version.program, userId)) throw forbidden('Join this program before starting a group')
  if (enrolled?.groupId) throw conflict('You are already following this program with a group')
  // SYNC groups share one start date; default it from the creator's own enrollment.
  const start = input.mode === 'SYNC' ? input.startLocalDate ?? (enrolled ? fromDbDate(enrolled.startLocalDate) : null) : null
  if (input.mode === 'SYNC' && !start) throw badRequest('Choose the shared start date', { startLocalDate: 'is required for SYNC' })
  const tz = input.timezone ?? enrolled?.timezone ?? (await db.userPreference.findUnique({ where: { userId } }))?.timezone ?? 'UTC'
  const g = await db.$transaction(async (tx) => {
    const group = await tx.programGroup.create({
      data: {
        programVersionId: version.id,
        ownerId: userId,
        name: input.name?.trim() || null,
        mode: input.mode,
        visibility,
        joinPolicy,
        startLocalDate: start ? toDbDate(start) : null,
        timezone: tz,
        members: { create: { userId, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() } },
      },
    })
    await linkEnrollment(tx, userId, { ...group, version: { programId: version.programId } })
    return group
  })
  return toDetail(g.id, userId)
}

export async function get(userId: string, groupId: string) {
  await activeMember(userId, groupId)
  return toDetail(groupId, userId)
}

export async function update(
  userId: string,
  groupId: string,
  input: {
    name?: string | null
    visibility?: 'PRIVATE' | 'PUBLIC'
    joinPolicy?: 'INVITE_ONLY' | 'OPEN'
    joinLinkEnabled?: boolean
    memberLinkSharingEnabled?: boolean
    closed?: boolean
    stageTheme?: 'constellation' | 'campfire' | 'sprout'
  },
) {
  const current = await ownedGroup(userId, groupId)
  const nextVisibility = input.visibility ?? current.visibility
  const nextJoinPolicy =
    input.visibility === 'PRIVATE' && input.joinPolicy === undefined
      ? 'INVITE_ONLY'
      : (input.joinPolicy ?? current.joinPolicy)
  if (nextVisibility === 'PRIVATE' && nextJoinPolicy === 'OPEN') {
    throw badRequest('Private groups must be invite-only', { joinPolicy: 'cannot be OPEN for a PRIVATE group' })
  }
  if (nextVisibility === 'PUBLIC') {
    const withProgram = await db.programGroup.findUniqueOrThrow({
      where: { id: groupId },
      include: { version: { include: { program: true } } },
    })
    const program = withProgram.version.program
    if (program.visibility !== 'PUBLIC' || program.status !== 'PUBLISHED' || program.moderatedAt || program.deletedAt) {
      throw badRequest('Public groups are only allowed on public published programs', { visibility: 'requires a public published program' })
    }
  }
  await db.$transaction(async (tx) => {
    await tx.programGroup.update({
      where: { id: groupId },
      data: {
        name: input.name === undefined ? undefined : input.name?.trim() || null,
        visibility: input.visibility,
        joinPolicy: input.visibility !== undefined || input.joinPolicy !== undefined ? nextJoinPolicy : undefined,
        joinLinkEnabled: input.joinLinkEnabled,
        memberLinkSharingEnabled: input.memberLinkSharingEnabled,
        stageTheme: input.stageTheme,
        status: input.closed ? 'CLOSED' : undefined,
      },
    })
    if (input.memberLinkSharingEnabled === false) await tx.groupInvitation.updateMany({ where: { groupId, kind: 'LINK', createdById: { not: userId }, status: 'PENDING' }, data: { status: 'REVOKED' } })
    if (input.joinLinkEnabled === false) await tx.groupInvitation.updateMany({ where: { groupId, kind: 'LINK', status: 'PENDING' }, data: { status: 'REVOKED' } })
  })
  return toDetail(groupId, userId)
}

export async function updateMyMembership(userId: string, groupId: string, input: { sharedCompletion?: boolean; leave?: boolean }) {
  const m = await activeMember(userId, groupId)
  await db.$transaction(async (tx) => {
    if (input.sharedCompletion !== undefined) {
      await tx.groupMember.update({ where: { groupId_userId: { groupId, userId } }, data: { sharedCompletionEnabled: input.sharedCompletion } })
      // Turning sharing off hides past shares; it never touches the personal log (10 §3).
      if (!input.sharedCompletion) await tx.completionShare.updateMany({ where: { groupId, userId, revokedAt: null }, data: { revokedAt: new Date() } })
    }
    if (input.leave) {
      if (m.role === 'OWNER') {
        const next = await tx.groupMember.findFirst({ where: { groupId, status: 'ACTIVE', userId: { not: userId } }, orderBy: { createdAt: 'asc' } })
        if (next) await tx.groupMember.update({ where: { groupId_userId: { groupId, userId: next.userId } }, data: { role: 'OWNER' } })
        else await tx.programGroup.update({ where: { id: groupId }, data: { status: 'CLOSED' } })
        if (next) await tx.programGroup.update({ where: { id: groupId }, data: { ownerId: next.userId } })
      }
      await depart(tx, groupId, userId, 'LEFT')
    }
  })
  return input.leave ? { ...(await toDetail(groupId, userId)), myRole: 'MEMBER' as const } : toDetail(groupId, userId)
}

export async function removeMember(userId: string, groupId: string, memberId: string) {
  await ownedGroup(userId, groupId)
  if (memberId === userId) throw badRequest('Leave the group instead')
  const target = await db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: memberId } } })
  if (!target || target.status !== 'ACTIVE') throw notFound('Member')
  await db.$transaction(async (tx) => {
    await depart(tx, groupId, memberId, 'REMOVED')
  })
}

// ── Invitations: handle, email, or link (decision 13) ───────────────────────

const toInvitation = (i: Prisma.GroupInvitationGetPayload<{ include: { invitedUser: { include: { profile: true } } } }>, token?: string) => ({
  id: i.id,
  kind: i.kind,
  status: i.status === 'PENDING' && i.expiresAt < new Date() ? 'EXPIRED' : i.status,
  expiresAt: i.expiresAt.toISOString(),
  joinUrl: token ? `${appBase()}/join/${token}` : null,
  invitedUser: i.invitedUser?.profile ? toUserSummary(i.invitedUser.profile) : null,
})

const pendingNow = () => ({ status: 'PENDING' as const, expiresAt: { gt: new Date() } })

export async function listInvitations(userId: string, groupId: string) {
  await activeMember(userId, groupId)
  const rows = await db.groupInvitation.findMany({ where: { groupId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, include: { invitedUser: { include: { profile: true } } } })
  return rows.map((r) => toInvitation(r))
}

export async function invite(userId: string, groupId: string, input: { kind: 'USER' | 'EMAIL' | 'LINK'; handle?: string; email?: string; rotate?: boolean }) {
  const m = await activeMember(userId, groupId)
  if (m.group.status !== 'ACTIVE') throw badRequest('This group is closed')
  const group = await db.programGroup.findUniqueOrThrow({ where: { id: groupId }, include: invitationInclude.group.include })
  if (!openForJoins(group)) throw badRequest('This program is not open for new participants')
  if (input.rotate && input.kind !== 'LINK') throw badRequest('Only link invitations can be rotated')
  const token = newToken()
  const base = { groupId, kind: input.kind, createdById: userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) }
  const row = await db.$transaction(async (tx) => {
    // Serialize link issuance with owner permission changes and rotation.
    if (input.kind === 'LINK') {
      const current = await tx.programGroup.update({ where: { id: groupId }, data: { updatedAt: new Date() } })
      const member = await tx.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } })
      if (!member || member.status !== 'ACTIVE' || current.status !== 'ACTIVE') throw notFound('Group')
      if (member.role !== 'OWNER' && (input.rotate || !current.joinLinkEnabled || !current.memberLinkSharingEnabled)) {
        throw forbidden('The group owner must allow member link sharing')
      }
      if (input.rotate) await tx.groupInvitation.updateMany({ where: { groupId, kind: 'LINK', status: 'PENDING' }, data: { status: 'REVOKED' } })
    }
    if (input.kind === 'USER') {
      if (!input.handle) throw badRequest('Enter a handle', { handle: 'is required' })
      const p = await tx.userProfile.findUnique({ where: { handle: input.handle.toLowerCase() }, include: { user: true } })
      if (!p || p.user.status !== 'ACTIVE' || (await isBlockedEitherWay(userId, p.userId))) throw notFound('User')
      const existing = await tx.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: p.userId } } })
      if (existing?.status === 'ACTIVE') throw conflict('They are already in this group')
      // A removal is the owner's decision: only the owner can invite a removed member back.
      if (existing?.status === 'REMOVED' && m.role !== 'OWNER') throw forbidden('Only the group owner can invite them back')
      if (await tx.groupInvitation.findFirst({ where: { groupId, invitedUserId: p.userId, ...pendingNow() } })) throw conflict('They already have a pending invitation')
      const inv = await tx.groupInvitation.create({ data: { ...base, invitedUserId: p.userId }, include: { invitedUser: { include: { profile: true } } } })
      await enqueue(tx, 'GroupInvitationCreated', { invitationId: inv.id, groupId, invitedUserId: p.userId, inviterId: userId })
      return inv
    }
    if (input.kind === 'EMAIL') {
      if (!input.email) throw badRequest('Enter an email', { email: 'is required' })
      const emailHash = sha256(normalizeEmail(input.email))
      if (await tx.groupInvitation.findFirst({ where: { groupId, invitedEmailHash: emailHash, ...pendingNow() } })) throw conflict('That address already has a pending invitation')
      const inv = await tx.groupInvitation.create({ data: { ...base, invitedEmailHash: emailHash }, include: { invitedUser: { include: { profile: true } } } })
      // The worker emails the link, then clears the address and token from the event (never stored on the invitation).
      await enqueue(tx, 'GroupInvitationCreated', { invitationId: inv.id, groupId, email: normalizeEmail(input.email), token, inviterId: userId })
      return inv
    }
    await tx.programGroup.update({ where: { id: groupId }, data: { joinLinkEnabled: true } })
    return tx.groupInvitation.create({ data: base, include: { invitedUser: { include: { profile: true } } } })
  })
  // The raw token is shown once, to the inviter: a share link for LINK, a fallback link otherwise.
  return toInvitation(row, token)
}

export async function revokeInvitation(userId: string, groupId: string, invitationId: string) {
  const m = await activeMember(userId, groupId)
  const inv = await db.groupInvitation.findUnique({ where: { id: invitationId } })
  if (!inv || inv.groupId !== groupId) throw notFound('Invitation')
  if (inv.createdById !== userId && m.role !== 'OWNER') throw forbidden()
  if (inv.status !== 'PENDING') return // already accepted, declined, revoked or expired: nothing to undo
  await db.groupInvitation.update({ where: { id: inv.id }, data: { status: 'REVOKED' } })
}

const invitationInclude = {
  group: { include: { version: { include: { program: { include: { policy: true } } } } } },
  createdBy: { include: { profile: true } },
} satisfies Prisma.GroupInvitationInclude
type InvitationRow = Prisma.GroupInvitationGetPayload<{ include: typeof invitationInclude }>
type GroupWithProgram = InvitationRow['group']

/** New joins need an active group on a published, unmoderated Program and version (10 §3). */
function openForJoins(g: GroupWithProgram) {
  const program = g.version.program
  return g.status === 'ACTIVE' && program.status === 'PUBLISHED' && !program.moderatedAt && !!g.version.publishedAt
}

function usable(inv: InvitationRow | null): inv is InvitationRow {
  if (!inv || inv.status !== 'PENDING' || inv.expiresAt < new Date()) return false
  return inv.kind !== 'LINK' || inv.group.joinLinkEnabled
}

async function invitationByToken(token: string) {
  const inv = await db.groupInvitation.findUnique({ where: { tokenHash: sha256(token) }, include: invitationInclude })
  if (!usable(inv) || inv.group.status !== 'ACTIVE') throw notFound('Invitation')
  return inv
}

/** An invitation addressed to the viewer (USER, or EMAIL to their verified address), by id. */
async function invitationForMe(userId: string, invitationId: string) {
  const inv = await db.groupInvitation.findUnique({ where: { id: invitationId }, include: invitationInclude })
  if (!usable(inv) || inv.kind === 'LINK' || !(await addressedTo(userId, inv, true))) throw notFound('Invitation')
  return inv
}

async function addressedTo(userId: string, inv: InvitationRow, requireVerified = false) {
  if (inv.kind === 'LINK') return true
  if (inv.kind === 'USER') return inv.invitedUserId === userId
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })
  // Holding the emailed token proves the address; listing without it needs a verified address.
  if (requireVerified && !user.emailVerifiedAt) return false
  return inv.invitedEmailHash === sha256(normalizeEmail(user.email))
}

const LIVE_ENROLLMENT = ['ACTIVE', 'PAUSED', 'PENDING_ACCESS'] as const
const syncStart = (g: ProgramGroup) => (g.mode === 'SYNC' && g.startLocalDate ? fromDbDate(g.startLocalDate) : null)

type JoinStatus =
  | 'SIGN_IN_REQUIRED' | 'UNAVAILABLE' | 'ACCESS_REQUIRED' | 'PAYMENT_REQUIRED' | 'ALREADY_MEMBER'
  | 'READY_TO_JOIN' | 'CONFIRM_ENROLLMENT' | 'SELECT_SCHEDULE' | 'ENROLLED_OTHER_VERSION' | 'LEAVE_OTHER_GROUP'

/** What this viewer must do to join a group via invitation or public open join (10 §3). */
async function evaluateGroupJoinState(
  viewerId: string | null,
  group: GroupWithProgram,
  opts: { inv?: InvitationRow; directPublic?: boolean } = {},
) {
  const program = group.version.program
  const state = (status: JoinStatus, e?: { id: string; startLocalDate: Date } | null) => ({
    status,
    enrollmentId: e?.id ?? null,
    startLocalDate: e ? fromDbDate(e.startLocalDate) : syncStart(group),
    startDateDiffers: !!e && !!syncStart(group) && syncStart(group) !== fromDbDate(e.startLocalDate),
  })
  if (!viewerId) return state('SIGN_IN_REQUIRED')
  if (
    !openForJoins(group) ||
    (opts.inv && !(await addressedTo(viewerId, opts.inv))) ||
    (await isBlockedEitherWay(viewerId, group.ownerId))
  ) {
    return state('UNAVAILABLE')
  }
  const member = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId: viewerId } } })
  const enrollment = await db.programEnrollment.findFirst({ where: { userId: viewerId, programId: program.id, status: { in: [...LIVE_ENROLLMENT] } } , orderBy: { createdAt: 'desc' } })
  if (member?.status === 'ACTIVE') return state('ALREADY_MEMBER', enrollment?.groupId === group.id ? enrollment : null)
  // A removed member needs a fresh invitation from the owner; a reusable link or open direct join is not one.
  if (member?.status === 'REMOVED' && (opts.directPublic || opts.inv?.kind === 'LINK')) return state('UNAVAILABLE')
  if (opts.directPublic && (group.visibility !== 'PUBLIC' || group.joinPolicy !== 'OPEN')) return state('UNAVAILABLE')
  const mode = program.policy?.accessMode ?? 'OPEN'
  if (mode !== 'OPEN' && !isProgramOwner(program, viewerId) && !(await hasActiveGrant(viewerId, program.id))) {
    return state(mode === 'PAID' ? 'PAYMENT_REQUIRED' : 'ACCESS_REQUIRED')
  }
  if (enrollment) {
    // Any version of this Program is fine: members of one group may follow different versions.
    if (enrollment.groupId && enrollment.groupId !== group.id) {
      const other = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: enrollment.groupId, userId: viewerId } }, include: { group: true } })
      if (other?.status === 'ACTIVE' && other.group.status === 'ACTIVE') return state('LEAVE_OTHER_GROUP', enrollment)
    }
    return state('READY_TO_JOIN', enrollment)
  }
  return state(group.mode === 'SYNC' ? 'CONFIRM_ENROLLMENT' : 'SELECT_SCHEDULE')
}

async function joinState(viewerId: string | null, inv: InvitationRow) {
  return evaluateGroupJoinState(viewerId, inv.group, { inv })
}

const ACCEPTABLE: JoinStatus[] = ['ALREADY_MEMBER', 'READY_TO_JOIN', 'CONFIRM_ENROLLMENT', 'SELECT_SCHEDULE']

async function toPreview(viewerId: string | null, inv: InvitationRow) {
  const program = inv.group.version.program
  const join = await joinState(viewerId, inv)
  return {
    groupName: inv.group.name,
    inviter: toUserSummary(inv.createdBy.profile!),
    // An invitation lets the invitee preview a private Program; it never grants its content.
    program: await programPreview(viewerId, program.id, { invited: true }),
    mode: inv.group.mode,
    startLocalDate: inv.group.startLocalDate ? fromDbDate(inv.group.startLocalDate) : null,
    canAccept: ACCEPTABLE.includes(join.status),
    requiresAccess: join.status === 'ACCESS_REQUIRED' || join.status === 'PAYMENT_REQUIRED',
    join,
  }
}

export async function previewInvitation(viewerId: string | null, token: string) {
  return toPreview(viewerId, await invitationByToken(token))
}

export async function listReceived(userId: string, query: PageQuery) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })
  const { limit, take } = pageArgs(query)
  const rows = await db.groupInvitation.findMany({
    where: {
      ...pendingNow(),
      group: { status: 'ACTIVE' },
      OR: [{ kind: 'USER', invitedUserId: userId }, ...(user.emailVerifiedAt ? [{ kind: 'EMAIL' as const, invitedEmailHash: sha256(normalizeEmail(user.email)) }] : [])],
      ...afterCursor(query.cursor),
    },
    orderBy: pageOrder,
    take,
    include: invitationInclude,
  })
  const page = toPage(rows, limit, (r) => r)
  return {
    data: await Promise.all(page.data.map(async (r) => ({ id: r.id, kind: r.kind, expiresAt: r.expiresAt.toISOString(), groupId: r.groupId, preview: await toPreview(userId, r) }))),
    meta: page.meta,
  }
}

type AcceptInput = { enrollment?: { startLocalDate?: string; timezone: string; idempotencyKey: string } }

/**
 * Membership, entitlement, enrollment and calendar in one transaction, after the participant
 * confirmed the schedule. Shared by invitation acceptance and direct open-group join (10 §3).
 */
async function executeGroupJoin(
  userId: string,
  group: GroupWithProgram,
  join: Awaited<ReturnType<typeof evaluateGroupJoinState>>,
  input: AcceptInput,
  opts: { inv?: InvitationRow; unavailableMessage: string; allowMembershipWithoutEnrollment?: boolean },
) {
  const program = group.version.program
  switch (join.status) {
    case 'SIGN_IN_REQUIRED':
    case 'UNAVAILABLE':
      throw notFound(opts.unavailableMessage)
    case 'ACCESS_REQUIRED':
    case 'PAYMENT_REQUIRED':
      // Never bypasses entitlement: locked Programs need access first.
      throw new AppError(join.status, 'Get access to this program first')
    case 'ENROLLED_OTHER_VERSION':
      throw conflict('You follow a different version of this program. Update or leave it, then accept again')
    case 'LEAVE_OTHER_GROUP':
      throw conflict('You follow this program with another group. Leave that group, then join again')
    default:
  }
  const needsEnrollment = join.status === 'CONFIRM_ENROLLMENT' || join.status === 'SELECT_SCHEDULE'
  const shouldCreateEnrollment = needsEnrollment && (!!input.enrollment || !opts.allowMembershipWithoutEnrollment)
  let schedule: { startLocalDate: string; timezone: string } | null = null
  if (shouldCreateEnrollment) {
    const e = input.enrollment
    if (!e) throw badRequest('Confirm your schedule to join this group', { enrollment: join.status === 'CONFIRM_ENROLLMENT' ? 'confirm the group start date' : 'choose a start date' })
    if (!isValidTimeZone(e.timezone)) throw badRequest('Unknown timezone', { 'enrollment.timezone': 'is not a valid IANA timezone' })
    const fixed = syncStart(group)
    if (fixed && e.startLocalDate && e.startLocalDate !== fixed) throw badRequest(`This group starts on ${fixed}`, { 'enrollment.startLocalDate': 'must match the group start date' })
    const start = fixed ?? e.startLocalDate
    if (!start) throw badRequest('Choose a start date', { 'enrollment.startLocalDate': 'is required' })
    schedule = { startLocalDate: start, timezone: e.timezone }
  }
  // Newcomers start on the version available now; the group's creation version may be older.
  const joinable = shouldCreateEnrollment
    ? await joinableVersion(userId, program.id, program.latestPublishedVersionId ?? group.programVersionId, { invited: !!opts.inv })
    : null

  await db.$transaction(
    async (tx) => {
      // Re-check single-use invitations inside the transaction: two accepts cannot both consume one.
      if (opts.inv && opts.inv.kind !== 'LINK') {
        const consumed = await tx.groupInvitation.updateMany({ where: { id: opts.inv.id, status: 'PENDING' }, data: { status: 'ACCEPTED' } })
        if (!consumed.count && join.status !== 'ALREADY_MEMBER') throw notFound('Invitation')
      }
      if (join.status === 'ALREADY_MEMBER') return
      await tx.groupMember.upsert({
        where: { groupId_userId: { groupId: group.id, userId } },
        create: { groupId: group.id, userId, role: 'MEMBER', status: 'ACTIVE', joinedAt: new Date() },
        update: { status: 'ACTIVE', role: 'MEMBER', joinedAt: new Date() },
      })
      const mode = program.policy?.accessMode ?? 'OPEN'
      // The invitation is the explicit authorization a PRIVATE, open Program needs (07 §5).
      if (program.visibility === 'PRIVATE' && mode === 'OPEN' && !isProgramOwner(program, userId)) {
        await tx.programAccessGrant.upsert({
          where: { source_sourceRef: { source: 'OPEN', sourceRef: `${userId}:${program.id}` } },
          create: { userId, programId: program.id, source: 'OPEN', sourceRef: `${userId}:${program.id}` },
          update: { revokedAt: null },
        })
      }
      // Guard against concurrent enrollment creation between pre-check and tx commit.
      const liveInTx = await tx.programEnrollment.findFirst({
        where: { userId, programId: program.id, status: { in: ['ACTIVE', 'PAUSED'] } },
        select: { id: true },
      })
      if (joinable && schedule && !liveInTx) {
        await enrollInTx(tx, userId, joinable.program, joinable.version, { ...schedule, groupId: group.id })
      } else {
        await linkEnrollment(tx, userId, group)
      }
      await enqueue(tx, 'GroupMemberJoined', { groupId: group.id, userId })
    },
    { timeout: 30_000 },
  )
  return toDetail(group.id, userId)
}

async function acceptInvitation(userId: string, inv: InvitationRow, input: AcceptInput = {}) {
  const join = await joinState(userId, inv)
  return executeGroupJoin(userId, inv.group, join, input, { inv, unavailableMessage: 'Invitation' })
}

async function loadPublicGroup(viewerId: string | null, groupId: string) {
  const group = await db.programGroup.findUnique({ where: { id: groupId }, include: invitationInclude.group.include })
  if (
    !group ||
    group.visibility !== 'PUBLIC' ||
    !openForJoins(group) ||
    group.version.program.visibility !== 'PUBLIC' ||
    group.version.program.deletedAt ||
    (viewerId && (await isBlockedEitherWay(viewerId, group.ownerId)))
  ) {
    throw notFound('Group')
  }
  return group
}

export async function previewPublic(viewerId: string | null, groupId: string) {
  const group = await loadPublicGroup(viewerId, groupId)
  const [memberCount, join, program, checkInMap] = await Promise.all([
    db.groupMember.count({ where: { groupId: group.id, status: 'ACTIVE' } }),
    evaluateGroupJoinState(viewerId, group, { directPublic: true }),
    programPreview(viewerId, group.version.programId),
    recentCheckInCounts([group.id]),
  ])
  return {
    id: group.id,
    groupName: group.name,
    mode: group.mode,
    visibility: group.visibility,
    joinPolicy: group.joinPolicy,
    memberCount,
    startLocalDate: group.startLocalDate ? fromDbDate(group.startLocalDate) : null,
    timezone: group.timezone,
    program,
    canJoin: ACCEPTABLE.includes(join.status),
    requiresAccess: join.status === 'ACCESS_REQUIRED' || join.status === 'PAYMENT_REQUIRED',
    join,
    recentCheckInCount: checkInMap.get(group.id) ?? 0,
  }
}

export async function joinPublic(userId: string, groupId: string, input: AcceptInput = {}) {
  return idempotentAccept(userId, `group-join:${groupId}`, input, async () => {
    const group = await loadPublicGroup(userId, groupId)
    if (group.joinPolicy !== 'OPEN') throw forbidden('This group requires an invitation')
    const join = await evaluateGroupJoinState(userId, group, { directPublic: true })
    return {
      groupId: group.id,
      detail: await executeGroupJoin(userId, group, join, input, {
        unavailableMessage: 'Group',
        allowMembershipWithoutEnrollment: true,
      }),
    }
  })
}

/**
 * With an enrollment the accept carries an idempotency key: a replay returns the original result
 * even though the single-use invitation is already consumed (the key is checked first).
 */
function idempotentAccept(userId: string, scope: string, input: AcceptInput | undefined, run: () => Promise<{ groupId: string; detail: Awaited<ReturnType<typeof toDetail>> }>) {
  if (!input?.enrollment) return run().then((r) => r.detail)
  const { idempotencyKey, ...schedule } = input.enrollment
  return withIdempotency({
    userId,
    scope,
    key: idempotencyKey,
    request: schedule,
    load: (groupId) => toDetail(groupId, userId),
    run: async () => {
      const r = await run()
      return { ref: r.groupId, result: r.detail }
    },
  })
}

export async function accept(userId: string, token: string, input?: AcceptInput) {
  // The scope column is VarChar(64): a 40-hex prefix of the token hash identifies the invitation.
  return idempotentAccept(userId, `group-accept:${sha256(token).slice(0, 40)}`, input, async () => {
    const inv = await invitationByToken(token)
    if (!(await addressedTo(userId, inv))) throw notFound('Invitation')
    return { groupId: inv.groupId, detail: await acceptInvitation(userId, inv, input) }
  })
}

export async function acceptMine(userId: string, invitationId: string, input?: AcceptInput) {
  return idempotentAccept(userId, `group-accept:${invitationId}`, input, async () => {
    const inv = await invitationForMe(userId, invitationId)
    return { groupId: inv.groupId, detail: await acceptInvitation(userId, inv, input) }
  })
}

async function declineInvitation(userId: string, inv: InvitationRow) {
  if (inv.kind === 'LINK') throw badRequest('A join link does not need to be declined')
  if (!(await addressedTo(userId, inv))) throw notFound('Invitation')
  const done = await db.groupInvitation.updateMany({ where: { id: inv.id, status: 'PENDING' }, data: { status: 'DECLINED' } })
  if (!done.count) throw notFound('Invitation')
}

export async function decline(userId: string, token: string) {
  await declineInvitation(userId, await invitationByToken(token))
}

export async function declineMine(userId: string, invitationId: string) {
  await declineInvitation(userId, await invitationForMe(userId, invitationId))
}

/** Worker sweep: PENDING past expiry becomes EXPIRED (reads already treat it as expired). */
export async function expireInvitations(now = new Date()) {
  return (await db.groupInvitation.updateMany({ where: { status: 'PENDING', expiresAt: { lt: now } }, data: { status: 'EXPIRED' } })).count
}

// ── Completions, reactions, shared media ────────────────────────────────────

const groupMediaInclude = { media: true, publishedBy: { include: { profile: true } } } satisfies Prisma.MediaPublicationInclude
type GroupMediaRow = Prisma.MediaPublicationGetPayload<{ include: typeof groupMediaInclude }>

function toGroupMediaThumb(p: GroupMediaRow) {
  return {
    id: p.media.id,
    thumbnailUrl: thumbFor(p.media, { publicationId: p.id }),
    type: p.media.type,
    durationMs: p.media.durationMs,
    alt: p.media.alt ?? '',
    canSelect: false,
    publicationId: p.id,
    owner: toUserSummary(p.publishedBy.profile!),
    commentCount: p.commentCount,
    caption: p.caption,
  }
}

const shareInclude = {
  user: { include: { profile: true } },
  reactions: true,
  activity: true,
  mediaPublication: { include: groupMediaInclude },
  _count: { select: { comments: { where: { status: 'VISIBLE', deletedAt: null } } } },
} satisfies Prisma.CompletionShareInclude
type ShareRow = Prisma.CompletionShareGetPayload<{ include: typeof shareInclude }>

export function reactionCounts(rows: { emoji: string; userId: string }[], viewerId: string) {
  const counts = new Map<string, { count: number; mine: boolean }>()
  for (const r of rows) {
    const c = counts.get(r.emoji) ?? { count: 0, mine: false }
    counts.set(r.emoji, { count: c.count + 1, mine: c.mine || r.userId === viewerId })
  }
  return [...counts].map(([emoji, c]) => ({ emoji, count: c.count, reactedByMe: c.mine }))
}

const toShare = (s: ShareRow, viewerId: string) => ({
  id: s.id,
  groupId: s.groupId,
  user: toUserSummary(s.user.profile!),
  activityId: s.activityId,
  activityTitle: s.activity.title,
  programDayIndex: s.programDayIndex,
  occurrenceKey: s.occurrenceKey,
  note: s.note ?? null,
  mediaPublicationId: s.mediaPublicationId ?? null,
  media:
    s.mediaPublication && s.mediaPublication.status === 'APPROVED' && !s.mediaPublication.media.deletedAt
      ? toGroupMediaThumb(s.mediaPublication)
      : null,
  commentCount: s._count.comments,
  completedAt: s.completedAt.toISOString(),
  reactions: reactionCounts(s.reactions, viewerId),
})

export async function listCompletions(userId: string, groupId: string, query: PageQuery & { occurrenceKey?: string }) {
  await activeMember(userId, groupId)
  const blocked = await blockedIds(userId)
  const { limit, take } = pageArgs(query)
  const rows = await db.completionShare.findMany({
    where: {
      groupId,
      revokedAt: null,
      ...(blocked.length ? { userId: { notIn: blocked } } : {}),
      ...(query.occurrenceKey ? { occurrenceKey: query.occurrenceKey } : {}),
      ...completedCursor(query.cursor),
    },
    orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
    take,
    include: shareInclude,
  })
  return toPage(rows.map((r) => ({ ...r, createdAt: r.completedAt })), limit, (r) => toShare(r, userId))
}

function completedCursor(cursor?: string): Prisma.CompletionShareWhereInput {
  const c = afterCursor(cursor) as { OR?: [{ createdAt: { lt: Date } }, { createdAt: Date; id: { lt: string } }] }
  if (!c.OR) return {}
  return { OR: [{ completedAt: c.OR[0].createdAt }, { completedAt: c.OR[1].createdAt, id: c.OR[1].id }] }
}

async function shareForReaction(userId: string, shareId: string) {
  const s = await db.completionShare.findUnique({ where: { id: shareId } })
  if (!s || s.revokedAt) throw notFound('Completion')
  await activeMember(userId, s.groupId)
  return s
}

export async function react(userId: string, shareId: string, emoji: string, idempotencyKey?: string) {
  if (!REACTIONS.includes(emoji)) throw badRequest('Choose one of the reactions', { emoji: 'not supported' })
  const s = await shareForReaction(userId, shareId)
  if (s.userId !== userId && (await isBlockedEitherWay(userId, s.userId))) throw notFound('Completion')
  const loadReactions = async () => reactionCounts(await db.completionReaction.findMany({ where: { completionShareId: s.id } }), userId)
  const applyReaction = async () => {
    const created = await db.completionReaction.createMany({ data: [{ completionShareId: s.id, userId, emoji }], skipDuplicates: true })
    if (created.count && s.userId !== userId) {
      await db.outboxEvent.create({ data: { type: 'CompletionReacted', payload: { shareId: s.id, userId, recipientId: s.userId, emoji, groupId: s.groupId, occurrenceKey: s.occurrenceKey } } })
    }
    return { ref: `${s.id}:${emoji}`, result: await loadReactions() }
  }
  if (!idempotencyKey) return (await applyReaction()).result
  return withIdempotency({
    userId,
    scope: `reaction:${s.id}`,
    key: idempotencyKey,
    request: { shareId: s.id, emoji },
    load: loadReactions,
    run: applyReaction,
  })
}

export async function unreact(userId: string, shareId: string, emoji: string) {
  const s = await shareForReaction(userId, shareId)
  await db.completionReaction.deleteMany({ where: { completionShareId: s.id, userId, emoji } })
  return reactionCounts(await db.completionReaction.findMany({ where: { completionShareId: s.id } }), userId)
}

export async function listMedia(userId: string, groupId: string, query: PageQuery & { occurrenceKey?: string }) {
  await activeMember(userId, groupId)
  const { limit, take } = pageArgs(query)
  const rows = await db.mediaPublication.findMany({
    where: { groupId, audience: 'GROUP', status: 'APPROVED', media: { deletedAt: null }, ...(query.occurrenceKey ? { occurrenceKey: query.occurrenceKey } : {}), ...afterCursor(query.cursor) },
    orderBy: pageOrder,
    take,
    include: groupMediaInclude,
  })
  return toPage(rows, limit, toGroupMediaThumb)
}

export async function createCheckIns(
  userId: string,
  input: {
    activityId: string
    groupIds: string[]
    calendarItemId?: string | null
    note?: string | null
    mediaId?: string | null
    idempotencyKey?: string
  },
) {
  const groupIds = [...new Set(input.groupIds)]
  if (!groupIds.length) throw badRequest('Choose at least one group', { groupIds: 'is required' })

  const activity = await db.activity.findUnique({ where: { id: input.activityId } })
  if (!activity || activity.moderatedAt) throw notFound('Activity')

  let resolvedCalendarItem: { id: string; groupOccurrenceKey: string | null; programDayIndex: number | null; completedAt: Date | null } | null = null
  if (input.calendarItemId) {
    const item = await db.calendarItem.findUnique({ where: { id: input.calendarItemId } })
    if (!item || item.ownerId !== userId || item.activityId !== activity.id || item.status !== 'DONE') {
      throw badRequest('Complete this activity before checking in', { calendarItemId: 'must be completed first' })
    }
    resolvedCalendarItem = {
      id: item.id,
      groupOccurrenceKey: item.groupOccurrenceKey,
      programDayIndex: item.programDayIndex,
      completedAt: item.updatedAt,
    }
  } else {
    const completedItem = await db.calendarItem.findFirst({
      where: { ownerId: userId, activityId: activity.id, status: 'DONE' },
      orderBy: { updatedAt: 'desc' },
    })
    const finishedSession = completedItem
      ? null
      : await db.activitySession.findFirst({
          where: { userId, status: 'FINISHED', calendarItem: { activityId: activity.id } },
          select: { id: true },
        })
    if (!completedItem && !finishedSession) {
      throw badRequest('Complete this activity before checking in', { activityId: 'complete the activity first' })
    }
  }

  const memberships = await db.groupMember.findMany({
    where: { userId, groupId: { in: groupIds }, status: 'ACTIVE', group: { status: 'ACTIVE' } },
    select: { groupId: true },
  })
  if (memberships.length !== groupIds.length) {
    throw forbidden('Join every selected group before checking in')
  }

  let validatedMedia: { id: string } | null = null
  if (input.mediaId) {
    const asset = await db.mediaAsset.findFirst({
      where: { id: input.mediaId, deletedAt: null, OR: [{ ownerId: userId }, { ownerId: null }] },
    })
    if (!asset || (asset.type !== 'PHOTO' && asset.type !== 'VIDEO')) {
      throw badRequest('Choose a photo or video from your media library', { mediaId: 'not available' })
    }
    if (asset.state !== 'READY') {
      throw badRequest('Wait until this media finishes processing', { mediaId: 'is not ready' })
    }
    validatedMedia = { id: asset.id }
  }

  const cleanNote = input.note?.trim() ? input.note.trim().slice(0, 500) : null
  const occKey = resolvedCalendarItem?.groupOccurrenceKey ?? `activity:${activity.id}`
  const completedAt = new Date()

  const shareIds = await db.$transaction(async (tx) => {
    const ids: string[] = []
    for (const gid of groupIds) {
      let mediaPublicationId: string | null = null
      if (validatedMedia) {
        const pub = await tx.mediaPublication.create({
          data: {
            mediaId: validatedMedia.id,
            publishedById: userId,
            audience: 'GROUP',
            groupId: gid,
            occurrenceKey: occKey,
            activityId: activity.id,
            caption: cleanNote,
            status: 'APPROVED',
            publishedAt: completedAt,
          },
          select: { id: true },
        })
        mediaPublicationId = pub.id
        await enqueue(tx, 'GroupMediaShared', { publicationId: pub.id, groupId: gid, userId })
      }

      const share = resolvedCalendarItem
        ? await tx.completionShare.upsert({
            where: { groupId_calendarItemId: { groupId: gid, calendarItemId: resolvedCalendarItem.id } },
            create: {
              groupId: gid,
              occurrenceKey: occKey,
              calendarItemId: resolvedCalendarItem.id,
              userId,
              activityId: activity.id,
              programDayIndex: resolvedCalendarItem.programDayIndex,
              note: cleanNote,
              mediaPublicationId,
              completedAt,
            },
            update: {
              revokedAt: null,
              completedAt,
              ...(cleanNote !== null ? { note: cleanNote } : {}),
              ...(mediaPublicationId !== null ? { mediaPublicationId } : {}),
            },
          })
        : await tx.completionShare.create({
            data: {
              groupId: gid,
              occurrenceKey: occKey,
              calendarItemId: null,
              userId,
              activityId: activity.id,
              programDayIndex: null,
              note: cleanNote,
              mediaPublicationId,
              completedAt,
            },
          })
      await enqueue(tx, 'CompletionShared', {
        shareId: share.id,
        groupId: gid,
        occurrenceKey: occKey,
        calendarItemId: resolvedCalendarItem?.id ?? null,
        userId,
        activityId: activity.id,
      })
      ids.push(share.id)
    }
    return ids
  })

  const shares = await db.completionShare.findMany({
    where: { id: { in: shareIds } },
    include: shareInclude,
  })
  const byId = new Map(shares.map((s) => [s.id, toShare(s, userId)]))
  return shareIds.map((id) => byId.get(id)!).filter(Boolean)
}

const commentInclude = { author: { include: { profile: true } } } satisfies Prisma.CompletionCommentInclude
type CommentRow = Prisma.CompletionCommentGetPayload<{ include: typeof commentInclude }>

const toCompletionComment = (c: CommentRow, viewerId: string, groupOwnerId: string) => ({
  id: c.id,
  completionShareId: c.completionShareId,
  author: toUserSummary(c.author.profile!),
  body: c.body,
  createdAt: c.createdAt.toISOString(),
  canDelete: c.authorId === viewerId || groupOwnerId === viewerId,
})

export async function listCompletionComments(userId: string, shareId: string, query: PageQuery) {
  const s = await shareForReaction(userId, shareId)
  const [member, blocked] = await Promise.all([activeMember(userId, s.groupId), blockedIds(userId)])
  const { limit, take } = pageArgs(query)
  const rows = await db.completionComment.findMany({
    where: {
      completionShareId: s.id,
      status: 'VISIBLE',
      deletedAt: null,
      ...(blocked.length ? { authorId: { notIn: blocked } } : {}),
      ...afterCursor(query.cursor),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take,
    include: commentInclude,
  })
  return toPage(rows, limit, (c) => toCompletionComment(c, userId, member.group.ownerId))
}

export async function addCompletionComment(
  userId: string,
  shareId: string,
  input: { body: string; idempotencyKey?: string },
) {
  const clean = input.body.trim()
  if (!clean) throw badRequest('Write a comment first', { body: 'is required' })
  const s = await shareForReaction(userId, shareId)
  const member = await activeMember(userId, s.groupId)
  if (s.userId !== userId && (await isBlockedEitherWay(userId, s.userId))) throw notFound('Completion')

  const createComment = async () => {
    const created = await db.$transaction(async (tx) => {
      const row = await tx.completionComment.create({
        data: { completionShareId: s.id, authorId: userId, body: clean.slice(0, 1000) },
        include: commentInclude,
      })
      if (s.userId !== userId) {
        await enqueue(tx, 'CompletionCommentAdded', {
          shareId: s.id,
          commentId: row.id,
          userId,
          recipientId: s.userId,
          groupId: s.groupId,
          occurrenceKey: s.occurrenceKey,
        })
      }
      return row
    })
    return { ref: created.id, result: toCompletionComment(created, userId, member.group.ownerId) }
  }

  if (!input.idempotencyKey) return (await createComment()).result
  return withIdempotency({
    userId,
    scope: `completion-comment:${s.id}`,
    key: input.idempotencyKey,
    request: { shareId: s.id, body: clean },
    load: async (id) => {
      const row = await db.completionComment.findUniqueOrThrow({ where: { id }, include: commentInclude })
      return toCompletionComment(row, userId, member.group.ownerId)
    },
    run: createComment,
  })
}

export async function deleteCompletionComment(userId: string, commentId: string) {
  const comment = await db.completionComment.findUnique({
    where: { id: commentId },
    include: { share: { include: { group: true } } },
  })
  if (!comment || comment.deletedAt) throw notFound('Comment')
  await activeMember(userId, comment.share.groupId)
  if (comment.authorId !== userId && comment.share.group.ownerId !== userId) {
    throw forbidden('You can only delete your own comments')
  }
  await db.completionComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } })
}
