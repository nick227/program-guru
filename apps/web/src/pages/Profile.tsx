import { LocationLink } from '@/components/location/LocationLink'
import { useRef, useState, useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Camera,
  Clock,
  Loader2,
  Layers,
  Lock,
  Pencil,
  Plus,
  Share2,
  Tag,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  type components,
  useApproveFollowRequest,
  useCurrentUser,
  useDeclineFollowRequest,
  useFollowUser,
  useMyFollowRequests,
  useUnfollowUser,
  useUpdateMyProfile,
  useUserAchievements,
  useUserActivities,
  useUserByHandle,
  useUserPrograms,
  useProgramLibrary,
  useUserPublications,
} from '@project/sdk'

type OfferingItem =
  | { kind: 'program'; id: string; data: components['schemas']['ProgramSummary'] }
  | { kind: 'activity'; id: string; data: components['schemas']['ActivitySummary'] }
import { Page, Stage } from '@/components/ui/Layout'
import { Button, buttonVariants } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { ProgramCard } from '@/components/program/ProgramCard'
import { ActivityOfferingCard } from '@/components/activity/ActivityOfferingCard'
import { ThumbnailGrid } from '@/components/media/ThumbnailGrid'
import { buildProfileBreadcrumbs } from '@/lib/breadcrumbs'
import { safeReturn } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { buildActivityUrl, buildProfileUrl, buildProgramUrl, toAbsoluteUrl } from '@/lib/urls'
import { useCategorySlugOf } from '@/components/shared/EntityHero'
import { activityHero, programHero } from '@/lib/hero'
import { isMediaFile, useMediaUploads } from '@/lib/useMediaUploads'
import { ReportButton } from '@/components/shared/ReportButton'
import { cn } from '@/lib/utils'

