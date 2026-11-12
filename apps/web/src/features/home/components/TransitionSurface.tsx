import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TransitionSurfaceProps {
  ready: boolean
  children: ReactNode
  delayMs?: number
  className?: string
}

/**
 * Shared minimal transition surface for Home's conversation, previews,
 * inline Activity execution, and Group Stage.
 *
 * - Skips the logo screen entirely when data loads faster than `delayMs`.
 * - Never renders skeletons, spinners, or partially initialized content.
 * - Uses a restrained 200ms opacity transition respecting `prefers-reduced-motion`.
 */
export function TransitionSurface({
  ready,
  children,
  delayMs = 140,
  className,
}: TransitionSurfaceProps) {
  const [showLogo, setShowLogo] = useState(false)

  useEffect(() => {
    if (ready) {
      setShowLogo(false)
      return
    }
    const timer = window.setTimeout(() => {
      setShowLogo(true)
    }, delayMs)
    return () => window.clearTimeout(timer)
  }, [ready, delayMs])

  if (!ready) {
    if (!showLogo) {
      return null
    }
    return (
      <div
        role="status"
        aria-label="Loading"
        className={cn(
          'flex min-h-[45vh] w-full flex-1 items-center justify-center bg-surface animate-in fade-in duration-200 motion-reduce:animate-none',
          className,
        )}
      >
        <div className="inline-flex items-center gap-3">
          <span aria-hidden className="h-3 w-3 rounded-full bg-accent" />
          <span className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Program.Guru
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'w-full animate-in fade-in duration-200 motion-reduce:animate-none',
        className,
      )}
    >
      {children}
    </div>
  )
}

