import { db, type Prisma } from '@project/db'
import { badRequest, conflict, notFound } from '../../lib/errors'
import { toPreferences, toUserMe, toUserProfile, type Relationship } from './mapper'

// Reserved so they can never collide with routes or impersonate the platform (06 §7).
const RESERVED_HANDLES = new Set([
  'me', 'admin', 'administrator', 'api', 'app', 'auth', 'billing', 'calendar', 'docs', 'explore', 'help',
  'login', 'logout', 'moderation', 'moderator', 'new', 'notifications', 'programs', 'register', 'root',
  'settings', 'signup', 'support', 'system', 'staff', 'official', 'u', 'users', 'www',
])

export function normalizeHandle(handle: string) {
  const h = handle.trim().toLowerCase()
  if (RESERVED_HANDLES.has(h)) throw badRequest('That handle is reserved', { handle: 'is reserved' })
  return h
}

export async function assertHandleAvailable(handle: string, tx: Prisma.TransactionClient = db, exceptUserId?: string) {
  const existing = await tx.userProfile.findUnique({ where: { handle }, select: { userId: true } })
  if (existing && existing.userId !== exceptUserId) throw conflict('That handle is taken')
}

/** Suggest an available handle from a name or email (buttons before typing, 03 §1). */
export async function suggestHandle(seed: string) {
  const base = seed.toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[^a-z0-9]+/, '').slice(0, 24) || 'user'
  const padded = base.length >= 3 ? base : `${base}user`
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? padded : `${padded}${Math.floor(1000 + Math.random() * 9000)}`
    if (RESERVED_HANDLES.has(candidate)) continue
    const taken = await db.userProfile.findUnique({ where: { handle: candidate }, select: { userId: true } })
    if (!taken) return candidate
  }
  throw conflict('Could not suggest a handle; choose one')
}

export async function relationshipBetween(viewerId: string | null, targetId: string): Promise<Relationship> {
  if (!viewerId || viewerId === targetId) return 'NONE'
  const [follows, outgoing, incoming] = await Promise.all([
    db.userFollow.findUnique({ where: { followerId_followedId: { followerId: viewerId, followedId: targetId } } }),
    db.followRequest.findFirst({ where: { requesterId: viewerId, targetId, status: 'PENDING' } }),
    db.followRequest.findFirst({ where: { requesterId: targetId, targetId: viewerId, status: 'PENDING' } }),
  ])
  if (follows) return 'FOLLOWING'
  if (outgoing) return 'REQUESTED'
  if (incoming) return 'INCOMING_REQUEST'
  return 'NONE'
}

/** Full public profile projection for one user, personalized for the viewer. */
export async function buildProfile(userId: string, viewerId: string | null) {
  const profile = await db.userProfile.findUnique({ where: { userId } })
  if (!profile) throw notFound('User')
  const [followerCount, followingCount, publicProgramCount, focusRows, relationship] = await Promise.all([
    db.userFollow.count({ where: { followedId: userId } }),
    db.userFollow.count({ where: { followerId: userId } }),
    db.program.count({ where: { creatorId: userId, status: 'PUBLISHED', visibility: 'PUBLIC', moderatedAt: null } }),
    // 13 §3: chips are derived from published Programs, never self-declared
    db.program.groupBy({
      by: ['focusId'],
      where: { creatorId: userId, status: 'PUBLISHED', visibility: 'PUBLIC', moderatedAt: null, focusId: { not: null } },
      _count: { focusId: true },
      orderBy: { _count: { focusId: 'desc' } },
      take: 3,
    }),
    relationshipBetween(viewerId, userId),
  ])
  const focusIds = focusRows.map((r) => r.focusId!).filter(Boolean)
  const focuses = focusIds.length ? await db.focus.findMany({ where: { id: { in: focusIds } } }) : []
  const focusChips = focusIds
    .map((id) => focuses.find((f) => f.id === id))
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({ id: f.id, label: f.label }))
  return toUserProfile(profile, { relationship, followerCount, followingCount, publicProgramCount, focusChips })
}

