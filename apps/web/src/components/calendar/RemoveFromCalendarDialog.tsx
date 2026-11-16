import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export type RemoveScope = 'THIS_ONE' | 'THIS_AND_FUTURE'

export type RemoveTarget = {
  id: string
  title: string
  /** "Sun, Nov 15 · 7:30 AM" */
  whenLabel: string
  recurring: boolean
  inGathering: boolean
}

const chip = (on: boolean) =>
  cn(
    'min-h-9 rounded-full border px-3 text-sm font-medium transition',
    on ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface hover:bg-surface-raised',
  )

/**
 * Compact confirmation for removing one Calendar entry (09 §4.8). Removal cancels the entry only:
 * the Activity stays reusable and nothing is marked complete. A recurring entry asks This one /
 * This and future, like Reschedule.
 */
export function RemoveFromCalendarDialog({
  target,
  pending = false,
  onConfirm,
  onClose,
}: {
  target: RemoveTarget
  pending?: boolean
  onConfirm: (scope: RemoveScope) => void
  onClose: () => void
}) {
  const [scope, setScope] = useState<RemoveScope>('THIS_ONE')
  return (
    <Dialog
      onClose={onClose}
      aria-labelledby="remove-from-calendar-title"
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
          <h2 id="remove-from-calendar-title" className="font-display text-lg font-semibold">
            Edit Calendar
          </h2>
          <p className="break-words text-sm text-foreground">
            <strong className="font-semibold">{target.title}</strong>
            <br /><span className="text-muted">{target.whenLabel}</span>
          </p>
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

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" loading={pending} disabled={pending}>
            {!pending && <Trash2 size={15} aria-hidden />}
            Remove
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
