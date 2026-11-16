import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
  interactive?: boolean
  className?: string
}

/**
 * Standard flat Card container adhering to the consolidated visual rules:
 * Flat neutral surface, standard border-border, rounded-xl radius, no glows or nested shadows.
 */
export function Card({
  children,
  interactive = false,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface text-foreground transition-colors',
        interactive &&
          'hover:border-border/80 focus-within:ring-2 focus-within:ring-accent',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

