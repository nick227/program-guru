import type { components } from '@project/sdk'

type S = components['schemas']

export type GroupMemberItem = S['GroupMember']
export type GroupCheckIn = S['CompletionShare']
export type GroupMediaItem = S['GroupMediaThumb']

export type StageEventKind =
  | 'CHECK_IN'
  | 'MEDIA_SHARED'
  | 'REACTION'
  | 'MEMBER_JOINED'

export interface StageEvent {
  id: string
  kind: StageEventKind
  user: S['UserSummary']
  label: string
  timestamp: string
  emoji?: string
  share?: GroupCheckIn
  media?: GroupMediaItem
}

export interface StageMemberNode {
  member: GroupMemberItem
  latestCheckIn: GroupCheckIn | null
  checkedInRecently: boolean
  checkedInCount: number
  reactionCount: number
  /** Normalized stage position in percentage coordinates (x: 10..90, y: 18..82). */
  x: number
  y: number
}

const RECENT_WINDOW_MS = 24 * 3600_000

/**
 * Computes calm, evenly distributed orbital/ring positions around the center core
 * so 1 to 24+ members sit organically without overlapping or feeling like a grid.
 */
function nodeCoordinates(index: number, total: number): { x: number; y: number } {
  if (total <= 1) return { x: 50, y: 46 }
  const angle = -Math.PI / 2 + (index / total) * Math.PI * 2
  const ring = total > 10 && index % 2 === 1 ? 1.18 : 0.88
  const rx = Math.min(35, (total <= 4 ? 22 : 30) * ring)
  const ry = Math.min(30, (total <= 4 ? 19 : 25) * ring)
  return {
    x: Number((50 + Math.cos(angle) * rx).toFixed(2)),
    y: Number((48 + Math.sin(angle) * ry).toFixed(2)),
  }
}

export function buildStageMembers(
  members: GroupMemberItem[],
  checkIns: GroupCheckIn[],
  nowMs = Date.now(),
): StageMemberNode[] {
  const sharesByUser = new Map<string, GroupCheckIn[]>()
  for (const share of checkIns) {
    const list = sharesByUser.get(share.user.id) ?? []
    list.push(share)
    sharesByUser.set(share.user.id, list)
  }

  return members.map((member, idx) => {
    const list = sharesByUser.get(member.user.id) ?? []
    const latestCheckIn = list[0] ?? null
    const checkedInRecently = latestCheckIn
      ? nowMs - Date.parse(latestCheckIn.completedAt) <= RECENT_WINDOW_MS
      : false
    const reactionCount = list.reduce(
      (sum, item) => sum + item.reactions.reduce((n, r) => n + r.count, 0),
      0,
    )
    const { x, y } = nodeCoordinates(idx, members.length)
    return {
      member,
      latestCheckIn,
      checkedInRecently,
      checkedInCount: list.length,
      reactionCount,
      x,
      y,
    }
  })
}

export function buildStageEvents(checkIns: GroupCheckIn[]): StageEvent[] {
  const events: StageEvent[] = []
  for (const share of checkIns.slice(0, 12)) {
    events.push({
      id: `checkin-${share.id}`,
      kind: share.media ? 'MEDIA_SHARED' : 'CHECK_IN',
      user: share.user,
      label: `${share.user.displayName} completed ${share.activityTitle}`,
      timestamp: share.completedAt,
      share,
      media: share.media ?? undefined,
    })
    const topReaction = share.reactions[0]
    if (topReaction && topReaction.count > 0) {
      events.push({
        id: `react-${share.id}-${topReaction.emoji}`,
        kind: 'REACTION',
        user: share.user,
        label: `${topReaction.count} ${topReaction.emoji} on ${share.user.displayName}'s check-in`,
        timestamp: share.completedAt,
        emoji: topReaction.emoji,
        share,
      })
    }
  }
  return events
}

