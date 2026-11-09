import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ApiError,
  queryKeys,
  useDetachMedia,
  useMediaAttachments,
  useProgramWorkspace,
  useUpdateProgram,
  type components,
} from '@project/sdk'
import type { MediaTrayItem } from '@/components/MediaTray'
import {
  localPreview,
  useMediaUploads,
  type LocalUpload,
  type UploadOptions,
} from './useMediaUploads'

type S = components['schemas']
type Link = S['MediaAttachment']

/** Each entity adapter feeds `MediaTray` the same shape. */
export type EntityMedia = {
  items: MediaTrayItem[]
  add: (files: File[]) => unknown
}

const linkStatus = (link: Link): MediaTrayItem['status'] =>
  link.mediaState === 'READY'
    ? 'ready'
    : link.mediaState === 'FAILED' || link.mediaState === 'BLOCKED'
      ? 'failed'
      : 'processing'

const fileType = (file: File): S['MediaType'] =>
  file.type.startsWith('video/') ? 'VIDEO' : 'PHOTO'

const uploadItem = (
  upload: LocalUpload,
  remove: () => unknown,
  retry: (key: string) => unknown,
): MediaTrayItem => ({
  key: upload.key,
  src: upload.previewUrl,
  type: fileType(upload.file),
  alt: upload.file.name,
  status: upload.stage,
  error: upload.error?.message,
  remove,
  retry: upload.stage === 'failed' ? () => retry(upload.key) : undefined,
})

function useLinks(context?: Parameters<typeof useMediaAttachments>[0]) {
  const links = useMediaAttachments(context)
  return {
    query: links,
    all: (links.data?.pages.flatMap((page) => page.data) ?? []).filter(
      (link) => !link.mediaDeleted,
    ),
  }
}

/** A local upload already sent: once the server lists its attachment, remove that too. */
async function detachSent(
  mediaId: string | undefined,
  links: ReturnType<typeof useLinks>['query'],
  detach: (id: string) => Promise<unknown>,
) {
  if (!mediaId) return
  const fresh = await links.refetch()
  const link = fresh.data?.pages
    .flatMap((page) => page.data)
    .find((item) => item.mediaId === mediaId)
  if (link) await detach(link.id)
}

const ACTIVITY_PURPOSES = new Set(['COVER', 'ILLUSTRATION', 'DEMONSTRATION', 'OTHER'])
const PURPOSE_ORDER = ['COVER', 'ILLUSTRATION', 'DEMONSTRATION', 'OTHER']

/**
 * Activity media = the attachments on its editable revision. New files are added as
 * demonstrations; the first visual one becomes the Activity's image (server `pickVisual`).
 */
export function useActivityMedia(revisionId: string | null): EntityMedia {
  const context = revisionId ? ({ kind: 'Activity', revisionId } as const) : undefined
  const links = useLinks(context)
  const detach = useDetachMedia()
  const uploads = useMediaUploads()

  const shown = links.all
    .filter((link) => ACTIVITY_PURPOSES.has(link.purpose))
    .sort(
      (a, b) =>
        PURPOSE_ORDER.indexOf(a.purpose) - PURPOSE_ORDER.indexOf(b.purpose) ||
        a.position - b.position,
    )
  const linked = new Set(shown.map((link) => link.mediaId))

  const items: MediaTrayItem[] = [
    ...shown.map((link): MediaTrayItem => {
      const local = uploads.uploads.find((upload) => upload.mediaId === link.mediaId)
      const ready = link.mediaState === 'READY' && !!link.media.thumbnailUrl
      return {
        mediaId: link.mediaId,
        key: link.id,
        src: ready
          ? link.media.thumbnailUrl
          : (local?.previewUrl ?? localPreview(link.mediaId) ?? null),
        type: link.media.type,
        alt: link.media.alt,
        status: local?.stage === 'failed' ? 'failed' : linkStatus(link),
        error: local?.error?.message,
        retry: local?.stage === 'failed' ? () => uploads.retry(local.key) : undefined,
        remove: async () => {
          if (local) uploads.remove(local.key)
          await detach.mutateAsync(link.id)
        },
      }
    }),
    ...uploads.uploads
      .filter((upload) => !upload.mediaId || !linked.has(upload.mediaId))
      .map((upload) =>
        uploadItem(upload, async () => {
          uploads.remove(upload.key)
          await detachSent(upload.mediaId, links.query, detach.mutateAsync)
        }, uploads.retry),
      ),
  ]

  return {
    items,
    add: (files) =>
      revisionId &&
      uploads.sendAll(files, {
        target: { kind: 'ACTIVITY_REVISION', id: revisionId },
        purpose: 'DEMONSTRATION',
      }),
  }
}

