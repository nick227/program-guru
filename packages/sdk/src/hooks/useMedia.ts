import { useRef, useState } from 'react'
import {
  mediaTarget,
  type MediaContext,
  type MediaLibraryFilters,
} from '../media'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import type { components } from '../generated/types'
import { useApiMutation } from './mutation'
import { useViewerKey } from './viewerKey'

type S = components['schemas']

export function useMyMedia(q = '') {
  return useMediaLibrary({ source: 'mine', q })
}
export function usePlatformMedia(q = '') {
  return useMediaLibrary({ source: 'platform', q })
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
    [
      keys.media,
      keys.occurrences,
      keys.programs,
      ['activities'],
      ['users'],
      keys.me,
    ],
  )
}

/** PUT binary bytes to a local or signed upload URL, then complete. */
export async function putUploadContent(
  ticket: S['UploadTicket'],
  file: Blob,
): Promise<void> {
  const headers = new Headers(ticket.headers ?? {})
  const res = await fetch(ticket.uploadUrl, {
    method: ticket.method ?? 'PUT',
    headers,
    body: file,
    credentials: 'omit',
  })
  if (!res.ok) throw new Error(`Upload failed (${res.status}). Try again.`)
}

/** One library, filtered projections. Poll only while assets are unfinished. */
export function useMediaLibrary(filters: MediaLibraryFilters = {}) {
  const { source = 'mine', q: search, type } = filters
  const q = search?.trim() || undefined
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.mediaLibrary({ source, q, type })),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET(
          source === 'mine' ? '/media/mine' : '/media/platform',
          {
            signal,
            params: { query: { q, type, cursor: pageParam, limit: 24 } },
          },
        ),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) =>
        page.data.some(
          (asset) =>
            asset.state === 'PROCESSING' || asset.state === 'UPLOADING',
        ),
      )
        ? 3000
        : false,
  })
}
export function useMediaUrl(mediaId: string, publicationId?: string) {
  return useQuery({
    queryKey: useViewerKey(keys.mediaUrl(mediaId, publicationId)),
    enabled: !!mediaId,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/media/{mediaId}/url', {
          signal,
          params: { path: { mediaId }, query: { publicationId } },
        }),
      ).data,
  })
}
const mediaChanges = [
  keys.media,
  keys.occurrences,
  keys.programs,
  ['activities'],
  ['users'],
  keys.me,
  ['sessions'],
]
export const useAttachMedia = useCreateMediaAttachment
export function useDetachMedia() {
  return useApiMutation(
    async (attachmentId: string) =>
      apiData(
        await getApiClient().DELETE('/media-attachments/{attachmentId}', {
          params: { path: { attachmentId } },
        }),
      ),
    mediaChanges,
  )
}
export function useMediaPublication() {
  return useApiMutation(
    async (body: S['PublishMediaInput']) =>
      apiData(await getApiClient().POST('/media-publications', { body })).data,
    mediaChanges,
  )
}
export function useRevokeMediaPublication() {
  return useApiMutation(
    async (publicationId: string) =>
      apiData(
        await getApiClient().DELETE('/media-publications/{publicationId}', {
          params: { path: { publicationId } },
        }),
      ).data,
    mediaChanges,
  )
}
/** Retry resumes the failed stage; completion retries never send the bytes again. */
export function useMediaUpload(defaultOptions?: {
  target?: S['AttachmentTarget']
  purpose?: S['MediaPurpose']
}) {
  const create = useCreateMediaUpload()
  const complete = useCompleteMediaUpload()
  const pending = useRef<{
    file: File
    ticket?: S['UploadTicket']
    uploaded?: boolean
    target?: S['AttachmentTarget']
    purpose?: S['MediaPurpose']
  }>()
  const running = useRef(false)
  const [mediaId, setMediaId] = useState('')
  const asset = useMediaAsset(mediaId)
  const [stage, setStage] = useState<
    'idle' | 'uploading' | 'processing' | 'ready' | 'failed'
  >('idle')
  const [error, setError] = useState<Error | null>(null)
  async function upload(
    file?: File,
    options?: { target?: S['AttachmentTarget']; purpose?: S['MediaPurpose'] },
  ) {
    if (running.current) return
    const target = options?.target ?? defaultOptions?.target
    const purpose = options?.purpose ?? defaultOptions?.purpose
    if (file) pending.current = { file, target, purpose }
    const job = pending.current
    if (!job) return
    running.current = true
    setMediaId('')
    setStage('uploading')
    setError(null)
    try {
      if (!job.ticket)
        job.ticket = await create.mutateAsync({
          filename: job.file.name,
          mime: job.file.type,
          sizeBytes: job.file.size,
          ...(job.target ? { target: job.target } : {}),
          ...(job.purpose ? { purpose: job.purpose } : {}),
        })
      if (job.file.size > job.ticket.maxBytes)
        throw new Error('File exceeds the upload limit. Choose a smaller file.')
      if (!job.uploaded) {
        if (Date.parse(job.ticket.expiresAt) <= Date.now())
          throw new Error(
            'Upload expired. Select the file again to start a new upload.',
          )
        await putUploadContent(job.ticket, job.file)
        job.uploaded = true
      }
      const asset = await complete.mutateAsync(job.ticket.uploadId)
      setStage(
        asset.state === 'READY'
          ? 'ready'
          : asset.state === 'FAILED' || asset.state === 'BLOCKED'
            ? 'failed'
            : 'processing',
      )
      setMediaId(asset.id)
      pending.current = undefined
      return asset
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Upload failed'))
      setStage('failed')
      return undefined
    } finally {
      running.current = false
    }
  }
  const currentStage =
    asset.data?.state === 'READY'
      ? 'ready'
      : ['FAILED', 'BLOCKED'].includes(asset.data?.state ?? '')
        ? 'failed'
        : stage
  return {
    upload,
    retry: () => (pending.current ? upload() : asset.refetch()),
    stage: currentStage,
    error: error ?? asset.error,
    busy: stage === 'uploading',
    assetState: asset.data?.state,
    canRetry: !!pending.current || !!asset.error,
    mediaId,
  }
}

