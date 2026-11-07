// In-app notifications (12-SOCIAL.md §6). Never for one's own action; muted groups and per-type
// preferences are respected; dedupeKey makes every delivery idempotent across outbox retries.
// Payloads carry titles and deep links only, never private metrics, notes, or amounts.
import { db, type NotificationType } from '@project/db'

export type NotificationInput = {
  recipientId: string
  actorId?: string | null
  type: NotificationType
  title: string
  deepLink: string
  entityKind: string
  entityId: string
  groupId?: string | null
  groupOccurrenceKey?: string | null
  dedupeKey: string
}

const GROUP_TYPES: NotificationType[] = ['MEMBER_JOINED', 'COMPLETION_SHARED', 'COMPLETION_REACTION', 'GROUP_MEDIA_SHARED', 'GROUP_MEDIA_COMMENT', 'GROUP_INVITE']

export async function notify(n: NotificationInput) {
  if (n.actorId && n.actorId === n.recipientId) return false
  const recipient = await db.user.findUnique({ where: { id: n.recipientId }, include: { preferences: true } })
  if (!recipient || recipient.status !== 'ACTIVE') return false
  const prefs = recipient.preferences
  if (prefs && GROUP_TYPES.includes(n.type) && n.type !== 'GROUP_INVITE') {
    if (!prefs.notifyGroupActivity) return false
    const muted = Array.isArray(prefs.mutedGroupIds) ? (prefs.mutedGroupIds as string[]) : []
    if (n.groupId && muted.includes(n.groupId)) return false
  }
  if (prefs && n.type === 'FOLLOW_REQUEST' && !prefs.notifyFollowRequests) return false
  if (prefs && (n.type === 'ACTIVITY_REMINDER' || n.type === 'DAILY_SUMMARY') && !prefs.inAppRemindersEnabled) return false
  if (n.actorId) {
    const blocked = await db.userBlock.findFirst({
      where: { OR: [{ blockerId: n.recipientId, blockedId: n.actorId }, { blockerId: n.actorId, blockedId: n.recipientId }] },
    })
    if (blocked) return false
  }
  const created = await db.notification.createMany({
    data: [
      {
        recipientId: n.recipientId,
        actorId: n.actorId ?? null,
        type: n.type,
        title: n.title.slice(0, 180),
        deepLink: n.deepLink,
        entityKind: n.entityKind,
        entityId: n.entityId,
        groupOccurrenceKey: n.groupOccurrenceKey ?? null,
        dedupeKey: n.dedupeKey,
      },
    ],
    skipDuplicates: true,
  })
  return created.count > 0
}

export async function displayName(userId: string | null | undefined) {
  if (!userId) return 'Someone'
  return (await db.userProfile.findUnique({ where: { userId } }))?.displayName ?? 'Someone'
}

export async function activeGroupMembers(groupId: string, except?: string) {
  const rows = await db.groupMember.findMany({ where: { groupId, status: 'ACTIVE', ...(except ? { userId: { not: except } } : {}) }, select: { userId: true } })
  return rows.map((r) => r.userId)
}
