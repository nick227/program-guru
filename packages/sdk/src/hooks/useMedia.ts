import { useInfiniteQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import type { components } from '../generated/types'
import { useApiMutation } from './mutation'
import { useViewerKey } from './viewerKey'

type S = components['schemas']

export function useMyMedia(q = '') {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.myMedia(q)),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/media/mine', {
          signal,
          params: {
            query: { q: q || undefined, cursor: pageParam, limit: 24 },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

export function usePlatformMedia(q = '') {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.platformMedia(q)),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/media/platform', {
          signal,
          params: {
            query: { q: q || undefined, cursor: pageParam, limit: 24 },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

export function useCreateMediaUpload() {
  return useApiMutation(
    async (body: S['RequestUploadInput']) =>
      apiData(await getApiClient().POST('/media/uploads', { body })).data,
    [keys.media],
  )
}

export function useCompleteMediaUpload() {
  return useApiMutation(
    async (uploadId: string) =>
      apiData(
        await getApiClient().POST('/media/uploads/{uploadId}/complete', {
          params: { path: { uploadId } },
        }),
      ).data,
    [keys.media],
  )
}

export function useCreateMediaAttachment() {
  return useApiMutation(
    async (body: S['AttachMediaInput']) =>
      apiData(await getApiClient().POST('/media-attachments', { body })).data,
    [keys.media, keys.occurrences, keys.programs],
  )
}

/** PUT binary bytes to a local or signed upload URL, then complete. */
export async function putUploadContent(
  ticket: S['UploadTicket'],
  file: Blob,
): Promise<void> {
  const headers = new Headers(ticket.headers ?? {})
  if (!headers.has('content-type'))
    headers.set('content-type', 'application/octet-stream')
  const res = await fetch(ticket.uploadUrl, {
    method: ticket.method ?? 'PUT',
    headers,
    body: file,
    credentials: ticket.uploadUrl.startsWith('/') ? 'include' : 'omit',
  })
  if (!res.ok)
    throw new Error(`Upload failed (${res.status}). Try again.`)
}