/** Shared headless inbound-media controller for target-bound or library uploads. */
export function useInboundMedia(defaultOptions?: {
  target?: S['AttachmentTarget']
  purpose?: S['MediaPurpose']
  onSuccess?: (asset: S['MediaAsset']) => void
  onError?: (err: unknown) => void
}) {
  const upload = useMediaUpload(defaultOptions)
  return {
    ...upload,
    upload: async (
      file?: File,
      options?: { target?: S['AttachmentTarget']; purpose?: S['MediaPurpose'] },
    ) => {
      const merged = { ...defaultOptions, ...options }
      const res = await upload.upload(file, merged)
      if (res) {
        defaultOptions?.onSuccess?.(res)
      } else if (upload.error) {
        defaultOptions?.onError?.(upload.error)
      }
      return res
    },
  }
}

/** Resolve or create the default unassigned result entry for an attempt session. */
export async function getOrCreateSessionResultEntry(sessionId: string): Promise<string> {
  const detail = apiData(
    await getApiClient().GET('/sessions/{sessionId}', {
      params: { path: { sessionId } },
    }),
  ).data
  const entry =
    detail.entries.find((entry) => entry.instructionId === null) ??
    apiData(
      await getApiClient().POST('/sessions/{sessionId}/results', {
        params: { path: { sessionId } },
        body: { values: [] },
      }),
    ).data
  return entry.id
}

