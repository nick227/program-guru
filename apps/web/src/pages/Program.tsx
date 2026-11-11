import { formatDurationMinutes } from '@/lib/durationMinutes'
import { formatTargetTime } from '@/lib/targetTime'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ApiError,
  useAcceptEnrollmentUpdate,
  useCurrentUser,
  useDismissEnrollmentUpdate,
  useEnrollment,
  useJoinProgram,
  usePersonalEnrollmentAction,
  useProgramLibrary,
  useProgramPreview,
  useProgramVersion,
  useProgramWorkspace,
  usePublishCheck,
  usePublishProgram,
  useUpdateProgramVisibility,
} from '@project/sdk'
import { toast } from 'sonner'
import { Page, Stage } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { SubHeader } from '@/components/shared/SubHeader'
import { buildProgramBreadcrumbs } from '@/lib/breadcrumbs'
import { ProgramHero } from '@/components/program/ProgramHero'
import { ProgramActivityCard } from '@/components/program/ProgramActivityCard'
import { ProgramGroups } from '@/components/program/ProgramGroups'
import { ShareLinkCard } from '@/components/social/ShareLink'
import {
  formatProgramDuration,
  programPublishInput,
  programVisibilityLabel,
  type ProgramVisibility,
} from '@/components/program-authoring/programFields'
import {
  ProgramPersonalDetailsGrid,
  ProgramPersonalOverview,
} from '@/components/program/ProgramPersonalOverview'
import {
  ProgramOwnerBanner,
  ProgramOwnerEditPanel,
} from '@/components/program/ProgramOwnerEditor'
import { buildBrowseUrl } from '@/lib/browse'
import { WorkspaceActivityRow } from '@/components/program-authoring/WorkspaceActivityRow'
import { CreateActivitySection } from '@/components/program-authoring/CreateActivitySection'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { enrollmentStatusText } from '@/components/ui/StatusText'
import {
  calendarUrl,
  dateLabel,
  isLocalDate,
  safeReturn,
  today,
} from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { useResolveProgramTarget } from '@/lib/useResolveSlug'
import {
  buildActivityUrl,
  buildOccurrenceUrl,
  buildProgramUrl,
  buildWorkspaceUrl,
  toAbsoluteUrl,
} from '@/lib/urls'
import { activityHero, programHero } from '@/lib/hero'
import { useCategorySlugOf } from '@/components/shared/EntityHero'
import { ReportButton } from '@/components/shared/ReportButton'

