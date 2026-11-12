import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, UserCheck, UserPlus, X } from 'lucide-react'
import {
  useCurrentUser,
  useFollowUser,
  useUnfollowUser,
  useUserActivities,
  useUserByHandle,
  useUserPrograms,
} from '@project/sdk'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import { formatDurationMinutes } from '@/lib/durationMinutes'
import { activityHero, programHero } from '@/lib/hero'
import { buildProfileUrl } from '@/lib/urls'

/** Reusable inline Creator preview drawer for Community discovery. */
export function CreatorPreviewDrawer({
  handle,
  currentUrl,
  onClose,
  onSelectActivity,
}: {
  handle: string | null
  currentUrl: string
  onClose: () => void
  onSelectActivity?: (activityId: string) => void
}) {
  const me = useCurrentUser()
  const categorySlugOf = useCategorySlugOf()
  const cleanHandle = (handle ?? '').replace(/^@/, '')

  const profile = useUserByHandle(cleanHandle)
  const programs = useUserPrograms(cleanHandle)
  const activities = useUserActivities(cleanHandle)
  const follow = useFollowUser(cleanHandle)
  const unfollow = useUnfollowUser(cleanHandle)

  useEffect(() => {
    if (!handle) return
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
  }, [handle, onClose])

  if (!handle) return null

  const p = profile.data
  const signedIn = !!me.data
  const isOwner = !!p && me.data?.data.profile.handle === p.handle
  const isFollowedOrRequested =
    p?.relationship === 'FOLLOWING' || p?.relationship === 'REQUESTED'
  const followBusy = follow.isPending || unfollow.isPending

  const programRows = programs.data?.pages.flatMap((page) => page.data) ?? []
  const activityRows = (activities.data?.pages.flatMap((page) => page.data) ?? []).slice(0, 6)

  const handleToggleFollow = async () => {
    if (!p || followBusy) return
    try {
      if (isFollowedOrRequested) {
        await unfollow.mutateAsync(p.id)
        toast.success(`Unfollowed ${p.displayName || `@${p.handle}`}`)
      } else {
        const result = await follow.mutateAsync(p.id)
        toast.success(
          result.relationship === 'REQUESTED'
            ? `Follow request sent to @${p.handle}`
            : `Following ${p.displayName || `@${p.handle}`}`,
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update follow status')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={p ? p.displayName || `@${p.handle}` : 'Creator preview'}
      className="fixed inset-0 z-50 flex justify-end"
    >
      <button
        type="button"
        aria-label="Close creator preview"
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px]"
      />

      <div className="browse-sidebar-scroll relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border/60 bg-background shadow-2xl">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border/40 bg-background/95 px-6 py-4 backdrop-blur">
          <span className="truncate font-display text-base font-semibold text-foreground">
            {p ? p.displayName || `@${p.handle}` : `@${cleanHandle}`}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to={buildProfileUrl(cleanHandle)}
              onClick={onClose}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <span>Full profile</span>
              <ExternalLink size={13} aria-hidden />
            </Link>
            <button
              type="button"
              aria-label="Close creator preview"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 p-6">
          <ErrorMessage
            error={profile.error}
            retry={() => void profile.refetch()}
          />
          {profile.isPending && <Loading />}

          {p && (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar
                    src={p.avatarUrl}
                    name={p.displayName || p.handle}
                    size="lg"
                    className="h-16 w-16 shrink-0"
                  />
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-2xl font-semibold tracking-tight text-foreground">
                      {p.displayName || `@${p.handle}`}
                    </h2>
                    <p className="truncate text-sm text-muted">@{p.handle}</p>
                    <p className="mt-1 text-sm text-muted">
                      {p.publicProgramCount}{' '}
                      {p.publicProgramCount === 1 ? 'Program' : 'Programs'} ·{' '}
                      {p.followerCount}{' '}
                      {p.followerCount === 1 ? 'follower' : 'followers'}
                    </p>
                  </div>
                </div>

                {!isOwner &&
                  (signedIn ? (
                    <Button
                      variant={isFollowedOrRequested ? 'outline' : 'default'}
                      size="sm"
                      loading={followBusy}
                      onClick={() => void handleToggleFollow()}
                      className="shrink-0 gap-1.5"
                    >
                      {isFollowedOrRequested ? (
                        <UserCheck size={14} aria-hidden />
                      ) : (
                        <UserPlus size={14} aria-hidden />
                      )}
                      <span>
                        {p.relationship === 'REQUESTED'
                          ? 'Requested'
                          : isFollowedOrRequested
                            ? 'Following'
                            : 'Follow'}
                      </span>
                    </Button>
                  ) : (
                    <Link
                      to={`/login?returnTo=${encodeURIComponent(currentUrl)}`}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-fg hover:bg-accent/90"
                    >
                      <UserPlus size={14} aria-hidden />
                      <span>Follow</span>
                    </Link>
                  ))}
              </div>

              {p.bio && (
                <p className="text-[15px] leading-relaxed text-foreground/85">
                  {p.bio}
                </p>
              )}

              {programRows.length > 0 && (
                <section className="space-y-3 border-t border-border/40 pt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Programs
                  </h3>
                  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {programRows.map((prog) => (
                      <li key={prog.id}>
                        <Link
                          to={`/programs/${prog.id}?returnTo=${encodeURIComponent(currentUrl)}`}
                          onClick={onClose}
                          className="group block space-y-2"
                        >
                          <div className="browse-thumb aspect-video w-full overflow-hidden rounded-lg bg-surface-muted">
                            <EntityHero
                              hero={programHero(prog, categorySlugOf)}
                              size="card"
                              interactive={false}
                              showVideoBadge={false}
                              className="h-full w-full rounded-none transition-transform duration-200 group-hover:scale-[1.02]"
                            />
                          </div>
                          <div>
                            <p className="line-clamp-1 font-display text-base font-semibold text-foreground group-hover:text-accent">
                              {prog.title}
                            </p>
                            {prog.sessionMinutes && (
                              <p className="text-xs text-muted">
                                {prog.sessionMinutes} min
                                {prog.frequencyLabel ? ` · ${prog.frequencyLabel}` : ''}
                              </p>
                            )}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {activityRows.length > 0 && (
                <section className="space-y-3 border-t border-border/40 pt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Activities
                  </h3>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {activityRows.map((act) => (
                      <li key={act.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectActivity) {
                              onClose()
                              onSelectActivity(act.id)
                            }
                          }}
                          className="group flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-surface-muted/50"
                        >
                          <div className="browse-thumb h-12 w-16 shrink-0 overflow-hidden rounded-md bg-surface-muted">
                            <EntityHero
                              hero={activityHero(act, categorySlugOf)}
                              size="card"
                              interactive={false}
                              showVideoBadge={false}
                              className="h-full w-full rounded-none"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground group-hover:text-accent">
                              {act.title}
                            </p>
                            {act.durationMinutes != null && (
                              <p className="text-xs text-muted">
                                {formatDurationMinutes(act.durationMinutes)}
                              </p>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