export function useMediaAsset(mediaId: string) {
  return useQuery({
    queryKey: useViewerKey(keys.mediaAsset(mediaId)),
    enabled: !!mediaId,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/media/{mediaId}', {
          signal,
          params: { path: { mediaId } },
        }),
      ).data,
    retry: false,
    refetchInterval: (query) =>
      ['UPLOADING', 'PROCESSING'].includes(query.state.data?.state ?? '')
        ? 3000
        : false,
  })
}
export function useUpdateMedia() {
  return useApiMutation(
    async ({ mediaId, alt }: { mediaId: string; alt: string }) =>
      apiData(
        await getApiClient().PATCH('/media/{mediaId}', {
          params: { path: { mediaId } },
          body: { alt },
        }),
      ).data,
    mediaChanges,
  )
}
export function useDeleteMedia() {
  return useApiMutation(
    async (mediaId: string) =>
      apiData(
        await getApiClient().DELETE('/media/{mediaId}', {
          params: { path: { mediaId } },
        }),
      ),
    mediaChanges,
  )
}

/** Server-owned attachment links; thumbnails are never treated as attachment IDs. */
export function useMediaAttachments(context?: MediaContext) {
  const target = context ? mediaTarget(context) : undefined
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.mediaAttachments(context)),
    enabled: !!target,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      if (!target) throw new Error('An attachment target is required')
      return apiData(
        await getApiClient().GET('/media-attachments', {
          signal,
          params: {
            query: {
              targetKind: target.kind,
              targetId: target.id,
              cursor: pageParam,
              limit: 24,
            },
          },
        }),
      )
    },
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}
export function useMediaSession(sessionId?: string) {
  return useQuery({
    queryKey: useViewerKey(keys.session(sessionId ?? '')),
    enabled: !!sessionId,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/sessions/{sessionId}', {
          signal,
          params: { path: { sessionId: sessionId! } },
        }),
      ).data,
  })
}
/** Resolve the persisted result entry on every attempt, including after a failed attachment/reload. */
export function useAttachSessionMedia() {
  return useApiMutation(
    async ({ sessionId, mediaId }: { sessionId: string; mediaId: string }) => {
      const detail = apiData(
        await getApiClient().GET('/sessions/{sessionId}', {
          params: { path: { sessionId } },
        }),
      ).data
      const entry =
        detail.entries.find((entry) => entry.instructionId === null) ??
        apiData(
          await getApiClient().POST('/sessions/{sessionId}/results', {
            params: { path: { sessionId } },
            body: { values: [] },
          }),
        ).data
      return apiData(
        await getApiClient().POST('/media-attachments', {
          body: {
            mediaId,
            target: { kind: 'RESULT_ENTRY', id: entry.id },
            purpose: 'JOURNAL',
          },
        }),
      ).data
    },
    mediaChanges,
    'attach-session-media',
  )
}

/** Private Activity history, including older attempts and occurrences. */
export function useActivityMyMedia(
  activityId: string,
  filters: { calendarItemId?: string; type?: S['MediaType'] } = {},
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.activityMyMedia(activityId, filters)),
    enabled: enabled && !!activityId,
    initialPageParam: undefined as string | undefined,
    retry: false,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/activities/{activityId}/my-media', {
          signal,
          params: {
            path: { activityId },
            query: { ...filters, cursor: pageParam, limit: 24 },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

/** Attempt identities remain available even when their last attachment is removed. */
export function useActivityMyAttempts(activityId: string, calendarItemId?: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.activityMyAttempts(activityId, calendarItemId)),
    enabled: enabled && !!activityId,
    initialPageParam: undefined as string | undefined,
    retry: false,
    queryFn: async ({ pageParam, signal }) => apiData(
      await getApiClient().GET('/activities/{activityId}/my-attempts', {
        signal,
        params: { path: { activityId }, query: { calendarItemId, cursor: pageParam, limit: 24 } },
      }),
    ),
    getNextPageParam: last => last.meta.nextCursor ?? undefined,
  })
}

/** Public approved media publications for an Activity. */
export function useActivityPublicMedia(
  activityId: string,
  programId?: string,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.activityPublicMedia(activityId, programId)),
    enabled: enabled && !!activityId,
    initialPageParam: undefined as string | undefined,
    retry: false,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/activities/{activityId}/public-media', {
          signal,
          params: {
            path: { activityId },
            query: { programId, cursor: pageParam, limit: 24 },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}
