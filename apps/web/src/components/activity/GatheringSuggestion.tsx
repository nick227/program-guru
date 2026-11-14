import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Repeat, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useActivityGatherings, useJoinGathering, useRepeatGathering, type components } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { addDays, dateLabel } from '@/lib/dates'
import { groupAction } from '@/lib/joinEligibility'
import { formatTargetTime } from '@/lib/targetTime'

type S = components['schemas']

/** An item that can still join a gathering: planned, in no group (10 §9.11). */
export function canSuggestGathering(item: Pick<S['CalendarItem'], 'status' | 'gatheringId' | 'groupName' | 'locked'>) {
  return item.status === 'PLANNED' && !item.gatheringId && !item.groupName && !item.locked
}

/**
 * One compact line on a planned item: real public gatherings of the same Activity on the same date.
 * Joining reuses this item (personal or solo Program), so nothing is duplicated (10 §9.11).
 */
export function GatheringSuggestion({ item, className }: { item: S['CalendarItem']; className?: string }) {
  const eligible = canSuggestGathering(item)
  const gatherings = useActivityGatherings(item.activityId, eligible)
  const join = useJoinGathering()
  if (!eligible) return null
  const sameDay = (gatherings.data ?? []).filter(
    (g) => g.localDate === item.localDate && groupAction(g) === 'join' && !g.isFull,
  )
  if (!sameDay.length) return null
  const g = sameDay[0]!
  const people = sameDay.reduce((n, x) => n + x.memberCount, 0)
  const onJoin = async () => {
    try {
      await join.mutateAsync({ gatheringId: g.id, calendarItemId: item.id, idempotencyKey: crypto.randomUUID() })
      toast.success('Joined. Same item, now shared.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not join')
    }
  }
  return (
    <div className={className ?? 'gathering-suggestion'}>
      <Users size={14} aria-hidden />
      <span className="min-w-0 flex-1">
        {people} {people === 1 ? 'person is' : 'people are'} doing this on {dateLabel(item.localDate, { weekday: 'short', month: 'short', day: 'numeric' })}
        {g.localTime ? ` at ${formatTargetTime(g.localTime)}` : ''}
        {g.place ? ` · ${g.place.name}, ${g.place.locality}` : ''}
      </span>
      <Button size="sm" loading={join.isPending} onClick={() => void onJoin()}>
        Join
      </Button>
    </div>
  )
}

/** Do It Again: same Activity, Place, capacity and visibility on a new date (10 §9.11). */
export function DoItAgain({ gathering }: { gathering: S['Gathering'] }) {
  const navigate = useNavigate()
  const repeat = useRepeatGathering()
  const [open, setOpen] = useState(false)
  const [localDate, setLocalDate] = useState(addDays(gathering.localDate, 7))
  const [invite, setInvite] = useState(true)
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="self-start">
        <Repeat size={14} aria-hidden />
        Do it again
      </Button>
    )
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const result = await repeat.mutateAsync({
        gatheringId: gathering.id,
        localDate,
        inviteParticipants: invite && gathering.memberCount > 1,
        idempotencyKey: crypto.randomUUID(),
      })
      toast.success('Scheduled again')
      navigate(`/occurrences/${result.calendarItemId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not schedule it again')
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} aria-label="Do it again" className="activity-hero__again">
      <Input type="date" required value={localDate} onChange={(e) => setLocalDate(e.target.value)} aria-label="New date" />
      {gathering.memberCount > 1 && (
        <label className="activity-gatherings__check">
          <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} />
          <span>Invite everyone from this time</span>
        </label>
      )}
      <Button type="submit" size="sm" loading={repeat.isPending}>
        Schedule {gathering.localTime ? `at ${formatTargetTime(gathering.localTime)}` : 'again'}
      </Button>
    </form>
  )
}
