import { useState } from 'react'
import { lookingForText } from '@/lib/lookingFor'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { MapPin, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrentUser, useGathering, useJoinGathering } from '@project/sdk'
import { gatheringWhen, joinedMessage } from '@/components/activity/ActivityGatherings'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Page } from '@/components/ui/Layout'
import { ReportButton } from '@/components/shared/ReportButton'
import { activityHero } from '@/lib/hero'
import { useDocumentTitle } from '@/lib/title'
import { buildActivityUrl } from '@/lib/urls'

/**
 * A share link lands here: this exact occurrence (10 §9.7), never another date or the bare Activity.
 * Joining puts it on the Calendar and opens the member's own occurrence, the existing room.
 */
export function GatheringPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const invite = params.get('invite')
  const navigate = useNavigate()
  const me = useCurrentUser()
  const gathering = useGathering(id, invite)
  const join = useJoinGathering()
  const categorySlugOf = useCategorySlugOf()
  const [joining, setJoining] = useState(false)
  const g = gathering.data
  useDocumentTitle(g ? `${g.activity.title} · ${gatheringWhen(g)}` : 'Gathering')
  const here = `/gatherings/${id}${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`

  const onJoin = async () => {
    if (!g) return
    if (g.viewerCalendarItemId) return navigate(`/occurrences/${g.viewerCalendarItemId}`)
    setJoining(true)
    try {
      const result = await join.mutateAsync({ gatheringId: g.id, invite: invite ?? undefined, idempotencyKey: crypto.randomUUID() })
      toast.success(joinedMessage(result))
      navigate(`/occurrences/${result.calendarItemId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not join')
    } finally {
      setJoining(false)
    }
  }

  return (
    <Page className="pb-20">
      <div className="mx-auto mt-8 w-full max-w-xl space-y-6">
        {gathering.isPending ? (
          <Loading />
        ) : !g ? (
          <ErrorMessage error={gathering.error ?? new Error('This gathering is not available')} />
        ) : (
          <>
            <div className="overflow-hidden rounded-xl">
              <EntityHero hero={activityHero(g.activity, categorySlugOf)} size="card" interactive={false} className="aspect-video w-full" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted">{gatheringWhen(g)}</p>
              <h1 className="font-display text-3xl font-semibold tracking-tight">{g.activity.title}</h1>
              {g.place && (
                <p className="flex items-center gap-1.5 text-sm text-muted">
                  <MapPin size={15} aria-hidden />
                  Suggested place: {g.place.name}, {g.place.locality}
                </p>
              )}
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Users size={15} aria-hidden />
                {g.memberCount} {g.memberCount === 1 ? 'person' : 'people'}
                {g.capacity ? ` of ${g.capacity}` : ''} · organized by {g.owner.displayName}
              </p>
              <div className="flex">
                {g.members.slice(0, 8).map((m) => (
                  <Avatar key={m.id} src={m.avatarUrl} name={m.displayName} size="sm" className="-ml-1.5 h-8 w-8 ring-2 ring-background first:ml-0" />
                ))}
              </div>
              {g.lookingFor && (
                <p className="rounded-lg border border-border/60 bg-surface-muted/60 p-3 text-sm">
                  {lookingForText(g.lookingFor)}
                </p>
              )}
              {g.categories.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Categories">
                  {g.categories.map((c) => (
                    <li key={c.id} className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-foreground/80">
                      {c.label}
                    </li>
                  ))}
                </ul>
              )}
              {g.activity.summary && <p className="pt-2 text-[15px] leading-relaxed text-foreground/85">{g.activity.summary}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {!me.data ? (
                <Link className="btn btn--primary" to={`/login?returnTo=${encodeURIComponent(here)}`}>
                  Sign in to join
                </Link>
              ) : g.viewerCalendarItemId ? (
                <Button onClick={() => void onJoin()}>Open</Button>
              ) : g.status !== 'ACTIVE' ? (
                <p className="text-sm text-muted">This gathering was cancelled.</p>
              ) : g.isPast ? (
                <p className="text-sm text-muted">This gathering has already started.</p>
              ) : g.isFull ? (
                <p className="text-sm text-muted">This gathering is full.</p>
              ) : (
                <Button loading={joining} onClick={() => void onJoin()}>
                  Join and add to Calendar
                </Button>
              )}
              <Link className="text-sm font-medium text-accent hover:underline" to={buildActivityUrl(g.activity)}>
                About this Activity
              </Link>
              {g.lookingFor && <ReportButton target={{ type: 'GATHERING', id: g.id }} ownerId={g.owner.id} label="Report note" />}
            </div>
          </>
        )}
      </div>
    </Page>
  )
}
