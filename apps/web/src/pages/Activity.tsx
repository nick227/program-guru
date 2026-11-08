import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  useActivities,
  useActivity,
  useAddCalendarItem,
  useCurrentUser,
} from '@project/sdk'
import { Page, Stage, Stack, Panel } from '@/components/ui/Layout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back } from '@/components/Navigation'
import { calendarUrl, isLocalDate, safeReturn, today } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { useResolveActivityTarget } from '@/lib/useResolveSlug'
import { buildActivityUrl } from '@/lib/urls'

export function ActivityPage() {
  const { id: rawSlugOrId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const resolved = useResolveActivityTarget(rawSlugOrId)
  const activity = useActivity(resolved.activityId)

  useDocumentTitle(
    activity.data?.title ??
      (resolved.isLoading || activity.isPending
        ? 'Activity'
        : resolved.notFound
          ? 'Activity not found'
          : 'Activity'),
  )

  useEffect(() => {
    if (resolved.isAlias && resolved.canonicalUrl) {
      navigate(resolved.canonicalUrl, { replace: true })
    }
  }, [resolved.isAlias, resolved.canonicalUrl, navigate])

  if (resolved.notFound) {
    return (
      <Page>
        <Stage>
          <Back to={safeReturn(params.get('returnTo'), '/discover')} />
          <h1>Activity not found</h1>
          <p className="text-muted">
            The requested activity does not exist or may have been unpublished.
          </p>
          <Link to="/discover" className="text-accent underline">
            Return to Discovery
          </Link>
        </Stage>
      </Page>
    )
  }

  return (
    <Page>
      <Stage>
        <Back to={safeReturn(params.get('returnTo'))} />
        <ErrorMessage
          error={activity.error}
          retry={() => void activity.refetch()}
        />
        {resolved.isLoading || activity.isPending ? (
          <Loading />
        ) : (
          activity.data && (
            <>
              <h1>{activity.data.title}</h1>
              <p className="text-muted">{activity.data.summary}</p>
              <Panel>
                <Stack>
                  <h2>Instructions</h2>
                  {activity.data.instructions.map((i) => (
                    <p key={i.id}>{i.body ?? i.title}</p>
                  ))}
                </Stack>
              </Panel>
              {!!activity.data.metricLabels.filter(
                (label) => !label.toLowerCase().startsWith('duration'),
              ).length && (
                <p className="text-muted">
                  {activity.data.metricLabels
                    .filter(
                      (label) => !label.toLowerCase().startsWith('duration'),
                    )
                    .join(' · ')}
                </p>
              )}
              <p className="text-sm text-muted">
                Session duration is calculated automatically while you work.
              </p>
            </>
          )
        )}
      </Stage>
    </Page>
  )
}

export function AddActivityPage() {
  const [params] = useSearchParams()
  const me = useCurrentUser()
  const [q, setQ] = useState('')
  const activities = useActivities(q)
  const add = useAddCalendarItem()
  const online = useOnline()
  const navigate = useNavigate()

  useDocumentTitle('Add Activity')

  const [day, setDay] = useState(
    params.get('day') ?? today(me.data!.data.preferences.timezone),
  )
  const [selected, setSelected] = useState('')
  const key = useRef(crypto.randomUUID())

  return (
    <Page>
      <Stage>
        <Back to={safeReturn(params.get('returnTo'))}>Calendar</Back>
        <h1>Add Activity</h1>
        <label>
          Search Activities
          <Input value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <ErrorMessage error={activities.error || add.error} />
        {activities.isPending ? (
          <Loading />
        ) : (
          activities.data?.pages
            .flatMap((p) => p.data)
            .map((a) => (
              <Button
                key={a.id}
                aria-pressed={selected === a.id}
                variant={selected === a.id ? 'default' : 'outline'}
                onClick={() => {
                  setSelected(a.id)
                  key.current = crypto.randomUUID()
                }}
              >
                {a.title}
              </Button>
            ))
        )}
        {activities.hasNextPage && (
          <Button
            variant="ghost"
            onClick={() => void activities.fetchNextPage()}
          >
            Load more
          </Button>
        )}
        <label>
          Date
          <Input
            type="date"
            value={day}
            onChange={(e) => {
              setDay(e.target.value)
              key.current = crypto.randomUUID()
            }}
          />
        </label>
        <p className="text-muted">Does not repeat</p>
        <Button
          disabled={!selected || !isLocalDate(day) || !online}
          loading={add.isPending}
          onClick={async () => {
            try {
              await add.mutateAsync({
                activityId: selected,
                localDate: day,
                idempotencyKey: key.current,
              })
              navigate(calendarUrl(day))
            } catch {
              /* preserve input */
            }
          }}
        >
          Add to Calendar
        </Button>
      </Stage>
    </Page>
  )
}
