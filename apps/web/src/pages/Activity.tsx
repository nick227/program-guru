import { formatDurationMinutes } from '@/lib/durationMinutes'
import { formatTargetTime, parseTargetTime, targetTimeInput } from '@/lib/targetTime'
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
  useUpdateActivityDraft,
} from '@project/sdk'
import { Clock, Repeat } from 'lucide-react'
import { Page, Stage } from '@/components/ui/Layout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Avatar } from '@/components/ui/Avatar'
import { CategoryIcon } from '@/components/shared/CategoryIcon'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import { SubHeader } from '@/components/shared/SubHeader'
import { ReportButton } from '@/components/shared/ReportButton'
import { type RiverItem } from '@/components/media/RelatedMedia'
import { ActivityRelatedMedia } from '@/components/activity/ActivityRelatedMedia'
import { formatFrequency } from '@/components/program-authoring/ScheduleControls'
import {
  buildActivityBreadcrumbs,
  extractProgramTargetFromPath,
} from '@/lib/breadcrumbs'
import { safeReturn } from '@/lib/dates'
import { activityHero } from '@/lib/hero'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import {
  useResolveActivityTarget,
  useResolveProgramTarget,
} from '@/lib/useResolveSlug'
import { buildActivityUrl, buildProfileUrl } from '@/lib/urls'
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
  const updateTargetTime = useUpdateActivityDraft(resolved.activityId)
  const publicMedia = useActivityPublicMedia(
    resolved.activityId,
    undefined,
    !resolved.notFound && !!resolved.activityId,
  )
  const online = useOnline()
  const [targetTimeDraft, setTargetTimeDraft] = useState('')

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

  useEffect(() => {
    setTargetTimeDraft(targetTimeInput(activity.data?.targetTime))
  }, [activity.data?.id, activity.data?.targetTime, activity.data?.draftRevision])

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
            Return to Browse
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
  const nonDurationMetrics = a
    ? a.metricLabels.filter((label) => !label.toLowerCase().startsWith('duration'))
    : []

  return (
    <Page className="page--wide pb-20">
      <SubHeader
        breadcrumbs={activityNav.items}
        active={activityNav.activeNav}
        returnTo={currentUrl}
      />

      <div className="mx-auto mt-6 w-full max-w-5xl activity-page">
        <ErrorMessage
          error={activity.error}
          retry={() => void activity.refetch()}
        />

        {resolved.isLoading || activity.isPending ? (
          <Loading />
        ) : (
          a &&
          hero && (
            <>
              {/* 1 · Hero Identity Card */}
              <header
                className={cn(
                  'activity-identity',
                  hero.src && 'activity-identity--photo',
                )}
              >
                {hero.src && (
                  <div className="activity-identity__art-wrap" aria-hidden>
                    <EntityHero
                      hero={hero}
                      size="banner"
                      className="activity-identity__art"
                    />
                  </div>
                )}

                <div className="activity-identity__body">
                  <div className="activity-identity__header">
                    <span className="activity-identity__icon" aria-hidden>
                      <CategoryIcon
                        category={hero.category}
                        size={22}
                        strokeWidth={1.85}
                      />
                    </span>

                    <div className="activity-identity__title-group">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="activity-identity__context">
                          {[category?.label, a.isPlatform ? 'Platform Activity' : null]
                            .filter(Boolean)
                            .join(' · ') || 'Activity'}
                        </p>
                        {a.canEdit && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {a.status === 'DRAFT' && (
                              <span className="inline-flex items-center rounded-full bg-attention/15 px-2.5 py-0.5 text-xs font-semibold text-attention">
                                Draft
                              </span>
                            )}
                            <span className="inline-flex items-center rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted">
                              {a.visibility === 'PUBLIC'
                                ? 'Public'
                                : a.visibility === 'UNLISTED'
                                  ? 'Link only'
                                  : 'Private'}
                            </span>
                          </div>
                        )}
                      </div>

                      <h1>{a.title}</h1>

                      {a.creator && (
                        <div>
                          <Link
                            to={`${buildProfileUrl(a.creator.handle)}?returnTo=${encodeURIComponent(currentUrl)}`}
                            className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-accent transition-colors"
                          >
                            <Avatar
                              src={a.creator.avatarUrl}
                              name={a.creator.displayName}
                              size="sm"
                              className="h-5 w-5 ring-1 ring-border"
                            />
                            <span>
                              by <strong className="font-semibold">{a.creator.displayName}</strong>
                            </span>
                          </Link>
                        </div>
                      )}

                      {(durationText || targetTimeText || frequencyText) && (
                        <div className="activity-identity__meta">
                          {durationText && (
                            <span className="inline-flex items-center gap-1.5">
                              <Clock size={14} aria-hidden />
                              <span>Duration: {durationText}</span>
                            </span>
                          )}
                          {targetTimeText && (
                            <span className="inline-flex items-center gap-1.5">
                              <Clock size={14} aria-hidden />
                              <span>Target time: {targetTimeText}</span>
                            </span>
                          )}
                          {frequencyText && (
                            <span className="inline-flex items-center gap-1.5">
                              <Repeat size={14} aria-hidden />
                              <span>Frequency: {frequencyText}</span>
                            </span>
                          )}
                        </div>
                      )}

                      {a.summary && (
                        <p className="activity-identity__summary">{a.summary}</p>
                      )}

                      {a.sourceActivity && (
                        <p className="text-xs text-muted">
                          Based on{' '}
                          <Link
                            to={buildActivityUrl(a.sourceActivity, {
                              returnTo: currentUrl,
                            })}
                            className="font-medium text-accent hover:underline"
                          >
                            {a.sourceActivity.title}
                          </Link>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </header>

              {/* 2 · Instructions + Specifications */}
              <div className="grid grid-cols-1 gap-6 items-start lg:grid-cols-12">
                <section
                  aria-label="Instructions"
                  className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-4 lg:col-span-7"
                >
                  <SectionHeader title="Instructions" className="pb-0" />
                  {a.instructions.length > 0 ? (
                    <ol className="space-y-3">
                      {a.instructions.map((inst, index) => (
                        <li
                          key={inst.id}
                          className="rounded-lg border border-border/70 bg-surface-raised p-4 space-y-1"
                        >
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-bold tabular-nums text-accent">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            {inst.title && (
                              <h3 className="text-sm font-semibold text-foreground">
                                {inst.title}
                              </h3>
                            )}
                          </div>
                          {inst.body && (
                            <p className="text-sm leading-relaxed text-muted">
                              {inst.body}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted">
                      No step-by-step instructions provided for this Activity.
                    </p>
                  )}
                </section>

                <aside
                  aria-label="Activity details"
                  className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-5 lg:col-span-5"
                >
                  <SectionHeader title="Details" className="pb-0" />

                  <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
                    {category && (
                      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                        <dt className="text-muted">Category</dt>
                        <dd className="font-medium text-foreground">{category.label}</dd>
                      </div>
                    )}
                    {durationText && (
                      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                        <dt className="text-muted">Planned duration</dt>
                        <dd className="font-medium text-foreground">{durationText}</dd>
                      </div>
                    )}
                    {frequencyText && (
                      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                        <dt className="text-muted">Frequency</dt>
                        <dd className="font-medium text-foreground">{frequencyText}</dd>
                      </div>
                    )}
                    {targetTimeText && (
                      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                        <dt className="text-muted">Target time</dt>
                        <dd className="font-medium text-foreground">{targetTimeText}</dd>
                      </div>
                    )}
                  </dl>

                  {nonDurationMetrics.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Tracked metrics
                      </h3>
                      <p className="text-sm text-foreground">
                        {nonDurationMetrics.join(' · ')}
                      </p>
                    </div>
                  )}

                  {a.tools.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Tools
                      </h3>
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

                  <p className="text-xs text-muted">
                    Session duration is calculated automatically while you work.
                  </p>

                  {a.canEdit ? (
                    <div className="space-y-2 border-t border-border pt-4">
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="field space-y-1">
                          <span className="label text-xs font-semibold">
                            Target time (optional)
                          </span>
                          <Input
                            type="time"
                            aria-label="Target time (optional)"
                            value={targetTimeDraft}
                            disabled={!online || updateTargetTime.isPending}
                            onChange={(event) =>
                              setTargetTimeDraft(event.target.value)
                            }
                          />
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            !online ||
                            updateTargetTime.isPending ||
                            parseTargetTime(targetTimeDraft) ===
                              (a.targetTime ?? null)
                          }
                          loading={updateTargetTime.isPending}
                          onClick={() =>
                            void updateTargetTime.mutateAsync({
                              targetTime: parseTargetTime(targetTimeDraft),
                              expectedRevision: a.draftRevision,
                            })
                          }
                        >
                          Save time
                        </Button>
                        {a.targetTime && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={!online || updateTargetTime.isPending}
                            onClick={() =>
                              void updateTargetTime.mutateAsync({
                                targetTime: null,
                                expectedRevision: a.draftRevision,
                              })
                            }
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                      <ErrorMessage error={updateTargetTime.error} />
                    </div>
                  ) : (
                    <div className="border-t border-border pt-3">
                      <ReportButton target={{ type: 'ACTIVITY', id: a.id }} />
                    </div>
                  )}
                </aside>
              </div>

              {/* 3 · Unified Related Media */}
              <ActivityRelatedMedia
                activityId={a.id}
                revisionId={a.canEdit ? a.revisionId : null}
                items={riverItems}
              />
            </>
          )
        )}
      </div>
    </Page>
  )
}
