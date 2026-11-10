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
  /** One short metadata line built from real values only, e.g. "Day 1". */
  meta?: string | null
  href?: string
  actions?: ReactNode
  variant?: 'default' | 'thumb'
  className?: string
}

/**
 * Media-led Activity Card: top aspect-ratio preview, day badge, title and description.
 * Designed for responsive grid layouts.
 */
export function ProgramActivityCard({
  title,
  hero,
  description,
  meta,
  href,
  actions,
  variant = 'default',
  className,
}: ProgramActivityCardProps) {
  const isThumb = variant === 'thumb'

  const content = (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs transition-all duration-200 hover:border-accent/60 hover:shadow-md',
        className,
      )}
    >
      {/* Media container */}
      <div
        className={cn(
          'relative w-full overflow-hidden bg-surface-muted',
          isThumb ? 'aspect-square' : 'aspect-[16/10]',
        )}
      >
        <EntityHero
          hero={hero}
          size="card"
          className="h-full w-full rounded-none transition-transform duration-300 group-hover:scale-105"
        />

        {meta && (
          <span
            className={cn(
              'absolute z-10 inline-flex items-center rounded-md bg-black/80 font-bold text-white shadow-sm backdrop-blur-md',
              isThumb
                ? 'left-2 top-2 px-1.5 py-0.5 text-[10px]'
                : 'left-2.5 top-2.5 px-2.5 py-1 text-xs',
            )}
          >
            {meta}
          </span>
        )}
      </div>

      {/* Card Content */}
      <div
        className={cn(
          'flex flex-1 flex-col justify-between',
          isThumb ? 'p-2.5 space-y-1' : 'p-4 space-y-2',
        )}
      >
        <div className="space-y-1">
          <h3
            className={cn(
              'font-semibold leading-snug text-foreground group-hover:text-accent transition-colors line-clamp-2',
              isThumb ? 'text-xs sm:text-sm' : 'text-base',
            )}
            title={title}
          >
            {title}
          </h3>
          {description && (
            <p
              className={cn(
                'leading-relaxed text-muted',
                isThumb ? 'line-clamp-1 text-[11px]' : 'line-clamp-2 text-xs',
              )}
            >
              {description}
            </p>
          )}
        </div>

        {/* Footer/Actions */}
        {actions ? (
          <div
            className="flex items-center justify-end gap-2 pt-2 border-t border-border"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        ) : href && !isThumb ? (
          <div className="flex items-center justify-end pt-1 text-xs font-semibold text-accent">
            <span>View</span>
            <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </div>
        ) : null}
      </div>
    </article>
  )

  return href && !actions ? (
    <Link to={href} className="block h-full rounded-xl focus:outline-hidden">
      {content}
    </Link>
  ) : (
    content
  )
}
