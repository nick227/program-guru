import type { BreadcrumbItem } from '@/components/shared/Breadcrumbs'
import type { SubHeaderNavKey } from '@/components/shared/SubHeader'
import { buildBrowseUrl } from '@/lib/browse'

interface TaxonomyRef {
  id: string
  label: string
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw, 'http://local')
  } catch {
    return null
  }
}

function hasParamValue(raw: string | null | undefined, key: string, value: string): boolean {
  if (!raw) return false
  const parsed = parseUrl(raw)
  return parsed?.searchParams.get(key) === value
}

/** Extract a Program target slug/id (and optional handle) when a returnTo path points to a Program page. */
export function extractProgramTargetFromPath(raw?: string | null): {
  slugOrId: string
  handle: string | null
  nestedReturnTo: string | null
} | null {
  if (!raw) return null
  const parsed = parseUrl(raw)
  if (!parsed) return null
  const nestedReturnTo = parsed.searchParams.get('returnTo')
  const programMatch = /^\/programs\/([^/]+)$/.exec(parsed.pathname)
  if (programMatch?.[1]) {
    return { slugOrId: decodeURIComponent(programMatch[1]), handle: null, nestedReturnTo }
  }
  const scopedMatch = /^\/@([^/]+)\/([^/]+)$/.exec(parsed.pathname)
  if (scopedMatch?.[1] && scopedMatch?.[2]) {
    return {
      slugOrId: decodeURIComponent(scopedMatch[2]),
      handle: decodeURIComponent(scopedMatch[1]),
      nestedReturnTo,
    }
  }
  return null
}

function resolveContextRoot(
  returnTo: string | null | undefined,
  defaultHref: string,
  defaultLabel = 'Community',
): { label: string; href: string; activeNav?: SubHeaderNavKey } {
  if (!returnTo) {
    return { label: defaultLabel, href: defaultHref, activeNav: 'community' }
  }
  if (returnTo.startsWith('/library')) {
    return { label: 'My Programs', href: returnTo, activeNav: 'programs' }
  }
  if (returnTo === '/' || returnTo.startsWith('/?')) {
    return { label: 'Calendar', href: returnTo, activeNav: 'calendar' }
  }
  if (returnTo.startsWith('/studio')) {
    return { label: 'Creator Studio', href: returnTo }
  }
  if (returnTo.startsWith('/notifications')) {
    return { label: 'Notifications', href: returnTo }
  }
  if (/^\/@[^/]+$/.test(parseUrl(returnTo)?.pathname ?? '')) {
    return { label: 'Profile', href: returnTo, activeNav: 'community' }
  }
  if (returnTo.startsWith('/browse') || returnTo.startsWith('/discover')) {
    return { label: 'Community', href: returnTo, activeNav: 'community' }
  }
  return { label: defaultLabel, href: defaultHref, activeNav: 'community' }
}

/** Build shallow breadcrumbs for a Program page from return context or canonical taxonomy. */
export function buildProgramBreadcrumbs({
  title,
  type,
  focus,
  returnTo,
}: {
  title: string
  type?: TaxonomyRef | null
  focus?: TaxonomyRef | null
  returnTo?: string | null
}): { items: BreadcrumbItem[]; activeNav?: SubHeaderNavKey } {
  const fromProgramOrList =
    returnTo &&
    (returnTo.startsWith('/library') ||
      returnTo === '/' ||
      returnTo.startsWith('/?') ||
      returnTo.startsWith('/studio') ||
      /^\/@[^/]+$/.test(parseUrl(returnTo)?.pathname ?? ''))

  if (fromProgramOrList) {
    const root = resolveContextRoot(returnTo, '/browse')
    return {
      items: [{ label: root.label, href: root.href }, { label: title }],
      activeNav: root.activeNav,
    }
  }

  const browseHref = returnTo?.startsWith('/browse') ? returnTo : '/browse'
  const items: BreadcrumbItem[] = [{ label: 'Community', href: browseHref }]

  if (type && !hasParamValue(returnTo, 'type', type.id)) {
    items.push({
      label: type.label,
      href: buildBrowseUrl({ kind: 'programs', type: type.id }),
    })
  }
  if (
    type &&
    focus &&
    !hasParamValue(returnTo, 'focus', focus.id) &&
    !hasParamValue(returnTo, 'facet', focus.id)
  ) {
    items.push({
      label: focus.label,
      href: buildBrowseUrl({ kind: 'programs', type: type.id, focus: focus.id }),
    })
  }
  items.push({ label: title })

  return { items, activeNav: 'community' }
}

