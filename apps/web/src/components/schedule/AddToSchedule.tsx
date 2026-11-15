import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useAddCalendarItem, useJoinProgram } from '@project/sdk'
import { DatePickerPopover } from '@/components/calendar/DatePickerPopover'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { dateLabel, today } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { buildRecurrence, recurrenceSummary, weekdayOf, type Ends, type Repeat } from './recurrencePlan'

const REPEATS: { id: Repeat; label: string }[] = [
  { id: 'ONCE', label: 'Once' },
  { id: 'DAILY', label: 'Daily' },
  { id: 'WEEKLY', label: 'Weekly' },
  { id: 'MONTHLY', label: 'Monthly' },
]
const DAY_CHIPS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ENDS: { id: Ends; label: string }[] = [
  { id: 'ONGOING', label: 'Ongoing' },
  { id: 'WEEKS_2', label: 'For 2 weeks' },
  { id: 'MONTH_1', label: 'For 1 month' },
  { id: 'MONTHS_3', label: 'For 3 months' },
  { id: 'ON_DATE', label: 'Until a date' },
]
const chip = (on: boolean) =>
  cn(
    'min-h-9 rounded-full border px-3 text-sm font-medium transition',
    on ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface hover:bg-surface-raised',
  )

/** What Add to Schedule places on the Calendar: one Activity, or a Program run from a start date. */
export type ScheduleTarget =
  | { kind: 'activity'; id: string; title: string }
  | { kind: 'program'; id: string; title: string; programVersionId: string }

const viewerTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

const dayName = (localDate: string, todayIso: string) =>
  localDate === todayIso ? 'today' : dateLabel(localDate, { weekday: 'short', month: 'short', day: 'numeric' })

/**
 * The one Add to Schedule dialog (03-UX §2a, 13 §4): the Calendar's date picker, then an optional time
 * for an Activity, or a start date for a Program. The idempotency key lives as long as the dialog, so
 * repeated Saves add one Calendar item or one run.
 */
