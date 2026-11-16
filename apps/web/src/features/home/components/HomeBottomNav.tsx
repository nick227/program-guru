import { Link, useLocation } from 'react-router-dom'
import { BookOpen, Compass, Home, PlusCircle, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

export function HomeBottomNav() {
  const location = useLocation()
  const path = location.pathname

  const navItems = [
    { label: 'Home', to: '/', icon: Home, isActive: path === '/' },
    { label: 'Explore', to: '/browse', icon: Compass, isActive: path.startsWith('/browse') && !location.search.includes('kind=creators') },
    { label: 'Create', to: '/programs/new', icon: PlusCircle, isActive: path.startsWith('/programs/new') },
    { label: 'Community', to: '/browse?kind=creators', icon: Users, isActive: location.search.includes('kind=creators') },
    { label: 'Programs', to: '/library', icon: BookOpen, isActive: path.startsWith('/library') || path.startsWith('/programs') },
  ]

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 inset-x-0 z-30 border-t border-border/30 bg-surface/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <div className="mx-auto flex h-16 max-w-md items-center justify-around px-2">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.label}
              to={item.to}
              className={cn(
                'flex flex-col items-center justify-center gap-1 py-1 px-3 text-[10px] font-medium transition-colors',
                item.isActive
                  ? 'text-accent font-semibold'
                  : 'text-muted hover:text-foreground',
              )}
            >
              <Icon size={20} className={item.isActive ? 'text-accent' : 'text-muted'} aria-hidden />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