export function ProfilePage() {
  const { handle = '' } = useParams()
  const [params] = useSearchParams()
  const cleanHandle = handle.replace(/^@+/, '')
  const navigate = useNavigate()
  const rawReturnTo = params.get('returnTo')
  const explicitReturnTo = rawReturnTo ? safeReturn(rawReturnTo, '/browse') : null

  const me = useCurrentUser()
  const library = useProgramLibrary(!!me.data)
  const profile = useUserByHandle(cleanHandle)
  const programs = useUserPrograms(cleanHandle)
  const activities = useUserActivities(cleanHandle)
  const publications = useUserPublications(cleanHandle)
  const achievements = useUserAchievements(cleanHandle)
  const follow = useFollowUser(cleanHandle)
  const unfollow = useUnfollowUser(cleanHandle)
  const online = useOnline()
  const categorySlugOf = useCategorySlugOf()

  const avatarInput = useRef<HTMLInputElement>(null)
  const updateProfile = useUpdateMyProfile()
  const avatarUpload = useMediaUploads({
    onReady: async (asset) => {
      await updateProfile.mutateAsync({ avatarMediaId: asset.id })
      toast.success('Profile photo updated')
    },
  })
  const avatarBusy = avatarUpload.uploads.some((upload) => upload.stage !== 'failed')
  const avatarError = avatarUpload.uploads.find((upload) => upload.stage === 'failed')?.error

  const [offeringFilter, setOfferingFilter] = useState<'all' | 'activities' | 'programs'>('all')

  const p = profile.data

  useDocumentTitle(
    p
      ? p.displayName
        ? `${p.displayName} (@${p.handle})`
        : `@${p.handle}`
      : `@${cleanHandle}`,
  )

  const programRows = useMemo(
    () => programs.data?.pages.flatMap((page) => page.data) ?? [],
    [programs.data?.pages],
  )
  const activityRows = useMemo(
    () => activities.data?.pages.flatMap((page) => page.data) ?? [],
    [activities.data?.pages],
  )
  const mediaRows = useMemo(
    () =>
      publications.data?.pages.flatMap((page) => page.data).slice(0, 12) ?? [],
    [publications.data?.pages],
  )

  const libraryMap = useMemo(
    () => new Map(library.data?.map((entry) => [entry.program.id, entry])),
    [library.data],
  )

  const allOfferings = useMemo<OfferingItem[]>(() => {
    const list: OfferingItem[] = new Array(
      programRows.length + activityRows.length,
    )
    let idx = 0
    for (let i = 0; i < programRows.length; i++) {
      const prog = programRows[i]!
      list[idx++] = { kind: 'program', id: prog.id, data: prog }
    }
    for (let i = 0; i < activityRows.length; i++) {
      const act = activityRows[i]!
      list[idx++] = { kind: 'activity', id: act.id, data: act }
    }
    return list
  }, [programRows, activityRows])

  const displayedOfferings = useMemo(() => {
    if (offeringFilter === 'programs') {
      return allOfferings.filter((o) => o.kind === 'program')
    }
    if (offeringFilter === 'activities') {
      return allOfferings.filter((o) => o.kind === 'activity')
    }
    return allOfferings
  }, [allOfferings, offeringFilter])

  const profileNav = buildProfileBreadcrumbs({
    label: p ? p.displayName || `@${p.handle}` : `@${cleanHandle}`,
    returnTo: explicitReturnTo,
  })
  const profileUrl = buildProfileUrl(p?.handle ?? cleanHandle)

  if (!p) {
    return (
      <Page className="page--wide">
        <Stage className="max-w-3xl mx-auto py-12">
          <ErrorMessage
            error={profile.error}
            retry={() => void profile.refetch()}
          />
          {profile.isPending && <Loading />}
        </Stage>
      </Page>
    )
  }

  const signedIn = !!me.data
  const isOwner = me.data?.data.profile.handle === p.handle
  const publicUrl = toAbsoluteUrl(profileUrl)

  const isFollowedOrRequested =
    p.relationship === 'FOLLOWING' || p.relationship === 'REQUESTED'
  const followBusy = follow.isPending || unfollow.isPending

  const handleFollow = async () => {
    try {
      const result = await follow.mutateAsync(p.id)
      toast.success(
        result.relationship === 'REQUESTED'
          ? `Follow request sent to @${p.handle}`
          : `Following ${p.displayName || `@${p.handle}`}`,
      )
    } catch {
      // shown in ErrorMessage
    }
  }

  const handleUnfollow = async () => {
    const wasRequested = p.relationship === 'REQUESTED'
    try {
      await unfollow.mutateAsync(p.id)
      toast.success(
        wasRequested
          ? 'Follow request cancelled'
          : `Unfollowed ${p.displayName || `@${p.handle}`}`,
      )
    } catch {
      // shown in ErrorMessage
    }
  }

  const shareTitle = p.displayName
    ? `${p.displayName} (@${p.handle})`
    : `@${p.handle}`

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url: publicUrl })
      } else {
        await navigator.clipboard.writeText(publicUrl)
        toast.success('Profile link copied')
      }
    } catch {
      // dismissed
    }
  }

  const hasBothKinds = programRows.length > 0 && activityRows.length > 0

  return (
    <Page className="page--wide pb-20">
      <div className="mx-auto mt-6 w-full max-w-content space-y-10 sm:space-y-12">
        {/* 01 — Identity Banner & Creator Storefront Header */}
        <section
          aria-label={`${p.displayName || `@${p.handle}`} profile`}
          className="relative w-full space-y-4"
        >
          {isOwner && (
            <input
              ref={avatarInput}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="Upload profile photo"
              disabled={!online || avatarBusy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file || !online || avatarBusy) return
                if (!isMediaFile(file, 'image')) {
                  toast.error('Choose an image file.')
                  return
                }
                avatarUpload.uploads.forEach((upload) =>
                  avatarUpload.remove(upload.key),
                )
                void avatarUpload.send(file, { purpose: 'AVATAR' })
              }}
            />
          )}

          {/* Clean Visual Cover Banner (single instance, no duplicated floating avatars) */}
          {p.coverUrl && (
            <div className="relative h-36 w-full overflow-hidden rounded-2xl border border-border bg-surface-muted sm:h-48 md:h-56">
              <img
                src={p.coverUrl}
                alt=""
                className="h-full w-full object-cover"
              />
              {isOwner && (
                <button
                  type="button"
                  aria-label="Upload new cover photo"
                  aria-busy={avatarBusy}
                  disabled={!online || avatarBusy}
                  onClick={() => avatarInput.current?.click()}
                  className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {avatarBusy ? (
                    <Loader2 size={13} className="animate-spin" aria-hidden />
                  ) : (
                    <Camera size={13} aria-hidden />
                  )}
                  <span>Change photo</span>
                </button>
              )}
            </div>
          )}

          {/* Identity Card: Flat neutral surface */}
          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 lg:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4 sm:gap-5">
                <div className="relative shrink-0">
                  <Avatar
                    src={p.avatarUrl}
                    name={p.displayName || p.handle}
                    size="lg"
                    className="h-16 w-16 text-xl ring-2 ring-border sm:h-20 sm:w-20 sm:text-2xl"
                  />
                  {isOwner && !p.coverUrl && (
                    <button
                      type="button"
                      aria-label="Upload profile photo"
                      aria-busy={avatarBusy}
                      disabled={!online || avatarBusy}
                      onClick={() => avatarInput.current?.click()}
                      className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-surface border border-border text-foreground shadow-xs hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {avatarBusy ? (
                        <Loader2 size={13} className="animate-spin" aria-hidden />
                      ) : (
                        <Camera size={13} aria-hidden />
                      )}
                    </button>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                      {p.displayName || `@${p.handle}`}
                    </h1>
                    {p.visibility === 'PRIVATE' && (
                      <span className="inline-flex items-center gap-1 rounded bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
                        <Lock size={12} className="text-accent" />
                        <span>Private</span>
                      </span>
                    )}
                    <ReportButton
                      target={{ type: 'USER', id: p.id }}
                      ownerId={p.id}
                      label="Report account"
                    />
                  </div>
                  <p className="text-sm font-medium text-muted">@{p.handle}</p>

                  {p.relationship === 'FOLLOWING' && (
                    <span className="inline-flex items-center gap-1 rounded bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                      <UserCheck size={12} />
                      <span>Following</span>
                    </span>
                  )}
                  {p.relationship === 'REQUESTED' && (
                    <span className="inline-flex items-center gap-1 rounded bg-surface-muted px-2 py-0.5 text-xs font-semibold text-muted">
                      <Clock size={12} />
                      <span>Follow requested</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                {isOwner ? (
                  <>
                    <Link
                      to="/settings"
                      className={buttonVariants({ variant: 'outline', size: 'md' })}
                    >
                      <Pencil size={14} />
                      <span>Edit Profile</span>
                    </Link>
                    <OwnerFollowRequestsBadge />
                  </>
                ) : !signedIn ? (
                  <Button
                    size="md"
                    onClick={() =>
                      navigate(`/login?returnTo=${encodeURIComponent(profileUrl)}`)
                    }
                    className="gap-2 font-semibold"
                  >
                    <UserPlus size={16} />
                    <span>Follow</span>
                  </Button>
                ) : (
                  <>
                    {isFollowedOrRequested ? (
                      <>
                        <Button
                          variant="outline"
                          size="md"
                          disabled={!online || followBusy}
                          loading={followBusy}
                          onClick={() => void handleUnfollow()}
                          className="gap-1.5 font-semibold"
                        >
                          {p.relationship === 'FOLLOWING' ? (
                            <>
                              <UserCheck size={16} className="text-accent" />
                              <span>Following</span>
                            </>
                          ) : (
                            <>
                              <Clock size={16} />
                              <span>Requested</span>
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="md"
                          disabled={!online || followBusy}
                          onClick={() => void handleUnfollow()}
                          className="gap-1 text-xs text-muted hover:text-foreground"
                        >
                          <UserMinus size={14} />
                          <span>Unfollow</span>
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="md"
                        disabled={!online || followBusy}
                        loading={followBusy}
                        onClick={() => void handleFollow()}
                        className="gap-2 font-semibold"
                      >
                        <UserPlus size={16} />
                        <span>Follow</span>
                      </Button>
                    )}
                  </>
                )}
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => void handleShare()}
                  aria-label="Share profile"
                  className="gap-1.5"
                >
                  <Share2 size={15} />
                  <span className="hidden sm:inline">Share</span>
                </Button>
              </div>
            </div>

            {/* Bio */}
            {p.bio && (
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
                {p.bio}
              </p>
            )}

            {/* Business info & locations */}
            {(p.businessPhone ||
              p.businessWebsite ||
              (p.locations?.length ?? 0) > 0) && (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border/50 pt-3 text-xs text-muted">
                {p.businessWebsite && (
                  <a
                    className="font-medium text-accent hover:underline"
                    href={p.businessWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {p.businessWebsite.replace(/^https?:\/\//, '')}
                  </a>
                )}
                {p.businessPhone && (
                  <a
                    className="font-medium text-foreground hover:text-accent"
                    href={`tel:${p.businessPhone.replace(/[^+0-9]/g, '')}`}
                  >
                    {p.businessPhone}
                  </a>
                )}
                {(p.locations ?? [])
                  .filter((loc) => loc.isActive !== false)
                  .map((place) => (
                    <div key={place.id} className="flex items-center gap-1.5">
                      <LocationLink place={place} />
                      {place.locality && (
                        <span className="text-muted">· {place.locality}</span>
                      )}
                    </div>
                  ))}
              </div>
            )}
            {isOwner && (
              <Link className="mt-2 inline-block text-sm text-accent" to="/settings#business">
                Manage business information &amp; locations
              </Link>
            )}

            {/* Metrics and Focus tags */}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/50 pt-3.5 text-sm text-muted">
              <span>
                <strong className="font-semibold tabular-nums text-foreground">
                  {allOfferings.length}
                </strong>{' '}
                {allOfferings.length === 1 ? 'offering' : 'offerings'}
              </span>
              <span>
                <strong className="font-semibold tabular-nums text-foreground">
                  {p.followerCount}
                </strong>{' '}
                {p.followerCount === 1 ? 'follower' : 'followers'}
              </span>
              {isOwner ? (
                <Link
                  to="/browse?creator=FOLLOWING"
                  className="transition-colors hover:text-accent"
                >
                  <strong className="font-semibold tabular-nums text-foreground">
                    {p.followingCount}
                  </strong>{' '}
                  following
                </Link>
              ) : (
                <span>
                  <strong className="font-semibold tabular-nums text-foreground">
                    {p.followingCount}
                  </strong>{' '}
                  following
                </span>
              )}
              {p.focusChips?.slice(0, 3).map((chip) => (
                <span key={chip.id} className="text-xs text-muted/75 font-medium">
                  #{chip.label}
                </span>
              ))}
            </div>

            {signedIn && !isOwner && p.relationship === 'INCOMING_REQUEST' && (
              <div className="mt-3">
                <IncomingFollowRequestControls
                  requesterId={p.id}
                  displayName={p.displayName || `@${p.handle}`}
                  online={online}
                />
              </div>
            )}

            <ErrorMessage error={follow.error || unfollow.error || avatarError} />
          </div>
        </section>

        {/* 02 — Unified Activities Feed (Activities, Events, and Programs) */}
        <section aria-label="Creator offerings" className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Activities
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Optional Offering filter tabs if both exist */}
              {hasBothKinds && (
                <div className="inline-flex rounded-lg border border-border bg-surface-muted/50 p-1 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setOfferingFilter('all')}
                    className={cn(
                      'rounded-md px-2.5 py-1 transition-colors',
                      offeringFilter === 'all'
                        ? 'bg-surface font-semibold text-foreground shadow-xs'
                        : 'text-muted hover:text-foreground',
                    )}
                  >
                    All ({allOfferings.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfferingFilter('activities')}
                    className={cn(
                      'rounded-md px-2.5 py-1 transition-colors',
                      offeringFilter === 'activities'
                        ? 'bg-surface font-semibold text-foreground shadow-xs'
                        : 'text-muted hover:text-foreground',
                    )}
                  >
                    Activities ({activityRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfferingFilter('programs')}
                    className={cn(
                      'rounded-md px-2.5 py-1 transition-colors',
                      offeringFilter === 'programs'
                        ? 'bg-surface font-semibold text-foreground shadow-xs'
                        : 'text-muted hover:text-foreground',
                    )}
                  >
                    Programs ({programRows.length})
                  </button>
                </div>
              )}

              {isOwner && (
                <div className="flex items-center gap-2">
                  <Link
                    to={`/add-activity?returnTo=${encodeURIComponent(profileUrl)}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    <Plus size={14} />
                    <span>Add Activity</span>
                  </Link>
                  <Link
                    to={`/programs/new?returnTo=${encodeURIComponent(profileUrl)}`}
                    className={buttonVariants({ variant: 'default', size: 'sm' })}
                  >
                    <Plus size={14} />
                    <span>Program</span>
                  </Link>
                </div>
              )}
            </div>
          </div>

          <ErrorMessage
            error={programs.error || activities.error}
            retry={() => {
              void programs.refetch()
              void activities.refetch()
            }}
          />

          {(programs.isPending || activities.isPending) && <Loading />}

          {displayedOfferings.length > 0 ? (
            <div className="space-y-6 sm:space-y-8">
              {displayedOfferings.map((item) => {
                if (item.kind === 'program') {
                  const libEntry = libraryMap.get(item.data.id)
                  return (
                    <ProgramCard
                      key={`prog-${item.data.id}`}
                      programId={item.data.id}
                      program={item.data}
                      profileUserId={p.id}
                      creatorHandle={p.handle}
                      libraryEntry={libEntry}
                      participation={libEntry?.participation}
                      title={item.data.title}
                      hero={programHero(item.data, categorySlugOf)}
                      meta={
                        item.data.accessMode === 'PAID'
                          ? 'Paid'
                          : item.data.accessMode === 'APPROVAL'
                            ? 'Approval required'
                            : null
                      }
                      description={
                        [
                          item.data.frequencyLabel,
                          item.data.durationDays
                            ? `${item.data.durationDays}d`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || item.data.type.label
                      }
                      href={buildProgramUrl(
                        { ...item.data, creatorHandle: p.handle },
                        { scoped: true, returnTo: profileUrl },
                      )}
                    />
                  )
                }
                return (
                  <ActivityOfferingCard
                    key={`act-${item.data.id}`}
                    activity={item.data}
                    hero={activityHero(item.data, categorySlugOf)}
                    href={buildActivityUrl(item.data, {
                      returnTo: profileUrl,
                    })}
                  />
                )
              })}
            </div>
          ) : !(programs.isPending || activities.isPending) ? (
            <div className="rounded-xl border border-dashed border-border bg-surface-muted/40 p-8 text-center text-sm text-muted">
              {p.visibility === 'PRIVATE' &&
              !isOwner &&
              p.relationship !== 'FOLLOWING'
                ? `Follow @${p.handle} to see their offerings once approved.`
                : 'No public offerings yet.'}
            </div>
          ) : null}
        </section>

        {/* 03 — Media */}
        {mediaRows.length > 0 && (
          <section aria-label="Creator media" className="space-y-5">
            <SectionHeader title="Media" />
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <ThumbnailGrid
                columns={6}
                items={mediaRows.map((m) => ({
                  id: m.id,
                  thumbnailUrl: m.thumbnailUrl,
                  type: m.type,
                  alt: m.alt,
                }))}
              />
            </div>
          </section>
        )}

        {/* 04 — Milestones & Achievements */}
        {!!achievements.data?.length && (
          <section
            aria-label="Milestones"
            className="rounded-xl border border-border bg-surface p-4 sm:p-6 space-y-4"
          >
            <SectionHeader title="Milestones" className="pb-0" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {achievements.data.map((a) => (
                <div
                  key={a.id}
                  className="rounded-lg border border-border bg-surface-muted/60 p-3 space-y-1"
                >
                  <strong className="text-sm font-semibold text-foreground">
                    {a.label}
                  </strong>
                  <p className="text-xs text-muted">{a.description}</p>
                  {a.programTitle && (
                    <p className="text-xs font-medium text-muted">
                      {a.programTitle}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Page>
  )
}

function IncomingFollowRequestControls({
  requesterId,
  displayName,
  online,
}: {
  requesterId: string
  displayName: string
  online: boolean
}) {
  const followReqs = useMyFollowRequests()
  const approve = useApproveFollowRequest()
  const decline = useDeclineFollowRequest()

  const request = useMemo(() => {
    if (!followReqs.data?.pages) return null
    for (const page of followReqs.data.pages) {
      for (const req of page.data) {
        if (req.requester.id === requesterId && req.status === 'PENDING') {
          return req
        }
      }
    }
    return null
  }, [followReqs.data?.pages, requesterId])

  if (followReqs.isPending) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 p-3.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {displayName} requested to follow you
        </p>
        <ErrorMessage error={approve.error || decline.error} />
      </div>
      {request ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={!online || approve.isPending || decline.isPending}
            loading={approve.isPending}
            onClick={() => approve.mutate(request.id)}
          >
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!online || approve.isPending || decline.isPending}
            loading={decline.isPending}
            onClick={() => decline.mutate(request.id)}
          >
            Decline
          </Button>
        </div>
      ) : (
        <Link
          to="/settings/follow-requests"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Review requests
        </Link>
      )}
    </div>
  )
}

function OwnerFollowRequestsBadge() {
  const followReqs = useMyFollowRequests()
  const pendingCount = useMemo(() => {
    if (!followReqs.data?.pages) return 0
    let count = 0
    for (const page of followReqs.data.pages) {
      for (const req of page.data) {
        if (req.status === 'PENDING') count++
      }
    }
    return count
  }, [followReqs.data?.pages])

  if (pendingCount === 0) return null

  return (
    <Link
      to="/settings/follow-requests"
      className={buttonVariants({ variant: 'outline', size: 'md' })}
    >
      <Users size={14} className="text-accent" />
      <span>
        {pendingCount} follow {pendingCount === 1 ? 'request' : 'requests'}
      </span>
    </Link>
  )
}
