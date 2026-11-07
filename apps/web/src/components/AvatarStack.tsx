import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'

export function AvatarStack({
  people,
  max = 4,
  className,
}: {
  people: { id: string; name: string; avatarUrl?: string | null }[]
  max?: number
  className?: string
}) {
  if (!people.length) return null
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <ul
      className={cn('flex -space-x-2', className)}
      aria-label={people.map((p) => p.name).join(', ')}
    >
      {shown.map((p) => (
        <li key={p.id}>
          <Avatar
            src={p.avatarUrl}
            name={p.name}
            size="sm"
            className="ring-2 ring-surface"
          />
        </li>
      ))}
      {extra > 0 && (
        <li
          className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-muted text-[10px] font-semibold ring-2 ring-surface"
          aria-label={`${extra} more`}
        >
          +{extra}
        </li>
      )}
    </ul>
  )
}
