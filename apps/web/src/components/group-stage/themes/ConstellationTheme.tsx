import { Sparkles } from 'lucide-react'
import { StageNodeFrame } from './StageNodeFrame'
import type { StageThemeDefinition, StageThemeRenderProps } from './types'

function ConstellationScene({
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
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_50%_45%,rgba(56,189,248,0.16),rgba(15,23,42,0.92)_58%,#060913_100%)]">
      {/* Orbital rings and filaments grounded to checked-in members */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <circle cx="50" cy="48" r="24" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.25" />
        <circle cx="50" cy="48" r="36" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.2" strokeDasharray="1 1.5" />
        {nodes.map((node) =>
          node.checkedInRecently ? (
            <line
              key={node.member.user.id}
              x1="50"
              y1="48"
              x2={node.x}
              y2={node.y}
              stroke="rgba(56,189,248,0.28)"
              strokeWidth="0.3"
            />
          ) : null,
        )}
      </svg>

      {/* Center Group beacon */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[48%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center"
      >
        <div className="flex h-20 w-20 sm:h-24 sm:w-24 flex-col items-center justify-center rounded-full border border-sky-300/25 bg-sky-400/10 backdrop-blur-md shadow-[0_0_50px_rgba(56,189,248,0.2)]">
          <Sparkles size={16} className="mb-1 text-sky-300/80" />
          <span className="text-base sm:text-lg font-bold tabular-nums text-white">
            {checkedInMemberCount}/{memberCount}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-sky-200/75">
            checked in
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
          accentClass="ring-sky-400 shadow-[0_0_24px_rgba(56,189,248,0.45)]"
          haloClass="border-sky-300/50"
          onSelect={() => onSelectMember(node.member.user.id)}
        />
      ))}
    </div>
  )
}

export const constellationTheme: StageThemeDefinition = {
  id: 'constellation',
  label: 'Night Sky',
  description: 'Calm orbital constellation lit by recent check-ins',
  Scene: ConstellationScene,
}

