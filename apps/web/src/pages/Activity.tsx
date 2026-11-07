import { useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
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
export function ActivityPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const activity = useActivity(id)
  return (
    <Page>
      <Stage>
        <Back to={safeReturn(params.get('returnTo'))} />
        <ErrorMessage
          error={activity.error}
          retry={() => void activity.refetch()}
        />
        {activity.isPending ? (
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
              <p className="text-muted">
                {activity.data.metricLabels.join(' · ')}
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
