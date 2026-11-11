// Personal recurring entries (09-CALENDARS.md §4.8). Pure rule evaluation plus materialization
// into the same bounded horizon Programs use, keyed `recurrenceId:localDate` so retries are no-ops.
import type { CalendarRecurrence, Prisma } from '@project/db'
import { addDays, addMonths, diffDays, fromDbDate, localToUtc, toDbDate, weekday, type LocalDate } from '../../lib/time'

export type RecurrenceRule = { kind: 'DAILY' | 'WEEKDAYS' | 'WEEKLY' | 'EVERY_N_DAYS' | 'MONTHLY'; weekdays?: number[]; n?: number }

export function parseRule(json: unknown): RecurrenceRule {
  const r = json as Partial<RecurrenceRule> | null
  return { kind: r?.kind ?? 'DAILY', ...(r?.weekdays ? { weekdays: r.weekdays } : {}), ...(r?.n ? { n: r.n } : {}) }
}

export function occursOn(rule: RecurrenceRule, anchor: LocalDate, date: LocalDate): boolean {
  if (date < anchor) return false
  const wd = weekday(date)
  switch (rule.kind) {
    case 'DAILY':
      return true
    case 'WEEKDAYS':
      return wd >= 1 && wd <= 5
    case 'WEEKLY': {
      const days = rule.weekdays?.length ? rule.weekdays : [weekday(anchor)]
      return days.includes(wd)
    }
    case 'EVERY_N_DAYS':
      return diffDays(date, anchor) % Math.max(rule.n ?? 2, 2) === 0
    case 'MONTHLY': {
      const months = (Number(date.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 + (Number(date.slice(5, 7)) - Number(anchor.slice(5, 7)))
      return months >= 0 && date === addMonths(anchor, months)
    }
  }
}

export function occurrencesBetween(rule: RecurrenceRule, anchor: LocalDate, from: LocalDate, through: LocalDate, until?: LocalDate | null) {
  const out: LocalDate[] = []
  const end = until && until < through ? until : through
  for (let d = from < anchor ? anchor : from; d <= end; d = addDays(d, 1)) if (occursOn(rule, anchor, d)) out.push(d)
  return out
}

export async function materializeRecurrence(tx: Prisma.TransactionClient, r: CalendarRecurrence, window: { from: LocalDate; through: LocalDate }) {
  const dates = occurrencesBetween(parseRule(r.rule), fromDbDate(r.anchorDate), window.from, window.through, r.untilDate ? fromDbDate(r.untilDate) : null)
  if (dates.length) {
    await tx.calendarItem.createMany({
      data: dates.map((d) => ({
        ownerId: r.ownerId,
        activityId: r.activityId,
        activityRevisionId: r.activityRevisionId,
        recurrenceId: r.id,
        idempotencyKey: `${r.id}:${d}`,
        localDate: toDbDate(d),
        localTime: r.localTime,
        scheduledAtUtc: r.localTime ? localToUtc(d, r.localTime, r.timezone) : null,
      })),
      skipDuplicates: true,
    })
  }
  await tx.calendarRecurrence.update({ where: { id: r.id }, data: { generatedThroughDate: toDbDate(window.through) } })
  return dates.length
}
