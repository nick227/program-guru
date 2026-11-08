import { Link } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import { AvatarStack } from '@/components/AvatarStack'
import { UnreadDot } from '@/components/UnreadDot'
import { cn } from '@/lib/utils'

export type SurfaceItem = {
  id: string
  day: string
  title: string
  detail?: string
  done?: boolean
  notParticipating?: boolean
  status?: 'PLANNED' | 'SKIPPED' | 'CANCELLED' | 'DONE' | 'NOT_PARTICIPATING'
  href?: string
  locked?: boolean
  conflict?: boolean
  thumbnailUrl?: string | null
  avatarUrls?: string[]
  unreadCount?: number
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
                  <span className="flex gap-2">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt=""
                        aria-hidden
                        className="h-11 w-11 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface-muted text-xs text-muted"
                      >
                        {item.title.slice(0, 1)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-1">
                        <span className="break-words font-semibold">
                          {item.title}
                        </span>
                        <span className="relative shrink-0">
                          {item.done ? (
                            <Check
                              size={16}
                              aria-label="Completed"
                              className="text-success"
                            />
                          ) : item.href ? (
                            <ChevronRight size={14} className="text-muted" />
                          ) : null}
                          <UnreadDot count={item.unreadCount ?? 0} />
                        </span>
                      </span>
                      {item.detail && (
                        <span className="mt-1 block text-xs text-muted">
                          {item.detail}
                        </span>
                      )}
                      <span className="mt-1 block text-xs text-muted">
                        {item.locked
                          ? 'Access required'
                          : item.done || item.status === 'DONE'
                            ? 'Completed'
                            : item.notParticipating ||
                                item.status === 'NOT_PARTICIPATING'
                              ? 'Not participating'
                              : item.status === 'SKIPPED'
                                ? 'Skipped'
                                : item.status === 'CANCELLED'
                                  ? 'Cancelled'
                                  : item.conflict
                                    ? 'Overlaps another Activity'
                                    : 'Planned'}
                      </span>
                      {!!item.avatarUrls?.length && (
                        <AvatarStack
                          people={item.avatarUrls.map((url, i) => ({
                            id: `${item.id}-${i}`,
                            name: 'Collaborator',
                            avatarUrl: url,
                          }))}
                          className="mt-2"
                          max={3}
                        />
                      )}
                    </span>
                  </span>
                )
                const className =
                  'relative block rounded-lg border bg-surface p-3 text-left shadow-sm transition-colors hover:border-accent'
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
