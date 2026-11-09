import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { EntityHero } from '@/components/EntityHero'
import type { Hero } from '@/lib/hero'
import { cn } from '@/lib/utils'

export interface ProgramActivityCardProps {
  title: string
  /** Identity image through the shared fallback chain (`resolveHero`/`activityHero`). */
  hero: Hero
  description?: string | null
  /** One short metadata line built from real values only, e.g. "Starts day 1". */
  meta?: string | null
  href?: string
  actions?: ReactNode
  className?: string
}

/**
 * Activity row: 4:3 preview, title, optional description and metadata, trailing action.
 * Renders only the values it is given; a chevron appears only when the row navigates.
 */
export function ProgramActivityCard({
  title,
  hero,
  description,
  meta,
  href,
  actions,
  className,
}: ProgramActivityCardProps) {
  const content = (
    <article
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-3 sm:gap-5',
        href && 'transition-colors hover:border-accent hover:bg-surface-raised',
        className,
      )}
    >
      <div className="w-28 shrink-0 sm:w-32">
        <EntityHero
          hero={hero}
          size="card"
          className="aspect-preview rounded-[var(--radius-media)]"
        />
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="truncate text-base font-semibold leading-snug text-foreground">
          {title}
        </h3>
        {description && (
          <p className="line-clamp-1 text-sm text-muted">{description}</p>
        )}
        {meta && <p className="text-sm text-muted">{meta}</p>}
      </div>

      {actions ? (
        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      ) : href ? (
        <ChevronRight
          size={18}
          aria-hidden
          className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
        />
      ) : null}
    </article>
  )

  return href && !actions ? (
    <Link to={href} className="block rounded-[var(--radius-panel)]">
      {content}
    </Link>
  ) : (
    content
  )
}
