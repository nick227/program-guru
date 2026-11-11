import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, dateLabel, monthGrid } from '@/lib/dates'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

export function DatePickerPopover({
  selected,
  todayDate,
  onSelect,
  onClose,
}: {
  selected: string
  todayDate: string
  onSelect: (day: string) => void
  onClose: () => void
}) {
  const [cursorMonth, setCursorMonth] = useState(`${selected.slice(0, 7)}-01`)

  useEffect(() => {
    setCursorMonth(`${selected.slice(0, 7)}-01`)
  }, [selected])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const days = monthGrid(cursorMonth)
  const monthKey = cursorMonth.slice(0, 7)

  return (
    <div
      role="dialog"
      aria-label="Choose a date"
      className="calendar-datepicker"
    >
      <div className="calendar-datepicker__header">
        <button
          type="button"
          className="calendar-datepicker__nav"
          aria-label="Previous month in picker"
          onClick={() => setCursorMonth((m) => addMonths(m, -1))}
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
        <span className="calendar-datepicker__month">
          {dateLabel(cursorMonth, { month: 'long', year: 'numeric' })}
        </span>
        <button
          type="button"
          className="calendar-datepicker__nav"
          aria-label="Next month in picker"
          onClick={() => setCursorMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>

      <div className="calendar-datepicker__weekdays" aria-hidden>
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="calendar-datepicker__grid">
        {days.map((day) => {
          const inMonth = day.slice(0, 7) === monthKey
          const isSelected = day === selected
          const isToday = day === todayDate
          return (
            <button
              key={day}
              type="button"
              aria-label={dateLabel(day, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => onSelect(day)}
              className={cn(
                'calendar-datepicker__day',
                !inMonth && 'calendar-datepicker__day--outside',
                isToday && 'calendar-datepicker__day--today',
                isSelected && 'calendar-datepicker__day--selected',
              )}
            >
              {Number(day.slice(-2))}
            </button>
          )
        })}
      </div>

      <div className="calendar-datepicker__footer">
        <button
          type="button"
          className="calendar-datepicker__today-btn"
          onClick={() => onSelect(todayDate)}
        >
          Today
        </button>
        <button
          type="button"
          className="calendar-datepicker__close-btn"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  )
}

