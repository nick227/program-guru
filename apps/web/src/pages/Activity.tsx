import { formatDurationMinutes } from '@/lib/durationMinutes'
import { formatTargetTime } from '@/lib/targetTime'
import { useEffect, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import {
  useActivity,
  useActivityPublicMedia,
  useCategories,
  useProgramPreview,
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
import { SubHeader } from '@/components/shared/SubHeader'
import { ReportButton } from '@/components/shared/ReportButton'
import { type RiverItem } from '@/components/media/RelatedMedia'
import { ActivityRelatedMedia } from '@/components/activity/ActivityRelatedMedia'
import { ActivityHero, type ActivityMeta } from '@/components/activity/ActivityHero'
import { ActivitySection } from '@/components/activity/ActivitySection'
import { ActivityInstructions } from '@/components/activity/ActivityInstructions'
import { ActivityShare } from '@/components/activity/ActivityShare'
import { ActivityDetailsEditor } from '@/components/activity/ActivityDetailsEditor'
import { GroupStatus } from '@/components/social/GroupStatus'
import { formatFrequency } from '@/components/program-authoring/ScheduleControls'
import {
  buildActivityBreadcrumbs,
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

/** Reusable Activity definition page (`/activities/:id`). */
export function ActivityPage() {
  const { id: rawSlugOrId = '' } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const currentUrl = `${location.pathname}${location.search}`

  const resolved = useResolveActivityTarget(rawSlugOrId)
  const activity = useActivity(resolved.activityId)
  const categories = useCategories()
  const categorySlugOf = useCategorySlugOf()
  const publicMedia = useActivityPublicMedia(
    resolved.activityId,
    undefined,
    !resolved.notFound && !!resolved.activityId,
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
  const parentProgram = useProgramPreview(
    parentTarget ? resolvedParent.programId : '',
  )

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
      const qs = params.toString()
      navigate(`${resolved.canonicalUrl}${qs ? `?${qs}` : ''}`, { replace: true })
    }
  }, [resolved.isAlias, resolved.canonicalUrl, params, navigate])

  const a = activity.data
  const category = a
    ? categories.data?.find((c) => c.id === a.categoryId) ?? null
    : null

  const activityNav = buildActivityBreadcrumbs({
    title: a?.title ?? (resolved.notFound ? 'Activity not found' : 'Activity'),
    category: category ? { id: category.id, label: category.label } : null,
    parentProgram:
      parentTarget && explicitReturnTo
        ? {
            title: parentProgram.data?.title ?? 'Program',
            href: explicitReturnTo,
            nestedReturnTo: parentTarget.nestedReturnTo,
          }
        : null,
    returnTo: explicitReturnTo,
  })

  if (resolved.notFound) {
    return (
      <Page className="page--wide">
        <SubHeader
          breadcrumbs={activityNav.items}
          active={activityNav.activeNav}
          returnTo={currentUrl}
        />
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

  const hero = a ? activityHero(a, categorySlugOf) : null
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
      <SubHeader
        breadcrumbs={activityNav.items}
        active={activityNav.activeNav}
        returnTo={currentUrl}
      />

      <div className="mx-auto mt-6 w-full page--width">
        <ErrorMessage
          error={activity.error}
          retry={() => void activity.refetch()}
        />

        {resolved.isLoading || activity.isPending ? (
          <Loading />
        ) : (
          a &&
          hero && (
            <div className="activity-page">
              <ActivityHero
                hero={hero}
                context={
                  [category?.label, a.isPlatform ? 'Platform Activity' : null]
                    .filter(Boolean)
                    .join(' · ') || 'Activity'
                }
                status={
                  a.canEdit && (
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
                title={a.title}
                summary={a.summary}
                creator={a.creator}
                returnTo={currentUrl}
                meta={meta}
                footnote={
                  a.sourceActivity && (
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
                    <div className="activity-session__tools ml-auto">
                      {a.canEdit ? (
                        <Button
                          variant={editing ? 'default' : 'outline'}
                          aria-pressed={editing}
                          onClick={() => setEditing((open) => !open)}
                        >
                          <Pencil size={16} aria-hidden />
                          Edit Activity
                        </Button>
                      ) : (
                        <ReportButton target={{ type: 'ACTIVITY', id: a.id }} />
                      )}
                    </div>
                  </div>
                }
              />

              {editing && a.canEdit && (
                <ActivityDetailsEditor activity={a} onDone={() => setEditing(false)} />
              )}

              <GroupStatus
                activityId={a.id}
                activityTitle={a.title}
                programId={parentTarget ? resolvedParent.programId : undefined}
                returnTo={currentUrl}
              />

              <div
                className={cn(
                  'activity-layout',
                  (metrics.length > 0 || a.tools.length > 0) && 'activity-layout--definition',
                )}
              >
                <ActivitySection icon={ListOrdered} title="Instructions">
                  <ActivityInstructions
                    instructions={a.instructions}
                    empty="No step-by-step instructions provided for this Activity."
                  />
                </ActivitySection>

                {(metrics.length > 0 || a.tools.length > 0) && (
                  <ActivitySection icon={Target} title="Tracks and uses">
                    {metrics.length > 0 && (
                      <div className="space-y-1.5">
                        <h3 className="activity-card__label">Tracked metrics</h3>
                        <p className="text-sm text-foreground">{metrics.join(' · ')}</p>
                      </div>
                    )}
                    {a.tools.length > 0 && (
                      <div className="space-y-1.5">
                        <h3 className="activity-card__label">Tools</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {a.tools.map((tool) => (
                            <span
                              key={tool.id}
                              className="inline-flex items-center rounded-md bg-surface-muted px-2.5 py-1 text-xs font-medium text-foreground"
                            >
                              {tool.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </ActivitySection>
                )}

                <ActivitySection
                  as="div"
                  id="related-media"
                  icon={ImageIcon}
                  title="Related Media"
                  description="Demonstrations and public photos and videos for this Activity."
                  className="activity-gallery activity-related scroll-mt-20"
                >
                  <ActivityRelatedMedia
                    activityId={a.id}
                    revisionId={a.canEdit ? a.revisionId : null}
                    items={riverItems}
                  />
                </ActivitySection>

                <ActivityShare activity={a} />
              </div>
            </div>
          )
        )}
      </div>
    </Page>
  )
}
