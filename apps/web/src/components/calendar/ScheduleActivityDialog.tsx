import { useState } from 'react'
import { toast } from 'sonner'
import { useAddCalendarItem } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { dateLabel } from '@/lib/dates'
import { DatePickerPopover } from './DatePickerPopover'

/**
 * Add to Schedule without leaving the page (03-UX §2a): the Calendar's own date picker, an optional
 * time, one Save. The idempotency key lives as long as the dialog, so repeated Saves add one item.
 */
export function ScheduleActivityDialog({
  activity,
  todayIso,
  onClose,
  onScheduled,
}: {
  activity: { id: string; title: string }
  todayIso: string
  onClose: () => void
  onScheduled?: (item: { id: string; localDate: string }) => void
}) {
  const add = useAddCalendarItem()
  const [localDate, setLocalDate] = useState(todayIso)
  const [localTime, setLocalTime] = useState('')
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  const save = async () => {
    try {
      const result = await add.mutateAsync({
        activityId: activity.id,
        localDate,
        localTime: localTime || undefined,
        idempotencyKey,
      })
      const day = localDate === todayIso ? 'today' : dateLabel(localDate, { weekday: 'short', month: 'short', day: 'numeric' })
      toast.success(`Added ${activity.title} to ${day}`)
      onScheduled?.({ id: result.item.id, localDate })
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add it to your Calendar')
    }
  }

  return (
    <Dialog
      onClose={onClose}
      aria-label={`Add ${activity.title} to Schedule`}
      className="m-auto h-fit w-[calc(100%-2rem)] max-w-sm overflow-visible rounded-[var(--radius-panel)] border border-border bg-surface p-0 text-inherit shadow-lg backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold">Add to Schedule</h2>
          <p className="text-sm text-muted">{activity.title}</p>
        </div>
        <DatePickerPopover
          inline
          selected={localDate}
          todayDate={todayIso}
          onSelect={(day) => setLocalDate(day < todayIso ? todayIso : day)}
          onClose={onClose}
        />
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Time (optional)</span>
          <input
            type="time"
            value={localTime}
            onChange={(e) => setLocalTime(e.target.value)}
            className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={add.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={add.isPending} disabled={add.isPending} onClick={() => void save()}>
            Save to {localDate === todayIso ? 'Today' : dateLabel(localDate, { month: 'short', day: 'numeric' })}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