export function ProgramPage() {
  const paramsFromRouter = useParams()
  const rawHandle = paramsFromRouter.handle ? paramsFromRouter.handle.replace(/^@+/, '') : null
  const rawSlugOrId = paramsFromRouter.slug || paramsFromRouter.id || ''

  const resolved = useResolveProgramTarget(rawSlugOrId, rawHandle)
  const id = resolved.programId

  const [params] = useSearchParams()
  const location = useLocation()
  const currentUrl = `${location.pathname}${location.search}`
  const queryString = params.toString()
  const groupIdParam = params.get('groupId')?.trim() || undefined
  const program = useProgramPreview(id)
  const categorySlugOf = useCategorySlugOf()
  const me = useCurrentUser()
  const online = useOnline()
  const navigate = useNavigate()

  const startRef = useRef<HTMLDivElement>(null)
  const ownerEditRef = useRef<HTMLDivElement>(null)
  const lastAutoScrollKey = useRef('')

  const signedIn = !!me.data
  const p = program.data
  const isOwner = p?.viewerAccess === 'OWNER'
  const library = useProgramLibrary(signedIn)
  const workspace = useProgramWorkspace(id, signedIn && isOwner)
  const programVersion = useProgramVersion(
    p?.latestVersionId ?? '',
    signedIn && !isOwner && p?.viewerAccess === 'GRANTED' && !!p?.latestVersionId,
  )

  const entry = signedIn ? (library.data?.find((r) => r.program.id === id) ?? null) : null
  const ws = isOwner ? (workspace.data ?? null) : null

  const [runId, setRunId] = useState('')
  const [editingProgram, setEditingProgram] = useState(false)
  const [editingActivities, setEditingActivities] = useState(false)

  useEffect(() => {
    setRunId('')
    setEditingProgram(false)
    setEditingActivities(false)
  }, [id])

  useDocumentTitle(
    ws?.title ??
      p?.title ??
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

  // One click starts today (13 §4); a group invitation link may carry its group's start date.
  const requestedStartDate = params.get('startDate')

  const autoScrollKey = params.get('start') === '1' && id ? `${id}:start=1` : ''
  useEffect(() => {
    if (!autoScrollKey) {
      lastAutoScrollKey.current = ''
      return
    }
    // Programs can be run again (07 Runs), so ?start=1 leads to the start action whether or not a run exists.
    if (autoScrollKey !== lastAutoScrollKey.current && p) {
      lastAutoScrollKey.current = autoScrollKey
      startRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [autoScrollKey, p])

  const start =
    requestedStartDate && isLocalDate(requestedStartDate) ? requestedStartDate : today(tz)
  // "Program Added" holds for the rest of this visit; the key makes retries of this visit's start safe.
  const [added, setAdded] = useState(false)
  const join = useJoinProgram(id)
  const enrollmentId = p?.myEnrollmentId || entry?.current?.id || ''
  const enrollment = useEnrollment(enrollmentId)
  const enrollmentAction = usePersonalEnrollmentAction()
  const acceptUpdate = useAcceptEnrollmentUpdate(enrollmentId)
  const dismissUpdate = useDismissEnrollmentUpdate(enrollmentId)
  const updateVisibility = useUpdateProgramVisibility(id)
  const publishCheck = usePublishCheck(id, signedIn && isOwner && !!p && !p.latestVersionId)
  const publish = usePublishProgram(id)
  const key = useRef(crypto.randomUUID())
  // A different Program in the same page instance is a new visit: fresh button state and request key.
  useEffect(() => {
    setAdded(false)
    key.current = crypto.randomUUID()
  }, [id])

  const rawReturnTo = params.get('returnTo')
  const explicitReturnTo = rawReturnTo ? safeReturn(rawReturnTo, '/browse') : null

  if (resolved.notFound || (program.error instanceof ApiError && program.error.status === 404 && !p)) {
    const notFoundNav = buildProgramBreadcrumbs({
      title: 'Program not found',
      returnTo: explicitReturnTo,
    })
    return (
      <Page className="page--wide">
        <SubHeader
          breadcrumbs={notFoundNav.items}
          active={notFoundNav.activeNav}
          returnTo={currentUrl}
        />
        <Stage className="max-w-3xl mx-auto py-12">
          <h1 className="text-2xl font-bold font-display">Program not found</h1>
          <p className="text-muted mt-2">
            The requested program does not exist or may have been unpublished.
          </p>
          <Link to="/browse" className="text-accent underline mt-4 inline-block">
            Return to Community
          </Link>
        </Stage>
      </Page>
    )
  }

  if (!p) {
    const loadingNav = buildProgramBreadcrumbs({
      title: 'Program',
      returnTo: explicitReturnTo,
    })
    return (
      <Page className="page--wide">
        <SubHeader
          breadcrumbs={loadingNav.items}
          active={loadingNav.activeNav}
          returnTo={currentUrl}
        />
        <Stage className="max-w-3xl mx-auto py-12">
          <ErrorMessage
            error={program.error}
            retry={() => void program.refetch()}
          />
          {(resolved.isLoading || program.isPending) && <Loading />}
        </Stage>
      </Page>
    )
  }

  const selectedRun = entry
    ? (entry.runs.find((run) => run.id === runId) ?? entry.current)
    : null
  const isEnrolled = !!p.myEnrollmentId
  const isDraftOnly = isOwner && !p.latestVersionId
  const canonicalUrl = buildProgramUrl(p, { scoped: !!rawHandle })
  const backTo = safeReturn(rawReturnTo, '/browse')
  const groupId = enrollment.data?.groupId ?? null
  const enrolledStatus = enrollmentStatusText(enrollment.data?.status)

  const publicUrl = toAbsoluteUrl(p.canonicalUrl ?? canonicalUrl)
  const participantCount = entry?.participation?.participantCount ?? p.enrollmentCount

  const displayTitle = ws?.title ?? p.title
  const programNav = buildProgramBreadcrumbs({
    title: displayTitle,
    type: p.type,
    focus: p.focus,
    returnTo: explicitReturnTo,
  })
  const displayDescription = ws ? ws.description : p.description
  const displayDurationDays = ws ? ws.durationDays : p.durationDays
  const displayFrequencyLabel = ws ? ws.frequencyLabel : p.frequencyLabel
  const displayActivityCount =
    ws && ws.activities.length > 0
      ? ws.activities.length
      : p.safeActivityOutline.length
  const displayHero = programHero(
    ws && (ws.coverUrl || ws.coverMedia) ? ws : p,
    categorySlugOf,
  )

  const priceSummary =
    p.accessMode === 'PAID' && p.prices.length > 0
      ? p.prices
          .slice(0, 1)
          .map((price) => {
            const formatted = new Intl.NumberFormat(undefined, {
              style: 'currency',
              currency: price.currency || 'USD',
            }).format(price.amountMinor / 100)
            return price.kind === 'MONTHLY' ? `${formatted}/mo` : formatted
          })[0]
      : p.accessMode === 'APPROVAL' && !p.canJoin
        ? 'Approval required'
        : null

  const heroMetadata = [
    p.focus?.label,
    formatProgramDuration(displayDurationDays),
    displayFrequencyLabel,
    displayActivityCount > 0
      ? `${displayActivityCount} ${displayActivityCount === 1 ? 'activity' : 'activities'}`
      : null,
    priceSummary,
  ]

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
  const hasRun = isEnrolled || (entry?.runs.length ?? 0) > 0
  const canStart = signedIn && !isDraftOnly && p.canJoin && !!p.latestVersionId
  const primaryLabel = !signedIn
    ? 'Sign in to join'
    : isDraftOnly
      ? 'Publish Program'
      : canStart
        ? added
          ? 'Program Added'
          : hasRun
            ? 'Run It Again'
            : 'Start Program'
        : accessCta
  // Previous runs as compact start-date chips, newest first (13 §4).
  const runStarts = [...(entry?.runs ?? [])]
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .slice(0, 6)

  const handleResume = async () => {
    if (!entry?.current) return
    try {
      await enrollmentAction.mutateAsync({ id: entry.current.id, action: 'ACTIVE' })
      toast.success('Schedule resumed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not resume schedule')
    }
  }

  const openOwnerEditor = () => {
    setEditingProgram(true)
    window.setTimeout(() => {
      ownerEditRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 0)
  }

  const handlePrimary = () => {
    if (!signedIn) {
      navigate(`/login?returnTo=${encodeURIComponent(canonicalUrl)}`)
      return
    }
    if (isDraftOnly) {
      if (ws && publishCheck.data?.canPublish && online && !publish.isPending) {
        void publish
          .mutateAsync(programPublishInput(ws, ws.visibility))
          .then(() => toast.success('Program published'))
          .catch(() => {
            openOwnerEditor()
          })
        return
      }
      openOwnerEditor()
      return
    }
    if (canStart && !added) void handleStartProgram()
  }

  const handleVisibilityChange = async (next: ProgramVisibility) => {
    if (!ws || !online || updateVisibility.isPending) return
    try {
      await updateVisibility.mutateAsync({ visibility: next, expectedRevision: ws.draftRevision })
      const label = programVisibilityLabel(next)
      toast.success(
        ws.status === 'DRAFT'
          ? `Visibility set to ${label} (publish to go live)`
          : `Program is now ${label}`,
      )
    } catch {
      // surfaced in ErrorMessage
    }
  }

  const handleStartProgram = async () => {
    if (join.isPending || added) return
    try {
      await join.mutateAsync({
        ...body,
        ...(groupIdParam ? { groupId: groupIdParam } : {}),
        idempotencyKey: key.current,
      })
      setAdded(true)
      toast.success('Program added to your Calendar')
    } catch {
      // Keep the key so a retry of this visit's start cannot add a second run.
    }
  }

  const pendingUpdate = Boolean(
    enrollment.data?.pendingVersionId || selectedRun?.pendingVersionId,
  )
  const canAcceptUpdate =
    Boolean(enrollmentId) &&
    (enrollment.data?.status ?? selectedRun?.status) === 'ACTIVE'

  const outlineByTitle = new Map(
    p.safeActivityOutline.map((item) => [item.title, item]),
  )
  // A participant opens their own dated occurrence, not the reusable Activity (03-UX §3).
  const occurrenceByActivity = new Map(
    (selectedRun?.nextByActivity ?? []).map((n) => [n.activityId, n.calendarItemId]),
  )
  const activityHref = (activityId: string) => {
    const occurrenceId = occurrenceByActivity.get(activityId)
    return occurrenceId
      ? buildOccurrenceUrl(occurrenceId, { returnTo: currentUrl })
      : buildActivityUrl({ id: activityId }, { returnTo: currentUrl })
  }

  const activityItems =
    isOwner && ws && (isDraftOnly || ws.activities.length > 0)
      ? ws.activities.map((a) => {
          const outlineMatch = outlineByTitle.get(a.title)
          return {
            key: a.activityId,
            title: a.title,
            description: undefined as string | null | undefined,
            href: activityHref(a.activityId),
            hero: activityHero(
              {
                title: a.title,
                thumbnailUrl: outlineMatch?.mediaPreviewUrl,
                categoryId: p.type?.categoryId,
              },
              categorySlugOf,
            ),
            meta:
              [
                outlineMatch?.dayIndex != null
                  ? `Day ${outlineMatch.dayIndex + 1}`
                  : null,
                formatDurationMinutes(a.durationMinutes),
                formatTargetTime(a.targetTime),
                a.frequencyLabel,
              ]
                .filter(Boolean)
                .join(' · ') || undefined,
          }
        })
      : p.viewerAccess === 'GRANTED' &&
          programVersion.data &&
          programVersion.data.activities.length > 0
        ? programVersion.data.activities.map((a) => {
            const outlineMatch = outlineByTitle.get(a.title)
            return {
              key: a.id,
              title: a.title,
              description: a.summary,
              href: activityHref(a.id),
              hero: activityHero(
                {
                  title: a.title,
                  thumbnailUrl:
                    a.thumbnailUrl ?? outlineMatch?.mediaPreviewUrl,
                  categoryId: a.categoryId || p.type?.categoryId,
                },
                categorySlugOf,
              ),
              meta:
                [
                  outlineMatch?.dayIndex != null
                    ? `Day ${outlineMatch.dayIndex + 1}`
                    : null,
                  formatDurationMinutes(a.durationMinutes),
                  formatTargetTime(a.targetTime),
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined,
            }
          })
        : p.safeActivityOutline.map((item, idx) => ({
            key: `outline-${idx}`,
            title: item.title,
            description: undefined as string | null | undefined,
            href: undefined as string | undefined,
            hero: activityHero(
              {
                title: item.title,
                thumbnailUrl: item.mediaPreviewUrl,
                categoryId: p.type?.categoryId,
              },
              categorySlugOf,
            ),
            meta:
              [
                item.dayIndex != null ? `Day ${item.dayIndex + 1}` : null,
                formatDurationMinutes(item.durationMinutes),
                formatTargetTime(item.targetTime),
              ]
                .filter(Boolean)
                .join(' · ') || undefined,
          }))

  return (
    <Page className="page--wide pb-20">
      <SubHeader
        breadcrumbs={programNav.items}
        active={programNav.activeNav}
        returnTo={currentUrl}
      />
      <div className="mx-auto mt-6 max-w-[72rem] space-y-10 sm:mt-8">
        {/* 01 — Program Hero */}
        <div ref={startRef} className="scroll-mt-20">
          <ProgramHero
            title={displayTitle}
            description={displayDescription}
            hero={displayHero}
            categoryLabel={p.type.label}
            creator={p.creator}
            creatorReturnTo={currentUrl}
            isPlatform={p.isPlatform}
            isOwner={isOwner}
            participantCount={participantCount}
            metadata={heroMetadata}
            primaryLabel={primaryLabel}
            onPrimary={handlePrimary}
            primaryDisabled={signedIn && !isDraftOnly && (!canStart || added || join.isPending)}
            primaryLoading={join.isPending}
            primaryDone={added}
            primaryNote={
              runStarts.length > 0 && (
                <nav aria-label="Previous runs" className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                  <span className="mr-0.5 font-medium text-muted">Runs</span>
                  {runStarts.map((run) => (
                    <Link
                      key={run.id}
                      to={calendarUrl(run.startDate)}
                      className="rounded-full border border-border bg-surface px-2.5 py-0.5 font-medium tabular-nums text-foreground transition-colors hover:border-accent hover:text-accent"
                      title={`Run started ${dateLabel(run.startDate, { month: 'long', day: 'numeric', year: 'numeric' })}`}
                    >
                      {dateLabel(run.startDate)}
                    </Link>
                  ))}
                </nav>
              )
            }
            shareUrl={publicUrl}
            onEditProgram={
              isOwner
                ? () => {
                    if (ws) setEditingProgram((prev) => !prev)
                    else navigate(buildWorkspaceUrl(id))
                  }
                : undefined
            }
            editLabel={editingProgram ? 'Close Editor' : 'Edit Program'}
            editExpanded={ws ? editingProgram : undefined}
            ownerVisibility={
              isOwner && ws
                ? {
                    value: ws.visibility,
                    status: ws.status,
                    pending: updateVisibility.isPending,
                    disabled: !online,
                    onChange: (next) => void handleVisibilityChange(next),
                  }
                : undefined
            }
          />
        </div>

        <ErrorMessage
          error={
            program.error ||
            join.error ||
            acceptUpdate.error ||
            dismissUpdate.error ||
            enrollmentAction.error ||
            updateVisibility.error ||
            publish.error
          }
        />

        {/* Owner Draft / Unpublished Changes Banner & Inline Project Edit Panel */}
        {isOwner && ws && (
          <div ref={ownerEditRef} className="space-y-6">
            <ProgramOwnerBanner
              ws={ws}
              editing={editingProgram}
              onEdit={() => setEditingProgram(true)}
            />
            {editingProgram && (
              <ProgramOwnerEditPanel
                ws={ws}
                online={online}
                onClose={() => setEditingProgram(false)}
                onDeleted={() => navigate(backTo.startsWith('/library') ? backTo : '/library')}
              />
            )}
          </div>
        )}

        {/* 02 — Two-column main content: Overview, Activities & Next Activity | Community & Share */}
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-10">
          <div className="min-w-0 space-y-10">
            <ProgramPersonalOverview
              entry={entry}
              selectedRun={selectedRun}
              onSelectRunId={setRunId}
              isEnrolled={isEnrolled}
              enrolledStatus={enrolledStatus}
              participationStartDate={enrollment.data?.participationStartDate}
              groupId={groupId}
              pendingUpdate={pendingUpdate}
              canAcceptUpdate={canAcceptUpdate}
              online={online}
              acceptingUpdate={acceptUpdate.isPending}
              dismissingUpdate={dismissUpdate.isPending}
              onAcceptUpdate={async () => {
                try {
                  await acceptUpdate.mutateAsync()
                  toast.success('Program updated to latest version')
                } catch {
                  // shown in ErrorMessage
                }
              }}
              onDismissUpdate={async () => {
                try {
                  await dismissUpdate.mutateAsync()
                  toast.success('Update dismissed')
                } catch {
                  // shown in ErrorMessage
                }
              }}
              onResume={handleResume}
              resuming={enrollmentAction.isPending}
              currentUrl={currentUrl}
              onRemoved={() => {
                if (backTo.startsWith('/library')) navigate(backTo)
                else if (!isOwner && (p.visibility === 'PRIVATE' || p.accessMode !== 'OPEN')) {
                  navigate('/library')
                }
              }}
              onDeleted={() => navigate(backTo.startsWith('/library') ? backTo : '/library')}
            />

            <section aria-label="Program activities" className="space-y-4">
              <SectionHeader
                title="Activities"
                action={
                  isOwner && ws ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant={editingActivities ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setEditingActivities((prev) => !prev)}
                      >
                        {editingActivities ? 'Done editing' : 'Edit Activities'}
                      </Button>
                      <Link
                        to={buildWorkspaceUrl(ws.id, { step: 'activities' })}
                        className="btn btn--outline btn--sm"
                      >
                        Schedule Editor
                      </Link>
                    </div>
                  ) : undefined
                }
              />
              {editingActivities && isOwner && ws ? (
                <div className="space-y-4 rounded-2xl border border-accent/30 bg-surface p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted">
                      Edit activity details, frequency, or add new activities directly to this program.
                    </p>
                    <Link
                      to={buildBrowseUrl({
                        kind: 'activities',
                        programId: ws.id,
                        category: ws.type.categoryId || undefined,
                        returnTo: currentUrl,
                      })}
                      className="btn btn--outline btn--sm"
                    >
                      Browse Library
                    </Link>
                  </div>
                  {ws.activities.length > 0 ? (
                    <div className="space-y-3">
                      {ws.activities.map((a) => (
                        <WorkspaceActivityRow
                          key={a.activityId}
                          activity={a}
                          ws={ws}
                          returnTo={currentUrl}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border bg-surface-muted/50 p-6 text-center text-sm text-muted">
                      No activities yet. Create one below or browse the library to add existing ones.
                    </div>
                  )}
                  <CreateActivitySection ws={ws} />
                </div>
              ) : activityItems.length > 0 ? (
                <div className="divide-y divide-border/60 border-y border-border/60">
                  {activityItems.map((item) => (
                    <ProgramActivityCard
                      key={item.key}
                      variant="row"
                      title={item.title}
                      description={item.description}
                      href={item.href}
                      hero={item.hero}
                      meta={item.meta}
                    />
                  ))}
                </div>
              ) : isOwner && ws && isDraftOnly ? (
                <div className="rounded-xl border border-dashed border-border bg-surface-muted/50 p-8 text-center text-sm text-muted space-y-3">
                  <p>No activities added yet.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingActivities(true)}
                  >
                    Add Activities
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-surface-muted/50 p-8 text-center text-sm text-muted">
                  Activity outline available after starting the program.
                </div>
              )}
            </section>

            {entry && (
              <ProgramPersonalDetailsGrid
                entry={entry}
                selectedRun={selectedRun}
                currentUrl={currentUrl}
                onSetupSchedule={() =>
                  startRef.current?.scrollIntoView({ behavior: 'smooth' })
                }
              />
            )}
          </div>

          <aside aria-label="Program community and sharing" className="space-y-6 lg:sticky lg:top-6">
            <ProgramGroups
              programId={id}
              versionId={p.latestVersionId}
              enrollmentId={enrollmentId || null}
              isProgramOwner={isOwner}
              isPublicProgram={p.visibility === 'PUBLIC' && !isDraftOnly}
              timezone={tz}
              signedIn={signedIn}
              participantCount={participantCount}
              completionRate={p.completionRate}
              returnTo={currentUrl}
            />

            <ShareLinkCard
              title="Share Program"
              ariaLabel="Share Program"
              url={publicUrl}
              shareTitle="Join me on this Program"
              copiedMessage="Program link copied"
              inputLabel="Program link"
            />

            <div className="flex justify-end">
              <ReportButton target={{ type: 'PROGRAM', id: p.id }} ownerId={p.creator?.id} />
            </div>
          </aside>
        </div>
      </div>
    </Page>
  )
}
