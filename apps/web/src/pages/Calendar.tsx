import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  useCalendar,
  useCurrentUser,
  useLogout,
  useUndoCompletion,
} from '@project/sdk'
import { toast } from 'sonner'
import { Page, Stack, Row, Panel } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { CalendarSurface } from '@/components/CalendarSurface'
import { linkButton } from '@/components/Navigation'
import {
  addDays,
  calendarUrl,
  dateLabel,
  isLocalDate,
  today,
  weekOf,
} from '@/lib/dates'
import { toggleTheme } from '@/lib/theme'
import { useOnline } from '@/lib/useOnline'
export function CalendarPage() {
  const me = useCurrentUser()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const online = useOnline()
  const timezone = me.data!.data.preferences.timezone
  const current = today(timezone)
  const start = isLocalDate(params.get('week'))
    ? weekOf(params.get('week')!)
    : weekOf(current)
  const selected =
    isLocalDate(params.get('day')) &&
    params.get('day')! >= start &&
    params.get('day')! <= addDays(start, 6)
      ? params.get('day')!
      : current >= start && current <= addDays(start, 6)
        ? current
        : start
  const calendar = useCalendar(start, addDays(start, 6))
  const logout = useLogout()
  const undo = useUndoCompletion()
  const origin = calendarUrl(selected, start)
  const selectDay = (day: string) => setParams({ week: start, day })
  return (
    <Page className="max-w-7xl">
      <Stack className="gap-6">
        <Row className="justify-between">
          <div>
            <p className="mb-2 font-display text-xs tracking-widest text-muted">
              PROGRAMS
            </p>
            <h1>Your week</h1>
          </div>
          <details className="relative">
            <summary
              className="flex min-h-11 cursor-pointer items-center rounded-full border bg-surface px-4"
              aria-label="Account"
            >
              {me.data!.data.profile.displayName}
            </summary>
            <Panel className="absolute right-0 z-20 mt-2 w-56 shadow-lg">
              <Stack>
                <Link to="/library" className={linkButton}>
                  My Programs
                </Link>
                <Button variant="ghost" onClick={toggleTheme}>
                  Change theme
                </Button>
                <Button
                  variant="outline"
                  loading={logout.isPending}
                  onClick={async () => {
                    try {
                      await logout.mutateAsync()
                      navigate('/login', { replace: true })
                    } catch {
                      /* error below */
                    }
                  }}
                >
                  Sign out
                </Button>
                <ErrorMessage error={logout.error} />
              </Stack>
            </Panel>
          </details>
        </Row>
        <Row className="justify-between">
          <Row>
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous week"
              onClick={() =>
                navigate(calendarUrl(addDays(selected, -7), addDays(start, -7)))
              }
            >
              <ChevronLeft size={18} />
            </Button>
            <span className="font-display font-semibold">
              {dateLabel(start)} – {dateLabel(addDays(start, 6))}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next week"
              onClick={() =>
                navigate(calendarUrl(addDays(selected, 7), addDays(start, 7)))
              }
            >
              <ChevronRight size={18} />
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate(calendarUrl(current))}
            >
              Today
            </Button>
          </Row>
          <Row>
            <Link
              to={`/discover?returnTo=${encodeURIComponent(origin)}`}
              className={linkButton}
            >
              <Plus size={16} />
              Program
            </Link>
            <Link
              to={`/add-activity?day=${selected}&returnTo=${encodeURIComponent(origin)}`}
              className={linkButton}
            >
              <Plus size={16} />
              Activity
            </Link>
          </Row>
        </Row>
        <p className="text-xs text-muted">
          {timezone.replaceAll('_', ' ')}
          {calendar.isFetching && !calendar.isPending ? ' · Refreshing…' : ''}
        </p>
        {params.get('completed') && (
          <Panel>
            <Row className="justify-between">
              <p role="status">Activity finished</p>
              <Button
                variant="outline"
                disabled={!online}
                loading={undo.isPending}
                onClick={async () => {
                  try {
                    await undo.mutateAsync(params.get('completed')!)
                    const next = new URLSearchParams(params)
                    next.delete('completed')
                    setParams(next, { replace: true })
                    toast.success('Completion undone')
                  } catch {
                    /* error below */
                  }
                }}
              >
                Undo
              </Button>
            </Row>
            <ErrorMessage error={undo.error} />
          </Panel>
        )}
        <ErrorMessage
          error={calendar.error}
          retry={() => void calendar.refetch()}
        />
        {calendar.isPending ? (
          <Loading />
        ) : (
          <>
            <CalendarSurface
              days={Array.from({ length: 7 }, (_, i) => {
                const id = addDays(start, i)
                return {
                  id,
                  label: dateLabel(id, { weekday: 'short' }),
                  number: id.slice(-2),
                  today: id === current,
                }
              })}
              selected={selected}
              onSelect={selectDay}
              items={(calendar.data ?? []).map((item) => ({
                id: item.id,
                day: item.localDate,
                title: item.title,
                detail: [item.localTime, item.programTitle]
                  .filter(Boolean)
                  .join(' · '),
                done: item.status === 'DONE',
                locked: item.locked,
                href: `/occurrences/${item.id}?returnTo=${encodeURIComponent(calendarUrl(item.localDate, start))}`,
              }))}
            />
            {calendar.data?.length === 0 && (
              <Panel className="text-center">
                <Stack className="items-center py-6">
                  <h2>Nothing scheduled this week</h2>
                  <Link
                    to={`/discover?returnTo=${encodeURIComponent(origin)}`}
                    className={linkButton + ' bg-accent text-white'}
                  >
                    Browse Programs
                  </Link>
                  <Link
                    to={`/add-activity?day=${selected}`}
                    className="text-muted underline"
                  >
                    Add Activity
                  </Link>
                </Stack>
              </Panel>
            )}
          </>
        )}
      </Stack>
    </Page>
  )
}
