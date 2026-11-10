// Administrative audit (12-SOCIAL §7a): one ModerationAction per admin change. A null actor is a
// server-side command (initial admin bootstrap).
import { db, type Prisma } from '@project/db'

type Client = Prisma.TransactionClient | typeof db
export type AuditTarget = 'PROGRAM' | 'ACTIVITY' | 'MEDIA' | 'COMMENT' | 'USER'
export type AuditAction = Prisma.ModerationActionCreateInput['action']

export function audit(client: Client, actorId: string | null, targetType: AuditTarget, targetId: string, action: AuditAction, reason: string) {
  return client.moderationAction.create({ data: { moderatorId: actorId, targetType, targetId, action, reason: reason.slice(0, 500) } })
}
