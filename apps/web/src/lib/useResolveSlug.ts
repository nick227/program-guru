import { useResolveSlugQuery } from '@project/sdk'

export interface ResolvedProgram {
  programId: string
  canonicalSlug: string | null
  creatorHandle: string | null
  isAlias: boolean
  canonicalUrl: string | null
  isLoading: boolean
  notFound: boolean
}

export interface ResolvedActivity {
  activityId: string
  canonicalSlug: string | null
  isAlias: boolean
  canonicalUrl: string | null
  isLoading: boolean
  notFound: boolean
}

export function useResolveProgramTarget(
  slugOrId: string,
  creatorHandle?: string | null,
): ResolvedProgram {
  const directId = !creatorHandle && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId)
  const query = useResolveSlugQuery('PROGRAM', slugOrId, creatorHandle, !!slugOrId && !directId)
  // UUID routes already identify the resource; the preview endpoint enforces access.
  if (directId) return { programId: slugOrId, canonicalSlug: null, creatorHandle: null, isAlias: false, canonicalUrl: null, isLoading: false, notFound: false }


  if (!slugOrId) {
    return {
      programId: '',
      canonicalSlug: null,
      creatorHandle: null,
      isAlias: false,
      canonicalUrl: null,
      isLoading: false,
      notFound: true,
    }
  }

  if (query.isPending) {
    return {
      programId: '',
      canonicalSlug: null,
      creatorHandle: creatorHandle ?? null,
      isAlias: false,
      canonicalUrl: null,
      isLoading: true,
      notFound: false,
    }
  }

  if (query.isError || !query.data) {
    return {
      programId: '',
      canonicalSlug: null,
      creatorHandle: creatorHandle ?? null,
      isAlias: false,
      canonicalUrl: null,
      isLoading: false,
      notFound: true,
    }
  }

  const data = query.data
  return {
    programId: data.id,
    canonicalSlug: data.canonicalSlug,
    creatorHandle: data.creatorHandle,
    isAlias: data.isAlias,
    canonicalUrl: data.canonicalUrl,
    isLoading: false,
    notFound: false,
  }
}

export function useResolveActivityTarget(slugOrId: string): ResolvedActivity {
  const query = useResolveSlugQuery('ACTIVITY', slugOrId, null, !!slugOrId)

  if (!slugOrId) {
    return {
      activityId: '',
      canonicalSlug: null,
      isAlias: false,
      canonicalUrl: null,
      isLoading: false,
      notFound: true,
    }
  }

  if (query.isPending) {
    return {
      activityId: '',
      canonicalSlug: null,
      isAlias: false,
      canonicalUrl: null,
      isLoading: true,
      notFound: false,
    }
  }

  if (query.isError || !query.data) {
    return {
      activityId: '',
      canonicalSlug: null,
      isAlias: false,
      canonicalUrl: null,
      isLoading: false,
      notFound: true,
    }
  }

  const data = query.data
  return {
    activityId: data.id,
    canonicalSlug: data.canonicalSlug,
    isAlias: data.isAlias,
    canonicalUrl: data.canonicalUrl,
    isLoading: false,
    notFound: false,
  }
}
