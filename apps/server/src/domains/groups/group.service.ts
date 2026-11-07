// Program Groups (10-COLLABORATION.md). Members keep independent calendars and private results;
// the group overlays consented completion, reactions, and explicitly shared media.
import { db, type Prisma, type ProgramGroup } from '@project/db'
import { newToken, sha256 } from '../../lib/auth'
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { withIdempotency } from '../../lib/idempotency'
import { enqueue } from '../../lib/outbox'
import { afterCursor, pageArgs, pageOrder, toPage, type PageQuery } from '../../lib/paging'
import { fromDbDate, toDbDate } from '../../lib/time'
import { occurrenceKey } from '../calendar/materialize'
import { isBlockedEitherWay } from '../users/follow.service'
import { normalizeEmail } from '../users/auth.service'
import { toUserSummary } from '../users/mapper'
import { canSeeProgram, hasActiveGrant, isProgramOwner } from '../programs/access'
import { preview as programPreview } from '../programs/browse.service'
import { thumbFor } from '../media/media.service'

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
  return {
    ...(await toSummary(g, userId)),
    startLocalDate: g.startLocalDate ? fromDbDate(g.startLocalDate) : null,
    timezone: g.timezone,
    joinLinkEnabled: g.joinLinkEnabled,
    members: members.map((m) => ({ user: toUserSummary(m.user.profile!), role: m.role, status: m.status, sharedCompletion: m.sharedCompletionEnabled })),
    mySharedCompletion: me?.sharedCompletionEnabled ?? true,
  }
}

/**
 * Links a member's live enrollment for this version to the group, and stamps the stable group
 * occurrence key on their future items, recovered from each item's deterministic idempotency key.
 */
async function linkEnrollment(tx: Prisma.TransactionClient, userId: string, group: ProgramGroup) {
  const e = await tx.programEnrollment.findFirst({ where: { userId, programVersionId: group.programVersionId, status: { in: ['ACTIVE', 'PAUSED'] } } })
  if (!e) return
  await tx.programEnrollment.update({ where: { id: e.id }, data: { groupId: group.id } })
  const items = await tx.calendarItem.findMany({ where: { enrollmentId: e.id, sourceScheduleItemId: { not: null } }, select: { id: true, idempotencyKey: true, sourceScheduleItemId: true } })
  await Promise.all(
    items.map((i) => {
      const cycle = Number(i.idempotencyKey.split(':')[2] ?? 0)
      return tx.calendarItem.update({ where: { id: i.id }, data: { groupOccurrenceKey: occurrenceKey(group.programVersionId, i.sourceScheduleItemId!, cycle) } })
    }),
  )
}

async function unlinkEnrollment(tx: Prisma.TransactionClient, userId: string, groupId: string) {
  const e = await tx.programEnrollment.findFirst({ where: { userId, groupId } })
  if (!e) return
  await tx.programEnrollment.update({ where: { id: e.id }, data: { groupId: null } })
  await tx.calendarItem.updateMany({ where: { enrollmentId: e.id }, data: { groupOccurrenceKey: null } })
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
  const enrolled = await db.programEnrollment.findFirst({ where: { userId, programVersionId: version.id, status: { in: ['ACTIVE', 'PAUSED'] } } })
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
    await linkEnrollment(tx, userId, group)
    return group
  })
  return toDetail(g.id, userId)
}

export async function get(userId: string, groupId: string) {
  await activeMember(userId, groupId)
  return toDetail(groupId, userId)
}

