import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  Home,
  List,
  Menu,
  Plus,
} from 'lucide-react'
import { resolveSubHeaderNav, type SubHeaderNavKey } from '@/components/shared/SubHeader'
import { cn } from '@/lib/utils'

interface NavEntry {
  key: SubHeaderNavKey
  label: string
  to: string
  icon: typeof Calendar
  primary?: boolean
}

/** Sitewide workspace page menu button rendered in the main application header. */
export function HeaderNavMenu() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentUrl = `${location.pathname}${location.search}`
  const activeKey = resolveSubHeaderNav(location.pathname)

  const items: NavEntry[] = [
    { key: 'home', label: 'Home', to: '/', icon: Home },
    { key: 'calendar', label: 'Calendar', to: '/calendar', icon: Calendar },
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

  const activeItem = items.find((item) => item.key === activeKey)
  const TriggerIcon = activeItem ? activeItem.icon : Menu
  const triggerLabel = activeItem ? activeItem.label : 'Pages'

  useEffect(() => {
    setOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    const onPointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={`Pages menu, current page ${triggerLabel}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface-raised/80 px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:border-accent/50 hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          open && 'border-accent/60 bg-surface-muted',
        )}
      >
        <TriggerIcon size={15} aria-hidden className="shrink-0 text-accent" />
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={cn(
            'shrink-0 text-muted transition-transform duration-fast',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <nav
          aria-label="Workspace navigation"
          className="absolute left-0 top-full z-30 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-1.5 shadow-lg"
        >
          <div className="flex flex-col gap-0.5">
            {items.map((item, idx) => {
              const Icon = item.icon
              const isActive = activeKey === item.key
              return (
                <div key={item.key}>
                  {item.primary && idx > 0 && (
                    <div className="my-1 border-t border-border/70" role="separator" />
                  )}
                  <Link
                    to={item.to}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors',
                      item.primary
                        ? 'text-accent hover:bg-accent/12 font-semibold'
                        : isActive
                          ? 'bg-accent/12 text-accent font-semibold'
                          : 'text-text hover:bg-surface-muted',
                    )}
                  >
                    <Icon size={16} aria-hidden className="shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {isActive && !item.primary && (
                      <Check size={14} aria-hidden className="shrink-0 text-accent" />
                    )}
                  </Link>
                </div>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}

