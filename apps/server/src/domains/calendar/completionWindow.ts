// Completion opens on the day (09 §3, 10 §9): an item cannot be completed before it happens.
import { badRequest } from '../../lib/errors'
import { fromDbDate, localToUtc, todayIn } from '../../lib/time'

export type CompletionWindowItem = {
  localDate: Date
  gatheringId: string | null
  gathering?: { startLocalDate: Date | null; startLocalTime: string | null; timezone: string | null } | null
}

/**
 * The instant Finish is accepted from: a gathering's scheduled date and time in its own timezone
 * (its date start when untimed); otherwise the start of the item's date in the owner's timezone.
 */
export function completionOpensAt(item: CompletionWindowItem, ownerTimezone: string): Date {
  const g = item.gatheringId ? item.gathering : null
  if (g?.startLocalDate) return localToUtc(fromDbDate(g.startLocalDate), g.startLocalTime ?? '00:00', g.timezone ?? ownerTimezone)
  return localToUtc(fromDbDate(item.localDate), '00:00', ownerTimezone)
}

/** Start is accepted from the start of the item's date, so a gathering timer can begin a little early. */
export function assertCanStart(item: CompletionWindowItem, ownerTimezone: string, now = new Date()) {
  const date = fromDbDate(item.localDate)
  if (date > todayIn(ownerTimezone, now)) {
    throw badRequest('You can start this Activity on its day', { calendarItemId: `is scheduled for ${date}` })
  }
}

export function assertCanComplete(item: CompletionWindowItem, ownerTimezone: string, now = new Date()) {
  const opens = completionOpensAt(item, ownerTimezone)
  if (now < opens) {
    throw badRequest(
      item.gatheringId ? 'You can complete this once the gathering has started' : 'You can complete this Activity on its day',
      { calendarItemId: `completion opens at ${opens.toISOString()}` },
    )
  }
}
