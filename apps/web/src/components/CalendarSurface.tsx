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

type CalendarDay = {
  id: string
  label: string
  number: string
  today?: boolean
  inCurrentMonth?: boolean
}

function itemStatus(item: SurfaceItem): string {
  if (item.locked) return 'Access required'
  if (item.done || item.status === 'DONE') return 'Completed'
  if (item.notParticipating || item.status === 'NOT_PARTICIPATING') {
    return 'Not participating'
  }
  if (item.status === 'SKIPPED') return 'Skipped'
  if (item.status === 'CANCELLED') return 'Cancelled'
  if (item.conflict) return 'Overlaps another Activity'
  return 'Planned'
}

function ActivityCard({ item }: { item: SurfaceItem }) {
  const status = itemStatus(item)
  const content = (
    <>
      <span className="calendar-item__thumb" aria-hidden>
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          item.title.slice(0, 1)
        )}
      </span>
      <span className="calendar-item__title-row min-w-0">
        <span className="calendar-item__title">{item.title}</span>
        <span className="calendar-item__icon">
          {item.done || item.status === 'DONE' ? (
            <Check size={16} aria-label="Completed" className="calendar-item__icon--done" />
          ) : item.href ? (
            <ChevronRight size={14} aria-hidden />
          ) : null}
          <UnreadDot count={item.unreadCount ?? 0} />
        </span>
      </span>
      <span className="calendar-item__details">
        {item.detail || 'Personal activity'}
        <span
          className={cn(
            'calendar-item__status',
            (item.done || item.status === 'DONE') && 'calendar-item__status--done',
            item.conflict && 'calendar-item__status--attention',
            item.locked && 'calendar-item__status--danger',
          )}
        >
          {status}
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
    </>
  )

  const className = 'calendar-item'
  const label = [item.title, item.detail, status].filter(Boolean).join(' · ')
  return item.href ? (
    <Link key={item.id} to={item.href} className={className} aria-label={label}>
      {content}
    </Link>
  ) : (
    <div key={item.id} className={className}>
      {content}
    </div>
  )
}

function DayItems({
  day,
  items,
  compact = false,
}: {
  day: CalendarDay
  items: SurfaceItem[]
  compact?: boolean
}) {
  const rows = items.filter((item) => item.day === day.id)
  return (
    <div className="calendar-day-items">
      {rows.slice(0, compact ? 2 : undefined).map((item) => (
        <ActivityCard key={item.id} item={item} />
      ))}
      {compact && rows.length > 2 && (
        <p className="calendar-more">+{rows.length - 2} more</p>
      )}
      {!rows.length && !compact && (
        <p className="calendar-empty">No Activities planned</p>
      )}
    </div>
  )
}

export function CalendarSurface({
  days,
  selected,
  onSelect,
  items,
  view = 'week',
}: {
  days: CalendarDay[]
  selected: string
  onSelect: (day: string) => void
  items: SurfaceItem[]
  view?: 'day' | 'week' | 'month'
}) {
  const selectedDay = days.find((day) => day.id === selected) ?? days[0]
  if (!selectedDay) return null

  if (view === 'month') {
    return (
      <div className="calendar">
        <div className="calendar-month-weekdays" aria-hidden>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-month-picker sm:hidden" aria-label="Select a day">
          {days.map((day) => {
            const count = items.filter((item) => item.day === day.id).length
            return (
              <button
                key={day.id}
                type="button"
                aria-label={`${day.label} ${day.number}${count ? `, ${count} Activities` : ''}`}
                aria-pressed={selected === day.id}
                aria-current={day.today ? 'date' : undefined}
                disabled={!day.inCurrentMonth}
                onClick={() => onSelect(day.id)}
                className={cn(
                  'calendar-month-date',
                  selected === day.id && 'calendar-month-date--selected',
                  day.today && 'calendar-month-date--today',
                  count > 0 && 'calendar-month-date--active',
                )}
              >
                <span>{day.number}</span>
                {count > 0 && <span className="calendar-month-count">{count}</span>}
              </button>
            )
          })}
        </div>
        <div className="calendar-month-grid" aria-label="Monthly calendar">
          {days.map((day) => {
            const count = items.filter((item) => item.day === day.id).length
            return (
              <section
                key={day.id}
                className={cn(
                  'calendar-month-cell',
                  !day.inCurrentMonth && 'calendar-month-cell--outside',
                  selected === day.id && 'calendar-month-cell--selected',
                )}
              >
                <button
                  type="button"
                  disabled={!day.inCurrentMonth}
                  aria-label={`${day.label} ${day.number}${count ? `, ${count} Activities` : ''}`}
                  aria-pressed={selected === day.id}
                  aria-current={day.today ? 'date' : undefined}
                  onClick={() => onSelect(day.id)}
                  className={cn(
                    'calendar-month-date',
                    day.today && 'calendar-month-date--today',
                  )}
                >
                  <span>{day.number}</span>
                  {count > 0 && <span className="calendar-month-count">{count}</span>}
                </button>
                <DayItems day={day} items={items} compact />
              </section>
            )
          })}
        </div>
        <section className="calendar-selected-day">
          <h2>
            {selectedDay.label} {selectedDay.number}
          </h2>
          <DayItems day={selectedDay} items={items} />
        </section>
      </div>
    )
  }

  if (view === 'day') {
    return (
      <section className="calendar-selected-day">
        <h2>{selectedDay.label}</h2>
        <DayItems day={selectedDay} items={items} />
      </section>
    )
  }

  return (
    <div className="calendar">
      <div className="calendar-weekstrip" aria-label="Select a day">
        {days.map((day) => {
          const count = items.filter((item) => item.day === day.id).length
          return (
            <button
              key={day.id}
              type="button"
              aria-label={`${day.label} ${day.number}${count ? `, ${count} Activities` : ''}`}
              aria-pressed={selected === day.id}
              aria-current={day.today ? 'date' : undefined}
              onClick={() => onSelect(day.id)}
              className={cn(
                'calendar-day',
                selected === day.id && 'calendar-day--selected',
                day.today && 'calendar-day--today',
              )}
            >
              <span className="calendar-day__label" aria-hidden>
                {day.label}
              </span>
              <span className="calendar-day__number" aria-hidden>
                {day.number}
              </span>
              {count > 0 && (
                <span className="calendar-day__count" aria-hidden>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="calendar-board">
        {days.map((day) => (
          <section
            key={day.id}
            aria-label={day.label}
            className={cn(
              'calendar-column',
              selected !== day.id && 'calendar-column--hidden-mobile',
            )}
          >
            <button
              type="button"
              aria-pressed={selected === day.id}
              onClick={() => onSelect(day.id)}
              className="calendar-column__heading"
            >
              {day.label} {day.number}
            </button>
            <DayItems day={day} items={items} />
          </section>
        ))}
      </div>
    </div>
  )
}
