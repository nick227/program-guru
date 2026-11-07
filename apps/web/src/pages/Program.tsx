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
import { Avatar } from '@/components/ui/Avatar'
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
  const cta =
    p.canJoin && p.accessMode === 'OPEN'
      ? 'Join Free'
      : p.canRequestAccess
        ? 'Request Access'
        : p.canPurchase
          ? p.prices.some((price) => price.kind === 'MONTHLY')
            ? 'Subscribe'
            : 'Buy Program'
          : null
  return (
    <Page>
      <Stage>
        <Back to={safeReturn(params.get('returnTo'), '/discover')} />
        {p.coverUrl && (
          <img
            src={p.coverUrl}
            alt=""
            className="aspect-[2/1] w-full rounded-xl object-cover"
          />
        )}
        <Stack className="gap-2">
          <Row>
            {p.creator && (
              <Link
                to={`/${p.creator.handle}`}
                className="flex items-center gap-2 text-muted hover:text-text"
              >
                <Avatar
                  src={p.creator.avatarUrl}
                  name={p.creator.displayName}
                  size="sm"
                />
                <span>{p.creator.displayName}</span>
              </Link>
            )}
            {!p.creator && p.isPlatform && (
              <span className="text-xs text-muted">Platform library</span>
            )}
            <span className="text-xs text-muted">· {p.type.label}</span>
          </Row>
          <h1>{p.title}</h1>
          <p className="text-muted">
            {p.focus?.label ? `${p.focus.label} · ` : ''}
            {p.frequencyLabel} ·{' '}
            {p.durationDays ? `${p.durationDays} days` : 'Ongoing'}
          </p>
          {p.description && <p>{p.description}</p>}
        </Stack>
        <Panel>
          <Stack>
            <h2>Activities</h2>
            {p.safeActivityOutline.map((a, i) => (
              <Row key={i} className="justify-between">
                <span>{a.title}</span>
                {a.mediaPreviewUrl && (
                  <img
                    src={a.mediaPreviewUrl}
                    alt=""
                    className="h-8 w-8 rounded object-cover"
                  />
                )}
              </Row>
            ))}
            {!p.safeActivityOutline.length && (
              <p className="text-muted">Outline available after joining.</p>
            )}
          </Stack>
        </Panel>
        {((p.enrollmentCount ?? 0) > 0 || p.completionRate != null) && (
          <p className="text-xs text-muted">
            {p.enrollmentCount ?? 0} participants
            {p.completionRate != null
              ? ` · ${Math.round(p.completionRate * 100)}% completion`
              : ''}
          </p>
        )}
        <ErrorMessage error={program.error || preview.error || join.error} />
        {p.myEnrollmentId ? (
          <Link className={linkButton} to="/">
            Open Calendar
          </Link>
        ) : me.isPending ? (
          <Loading />
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
              <Button onClick={() => setJoining(true)}>{cta ?? 'Join Free'}</Button>
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
            {cta === 'Request Access'
              ? 'Request access is not available in this browser slice yet.'
              : cta === 'Buy Program' || cta === 'Subscribe'
                ? 'Checkout opens when billing is enabled.'
                : 'This Program requires access before joining.'}
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
