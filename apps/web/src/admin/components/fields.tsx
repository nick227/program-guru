// Field rendering for ResourceForm: one frame (label, control, help, error, trailing actions) and
// one control per field kind. Specialized kinds (visibility, duration, reference) live
// here so every resource gets them by name.
import { useEffect, useId, useState, type ReactNode } from 'react'
import { PROGRAM_DURATION_PRESETS } from '@/components/program-authoring/programFields'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import type { Field, FieldProps, Option, Options } from '../types'

/**
 * Trailing actions for a field, rendered beside its label. Empty today. The planned field-level
 * writing assistant registers one provider here that returns its button for `field.assist` fields
 * (generate, improve, shorten, rewrite) and writes the result with `setValue`. Forms do not change.
 */
export type FieldActionProvider = (args: { field: Field<any>; value: unknown; setValue: (v: unknown) => void }) => ReactNode
export const fieldActions: FieldActionProvider[] = []

export function FieldFrame({ id, label, help, error, required, actions, children }: { id: string; label: string; help?: string; error?: string; required?: boolean; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="label">
          {label}
          {required && <span className="text-muted"> *</span>}
        </label>
        {actions}
      </div>
      {children}
      {help && !error && <p className="text-xs text-muted">{help}</p>}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}

const VISIBILITY: Option[] = [
  { value: 'PRIVATE', label: 'Private' },
  { value: 'UNLISTED', label: 'Unlisted' },
  { value: 'PUBLIC', label: 'Public' },
]
const DURATIONS = PROGRAM_DURATION_PRESETS

/** Resolves static or hook-backed options. Called during render, so option hooks are allowed. */
function useOptions<V>(options: Options<V>, values: V) {
  return typeof options === 'function' ? options(values) : options
}

export function FieldControl<V>({ field, ...p }: { field: Field<V> } & FieldProps<V>) {
  const common = { id: p.id, disabled: p.disabled, 'aria-invalid': p.invalid || undefined, 'aria-describedby': p.invalid ? `${p.id}-error` : undefined }
  switch (field.kind) {
    case 'text':
      return <Input {...common} value={(p.value as string) ?? ''} maxLength={field.maxLength} placeholder={field.placeholder} onChange={(e) => p.onChange(e.target.value)} />
    case 'textarea':
      return <Textarea {...common} value={(p.value as string) ?? ''} maxLength={field.maxLength} rows={field.rows ?? 4} placeholder={field.placeholder} onChange={(e) => p.onChange(e.target.value)} />
    case 'number':
      return (
        <div className="flex items-center gap-2">
          <Input {...common} type="number" className="max-w-32" min={field.min} max={field.max} value={p.value === null || p.value === undefined ? '' : String(p.value)} onChange={(e) => p.onChange(e.target.value === '' ? null : Number(e.target.value))} />
          {field.suffix && <span className="text-sm text-muted">{field.suffix}</span>}
        </div>
      )
    case 'select':
      return <SelectControl field={field} {...p} common={common} />
    case 'boolean':
      return <input {...common} type="checkbox" className="h-5 w-5" checked={!!p.value} onChange={(e) => p.onChange(e.target.checked)} />
    case 'date':
      return <Input {...common} type="date" className="max-w-48" value={typeof p.value === 'string' ? p.value.slice(0, 10) : ''} onChange={(e) => p.onChange(e.target.value || null)} />
    case 'visibility':
      return <SegmentedControl ariaLabel={field.label} options={VISIBILITY} value={(p.value as string) ?? 'PRIVATE'} onChange={p.onChange} />
    case 'duration':
      return <DurationControl {...p} />
    case 'reference':
      return <ReferenceControl field={field} {...p} />
    case 'custom':
      return <>{field.render(p)}</>
  }
}

function SelectControl<V>({ field, common, ...p }: { field: Extract<Field<V>, { kind: 'select' }>; common: object } & FieldProps<V>) {
  const options = useOptions(field.options, p.values)
  return (
    <Select {...common} value={(p.value as string) ?? ''} onChange={(e) => p.onChange(e.target.value || null)}>
      <option value="">{field.placeholder ?? (field.required ? 'Choose…' : 'None')}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  )
}

function DurationControl<V>(p: FieldProps<V>) {
  const days = p.value as number | null | undefined
  const preset = days === null ? 'ongoing' : DURATIONS.includes(days ?? -1) ? String(days) : 'custom'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        ariaLabel="Duration"
        size="sm"
        options={[...DURATIONS.map((d) => ({ value: String(d), label: `${d / 7} wk` })), { value: 'ongoing', label: 'Ongoing' }, { value: 'custom', label: 'Days' }]}
        value={preset}
        onChange={(v) => p.onChange(v === 'ongoing' ? null : v === 'custom' ? (days ?? 30) : Number(v))}
      />
      {preset === 'custom' && <Input id={p.id} type="number" min={1} max={3650} className="max-w-24" value={days ?? ''} onChange={(e) => p.onChange(Number(e.target.value) || 1)} aria-label="Days" />}
    </div>
  )
}

function ReferenceControl<V>({ field, ...p }: { field: Extract<Field<V>, { kind: 'reference' }> } & FieldProps<V>) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [picked, setPicked] = useState<Option | null>(null)
  const listId = useId()
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])
  const { options, isLoading } = field.search(debounced)
  if (p.value && picked)
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-sm">{picked.label}</span>
        <button type="button" className="text-xs text-muted underline" onClick={() => (setPicked(null), p.onChange(null))}>
          Change
        </button>
      </div>
    )
  return (
    <div className="space-y-1">
      <Input id={p.id} aria-invalid={p.invalid || undefined} aria-controls={listId} value={q} placeholder={field.placeholder ?? 'Search…'} disabled={p.disabled} onChange={(e) => setQ(e.target.value)} />
      {debounced && (
        <ul id={listId} role="listbox" className="max-h-56 overflow-auto rounded-lg border border-border bg-surface">
          {isLoading && <li className="px-3 py-2 text-sm text-muted">Searching…</li>}
          {!isLoading && options.length === 0 && <li className="px-3 py-2 text-sm text-muted">No matches</li>}
          {options.map((o) => (
            <li key={o.value}>
              <button type="button" role="option" aria-selected={false} className="w-full px-3 py-2 text-left text-sm hover:bg-surface-muted" onClick={() => (setPicked(o), p.onChange(o.value))}>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
