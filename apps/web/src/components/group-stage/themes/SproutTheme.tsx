import { Sprout } from 'lucide-react'
import { StageNodeFrame } from './StageNodeFrame'
import type { StageThemeDefinition, StageThemeRenderProps } from './types'

const PLAYFUL_BUDDIES = ['🌻', '🍄', '🪴', '🌷', '🌵', '🌼'] as const

function SproutScene({
  memberCount,
  checkedInMemberCount,
  nodes,
  selectedMemberId,
  burstMemberId,
  burstEmoji,
  viewerId,
  onSelectMember,
}: StageThemeRenderProps) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_50%_50%,rgba(52,211,153,0.18),rgba(10,28,22,0.95)_60%,#05100c_100%)]">
      {/* Ground meadow horizon */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-emerald-950/50 to-transparent"
      />

      {/* Central garden totem */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[48%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center"
      >
        <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 backdrop-blur-md shadow-[0_0_55px_rgba(16,185,129,0.22)]">
          <Sprout size={20} className="stage-sprout-sway mb-1 text-emerald-300" />
          <span className="text-lg font-bold tabular-nums text-emerald-50">
            {checkedInMemberCount}/{memberCount}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-emerald-200/80">
            bloomed
          </span>
        </div>
      </div>

      {nodes.map((node, index) => {
        const buddy = PLAYFUL_BUDDIES[index % PLAYFUL_BUDDIES.length]
        return (
          <StageNodeFrame
            key={node.member.user.id}
            node={node}
            selected={selectedMemberId === node.member.user.id}
            bursting={burstMemberId === node.member.user.id}
            burstEmoji={burstEmoji}
            viewerId={viewerId}
            accentClass="ring-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.45)]"
            haloClass="border-emerald-300/60"
            badge={
              <span
                aria-hidden
                className={
                  node.checkedInRecently
                    ? 'stage-sprout-sway absolute -top-3 -left-2 text-base drop-shadow'
                    : 'absolute -top-2.5 -left-1.5 text-xs opacity-65'
                }
              >
                {node.checkedInRecently ? buddy : '🌱'}
              </span>
            }
            onSelect={() => onSelectMember(node.member.user.id)}
          />
        )
      })}
    </div>
  )
}

export const sproutTheme: StageThemeDefinition = {
  id: 'sprout',
  label: 'Sprout Garden',
  description: 'Playful sprouting buddies that bloom when members check in',
  Scene: SproutScene,
}

