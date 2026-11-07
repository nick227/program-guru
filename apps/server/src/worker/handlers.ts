// Outbox consumers (05-ARCHITECTURE.md §11). Delivery is at least once, so every handler is
// idempotent: notifications carry dedupe keys, emails carry provider idempotency keys.
import { db } from '@project/db'
import { email, layout } from '../infrastructure/email'
import { activeGroupMembers, displayName, notify } from './notify'
import { processMedia } from './media'

export type OutboxEvent = { id: string; type: string; payload: Record<string, any> }
type Handler = (e: OutboxEvent) => Promise<void>

export const appUrl = (path: string) => `${(process.env.PUBLIC_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')}${path}`
export const apiUrl = (path: string) => `${(process.env.PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')}${path}`

/** Payload fields that must not outlive delivery (raw tokens, invitee addresses). */
export const SECRET_FIELDS: Record<string, string[]> = {
  EmailVerificationRequested: ['token'],
  PasswordResetRequested: ['token'],
  GroupInvitationCreated: ['token', 'email'],
}

async function emailFor(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId } })
  return u && u.status === 'ACTIVE' ? u.email : null
}

export const handlers: Record<string, Handler> = {
  async EmailVerificationRequested(e) {
    const to = await emailFor(e.payload.userId)
    if (!to || !e.payload.token) return
    const { text, html } = layout({
      heading: 'Confirm your email',
      lines: ['Confirm this address to publish programs and activities.', 'The link works for 48 hours.'],
      action: { label: 'Confirm email', url: appUrl(`/verify-email?token=${encodeURIComponent(e.payload.token)}`) },
    })
    await email().send({ to, subject: 'Confirm your email', text, html, idempotencyKey: `outbox:${e.id}` })
  },

  async PasswordResetRequested(e) {
    const to = await emailFor(e.payload.userId)
    if (!to || !e.payload.token) return
    const { text, html } = layout({
      heading: 'Reset your password',
      lines: ['Someone asked to reset the password for this account. If it was not you, ignore this email.', 'The link works for one hour.'],
      action: { label: 'Choose a new password', url: appUrl(`/reset-password?token=${encodeURIComponent(e.payload.token)}`) },
    })
    await email().send({ to, subject: 'Reset your password', text, html, idempotencyKey: `outbox:${e.id}` })
  },

  async FollowRequestReceived(e) {
    await notify({
      recipientId: e.payload.targetId,
      actorId: e.payload.requesterId,
      type: 'FOLLOW_REQUEST',
      title: 'New follow request',
      deepLink: '/settings/follow-requests',
      entityKind: 'FOLLOW_REQUEST',
      entityId: e.payload.requestId,
      dedupeKey: `${e.id}`,
    })
  },

  async FollowAccepted(e) {
    if (e.payload.direct) return // a direct follow of a public profile needs no confirmation
    const handle = (await db.userProfile.findUnique({ where: { userId: e.payload.followedId } }))?.handle
    await notify({
      recipientId: e.payload.followerId,
      actorId: e.payload.followedId,
      type: 'FOLLOW_ACCEPTED',
      title: `${await displayName(e.payload.followedId)} accepted your follow request`,
      deepLink: handle ? `/u/${handle}` : '/',
      entityKind: 'USER',
      entityId: e.payload.followedId,
      dedupeKey: `${e.id}`,
    })
  },

  async CompletionShared(e) {
    const name = await displayName(e.payload.userId)
    for (const recipientId of await activeGroupMembers(e.payload.groupId, e.payload.userId)) {
      const item = await db.calendarItem.findFirst({ where: { ownerId: recipientId, groupOccurrenceKey: e.payload.occurrenceKey }, select: { id: true } })
      await notify({
        recipientId,
        actorId: e.payload.userId,
        type: 'COMPLETION_SHARED',
        title: `${name} completed today's activity`,
        deepLink: item ? `/occurrences/${item.id}` : `/groups/${e.payload.groupId}`,
        entityKind: 'COMPLETION_SHARE',
        entityId: e.payload.shareId,
        groupId: e.payload.groupId,
        groupOccurrenceKey: e.payload.occurrenceKey,
        dedupeKey: `${e.id}:${recipientId}`,
      })
    }
  },

  async CompletionReacted(e) {
    const item = await db.calendarItem.findFirst({ where: { ownerId: e.payload.recipientId, groupOccurrenceKey: e.payload.occurrenceKey }, select: { id: true } })
    await notify({
      recipientId: e.payload.recipientId,
      actorId: e.payload.userId,
      type: 'COMPLETION_REACTION',
      title: `${await displayName(e.payload.userId)} reacted ${e.payload.emoji}`,
      deepLink: item ? `/occurrences/${item.id}` : `/groups/${e.payload.groupId}`,
      entityKind: 'COMPLETION_SHARE',
      entityId: e.payload.shareId,
      groupId: e.payload.groupId,
      groupOccurrenceKey: e.payload.occurrenceKey,
      dedupeKey: `${e.id}`,
    })
  },

  async GroupInvitationCreated(e) {
    const group = await db.programGroup.findUnique({ where: { id: e.payload.groupId }, include: { version: true } })
    if (!group) return
    const inviter = await displayName(e.payload.inviterId)
    if (e.payload.invitedUserId) {
      await notify({
        recipientId: e.payload.invitedUserId,
        actorId: e.payload.inviterId,
        type: 'GROUP_INVITE',
        title: `${inviter} invited you to ${group.name ?? group.version.title}`,
        deepLink: `/groups/${group.id}/invitations/${e.payload.invitationId}`,
        entityKind: 'GROUP_INVITATION',
        entityId: e.payload.invitationId,
        groupId: group.id,
        dedupeKey: `${e.id}`,
      })
    } else if (e.payload.email && e.payload.token) {
      const { text, html } = layout({
        heading: `${inviter} invited you to follow a program together`,
        lines: [`Join "${group.name ?? group.version.title}" and follow ${group.version.title} with friends. Your results stay private; only what you choose is shared.`],
        action: { label: 'See the invitation', url: appUrl(`/join/${encodeURIComponent(e.payload.token)}`) },
        footer: 'The invitation expires in 14 days.',
      })
      await email().send({ to: e.payload.email, subject: `${inviter} invited you`, text, html, idempotencyKey: `outbox:${e.id}` })
    }
  },

  async GroupMemberJoined(e) {
    const name = await displayName(e.payload.userId)
    for (const recipientId of await activeGroupMembers(e.payload.groupId, e.payload.userId)) {
      await notify({
        recipientId,
        actorId: e.payload.userId,
        type: 'MEMBER_JOINED',
        title: `${name} joined your group`,
        deepLink: `/groups/${e.payload.groupId}`,
        entityKind: 'GROUP',
        entityId: e.payload.groupId,
        groupId: e.payload.groupId,
        dedupeKey: `${e.id}:${recipientId}`,
      })
    }
  },

  async GroupMediaShared(e) {
    const p = await db.mediaPublication.findUnique({ where: { id: e.payload.publicationId } })
    if (!p || p.status !== 'APPROVED') return
    const name = await displayName(e.payload.userId)
    for (const recipientId of await activeGroupMembers(e.payload.groupId, e.payload.userId)) {
      await notify({
        recipientId,
        actorId: e.payload.userId,
        type: 'GROUP_MEDIA_SHARED',
        title: `${name} shared a video or photo`,
        deepLink: `/media/${p.id}`,
        entityKind: 'MEDIA_PUBLICATION',
        entityId: p.id,
        groupId: e.payload.groupId,
        groupOccurrenceKey: p.occurrenceKey,
        dedupeKey: `${e.id}:${recipientId}`,
      })
    }
  },

  async GroupMediaCommented(e) {
    await notify({
      recipientId: e.payload.recipientId,
      actorId: e.payload.authorId,
      type: 'GROUP_MEDIA_COMMENT',
      title: 'New comment on your shared media',
      deepLink: `/media/${e.payload.publicationId}`,
      entityKind: 'MEDIA_PUBLICATION',
      entityId: e.payload.publicationId,
      groupId: e.payload.groupId,
      groupOccurrenceKey: e.payload.occurrenceKey,
      dedupeKey: `${e.id}`,
    })
  },

  async MediaUploaded(e) {
    await processMedia(e.payload.mediaId)
  },

  async MediaPublicationModerated(e) {
    if (e.payload.decision !== 'APPROVE') return
    await notify({
      recipientId: e.payload.userId,
      type: 'CONTRIBUTION_APPROVED',
      title: 'Your video was approved',
      deepLink: `/media/${e.payload.publicationId}`,
      entityKind: 'MEDIA_PUBLICATION',
      entityId: e.payload.publicationId,
      dedupeKey: `${e.id}`,
    })
  },

  async ProgramAccessGranted(e) {
    const p = await db.program.findUnique({ where: { id: e.payload.programId } })
    if (!p) return
    await notify({
      recipientId: e.payload.userId,
      actorId: p.creatorId,
      type: 'PROGRAM_ACCESS',
      title: `Access granted: ${p.title}`,
      deepLink: `/programs/${p.id}`,
      entityKind: 'PROGRAM',
      entityId: p.id,
      dedupeKey: `${e.id}`,
    })
  },

  async ProgramVersionPublished(e) {
    const enrollments = await db.programEnrollment.findMany({ where: { programId: e.payload.programId, pendingVersionId: e.payload.versionId }, include: { program: true } })
    for (const en of enrollments) {
      await notify({
        recipientId: en.userId,
        actorId: en.program.creatorId,
        type: 'PROGRAM_UPDATE',
        title: `Update available: ${en.program.title}`,
        deepLink: `/programs/${en.programId}`,
        entityKind: 'ENROLLMENT',
        entityId: en.id,
        dedupeKey: `${e.id}:${en.userId}`,
      })
    }
  },

  async AchievementEarned(e) {
    const a = await db.userAchievement.findUnique({ where: { id: e.payload.achievementId }, include: { definition: true } })
    if (!a || a.revokedAt) return
    await notify({
      recipientId: a.userId,
      type: 'ACHIEVEMENT_EARNED',
      title: a.definition.label,
      deepLink: '/achievements',
      entityKind: 'ACHIEVEMENT',
      entityId: a.id,
      dedupeKey: `${e.id}`,
    })
  },

  async PaymentIssue(e) {
    await notify({
      recipientId: e.payload.userId,
      type: 'PAYMENT_ISSUE',
      title: e.payload.title ?? 'There is a problem with a payment',
      deepLink: '/settings/billing',
      entityKind: e.payload.entityKind ?? 'BILLING',
      entityId: e.payload.entityId,
      dedupeKey: `${e.id}`,
    })
  },

  // Recorded for audit and future consumers; nothing to deliver in P1.
  async SessionFinished() {},
  async EnrollmentCreated() {},
  async CompletionUndone() {},
}

