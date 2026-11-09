// Program Groups (10-COLLABORATION.md). Members keep independent calendars and private results;
// the group overlays consented completion, reactions, and explicitly shared media.
import { db, type Prisma, type ProgramGroup } from '@project/db'
import { newToken, sha256 } from '../../lib/auth'
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { withIdempotency } from '../../lib/idempotency'
import { enqueue } from '../../lib/outbox'
import { afterCursor, pageArgs, pageOrder, toPage, type PageQuery } from '../../lib/paging'
import { fromDbDate, isValidTimeZone, toDbDate } from '../../lib/time'
import { occurrenceKey, sameDayOrdinals } from '../calendar/materialize'
import { isBlockedEitherWay } from '../users/follow.service'
import { normalizeEmail } from '../users/auth.service'
import { toUserSummary } from '../users/mapper'
import { canSeeProgram, hasActiveGrant, isProgramOwner } from '../programs/access'
import { preview as programPreview } from '../programs/browse.service'
import { thumbFor } from '../media/media.service'
import { enrollInTx, joinableVersion } from '../programs/enrollment.service'

const INVITE_TTL_MS = 14 * 24 * 3600_000
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

async function toSummary(g: ProgramGroup & { version: { title: string } }, userId: string) {
  const [memberCount, me] = await Promise.all([
    db.groupMember.count({ where: { groupId: g.id, status: 'ACTIVE' } }),
    db.groupMember.findUnique({ where: { groupId_userId: { groupId: g.id, userId } } }),
  ])
  return { id: g.id, programVersionId: g.programVersionId, programTitle: g.version.title, name: g.name, mode: g.mode, memberCount, myRole: me?.role ?? 'MEMBER' }
}

async function toDetail(groupId: string, userId: string) {
  const g = await db.programGroup.findUniqueOrThrow({ where: { id: groupId }, include: { version: true } })
  const members = await db.groupMember.findMany({ where: { groupId, status: 'ACTIVE' }, include: { user: { include: { profile: true } } }, orderBy: { createdAt: 'asc' } })
  const me = members.find((m) => m.userId === userId)
  const mine = await db.programEnrollment.findFirst({ where: { userId, groupId, status: { in: ['ACTIVE', 'PAUSED'] } } })
  const shared = g.mode === 'SYNC' && g.startLocalDate ? fromDbDate(g.startLocalDate) : null
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
  }
}

/**
 * Links a member's live enrollment for this Program, whichever version it follows, to the group and
 * stamps the version-independent group occurrence key on its items. The calendar itself (dates,
 * statuses, results) is never changed.
 */
async function linkEnrollment(tx: Prisma.TransactionClient, userId: string, group: ProgramGroup & { version: { programId: string } }) {
  const e = await tx.programEnrollment.findFirst({ where: { userId, programId: group.version.programId, status: { in: ['ACTIVE', 'PAUSED'] } } })
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
  return { data: await Promise.all(page.data.map((g) => toSummary(g, userId))), meta: page.meta }
}

