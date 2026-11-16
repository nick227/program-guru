import { useRef, useState } from 'react'
import { useCreatePlace, useUpdatePlace } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { Location } from './LocationPicker'

/** One name/address form for community submissions and the business owner's directory entry. */
export function LocationForm({ initial, business = false, publicOnly = false, onSaved, onCancel }: {
  initial?: Location; business?: boolean; publicOnly?: boolean; onSaved: (place: Location) => void; onCancel: () => void
}) {
  const create = useCreatePlace()
  const update = useUpdatePlace()
  const [name, setName] = useState(initial?.name ?? '')
  const [addressLine, setAddress] = useState(initial?.addressLine ?? '')
  const [locality, setLocality] = useState(initial?.locality ?? '')
  const [region, setRegion] = useState(initial?.region ?? '')
  const [countryCode, setCountry] = useState(initial?.countryCode ?? 'US')
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? '')
  const [privateAddress, setPrivateAddress] = useState(initial?.visibility === 'PRIVATE')
  const [error, setError] = useState<string | null>(null)
  const key = useRef(crypto.randomUUID())
  const inFlight = useRef(false)
  const pending = create.isPending || update.isPending
  const save = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setError(null)
    try {
      const fields = { name: name.trim(), addressLine: addressLine.trim(), locality, region, countryCode, postalCode: postalCode || null }
      const result = initial
        ? await update.mutateAsync({ placeId: initial.id, expectedUpdatedAt: initial.updatedAt!, ...fields })
        : await create.mutateAsync({ ...fields, visibility: privateAddress && !business && !publicOnly ? 'PRIVATE' : 'PUBLIC', linkToMyBusiness: business, idempotencyKey: key.current })
      onSaved(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save location')
    } finally { inFlight.current = false }
  }
  return <fieldset disabled={pending} className="flex min-w-0 flex-col gap-3" onChange={() => { key.current = crypto.randomUUID() }}>
    <legend className="mb-3 font-semibold">{initial ? 'Edit location' : business ? 'New business location' : 'New location'}</legend>
    <label className="text-sm">Location name<Input required maxLength={160} value={name} onChange={e => setName(e.target.value)} /></label>
    <label className="text-sm">Street address<Input required maxLength={200} value={addressLine} onChange={e => setAddress(e.target.value)} /></label>
    <label className="text-sm">City<Input maxLength={100} value={locality} onChange={e => setLocality(e.target.value)} /></label>
    <label className="text-sm">State / region<Input maxLength={100} value={region} onChange={e => setRegion(e.target.value)} /></label>
    <label className="text-sm">Country code<Input required maxLength={2} value={countryCode} onChange={e => setCountry(e.target.value.toUpperCase())} /></label>
    <label className="text-sm">Postal code<Input maxLength={32} value={postalCode} onChange={e => setPostalCode(e.target.value)} /></label>
    {!initial && !business && !publicOnly && <label className="flex gap-2 text-sm"><input type="checkbox" checked={privateAddress} onChange={e => setPrivateAddress(e.target.checked)} />Private address — only me</label>}
    {!initial && <p className="text-sm text-muted">{privateAddress && !business && !publicOnly ? 'Only you can find and use this address on your calendar.' : 'This name and address will be visible in the public location directory.'}{business ? ' It will link to your profile when your profile is public.' : ' Adding or using a place does not claim the business.'}</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="flex justify-end gap-2"><Button variant="outline" onClick={onCancel}>Cancel location</Button><Button loading={pending} disabled={!name.trim() || !addressLine.trim() || countryCode.length !== 2} onClick={() => void save()}>Save location</Button></div>
  </fieldset>
}