/** Build shallow breadcrumbs for an Activity definition page, including parent Program when opened from one. */
export function buildActivityBreadcrumbs({
  title,
  category,
  parentProgram,
  returnTo,
}: {
  title: string
  category?: TaxonomyRef | null
  parentProgram?: { title: string; href: string; nestedReturnTo?: string | null } | null
  returnTo?: string | null
}): { items: BreadcrumbItem[]; activeNav?: SubHeaderNavKey } {
  if (parentProgram) {
    const root = resolveContextRoot(parentProgram.nestedReturnTo, '/browse')
    return {
      items: [
        { label: root.label, href: root.href },
        { label: parentProgram.title, href: parentProgram.href },
        { label: title },
      ],
      activeNav: root.activeNav,
    }
  }

  if (
    returnTo &&
    (returnTo.startsWith('/library') ||
      returnTo === '/' ||
      returnTo.startsWith('/?') ||
      returnTo.startsWith('/studio') ||
      /^\/@[^/]+$/.test(parseUrl(returnTo)?.pathname ?? ''))
  ) {
    const root = resolveContextRoot(returnTo, '/browse?kind=activities')
    return {
      items: [{ label: root.label, href: root.href }, { label: title }],
      activeNav: root.activeNav,
    }
  }

  const browseHref = returnTo?.startsWith('/browse')
    ? returnTo
    : buildBrowseUrl({ kind: 'activities' })
  const items: BreadcrumbItem[] = [{ label: 'Community', href: browseHref }]

  if (
    category &&
    !hasParamValue(returnTo, 'category', category.id) &&
    !hasParamValue(returnTo, 'facet', category.id)
  ) {
    items.push({
      label: category.label,
      href: buildBrowseUrl({ kind: 'activities', category: category.id }),
    })
  }
  items.push({ label: title })

  return { items, activeNav: 'community' }
}

/** Build shallow breadcrumbs for a Profile page. */
export function buildProfileBreadcrumbs({
  label,
  returnTo,
}: {
  label: string
  returnTo?: string | null
}): { items: BreadcrumbItem[]; activeNav?: SubHeaderNavKey } {
  if (returnTo) {
    const programTarget = extractProgramTargetFromPath(returnTo)
    if (programTarget) {
      return {
        items: [
          { label: 'Community', href: '/browse' },
          { label: 'Program', href: returnTo },
          { label },
        ],
        activeNav: 'community',
      }
    }
    const root = resolveContextRoot(returnTo, '/browse')
    return {
      items: [{ label: root.label, href: root.href }, { label }],
      activeNav: root.activeNav,
    }
  }

  return {
    items: [{ label: 'Community', href: '/browse' }, { label }],
    activeNav: 'community',
  }
}

/** Build shallow breadcrumbs for a Group page. */
export function buildGroupBreadcrumbs({
  groupName,
  programTitle,
  returnTo,
}: {
  groupName?: string | null
  programTitle?: string | null
  returnTo?: string | null
}): { items: BreadcrumbItem[]; activeNav?: SubHeaderNavKey } {
  const leaf = groupName || 'Group'
  if (returnTo) {
    const programTarget = extractProgramTargetFromPath(returnTo)
    if (programTarget) {
      const root = resolveContextRoot(programTarget.nestedReturnTo, '/browse')
      return {
        items: [
          { label: root.label, href: root.href },
          { label: programTitle || 'Program', href: returnTo },
          { label: leaf },
        ],
        activeNav: root.activeNav,
      }
    }
    const root = resolveContextRoot(returnTo, '/notifications')
    return {
      items: [{ label: root.label, href: root.href }, { label: leaf }],
      activeNav: root.activeNav,
    }
  }
  return {
    items: [{ label: 'Notifications', href: '/notifications' }, { label: leaf }],
  }
}

/** Build shallow breadcrumbs for an Occurrence execution page. */
export function buildOccurrenceBreadcrumbs({
  title,
  programTitle,
  returnTo,
}: {
  title: string
  programTitle?: string | null
  returnTo?: string | null
}): { items: BreadcrumbItem[]; activeNav?: SubHeaderNavKey } {
  const programTarget = extractProgramTargetFromPath(returnTo)
  if (programTarget && returnTo) {
    const root = resolveContextRoot(programTarget.nestedReturnTo, '/library', 'My Programs')
    return {
      items: [
        { label: root.label, href: root.href },
        { label: programTitle || 'Program', href: returnTo },
        { label: title },
      ],
      activeNav: root.activeNav,
    }
  }

  if (returnTo?.startsWith('/library')) {
    return {
      items: [
        { label: 'My Programs', href: returnTo },
        ...(programTitle ? [{ label: programTitle }] : []),
        { label: title },
      ],
      activeNav: 'programs',
    }
  }

  return {
    items: [
      { label: 'Calendar', href: returnTo || '/' },
      ...(programTitle ? [{ label: programTitle }] : []),
      { label: title },
    ],
    activeNav: 'calendar',
  }
}
