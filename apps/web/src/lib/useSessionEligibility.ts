import { useCurrentUser, type components } from '@project/sdk'
import { today } from './dates'
import { useOnline } from './useOnline'
import { resolveSessionEligibility } from './sessionEligibility'

export function useSessionEligibility(item: components['schemas']['CalendarItem'] | undefined, sessionStatus?: string | null, busy = false) {
  const me = useCurrentUser()
  const online = useOnline()
  const zone = me.data?.data.preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
  return resolveSessionEligibility(item ?? { status: 'CANCELLED', locked: true, localDate: '', localTime: null, gatheringId: null, completionOpensAt: '2026-01-01T00:00:00Z' }, sessionStatus, { todayIso: today(zone), online, busy })
}
