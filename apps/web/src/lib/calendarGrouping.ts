import type { ActivityTileItem } from '@/components/calendar/ActivityTile'

export type SurfaceItem = ActivityTileItem & {
  enrollmentId?: string | null
  programDayIndex?: number | null
  sessionPresentation?: 'SEPARATE' | 'GROUPED' | null
  durationMinutes?: number | null
}

export type CalendarRenderEntry =
  | {
      kind: 'item'
      key: string
      item: SurfaceItem
      localTime: string | null
    }
  | {
      kind: 'group'
      key: string
      enrollmentId: string
      day: string
      programTitle: string
      programDayIndex: number | null
      localTime: string | null
      totalMinutes: number | null
      doneCount: number
      items: SurfaceItem[]
    }

const canGroupItem = (item: SurfaceItem): boolean =>
  item.sessionPresentation === 'GROUPED' &&
  Boolean(item.enrollmentId) &&
  item.status !== 'CANCELLED'

const timeOrder = (time: string | null | undefined): string => (time ? time.slice(0, 5) : '\uffff')

/**
 * Collapses day items from a GROUPED Program enrollment into one expandable workout tile
 * when 2 or more non-cancelled items from that same enrollment fall on the same day.
 * Never merges different enrollments, standalone items, or SEPARATE Programs.
 */
export function groupCalendarEntries(dayItems: SurfaceItem[]): CalendarRenderEntry[] {
  const buckets = new Map<string, SurfaceItem[]>()
  for (const item of dayItems) {
    if (!canGroupItem(item)) continue
    const bucketKey = `${item.day}:${item.enrollmentId}`
    const list = buckets.get(bucketKey) ?? []
    list.push(item)
    buckets.set(bucketKey, list)
  }

  const emittedGroups = new Set<string>()
  const entries: CalendarRenderEntry[] = []

  for (const item of dayItems) {
    if (!canGroupItem(item)) {
      entries.push({ kind: 'item', key: item.id, item, localTime: item.localTime ?? null })
      continue
    }

    const bucketKey = `${item.day}:${item.enrollmentId}`
    const groupedItems = buckets.get(bucketKey) ?? []

    if (groupedItems.length < 2) {
      entries.push({ kind: 'item', key: item.id, item, localTime: item.localTime ?? null })
      continue
    }

    if (emittedGroups.has(bucketKey)) continue
    emittedGroups.add(bucketKey)

    const ordered = [...groupedItems].sort((a, b) => timeOrder(a.localTime).localeCompare(timeOrder(b.localTime)))
    const earliestTime = ordered.find((it) => Boolean(it.localTime))?.localTime ?? null
    const minutes = ordered.map((it) => it.durationMinutes).filter((m): m is number => typeof m === 'number' && m > 0)
    const totalMinutes = minutes.length ? minutes.reduce((sum, m) => sum + m, 0) : null
    const doneCount = ordered.filter((it) => it.done || it.status === 'DONE').length
    const programDayIndex = ordered.find((it) => it.programDayIndex != null)?.programDayIndex ?? null
    const programTitle = ordered.find((it) => it.programTitle)?.programTitle ?? 'Workout session'

    entries.push({
      kind: 'group',
      key: `group:${bucketKey}`,
      enrollmentId: item.enrollmentId!,
      day: item.day,
      programTitle,
      programDayIndex,
      localTime: earliestTime,
      totalMinutes,
      doneCount,
      items: ordered,
    })
  }

  return entries
}

