import { formatDurationMinutes } from '@/lib/durationMinutes'
import { formatTargetTime } from '@/lib/targetTime'
import { useEffect, useState, type ReactNode } from 'react'
import { ActivitySessionContent } from '@/components/activity/ActivitySessionContent'
import { GatheringDetails } from '@/components/activity/GatheringDetails'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import {
  type components,
  useGathering,
  useOccurrence,
  useActivityParticipation,
  useActivity,
  useActivityPublicMedia,
  useCategories,
} from '@project/sdk'
import {
  Clock,
  Image as ImageIcon,
  ListOrdered,
  Pencil,
  Repeat,
  Target,
} from 'lucide-react'
import { Page, Stage } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { useCategorySlugOf } from '@/components/shared/EntityHero'
import { ReportButton } from '@/components/shared/ReportButton'
import { type RiverItem } from '@/components/media/RelatedMedia'
import { ActivityRelatedMedia } from '@/components/activity/ActivityRelatedMedia'
import { ActivityHero, type ActivityMeta } from '@/components/activity/ActivityHero'
import { ActivityParticipation } from '@/components/activity/ActivityParticipation'
import { ActivitySection } from '@/components/activity/ActivitySection'
import { ActivityInstructions } from '@/components/activity/ActivityInstructions'
import { ActivityShare } from '@/components/activity/ActivityShare'
import { ActivityDetailsEditor } from '@/components/activity/ActivityDetailsEditor'
import { GroupStatus } from '@/components/social/GroupStatus'
import { formatFrequency } from '@/components/program-authoring/ScheduleControls'
import {
  extractProgramTargetFromPath,
} from '@/lib/breadcrumbs'
import { safeReturn } from '@/lib/dates'
import { activityHero } from '@/lib/hero'
import { useDocumentTitle } from '@/lib/title'
import {
  useResolveActivityTarget,
  useResolveProgramTarget,
} from '@/lib/useResolveSlug'
import { buildActivityUrl } from '@/lib/urls'
import { cn } from '@/lib/utils'

