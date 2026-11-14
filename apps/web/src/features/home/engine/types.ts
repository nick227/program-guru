import type { components } from '@project/sdk'

type S = components['schemas']

export type FlowNodeId =
  | 'opening'
  | 'day_schedule'
  | 'post_completion'
  | 'done_for_now'
  | 'intent_menu'
  | 'now_time'
  | 'now_interest'
  | 'now_result'
  | 'program_goal'
  | 'program_experience'
  | 'program_commitment'
  | 'program_result'
  | 'together_result'
  | 'continue_result'
  | 'explore_interest'
  | 'explore_result'

export type PresentationMode = 'for_you' | 'happening_now' | 'popular' | 'following'

export type PreviewTarget =
  | { kind: 'program'; id: string }
  | { kind: 'activity'; id: string }
  | { kind: 'creator'; handle: string }
  | { kind: 'group'; id: string }
  | { kind: 'session'; id: string; title: string; subtitle: string }
  | { kind: 'scheduled'; id: string; title: string; subtitle: string }

export type CardAction =
  | { type: 'preview'; target: PreviewTarget }
  | { type: 'open_occurrence'; itemId: string }
  | { type: 'navigate_occurrence'; itemId: string }
  | { type: 'open_activity'; activityId: string }
  | { type: 'navigate_activity'; activityId: string }
  | { type: 'open_program'; programId: string }
  | { type: 'open_group'; groupId: string }
  | { type: 'open_creator'; handle: string }
  | { type: 'follow_creator'; userId: string; handle: string }
  | { type: 'move_to_tomorrow'; itemId: string; title: string; updatedAt: string }
  | { type: 'open_calendar' }
  | { type: 'open_browse' }

export interface ParticipantGroup {
  label: string
  count?: number
  users: Array<{
    id: string
    handle: string
    displayName: string
    avatarUrl: string | null
  }>
  avatarUrls?: string[]
}

export interface AssistantCard {
  kind: 'scheduled' | 'activity' | 'program' | 'creator' | 'session'
  id: string
  title: string
  subtitle: string
  thumbnailUrl?: string | null
  status?: S['CalendarItem']['status']
  localTime?: string | null
  participants?: ParticipantGroup
  /** Clicking the card opens an inline preview in Home. */
  previewTarget: PreviewTarget
  /** Explicit primary action on the right-hand button. */
  primaryAction: CardAction
}

export type ShowMeSubject =
  | { kind: 'program'; id: string; title: string }
  | { kind: 'creator'; handle: string; displayName: string }
  | { kind: 'schedule' }
  | { kind: 'session'; id: string; title: string; users: ParticipantGroup['users'] }
  | { kind: 'progress' }

export type ChoiceEffect =
  | { type: 'execute'; action: CardAction }
  | { type: 'transition'; nodeId: FlowNodeId; patch?: Partial<DiscoveryState> }
  | {
      type: 'refine'
      kind: 'shorter' | 'different' | 'more_like_this' | 'with_others' | 'popular'
    }
  | { type: 'explain_why' }
  | { type: 'show_me' }
  | { type: 'clear_filter'; key: 'maxMinutes' | 'categoryId' | 'level' }
  | { type: 'reset' }

export interface ChoiceButton {
  id: string
  label: string
  variant: 'primary' | 'secondary'
  effect: ChoiceEffect
}

export interface AssistantTurn {
  nodeId: FlowNodeId
  question: string
  contextLine?: string
  whyReason?: string
  showMeSubject?: ShowMeSubject
  card?: AssistantCard
  cards?: AssistantCard[]
  presentationHint?: {
    mode?: PresentationMode
    label?: string
    items?: AssistantCard[]
  }
  choices: ChoiceButton[]
}

export interface DiscoveryState {
  maxMinutes?: number
  categoryId?: string
  categoryName?: string
  level?: S['ProgramLevel']
  exploreKind?: 'CREATOR' | 'PROGRAM' | 'ACTIVITY'
  preferPopular?: boolean
  lastCompletedTitle?: string
  excludedIds: string[]
}

export interface EnrollmentSummary {
  id: string
  programId: string
  programTitle: string
  status: string
}

export interface HomeSignals {
  isSignedIn: boolean
  todayItems: S['CalendarItem'][]
  activeEnrollments: EnrollmentSummary[]
  /** All owned or previously joined Programs; null until the personal library resolves. */
  knownProgramIds?: string[] | null
  liveSessions: S['DiscoverItem'][]
  popularPrograms: S['DiscoverItem'][]
  newPrograms: S['DiscoverItem'][]
  activities: S['DiscoverItem'][]
  creators: S['DiscoverItem'][]
  categories: Array<{ id: string; name: string }>
}
