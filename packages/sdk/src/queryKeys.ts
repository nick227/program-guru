import {
  mediaTarget,
  type MediaContext,
  type MediaLibraryFilters,
} from './media'
/** All viewer-dependent caches are cleared on login/logout; no persisted private cache. */
export const queryKeys = {
  me: ['me'] as const,
  programs: ['programs'] as const,
  mine: ['programs', 'mine'] as const,
  preview: (id: string) => ['programs', id, 'preview'] as const,
  workspace: (id: string) => ['programs', id, 'workspace'] as const,
  placements: (id: string) => ['programs', id, 'placements'] as const,
  publishCheck: (id: string) => ['programs', id, 'publish-check'] as const,
  discover: ['discover'] as const,
  discovery: (q: string) =>
    ['discover', 'list', { kind: 'PROGRAM', q }] as const,
  activities: (q: string, focusId = '') =>
    ['activities', 'list', { q, focusId }] as const,
  types: ['catalog', 'program-types'] as const,
  focuses: (id: string) => ['catalog', 'focuses', id] as const,
  calendar: ['calendar'] as const,
  week: (start: string, end: string) =>
    ['calendar', 'list', { start, end }] as const,
  occurrences: ['occurrences'] as const,
  occurrence: (id: string) => ['occurrences', id] as const,
  user: (handle: string) => ['users', handle] as const,
  userPrograms: (handle: string) => ['users', handle, 'programs'] as const,
  userActivities: (handle: string) => ['users', handle, 'activities'] as const,
  userPublications: (handle: string) =>
    ['users', handle, 'publications'] as const,
  media: ['media'] as const,
  mediaAttachments: (context?: MediaContext) =>
    ['media', 'attachments', context ? mediaTarget(context) : null] as const,
  session: (id: string) => ['sessions', id] as const,
  mediaLibrary: (filters: MediaLibraryFilters) =>
    ['media', 'library', filters] as const,
  mediaAsset: (id: string) => ['media', 'asset', id] as const,
  mediaUrl: (id: string, publicationId?: string) =>
    ['media', 'url', id, publicationId] as const,
  myMedia: (q: string) => ['media', 'mine', { q }] as const,
  platformMedia: (q: string) => ['media', 'platform', { q }] as const,
  mediaPublication: (id: string) => ['media', 'publication', id] as const,
  mediaComments: (id: string) =>
    ['media', 'publication', id, 'comments'] as const,
  notifications: ['notifications'] as const,
  unreadCount: ['notifications', 'unread'] as const,
  followRequests: ['users', 'me', 'follow-requests'] as const,
  achievements: ['achievements'] as const,
  myAchievements: ['achievements', 'me'] as const,
  userAchievements: (handle: string) =>
    ['users', handle, 'achievements'] as const,
  enrollments: ['enrollments'] as const,
  enrollment: (id: string) => ['enrollments', id] as const,
  groups: ['groups'] as const,
  group: (id: string) => ['groups', id] as const,
  groupInvitations: (id: string) => ['groups', id, 'invitations'] as const,
  groupInvitation: (token: string) => ['group-invitations', token] as const,
  myGroupInvitations: ['users', 'me', 'group-invitations'] as const,
  groupCompletions: (id: string, occurrenceKey = '') =>
    ['groups', id, 'completions', occurrenceKey] as const,
  groupMedia: (id: string, occurrenceKey = '') =>
    ['groups', id, 'media', occurrenceKey] as const,
}
