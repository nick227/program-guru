import type { ActivityParticipation } from '@project/sdk'
import { ruleLabel, untilLabel } from '@/components/schedule/recurrencePlan'
import { dateLabel } from '@/lib/dates'
import { groupAction } from '@/lib/joinEligibility'
import { formatTargetTime } from '@/lib/targetTime'

/**
 * The one Activity participation state resolver (03-UX §2b). Every surface renders what this returns;
 * none derives status, counts or actions itself. Precedence: In progress → Scheduled → Completed →
 * Added before → Not on your Calendar; the other facts stay visible beside the leading one.
 */
export type ParticipationStatus = 'SIGNED_OUT' | 'UNKNOWN' | 'NEVER' | 'PREVIOUSLY_ADDED' | 'COMPLETED' | 'SCHEDULED' | 'IN_PROGRESS'
export type ParticipationAction = 'resume' | 'start' | 'join' | 'open_gathering' | 'schedule' | 'reschedule'
type Upcoming = NonNullable<ActivityParticipation['viewer']>['upcoming'][number]

export interface ParticipationView {
  status: ParticipationStatus
  /** "Scheduled Thu, Nov 19 · 7:30 AM", "In progress", "Done 3 times · last Nov 2", … */
  statusLabel: string | null
  /** Secondary facts beside the leading status: recurrence, completions. */
  detail: string | null
  /** Always present, including zero; "…" while unknown, never a guessed 0. */
  peopleLabel: string
  sharedLabel: string | null
  avatars: ActivityParticipation['avatars']
  next: Upcoming | null
  inProgressItemId: string | null
  gathering: ActivityParticipation['shared']['nextGathering']
  actions: ParticipationAction[]
}

const short = (d: string) => dateLabel(d, { weekday: 'short', month: 'short', day: 'numeric' })
const when = (u: { localDate: string; localTime: string | null }, todayIso: string) =>
  [u.localDate === todayIso ? 'Today' : short(u.localDate), u.localTime ? formatTargetTime(u.localTime) : null].filter(Boolean).join(' · ')
const times = (n: number) => (n === 1 ? 'once' : `${n} times`)

/** 12 §10a: 0 exactly, 1–4 withheld as "Fewer than 5", 5+ exactly; separate from avatars. */
export function peopleLabelOf(p: Pick<ActivityParticipation, 'participants'> | null | undefined): string {
  if (!p) return '… participants'
  const { band, count, includesViewer } = p.participants
  const base =
    band === 'NONE' ? '0 participants' : band === 'FEW' ? 'Fewer than 5 participants' : `${count} ${count === 1 ? 'participant' : 'participants'}`
  return includesViewer ? `${base} · including you` : base
}

export function resolveParticipation(
  p: ActivityParticipation | null | undefined,
  { signedIn, todayIso }: { signedIn: boolean; todayIso: string },
): ParticipationView {
  const g = p?.shared.nextGathering ?? null
  const shared = p
    ? [
        p.shared.activeNow > 0 ? `${p.shared.activeNow} doing it now` : null,
        g && p.shared.going > 0 ? `${p.shared.going} going · ${when(g, todayIso)}` : null,
      ].filter(Boolean).join(' · ') || null
    : null
  const joinAction: ParticipationAction[] = g
    ? groupAction(g) === 'open'
      ? ['open_gathering']
      : groupAction(g) === 'join' && !g.isFull
        ? ['join']
        : []
    : []
  const base = {
    peopleLabel: peopleLabelOf(p),
    sharedLabel: shared,
    avatars: p?.avatars ?? [],
    gathering: g,
  }

  if (!signedIn) {
    return { ...base, status: 'SIGNED_OUT', statusLabel: null, detail: null, next: null, inProgressItemId: null, actions: ['start', ...joinAction, 'schedule'] }
  }
  const v = p?.viewer
  if (!v) {
    return { ...base, status: 'UNKNOWN', statusLabel: null, detail: null, next: null, inProgressItemId: null, actions: ['start', ...joinAction, 'schedule'] }
  }

  const next = v.upcoming[0] ?? null
  const recurrence = next?.recurrence ? `${ruleLabel(next.recurrence.rule, next.localDate)} · ${untilLabel(next.recurrence.untilDate)}` : null
  const done = v.completedCount > 0 ? `Done ${times(v.completedCount)}${v.lastCompletedDate ? ` · last ${dateLabel(v.lastCompletedDate)}` : ''}` : null

  let status: ParticipationStatus
  let statusLabel: string
  let detail: string | null
  if (v.inProgressItemId) {
    status = 'IN_PROGRESS'
    statusLabel = 'In progress'
    detail = [next ? `Next ${when(next, todayIso)}` : null, done].filter(Boolean).join(' · ') || null
  } else if (next) {
    status = 'SCHEDULED'
    statusLabel = `Scheduled ${when(next, todayIso)}`
    detail = [recurrence, done].filter(Boolean).join(' · ') || null
  } else if (v.completedCount > 0) {
    status = 'COMPLETED'
    statusLabel = done!
    detail = null
  } else if (v.everAdded) {
    status = 'PREVIOUSLY_ADDED'
    statusLabel = v.lastAddedAt ? `Added before · last ${dateLabel(v.lastAddedAt.slice(0, 10))}` : 'Added before'
    detail = null
  } else {
    status = 'NEVER'
    statusLabel = 'Not on your Calendar'
    detail = null
  }

  const actions: ParticipationAction[] = [
    status === 'IN_PROGRESS' ? 'resume' : 'start',
    ...joinAction,
    'schedule',
    ...(next ? (['reschedule'] as const) : []),
  ]
  return { ...base, status, statusLabel, detail, next, inProgressItemId: v.inProgressItemId, actions }
}
