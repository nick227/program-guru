import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ApiError,
  useAcceptEnrollmentUpdate,
  useCurrentUser,
  useDismissEnrollmentUpdate,
  useEnrollment,
  useJoinProgram,
  useProgramPreview,
} from '@project/sdk'
import { toast } from 'sonner'
import { Page, Stage } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back } from '@/components/Navigation'
import { ProgramHero } from '@/components/ProgramHero'
import { ProgramActivityCard } from '@/components/ProgramActivityCard'
import { ProgramSchedulePreview } from '@/components/ProgramSchedulePreview'
import { ProgramTogether } from '@/components/ProgramTogether'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { StatusText, enrollmentStatusText } from '@/components/ui/StatusText'
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
import { ReportButton } from '@/components/ReportButton'

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

  const requestedStartDate = params.get('startDate')
  const [date, setDate] = useState(
    requestedStartDate && isLocalDate(requestedStartDate)
      ? requestedStartDate
      : '',
  )

  useEffect(() => {
    if (requestedStartDate && isLocalDate(requestedStartDate)) {
      setDate(requestedStartDate)
    }
  }, [requestedStartDate])

  const start = date || today(tz)
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

  const publicUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${canonicalUrl}`
      : canonicalUrl

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
    ? 'View Schedule'
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
    scheduleSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleStartProgram = async () => {
    try {
      await join.mutateAsync({
        ...body,
        ...(groupIdParam ? { groupId: groupIdParam } : {}),
        idempotencyKey: key.current,
      })
      toast.success('Program started')
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
  }

  return (
    <Page className="page--content pb-20">
      <div className="w-full space-y-10 sm:space-y-12">
        {/* 01 — Program Hero */}
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
          backLabel="Browse Programs"
          onPrimary={handlePrimary}
          onEditProgram={isOwner ? () => navigate(buildWorkspaceUrl(id)) : undefined}
        />

        <ErrorMessage
          error={
            program.error ||
            join.error ||
            acceptUpdate.error ||
            dismissUpdate.error
          }
        />

        {/* Enrolled Status & Update Alerts (if applicable) */}
        {isEnrolled && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-accent/30 bg-accent/5 p-4 sm:p-5">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <StatusText status={enrolledStatus.status}>{enrolledStatus.label}</StatusText>
                {enrollment.data?.participationStartDate && (
                  <span className="text-xs text-muted">
                    Joined {dateLabel(enrollment.data.participationStartDate)}
                  </span>
                )}
              </div>
              <p className="text-sm text-foreground">
                Your program is active. Sessions appear on your schedule.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link className="btn btn--outline btn--sm" to={`/library?program=${p.id}`}>
                Manage Program
              </Link>
              {groupId && (
                <Link className="btn btn--outline btn--sm" to={buildGroupUrl(groupId)}>
                  Open Group
                </Link>
              )}
            </div>

            {enrollment.data?.pendingVersionId && (
              <div className="w-full mt-2 space-y-2 rounded-lg border border-border bg-surface p-3.5">
                <h3 className="text-sm font-semibold text-foreground">Update available</h3>
                <p className="text-xs text-muted">
                  The creator published an update. Accept to adopt the new version while preserving your past logs.
                </p>
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
          </div>
        )}

        {/* 02 — Activities (Visual media-led cards in responsive grid) */}
        <section aria-label="Program activities" className="space-y-5">
          <SectionHeader
            title="Activities"
            description={
              p.safeActivityOutline.length > 0
                ? `${p.safeActivityOutline.length} ${p.safeActivityOutline.length === 1 ? 'activity' : 'activities'} included in this Program`
                : undefined
            }
          />
          {p.safeActivityOutline.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
                  meta={item.dayIndex != null ? `Day ${item.dayIndex + 1}` : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-surface-muted/50 p-8 text-center text-sm text-muted">
              Activity outline available after starting the program.
            </div>
          )}
        </section>

        {/* 03 & 04 — Schedule & Share Program (Balanced 2-Column Section) */}
        <div ref={scheduleSectionRef} className="grid grid-cols-1 gap-6 items-start">
          {/* 03 — Schedule */}
          <ProgramSchedulePreview
            durationDays={p.durationDays}
            frequencyLabel={p.frequencyLabel}
            programDays={p.programDays}
            placements={p.placements}
            activities={p.safeActivityOutline}
            startDate={start}
            onStartDateChange={(newDate) => {
              setDate(newDate)
              key.current = crypto.randomUUID()
            }}
            onStartProgram={handleStartProgram}
            isStarting={join.isPending}
            isEnrolled={isEnrolled}
            signedIn={signedIn}
            loginUrl={`/login?returnTo=${encodeURIComponent(canonicalUrl)}`}
            timezone={tz}
            onViewSchedule={() => navigate('/')}
          />

          {/* 04 — Share Program */}
          <ProgramTogether
            programId={id}
            groupId={groupId}
            participantCount={p.enrollmentCount}
            completionRate={p.completionRate}
            publicUrl={publicUrl}
          />
        </div>
        <div className="flex justify-end">
          <ReportButton target={{ type: 'PROGRAM', id: p.id }} ownerId={p.creator?.id} />
        </div>
      </div>
    </Page>
  )
}
