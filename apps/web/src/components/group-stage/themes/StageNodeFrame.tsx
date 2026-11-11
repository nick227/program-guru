import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import type { StageMemberNode } from '../stageEvents'

export function StageNodeFrame({
  node,
  selected,
  bursting,
  burstEmoji,
  viewerId,
  accentClass,
  haloClass,
  badge,
  onSelect,
}: {
  node: StageMemberNode
  selected: boolean
  bursting: boolean
  burstEmoji?: string | null
  viewerId?: string
  accentClass: string
  haloClass: string
  badge?: ReactNode
  onSelect: () => void
}) {
  const { member, latestCheckIn, checkedInRecently, checkedInCount, x, y } = node
  const isMe = member.user.id === viewerId
  const firstName = isMe ? 'You' : member.user.displayName.split(' ')[0]

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{ left: `${x}%`, top: `${y}%` }}
      aria-label={`${member.user.displayName}${latestCheckIn ? `, ${latestCheckIn.activityTitle}` : ''}`}
      aria-pressed={selected}
      className={cn(
        'group absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 rounded-2xl p-1.5 transition-transform duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        selected ? 'scale-110 z-20' : 'hover:scale-105 z-10',
      )}
    >
      <div className="relative flex items-center justify-center">
        {bursting && (
          <span
            aria-hidden
            className={cn(
              'stage-checkin-ripple pointer-events-none absolute inset-[-10px] rounded-full border-2',
              haloClass,
            )}
          />
        )}
        {checkedInRecently && (
          <span
            aria-hidden
            className={cn(
              'stage-pulse-ring pointer-events-none absolute inset-[-5px] rounded-full border',
              haloClass,
            )}
          />
        )}
        <Avatar
          src={member.user.avatarUrl}
          name={member.user.displayName}
          size="md"
          className={cn(
            'h-12 w-12 sm:h-14 sm:w-14 ring-2 transition-all duration-300',
            checkedInRecently ? accentClass : 'ring-white/20 opacity-80',
            selected && 'ring-white shadow-lg',
          )}
        />
        {checkedInRecently && (
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-status-completed text-[10px] font-bold text-black shadow"
          >
            <Check size={11} strokeWidth={3} />
          </span>
        )}
        {badge}
        {bursting && burstEmoji && (
          <span
            aria-hidden
            className="stage-float-up pointer-events-none absolute -top-7 text-xl drop-shadow"
          >
            {burstEmoji}
          </span>
        )}
      </div>
      <span className="max-w-[5.5rem] truncate rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm">
        {firstName}
        {checkedInCount > 0 ? ` · ${checkedInCount}` : ''}
      </span>
    </button>
  )
}

