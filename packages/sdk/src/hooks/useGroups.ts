import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import type { components } from '../generated/types'
import { useApiMutation } from './mutation'
import { useViewerKey } from './viewerKey'

type S = components['schemas']

export function useMyGroups(enabled = true) {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.groups),
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/groups', {
          signal,
          params: { query: { cursor: pageParam, limit: 20 } },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

export function useCreateGroup() {
  return useApiMutation(
    async (body: S['CreateGroupInput']) =>
      apiData(await getApiClient().POST('/groups', { body })).data,
    [keys.groups, keys.programs, keys.enrollments, keys.discover],
  )
}

export function useProgramGroups(
  programId: string,
  opts: { timing?: S['DiscoverTiming']; enabled?: boolean } = {},
) {
  const timing = opts.timing ?? 'ALL'
  const enabled = (opts.enabled ?? true) && !!programId
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.programGroups(programId, timing)),
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/programs/{programId}/groups', {
          signal,
          params: {
            path: { programId },
            query: {
              cursor: pageParam,
              limit: 10,
              timing: timing === 'ALL' ? undefined : timing,
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

export function useActivityGroups(
  activityId: string,
  opts: { programId?: string; enabled?: boolean } = {},
) {
  const programId = opts.programId || undefined
  const enabled = (opts.enabled ?? true) && !!activityId
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.activityGroups(activityId, programId ?? '')),
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/activities/{activityId}/groups', {
          signal,
          params: {
            path: { activityId },
            query: {
              cursor: pageParam,
              limit: 10,
              programId,
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

export function usePublicGroupPreview(groupId: string, enabled = true) {
  return useQuery({
    queryKey: useViewerKey(keys.publicGroupPreview(groupId)),
    enabled: !!groupId && enabled,
    retry: false,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/groups/{groupId}/preview', {
          signal,
          params: { path: { groupId } },
        }),
      ).data,
  })
}

export function useJoinPublicGroup(groupId: string) {
  return useApiMutation(
    async (enrollment?: S['AcceptGroupInvitationInput']['enrollment']) =>
      apiData(
        await getApiClient().POST('/groups/{groupId}/join', {
          params: { path: { groupId } },
          body: enrollment ? { enrollment } : undefined,
        }),
      ).data,
    [
      keys.groups,
      keys.group(groupId),
      keys.publicGroupPreview(groupId),
      keys.programs,
      keys.discover,
      keys.enrollments,
      keys.calendar,
      keys.occurrences,
    ],
  )
}

export function useJoinPublicGroupById() {
  return useApiMutation(
    async ({
      groupId,
      enrollment,
    }: {
      groupId: string
      enrollment?: S['AcceptGroupInvitationInput']['enrollment']
    }) =>
      apiData(
        await getApiClient().POST('/groups/{groupId}/join', {
          params: { path: { groupId } },
          body: enrollment ? { enrollment } : undefined,
        }),
      ).data,
    [keys.groups, keys.programs, ['activities'], keys.discover, keys.enrollments, keys.calendar, keys.occurrences],
  )
}

export function useGroup(groupId: string) {
  return useQuery({
    queryKey: useViewerKey(keys.group(groupId)),
    enabled: !!groupId,
    retry: false,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/groups/{groupId}', {
          signal,
          params: { path: { groupId } },
        }),
      ).data,
  })
}

export function useUpdateGroup(groupId: string) {
  return useApiMutation(
    async (body: S['UpdateGroupInput']) =>
      apiData(
        await getApiClient().PATCH('/groups/{groupId}', {
          params: { path: { groupId } },
          body,
        }),
      ).data,
    [keys.groups, keys.group(groupId), keys.publicGroupPreview(groupId), keys.groupInvitations(groupId), keys.discover, keys.programs],
  )
}

export function useUpdateMyGroupMembership(groupId: string) {
  return useApiMutation(
    async (body: S['UpdateMyMembershipInput']) =>
      apiData(
        await getApiClient().PATCH('/groups/{groupId}/members/me', {
          params: { path: { groupId } },
          body,
        }),
      ).data,
    [
      keys.groups,
      keys.group(groupId),
      keys.enrollments,
      keys.programs,
      keys.calendar,
      keys.occurrences,
    ],
  )
}

export function useRemoveGroupMember(groupId: string) {
  return useApiMutation(
    async (userId: string) =>
      apiData(
        await getApiClient().DELETE('/groups/{groupId}/members/{userId}', {
          params: { path: { groupId, userId } },
        }),
      ).data,
    [
      keys.groups,
      keys.group(groupId),
      keys.groupInvitations(groupId),
      keys.groupCompletions(groupId),
      keys.calendar,
      keys.occurrences,
    ],
  )
}

