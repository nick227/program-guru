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
  /** Guided inline authoring of a new or resumed Program draft (03-UX §2a). */
  | 'create_program'
  | 'continue_editing'

export type PresentationMode = 'for_you' | 'happening_now' | 'popular' | 'following'

export type PreviewTarget =
  | { kind: 'program'; id: string }
  /** From the Home surfer, the gathering it showed (03-UX §2a): its people and Join come along. */
  | { kind: 'activity'; id: string; gatheringId?: string | null; calendarItemId?: string | null }
  | { kind: 'creator'; handle: string }
  | { kind: 'group'; id: string }
  | { kind: 'session'; id: string; title: string; subtitle: string }
  | { kind: 'scheduled'; id: string; title: string; subtitle: string }

export type CardAction =
  | { type: 'preview'; target: PreviewTarget }
  | { type: 'open_occurrence'; itemId: string }
  | { type: 'navigate_occurrence'; itemId: string }
  | { type: 'open_activity'; activityId: string }
  /** Add to Schedule: pick a date (and time) in a dialog, staying on Home (03-UX §2a). */
  | { type: 'schedule_activity'; activityId: string; title: string }
  | { type: 'navigate_activity'; activityId: string }
  | { type: 'open_program'; programId: string }
  | { type: 'open_group'; groupId: string }
  | { type: 'open_creator'; handle: string }
  | { type: 'follow_creator'; userId: string; handle: string }
  /** Reschedule one of the viewer's own items in the shared dialog; recurring asks for a scope (09 §4.8). */
  | {
      type: 'reschedule_item'
      item: Pick<S['CalendarItem'], 'id' | 'title' | 'localDate' | 'localTime' | 'recurrenceId' | 'updatedAt'> & {
        gatheringId: string | null
      }
    }
  | { type: 'open_calendar' }
  | { type: 'open_browse' }
  | { type: 'join_gathering'; gatheringId: string; calendarItemId: string | null }

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

/**
 * The card's identity image for the Agent turn (11-MEDIA identity order): best image first, then the
 * Domain's category art when none loads. Creator cards also carry their avatar.
 */
export interface CardHero {
  images: (string | null | undefined)[]
  categoryId: string | null
  avatarUrl?: string | null
}

export interface AssistantCard {
  kind: 'scheduled' | 'activity' | 'program' | 'creator' | 'session'
  id: string
  title: string
  subtitle: string
  thumbnailUrl?: string | null
  hero?: CardHero
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
  /** Home's Create a Program builder; saved with the conversation so Back, Next and reload keep it. */
  builder?: ProgramBuilderState
}

export interface ProgramBuilderState {
  /** Set once the draft exists; before that the Add Program form shows. */
  programId?: string
  /** The Program type chosen in the form, before the draft exists. */
  typeId?: string
  step?: 'details' | 'activities' | 'publish'
  /** The Activity library is open over the Activities step. */
  picking?: boolean
}

export interface EnrollmentSummary {
  id: string
  programId: string
  programTitle: string
  status: string
  /** A completion or recorded participation exists; progress claims need it. */
  hasParticipated?: boolean
  /** The run's next scheduled Activity, when there is one. */
  nextActivity?: { id: string; title: string; date: string } | null
}

export interface HomeSignals {
  isSignedIn: boolean
  /** The viewer's Program drafts (Continue editing), newest first. */
  drafts?: S['ProgramSummary'][]
  todayItems: S['CalendarItem'][]
  activeEnrollments: EnrollmentSummary[]
  /** All owned or previously joined Programs; null until the personal library resolves. */
  knownProgramIds?: string[] | null
  liveSessions: S['DiscoverItem'][]
  /** Programs ordered sort=FOR_YOU, each with one truthful reason (12 §5c). */
  forYouPrograms?: S['DiscoverItem'][]
  /** Newest Programs from creators the viewer actually follows (12 §5c). */
  followedPrograms?: S['DiscoverItem'][]
  /** Creators the viewer actually follows (12 §5c). */
  followedCreators?: S['DiscoverItem'][]
  /** Opportunity Radar recommendations (12 §5b), best tier first. */
  opportunities?: S['Opportunity'][]
  popularPrograms: S['DiscoverItem'][]
  newPrograms: S['DiscoverItem'][]
  activities: S['DiscoverItem'][]
  creators: S['DiscoverItem'][]
  categories: Array<{ id: string; name: string }>
}