/** One Activity page for definitions, gathering invitations, and personal scheduled sessions. */
export function ActivityPage({ activityId, gathering, occurrence: providedOccurrence, refreshOccurrence: providedRefresh, gatheringAction, sessionPending, sessionError }: {
  activityId?: string
  gathering?: components['schemas']['Gathering']
  occurrence?: components['schemas']['ActivityOccurrence']
  refreshOccurrence?: () => void
  gatheringAction?: ReactNode
  sessionPending?: boolean
  sessionError?: unknown
} = {}) {
  const { id: rawSlugOrId = '' } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const currentUrl = `${location.pathname}${location.search}`

  const resolved = useResolveActivityTarget(activityId ? '' : rawSlugOrId)
  const targetId = activityId ?? resolved.activityId
  const participation = useActivityParticipation(!activityId ? targetId : '')
  const suggestedItemId = participation.data?.viewer?.inProgressItemId ?? participation.data?.viewer?.upcoming[0]?.id
  // Keep the chosen session visible after completion removes it from upcoming participation.
  const [selectedSession, setSelectedSession] = useState<{ activityId: string; itemId: string } | null>(null)
  const ownItemId = selectedSession?.activityId === targetId ? selectedSession.itemId : suggestedItemId
  useEffect(() => {
    if (!activityId && ownItemId && selectedSession?.activityId !== targetId) {
      setSelectedSession({ activityId: targetId, itemId: ownItemId })
    }
  }, [activityId, ownItemId, selectedSession?.activityId, targetId])
  const ownOccurrence = useOccurrence(!activityId ? ownItemId ?? '' : '')
  const occurrence = providedOccurrence ?? ownOccurrence.data
  const refreshOccurrence = providedRefresh ?? (() => void ownOccurrence.refetch())
  const activity = useActivity(occurrence?.item.locked ? '' : targetId)
  const occurrenceGathering = useGathering(gathering ? null : occurrence?.item.gatheringId)
  const activeGathering = gathering ?? occurrenceGathering.data
  const contextual = !!(gathering || occurrence || sessionPending || ownItemId)
  const categories = useCategories()
  const categorySlugOf = useCategorySlugOf()
  const publicMedia = useActivityPublicMedia(
    targetId,
    undefined,
    !!targetId && !occurrence?.item.locked,
  )
  const [editing, setEditing] = useState(params.get('edit') === '1')

  const rawReturnTo = params.get('returnTo')
  const explicitReturnTo = rawReturnTo
    ? safeReturn(rawReturnTo, '/browse?kind=activities')
    : null
  const parentTarget = extractProgramTargetFromPath(explicitReturnTo)
  const resolvedParent = useResolveProgramTarget(
    parentTarget?.slugOrId ?? '',
    parentTarget?.handle ?? null,
  )

  useDocumentTitle(
    activity.data?.title ?? gathering?.activity.title ?? occurrence?.item.title ??
      (resolved.isLoading || activity.isPending
        ? 'Activity'
        : resolved.notFound
          ? 'Activity not found'
          : 'Activity'),
  )

  useEffect(() => {
    if (!activityId && resolved.isAlias && resolved.canonicalUrl) {
      const qs = params.toString()
      navigate(`${resolved.canonicalUrl}${qs ? `?${qs}` : ''}`, { replace: true })
    }
  }, [activityId, resolved.isAlias, resolved.canonicalUrl, params, navigate])

  const a = occurrence?.item.locked ? undefined : activity.data
  const identity = a ?? gathering?.activity ?? occurrence?.item
  const category = a
    ? categories.data?.find((c) => c.id === a.categoryId) ?? null
    : null


  if (!activityId && resolved.notFound) {
    return (
      <Page className="page--wide">
        <Stage className="max-w-3xl mx-auto py-12">
          <h1 className="text-2xl font-bold font-display">Activity not found</h1>
          <p className="text-muted">
            The requested activity does not exist or may have been unpublished.
          </p>
          <Link
            to="/browse?kind=activities"
            className="text-accent underline mt-2 inline-block"
          >
            Return to Community
          </Link>
        </Stage>
      </Page>
    )
  }

  const rawRiverItems: RiverItem[] = [
    ...(a?.media ?? []).map((m) => ({
      id: m.id,
      thumbnailUrl: m.thumbnailUrl,
      type: m.type,
      alt: m.alt,
      title: a?.title,
    })),
    ...(publicMedia.data?.pages.flatMap((page) => page.data) ?? []).map((pm) => ({
      id: pm.id,
      publicationId: pm.publicationId,
      thumbnailUrl: pm.thumbnailUrl,
      type: pm.type,
      alt: pm.alt,
      title: a?.title,
      credit: pm.creator?.displayName || undefined,
      attribution: pm.attribution || pm.creator?.displayName || undefined,
      license: pm.license || undefined,
    })),
  ]

  const riverItems = Array.from(
    new Map(rawRiverItems.map((item) => [item.id, item])).values(),
  )

  const hero = identity ? activityHero(identity, categorySlugOf) : null
  const frequencyText = a ? formatFrequency(a.frequency) : null
  const durationText = a ? formatDurationMinutes(a.durationMinutes) : null
  const targetTimeText = a?.targetTime ? formatTargetTime(a.targetTime) : null
  const metrics = a
    ? a.metricLabels.filter((label) => !label.toLowerCase().startsWith('duration'))
    : []
  const meta: ActivityMeta[] = [
    ...(durationText
      ? [{ key: 'duration', icon: Clock, label: `Duration: ${durationText}` }]
      : []),
    ...(targetTimeText
      ? [{ key: 'target-time', icon: Clock, label: `Target time: ${targetTimeText}` }]
      : []),
    ...(frequencyText
      ? [{ key: 'frequency', icon: Repeat, label: `Frequency: ${frequencyText}` }]
      : []),
  ]

  return (
    <Page className="page--wide pb-20">

      <div className="mx-auto mt-6 w-full max-w-content">
        <ErrorMessage
          error={identity ? null : activity.error}
          retry={() => void activity.refetch()}
        />

        {!identity && (resolved.isLoading || activity.isPending) ? (
          <Loading />
        ) : (
          identity &&
          hero && (
            <div className="activity-page">
              <ActivityHero
                hero={hero}
                context={
                  [category?.label, a?.isPlatform ? 'Platform Activity' : null]
                    .filter(Boolean)
                    .join(' · ') || 'Activity'
                }
                status={
                  a?.canEdit && (
                    <>
                      {a.status === 'DRAFT' && (
                        <span className="activity-status-pill" data-status="paused">
                          Draft
                        </span>
                      )}
                      <span className="activity-status-pill">
                        {a.visibility === 'PUBLIC'
                          ? 'Public'
                          : a.visibility === 'UNLISTED'
                            ? 'Link only'
                            : 'Private'}
                      </span>
                    </>
                  )
                }
                title={identity.title}
                summary={a?.summary ?? gathering?.activity.summary}
                creator={a?.creator}
                returnTo={currentUrl}
                meta={meta}
                footnote={
                  a?.sourceActivity && (
                    <p className="text-xs text-muted">
                      Based on{' '}
                      <Link
                        to={buildActivityUrl(a.sourceActivity, { returnTo: currentUrl })}
                        className="font-medium text-accent hover:underline"
                      >
                        {a.sourceActivity.title}
                      </Link>
                    </p>
                  )
                }
                actions={
                  <div className="activity-session__actions">
                    {/* Your status, people and actions: the shared participation component (03-UX §2b). */}
                    {!occurrence?.item.locked && (contextual || a?.status === 'PUBLISHED' || a?.canEdit) ? (
                      <ActivityParticipation key={targetId} activity={{ id: targetId, title: identity.title, place: activeGathering?.place ?? a?.place }} returnTo={currentUrl} contextual={contextual} contextActions={gatheringAction} />
                    ) : null}
                    <div className="activity-session__tools ml-auto">
                      {a?.canEdit ? (
                        <Button
                          variant={editing ? 'default' : 'outline'}
                          aria-pressed={editing}
                          onClick={() => setEditing((open) => !open)}
                        >
                          <Pencil size={16} aria-hidden />
                          Edit Activity
                        </Button>
                      ) : (
                        <ReportButton target={{ type: 'ACTIVITY', id: targetId }} />
                      )}
                    </div>
                  </div>
                }
              />

              {editing && a?.canEdit && (
                <ActivityDetailsEditor activity={a} onDone={() => setEditing(false)} />
              )}

              {a && <GroupStatus
                activityId={targetId}
                activityTitle={identity.title}
                programId={parentTarget ? resolvedParent.programId : undefined}
                returnTo={currentUrl}
              />}

              {activeGathering && <GatheringDetails gathering={activeGathering} />}
              {(sessionPending || (!!ownItemId && ownOccurrence.isPending)) && <Loading />}
              <ErrorMessage error={sessionError ?? ownOccurrence.error} retry={refreshOccurrence} />
              {occurrence && <ActivitySessionContent key={occurrence.item.id} occurrence={occurrence} refresh={refreshOccurrence ?? (() => {})} />}

              <div
                className={cn(
                  'activity-layout',
                  (metrics.length > 0 || (a?.tools.length ?? 0) > 0) && 'activity-layout--definition',
                )}
              >
                <ActivitySection icon={ListOrdered} title="Instructions">
                  {!occurrence && !a && activity.isPending ? <Loading /> : !occurrence && !a && activity.error ? (
                    <ErrorMessage error={activity.error} retry={() => void activity.refetch()} />
                  ) : <ActivityInstructions
                    instructions={occurrence?.instructions ?? a?.instructions ?? []}
                    locked={occurrence?.item.locked}
                    empty="No step-by-step instructions provided for this Activity."
                  />}
                </ActivitySection>

                {a && (metrics.length > 0 || a.tools.length > 0) && (
                  <ActivitySection icon={Target} title="Tracks and uses">
                    {metrics.length > 0 && <p className="text-sm">Tracks: {metrics.join(', ')}</p>}
                    {a.tools.length > 0 && <p className="text-sm">Uses: {a.tools.map((tool) => tool.label).join(', ')}</p>}
                  </ActivitySection>
                )}

                {!occurrence && a && <ActivitySection
                  as="div"
                  id="related-media"
                  icon={ImageIcon}
                  title="Related Media"
                  description="Photos and video guides for this Activity."
                  className="activity-gallery activity-related scroll-mt-20 activity-card"
                >
                  <ActivityRelatedMedia
                    activityId={targetId}
                    revisionId={a?.canEdit ? a.revisionId : null}
                    items={riverItems}
                  />
                </ActivitySection>}

                <ActivityShare activity={a} locked={occurrence?.item.locked} />
              </div>
            </div>
          )
        )}
      </div>
    </Page>
  )
}
