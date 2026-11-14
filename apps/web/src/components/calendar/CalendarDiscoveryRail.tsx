import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAddCalendarItem, useDiscoverActivities } from '@project/sdk'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import { Button } from '@/components/ui/Button'
import { pickAcrossDomains } from '@/lib/activityRange'
import { activityCard } from '@/lib/discoveryCards'

/**
 * Compact "things to schedule" rail (12 §5a): the same `/discover` source and card model as Home,
 * scheduled through the existing add-calendar-item operation (which copies a suggested Place).
 * Shown only in the Day view side panel with nothing selected, and beneath the empty-week message.
 */
export function CalendarDiscoveryRail({
  localDate,
  dateLabel,
  scheduledActivityIds,
  onScheduled,
}: {
  localDate: string
  dateLabel: string
  scheduledActivityIds: string[]
  onScheduled?: (itemId: string) => void
}) {
  const categorySlugOf = useCategorySlugOf()
  const discover = useDiscoverActivities({ sort: 'POPULAR' })
  const add = useAddCalendarItem()
  const [addingId, setAddingId] = useState<string | null>(null)

  const exclude = useMemo(() => new Set(scheduledActivityIds), [scheduledActivityIds])
  const picks = useMemo(
    () =>
      pickAcrossDomains(
        (discover.data?.pages.flatMap((p) => p.data) ?? []).flatMap((i) => (i.activity ? [i.activity] : [])),
        5,
        exclude,
      ),
    [discover.data, exclude],
  )
  if (picks.length === 0) return null

  const schedule = async (activityId: string, revisionId: string | null, title: string) => {
    if (addingId) return
    setAddingId(activityId)
    try {
      const result = await add.mutateAsync({
        activityId,
        revisionId: revisionId ?? undefined,
        localDate,
        idempotencyKey: crypto.randomUUID(),
      })
      toast.success(`${title} added to ${dateLabel}`)
      onScheduled?.(result.item.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add activity')
    } finally {
      setAddingId(null)
    }
  }

  return (
    <section aria-labelledby="calendar-discovery-title" className="calendar-discovery">
      <h2 id="calendar-discovery-title" className="calendar-discovery__title">
        Things to schedule
      </h2>
      <ul className="calendar-discovery__list">
        {picks.map((activity) => {
          const card = activityCard(activity, categorySlugOf)
          return (
            <li key={activity.id} className="calendar-discovery__item">
              <EntityHero
                hero={card.hero}
                size="card"
                interactive={false}
                showVideoBadge={false}
                className="aspect-[4/3] w-[4.5rem] rounded-md"
              />
              <span className="calendar-discovery__text">
                <span className="calendar-discovery__name">{card.title}</span>
                <span className="calendar-discovery__meta">{card.meta}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Add ${card.title} to ${dateLabel}`}
                loading={addingId === activity.id}
                disabled={!!addingId}
                onClick={() => void schedule(activity.id, activity.revisionId, card.title)}
              >
                {addingId !== activity.id && <Plus size={14} aria-hidden />}
                Add
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
