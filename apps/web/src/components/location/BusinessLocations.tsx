import { useEffect, useState } from 'react'
import { useCurrentUser, useUpdateMyProfile, useUpdatePlace } from '@project/sdk'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Dialog } from '@/components/ui/Dialog'
import { LocationForm } from './LocationForm'
import { LocationLink } from './LocationLink'
import type { Location } from './LocationPicker'

export function BusinessLocations() {
  const me = useCurrentUser()
  const profile = me.data?.data.profile
  const updateProfile = useUpdateMyProfile()
  const updatePlace = useUpdatePlace()
  const [phone, setPhone] = useState(profile?.businessPhone ?? '')
  const [website, setWebsite] = useState(profile?.businessWebsite ?? '')
  const [editing, setEditing] = useState<Location | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setPhone(profile?.businessPhone ?? ''); setWebsite(profile?.businessWebsite ?? '') }, [profile?.businessPhone, profile?.businessWebsite])
  if (!profile) return null
  const change = async (place: Location, operation: 'unlink' | 'active') => {
    if (operation === 'unlink' && !window.confirm('Remove this location from your business profile? The location and activities stay in the directory.')) return
    setError(null)
    try {
      await updatePlace.mutateAsync({ placeId: place.id, expectedUpdatedAt: place.updatedAt!, ...(operation === 'unlink' ? { unlinkBusiness: true } : { isActive: !place.isActive }) })
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update location') }
  }
  return <section id="business" aria-label="Business information and locations" className="flex flex-col gap-4">
    <h2>Business information &amp; locations</h2>
    <p className="text-sm text-muted">Business contact details appear on your public profile. Location addresses are public directory entries. Associating a location does not mark it as verified or make you the host of activities created by others.</p>
    {profile.visibility !== 'PUBLIC' && <p className="text-sm text-muted">Your profile is private. Business contact details and profile links stay hidden until you make it public.</p>}
    <label className="text-sm">Business phone<Input type="tel" maxLength={40} value={phone} onChange={e => setPhone(e.target.value)} /></label>
    <label className="text-sm">Business website<Input type="url" maxLength={500} placeholder="https://example.com" value={website} onChange={e => setWebsite(e.target.value)} /></label>
    <Button className="self-start" loading={updateProfile.isPending} onClick={async () => {
      setError(null)
      try { await updateProfile.mutateAsync({ businessPhone: phone || null, businessWebsite: website || null }); toast.success('Business information saved') }
      catch (err) { setError(err instanceof Error ? err.message : 'Could not save business information') }
    }}>Save business information</Button>
    {error && <p role="alert" className="text-danger">{error}</p>}
    <ul className="space-y-3">{(profile.locations ?? []).map(place => <li key={place.id} className="rounded-lg border border-border p-3">
      <LocationLink place={place} /><p className="text-sm text-muted">{[place.addressLine, place.locality].filter(Boolean).join(', ')}{place.isActive === false ? ' · Inactive' : ''}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={updatePlace.isPending} onClick={() => setEditing(place)}>Edit location</Button>
        <Button size="sm" variant="ghost" disabled={updatePlace.isPending} onClick={() => void change(place, 'active')}>{place.isActive === false ? 'Reactivate' : 'Deactivate'}</Button>
        <Button size="sm" variant="ghost" disabled={updatePlace.isPending} onClick={() => void change(place, 'unlink')}>Remove business association</Button>
      </div>
    </li>)}</ul>
    <Button className="self-start" variant="outline" onClick={() => setEditing('new')}>Add business location</Button>
    <p className="text-xs text-muted">If your location is already listed, contact an administrator to associate it with your profile. Selecting it for an activity does not claim it.</p>
    {editing && <Dialog onClose={() => setEditing(null)} aria-label="Manage business location" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-5 text-inherit backdrop:bg-black/60">
      <LocationForm initial={editing === 'new' ? undefined : editing} business onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />
    </Dialog>}
  </section>
}
