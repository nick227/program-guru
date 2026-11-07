import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  useCurrentUser,
  useJoinProgram,
  usePreviewEnrollment,
  useProgramPreview,
} from '@project/sdk'
import { toast } from 'sonner'
import { Page, Stage, Stack, Panel, Row } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/Navigation'
import {
  calendarUrl,
  dateLabel,
  isLocalDate,
  safeReturn,
  today,
} from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
export function ProgramPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const program = useProgramPreview(id)
  const me = useCurrentUser()
  const online = useOnline()
  const navigate = useNavigate()
  const tz =
    me.data?.data.preferences.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone
  const [joining, setJoining] = useState(false)
  const [date, setDate] = useState('')
  const start = date || today(tz)
  const preview = usePreviewEnrollment(id)
  const join = useJoinProgram(id)
  const key = useRef(crypto.randomUUID())
  const p = program.data
  if (!p)
    return (
      <Page>
        <Back to="/discover" />
        <ErrorMessage
          error={program.error}
          retry={() => void program.refetch()}
        />
        {program.isPending && <Loading />}
      </Page>
    )
  const body = {
    programVersionId: p.latestVersionId!,
    startLocalDate: start,
    timezone: tz,
  }
  return (
    <Page>
      <Stage>
        <Back to={safeReturn(params.get('returnTo'), '/discover')} />
        <p className="text-xs text-muted">
          {p.isPlatform ? 'Platform library' : p.creator?.displayName} ·{' '}
          {p.type.label}
        </p>
        <h1>{p.title}</h1>
        <p className="text-muted">
          {p.frequencyLabel} ·{' '}
          {p.durationDays ? `${p.durationDays} days` : 'Ongoing'}
        </p>
        {p.description && <p>{p.description}</p>}
        <Panel>
          <Stack>
            <h2>Activities</h2>
            {p.safeActivityOutline.map((a, i) => (
              <p key={i}>{a.title}</p>
            ))}
          </Stack>
        </Panel>
        <ErrorMessage error={program.error || preview.error || join.error} />
        {p.myEnrollmentId ? (
          <Link className={linkButton} to="/">
            Open Calendar
          </Link>
        ) : !me.data ? (
          <Link
            className={linkButton}
            to={`/login?returnTo=${encodeURIComponent(`/programs/${id}`)}`}
          >
            Sign in to join
          </Link>
        ) : p.canJoin && p.latestVersionId ? (
          <>
            {!joining ? (
              <Button onClick={() => setJoining(true)}>Join Free</Button>
            ) : (
              <Panel>
                <Stack>
                  <h2>When do you want to start?</h2>
                  <label className="space-y-2">
                    Start date
                    <Input
                      type="date"
                      value={start}
                      disabled={join.isPending || preview.isPending}
                      onChange={(e) => {
                        setDate(e.target.value)
                        preview.reset()
                        key.current = crypto.randomUUID()
                      }}
                    />
                  </label>
                  <p className="text-xs text-muted">{tz}</p>
                  <Button
                    variant="outline"
                    disabled={!online || !isLocalDate(start)}
                    loading={preview.isPending}
                    onClick={() => preview.mutate(body)}
                  >
                    Preview my calendar
                  </Button>
                  {preview.data && (
                    <>
                      <p>
                        {preview.data.itemCount} Activities will be scheduled
                        automatically.
                      </p>
                      <ul className="space-y-2 text-sm text-muted">
                        {preview.data.items.slice(0, 7).map((item, i) => (
                          <li key={i}>
                            {dateLabel(item.localDate)} · {item.title}
                            {item.conflict
                              ? ' · Overlaps another Activity'
                              : ''}
                          </li>
                        ))}
                      </ul>
                      <Button
                        disabled={!online}
                        loading={join.isPending}
                        onClick={async () => {
                          try {
                            await join.mutateAsync({
                              ...body,
                              idempotencyKey: key.current,
                            })
                            toast.success('Program added to your calendar')
                            navigate(calendarUrl(start))
                          } catch {
                            /* keep key and date for safe retry */
                          }
                        }}
                      >
                        Confirm &amp; add to Calendar
                      </Button>
                    </>
                  )}
                </Stack>
              </Panel>
            )}
          </>
        ) : (
          <p className="text-muted">
            This Program requires access before joining.
          </p>
        )}
        {p.viewerAccess === 'OWNER' && (
          <Row>
            <Link className={linkButton} to={`/programs/${id}/workspace`}>
              Edit Program
            </Link>
          </Row>
        )}
      </Stage>
    </Page>
  )
}
