import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarPlus, MapPin, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  useActivityGatherings,
  useAddCalendarItem,
  useCreateGathering,
  useCurrentUser,
  useJoinGathering,
  usePlaces,
  type components,
} from '@project/sdk'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { dateLabel, today } from '@/lib/dates'
import { groupAction } from '@/lib/joinEligibility'
import { formatTargetTime } from '@/lib/targetTime'
import { ActivitySection } from './ActivitySection'

type S = components['schemas']

export function gatheringWhen(g: Pick<S['Gathering'], 'localDate' | 'localTime'>) {
  const day = dateLabel(g.localDate, { weekday: 'short', month: 'short', day: 'numeric' })
  return g.localTime ? `${day} · ${formatTargetTime(g.localTime)}` : day
}

/**
 * Activity → Join an existing gathering, or Create a time (10 §9.1). Joining or creating lands on the
 * user's own occurrence, the existing participation room. A Program is never required.
 */
export function ActivityGatherings({ activity, returnTo }: { activity: S['ActivityDetail']; returnTo: string }) {
  const navigate = useNavigate()
  const me = useCurrentUser()
  const signedIn = !!me.data
  const gatherings = useActivityGatherings(activity.id)
  const join = useJoinGathering()
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const shareable = activity.status === 'PUBLISHED' && activity.visibility !== 'PRIVATE'
  const list = gatherings.data ?? []

  const openItem = (itemId: string) => navigate(`/occurrences/${itemId}?returnTo=${encodeURIComponent(returnTo)}`)

  const onJoin = async (g: S['Gathering']) => {
    if (g.viewerCalendarItemId) return openItem(g.viewerCalendarItemId)
    setJoiningId(g.id)
    try {
      const result = await join.mutateAsync({ gatheringId: g.id, idempotencyKey: crypto.randomUUID() })
      toast.success('Joined. It is on your Calendar.')
      openItem(result.calendarItemId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not join')
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <ActivitySection
      icon={Users}
      title="Do it with others"
      description={list.length ? 'Join a time someone already set, or create your own.' : 'Pick a time. Open it to others if you want company.'}
      className="activity-gatherings"
    >
      {list.length > 0 && (
        <ul className="activity-gatherings__list">
          {list.map((g) => {
            const action = groupAction(g)
            return (
              <li key={g.id} className="activity-gatherings__item">
                <div className="min-w-0">
                  <p className="activity-gatherings__when">{gatheringWhen(g)}</p>
                  <p className="activity-gatherings__meta">
                    {g.place && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={13} aria-hidden />
                        {g.place.name}, {g.place.locality}
                      </span>
                    )}
                    <span>
                      {g.memberCount} {g.memberCount === 1 ? 'person' : 'people'}
                      {g.capacity ? ` of ${g.capacity}` : ''}
                    </span>
                  </p>
                </div>
                <span className="activity-gatherings__avatars" aria-hidden>
                  {g.members.slice(0, 4).map((m) => (
                    <Avatar key={m.id} src={m.avatarUrl} name={m.displayName} size="sm" className="h-7 w-7 ring-2 ring-surface" />
                  ))}
                </span>
                {!signedIn ? (
                  <Link className="btn btn--outline btn--sm" to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
                    Sign in to join
                  </Link>
                ) : action === 'open' ? (
                  <Button size="sm" variant="outline" onClick={() => void onJoin(g)}>
                    Open
                  </Button>
                ) : g.isFull ? (
                  <span className="text-sm text-muted">Full</span>
                ) : (
                  <Button size="sm" loading={joiningId === g.id} disabled={!!joiningId} onClick={() => void onJoin(g)}>
                    Join
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {signedIn &&
        (creating ? (
          <CreateTime activity={activity} shareable={shareable} onDone={openItem} onCancel={() => setCreating(false)} />
        ) : (
          <Button variant="outline" onClick={() => setCreating(true)} className="self-start">
            <CalendarPlus size={16} aria-hidden />
            Create a time
          </Button>
        ))}
    </ActivitySection>
  )
}

/** Date, optional time, optional Place, Open to others: nothing more (10 §9.4). */
function CreateTime({
  activity,
  shareable,
  onDone,
  onCancel,
}: {
  activity: S['ActivityDetail']
  shareable: boolean
  onDone: (calendarItemId: string) => void
  onCancel: () => void
}) {
  const me = useCurrentUser()
  const tz = me.data?.data.preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const places = usePlaces()
  const create = useCreateGathering()
  const add = useAddCalendarItem()
  const [localDate, setLocalDate] = useState(today(tz))
  const [localTime, setLocalTime] = useState(activity.targetTime ?? '')
  const [placeId, setPlaceId] = useState(activity.place?.id ?? '')
  const [open, setOpen] = useState(false)
  const [listPublicly, setListPublicly] = useState(false)
  const pending = create.isPending || add.isPending

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      if (open) {
        const result = await create.mutateAsync({
          activityId: activity.id,
          localDate,
          localTime: localTime || null,
          placeId: placeId || null,
          listPublicly: listPublicly && activity.visibility === 'PUBLIC',
          idempotencyKey: crypto.randomUUID(),
        })
        toast.success(listPublicly ? 'Created and listed publicly' : 'Created. Share the link from the Activity screen.')
        onDone(result.calendarItemId)
      } else {
        // Not open to others: an ordinary personal Calendar Item (09 §2).
        const result = await add.mutateAsync({
          activityId: activity.id,
          revisionId: activity.revisionId ?? undefined,
          localDate,
          localTime: localTime || null,
          placeId: placeId || null,
          idempotencyKey: crypto.randomUUID(),
        })
        toast.success('Added to your Calendar')
        onDone(result.item.id)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not schedule')
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="activity-gatherings__form" aria-label="Create a time">
      <label className="activity-gatherings__field">
        <span className="label">Date</span>
        <Input type="date" required value={localDate} min={today(tz)} onChange={(e) => setLocalDate(e.target.value)} />
      </label>
      <label className="activity-gatherings__field">
        <span className="label">Time (optional)</span>
        <Input type="time" value={localTime} onChange={(e) => setLocalTime(e.target.value)} />
      </label>
      {(places.data?.length ?? 0) > 0 && (
        <label className="activity-gatherings__field">
          <span className="label">Place (optional)</span>
          <Select value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
            <option value="">No place</option>
            {places.data!.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}, {p.locality}
              </option>
            ))}
          </Select>
        </label>
      )}
      {shareable && (
        <label className="activity-gatherings__check">
          <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
          <span>
            Open to others
            <span className="block text-xs text-muted">People you share the link with can join this time.</span>
          </span>
        </label>
      )}
      {open && activity.visibility === 'PUBLIC' && (
        <label className="activity-gatherings__check">
          <input type="checkbox" checked={listPublicly} onChange={(e) => setListPublicly(e.target.checked)} />
          <span>
            Also list it publicly
            <span className="block text-xs text-muted">Anyone browsing this Activity can see and join it.</span>
          </span>
        </label>
      )}
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          {open ? 'Create and add to Calendar' : 'Add to Calendar'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
