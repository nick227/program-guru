// Pure helpers for the group-aware Activity row and My Programs people cell.
import type { components } from '@project/sdk'
import { timeAgo } from './relativeTime'

type S = components['schemas']
type Member = S['CollaboratorStatus']
type Participation = S['ProgramParticipation']
type Collaborators = S['CollaboratorSummary']

const ORDER: Record<Member['status'], number> = {
  DONE: 0,
  IN_PROGRESS: 1,
  PENDING: 2,
  UNKNOWN: 3,
  NOT_PARTICIPATING: 4,
}

/** Finished first (most recent first), then started, then not yet, then private. */
export function orderMembers(members: Member[], viewerId?: string) {
  return [...members].sort(
    (a, b) =>
      ORDER[a.status] - ORDER[b.status] ||
      (b.completedAt ?? '').localeCompare(a.completedAt ?? '') ||
      Number(a.user.id === viewerId) - Number(b.user.id === viewerId),
  )
}

export function stateLabel(m: Member, now?: number) {
  switch (m.status) {
    case 'DONE':
      return m.completedAt ? `Finished ${timeAgo(m.completedAt, now)}` : 'Finished'
    case 'IN_PROGRESS':
      return 'Started'
    case 'PENDING':
      return 'Not yet'
    case 'UNKNOWN':
      return 'Not sharing'
    case 'NOT_PARTICIPATING':
      return 'Joined later'
  }
}

export function participationLine(p: Participation) {
  if (p.participantCount === null) return null
  const people = `${p.participantCount.toLocaleString()} ${p.participantCount === 1 ? 'participant' : 'participants'}`
  return p.activeMemberCount ? `${people} · ${p.activeMemberCount.toLocaleString()} active this week` : people
}

/**
 * One reading of a session's collaborators (consolidation MR 4), shared by the Activity page's
 * Together card, the inline execution and the Calendar panel: who else is doing it now, waiting or
 * finished, the counts, and the two lines those surfaces show. Without `viewerId`, everyone counts
 * as "others".
 */
export function summarizeCollaborators(c: Collaborators | null | undefined, viewerId?: string) {
  const members = orderMembers(c?.members ?? [], viewerId)
  const others = viewerId ? members.filter((m) => m.user.id !== viewerId) : members
  const me = viewerId ? (members.find((m) => m.user.id === viewerId) ?? null) : null
  const doingNow = others.filter((m) => m.status === 'IN_PROGRESS')
  // Only members who share and haven't finished; non-sharers are never listed as "not yet".
  const waiting = others.filter((m) => m.status === 'PENDING')
  const finished = others.filter((m) => m.status === 'DONE')
  const totalCount = c?.totalCount || members.length
  const finishedCount = c?.finishedCount ?? members.filter((m) => m.status === 'DONE').length
  return {
    members,
    others,
    me,
    doingNow,
    waiting,
    finished,
    totalCount,
    finishedCount,
    /** The most active fact: "2 doing it now", else "3 scheduled today", else "4 completed recently". */
    activityLabel: doingNow.length
      ? `${doingNow.length} doing it now`
      : waiting.length
        ? `${waiting.length} scheduled today`
        : finished.length
          ? `${finished.length} completed recently`
          : null,
    /** "2 of 5 finished in this session", or "5 in this session". */
    sessionLabel: finishedCount > 0 ? `${finishedCount} of ${totalCount} finished in this session` : `${totalCount} in this session`,
  }
}
