// Pure helpers for the group-aware Activity row and My Programs people cell.
import type { components } from '@project/sdk'
import { timeAgo } from './relativeTime'

type S = components['schemas']
type Member = S['CollaboratorStatus']
type Participation = S['ProgramParticipation']

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

