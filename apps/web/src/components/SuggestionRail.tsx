import type { ReactNode } from 'react'
import type { Hero } from '@/lib/hero'
import { EntityHero } from './EntityHero'
import { ErrorMessage } from './ui/Feedback'
import { Skeleton } from './ui/Skeleton'

export type DiscoveryCardModel = {
  id: string
  title: string
  meta: string
  hero: Hero
  /** Who made it, e.g. "by Program Guru"; Programs only. */
  byline?: string | null
}

/**
 * One discovery result. A single button: selecting performs the context's
 * one action (use as a starting point / add); editing happens elsewhere.
 */
export function DiscoveryCard({
  item,
  actionLabel,
  selected = false,
  disabled = false,
  onPick,
}: {
  item: DiscoveryCardModel
  actionLabel: string
  selected?: boolean
  disabled?: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`${actionLabel}: ${item.title}`}
      aria-pressed={selected || undefined}
      disabled={disabled}
      onClick={onPick}
      className={`group flex w-full min-w-0 flex-col overflow-hidden rounded-[var(--radius-panel)] border bg-surface text-left transition-colors hover:border-accent hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 ${selected ? 'border-accent ring-1 ring-accent' : 'border-border'}`}
    >
      <EntityHero hero={item.hero} size="card" className="aspect-hero rounded-none" />
      <span className="flex min-w-0 flex-col gap-1 p-3 sm:p-4">
        <span className="line-clamp-2 text-base font-semibold leading-snug text-foreground">{item.title}</span>
        {item.byline && <span className="truncate text-sm text-muted">{item.byline}</span>}
        <span className="truncate text-sm text-muted">{item.meta}</span>
      </span>
    </button>
  )
}

/**
 * Top-five suggestions: a discovery shortcut, not a second editor.
 * Horizontal scroll on narrow screens, five columns when there is room.
 */
export function SuggestionRail({
  title,
  items,
  loading,
  error,
  retry,
  actionLabel,
  selectedId,
  disabled,
  onPick,
  footer,
}: {
  title: string
  items: DiscoveryCardModel[]
  loading: boolean
  error: unknown
  retry?: () => void
  actionLabel: string
  selectedId?: string | null
  disabled?: boolean
  onPick: (id: string) => void
  footer?: ReactNode
}) {
  if (!loading && !error && !items.length && !footer) return null
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted">{title}</h2>
      <ErrorMessage error={error} retry={retry} />
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" role="status" aria-label={`Loading ${title.toLowerCase()}`}>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full rounded-lg" />
          ))}
        </div>
      ) : (
        items.length > 0 && (
          <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">
            {items.map((item) => (
              <li key={item.id} className="w-40 shrink-0 snap-start sm:w-auto">
                <DiscoveryCard
                  item={item}
                  actionLabel={actionLabel}
                  selected={selectedId === item.id}
                  disabled={disabled}
                  onPick={() => onPick(item.id)}
                />
              </li>
            ))}
          </ul>
        )
      )}
      {footer}
    </section>
  )
}
