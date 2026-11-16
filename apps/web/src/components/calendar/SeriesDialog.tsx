import { useState } from 'react'
import { toast } from 'sonner'
import { useEndCalendarRecurrence, useUpdateCalendarRecurrence, type components } from '@project/sdk'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/Feedback'
import { ruleLabel, untilLabel, weekdayOf } from '@/components/schedule/recurrencePlan'
import { dateLabel } from '@/lib/dates'
import { parseTargetTime, targetTimeInput } from '@/lib/targetTime'
import { cn } from '@/lib/utils'

type Recurrence = components['schemas']['CalendarRecurrence']
type Rule = components['schemas']['RecurrenceRule']
type Kind = 'DAILY' | 'WEEKDAYS' | 'WEEKLY' | 'EVERY_N_DAYS' | 'MONTHLY'

/** Monday first; the API counts 0 = Sunday. */
const WEEK = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [0, 'Sun'],
] as const

const chip = (on: boolean) =>
  cn(
    'min-h-9 rounded-full border px-3 text-sm font-medium transition',
    on ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface hover:bg-surface-raised',
  )

const short = (d: string) => dateLabel(d, { weekday: 'short', month: 'short', day: 'numeric' })

/**
 * Edit or end a personal series from one of its entries (03-UX §5, 09 §4.8). Changes apply from that
 * entry's date on (This and future); earlier entries, completions and results never change. Moved
 * entries keep their own date.
 */
export function SeriesDialog({
  mode,
  recurrence,
  fromDate,
  onClose,
}: {
  mode: 'edit' | 'end'
  recurrence: Recurrence
  /** The selected entry's date: the series changes from here on. */
  fromDate: string
  onClose: () => void
}) {
  const update = useUpdateCalendarRecurrence()
  const end = useEndCalendarRecurrence()
  const [kind, setKind] = useState<Kind>(recurrence.rule.kind as Kind)
  const [weekdays, setWeekdays] = useState<number[]>(
    recurrence.rule.weekdays?.length ? recurrence.rule.weekdays : [weekdayOf(fromDate)],
  )
  const [n, setN] = useState(recurrence.rule.n ?? 2)
  const [time, setTime] = useState(targetTimeInput(recurrence.localTime))
  const [ongoing, setOngoing] = useState(!recurrence.untilDate)
  const [until, setUntil] = useState(recurrence.untilDate ?? '')
  const pending = update.isPending || end.isPending

  const rule: Rule =
    kind === 'WEEKLY'
      ? { kind, weekdays: [...weekdays].sort((a, b) => a - b) }
      : kind === 'EVERY_N_DAYS'
        ? { kind, n }
        : { kind }
  const untilDate = ongoing ? null : until && until >= fromDate ? until : null
  const invalidEnd = !ongoing && !untilDate
  const summary = `${ruleLabel(rule, fromDate)} · ${untilLabel(untilDate)}`

  const save = async () => {
    try {
      if (mode === 'end') {
        await end.mutateAsync({ recurrenceId: recurrence.id, effectiveFromDate: fromDate })
        toast.success(`${recurrence.title} ends before ${short(fromDate)}`)
      } else {
        await update.mutateAsync({
          recurrenceId: recurrence.id,
          rule,
          localTime: parseTargetTime(time),
          untilDate,
          effectiveFromDate: fromDate,
        })
        toast.success(`${recurrence.title} updated from ${short(fromDate)}`)
      }
      onClose()
    } catch {
      // Shown below.
    }
  }

  const toggleDay = (d: number) =>
    setWeekdays((days) => (days.includes(d) ? (days.length > 1 ? days.filter((x) => x !== d) : days) : [...days, d]))

  return (
    <Dialog
      onClose={() => !pending && onClose()}
      aria-labelledby="series-dialog-title"
      className="m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-[var(--radius-panel)] border border-border bg-surface p-0 text-inherit shadow-lg backdrop:bg-black/60"
    >
      <form
        method="dialog"
        className="flex flex-col gap-4 p-5"
        onSubmit={(event) => {
          event.preventDefault()
          if (!pending && !(mode === 'edit' && invalidEnd)) void save()
        }}
      >
        <div className="space-y-1">
          <h2 id="series-dialog-title" className="font-display text-lg font-semibold">
            {mode === 'end' ? 'End this series?' : 'Edit series'}
          </h2>
          <p className="break-words text-sm">
            <strong className="font-semibold">{recurrence.title}</strong>
            <span className="text-muted"> · from {short(fromDate)}</span>
          </p>
        </div>

        {mode === 'edit' && (
          <>
            <div role="radiogroup" aria-label="Repeat" className="flex flex-wrap gap-1.5">
              {(
                [
                  ['DAILY', 'Daily'],
                  ['WEEKDAYS', 'Weekdays'],
                  ['WEEKLY', 'Weekly'],
                  ['EVERY_N_DAYS', 'Every few days'],
                  ['MONTHLY', 'Monthly'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)} className={chip(kind === id)}>
                  {label}
                </button>
              ))}
            </div>
            {kind === 'WEEKLY' && (
              <div role="group" aria-label="Days" className="flex flex-wrap gap-1.5">
                {WEEK.map(([d, label]) => (
                  <button key={d} type="button" aria-pressed={weekdays.includes(d)} onClick={() => toggleDay(d)} className={chip(weekdays.includes(d))}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {kind === 'EVERY_N_DAYS' && (
              <label className="flex items-center gap-2 text-sm">
                Every
                <input
                  type="number"
                  min={2}
                  max={365}
                  value={n}
                  onChange={(e) => setN(Math.min(365, Math.max(2, Number(e.target.value) || 2)))}
                  className="w-20 rounded-md border border-border bg-background px-2 py-1"
                />
                days
              </label>
            )}
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted">Time (optional)</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1"
              />
            </label>
            <div className="space-y-2">
              <div role="radiogroup" aria-label="Ends" className="flex flex-wrap gap-1.5">
                <button type="button" role="radio" aria-checked={ongoing} onClick={() => setOngoing(true)} className={chip(ongoing)}>
                  Ongoing
                </button>
                <button type="button" role="radio" aria-checked={!ongoing} onClick={() => setOngoing(false)} className={chip(!ongoing)}>
                  Until a date
                </button>
              </div>
              {!ongoing && (
                <input
                  type="date"
                  aria-label="Last date"
                  min={fromDate}
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              )}
            </div>
            <p className="text-sm font-medium" aria-live="polite">
              {invalidEnd ? 'Choose a last date on or after the start.' : summary}
            </p>
          </>
        )}

        <p className="text-xs leading-relaxed text-muted">
          {mode === 'end'
            ? `Planned entries from ${short(fromDate)} on are removed. Earlier entries, completions and results stay.`
            : `Applies from ${short(fromDate)} on. Earlier entries, completions and results stay; entries you moved keep their date.`}
        </p>

        <ErrorMessage error={update.error || end.error} />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={mode === 'end' ? 'destructive' : 'default'}
            loading={pending}
            disabled={pending || (mode === 'edit' && invalidEnd)}
          >
            {mode === 'end' ? 'End series' : 'Save'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