/**
 * Program cover = `coverMediaId`. An upload bound to the Program is set as its cover by
 * the server when processing finishes; the client sets it again on READY so an edit made
 * meanwhile (which bumps the draft) never leaves the new cover unapplied.
 */
export function useProgramMedia(ws: {
  id: string
  draftRevision: number
  coverUrl: string | null
  coverMedia?: components['schemas']['MediaPresentation'] | null
  title?: string
}): EntityMedia {
  const cache = useQueryClient()
  const workspace = useProgramWorkspace(ws.id)
  const update = useUpdateProgram(ws.id)
  const detach = useDetachMedia()
  const links = useLinks({ kind: 'Program', programId: ws.id })
  const revision = useRef(ws.draftRevision)
  revision.current = ws.draftRevision

  async function setCover(coverMediaId: string | null) {
    try {
      await update.mutateAsync({ coverMediaId, expectedRevision: revision.current })
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'VERSION_CONFLICT') throw error
      const fresh = (await workspace.refetch()).data
      if (!fresh) throw error
      await update.mutateAsync({ coverMediaId, expectedRevision: fresh.draftRevision })
    }
  }
  const uploads = useMediaUploads({ onReady: (asset) => setCover(asset.id) })

  const pending = links.all.filter(
    (link) => link.id.startsWith('intent-') && link.purpose === 'COVER',
  )
  // A cover sent from another page (Add Program) finishes here: refresh the Program.
  const hadPending = useRef(false)
  useEffect(() => {
    if (pending.length) hadPending.current = true
    else if (hadPending.current) {
      hadPending.current = false
      void cache.invalidateQueries({ queryKey: queryKeys.programs })
    }
  }, [pending.length, cache])

  const latestUpload = uploads.uploads.at(-1)
  let item: MediaTrayItem | undefined
  if (latestUpload)
    item = uploadItem(latestUpload, async () => {
      uploads.remove(latestUpload.key)
      await detachSent(latestUpload.mediaId, links.query, detach.mutateAsync)
    }, uploads.retry)
  else if (pending[0]) {
    const link = pending[0]
    item = {
      key: link.id,
      src: localPreview(link.mediaId) ?? null,
      type: link.media.type,
      status: linkStatus(link),
      remove: async () => {
        try {
          await detach.mutateAsync(link.id)
        } finally {
          await setCover(null)
        }
      },
    }
  } else if (ws.coverUrl)
    item = {
      key: `cover-${ws.coverUrl}`,
      src: ws.coverMedia?.posterUrl ?? ws.coverUrl,
      type: ws.coverMedia?.type ?? 'PHOTO',
      alt: ws.title ? `${ws.title} cover` : 'Program cover',
      status: 'ready',
      remove: () => setCover(null),
    }

  return {
    items: item ? [item] : [],
    add: (files) =>
      files[0] &&
      uploads.send(files[0], {
        target: { kind: 'PROGRAM', id: ws.id },
        purpose: 'COVER',
      }),
  }
}

/**
 * Media chosen before its Program or Activity exists: previews locally, then `commit`
 * sends every file bound to the new target once it has been created.
 */
export function useDraftMedia({ multiple = true }: { multiple?: boolean } = {}) {
  const [files, setFiles] = useState<{ key: string; file: File; previewUrl: string }[]>([])
  const uploads = useMediaUploads()
  const items: MediaTrayItem[] = files.map((entry) => ({
    key: entry.key,
    src: entry.previewUrl,
    type: fileType(entry.file),
    alt: entry.file.name,
    status: 'ready',
    remove: () => setFiles((list) => list.filter((item) => item.key !== entry.key)),
  }))
  return {
    items,
    files: files.map((entry) => entry.file),
    add: (added: File[]) => {
      const next = added.map((file) => ({
        key: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      }))
      setFiles((list) => (multiple ? [...list, ...next] : next.slice(0, 1)))
    },
    /** Send every chosen file to the new target. False when any file failed. */
    commit: async (options: Required<UploadOptions>) => {
      const sent = await uploads.sendAll(
        files.map((entry) => entry.file),
        options,
      )
      // Keep only the files that failed, so a retry never sends one twice.
      const failed = files.filter((_, index) => !sent[index])
      setFiles(failed)
      if (failed.length)
        throw new Error(
          `${failed.length === 1 ? 'A file' : `${failed.length} files`} could not be uploaded. Try again.`,
        )
    },
    reset: () => setFiles([]),
  }
}
