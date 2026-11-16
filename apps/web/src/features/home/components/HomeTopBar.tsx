import { Link } from 'react-router-dom'
import { Bell, Mountain, RotateCcw, Search } from 'lucide-react'
import { useAuthState } from '@project/sdk'
import { AccountMenu } from '@/components/account/AccountMenu'
import { HeaderNavMenu } from '@/components/shared/HeaderNavMenu'

interface HomeTopBarProps {
  onReset: () => void
  showReset: boolean
}

/**
 * Modern header for Home (/): Program.Guru brand mark on the left,
 * Search, Notifications, Navigation menu, and Account controls on the right.
 */
export function HomeTopBar({ onReset, showReset }: HomeTopBarProps) {
  const auth = useAuthState()

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border/30 bg-surface/95 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 w-full page--wide items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
        <Link
          to="/"
          onClick={() => {
            if (showReset) onReset()
          }}
          className="inline-flex items-center gap-2 font-display text-base font-bold tracking-tight text-foreground transition hover:opacity-85 sm:text-lg"
          aria-label="Program.Guru Home"
        >
          <Mountain size={22} className="text-accent shrink-0 fill-accent/20" aria-hidden />
          <span>Program.Guru</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/browse"
            aria-label="Search activities and programs"
            title="Search"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground/80 transition hover:bg-surface-raised hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Search size={19} aria-hidden />
          </Link>

          <Link
            to="/notifications"
            aria-label="Notifications"
            title="Notifications"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground/80 transition hover:bg-surface-raised hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Bell size={19} aria-hidden />
            <span
              className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-surface"
              aria-hidden
            />
          </Link>

          {showReset && (
            <button
              type="button"
              onClick={onReset}
              aria-label="Start over"
              title="Start over"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-raised hover:text-accent"
            >
              <RotateCcw size={16} aria-hidden />
            </button>
          )}

          <HeaderNavMenu />

          {auth === 'signed-in' ? (
            <AccountMenu />
          ) : auth === 'unknown' ? (
            <span aria-hidden className="inline-block h-8 w-8" />
          ) : (
            <Link
              to="/login"
              className="h-8 w-8 rounded-full overflow-hidden border border-border/70 hover:border-accent transition-colors shrink-0"
              title="Sign in"
              aria-label="Sign in"
            >
              <img
                src="/assets/covers/starter-have-dinner-with-a-friend-thumb.webp"
                alt="Account"
                className="h-full w-full object-cover"
              />
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
