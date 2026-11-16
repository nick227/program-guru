import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useCurrentUser, useGathering, useJoinGathering, useOccurrence, type components } from '@project/sdk'
import { ActivityPage } from './Activity'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Page } from '@/components/ui/Layout'
import { joinedMessage } from '@/lib/gatheringLabels'

type Gathering = components['schemas']['Gathering']

/** Shared links retain their invitation and exact date throughout joining and execution. */
export function GatheringPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const invite = params.get('invite')
  const gathering = useGathering(id, invite)
  const [joined, setJoined] = useState<{ gatheringId: string; itemId: string } | null>(null)
  const itemId = gathering.data?.viewerCalendarItemId ?? (joined?.gatheringId === id ? joined.itemId : '')
  const occurrence = useOccurrence(itemId ?? '')
  const g = gathering.data
  useEffect(() => {
    if (joined && g?.viewerCalendarItemId === joined.itemId) setJoined(null)
  }, [g?.viewerCalendarItemId, joined])
  if (!g) return <Page><ErrorMessage error={gathering.error} retry={() => void gathering.refetch()} />{gathering.isPending && <Loading />}</Page>
  return <ActivityPage
    activityId={g.activity.id}
    gathering={g}
    occurrence={occurrence.data}
    sessionPending={!!itemId && occurrence.isPending}
    sessionError={occurrence.error}
    refreshOccurrence={() => void occurrence.refetch()}
    gatheringAction={!itemId ? <GatheringJoin key={g.id} gathering={g} invite={invite} onJoined={(id) => setJoined({ gatheringId: g.id, itemId: id })} /> : null}
  />
}


function GatheringJoin({ gathering: g, invite, onJoined }: { gathering: Gathering; invite: string | null; onJoined: (id: string) => void }) {
  const me = useCurrentUser()
  const join = useJoinGathering()
  const [key] = useState(() => crypto.randomUUID())
  const here = `/gatherings/${g.id}${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`
  if (g.status !== 'ACTIVE') return <p>This gathering was cancelled.</p>
  if (g.isPast) return <p>This gathering has already started.</p>
  if (g.isFull) return <p>This gathering is full.</p>
  if (!me.data) return <Link className="btn btn--primary" to={`/login?returnTo=${encodeURIComponent(here)}`}>Sign in to join</Link>
  const onJoin = async () => {
    try {
      const result = await join.mutateAsync({ gatheringId: g.id, invite: invite ?? undefined, idempotencyKey: key })
      onJoined(result.calendarItemId)
      toast.success(joinedMessage(result))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not join')
    }
  }
  return <Button loading={join.isPending} disabled={join.isPending} onClick={() => void onJoin()}>Join and add to Calendar</Button>
}
