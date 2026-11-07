import { Link } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
export type SurfaceItem = {
  id: string
  day: string
  title: string
  detail?: string
  done?: boolean
  href?: string
  locked?: boolean
}
export function CalendarSurface({
  days,
  selected,
  onSelect,
  items,
}: {
  days: { id: string; label: string; number: string; today?: boolean }[]
  selected: string
  onSelect: (day: string) => void
  items: SurfaceItem[]
}) {
  return (
    <div>
      <div
        className="grid grid-cols-7 gap-0 rounded-xl border bg-surface p-1 sm:gap-1 sm:p-2"
        aria-label="Select a day"
      >
        {days.map((day) => (
          <button
            key={day.id}
            type="button"
            aria-pressed={selected === day.id}
            aria-current={day.today ? 'date' : undefined}
            onClick={() => onSelect(day.id)}
            className={cn(
              'flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg transition-colors duration-fast',
              selected === day.id
                ? 'bg-accent text-white'
                : 'hover:bg-surface-muted',
              day.today &&
                selected !== day.id &&
                'ring-1 ring-inset ring-accent',
            )}
          >
            <span className="text-xs">{day.label}</span>
            <span className="font-mono text-lg">{day.number}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-7">
        {days.map((day) => (
          <section
            key={day.id}
            aria-label={day.label + ' ' + day.number}
            className={cn(
              'min-w-0 space-y-2 rounded-xl md:min-h-64',
              selected !== day.id && 'hidden md:block',
            )}
          >
            {items
              .filter((item) => item.day === day.id)
              .map((item) => {
                const content = (
                  <>
                    <span className="flex items-start justify-between gap-1">
                      <span className="break-words font-semibold">
                        {item.title}
                      </span>
                      {item.done ? (
                        <Check
                          size={16}
                          aria-label="Completed"
                          className="shrink-0 text-success"
                        />
                      ) : item.href ? (
                        <ChevronRight
                          size={14}
                          className="shrink-0 text-muted"
                        />
                      ) : null}
                    </span>
                    {item.detail && (
                      <span className="mt-3 block text-xs text-muted">
                        {item.detail}
                      </span>
                    )}
                    <span className="mt-3 block text-xs text-muted">
                      {item.locked
                        ? 'Access required'
                        : item.done
                          ? 'Completed'
                          : 'Planned'}
                    </span>
                  </>
                )
                const className =
                  'block rounded-lg border bg-surface p-3 text-left shadow-sm transition-colors hover:border-accent'
                return item.href ? (
                  <Link key={item.id} to={item.href} className={className}>
                    {content}
                  </Link>
                ) : (
                  <div key={item.id} className={className}>
                    {content}
                  </div>
                )
              })}
            {!items.some((item) => item.day === day.id) && (
              <p className="p-4 text-xs text-muted md:text-center">
                No activities
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
