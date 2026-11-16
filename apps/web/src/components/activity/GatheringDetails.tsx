import type { ReactNode } from 'react'
import { MapPin, Users } from 'lucide-react'
import type { components } from '@project/sdk'
import { Avatar } from '@/components/ui/Avatar'
import { gatheringWhen } from '@/lib/gatheringLabels'
import { lookingForText } from '@/lib/lookingFor'

type Gathering = components['schemas']['Gathering']

export function GatheringDetails({ gathering: g, children, showPlace = true }: { gathering: Gathering; children?: ReactNode; showPlace?: boolean }) {
  return <section className="activity-card space-y-3" aria-label="Gathering details">
    <h2 className="font-display text-xl font-semibold">{gatheringWhen(g)}</h2>
    {showPlace && g.place && (
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <MapPin size={15} aria-hidden />
        Suggested place: {g.place.name}, {g.place.locality}
      </p>
    )}
    <p className="flex items-center gap-1.5 text-sm text-muted">
      <Users size={15} aria-hidden />
      {g.memberCount} {g.memberCount === 1 ? 'person' : 'people'}
      {g.capacity ? ` of ${g.capacity}` : ''} · organized by {g.owner.displayName}
    </p>
    <div className="flex">
      {g.members.slice(0, 8).map((m) => (
        <Avatar key={m.id} src={m.avatarUrl} name={m.displayName} size="sm" className="-ml-1.5 h-8 w-8 ring-2 ring-background first:ml-0" />
      ))}
    </div>
    {g.lookingFor && (
      <p className="rounded-lg border border-border/60 bg-surface-muted/60 p-3 text-sm">
        {lookingForText(g.lookingFor)}
      </p>
    )}
    {g.categories.length > 0 && (
      <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Categories">
        {g.categories.map((c) => (
          <li key={c.id} className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-foreground/80">
            {c.label}
          </li>
        ))}
      </ul>
    )}

    <p className="text-xs text-muted">{g.visibility === 'PUBLIC' ? 'Listed publicly' : 'Invite only'}{g.completedCount > 0 ? ` · ${g.completedCount} finished` : ''}</p>
    {children}
    {g.status !== 'ACTIVE' && <p className="text-sm text-muted">This gathering was cancelled.</p>}
  </section>
}