export async function buildMe(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { preferences: true } })
  const profile = await buildProfile(userId, userId)
  return toUserMe(user, profile, user.preferences!)
}

async function assertOwnReadyImage(userId: string, mediaId: string, field: string) {
  const asset = await db.mediaAsset.findFirst({ where: { id: mediaId, ownerId: userId, deletedAt: null } })
  if (!asset) throw badRequest('Choose one of your own images', { [field]: 'not found in your media' })
  if (asset.state !== 'READY') throw badRequest('That image is still processing', { [field]: 'is not ready' })
  if (asset.type !== 'PHOTO') throw badRequest('Choose an image', { [field]: 'must be a photo' })
}

export async function updateProfile(
  userId: string,
  input: {
    handle?: string
    displayName?: string
    bio?: string | null
    avatarMediaId?: string | null
    coverMediaId?: string | null
    visibility?: 'PUBLIC' | 'PRIVATE'
  },
) {
  const data: Prisma.UserProfileUpdateInput = {}
  if (input.handle !== undefined) {
    const handle = normalizeHandle(input.handle)
    await assertHandleAvailable(handle, db, userId)
    data.handle = handle
  }
  if (input.displayName !== undefined) data.displayName = input.displayName.trim()
  if (input.bio !== undefined) data.bio = input.bio === null ? null : input.bio.trim() || null
  if (input.avatarMediaId) await assertOwnReadyImage(userId, input.avatarMediaId, 'avatarMediaId')
  if (input.coverMediaId) await assertOwnReadyImage(userId, input.coverMediaId, 'coverMediaId')
  if (input.avatarMediaId !== undefined) {
    data.avatarMedia = input.avatarMediaId ? { connect: { id: input.avatarMediaId } } : { disconnect: true }
  }
  if (input.coverMediaId !== undefined) {
    data.coverMedia = input.coverMediaId ? { connect: { id: input.coverMediaId } } : { disconnect: true }
  }
  // 06 §5: going PUBLIC never auto-approves pending requests; going PRIVATE keeps followers.
  if (input.visibility !== undefined) data.visibility = input.visibility
  await db.userProfile.update({ where: { userId }, data })
  return buildProfile(userId, userId)
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

function assertTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    throw badRequest('Unknown timezone', { timezone: 'is not a valid IANA timezone' })
  }
}

export async function updatePreferences(
  userId: string,
  input: {
    timezone?: string
    locale?: string
    defaultVisibility?: 'PRIVATE' | 'UNLISTED' | 'PUBLIC'
    notifications?: {
      inAppReminders?: boolean
      dailyEmail?: boolean
      dailyReminderTime?: string
      groupActivity?: boolean
      followRequests?: boolean
      mutedGroupIds?: string[]
    }
  },
) {
  if (input.timezone) assertTimezone(input.timezone)
  const n = input.notifications ?? {}
  if (n.dailyReminderTime && !TIME.test(n.dailyReminderTime)) {
    throw badRequest('Use a time like 08:00', { 'notifications.dailyReminderTime': 'must be HH:mm' })
  }
  // 09 §4: changing timezone never rewrites completed logs; future items keep their local wall-clock dates.
  const prefs = await db.userPreference.update({
    where: { userId },
    data: {
      timezone: input.timezone,
      locale: input.locale,
      defaultVisibility: input.defaultVisibility,
      inAppRemindersEnabled: n.inAppReminders,
      dailyEmailEnabled: n.dailyEmail,
      dailyReminderTime: n.dailyReminderTime,
      notifyGroupActivity: n.groupActivity,
      notifyFollowRequests: n.followRequests,
      mutedGroupIds: n.mutedGroupIds === undefined ? undefined : [...new Set(n.mutedGroupIds)],
    },
  })
  return toPreferences(prefs)
}

export { assertTimezone }
