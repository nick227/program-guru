import { db } from '@project/db'
import { notFound } from '../../lib/errors'
import { offsetArgs, toOffsetPage, type PageQuery } from '../../lib/paging'
import { buildProfile } from './profile.service'
import { toUserSummary } from './mapper'

/** Users the viewer may not see: blocked either way. */
async function hiddenUserIds(viewerId: string | null) {
  if (!viewerId) return []
  const blocks = await db.userBlock.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  })
  return blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId))
}

export async function search(viewerId: string | null, query: PageQuery & { q?: string }) {
  const { limit, skip, take } = offsetArgs(query)
  const q = query.q?.trim().toLowerCase()
  const hidden = await hiddenUserIds(viewerId)
  const rows = await db.userProfile.findMany({
    where: {
      user: { status: 'ACTIVE' },
      ...(hidden.length ? { userId: { notIn: hidden } } : {}),
      ...(q ? { OR: [{ handle: { startsWith: q } }, { displayName: { contains: q } }] } : {}),
    },
    // Exact handle prefix matches first, then alphabetical.
    orderBy: [{ handle: 'asc' }],
    skip,
    take,
  })
  return toOffsetPage(rows, limit, skip, toUserSummary)
}

export async function byHandle(viewerId: string | null, handle: string) {
  const profile = await db.userProfile.findUnique({ where: { handle: handle.toLowerCase() }, include: { user: true } })
  if (!profile || profile.user.status !== 'ACTIVE') throw notFound('User')
  if ((await hiddenUserIds(viewerId)).includes(profile.userId)) throw notFound('User')
  // 06 §3: a private profile still shows identity and counts; its content lists apply their own rules.
  return buildProfile(profile.userId, viewerId)
}

export async function userIdForHandle(viewerId: string | null, handle: string) {
  const profile = await db.userProfile.findUnique({ where: { handle: handle.toLowerCase() }, include: { user: true } })
  if (!profile || profile.user.status !== 'ACTIVE') throw notFound('User')
  if ((await hiddenUserIds(viewerId)).includes(profile.userId)) throw notFound('User')
  return profile
}
