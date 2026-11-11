import type { ReactNode } from 'react'
import type { StageEvent, StageMemberNode } from '../stageEvents'

export type StageThemeId = 'constellation' | 'campfire' | 'sprout'

export interface StageThemeRenderProps {
  groupName: string
  programTitle: string
  memberCount: number
  checkedInMemberCount: number
  nodes: StageMemberNode[]
  events: StageEvent[]
  selectedMemberId: string | null
  burstMemberId: string | null
  burstEmoji?: string | null
  viewerId?: string
  onSelectMember: (userId: string) => void
}

export interface StageThemeDefinition {
  id: StageThemeId
  label: string
  description: string
  Scene: (props: StageThemeRenderProps) => ReactNode
}

