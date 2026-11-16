import { useActivityParticipation, useCurrentUser } from '@project/sdk'
import { resolveParticipation } from './activityParticipation'
import { today } from './dates'

/** All Activity surfaces use the same viewer, timezone and privacy-aware resolver. */
export function useParticipationView(activityId: string) {
  const me = useCurrentUser()
  const query = useActivityParticipation(activityId)
  const signedIn = Boolean(me.data)
  const timezone = me.data?.data.preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
  return { view: resolveParticipation(query.data, { signedIn, todayIso: today(timezone) }), signedIn }
}