export async function create(userId: string, input: { programVersionId: string; name?: string | null; mode: 'SYNC' | 'ASYNC'; startLocalDate?: string | null; timezone?: string }) {
  const version = await db.programVersion.findUnique({ where: { id: input.programVersionId }, include: { program: true } })
  if (!version?.publishedAt || !(await canSeeProgram(userId, version.program))) throw notFound('Program')
  const enrolled = await db.programEnrollment.findFirst({ where: { userId, programId: version.programId, status: { in: ['ACTIVE', 'PAUSED'] } } })
  // 10 §3: created by an enrolled participant or the Program owner.
  if (!enrolled && !isProgramOwner(version.program, userId)) throw forbidden('Join this program before starting a group')
  if (enrolled?.groupId) throw conflict('You are already following this program with a group')
  // SYNC groups share one start date; default it from the creator's own enrollment.
  const start = input.mode === 'SYNC' ? input.startLocalDate ?? (enrolled ? fromDbDate(enrolled.startLocalDate) : null) : null
  if (input.mode === 'SYNC' && !start) throw badRequest('Choose the shared start date', { startLocalDate: 'is required for SYNC' })
  const tz = input.timezone ?? enrolled?.timezone ?? (await db.userPreference.findUnique({ where: { userId } }))?.timezone ?? 'UTC'
  const g = await db.$transaction(async (tx) => {
    const group = await tx.programGroup.create({
      data: { programVersionId: version.id, ownerId: userId, name: input.name?.trim() || null, mode: input.mode, startLocalDate: start ? toDbDate(start) : null, timezone: tz, members: { create: { userId, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() } } },
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

export async function update(userId: string, groupId: string, input: { name?: string | null; joinLinkEnabled?: boolean; memberLinkSharingEnabled?: boolean; closed?: boolean }) {
  await ownedGroup(userId, groupId)
  await db.$transaction(async (tx) => {
    await tx.programGroup.update({
      where: { id: groupId },
      data: { name: input.name === undefined ? undefined : input.name?.trim() || null, joinLinkEnabled: input.joinLinkEnabled, memberLinkSharingEnabled: input.memberLinkSharingEnabled, status: input.closed ? 'CLOSED' : undefined },
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

/** What this viewer must do to join through this invitation (10 §3, join state table). */
async function joinState(viewerId: string | null, inv: InvitationRow) {
  const group = inv.group
  const program = group.version.program
  const state = (status: JoinStatus, e?: { id: string; startLocalDate: Date } | null) => ({
    status,
    enrollmentId: e?.id ?? null,
    startLocalDate: e ? fromDbDate(e.startLocalDate) : syncStart(group),
    startDateDiffers: !!e && !!syncStart(group) && syncStart(group) !== fromDbDate(e.startLocalDate),
  })
  if (!viewerId) return state('SIGN_IN_REQUIRED')
  if (!openForJoins(group) || !(await addressedTo(viewerId, inv)) || (await isBlockedEitherWay(viewerId, group.ownerId))) return state('UNAVAILABLE')
  const member = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId: viewerId } } })
  const enrollment = await db.programEnrollment.findFirst({ where: { userId: viewerId, programId: program.id, status: { in: [...LIVE_ENROLLMENT] } } })
  if (member?.status === 'ACTIVE') return state('ALREADY_MEMBER', enrollment?.groupId === group.id ? enrollment : null)
  // A removed member needs a fresh invitation from the owner; a reusable link is not one.
  if (member?.status === 'REMOVED' && inv.kind === 'LINK') return state('UNAVAILABLE')
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
 * confirmed the schedule. A failure anywhere leaves no membership behind (10 §3).
 */
async function acceptInvitation(userId: string, inv: InvitationRow, input: AcceptInput = {}) {
  const group = inv.group
  const program = group.version.program
  const join = await joinState(userId, inv)
  switch (join.status) {
    case 'SIGN_IN_REQUIRED':
    case 'UNAVAILABLE':
      throw notFound('Invitation')
    case 'ACCESS_REQUIRED':
    case 'PAYMENT_REQUIRED':
      // Never bypasses entitlement: locked Programs need access first.
      throw new AppError(join.status, 'Get access to this program first')
    case 'ENROLLED_OTHER_VERSION':
      throw conflict('You follow a different version of this program. Update or leave it, then accept again')
    case 'LEAVE_OTHER_GROUP':
      throw conflict('You follow this program with another group. Leave that group, then accept again')
    default:
  }
  const needsEnrollment = join.status === 'CONFIRM_ENROLLMENT' || join.status === 'SELECT_SCHEDULE'
  let schedule: { startLocalDate: string; timezone: string } | null = null
  if (needsEnrollment) {
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
  const joinable = needsEnrollment ? await joinableVersion(userId, program.id, program.latestPublishedVersionId ?? group.programVersionId, { invited: true }) : null

  const apply = () =>
    db.$transaction(
      async (tx) => {
        // Re-check single-use invitations inside the transaction: two accepts cannot both consume one.
        if (inv.kind !== 'LINK') {
          const consumed = await tx.groupInvitation.updateMany({ where: { id: inv.id, status: 'PENDING' }, data: { status: 'ACCEPTED' } })
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
        if (joinable && schedule) await enrollInTx(tx, userId, joinable.program, joinable.version, { ...schedule, groupId: group.id })
        else await linkEnrollment(tx, userId, group)
        await enqueue(tx, 'GroupMemberJoined', { groupId: group.id, userId })
      },
      { timeout: 30_000 },
    )

  await apply()
  return toDetail(group.id, userId)
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

const shareInclude = { user: { include: { profile: true } }, reactions: true, activity: true } satisfies Prisma.CompletionShareInclude
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
  user: toUserSummary(s.user.profile!),
  activityId: s.activityId,
  activityTitle: s.activity.title,
  programDayIndex: s.programDayIndex,
  occurrenceKey: s.occurrenceKey,
  completedAt: s.completedAt.toISOString(),
  reactions: reactionCounts(s.reactions, viewerId),
})

export async function listCompletions(userId: string, groupId: string, query: PageQuery & { occurrenceKey?: string }) {
  await activeMember(userId, groupId)
  const { limit, take } = pageArgs(query)
  const rows = await db.completionShare.findMany({
    where: { groupId, revokedAt: null, ...(query.occurrenceKey ? { occurrenceKey: query.occurrenceKey } : {}), ...completedCursor(query.cursor) },
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
    include: { media: true, publishedBy: { include: { profile: true } } },
  })
  return toPage(rows, limit, (p) => ({
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
  }))
}
