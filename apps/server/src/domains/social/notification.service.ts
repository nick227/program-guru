// In-app notifications and the daily email opt-out (12-SOCIAL.md §6).
import { createHmac, timingSafeEqual } from 'crypto'
import { db } from '@project/db'
import { notFound } from '../../lib/errors'
import { afterCursor, pageArgs, pageOrder, toPage, type PageQuery } from '../../lib/paging'
import { toUserSummary } from '../users/mapper'

export async function list(userId: string, query: PageQuery) {
  const { limit, take } = pageArgs(query)
  const rows = await db.notification.findMany({
    where: { recipientId: userId, ...afterCursor(query.cursor) },
    orderBy: pageOrder,
    take,
    include: { actor: { include: { profile: true } } },
  })
  return toPage(rows, limit, (n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    actor: n.actor?.profile ? toUserSummary(n.actor.profile) : null,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt?.toISOString() ?? null,
    deepLink: n.deepLink,
  }))
}

export async function unreadCount(userId: string) {
  return { count: await db.notification.count({ where: { recipientId: userId, readAt: null } }) }
}

export async function markRead(userId: string, input: { ids?: string[]; all?: boolean }) {
  await db.notification.updateMany({
    where: { recipientId: userId, readAt: null, ...(input.all ? {} : { id: { in: input.ids ?? [] } }) },
    data: { readAt: new Date() },
  })
}

const secret = () => process.env.EMAIL_LINK_SECRET ?? process.env.SESSION_SECRET ?? 'dev-only-email-secret'

/** One-click unsubscribe token for the daily reminder email: does not expire, only opts out. */
export function unsubscribeToken(userId: string) {
  return `${userId}.${createHmac('sha256', secret()).update(`unsubscribe:${userId}`).digest('base64url')}`
}

export async function unsubscribe(token: string) {
  const [userId, sig] = token.split('.')
  if (!userId || !sig) throw notFound('Subscription')
  const expected = Buffer.from(unsubscribeToken(userId).split('.')[1]!)
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw notFound('Subscription')
  await db.userPreference.updateMany({ where: { userId }, data: { dailyEmailEnabled: false } })
}
