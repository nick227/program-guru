// Who may read an Activity (08-ACTIVITIES.md §6, 07-PROGRAMS.md §6).
import { db, type Activity } from '@project/db'

export function isOwner(activity: Pick<Activity, 'creatorId'>, viewerId: string | null) {
  return !!viewerId && activity.creatorId === viewerId
}

/** Discoverable by anyone: published, PUBLIC or UNLISTED (direct link), not moderated. */
export function isOpenlyReadable(a: Pick<Activity, 'status' | 'visibility' | 'moderatedAt' | 'latestPublishedRevisionId'>) {
  return a.status === 'PUBLISHED' && a.visibility !== 'PRIVATE' && !a.moderatedAt && !!a.latestPublishedRevisionId
}

/** Usable in someone else's Program or copy: readable and actually published. */
export function canUseActivity(a: Activity, viewerId: string | null) {
  return isOwner(a, viewerId) || isOpenlyReadable(a)
}

/**
 * A specific revision is readable by its owner, by anyone if the Activity is openly readable and the
 * revision is published, or by a participant or entitled user of a Program Version that pins it (07 §6):
 * they read the pinned snapshot through the Program and gain no standalone access to the private Activity.
 */
export async function canReadRevision(viewerId: string | null, activity: Activity, revision: { id: string; publishedAt: Date | null }) {
  if (isOwner(activity, viewerId)) return true
  if (!revision.publishedAt) return false
  if (isOpenlyReadable(activity)) return true
  if (!viewerId) return false
  const pinned = await db.programScheduleItem.findFirst({
    where: {
      activityRevisionId: revision.id,
      version: {
        publishedAt: { not: null },
        OR: [
          { program: { creatorId: viewerId } },
          { enrollments: { some: { userId: viewerId, status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED'] } } } },
          {
            program: {
              accessGrants: { some: { userId: viewerId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } },
            },
          },
        ],
      },
    },
    select: { id: true },
  })
  return !!pinned
}
