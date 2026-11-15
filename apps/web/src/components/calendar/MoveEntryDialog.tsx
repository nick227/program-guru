import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { RemoveScope } from '@/components/calendar/RemoveFromCalendarDialog'

export type MoveTarget = {
  id: string
  title: string
  /** "Tue, Nov 18 · 7:30 AM" */
  toLabel: string
  toDay: string
  recurring: boolean
  inGathering: boolean
}

const chip = (on: boolean) =>
  cn(
    'min-h-9 rounded-full border px-3 text-sm font-medium transition',
    on ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface hover:bg-surface-raised',
  )

/**
 * Confirms a Month drop that affects more than one entry or a shared gathering (03-UX §5, 09 §4.8):
 * a recurring entry chooses This one (default) / This and future, so a single drag never silently
 * shifts a series; a gathering entry says that moving leaves the gathering (10 §9.6).
 */
export function MoveEntryDialog({
  target,
  pending = false,
  onConfirm,
  onClose,
}: {
  target: MoveTarget
  pending?: boolean
  onConfirm: (scope: RemoveScope) => void
  onClose: () => void
}) {
  const [scope, setScope] = useState<RemoveScope>('THIS_ONE')
  return (
    <Dialog
      onClose={onClose}
      aria-labelledby="move-entry-title"
      className="m-auto h-fit w-[calc(100%-2rem)] max-w-sm rounded-[var(--radius-panel)] border border-border bg-surface p-0 text-inherit shadow-lg backdrop:bg-black/60"
    >
      <form
        method="dialog"
        className="flex flex-col gap-4 p-5"
        onSubmit={(event) => {
          event.preventDefault()
          if (!pending) onConfirm(target.recurring ? scope : 'THIS_ONE')
        }}
      >
        <div className="space-y-1">
          <h2 id="move-entry-title" className="font-display text-lg font-semibold">
            Move to {target.toLabel}?
          </h2>
          <p className="break-words text-sm font-semibold">{target.title}</p>
        </div>

        {target.recurring && (
          <div role="radiogroup" aria-label="Which ones" className="grid grid-cols-2 gap-1.5">
            {(
              [
                ['THIS_ONE', 'This one'],
                ['THIS_AND_FUTURE', 'This and future'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={scope === id}
                onClick={() => setScope(id)}
                className={chip(scope === id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <p className="text-xs leading-relaxed text-muted">
          {target.recurring
            ? 'This and future moves every later entry of this series by the same number of days.'
            : 'Its time stays the same.'}
          {target.inGathering ? ' Moving leaves the gathering.' : ''}
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} disabled={pending}>
            {!pending && <CalendarDays size={15} aria-hidden />}
            Move
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
