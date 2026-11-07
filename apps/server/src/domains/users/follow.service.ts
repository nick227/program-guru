// 06-USERS.md §5: public profile → direct follow; private profile → request; blocks override everything.
import { db } from '@project/db'
import { badRequest, notFound } from '../../lib/errors'
import { enqueue } from '../../lib/outbox'
import { afterCursor, pageArgs, pageOrder, toPage, type PageQuery } from '../../lib/paging'
import { relationshipBetween } from './profile.service'
import { toUserSummary } from './mapper'

export async function isBlockedEitherWay(a: string, b: string) {
  const block = await db.userBlock.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
  })
  return !!block
}

async function activeTarget(viewerId: string, targetId: string) {
  if (viewerId === targetId) throw badRequest('You cannot do that to yourself')
  const target = await db.user.findUnique({ where: { id: targetId }, include: { profile: true } })
  // Blocked, suspended, or deactivated users look absent (05 §3).
  if (!target || target.status !== 'ACTIVE' || !target.profile || (await isBlockedEitherWay(viewerId, targetId))) {
    throw notFound('User')
  }
  return target
}

export async function follow(viewerId: string, targetId: string) {
  const target = await activeTarget(viewerId, targetId)
  const current = await relationshipBetween(viewerId, targetId)
  if (current === 'FOLLOWING' || current === 'REQUESTED') {
    const req = await db.followRequest.findFirst({ where: { requesterId: viewerId, targetId, status: 'PENDING' } })
    return { relationship: current, requestId: req?.id ?? null }
  }
  if (target.profile!.visibility === 'PUBLIC') {
    await db.$transaction(async (tx) => {
      await tx.userFollow.upsert({
        where: { followerId_followedId: { followerId: viewerId, followedId: targetId } },
        create: { followerId: viewerId, followedId: targetId },
        update: {},
      })
      await enqueue(tx, 'FollowAccepted', { followerId: viewerId, followedId: targetId, direct: true })
    })
    return { relationship: 'FOLLOWING' as const, requestId: null }
  }
  const request = await db.$transaction(async (tx) => {
    // Reopen the latest request for this pair rather than creating duplicates.
    const req = await tx.followRequest.upsert({
      where: { requesterId_targetId: { requesterId: viewerId, targetId } },
      create: { requesterId: viewerId, targetId },
      update: { status: 'PENDING', resolvedAt: null },
    })
    await enqueue(tx, 'FollowRequestReceived', { requestId: req.id, requesterId: viewerId, targetId })
    return req
  })
  return { relationship: 'REQUESTED' as const, requestId: request.id }
}

export async function unfollow(viewerId: string, targetId: string) {
  if (viewerId === targetId) throw badRequest('You cannot do that to yourself')
  await db.$transaction([
    db.userFollow.deleteMany({ where: { followerId: viewerId, followedId: targetId } }),
    db.followRequest.updateMany({
      where: { requesterId: viewerId, targetId, status: 'PENDING' },
      data: { status: 'CANCELLED', resolvedAt: new Date() },
    }),
  ])
  return { relationship: await relationshipBetween(viewerId, targetId), requestId: null }
}

function toFollowRequest(r: { id: string; status: any; createdAt: Date; requester: { profile: any } }) {
  return { id: r.id, requester: toUserSummary(r.requester.profile), createdAt: r.createdAt.toISOString(), status: r.status }
}

export async function listIncomingRequests(userId: string, query: PageQuery) {
  const { limit, take } = pageArgs(query)
  const rows = await db.followRequest.findMany({
    where: { targetId: userId, status: 'PENDING', ...afterCursor(query.cursor) },
    orderBy: pageOrder,
    take,
    include: { requester: { include: { profile: true } } },
  })
  return toPage(rows, limit, toFollowRequest)
}

export async function resolveRequest(userId: string, requestId: string, decision: 'APPROVED' | 'DECLINED') {
  const req = await db.followRequest.findUnique({ where: { id: requestId }, include: { requester: { include: { profile: true } } } })
  if (!req || req.targetId !== userId) throw notFound('Follow request')
  if (req.status !== 'PENDING') return toFollowRequest(req)
  // Accept creates the follow and closes the request atomically (05 §5).
  const updated = await db.$transaction(async (tx) => {
    const r = await tx.followRequest.update({
      where: { id: requestId },
      data: { status: decision, resolvedAt: new Date() },
      include: { requester: { include: { profile: true } } },
    })
    if (decision === 'APPROVED') {
      await tx.userFollow.upsert({
        where: { followerId_followedId: { followerId: req.requesterId, followedId: userId } },
        create: { followerId: req.requesterId, followedId: userId },
        update: {},
      })
      await enqueue(tx, 'FollowAccepted', { followerId: req.requesterId, followedId: userId, direct: false })
    }
    return r
  })
  return toFollowRequest(updated)
}

export async function block(userId: string, targetId: string) {
  if (userId === targetId) throw badRequest('You cannot do that to yourself')
  const target = await db.user.findUnique({ where: { id: targetId } })
  if (!target) throw notFound('User')
  // Block clears follows and pending requests in both directions (06 §2).
  await db.$transaction([
    db.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } },
      create: { blockerId: userId, blockedId: targetId },
      update: {},
    }),
    db.userFollow.deleteMany({
      where: { OR: [{ followerId: userId, followedId: targetId }, { followerId: targetId, followedId: userId }] },
    }),
    db.followRequest.updateMany({
      where: { status: 'PENDING', OR: [{ requesterId: userId, targetId }, { requesterId: targetId, targetId: userId }] },
      data: { status: 'CANCELLED', resolvedAt: new Date() },
    }),
  ])
}

export async function unblock(userId: string, targetId: string) {
  await db.userBlock.deleteMany({ where: { blockerId: userId, blockedId: targetId } })
}
