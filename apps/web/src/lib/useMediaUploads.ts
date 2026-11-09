import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  fetchMediaAsset,
  queryKeys,
  sendMediaFile,
  type components,
} from '@project/sdk'

type S = components['schemas']
export type UploadOptions = {
  target?: S['AttachmentTarget']
  purpose?: S['MediaPurpose']
}

export type LocalUpload = {
  key: string
  file: File
  options: UploadOptions
  previewUrl: string
  mediaId?: string
  stage: 'uploading' | 'processing' | 'failed'
  error?: Error
}

/**
 * Local previews by media id. Survive navigation (Add Program → Workspace) so a file
 * still processing shows the picture the user chose rather than a blank tile.
 */
const previews = new Map<string, string>()
export const localPreview = (mediaId: string) => previews.get(mediaId)

const FINISHED = new Set(['READY', 'FAILED', 'BLOCKED'])
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The one client upload flow (CLAUDE.md contract note 4): ticket → PUT → complete →
 * wait for the worker. Each file is its own row, so several upload side by side and one
 * failure never blocks the others. `send` resolves once the bytes are stored; the
 * attachment (when a target is given) is made by the server when processing finishes.
 */
export function useMediaUploads({
  onReady,
}: { onReady?: (asset: S['MediaAsset']) => void | Promise<void> } = {}) {
  const cache = useQueryClient()
  const [uploads, setUploads] = useState<LocalUpload[]>([])
  const live = useRef(true)
  const dropped = useRef(new Set<string>())
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const patch = (key: string, next: Partial<LocalUpload>) =>
    setUploads((list) =>
      list.map((item) => (item.key === key ? { ...item, ...next } : item)),
    )
  const remove = useCallback((key: string) => {
    dropped.current.add(key)
    setUploads((list) => list.filter((item) => item.key !== key))
  }, [])

  const refresh = () =>
    Promise.all(
      [queryKeys.media, queryKeys.occurrences, queryKeys.programs, ['activities']].map((queryKey) =>
        cache.invalidateQueries({ queryKey }),
      ),
    )

  async function waitForReady(key: string, asset: S['MediaAsset']) {
    let current = asset
    let delay = 1000
    while (!FINISHED.has(current.state)) {
      await wait(delay)
      if (!live.current || dropped.current.has(key)) return
      delay = Math.min(delay * 1.5, 5000)
      try {
        current = await fetchMediaAsset(current.id)
      } catch {
        /* transient: keep waiting */
      }
    }
    if (!live.current || dropped.current.has(key)) return
    if (current.state !== 'READY') {
      patch(key, {
        stage: 'failed',
        error: new Error(
          current.state === 'BLOCKED'
            ? 'This file was blocked.'
            : 'This file could not be processed. Try another file.',
        ),
      })
      return
    }
    try {
      await onReadyRef.current?.(current)
    } catch (error) {
      patch(key, {
        stage: 'failed',
        error: error instanceof Error ? error : new Error('Could not save'),
      })
      return
    }
    await refresh()
    remove(key)
  }

  async function send(file: File, options: UploadOptions = {}) {
    const key = crypto.randomUUID()
    const previewUrl = URL.createObjectURL(file)
    setUploads((list) => [
      ...list,
      { key, file, options, previewUrl, stage: 'uploading' },
    ])
    return run(key, file, options, previewUrl)
  }

  /** Each attempt starts a fresh ticket; a half-sent or failed asset is never reused. */
  async function run(
    key: string,
    file: File,
    options: UploadOptions,
    previewUrl: string,
  ) {
    try {
      const asset = await sendMediaFile(file, options)
      previews.set(asset.id, previewUrl)
      if (dropped.current.has(key)) return asset
      patch(key, { mediaId: asset.id, stage: 'processing' })
      // The pending attachment appears in target lists right away.
      await cache.invalidateQueries({ queryKey: queryKeys.media })
      void waitForReady(key, asset)
      return asset
    } catch (error) {
      patch(key, {
        stage: 'failed',
        error: error instanceof Error ? error : new Error('Upload failed'),
      })
      return undefined
    }
  }

  async function retry(key: string) {
    const upload = uploads.find((item) => item.key === key)
    if (!upload || upload.stage !== 'failed') return
    if (upload.mediaId) {
      try {
        const asset = await fetchMediaAsset(upload.mediaId)
        if (asset.state === 'READY') {
          patch(key, { stage: 'processing', error: undefined })
          await waitForReady(key, asset)
          return asset
        }
      } catch { /* Retry the upload if its asset is no longer available. */ }
    }
    patch(key, { stage: 'uploading', error: undefined, mediaId: undefined })
    return run(key, upload.file, upload.options, upload.previewUrl)
  }

  return {
    uploads,
    send,
    retry,
    /** Several files at once; resolves when every file's bytes are stored. */
    sendAll: (files: File[], options?: UploadOptions) =>
      Promise.all(files.map((file) => send(file, options))),
    remove,
  }
}

export const isMediaFile = (file: File, accept: 'image' | 'media') =>
  accept === 'image'
    ? file.type.startsWith('image/')
    : file.type.startsWith('image/') || file.type.startsWith('video/')
