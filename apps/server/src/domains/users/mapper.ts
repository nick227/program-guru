// Output projections for 06-USERS.md DTOs. Never return Prisma rows (05 §4).
import { emailVerificationRequired } from '../../lib/verification'
import type { User, UserPreference, UserProfile } from '@project/db'
import { mediaUrl } from '../media/urls'

export type Relationship = 'NONE' | 'FOLLOWING' | 'REQUESTED' | 'INCOMING_REQUEST'

export function toUserSummary(profile: Pick<UserProfile, 'userId' | 'handle' | 'displayName' | 'avatarMediaId'>) {
  return {
    id: profile.userId,
    handle: profile.handle,
    displayName: profile.displayName,
    avatarUrl: mediaUrl(profile.avatarMediaId),
  }
}

export function toUserProfile(
  profile: UserProfile,
  extra: {
    relationship: Relationship
    followerCount: number
    followingCount: number
    publicProgramCount: number
    focusChips: { id: string; label: string }[]
  },
) {
  return {
    ...toUserSummary(profile),
    bio: profile.bio,
    coverUrl: mediaUrl(profile.coverMediaId, 'original'),
    visibility: profile.visibility,
    ...extra,
  }
}

export function toPreferences(p: UserPreference) {
  return {
    timezone: p.timezone,
    locale: p.locale,
    defaultVisibility: p.defaultVisibility,
    notifications: {
      inAppReminders: p.inAppRemindersEnabled,
      dailyEmail: p.dailyEmailEnabled,
      dailyReminderTime: p.dailyReminderTime,
      groupActivity: p.notifyGroupActivity,
      followRequests: p.notifyFollowRequests,
      mutedGroupIds: Array.isArray(p.mutedGroupIds) ? (p.mutedGroupIds as string[]) : [],
    },
  }
}

export function toUserMe(user: User, profile: ReturnType<typeof toUserProfile>, prefs: UserPreference) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    // Whether unverified accounts are held back from publishing right now (REQUIRE_EMAIL_VERIFICATION).
    emailVerificationRequired: emailVerificationRequired(),
    status: user.status,
    role: user.role,
    profile,
    preferences: toPreferences(prefs),
    createdAt: user.createdAt.toISOString(),
  }
}
