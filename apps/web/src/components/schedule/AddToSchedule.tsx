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
        await addItem.mutateAsync({ activityId: target.id, localDate, localTime: localTime || undefined, idempotencyKey })
        toast.success(`Added ${target.title} to ${dayName(localDate, todayIso)}`)
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
      className="m-auto h-fit w-[calc(100%-2rem)] max-w-sm overflow-visible rounded-[var(--radius-panel)] border border-border bg-surface p-0 text-inherit shadow-lg backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold">Add to Schedule</h2>
          <p className="text-sm text-muted">
            {target.title}
            {isProgram && ' · choose a start date'}
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
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">Time (optional)</span>
            <input
              type="time"
              value={localTime}
              onChange={(e) => setLocalTime(e.target.value)}
              className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm"
            />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} disabled={pending} onClick={() => void save()}>
            {isProgram ? `Start ${shortDay}` : `Save to ${shortDay}`}
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
