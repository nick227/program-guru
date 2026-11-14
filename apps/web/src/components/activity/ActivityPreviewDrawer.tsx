import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ExternalLink, MapPin, Play, X } from 'lucide-react'
import {
  useActivity,
  useActivityPublicMedia,
  useAddCalendarItem,
  useCurrentUser,
} from '@project/sdk'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { ActivityInstructions } from '@/components/activity/ActivityInstructions'
import { RelatedMedia, type RelatedMediaItem } from '@/components/media/RelatedMedia'
import { formatFrequency } from '@/components/program-authoring/ScheduleControls'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import { GroupStatus } from '@/components/social/GroupStatus'
import { today } from '@/lib/dates'
import { formatDurationMinutes } from '@/lib/durationMinutes'
import { activityHero } from '@/lib/hero'
import { buildProfileUrl } from '@/lib/urls'

/** Reusable inline Activity preview drawer for Community, Calendar, and Program pages. */
export function ActivityPreviewDrawer({
  activityId,
  currentUrl,
  onClose,
}: {
  activityId: string | null
  currentUrl: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const me = useCurrentUser()
  const categorySlugOf = useCategorySlugOf()
  const addCalendarItem = useAddCalendarItem()
  const [starting, setStarting] = useState(false)

  const activity = useActivity(activityId ?? '')
  const publicMedia = useActivityPublicMedia(activityId ?? '')

  useEffect(() => {
    if (!activityId) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [activityId, onClose])

  if (!activityId) return null

  const a = activity.data
  const signedIn = !!me.data

  const handleDoNow = async () => {
    if (!a || starting) return
    setStarting(true)
    try {
      const result = await addCalendarItem.mutateAsync({
        activityId: a.id,
        revisionId: a.revisionId ?? undefined,
        localDate: today(
          me.data?.data.preferences.timezone ??
            Intl.DateTimeFormat().resolvedOptions().timeZone,
        ),
        idempotencyKey: crypto.randomUUID(),
      })
      onClose()
      navigate(
        `/occurrences/${result.item.id}?returnTo=${encodeURIComponent(currentUrl)}`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start activity')
    } finally {
      setStarting(false)
    }
  }

  const publicMediaItems: RelatedMediaItem[] = (
    publicMedia.data?.pages ?? []
  ).flatMap((page) =>
    page.data.map((m) => ({
      id: m.id,
      type: m.type,
      thumbnailUrl: m.thumbnailUrl,
      durationMs: m.durationMs ?? undefined,
      alt: m.alt || a?.title || 'Activity media',
    })),
  )

  const ownMediaItems: RelatedMediaItem[] = (a?.media ?? []).map((m) => ({
    id: m.id,
    type: m.type,
    thumbnailUrl: m.thumbnailUrl,
    durationMs: m.durationMs ?? undefined,
    alt: m.alt || a?.title || 'Activity media',
  }))

  const seenMediaIds = new Set<string>()
  const mediaItems = [...ownMediaItems, ...publicMediaItems].filter((m) => {
    if (seenMediaIds.has(m.id)) return false
    seenMediaIds.add(m.id)
    return true
  })

  const metaParts = a
    ? [
        formatDurationMinutes(a.durationMinutes),
        formatFrequency(a.frequency) || null,
      ].filter(Boolean)
    : []

  const creatorProfileUrl = a?.creator?.handle
    ? buildProfileUrl(a.creator.handle)
    : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={a ? a.title : 'Activity preview'}
      className="fixed inset-0 z-50 flex justify-end"
    >
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px]"
      />

      <div className="browse-sidebar-scroll relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border/60 bg-background shadow-2xl">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border/40 bg-background/95 px-6 py-4 backdrop-blur">
          <span className="truncate font-display text-base font-semibold text-foreground">
            {a?.title ?? 'Activity'}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to={`/activities/${activityId}?returnTo=${encodeURIComponent(currentUrl)}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <span>Full page</span>
              <ExternalLink size={13} aria-hidden />
            </Link>
            <button
              type="button"
              aria-label="Close preview"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 p-6">
          <ErrorMessage
            error={activity.error}
            retry={() => void activity.refetch()}
          />

          {activity.isPending && <Loading />}

          {a && (
            <>
              <div className="overflow-hidden rounded-xl bg-surface-muted">
                <EntityHero
                  hero={activityHero(a, categorySlugOf)}
                  size="card"
                  interactive={false}
                  showVideoBadge={false}
                  className="aspect-video w-full"
                />
              </div>

              <div className="space-y-3">
                <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                  {a.title}
                </h2>

                <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
                  {a.creator && (
                    <div className="flex items-center gap-2">
                      <Avatar
                        src={a.creator.avatarUrl}
                        name={a.creator.displayName}
                        size="sm"
                        className="h-6 w-6"
                      />
                      {creatorProfileUrl ? (
                        <Link
                          to={creatorProfileUrl}
                          onClick={onClose}
                          className="font-medium text-foreground/90 hover:text-accent"
                        >
                          {a.creator.displayName}
                        </Link>
                      ) : (
                        <span className="font-medium text-foreground/90">
                          {a.creator.displayName}
                        </span>
                      )}
                    </div>
                  )}
                  {metaParts.length > 0 && (
                    <span>{metaParts.join(' · ')}</span>
                  )}
                </div>

                {a.summary && (
                  <p className="text-[15px] leading-relaxed text-foreground/85">
                    {a.summary}
                  </p>
                )}

                {a.place && (
                  <p className="flex items-start gap-2 text-sm text-muted">
                    <MapPin size={15} aria-hidden className="mt-0.5 shrink-0" />
                    <span>
                      Suggested place:{' '}
                      <span className="font-medium text-foreground/90">{a.place.name}</span>, {a.place.locality}
                      {a.place.accessNote ? ` · ${a.place.accessNote}` : ''}
                    </span>
                  </p>
                )}

                <div className="pt-1">
                  {signedIn ? (
                    <Button
                      size="md"
                      loading={starting}
                      onClick={() => void handleDoNow()}
                      className="w-full gap-2"
                    >
                      <Play size={15} aria-hidden />
                      <span>Do Now</span>
                    </Button>
                  ) : (
                    <Link
                      to={`/activities/${a.id}?returnTo=${encodeURIComponent(currentUrl)}`}
                      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90"
                    >
                      <Play size={15} aria-hidden />
                      <span>Do Now</span>
                    </Link>
                  )}
                </div>
              </div>

              <GroupStatus
                activityId={a.id}
                activityTitle={a.title}
                returnTo={currentUrl}
              />

              <section className="space-y-2.5 border-t border-border/40 pt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Instructions
                </h3>
                <ActivityInstructions
                  instructions={a.instructions}
                  empty="No step-by-step instructions provided for this Activity."
                />
              </section>

              {mediaItems.length > 0 && (
                <section className="space-y-3 border-t border-border/40 pt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Media
                  </h3>
                  <RelatedMedia variant="gallery" items={mediaItems} />
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

