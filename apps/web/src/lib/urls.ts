import { slugify } from './slugs'

export interface ProgramUrlTarget {
  id: string
  title?: string | null
  slug?: string | null
  creator?: {
    handle?: string | null
    profile?: { handle?: string | null } | null
  } | null
  creatorHandle?: string | null
}

export interface ActivityUrlTarget {
  id: string
  title?: string | null
  slug?: string | null
}

export interface ProgramUrlOptions {
  /** If true, produces creator-scoped URL `/@creator/slug` when creator handle is known */
  scoped?: boolean
  returnTo?: string | null
  groupId?: string | null
  startDate?: string | null
}

export interface ActivityUrlOptions {
  returnTo?: string | null
  /** Opens the owner editor on arrival. */
  edit?: boolean
}

/**
 * Builds the canonical public profile URL for a user handle.
 * Always uses the /@handle namespace to avoid route collisions.
 */
export function buildProfileUrl(handle: string): string {
  if (!handle) return '/'
  const clean = handle.replace(/^@+/, '')
  return `/@${clean}`
}

/**
 * Builds the canonical friendly URL for a Program.
 * Supports /@creatorname/program-slug or /programs/program-slug, falling back to /programs/:id.
 */
export function buildProgramUrl(
  program: ProgramUrlTarget,
  options: ProgramUrlOptions = {},
): string {
  if (!program || !program.id) return '/browse'

  const creatorHandle =
    options?.scoped !== false
      ? (program.creatorHandle ??
         program.creator?.handle ??
         program.creator?.profile?.handle ??
         null)
      : null

  const slug = program.slug ? slugify(program.slug) : (program.title ? slugify(program.title) : null)

  let path: string
  if (options.scoped && creatorHandle && slug) {
    path = `/@${creatorHandle.replace(/^@+/, '')}/${slug}`
  } else if (slug) {
    path = `/programs/${slug}`
  } else {
    path = `/programs/${program.id}`
  }

  const query = new URLSearchParams()
  if (options.returnTo) {
    query.set('returnTo', options.returnTo)
  }
  if (options.groupId) {
    query.set('groupId', options.groupId)
  }
  if (options.startDate) {
    query.set('startDate', options.startDate)
  }

  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}

/**
 * Builds the canonical friendly URL for an Activity.
 * Formats as /activities/activity-slug, falling back to /activities/:id.
 */
export function buildActivityUrl(
  activity: ActivityUrlTarget,
  options: ActivityUrlOptions = {},
): string {
  if (!activity || !activity.id) return '/browse?kind=activities'

  const slug = activity.slug ? slugify(activity.slug) : (activity.title ? slugify(activity.title) : null)

  const path = slug ? `/activities/${slug}` : `/activities/${activity.id}`

  const query = new URLSearchParams()
  if (options.edit) query.set('edit', '1')
  if (options.returnTo) query.set('returnTo', options.returnTo)
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}

/**
 * Private workspace URL for Program authoring.
 * Always retains internal UUID.
 */
export function buildWorkspaceUrl(
  programId: string,
  options: { panel?: string; step?: string } = {},
): string {
  const base = `/programs/${programId}/workspace`
  if (options.step) {
    return `${base}?step=${encodeURIComponent(options.step)}`
  }
  if (options.panel) {
    return `${base}?panel=${encodeURIComponent(options.panel)}`
  }
  return base
}

/**
 * Calendar occurrence URL. Retains internal UUID.
 */
export function buildOccurrenceUrl(
  occurrenceId: string,
  options: { returnTo?: string } = {},
): string {
  const base = `/occurrences/${occurrenceId}`
  if (options.returnTo) {
    return `${base}?returnTo=${encodeURIComponent(options.returnTo)}`
  }
  return base
}

/**
 * Group URL. Retains internal UUID.
 */
export function buildGroupUrl(
  groupId: string,
  options: { returnTo?: string } = {},
): string {
  const base = `/groups/${groupId}`
  if (options.returnTo) {
    return `${base}?returnTo=${encodeURIComponent(options.returnTo)}`
  }
  return base
}

/** Resolves an app-relative path to a full origin URL in the browser. */
export function toAbsoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return typeof window !== 'undefined' ? `${window.location.origin}${path}` : path
}

