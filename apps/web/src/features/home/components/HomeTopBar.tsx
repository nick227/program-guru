import { Link } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { useCurrentUser } from '@project/sdk'
import { AccountMenu } from '@/components/account/AccountMenu'
import { HeaderNavMenu } from '@/components/shared/HeaderNavMenu'

interface HomeTopBarProps {
  onReset: () => void
  showReset: boolean
}

/**
 * Minimal full-screen header for Home (/): Program.Guru status indicator
 * on the left, Reset and Menu controls on the right.
 */
export function HomeTopBar({ onReset, showReset }: HomeTopBarProps) {
  const me = useCurrentUser()

  return (
    <header className="w-full pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex min-h-16 page--wide items-center justify-between gap-2 sm:gap-4">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2.5 rounded-full font-display text-base font-semibold tracking-tight text-inherit transition hover:opacity-85 sm:text-lg"
          aria-label="Program.Guru Home — reset conversation"
        >
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent" />
          <span className="max-[459px]:sr-only">Program.Guru</span>
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          {showReset && (
            <button
              type="button"
              onClick={onReset}
              aria-label="Start over"
              title="Start over"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-raised/70 text-muted transition hover:bg-surface-raised hover:text-inherit"
            >
              <RotateCcw size={17} aria-hidden />
            </button>
          )}
          <HeaderNavMenu />
          {me.data ? (
            <AccountMenu />
          ) : (
            <Link
              to="/login"
              className="inline-flex min-h-10 items-center px-2 text-sm font-semibold text-accent"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

