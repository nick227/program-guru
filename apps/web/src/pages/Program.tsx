import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  useAcceptEnrollmentUpdate,
  useCurrentUser,
  useDismissEnrollmentUpdate,
  useEnrollment,
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
import { ProgramGroups } from '@/components/ProgramGroups'
import {
  calendarUrl,
  dateLabel,
  isLocalDate,
  safeReturn,
  today,
} from '@/lib/dates'
import { hasSeenDailyEmailPrompt } from '@/lib/notifications'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { useResolveProgramTarget } from '@/lib/useResolveSlug'
import { buildGroupUrl, buildProfileUrl, buildProgramUrl, buildWorkspaceUrl } from '@/lib/urls'
import { EntityHero, useCategorySlugOf } from '@/components/EntityHero'
import { programHero } from '@/lib/hero'
import { RelatedMediaRiver, type RiverItem } from '@/components/RelatedMediaRiver'

export function ProgramPage() {
  const paramsFromRouter = useParams()
  const rawHandle = paramsFromRouter.handle ? paramsFromRouter.handle.replace(/^@+/, '') : null
  const rawSlugOrId = paramsFromRouter.slug || paramsFromRouter.id || ''

  const resolved = useResolveProgramTarget(rawSlugOrId, rawHandle)
  const id = resolved.programId

  const [params] = useSearchParams()
  const groupIdParam = params.get('groupId')?.trim() || undefined
  const program = useProgramPreview(id)
  const categorySlugOf = useCategorySlugOf()
  const me = useCurrentUser()
  const online = useOnline()
  const navigate = useNavigate()

  useDocumentTitle(
    program.data?.title ??
      (resolved.isLoading || program.isPending
        ? 'Program'
        : resolved.notFound
          ? 'Program not found'
          : 'Program'),
  )

  useEffect(() => {
    if (resolved.isAlias && resolved.canonicalUrl) {
      navigate(resolved.canonicalUrl, { replace: true })
    }
  }, [resolved.isAlias, resolved.canonicalUrl, navigate])

  const tz =
    me.data?.data.preferences.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone
  const [joining, setJoining] = useState(!!groupIdParam)
  const requestedStartDate = params.get('startDate')
  const [date, setDate] = useState(
    requestedStartDate && isLocalDate(requestedStartDate)
      ? requestedStartDate
      : '',
  )

  useEffect(() => {
    if (!groupIdParam) return
    setJoining(true)
    if (requestedStartDate && isLocalDate(requestedStartDate)) {
      setDate(requestedStartDate)
    }
  }, [groupIdParam, requestedStartDate])

  const start = date || today(tz)
  const preview = usePreviewEnrollment(id)
  const join = useJoinProgram(id)
  const enrollmentId = program.data?.myEnrollmentId ?? ''
  const enrollment = useEnrollment(enrollmentId)
  const acceptUpdate = useAcceptEnrollmentUpdate(enrollmentId)
  const dismissUpdate = useDismissEnrollmentUpdate(enrollmentId)
  const key = useRef(crypto.randomUUID())
  const p = program.data

  if (resolved.notFound) {
    return (
      <Page>
        <Stage>
          <Back to="/discover" />
          <h1>Program not found</h1>
          <p className="text-muted">
            The requested program does not exist or may have been unpublished.
          </p>
          <Link to="/discover" className="text-accent underline">
            Return to Discovery
          </Link>
        </Stage>
      </Page>
    )
  }

  if (!p) {
    return (
      <Page>
        <Back to="/discover" />
        <ErrorMessage
          error={program.error}
          retry={() => void program.refetch()}
        />
        {(resolved.isLoading || program.isPending) && <Loading />}
      </Page>
    )
  }

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

  const canonicalUrl = buildProgramUrl(p, { scoped: !!rawHandle })

  return (
    <Page>
      <Stage>
        <Back to={safeReturn(params.get('returnTo'), '/discover')} />
        <EntityHero hero={programHero(p, categorySlugOf)} size="banner" />
        <Stack className="gap-2">
          <Row>
            {p.creator && (
              <Link
                to={buildProfileUrl(p.creator.handle)}
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
        {p.safeActivityOutline.some((a) => a.mediaPreviewUrl) || p.coverUrl ? (
          <Panel>
            <RelatedMediaRiver
              title="Related Program Media"
              description="Visuals and activity demonstrations in this Program"
              items={[
                ...(p.coverUrl
                  ? [
                      {
                        id: `${p.id}-cover`,
                        thumbnailUrl: p.coverUrl,
                        title: `${p.title} (Cover)`,
                        type: 'PHOTO' as const,
                      },
                    ]
                  : []),
                ...p.safeActivityOutline
                  .filter((a) => Boolean(a.mediaPreviewUrl))
                  .map((a, i) => ({
                    id: `${p.id}-act-${i}`,
                    thumbnailUrl: a.mediaPreviewUrl,
                    title: a.title,
                    type: 'PHOTO' as const,
                  })),
              ]}
            />
          </Panel>
        ) : null}
        {((p.enrollmentCount ?? 0) > 0 || p.completionRate != null) && (
          <p className="text-xs text-muted">
            {p.enrollmentCount ?? 0} participants
            {p.completionRate != null
              ? ` · ${Math.round(p.completionRate * 100)}% completion`
              : ''}
          </p>
        )}
        {me.data && p.latestVersionId && (
          <ProgramGroups
            programId={id}
            versionId={p.latestVersionId}
            enrollmentId={p.myEnrollmentId}
            isProgramOwner={p.viewerAccess === 'OWNER'}
            timezone={tz}
          />
        )}
        <ErrorMessage
          error={
            program.error ||
            preview.error ||
            join.error ||
            acceptUpdate.error ||
            dismissUpdate.error
          }
        />
        {p.myEnrollmentId ? (
          <Stack className="gap-3">
            {enrollment.data?.participationStartDate && (
              <p className="text-xs text-muted">
                Joined on {dateLabel(enrollment.data.participationStartDate)} (
                {enrollment.data.participationStartDate})
              </p>
            )}
            {enrollment.data?.pendingVersionId && (
              <Panel className="border-accent bg-accent/5">
                <Stack className="gap-2">
                  <h2>Update available</h2>
                  <p className="text-sm text-muted">
                    The creator published a new version of this Program. Accept
                    to update future scheduled Activities while keeping your
                    past results and personal adjustments.
                  </p>
                  <Row>
                    <Button
                      disabled={!online}
                      loading={acceptUpdate.isPending}
                      onClick={async () => {
                        try {
                          await acceptUpdate.mutateAsync()
                          toast.success('Program updated to latest version')
                        } catch {
                          /* shown above */
                        }
                      }}
                    >
                      Accept update
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!online}
                      loading={dismissUpdate.isPending}
                      onClick={async () => {
                        try {
                          await dismissUpdate.mutateAsync()
                          toast.success('Update dismissed')
                        } catch {
                          /* shown above */
                        }
                      }}
                    >
                      Dismiss
                    </Button>
                  </Row>
                </Stack>
              </Panel>
            )}
            <Row>
              <Link className={linkButton} to="/">
                Open Calendar
              </Link>
              {enrollment.data?.groupId && (
                <Link
                  className={linkButton}
                  to={buildGroupUrl(enrollment.data.groupId)}
                >
                  Open Group
                </Link>
              )}
            </Row>
          </Stack>
        ) : me.isPending ? (
          <Loading />
        ) : !me.data ? (
          <Link
            className={linkButton}
            to={`/login?returnTo=${encodeURIComponent(canonicalUrl)}`}
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
                              ...(groupIdParam
                                ? { groupId: groupIdParam }
                                : {}),
                              idempotencyKey: key.current,
                            })
                            toast.success('Program added to your calendar')
                            const userId = me.data?.data.id ?? ''
                            const dailyEmailEnabled =
                              me.data?.data.preferences.notifications
                                ?.dailyEmail ?? false
                            const shouldOfferPrompt =
                              userId &&
                              !dailyEmailEnabled &&
                              !hasSeenDailyEmailPrompt(userId)
                            const nextUrl = shouldOfferPrompt
                              ? `${calendarUrl(start)}&promptReminder=1`
                              : calendarUrl(start)
                            navigate(nextUrl)
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
            <Link className={linkButton} to={buildWorkspaceUrl(id)}>
              Edit Program
            </Link>
          </Row>
        )}
      </Stage>
    </Page>
  )
}
