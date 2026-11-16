import { LocationLink } from '@/components/location/LocationLink'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ExternalLink, MapPin } from 'lucide-react'
import { useUpdateCalendarItem, type components } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { LocationPicker } from '@/components/location/LocationPicker'

type Item = components['schemas']['CalendarItem']

/** One occurrence's location; never edits its activity definition or publishes its calendar. */
export function ScheduledPlace({ item }: { item: Item }) {
  const [editing, setEditing] = useState(false)
  const update = useUpdateCalendarItem()
  const navigate = useNavigate()
  const place = item.place
  return <div className="activity-hero__place">
    <MapPin size={14} aria-hidden />
    {place && <>
      <span><LocationLink place={place} />, {place.locality}</span>
      {place.sourceUrl && <a href={place.sourceUrl} target="_blank" rel="noopener noreferrer" className="activity-hero__place-link">Visitor info <ExternalLink size={12} aria-hidden /></a>}
    </>}
    <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>{place ? 'Change Location' : 'Add Location'}</Button>
    {editing && <LocationPicker value={place} recurring={!!item.recurrenceId} gathering={!!item.gatheringId}
      onClose={() => setEditing(false)} onSave={async (selected, scope) => {
        const placeId = selected?.id ?? null
        // No-op must not detach a gathering or split a recurrence.
        if (placeId === (place?.id ?? null)) return
        const saved = await update.mutateAsync({ itemId: item.id, placeId, expectedUpdatedAt: item.updatedAt, ...(item.recurrenceId ? { scope } : {}) })
        if (scope === 'THIS_AND_FUTURE' && saved.status === 'CANCELLED') {
          toast.success('Location updated for this and future activities')
          navigate(`/calendar?day=${item.localDate}`)
        }
      }} />}
    {place?.accessNote && <span className="activity-hero__place-note">{place.accessNote}</span>}
  </div>
}