export function ScheduleDialog({
  target,
  onClose,
  onScheduled,
}: {
  target: ScheduleTarget
  onClose: () => void
  onScheduled?: (localDate: string) => void
}) {
  const [todayIso] = useState(() => today(viewerTimezone()))
  const addItem = useAddCalendarItem()
  const joinProgram = useJoinProgram(target.id)
  const [localDate, setLocalDate] = useState(todayIso)
  const [localTime, setLocalTime] = useState('')
  const [repeat, setRepeat] = useState<Repeat>('ONCE')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [ends, setEnds] = useState<Ends>('ONGOING')
  const [endDate, setEndDate] = useState('')
  const choice = { repeat, startDate: localDate, weekdays, ends, endDate }
  const chooseRepeat = (next: Repeat) => {
    setRepeat(next)
    if (next === 'WEEKLY' && weekdays.length === 0) setWeekdays([weekdayOf(localDate)])
  }
  const toggleWeekday = (d: number) =>
    setWeekdays((days) => (days.includes(d) ? (days.length > 1 ? days.filter((x) => x !== d) : days) : [...days, d]))
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const pending = addItem.isPending || joinProgram.isPending
  const isProgram = target.kind === 'program'

  const save = async () => {
    if (pending) return
    try {
      if (target.kind === 'program') {
        await joinProgram.mutateAsync({
          programVersionId: target.programVersionId,
          startLocalDate: localDate,
          timezone: viewerTimezone(),
          idempotencyKey,
        })
        toast.success(`${target.title} starts ${dayName(localDate, todayIso)}`)
      } else {
        const { recurrence, untilDate } = buildRecurrence(choice)
        await addItem.mutateAsync({
          activityId: target.id,
          localDate,
          localTime: localTime || undefined,
          ...(recurrence ? { recurrence, untilDate } : {}),
          idempotencyKey,
        })
        toast.success(
          recurrence
            ? `${target.title}: ${recurrenceSummary(choice).toLowerCase()}, from ${dayName(localDate, todayIso)}`
            : `Added ${target.title} to ${dayName(localDate, todayIso)}`,
        )
      }
      onScheduled?.(localDate)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add it to your Calendar')
    }
  }

  const shortDay = localDate === todayIso ? 'Today' : dateLabel(localDate, { month: 'short', day: 'numeric' })
  return (
    <Dialog
      onClose={onClose}
      aria-label={`Add ${target.title} to Schedule`}
      className="m-auto h-fit max-h-[92dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-[var(--radius-panel)] border border-border bg-surface p-0 text-inherit shadow-lg backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold">Add to Schedule</h2>
          <p className="text-sm text-muted">
            {target.title}
            {isProgram ? ' · choose a start date' : ' · choose a start date and how often'}
          </p>
        </div>
        <DatePickerPopover
          inline
          minDate={todayIso}
          selected={localDate}
          todayDate={todayIso}
          onSelect={setLocalDate}
          onClose={onClose}
        />
        {!isProgram && (
          <>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted">Time (optional)</span>
              <input
                type="time"
                value={localTime}
                onChange={(e) => setLocalTime(e.target.value)}
                className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm"
              />
            </label>
            <div role="radiogroup" aria-label="Repeat" className="grid grid-cols-4 gap-1.5">
              {REPEATS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={repeat === r.id}
                  onClick={() => chooseRepeat(r.id)}
                  className={chip(repeat === r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {repeat === 'WEEKLY' && (
              <div role="group" aria-label="Repeat on" className="flex justify-between gap-1">
                {DAY_CHIPS.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={weekdays.includes(i)}
                    aria-label={DAY_NAMES[i]}
                    onClick={() => toggleWeekday(i)}
                    className={cn(chip(weekdays.includes(i)), 'h-9 w-9 px-0')}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
            {repeat !== 'ONCE' && (
              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">Ends</span>
                  <select
                    value={ends}
                    onChange={(e) => setEnds(e.target.value as Ends)}
                    className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                  >
                    {ENDS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                {ends === 'ON_DATE' && (
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted">Last day</span>
                    <input
                      type="date"
                      min={localDate}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                    />
                  </label>
                )}
                <p className="text-sm font-medium" aria-live="polite">
                  {recurrenceSummary(choice)}
                </p>
              </div>
            )}
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={pending}
            // "Until a date" needs that date; never send an open-ended rule by mistake.
            disabled={pending || (!isProgram && repeat !== 'ONCE' && ends === 'ON_DATE' && !endDate)}
            onClick={() => void save()}
          >
            {isProgram ? `Start ${shortDay}` : repeat !== 'ONCE' ? 'Save' : `Save to ${shortDay}`}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/**
 * The shared Add to Schedule button: opens ScheduleDialog in place, or asks a signed-out viewer to
 * sign in and come back. Used on Home (surfer, previews) and on Program pages.
 */
export function AddToScheduleButton({
  target,
  signedIn,
  returnTo,
  iconOnly = false,
  className,
  onScheduled,
}: {
  target: ScheduleTarget
  signedIn: boolean
  returnTo: string
  iconOnly?: boolean
  className?: string
  onScheduled?: (localDate: string) => void
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label={iconOnly ? 'Add to Schedule' : undefined}
        title={iconOnly ? 'Add to Schedule' : undefined}
        onClick={() => (signedIn ? setOpen(true) : navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`))}
        className={cn(
          'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-surface-raised text-sm font-medium transition hover:bg-surface-muted',
          iconOnly ? 'h-12 w-12' : 'min-h-10 px-4 py-2',
          className,
        )}
      >
        <CalendarPlus size={iconOnly ? 18 : 14} aria-hidden />
        {!iconOnly && <span>Add to Schedule</span>}
      </button>
      {open && <ScheduleDialog target={target} onClose={() => setOpen(false)} onScheduled={onScheduled} />}
    </>
  )
}
