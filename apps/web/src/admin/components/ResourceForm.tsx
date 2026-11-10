// A form generated from typed field definitions. It keeps local state, submits only changed fields,
// shows the server's fieldErrors beside the matching field, and blocks navigation while dirty.
// Domain validation stays on the server; the client only checks required values.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/Feedback'
import { usePwaReloadBlocker } from '@/lib/pwaSafety'
import { useOnline } from '@/lib/useOnline'
import { FieldControl, FieldFrame, fieldActions } from './fields'
import type { Field } from '../types'

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const empty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim())

export function ResourceForm<V extends Record<string, unknown>>({
  fields,
  initial,
  onSubmit,
  submitLabel = 'Save',
  submitAlways = false,
  footer,
  className,
}: {
  fields: Field<V>[]
  /** Server state. When its values change (a save or refetch), untouched fields follow it. */
  initial: V
  /** Receives every value and just the changed ones. Throw (an ApiError) to show errors. */
  onSubmit: (values: V, changes: Partial<V>) => Promise<unknown>
  submitLabel?: string
  /** Enable submit with no changes (create forms, publish). */
  submitAlways?: boolean
  footer?: ReactNode
  className?: string
}) {
  const [values, setValues] = useState<V>(initial)
  const [error, setError] = useState<unknown>(null)
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const online = useOnline()

  // Adopt new server state without discarding edits in progress.
  const base = useRef(initial)
  useEffect(() => {
    const previous = base.current
    // Compared by value: editors build `initial` inline from the record on every render.
    if (same(previous, initial)) return
    base.current = initial
    setValues((current) => {
      const next = { ...initial }
      for (const f of fields) if (!same(current[f.name], previous[f.name])) next[f.name] = current[f.name]
      return next
    })
  }, [initial, fields])

  const shown = fields.filter((f) => f.visible?.(values) ?? true)
  const changes = Object.fromEntries(shown.filter((f) => !same(values[f.name], initial[f.name])).map((f) => [f.name, values[f.name]])) as Partial<V>
  const dirty = Object.keys(changes).length > 0
  usePwaReloadBlocker(dirty || saving)
  const fieldErrors = error instanceof ApiError ? (error.fieldErrors ?? {}) : {}
  // Errors that all belong to visible fields are shown inline; anything else is shown below.
  const matched = Object.keys(fieldErrors).length > 0 && Object.keys(fieldErrors).every((k) => shown.some((f) => f.name === k))
  const general = matched ? null : error

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const absent = new Set(shown.filter((f) => f.required && empty(values[f.name])).map((f) => f.name))
    setMissing(absent)
    if (absent.size) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit(values, changes)
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className={className ?? 'space-y-4'} noValidate>
      {shown.map((field) => {
        const id = `admin-${field.name}`
        const message = missing.has(field.name) ? 'Required' : fieldErrors[field.name]
        const setValue = (v: unknown) => setValues((cur) => ({ ...cur, [field.name]: v }))
        const actions = fieldActions.map((provider, i) => <span key={i}>{provider({ field, value: values[field.name], setValue })}</span>)
        return (
          <FieldFrame key={field.name} id={id} label={field.label} help={field.help} error={message} required={field.required} actions={actions.length ? actions : undefined}>
            <FieldControl field={field} id={id} value={values[field.name]} values={values} onChange={setValue} invalid={!!message} disabled={saving || !!field.disabled?.(values)} />
          </FieldFrame>
        )
      })}
      <ErrorMessage error={general} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={saving} disabled={!online || saving || (!dirty && !submitAlways)}>
          {submitLabel}
        </Button>
        {dirty && !saving && (
          <Button type="button" variant="ghost" onClick={() => (setValues(initial), setError(null), setMissing(new Set()))}>
            Discard
          </Button>
        )}
        {footer}
      </div>
    </form>
  )
}
