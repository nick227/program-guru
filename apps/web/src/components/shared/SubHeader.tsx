import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Breadcrumbs, type BreadcrumbItem } from '@/components/shared/Breadcrumbs'

export type SubHeaderNavKey = 'calendar' | 'community' | 'programs' | 'add-program'

/** Resolve which navigation item corresponds to the current route. */
export function resolveSubHeaderNav(pathname: string): SubHeaderNavKey | undefined {
  if (pathname === '/') return 'calendar'
  if (
    pathname === '/browse' ||
    pathname.startsWith('/browse/') ||
    pathname === '/discover' ||
    pathname.startsWith('/discover/')
  ) {
    return 'community'
  }
  if (pathname === '/library' || pathname.startsWith('/library/')) return 'programs'
  if (pathname === '/programs/new') return 'add-program'
  return undefined
}

/** Contextual back action when an explicit return destination is provided. */
export function SubHeaderActions({
  backTo,
}: {
  active?: SubHeaderNavKey
  returnTo?: string
  backTo?: string
}) {
  if (!backTo) return null

  return (
    <div className="sub-header__actions">
      <Link
        to={backTo}
        state={{ fromBrowse: true }}
        className="sub-header__btn"
      >
        <ArrowLeft size={16} aria-hidden />
        <span>Back</span>
      </Link>
    </div>
  )
}

/** Shared contextual sub-header bar for breadcrumbs and explicit back navigation. */
export function SubHeader({
  title,
  breadcrumbs,
  backTo,
}: {
  title?: string
  breadcrumbs?: BreadcrumbItem[]
  active?: SubHeaderNavKey
  returnTo?: string
  backTo?: string
}) {
  const hasBreadcrumbs = Boolean(breadcrumbs && breadcrumbs.length > 0)

  if (!hasBreadcrumbs && !backTo) {
    return title ? <h1 className="sr-only">{title}</h1> : null
  }

  return (
    <header className="sub-header">
      <div className="sub-header__title">
        {hasBreadcrumbs ? (
          <Breadcrumbs items={breadcrumbs!} />
        ) : (
          <h1 className="sub-header__heading">{title}</h1>
        )}
      </div>
      <SubHeaderActions backTo={backTo} />
    </header>
  )
}

