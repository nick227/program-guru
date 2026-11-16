import { useEffect, useId, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { useLocationSearch, useCurrentUser, type components } from '@project/sdk'
import { LocationForm } from './LocationForm'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'

export type Location = components['schemas']['Place']
export type LocationSelection = Location | null | undefined

/** Undefined preserves inheritance; null is an explicit removal. */
export function LocationButton({ value, onChange, disabled = false, publicOnly = false }: {
  value: LocationSelection
  onChange: (place: Location | null) => void
  publicOnly?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return <>
    <Button variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
      <MapPin size={15} aria-hidden />{value ? `Change Location: ${value.name}` : 'Add Location'}
    </Button>
    {open && <LocationPicker publicOnly={publicOnly} value={value} onSave={onChange} onClose={() => setOpen(false)} />}
  </>
}

/** Search the shared directory or submit a new location without claiming a business. */
export function LocationPicker({ value, onSave, onClose, recurring = false, gathering = false, publicOnly = false }: {
  value: LocationSelection
  onSave: (place: Location | null, scope: 'THIS_ONE' | 'THIS_AND_FUTURE') => void | Promise<void>
  onClose: () => void
  publicOnly?: boolean
  recurring?: boolean
  gathering?: boolean
}) {
  const me = useCurrentUser()
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => { const timer = window.setTimeout(() => setSearch(query.trim()), 200); return () => clearTimeout(timer) }, [query])
  const places = useLocationSearch(search, publicOnly)
  const [selected, setSelected] = useState(value ?? null)
  const [scope, setScope] = useState<'THIS_ONE' | 'THIS_AND_FUTURE'>('THIS_ONE')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const name = useId()
  const matches = places.data?.pages.flatMap(page => page.data) ?? []
  const save = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setSaving(true)
    setError(null)
    try {
      await onSave(selected, scope)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the location. Try again.')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }
  return <Dialog onClose={() => { if (!inFlight.current) onClose() }} aria-label="Choose location"
    className="m-auto h-fit max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-[var(--radius-panel)] border border-border bg-surface p-5 text-inherit shadow-lg backdrop:bg-black/60">
    <h2 className="font-display text-lg font-semibold">Location</h2>
    {creating ? <LocationForm publicOnly={publicOnly} onSaved={place => { setSelected(place); setCreating(false) }} onCancel={() => setCreating(false)} /> : <fieldset disabled={saving} className="mt-4 flex min-w-0 flex-col gap-3">
      <label className="text-sm">Search by name or address
        <Input autoFocus value={query} onChange={e => setQuery(e.target.value)} className="mt-1" />
      </label>
      {places.isPending && <p role="status">Loading locations…</p>}
      {places.isError && <div role="alert">Could not load locations. <Button variant="ghost" onClick={() => void places.refetch()}>Retry</Button></div>}
      <div role="radiogroup" aria-label="Locations" className="flex max-h-64 flex-col gap-2 overflow-y-auto">
        <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
          <input type="radio" name={name} checked={!selected} onChange={() => setSelected(null)} />No location
        </label>
        {selected && !matches.some(p => p.id === selected.id) && <p className="text-sm">Selected: {selected.name}</p>}
        {matches.map(p => <label key={p.id} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
          <input type="radio" name={name} checked={selected?.id === p.id} onChange={() => setSelected(p)} />
          <span><strong>{p.name}</strong><span className="block text-muted">{[p.addressLine, p.locality, p.region].filter(Boolean).join(', ')}</span></span>
        </label>)}
      </div>
      {!places.isPending && !places.isError && matches.length === 0 && <p role="status" className="text-sm text-muted">No matching locations.</p>}
      {places.hasNextPage && <Button variant="ghost" loading={places.isFetchingNextPage} onClick={() => void places.fetchNextPage()}>More locations</Button>}
      {!!me.data && <Button variant="outline" onClick={() => setCreating(true)}>Add a new location</Button>}
      {recurring && <label className="text-sm">Apply to
        <select aria-label="Apply location to" value={scope} onChange={e => setScope(e.target.value as typeof scope)} className="ml-2 rounded border border-border bg-surface p-2">
          <option value="THIS_ONE">This one</option><option value="THIS_AND_FUTURE">This and future</option>
        </select>
      </label>}
      {gathering && selected?.id !== value?.id && <p className="text-sm text-muted">Changing this location leaves the gathering. The others keep their location.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={saving} onClick={() => void save()}>{selected ? 'Use location' : 'Remove location'}</Button>
      </div>
    </fieldset>}
  </Dialog>
}
