import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, BookOpen, Calendar, List, Plus } from 'lucide-react'
import { Breadcrumbs, type BreadcrumbItem } from '@/components/shared/Breadcrumbs'
import { cn } from '@/lib/utils'

export type SubHeaderNavKey = 'calendar' | 'community' | 'programs' | 'add-program'

interface NavItem {
  key: SubHeaderNavKey
  label: string
  to: string
  icon: typeof Calendar
  primary?: boolean
}

/** Resolve which sub-header navigation item corresponds to the current route. */
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

/** Consistent top-level page actions rendered as one control across sub-header pages. */
export function SubHeaderActions({
  active,
  returnTo,
  backTo,
}: {
  active?: SubHeaderNavKey
  returnTo?: string
  backTo?: string
}) {
  const location = useLocation()

  if (backTo) {
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

  const currentUrl = returnTo ?? `${location.pathname}${location.search}`
  const activeKey = active ?? resolveSubHeaderNav(location.pathname)

  const items: NavItem[] = [
    { key: 'calendar', label: 'Calendar', to: '/', icon: Calendar },
    { key: 'community', label: 'Community', to: '/browse', icon: List },
    { key: 'programs', label: 'Programs', to: '/library', icon: BookOpen },
    {
      key: 'add-program',
      label: 'Add Program',
      to: `/programs/new?returnTo=${encodeURIComponent(currentUrl)}`,
      icon: Plus,
      primary: true,
    },
  ]

  return (
    <nav aria-label="Workspace navigation" className="sub-header__actions">
      {items.map((item) => {
        const Icon = item.icon
        const isActive = activeKey === item.key
        return (
          <Link
            key={item.key}
            to={item.to}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'sub-header__btn sub-header__btn--nav',
              item.primary && 'sub-header__btn--primary',
              isActive && !item.primary && 'sub-header__btn--active',
            )}
          >
            <Icon size={16} aria-hidden />
            <span className="sub-header__label">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/** Shared sub-header bar for main workspace pages and entity detail views. */
export function SubHeader({
  title,
  breadcrumbs,
  active,
  returnTo,
  backTo,
}: {
  title?: string
  breadcrumbs?: BreadcrumbItem[]
  active?: SubHeaderNavKey
  returnTo?: string
  backTo?: string
}) {
  return (
    <header className="sub-header">
      <div className="sub-header__title">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <Breadcrumbs items={breadcrumbs} />
        ) : (
          <h1 className="sub-header__heading">{title}</h1>
        )}
      </div>
      <SubHeaderActions active={active} returnTo={returnTo} backTo={backTo} />
    </header>
  )
}