export async function update(userId: string, groupId: string, input: { name?: string | null; joinLinkEnabled?: boolean; closed?: boolean }) {
  await ownedGroup(userId, groupId)
  await db.$transaction(async (tx) => {
    await tx.programGroup.update({
      where: { id: groupId },
      data: { name: input.name === undefined ? undefined : input.name?.trim() || null, joinLinkEnabled: input.joinLinkEnabled, status: input.closed ? 'CLOSED' : undefined },
    })
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
      await tx.groupMember.update({ where: { groupId_userId: { groupId, userId } }, data: { status: 'LEFT', role: 'MEMBER' } })
      await unlinkEnrollment(tx, userId, groupId)
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
    await tx.groupMember.update({ where: { groupId_userId: { groupId, userId: memberId } }, data: { status: 'REMOVED' } })
    await unlinkEnrollment(tx, memberId, groupId)
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

export async function listInvitations(userId: string, groupId: string) {
  await activeMember(userId, groupId)
  const rows = await db.groupInvitation.findMany({ where: { groupId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, include: { invitedUser: { include: { profile: true } } } })
  return rows.map((r) => toInvitation(r))
}

export async function invite(userId: string, groupId: string, input: { kind: 'USER' | 'EMAIL' | 'LINK'; handle?: string; email?: string }) {
  const m = await activeMember(userId, groupId)
  if (m.group.status !== 'ACTIVE') throw badRequest('This group is closed')
  if (input.kind === 'LINK' && m.role !== 'OWNER') throw forbidden('Only the group owner can create a join link')
  const token = newToken()
  const base = { groupId, kind: input.kind, createdById: userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) }
  const row = await db.$transaction(async (tx) => {
    if (input.kind === 'USER') {
      if (!input.handle) throw badRequest('Enter a handle', { handle: 'is required' })
      const p = await tx.userProfile.findUnique({ where: { handle: input.handle.toLowerCase() }, include: { user: true } })
      if (!p || p.user.status !== 'ACTIVE' || (await isBlockedEitherWay(userId, p.userId))) throw notFound('User')
      const existing = await tx.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: p.userId } } })
      if (existing?.status === 'ACTIVE') throw conflict('They are already in this group')
      const inv = await tx.groupInvitation.create({ data: { ...base, invitedUserId: p.userId }, include: { invitedUser: { include: { profile: true } } } })
      await enqueue(tx, 'GroupInvitationCreated', { invitationId: inv.id, groupId, invitedUserId: p.userId, inviterId: userId })
      return inv
    }
    if (input.kind === 'EMAIL') {
      if (!input.email) throw badRequest('Enter an email', { email: 'is required' })
      const inv = await tx.groupInvitation.create({ data: { ...base, invitedEmailHash: sha256(normalizeEmail(input.email)) }, include: { invitedUser: { include: { profile: true } } } })
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
  await db.groupInvitation.update({ where: { id: inv.id }, data: { status: 'REVOKED' } })
}

async function invitationByToken(token: string) {
  const inv = await db.groupInvitation.findUnique({ where: { tokenHash: sha256(token) }, include: { group: { include: { version: { include: { program: true } } } }, createdBy: { include: { profile: true } } } })
  if (!inv || inv.status !== 'PENDING' || inv.expiresAt < new Date() || inv.group.status !== 'ACTIVE') throw notFound('Invitation')
  if (inv.kind === 'LINK' && !inv.group.joinLinkEnabled) throw notFound('Invitation')
  return inv
}

export async function previewInvitation(viewerId: string | null, token: string) {
  const inv = await invitationByToken(token)
  const program = inv.group.version.program
  const mode = (await db.programAccessPolicy.findUnique({ where: { programId: program.id } }))?.accessMode ?? 'OPEN'
  const entitled = viewerId ? isProgramOwner(program, viewerId) || (await hasActiveGrant(viewerId, program.id)) : false
  return {
    groupName: inv.group.name,
    inviter: toUserSummary(inv.createdBy.profile!),
    // An invitation lets the invitee preview a private Program; it never grants its content.
    program: await programPreview(viewerId, program.id, { invited: true }),
    mode: inv.group.mode,
    startLocalDate: inv.group.startLocalDate ? fromDbDate(inv.group.startLocalDate) : null,
    canAccept: !!viewerId,
    requiresAccess: mode !== 'OPEN' && !entitled,
  }
}

export async function accept(userId: string, token: string) {
  const inv = await invitationByToken(token)
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })
  if (inv.kind === 'USER' && inv.invitedUserId !== userId) throw notFound('Invitation')
  if (inv.kind === 'EMAIL' && inv.invitedEmailHash !== sha256(user.email)) throw notFound('Invitation')
  if (await isBlockedEitherWay(userId, inv.group.ownerId)) throw notFound('Invitation')
  const program = inv.group.version.program
  const mode = (await db.programAccessPolicy.findUnique({ where: { programId: program.id } }))?.accessMode ?? 'OPEN'
  // Never bypasses entitlement: locked Programs need access first (10 §3).
  if (mode !== 'OPEN' && !isProgramOwner(program, userId) && !(await hasActiveGrant(userId, program.id))) {
    throw new AppError(mode === 'PAID' ? 'PAYMENT_REQUIRED' : 'ACCESS_REQUIRED', 'Get access to this program first')
  }
  await db.$transaction(async (tx) => {
    await tx.groupMember.upsert({
      where: { groupId_userId: { groupId: inv.groupId, userId } },
      create: { groupId: inv.groupId, userId, role: 'MEMBER', status: 'ACTIVE', joinedAt: new Date() },
      update: { status: 'ACTIVE', joinedAt: new Date() },
    })
    if (inv.kind !== 'LINK') await tx.groupInvitation.update({ where: { id: inv.id }, data: { status: 'ACCEPTED' } })
    // The invitation is the explicit authorization a PRIVATE, open Program needs (07 §5).
    if (program.visibility === 'PRIVATE' && mode === 'OPEN' && !isProgramOwner(program, userId)) {
      await tx.programAccessGrant.upsert({
        where: { source_sourceRef: { source: 'OPEN', sourceRef: `${userId}:${program.id}` } },
        create: { userId, programId: program.id, source: 'OPEN', sourceRef: `${userId}:${program.id}` },
        update: { revokedAt: null },
      })
    }
    await linkEnrollment(tx, userId, inv.group)
    await enqueue(tx, 'GroupMemberJoined', { groupId: inv.groupId, userId })
  })
  return toDetail(inv.groupId, userId)
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
    thumbnailUrl: thumbFor(p.media),
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
