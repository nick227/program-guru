import { useState } from 'react'
import { CalendarDays, CheckSquare, Trash2, X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { DatePickerPopover } from '@/components/calendar/DatePickerPopover'
import { planBulkMove, type BulkEntry, type BulkPlan, type SkipReason } from '@/lib/calendarBulk'
import { dateLabel } from '@/lib/dates'

const short = (d: string) => dateLabel(d, { weekday: 'short', month: 'short', day: 'numeric' })
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const REASON: Record<SkipReason, string> = { completed: 'completed', locked: 'locked', 'not open': 'skipped or removed' }

/**
 * The bulk bar (03-UX §5): pinned to the bottom of the viewport while selecting, so the toolbar
 * stays as it is. Count, Select day, Move, Remove, Cancel; progress while a bulk change runs.
 */
export function BulkActionBar({
  count,
  dayLabel,
  progress,
  online,
  onSelectDay,
  onMove,
  onRemove,
  onCancel,
}: {
  count: number
  /** "Tue, Nov 18": the day Select day applies to. */
  dayLabel: string
  progress: { verb: string; done: number; total: number } | null
  online: boolean
  onSelectDay: () => void
  onMove: () => void
  onRemove: () => void
  onCancel: () => void
}) {
  const busy = Boolean(progress)
  return (
    <>
    {/* Keeps the last rows reachable above the pinned bar. */}
    <div className="calendar-bulk-spacer" aria-hidden />
    <div className="calendar-bulk-bar" role="toolbar" aria-label="Selected Activities">
      <span className="calendar-bulk-bar__count" aria-live="polite">
        {progress ? `${progress.verb} ${progress.done} of ${progress.total}…` : count ? `${count} selected` : 'Select Activities'}
      </span>
      <div className="calendar-bulk-bar__actions">
        <button type="button" className="calendar-bulk-bar__btn" disabled={busy} onClick={onSelectDay} title={`Select every Activity on ${dayLabel}`}>
          <CheckSquare size={15} aria-hidden />
          <span className="calendar-bulk-bar__label">Select day</span>
        </button>
        <button type="button" className="calendar-bulk-bar__btn" disabled={busy || !count || !online} onClick={onMove}>
          <CalendarDays size={15} aria-hidden />
          <span>Move</span>
        </button>
        <button type="button" className="calendar-bulk-bar__btn calendar-bulk-bar__btn--danger" disabled={busy || !count || !online} onClick={onRemove}>
          <Trash2 size={15} aria-hidden />
          <span>Remove</span>
        </button>
        <button type="button" className="calendar-bulk-bar__btn" disabled={busy} onClick={onCancel} aria-label="Cancel selection">
          <X size={15} aria-hidden />
          <span className="calendar-bulk-bar__label">Cancel</span>
        </button>
      </div>
    </div>
    </>
  )
}

function PlanNotes<T extends BulkEntry>({ plan, verb }: { plan: BulkPlan<T>; verb: 'move' | 'remove' }) {
  const reasons = new Map<string, number>()
  for (const s of plan.skipped) reasons.set(REASON[s.reason], (reasons.get(REASON[s.reason]) ?? 0) + 1)
  return (
    <ul className="space-y-1 text-xs leading-relaxed text-muted">
      {plan.skipped.length > 0 && (
        <li>
          {plan.skipped.length} will stay as they are ({[...reasons].map(([r, n]) => `${n} ${r}`).join(', ')}).
        </li>
      )}
      {plan.recurring > 0 && (
        <li>
          {plural(plan.recurring, 'repeating entry', 'repeating entries')}: only {plan.recurring === 1 ? 'this occurrence' : 'these occurrences'}{' '}
          {verb === 'move' ? 'move' : 'are removed'}; the rest of each series stays.
        </li>
      )}
      {plan.inGathering > 0 && <li>{plural(plan.inGathering, 'entry', 'entries')} in a gathering will leave it.</li>}
      {verb === 'remove' && <li>The Activities stay in your library, and nothing is marked complete.</li>}
    </ul>
  )
}

/** Move N entries: choose where the earliest goes; every entry keeps its time and relative day. */
export function BulkMoveDialog<T extends BulkEntry>({
  plan,
  todayIso,
  onConfirm,
  onClose,
}: {
  plan: BulkPlan<T>
  todayIso: string
  onConfirm: (toDate: string) => void
  onClose: () => void
}) {
  const first = plan.apply[0]
  const singleDay = plan.apply.every((e) => e.day === first?.day)
  const [toDate, setToDate] = useState(first && first.day >= todayIso ? first.day : todayIso)
  const { shift } = planBulkMove(plan.apply, toDate)
  const unchanged = shift === 0
  return (
    <Dialog
      onClose={onClose}
      aria-labelledby="bulk-move-title"
      className="m-auto h-fit w-[calc(100%-2rem)] max-w-sm rounded-[var(--radius-panel)] border border-border bg-surface p-0 text-inherit shadow-lg backdrop:bg-black/60"
    >
      <form
        method="dialog"
        className="flex flex-col gap-4 p-5"
        onSubmit={(event) => {
          event.preventDefault()
          if (plan.apply.length && !unchanged) onConfirm(toDate)
        }}
      >
        <div className="space-y-1">
          <h2 id="bulk-move-title" className="font-display text-lg font-semibold">
            Move {plural(plan.apply.length, 'Activity', 'Activities')}
          </h2>
          <p className="text-sm text-muted">
            {singleDay
              ? `From ${first ? short(first.day) : ''} to the date you choose. Times stay.`
              : 'Choose where the earliest goes; the rest keep their spacing and times.'}
          </p>
        </div>
        <DatePickerPopover inline minDate={todayIso} selected={toDate} todayDate={todayIso} onSelect={setToDate} onClose={onClose} />
        {first && (
          <p className="text-sm font-medium" aria-live="polite">
            {unchanged
              ? 'Choose another date.'
              : `${short(first.day)} → ${short(toDate)} (${shift > 0 ? '+' : ''}${plural(shift, 'day')})`}
          </p>
        )}
        <PlanNotes plan={plan} verb="move" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!plan.apply.length || unchanged}>
            <CalendarDays size={15} aria-hidden />
            Move {plan.apply.length}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Remove N entries from the Calendar (cancel only; never the Activity, never a completion). */
export function BulkRemoveDialog<T extends BulkEntry>({
  plan,
  onConfirm,
  onClose,
}: {
  plan: BulkPlan<T>
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog
      onClose={onClose}
      aria-labelledby="bulk-remove-title"
      className="m-auto h-fit w-[calc(100%-2rem)] max-w-sm rounded-[var(--radius-panel)] border border-border bg-surface p-0 text-inherit shadow-lg backdrop:bg-black/60"
    >
      <form
        method="dialog"
        className="flex flex-col gap-4 p-5"
        onSubmit={(event) => {
          event.preventDefault()
          if (plan.apply.length) onConfirm()
        }}
      >
        <div className="space-y-1">
          <h2 id="bulk-remove-title" className="font-display text-lg font-semibold">
            Remove {plural(plan.apply.length, 'Activity', 'Activities')} from Calendar?
          </h2>
          <ul className="max-h-32 overflow-y-auto text-sm">
            {plan.apply.slice(0, 8).map((e) => (
              <li key={e.id} className="truncate">
                <strong className="font-semibold">{e.title}</strong>
                <span className="text-muted"> · {short(e.day)}</span>
              </li>
            ))}
            {plan.apply.length > 8 && <li className="text-muted">and {plan.apply.length - 8} more</li>}
          </ul>
        </div>
        <PlanNotes plan={plan} verb="remove" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={!plan.apply.length}>
            <Trash2 size={15} aria-hidden />
            Remove {plan.apply.length}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
