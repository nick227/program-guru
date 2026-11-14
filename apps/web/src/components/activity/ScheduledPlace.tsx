import { useState } from 'react'
import { ExternalLink, MapPin } from 'lucide-react'
import { usePlaces, useUpdateCalendarItem, type components } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'

type Item = components['schemas']['CalendarItem']

/**
 * The scheduled place of one occurrence (09 §2, 03 §6): one quiet line inside the Hero. A Place is a
 * suggestion, never a host or booking. The owner can change or clear it for this occurrence only.
 */
export function ScheduledPlace({ item }: { item: Item }) {
  const [editing, setEditing] = useState(false)
  const places = usePlaces({ enabled: editing })
  const update = useUpdateCalendarItem()
  const place = item.place
  if (!place) return null

  const save = (placeId: string | null) =>
    update.mutate(
      { itemId: item.id, placeId, expectedUpdatedAt: item.updatedAt },
      { onSuccess: () => setEditing(false) },
    )

  return (
    <div className="activity-hero__place">
      <MapPin size={14} aria-hidden />
      <span>
        <strong className="font-semibold">{place.name}</strong>, {place.locality}
      </span>
      <a href={place.sourceUrl} target="_blank" rel="noopener noreferrer" className="activity-hero__place-link">
        Visitor info
        <ExternalLink size={12} aria-hidden />
      </a>
      {editing ? (
        <span className="activity-hero__place-edit">
          <Select
            aria-label="Place for this occurrence"
            value={place.id}
            disabled={update.isPending || places.isPending}
            onChange={(e) => save(e.target.value || null)}
          >
            <option value="">No place</option>
            {(places.data ?? [place]).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}, {p.locality}
              </option>
            ))}
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </span>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Change place
        </Button>
      )}
      {place.accessNote && <span className="activity-hero__place-note">{place.accessNote}</span>}
    </div>
  )
}
