import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ApiError,
  useAcceptEnrollmentUpdate,
  useCurrentUser,
  useDismissEnrollmentUpdate,
  useEnrollment,
  useJoinProgram,
  usePreviewEnrollment,
  useProgramPreview,
} from '@project/sdk'
import { toast } from 'sonner'
import { Page, Stage, Panel } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back } from '@/components/Navigation'
import { ProgramHero } from '@/components/ProgramHero'
import { ProgramParticipationStrip } from '@/components/ProgramParticipationStrip'
import { ProgramActivityCard } from '@/components/ProgramActivityCard'
import { ProgramSchedulePreview } from '@/components/ProgramSchedulePreview'
import { ProgramGroups } from '@/components/ProgramGroups'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { StatusText, enrollmentStatusText } from '@/components/ui/StatusText'
import { ProgramMediaGallery, type ProgramMediaItem } from '@/components/ProgramMediaGallery'
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
import { buildGroupUrl, buildProgramUrl, buildWorkspaceUrl } from '@/lib/urls'
import { activityHero, programHero } from '@/lib/hero'
import { useCategorySlugOf } from '@/components/EntityHero'

export function ProgramPage() {
  const paramsFromRouter = useParams()
  const rawHandle = paramsFromRouter.handle ? paramsFromRouter.handle.replace(/^@+/, '') : null
  const rawSlugOrId = paramsFromRouter.slug || paramsFromRouter.id || ''

  const resolved = useResolveProgramTarget(rawSlugOrId, rawHandle)
  const id = resolved.programId

  const [params] = useSearchParams()
  const queryString = params.toString()
  const groupIdParam = params.get('groupId')?.trim() || undefined
  const program = useProgramPreview(id)
  const categorySlugOf = useCategorySlugOf()
  const me = useCurrentUser()
  const online = useOnline()
  const navigate = useNavigate()

  const scheduleSectionRef = useRef<HTMLDivElement>(null)
  const togetherSectionRef = useRef<HTMLElement>(null)

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
      navigate(`${resolved.canonicalUrl}${queryString ? `?${queryString}` : ''}`, { replace: true })
    }
  }, [resolved.isAlias, resolved.canonicalUrl, queryString, navigate])

  const tz =
    me.data?.data.preferences.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone

  const [joining, setJoining] = useState(!!groupIdParam || params.get('start') === '1')
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

  if (resolved.notFound || (program.error instanceof ApiError && program.error.status === 404 && !p)) {
    return (
      <Page>
        <Stage className="max-w-3xl mx-auto py-12">
          <Back to="/discover" />
          <h1 className="text-2xl font-bold font-display mt-4">Program not found</h1>
          <p className="text-muted mt-2">
            The requested program does not exist or may have been unpublished.
          </p>
          <Link to="/discover" className="text-accent underline mt-4 inline-block">
            Return to Discovery
          </Link>
        </Stage>
      </Page>
    )
  }

  if (!p) {
    return (
      <Page>
        <Stage className="max-w-3xl mx-auto py-12">
          <Back to="/discover" />
          <ErrorMessage
            error={program.error}
            retry={() => void program.refetch()}
          />
          {(resolved.isLoading || program.isPending) && <Loading />}
        </Stage>
      </Page>
    )
  }

  const isEnrolled = !!p.myEnrollmentId
  const isOwner = p.viewerAccess === 'OWNER'
  const canonicalUrl = buildProgramUrl(p, { scoped: !!rawHandle })
  const signedIn = !!me.data
  const groupId = enrollment.data?.groupId ?? null
  const enrolledStatus = enrollmentStatusText(enrollment.data?.status)
  // Mirrors ProgramGroups: only participants and the owner can start a group.
  const canStartGroup = signedIn && !!p.latestVersionId && (isEnrolled || isOwner)

  const body = {
    programVersionId: p.latestVersionId!,
    startLocalDate: start,
    timezone: tz,
  }

  // One primary action for the viewer's access state (13 §4).
  const accessCta =
    p.canJoin && p.accessMode === 'OPEN'
      ? 'Start Program'
      : p.canRequestAccess
        ? 'Request Access'
        : p.canPurchase
          ? p.prices.some((price) => price.kind === 'MONTHLY')
            ? 'Subscribe'
            : 'Buy Program'
          : null
  const primaryLabel = isEnrolled
    ? 'Open Calendar'
    : !signedIn
      ? 'Sign in to join'
      : p.canJoin && p.latestVersionId
        ? (accessCta ?? 'Start Program')
        : accessCta

  const handlePrimary = () => {
    if (isEnrolled) {
      navigate('/')
      return
    }
    if (!signedIn) {
      navigate(`/login?returnTo=${encodeURIComponent(canonicalUrl)}`)
      return
    }
    setJoining(true)
    scheduleSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const scrollToTogether = () => {
    togetherSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Preview-safe imagery the API returned for the outline: platform-licensed stills only.
  const mediaGalleryItems: ProgramMediaItem[] = p.safeActivityOutline
    .filter((a) => Boolean(a.mediaPreviewUrl))
    .map((a, i) => ({
      id: `${p.id}-media-${i}`,
      thumbnailUrl: a.mediaPreviewUrl,
      title: a.title,
      type: 'PHOTO' as const,
    }))

  return (
    <Page className="page--content pb-16">
      <div className="w-full space-y-6 sm:space-y-8">
        <ProgramHero
          title={p.title}
          description={p.description}
          hero={programHero(p, categorySlugOf)}
          durationDays={p.durationDays}
          frequencyLabel={p.frequencyLabel}
          activityCount={p.safeActivityOutline.length}
          categoryLabel={p.type.label}
          creator={p.creator}
          isPlatform={p.isPlatform}
          isOwner={isOwner}
          primaryLabel={primaryLabel}
          backTo={safeReturn(params.get('returnTo'), '/discover')}
          backLabel="Back"
          onPrimary={handlePrimary}
          onDoTogether={canStartGroup ? scrollToTogether : undefined}
          onEditProgram={isOwner ? () => navigate(buildWorkspaceUrl(id)) : undefined}
        />

        <ProgramParticipationStrip
          participantCount={p.enrollmentCount}
          completionRate={p.completionRate}
          completionMetricLabel="of enrolled participants completed all activities"
          groupId={groupId}
          onStartGroup={canStartGroup ? scrollToTogether : undefined}
        />

        <ErrorMessage
          error={
            program.error ||
            preview.error ||
            join.error ||
            acceptUpdate.error ||
            dismissUpdate.error
          }
        />

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="space-y-8 lg:col-span-7">
            <section aria-label="Program activities" className="space-y-4">
              <SectionHeader title="Activities" />
              {p.safeActivityOutline.length > 0 ? (
                <div className="space-y-3">
                  {p.safeActivityOutline.map((item, idx) => (
                    <ProgramActivityCard
                      key={idx}
                      title={item.title}
                      hero={activityHero(
                        {
                          title: item.title,
                          thumbnailUrl: item.mediaPreviewUrl,
                          categoryId: p.type?.categoryId,
                        },
                        categorySlugOf,
                      )}
                      meta={item.dayIndex != null ? `Starts day ${item.dayIndex + 1}` : null}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">Outline available after joining.</p>
              )}
            </section>

            <ProgramMediaGallery
              title="Related Media"
              description="Previews of this Program's Activities."
              items={mediaGalleryItems}
              coverUrl={p.coverUrl}
            />
          </div>

          <div className="space-y-6 lg:col-span-5">
            {isEnrolled && (
              <section
                aria-label="Your participation"
                className="space-y-3 rounded-[var(--radius-panel)] border border-accent/40 bg-accent/5 p-5"
              >
                <div className="flex items-center justify-between">
                  <StatusText status={enrolledStatus.status}>{enrolledStatus.label}</StatusText>
                  {enrollment.data?.participationStartDate && (
                    <span className="text-xs text-muted">
                      Joined {dateLabel(enrollment.data.participationStartDate)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground">
                  Your scheduled sessions appear on your Calendar.
                </p>

                {enrollment.data?.pendingVersionId && (
                  <div className="mt-2 space-y-2 rounded-[var(--radius-control)] border border-border bg-surface p-3.5">
                    <h3 className="text-sm font-semibold text-foreground">Update available</h3>
                    <p className="text-sm text-muted">
                      The creator published a new version of this Program. Accept to update future
                      scheduled Activities while keeping your past results and personal adjustments.
                    </p>
                    {enrollment.data.status === 'PAUSED' && (
                      <p className="text-sm text-muted">
                        Resume your Program from its management view before adopting an update.
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        disabled={!online || enrollment.data.status !== 'ACTIVE'}
                        loading={acceptUpdate.isPending}
                        onClick={async () => {
                          try {
                            await acceptUpdate.mutateAsync()
                            toast.success('Program updated to latest version')
                          } catch {
                            // shown in ErrorMessage
                          }
                        }}
                      >
                        Accept update
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!online}
                        loading={dismissUpdate.isPending}
                        onClick={async () => {
                          try {
                            await dismissUpdate.mutateAsync()
                            toast.success('Update dismissed')
                          } catch {
                            // shown in ErrorMessage
                          }
                        }}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Link className="btn btn--outline" to={`/library?program=${p.id}`}>
                    Manage my Program
                  </Link>
                  {groupId && (
                    <Link className="btn btn--outline" to={buildGroupUrl(groupId)}>
                      Open Group
                    </Link>
                  )}
                </div>
              </section>
            )}

            <div ref={scheduleSectionRef} className="space-y-4">
              <ProgramSchedulePreview
                durationDays={p.durationDays}
                frequencyLabel={p.frequencyLabel}
                programDays={p.programDays}
                placements={p.placements}
                activities={p.safeActivityOutline}
                onPreviewDates={
                  !isEnrolled && signedIn && p.canJoin && p.latestVersionId
                    ? () => setJoining(true)
                    : undefined
                }
              />

              {joining && !isEnrolled && signedIn && (
                p.canJoin && p.latestVersionId ? (
                  <Panel className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-base font-bold text-foreground">
                        When do you want to start?
                      </h3>
                      <button
                        type="button"
                        onClick={() => setJoining(false)}
                        className="text-sm text-muted hover:text-foreground"
                      >
                        Close
                      </button>
                    </div>

                    <label className="block space-y-1.5">
                      <span className="text-sm font-semibold text-muted">Start date</span>
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
                      className="w-full"
                      disabled={!online || !isLocalDate(start)}
                      loading={preview.isPending}
                      onClick={() => preview.mutate(body)}
                    >
                      Preview my calendar
                    </Button>

                    {preview.data && (
                      <div className="space-y-3 border-t border-border pt-3">
                        <p className="text-sm font-semibold text-foreground">
                          {preview.data.itemCount} Activities will be scheduled automatically.
                        </p>
                        <ul className="max-h-40 space-y-1.5 overflow-y-auto pr-1 text-sm text-muted">
                          {preview.data.items.slice(0, 7).map((item, i) => (
                            <li
                              key={i}
                              className="flex items-center justify-between gap-2 border-b border-border py-1 last:border-0"
                            >
                              <span className="truncate">
                                {dateLabel(item.localDate)} · {item.title}
                              </span>
                              {item.conflict && (
                                <span className="shrink-0 text-xs font-semibold text-attention">
                                  Overlaps another Activity
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                        <Button
                          size="lg"
                          className="w-full"
                          disabled={!online}
                          loading={join.isPending}
                          onClick={async () => {
                            try {
                              await join.mutateAsync({
                                ...body,
                                ...(groupIdParam ? { groupId: groupIdParam } : {}),
                                idempotencyKey: key.current,
                              })
                              toast.success('Program added to your calendar')
                              const userId = me.data?.data.id ?? ''
                              const dailyEmailEnabled =
                                me.data?.data.preferences.notifications?.dailyEmail ?? false
                              const shouldOfferPrompt =
                                userId && !dailyEmailEnabled && !hasSeenDailyEmailPrompt(userId)
                              navigate(
                                shouldOfferPrompt
                                  ? `${calendarUrl(start)}&promptReminder=1`
                                  : calendarUrl(start),
                              )
                            } catch {
                              // keep key and date for safe retry
                            }
                          }}
                        >
                          Confirm &amp; add to Calendar
                        </Button>
                      </div>
                    )}
                  </Panel>
                ) : (
                  <p className="text-sm text-muted">
                    {accessCta === 'Request Access'
                      ? 'Request access is not available in this browser slice yet.'
                      : accessCta === 'Buy Program' || accessCta === 'Subscribe'
                        ? 'Checkout opens when billing is enabled.'
                        : 'This Program requires access before joining.'}
                  </p>
                )
              )}
            </div>

            {signedIn && p.latestVersionId && (
              <section ref={togetherSectionRef} aria-labelledby="program-together" className="space-y-4">
                <SectionHeader id="program-together" title="Do this together" />
                <ProgramGroups
                  title={null}
                  key={enrollment.data?.programVersionId ?? p.latestVersionId}
                  programId={id}
                  versionId={enrollment.data?.programVersionId ?? p.latestVersionId}
                  enrollmentId={p.myEnrollmentId}
                  isProgramOwner={isOwner}
                  timezone={tz}
                />
              </section>
            )}
          </div>
        </div>
      </div>
    </Page>
  )
}
