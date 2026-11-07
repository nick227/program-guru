import { useRef, useState } from 'react'
import type { MediaLibraryFilters } from '../media'
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
  if (!headers.has('content-type'))
    headers.set('content-type', 'application/octet-stream')
  const res = await fetch(ticket.uploadUrl, {
    method: ticket.method ?? 'PUT',
    headers,
    body: file,
    credentials: ticket.uploadUrl.startsWith('/') ? 'include' : 'omit',
  })
  if (!res.ok) throw new Error(`Upload failed (${res.status}). Try again.`)
}

/** One library, filtered projections. Poll only while assets are unfinished. */
export function useMediaLibrary(filters: MediaLibraryFilters = {}) {
  const { source = 'mine', q, type } = filters
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
/** Retry resumes the failed stage; completion retries never send the bytes again. */
export function useMediaUpload() {
  const create = useCreateMediaUpload()
  const complete = useCompleteMediaUpload()
  const pending = useRef<{
    file: File
    ticket?: S['UploadTicket']
    uploaded?: boolean
  }>()
  const running = useRef(false)
  const [mediaId, setMediaId] = useState('')
  const asset = useMediaAsset(mediaId)
  const [stage, setStage] = useState<
    'idle' | 'uploading' | 'processing' | 'ready' | 'failed'
  >('idle')
  const [error, setError] = useState<Error | null>(null)
  async function upload(file?: File) {
    if (running.current) return
    if (file) pending.current = { file }
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
  }
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
