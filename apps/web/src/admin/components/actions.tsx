// Runs Actions for ResourceTable rows and ResourceEditor headers: optional confirmation (with an
// audit reason when the action records one), the mutation, a toast, and an admin cache refresh.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { adminKey } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { Action, ActionContext } from '../types'

const text = <R,>(v: string | ((r: R) => string) | undefined, row: R) => (typeof v === 'function' ? v(row) : v)

type Pending<R> = { action: Action<R>; row: R; run: (row: R, ctx: ActionContext) => Promise<unknown> }

/** Hook-backed runners for a fixed list of actions (hooks are called once each, in order). */
export function useActionRunner<R>(actions: Action<R>[]) {
  const runners = actions.map((a) => a.useRun?.())
  const cache = useQueryClient()
  const [pending, setPending] = useState<Pending<R> | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function execute(p: Pending<R>, ctx: ActionContext) {
    const label = text(p.action.label, p.row)!
    setBusy(label)
    try {
      await p.run(p.row, ctx)
      await cache.invalidateQueries({ queryKey: adminKey })
      toast.success(`${label}: done`)
      setPending(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${label} failed`)
    } finally {
      setBusy(null)
    }
  }

  function trigger(index: number, row: R) {
    const action = actions[index]!
    const run = runners[index]
    if (!run) return
    const p = { action, row, run }
    if (action.confirm || action.reason) setPending(p)
    else void execute(p, { reason: '' })
  }

  const dialog = pending ? <ConfirmDialog key={text(pending.action.label, pending.row)} pending={pending} busy={!!busy} onCancel={() => setPending(null)} onConfirm={(reason) => void execute(pending, { reason })} /> : null
  return { trigger, dialog, busy }
}

/** Renders the visible actions for one row as compact buttons and links. */
export function ActionButtons<R>({ actions, row, runner, size = 'sm' }: { actions: Action<R>[]; row: R; runner: ReturnType<typeof useActionRunner<R>>; size?: 'sm' | 'md' }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {actions.map((a, i) => {
        if (a.when && !a.when(row)) return null
        const label = text(a.label, row)!
        if (a.href)
          return (
            <Link key={label} to={a.href(row)} className={`btn btn--outline btn--${size}`}>
              {label}
            </Link>
          )
        return (
          <Button key={label} size={size} variant={a.tone === 'danger' ? 'destructive' : 'outline'} loading={runner.busy === label} disabled={!!runner.busy} onClick={() => runner.trigger(i, row)}>
            {label}
          </Button>
        )
      })}
    </div>
  )
}

function ConfirmDialog<R>({ pending, busy, onCancel, onConfirm }: { pending: Pending<R>; busy: boolean; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState('')
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  const label = text(pending.action.label, pending.row)!
  const needsReason = !!pending.action.reason
  return (
    <dialog ref={ref} className="admin-dialog" onCancel={onCancel} aria-labelledby="admin-confirm-title">
      <form
        method="dialog"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!needsReason || reason.trim()) onConfirm(reason.trim())
        }}
      >
        <h2 id="admin-confirm-title" className="text-lg font-semibold">
          {label}?
        </h2>
        {pending.action.confirm && <p className="text-sm text-muted">{text(pending.action.confirm, pending.row)}</p>}
        {needsReason && (
          <label className="field">
            <span className="label">Reason (kept in the audit log)</span>
            <Input autoFocus value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant={pending.action.tone === 'danger' ? 'destructive' : 'default'} loading={busy} disabled={busy || (needsReason && !reason.trim())}>
            {label}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