export function useGroupInvitations(groupId: string, enabled = true) {
  return useQuery({
    queryKey: useViewerKey(keys.groupInvitations(groupId)),
    enabled: !!groupId && enabled,
    retry: false,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/groups/{groupId}/invitations', {
          signal,
          params: { path: { groupId } },
        }),
      ).data,
  })
}

export function useCreateGroupInvitation(groupId: string) {
  return useApiMutation(
    async (body: S['InviteToGroupInput']) =>
      apiData(
        await getApiClient().POST('/groups/{groupId}/invitations', {
          params: { path: { groupId } },
          body,
        }),
      ).data,
    [keys.groupInvitations(groupId), keys.group(groupId)],
  )
}

export function useRevokeGroupInvitation(groupId: string) {
  return useApiMutation(
    async (invitationId: string) =>
      apiData(
        await getApiClient().DELETE(
          '/groups/{groupId}/invitations/{invitationId}',
          {
            params: { path: { groupId, invitationId } },
          },
        ),
      ).data,
    [keys.groupInvitations(groupId)],
  )
}

export function useGroupInvitation(token: string) {
  return useQuery({
    queryKey: useViewerKey(keys.groupInvitation(token)),
    enabled: !!token,
    retry: false,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/group-invitations/{token}', {
          signal,
          params: { path: { token } },
        }),
      ).data,
  })
}

export function useAcceptGroupInvitation() {
  return useApiMutation(
    async (
      input:
        | string
        | {
            token: string
            enrollment?: S['AcceptGroupInvitationInput']['enrollment']
          },
    ) => {
      const token = typeof input === 'string' ? input : input.token
      const body =
        typeof input === 'string' || !input.enrollment
          ? undefined
          : { enrollment: input.enrollment }
      return apiData(
        await getApiClient().POST('/group-invitations/{token}/accept', {
          params: { path: { token } },
          body,
        }),
      ).data
    },
    [
      keys.groups,
      keys.myGroupInvitations,
      keys.programs,
      keys.enrollments,
      keys.calendar,
      keys.occurrences,
      keys.notifications,
      keys.unreadCount,
    ],
  )
}

export function useDeclineGroupInvitation() {
  return useApiMutation(
    async (token: string) =>
      apiData(
        await getApiClient().POST('/group-invitations/{token}/decline', {
          params: { path: { token } },
        }),
      ).data,
    [keys.myGroupInvitations, keys.notifications, keys.unreadCount],
  )
}

export function useMyGroupInvitations(enabled = true) {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.myGroupInvitations),
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/users/me/group-invitations', {
          signal,
          params: { query: { cursor: pageParam, limit: 20 } },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

export function useAcceptMyGroupInvitation() {
  return useApiMutation(
    async (
      input:
        | string
        | {
            invitationId: string
            enrollment?: S['AcceptGroupInvitationInput']['enrollment']
          },
    ) => {
      const invitationId =
        typeof input === 'string' ? input : input.invitationId
      const body =
        typeof input === 'string' || !input.enrollment
          ? undefined
          : { enrollment: input.enrollment }
      return apiData(
        await getApiClient().POST(
          '/users/me/group-invitations/{invitationId}/accept',
          {
            params: { path: { invitationId } },
            body,
          },
        ),
      ).data
    },
    [
      keys.groups,
      keys.myGroupInvitations,
      keys.programs,
      keys.enrollments,
      keys.calendar,
      keys.occurrences,
      keys.notifications,
      keys.unreadCount,
    ],
  )
}

export function useDeclineMyGroupInvitation() {
  return useApiMutation(
    async (invitationId: string) =>
      apiData(
        await getApiClient().POST(
          '/users/me/group-invitations/{invitationId}/decline',
          {
            params: { path: { invitationId } },
          },
        ),
      ).data,
    [keys.myGroupInvitations, keys.notifications, keys.unreadCount],
  )
}

