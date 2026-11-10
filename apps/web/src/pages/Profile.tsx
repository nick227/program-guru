import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Clock,
  Layers,
  LayoutGrid,
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
  useApproveFollowRequest,
  useCurrentUser,
  useDeclineFollowRequest,
  useFollowUser,
  useMyFollowRequests,
  useUnfollowUser,
  useUserAchievements,
  useUserActivities,
  useUserByHandle,
  useUserPrograms,
  useUserPublications,
} from '@project/sdk'
import { Page, Stage } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { ShareLinkCard } from '@/components/social/ShareLink'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { ProgramActivityCard } from '@/components/program/ProgramActivityCard'
import { ThumbnailGrid } from '@/components/media/ThumbnailGrid'
import { Back } from '@/components/shared/Navigation'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { buildActivityUrl, buildProfileUrl, buildProgramUrl, toAbsoluteUrl } from '@/lib/urls'
import { useCategorySlugOf } from '@/components/shared/EntityHero'
import { activityHero, programHero } from '@/lib/hero'
import { ReportButton } from '@/components/shared/ReportButton'

export function ProfilePage() {
  const { handle = '' } = useParams()
  const cleanHandle = handle.replace(/^@+/, '')
  const navigate = useNavigate()

  const me = useCurrentUser()
  const profile = useUserByHandle(cleanHandle)
  const programs = useUserPrograms(cleanHandle)
  const activities = useUserActivities(cleanHandle)
  const publications = useUserPublications(cleanHandle)
  const achievements = useUserAchievements(cleanHandle)
  const follow = useFollowUser(cleanHandle)
  const unfollow = useUnfollowUser(cleanHandle)
  const online = useOnline()
  const categorySlugOf = useCategorySlugOf()

  const [failedVisualSrc, setFailedVisualSrc] = useState<string | null>(null)

  const p = profile.data

  useDocumentTitle(
    p
      ? p.displayName
        ? `${p.displayName} (@${p.handle})`
        : `@${p.handle}`
      : `@${cleanHandle}`,
  )

  if (!p) {
    return (
      <Page>
        <Stage className="max-w-3xl mx-auto py-12">
          <Back to="/">Calendar</Back>
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
  const programRows = programs.data?.pages.flatMap((page) => page.data) ?? []
  const activityRows =
    activities.data?.pages.flatMap((page) => page.data).slice(0, 6) ?? []
  const mediaRows =
    publications.data?.pages.flatMap((page) => page.data).slice(0, 12) ?? []

  const profileUrl = buildProfileUrl(p.handle)
  const publicUrl = toAbsoluteUrl(profileUrl)

  const rawVisualUrl = p.coverUrl || p.avatarUrl || null
  const featuredVisualUrl =
    rawVisualUrl && failedVisualSrc !== rawVisualUrl ? rawVisualUrl : null

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

    

  return (
    <Page className="page--content max-w-7xl pb-20">
      <div className="w-full space-y-10 sm:space-y-12">
        {/* 01 — Creator Hero (reuses ProgramHero layout) */}
        <section
          aria-label={`${p.displayName || `@${p.handle}`} profile`}
          className="relative w-full overflow-hidden rounded-2xl border border-border bg-surface p-6 sm:p-8 lg:p-10 shadow-sm"
        >
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-12">
            {/* Left Column: Creator Identity, Specs & Following Controls */}
            <div className="flex flex-col justify-between space-y-6 lg:col-span-7">
              <div className="flex items-center justify-between gap-4">
                <Link
                  to="/"
                  className="group inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
                >
                  <ArrowLeft
                    size={16}
                    className="transition-transform group-hover:-translate-x-1"
                  />
                  <span>Calendar</span>
                </Link>
                {p.visibility === 'PRIVATE' && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2.5 py-1 text-xs font-medium text-muted">
                    <Lock size={12} className="text-accent" />
                    <span>Private profile</span>
                  </span>
                )}
              </div>

              <div className="space-y-4">
                <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                  {p.displayName || `@${p.handle}`}
                </h1>
                <ReportButton target={{ type: 'USER', id: p.id }} ownerId={p.id} label="Report account" />

                <div className="flex flex-wrap items-center gap-2.5 text-sm text-foreground">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <Avatar
                      src={p.avatarUrl}
                      name={p.displayName || p.handle}
                      size="sm"
                      className="h-7 w-7 ring-1 ring-border"
                    />
                    <span className="text-muted">@{p.handle}</span>
                  </span>
                  {p.relationship === 'FOLLOWING' && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                      <UserCheck size={12} />
                      <span>Following</span>
                    </span>
                  )}
                  {p.relationship === 'REQUESTED' && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 text-xs font-semibold text-muted">
                      <Clock size={12} />
                      <span>Requested</span>
                    </span>
                  )}
                </div>

                {p.bio && (
                  <p className="max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
                    {p.bio}
                  </p>
                )}

                {/* Creator Metrics & Focus Chips */}
                <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-medium text-muted sm:gap-4 sm:text-sm">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2.5 py-1 text-foreground">
                    <Layers size={14} className="text-accent" />
                    {p.publicProgramCount}{' '}
                    {p.publicProgramCount === 1 ? 'Program' : 'Programs'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2.5 py-1 text-foreground">
                    <Users size={14} className="text-accent" />
                    {p.followerCount}{' '}
                    {p.followerCount === 1 ? 'follower' : 'followers'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2.5 py-1 text-foreground">
                    <UserCheck size={14} className="text-accent" />
                    {p.followingCount} following
                  </span>
                  {p.focusChips?.slice(0, 3).map((chip) => (
                    <span
                      key={chip.id}
                      className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2.5 py-1 text-foreground"
                    >
                      <Tag size={14} className="text-accent" />
                      {chip.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Hierarchy & Following Controls */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {isOwner ? (
                  <>
                    <Link
                      to={`/programs/new?returnTo=${encodeURIComponent(profileUrl)}`}
                      className="btn btn--primary btn--lg gap-2 px-7 text-base font-bold shadow-md hover:shadow-lg transition-all"
                    >
                      <Plus size={18} />
                      <span>Add Program</span>
                    </Link>
                    <Link
                      to="/settings"
                      className="btn btn--outline btn--lg gap-2 px-5 font-semibold"
                    >
                      <Pencil size={15} />
                      <span>Edit Profile</span>
                    </Link>
                    <Link
                      to="/studio"
                      className="btn btn--outline btn--lg gap-2 px-5 font-semibold"
                    >
                      <LayoutGrid size={15} />
                      <span>Studio</span>
                    </Link>
                    <OwnerFollowRequestsBadge />
                  </>
                ) : !signedIn ? (
                  <Button
                    size="lg"
                    onClick={() =>
                      navigate(
                        `/login?returnTo=${encodeURIComponent(profileUrl)}`,
                      )
                    }
                    className="gap-2 px-7 text-base font-bold shadow-md hover:shadow-lg transition-all"
                  >
                    <UserPlus size={18} />
                    <span>Sign in to follow</span>
                  </Button>
                ) : (
                  <>
                    {isFollowedOrRequested ? (
                      <>
                        <Button
                          variant="outline"
                          size="lg"
                          disabled={!online || followBusy}
                          loading={followBusy}
                          onClick={() => void handleUnfollow()}
                          className="gap-2 px-6 text-base font-semibold"
                        >
                          {p.relationship === 'FOLLOWING' ? (
                            <>
                              <UserCheck size={18} className="text-accent" />
                              <span>Following</span>
                            </>
                          ) : (
                            <>
                              <Clock size={18} />
                              <span>Requested</span>
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="lg"
                          disabled={!online || followBusy}
                          onClick={() => void handleUnfollow()}
                          className="gap-2 px-4 text-sm font-semibold text-muted hover:text-foreground"
                        >
                          <UserMinus size={16} />
                          <span>
                            {p.relationship === 'FOLLOWING'
                              ? 'Unfollow'
                              : 'Cancel request'}
                          </span>
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="lg"
                        disabled={!online || followBusy}
                        loading={followBusy}
                        onClick={() => void handleFollow()}
                        className="gap-2 px-7 text-base font-bold shadow-md hover:shadow-lg transition-all"
                      >
                        <UserPlus size={18} />
                        <span>
                          {p.visibility === 'PRIVATE'
                            ? 'Request Follow'
                            : 'Follow'}
                        </span>
                      </Button>
                    )}
                  </>
                )}
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => void handleShare()}
                  className="gap-2 px-4 font-semibold text-muted hover:text-foreground"
                >
                  <Share2 size={16} />
                  <span>Share</span>
                </Button>
              </div>

              {signedIn && !isOwner && p.relationship === 'INCOMING_REQUEST' && (
                <IncomingFollowRequestControls
                  requesterId={p.id}
                  displayName={p.displayName || `@${p.handle}`}
                  online={online}
                />
              )}

              <ErrorMessage error={follow.error || unfollow.error} />
            </div>

            {/* Right Column: Clean Framed Creator Feature (no top social banner) */}
            <div className="lg:col-span-5">
              <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] lg:aspect-[4/3] overflow-hidden rounded-xl border border-border bg-surface-muted shadow-md">
                {featuredVisualUrl ? (
                  <>
                    <img
                      src={featuredVisualUrl}
                      alt={p.displayName || `@${p.handle}`}
                      onError={() => setFailedVisualSrc(featuredVisualUrl)}
                      className="h-full w-full object-cover"
                    />
                    {p.coverUrl && p.avatarUrl && (
                      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4">
                        <Avatar
                          src={p.avatarUrl}
                          name={p.displayName || p.handle}
                          size="lg"
                          className="h-12 w-12 ring-2 ring-white/80 shadow-md"
                        />
                        <div className="min-w-0 text-white">
                          <p className="truncate text-sm font-bold">
                            {p.displayName || `@${p.handle}`}
                          </p>
                          <p className="truncate text-xs text-white/80">
                            @{p.handle}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-accent/15 via-surface-muted to-surface p-6 text-center">
                    <Avatar
                      src={p.avatarUrl}
                      name={p.displayName || p.handle}
                      size="lg"
                      className="h-24 w-24 text-2xl ring-2 ring-border shadow-md"
                    />
                    <div className="space-y-0.5">
                      <p className="font-display text-lg font-bold text-foreground">
                        {p.displayName || `@${p.handle}`}
                      </p>
                      <p className="text-xs font-medium text-muted">
                        @{p.handle}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 02 — Programs (Tight thumb-sized 6-col grid) */}
        <section aria-label="Creator programs" className="space-y-5">
          <SectionHeader
            title="Programs"
            action={
              isOwner ? (
                <Link
                  to={`/programs/new?returnTo=${encodeURIComponent(profileUrl)}`}
                  className="btn btn--outline btn--sm gap-1.5"
                >
                  <Plus size={14} />
                  <span>Add Program</span>
                </Link>
              ) : undefined
            }
          />
          {programRows.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {programRows.map((program) => (
                  <ProgramActivityCard
                    key={program.id}
                    variant="thumb"
                    title={program.title}
                    hero={programHero(program, categorySlugOf)}
                    meta={program.accessMode === 'OPEN' ? 'Free' : 'Access'}
                    description={
                      [
                        program.frequencyLabel,
                        program.durationDays
                          ? `${program.durationDays}d`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || program.type.label
                    }
                    href={buildProgramUrl(
                      { ...program, creatorHandle: p.handle },
                      { scoped: true, returnTo: profileUrl },
                    )}
                  />
                ))}
              </div>
              {programs.hasNextPage && (
                <div className="flex justify-center pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={programs.isFetchingNextPage}
                    onClick={() => void programs.fetchNextPage()}
                  >
                    Show more programs
                  </Button>
                </div>
              )}
            </>
          ) : !programs.isPending ? (
            <div className="rounded-xl border border-dashed border-border bg-surface-muted/50 p-8 text-center text-sm text-muted">
              {p.visibility === 'PRIVATE' &&
              !isOwner &&
              p.relationship !== 'FOLLOWING'
                ? `Follow @${p.handle} to see their programs once approved.`
                : 'No public programs yet.'}
            </div>
          ) : null}
        </section>

        {/* 03 — Activities */}
        {activityRows.length > 0 && (
          <section aria-label="Creator activities" className="space-y-5">
            <SectionHeader title="Activities" />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {activityRows.map((a) => (
                <ProgramActivityCard
                  key={a.id}
                  title={a.title}
                  hero={activityHero(a, categorySlugOf)}
                  description={a.summary}
                  meta={`${a.instructionCount} ${a.instructionCount === 1 ? 'instruction' : 'instructions'} · ${a.mediaCount} media`}
                  href={buildActivityUrl(a, { returnTo: profileUrl })}
                />
              ))}
            </div>
          </section>
        )}

        {/* 04 — Media */}
        {mediaRows.length > 0 && (
          <section aria-label="Creator media" className="space-y-5">
            <SectionHeader title="Media" />
            <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
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

        {/* 05 — Milestones, Share Profile & Owner Tools (2-Column Section matching Program layout) */}
        <div className="grid grid-cols-1 gap-6 items-start md:grid-cols-2">
          {!!achievements.data?.length && (
            <section
              aria-label="Milestones"
              className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-5"
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

          <ShareLinkCard
            title="Share Profile"
            ariaLabel="Share Profile"
            url={publicUrl}
            shareTitle={shareTitle}
            copiedMessage="Profile link copied"
            inputLabel="Profile link"
          />

          {isOwner && (
            <section
              aria-label="Manage profile and content"
              className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-5 md:col-span-2"
            >
              <SectionHeader title="Manage" className="pb-0" />
              <div className="flex flex-wrap items-center gap-3">
                <Link to="/studio" className="btn btn--outline btn--sm">
                  Creator Studio
                </Link>
                <Link
                  to={`/programs/new?returnTo=${encodeURIComponent(profileUrl)}`}
                  className="btn btn--outline btn--sm"
                >
                  Create Program
                </Link>
                <Link to="/library" className="btn btn--outline btn--sm">
                  My Programs
                </Link>
                <Link to="/media" className="btn btn--outline btn--sm">
                  My Media
                </Link>
                <Link to="/settings" className="btn btn--outline btn--sm">
                  Settings
                </Link>
                <Link
                  to="/settings/follow-requests"
                  className="btn btn--outline btn--sm"
                >
                  Follow Requests
                </Link>
              </div>
            </section>
          )}
        </div>
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

  const request = followReqs.data?.pages
    .flatMap((page) => page.data)
    .find((req) => req.requester.id === requesterId && req.status === 'PENDING')

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
        <Link to="/settings/follow-requests" className="btn btn--outline btn--sm">
          Review requests
        </Link>
      )}
    </div>
  )
}

function OwnerFollowRequestsBadge() {
  const followReqs = useMyFollowRequests()
  const pendingCount =
    followReqs.data?.pages
      .flatMap((page) => page.data)
      .filter((req) => req.status === 'PENDING').length ?? 0

  if (pendingCount === 0) return null

  return (
    <Link
      to="/settings/follow-requests"
      className="btn btn--outline btn--lg gap-2 px-5 font-semibold"
    >
      <Users size={15} className="text-accent" />
      <span>
        {pendingCount} follow {pendingCount === 1 ? 'request' : 'requests'}
      </span>
    </Link>
  )
}
