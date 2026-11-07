// 05-ARCHITECTURE.md §11: events are written in the same transaction as the change they describe.
// apps/worker delivers each at least once, so every consumer must be idempotent.
import type { Prisma } from '@project/db'

export type OutboxEventType =
  | 'EmailVerificationRequested'
  | 'PasswordResetRequested'
  | 'FollowRequestReceived'
  | 'FollowAccepted'
  | 'SessionFinished'
  | 'CompletionUndone'
  | 'CompletionShared'
  | 'CompletionReacted'
  | 'GroupInvitationCreated'
  | 'GroupMemberJoined'
  | 'GroupMediaShared'
  | 'GroupMediaCommented'
  | 'MediaUploaded'
  | 'MediaPublicationModerated'
  | 'ProgramAccessGranted'
  | 'ProgramVersionPublished'
  | 'EnrollmentCreated'
  | 'AchievementEarned'

export async function enqueue(tx: Prisma.TransactionClient, type: OutboxEventType, payload: Record<string, unknown>) {
  await tx.outboxEvent.create({ data: { type, payload: payload as Prisma.InputJsonValue } })
}