export function useGroupCompletions(groupId: string, occurrenceKey?: string) {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.groupCompletions(groupId, occurrenceKey ?? '')),
    enabled: !!groupId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/groups/{groupId}/completions', {
          signal,
          params: {
            path: { groupId },
            query: {
              cursor: pageParam,
              limit: 20,
              occurrenceKey: occurrenceKey || undefined,
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

export function useGroupMedia(
  groupId: string,
  enabled = true,
  occurrenceKey?: string,
) {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.groupMedia(groupId, occurrenceKey ?? '')),
    enabled: !!groupId && enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/groups/{groupId}/media', {
          signal,
          params: {
            path: { groupId },
            query: {
              cursor: pageParam,
              limit: 20,
              occurrenceKey: occurrenceKey || undefined,
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

export function useAddCompletionReaction() {
  return useApiMutation(
    async ({
      shareId,
      emoji,
      idempotencyKey,
    }: {
      shareId: string
      emoji: string
      idempotencyKey?: string
    }) =>
      apiData(
        await getApiClient().POST('/completion-shares/{shareId}/reactions', {
          params: { path: { shareId } },
          body: { emoji, idempotencyKey },
        }),
      ).data,
    [keys.groups, keys.occurrences, keys.calendar],
  )
}

export function useRemoveCompletionReaction() {
  return useApiMutation(
    async ({ shareId, emoji }: { shareId: string; emoji: string }) =>
      apiData(
        await getApiClient().DELETE(
          '/completion-shares/{shareId}/reactions/{emoji}',
          {
            params: { path: { shareId, emoji } },
          },
        ),
      ).data,
    [keys.groups, keys.occurrences, keys.calendar],
  )
}

export function useMediaPublicationDetail(publicationId: string) {
  return useQuery({
    queryKey: useViewerKey(keys.mediaPublication(publicationId)),
    enabled: !!publicationId,
    retry: false,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/media-publications/{publicationId}', {
          signal,
          params: { path: { publicationId } },
        }),
      ).data,
  })
}

export function useMediaComments(publicationId: string) {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.mediaComments(publicationId)),
    enabled: !!publicationId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET(
          '/media-publications/{publicationId}/comments',
          {
            signal,
            params: {
              path: { publicationId },
              query: { cursor: pageParam, limit: 20 },
            },
          },
        ),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

export function useAddMediaComment(publicationId: string) {
  return useApiMutation(
    async (body: S['AddCommentInput']) =>
      apiData(
        await getApiClient().POST(
          '/media-publications/{publicationId}/comments',
          {
            params: { path: { publicationId } },
            body,
          },
        ),
      ).data,
    [keys.mediaComments(publicationId), keys.mediaPublication(publicationId)],
  )
}

export function useCreateCheckIns() {
  return useApiMutation(
    async (body: S['CreateCheckInInput']) =>
      apiData(await getApiClient().POST('/check-ins', { body })).data,
    [keys.groups, keys.occurrences, keys.discover, keys.programs, ['activities']],
  )
}

export function useCompletionComments(shareId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.completionComments(shareId)),
    enabled: enabled && !!shareId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/completion-shares/{shareId}/comments', {
          signal,
          params: {
            path: { shareId },
            query: { cursor: pageParam, limit: 20 },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

export function useAddCompletionComment(shareId: string) {
  return useApiMutation(
    async (body: S['AddCommentInput']) =>
      apiData(
        await getApiClient().POST('/completion-shares/{shareId}/comments', {
          params: { path: { shareId } },
          body,
        }),
      ).data,
    [keys.completionComments(shareId), keys.groups, keys.occurrences],
  )
}

export function useDeleteCompletionComment(shareId: string) {
  return useApiMutation(
    async (commentId: string) =>
      apiData(
        await getApiClient().DELETE('/completion-comments/{commentId}', {
          params: { path: { commentId } },
        }),
      ).data,
    [keys.completionComments(shareId), keys.groups, keys.occurrences],
  )
}

export function useLiveSessions(enabled = true) {
  return useQuery({
    queryKey: useViewerKey(keys.liveSessions),
    enabled,
    refetchInterval: enabled ? 10_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/groups/live', {
          signal,
        }),
      ).data,
  })
}

export async function heartbeatGroupPresence(
  groupId: string,
  activityTitle?: string,
) {
  return apiData(
    await getApiClient().PUT('/groups/{groupId}/presence', {
      params: { path: { groupId } },
      body: activityTitle ? { activityTitle } : undefined,
    }),
  ).data
}

export async function leaveGroupPresence(groupId: string, beacon = false) {
  if (beacon) {
    await getApiClient().POST('/groups/{groupId}/presence/leave', {
      params: { path: { groupId } },
      keepalive: true,
    })
    return
  }
  await getApiClient().DELETE('/groups/{groupId}/presence', {
    params: { path: { groupId } },
  })
}
