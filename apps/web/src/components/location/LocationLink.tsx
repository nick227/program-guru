import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import type { Location } from './LocationPicker'

/** Physical location and business association are deliberately separate from hosting. */
export function LocationLink({ place }: { place: Location }) {
  const [open, setOpen] = useState(false)
  const address = [place.addressLine, place.locality, place.region, place.postalCode, place.countryCode].filter(Boolean).join(', ')
  if (place.businessProfile) return <Link className="font-medium text-accent hover:underline" to={place.businessProfile.profileUrl} title={`View ${place.businessProfile.displayName}`}>{place.name}</Link>
  return <>
    <button type="button" className="font-medium text-accent hover:underline" onClick={() => setOpen(true)}>{place.name}</button>
    {open && <Dialog onClose={() => setOpen(false)} aria-label={place.name} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-surface p-5 text-inherit backdrop:bg-black/60">
      <h2 className="text-lg font-semibold">{place.name}</h2><p className="mt-2 text-sm">{address}</p>
      {place.accessNote && <p className="mt-2 text-sm text-muted">{place.accessNote}</p>}
      {place.sourceUrl && <a className="mt-3 block text-accent" href={place.sourceUrl} target="_blank" rel="noopener noreferrer">Visitor information</a>}
      <Button className="mt-4" variant="outline" onClick={() => setOpen(false)}>Close location</Button>
    </Dialog>}
  </>
}
