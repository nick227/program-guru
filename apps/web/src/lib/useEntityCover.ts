import {
  useAttachMedia,
  useDetachMedia,
  useMediaAttachments,
  useUpdateProgram,
} from '@project/sdk'

/**
 * Identity-image ("Change image") controllers. Each exposes the same shape so
 * `ChangeImage` stays presentation only:
 *   set(mediaId)  replace the entity's hero
 *   remove()      clear it (the shared fallback takes over)
 *   pending/error item-scoped to this entity
 */
export type CoverController = {
  set: (mediaId: string) => Promise<void>
  remove: () => Promise<void>
  hasCover: boolean
  pending: boolean
  error: unknown
}

/** Program cover = `coverMediaId` on the draft (revision-checked). */
export function useProgramCover(program: {
  id: string
  draftRevision: number
  coverUrl: string | null
}): CoverController {
  const update = useUpdateProgram(program.id)
  return {
    hasCover: !!program.coverUrl,
    pending: update.isPending,
    error: update.error,
    set: async (mediaId) => {
      await update.mutateAsync({
        coverMediaId: mediaId,
        expectedRevision: program.draftRevision,
      })
    },
    remove: async () => {
      await update.mutateAsync({
        coverMediaId: null,
        expectedRevision: program.draftRevision,
      })
    },
  }
}

/**
 * Activity hero = the single COVER attachment on its editable revision.
 * Replacing attaches the new COVER first, then detaches older COVER links,
 * so a failure never leaves the Activity without its previous image.
 */
export function useActivityCover(revisionId: string | null): CoverController {
  const context = revisionId
    ? ({ kind: 'Activity', revisionId } as const)
    : undefined
  const links = useMediaAttachments(context)
  const attach = useAttachMedia()
  const detach = useDetachMedia()
  const covers = (links.data?.pages.flatMap((page) => page.data) ?? []).filter(
    (link) => link.purpose === 'COVER',
  )
  return {
    hasCover: covers.some((link) => !link.mediaDeleted),
    pending: attach.isPending || detach.isPending || links.isPending,
    error: links.error || attach.error || detach.error,
    set: async (mediaId) => {
      if (!revisionId) throw new Error('This Activity has no editable revision.')
      const created = await attach.mutateAsync({
        mediaId,
        target: { kind: 'ACTIVITY_REVISION', id: revisionId },
        purpose: 'COVER',
        position: 0,
      })
      for (const link of covers)
        if (link.id !== created.id) await detach.mutateAsync(link.id)
    },
    remove: async () => {
      for (const link of covers) await detach.mutateAsync(link.id)
    },
  }
}
