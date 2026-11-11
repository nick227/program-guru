import { Flame } from 'lucide-react'
import { StageNodeFrame } from './StageNodeFrame'
import type { StageThemeDefinition, StageThemeRenderProps } from './types'

function CampfireScene({
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
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_50%_52%,rgba(251,146,60,0.22),rgba(28,18,16,0.95)_55%,#0c0706_100%)]">
      {/* Subtle twilight glow halo around campfire */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[48%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center"
      >
        <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full border border-amber-400/30 bg-amber-500/15 backdrop-blur-md shadow-[0_0_64px_rgba(245,158,11,0.28)]">
          <Flame size={20} className="stage-ember-drift mb-1 text-amber-300" />
          <span className="text-lg font-bold tabular-nums text-amber-50">
            {checkedInMemberCount}/{memberCount}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-amber-200/80">
            lit up
          </span>
        </div>
      </div>

      {nodes.map((node) => (
        <StageNodeFrame
          key={node.member.user.id}
          node={node}
          selected={selectedMemberId === node.member.user.id}
          bursting={burstMemberId === node.member.user.id}
          burstEmoji={burstEmoji}
          viewerId={viewerId}
          accentClass="ring-amber-400 shadow-[0_0_26px_rgba(251,146,60,0.5)]"
          haloClass="border-amber-300/60"
          badge={
            node.checkedInRecently ? (
              <span
                aria-hidden
                className="stage-ember-drift absolute -top-2.5 -left-1.5 text-sm drop-shadow"
              >
                🏮
              </span>
            ) : null
          }
          onSelect={() => onSelectMember(node.member.user.id)}
        />
      ))}
    </div>
  )
}

export const campfireTheme: StageThemeDefinition = {
  id: 'campfire',
  label: 'Campfire',
  description: 'Warm hearth and glowing lanterns for every check-in',
  Scene: CampfireScene,
}

