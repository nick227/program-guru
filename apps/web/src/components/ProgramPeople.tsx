// My Programs summary (management level, compact): who you're doing this with and how many others
// are. Faces are only fellow members of your own group who share participation; everyone else is
// an aggregate count, hidden below the minimum sample (10-COLLABORATION §4).
import type { components } from '@project/sdk'
import { AvatarStack } from '@/components/AvatarStack'
import { participationLine } from '@/lib/together'

type Participation = components['schemas']['ProgramParticipation']

export function ProgramPeople({ participation: p }: { participation?: Participation }) {
  if (!p) return <span className="text-muted">—</span>
  const line = participationLine(p)
  if (!p.friends.length && !line) return <span className="text-muted">—</span>
  return (
    <div className="library-people">
      {p.friends.length > 0 && (
        <div className="flex items-center gap-2">
          <AvatarStack
            people={p.friends.map((f) => ({ id: f.id, name: f.displayName, avatarUrl: f.avatarUrl }))}
            max={4}
          />
          <span className="text-xs text-muted">
            with {p.friends[0]!.displayName.split(' ')[0]}
            {p.friendCount > 1 ? ` +${p.friendCount - 1}` : ''}
          </span>
        </div>
      )}
      {line && <small className="block text-xs text-muted">{line}</small>}
    </div>
  )
}
