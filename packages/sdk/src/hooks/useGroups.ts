import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import type { components } from '../generated/types'
import { useApiMutation } from './mutation'
import { useViewerKey } from './viewerKey'

type S = components['schemas']

export function useMyGroups() {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.groups),
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
    [keys.groups, keys.programs, keys.enrollments],
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
    [keys.groups, keys.group(groupId)],
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
    [keys.groups, keys.group(groupId), keys.calendar, keys.occurrences],
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
    async (token: string) =>
      apiData(
        await getApiClient().POST('/group-invitations/{token}/accept', {
          params: { path: { token } },
        }),
      ).data,
    [
      keys.groups,
      keys.programs,
      keys.enrollments,
      keys.calendar,
      keys.notifications,
      keys.unreadCount,
    ],
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

