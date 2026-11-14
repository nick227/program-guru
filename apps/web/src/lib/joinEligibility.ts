/**
 * The one rule for a group's primary action on discovery surfaces (12-SOCIAL §5a): `Join` only when
 * the group is open and the viewer is not already a member. The group's owner is always an active
 * member, so creators never see Join. Community, Home, the Home Agent and the Calendar rail all use it.
 */
export type GroupAction = 'join' | 'open' | 'view'

export type JoinableGroup = {
  viewerIsMember?: boolean | null
  joinPolicy?: string | null
}

export function groupAction(group: JoinableGroup, joinedThisSession = false): GroupAction {
  if (group.viewerIsMember || joinedThisSession) return 'open'
  if (group.joinPolicy === 'OPEN') return 'join'
  return 'view'
}

/** Label for a live or scheduled group session. */
export function sessionActionLabel(action: GroupAction): string {
  return action === 'join' ? 'Join session' : action === 'open' ? 'Open session' : 'View session'
}
