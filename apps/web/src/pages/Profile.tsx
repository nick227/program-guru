import { Link, useParams } from 'react-router-dom'
import {
  useCurrentUser,
  useFollowUser,
  useUnfollowUser,
  useUserActivities,
  useUserByHandle,
  useUserPrograms,
  useUserPublications,
} from '@project/sdk'
import { Page, Stage, Stack, Row, Panel, Grid } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { ThumbnailGrid } from '@/components/ThumbnailGrid'
import { Back, linkButton } from '@/components/Navigation'
import { useOnline } from '@/lib/useOnline'

export function ProfilePage() {
  const { handle = '' } = useParams()
  const me = useCurrentUser()
  const profile = useUserByHandle(handle)
  const programs = useUserPrograms(handle)
  const activities = useUserActivities(handle)
  const publications = useUserPublications(handle)
  const follow = useFollowUser(handle)
  const unfollow = useUnfollowUser(handle)
  const online = useOnline()
  const p = profile.data
  if (!p)
    return (
      <Page>
        <Stage>
          <Back to="/">Calendar</Back>
          <ErrorMessage
            error={profile.error}
            retry={() => void profile.refetch()}
          />
          {profile.isPending && <Loading />}
        </Stage>
      </Page>
    )
  const isOwner = me.data?.data.profile.handle === p.handle
  const programRows =
    programs.data?.pages.flatMap((page) => page.data).slice(0, 6) ?? []
  const activityRows =
    activities.data?.pages.flatMap((page) => page.data).slice(0, 8) ?? []
  const mediaRows =
    publications.data?.pages.flatMap((page) => page.data).slice(0, 12) ?? []
  return (
    <Page>
      <Stage className="max-w-2xl">
        <Back to="/">Calendar</Back>
        <div className="overflow-hidden rounded-xl border bg-surface">
          <div
            className="h-36 bg-surface-muted bg-cover bg-center"
            style={
              p.coverUrl
                ? { backgroundImage: `url(${p.coverUrl})` }
                : undefined
            }
          />
          <Stack className="gap-4 p-4 sm:p-6">
            <Row className="justify-between">
              <Row>
                <Avatar
                  src={p.avatarUrl}
                  name={p.displayName}
                  size="lg"
                  className="-mt-12 ring-4 ring-surface"
                />
                <div>
                  <h1>{p.displayName}</h1>
                  <p className="text-muted">@{p.handle}</p>
                </div>
              </Row>
              {isOwner ? (
                <Link to="/settings" className={linkButton}>
                  Edit
                </Link>
              ) : (
                <Button
                  disabled={!online || follow.isPending || unfollow.isPending}
                  loading={follow.isPending || unfollow.isPending}
                  variant={
                    p.relationship === 'NONE' ||
                    p.relationship === 'INCOMING_REQUEST'
                      ? 'default'
                      : 'outline'
                  }
                  onClick={() =>
                    p.relationship === 'FOLLOWING' ||
                    p.relationship === 'REQUESTED'
                      ? unfollow.mutate(p.id)
                      : follow.mutate(p.id)
                  }
                >
                  {p.relationship === 'FOLLOWING'
                    ? 'Following'
                    : p.relationship === 'REQUESTED'
                      ? 'Requested'
                      : 'Follow'}
                </Button>
              )}
            </Row>
            {p.bio && <p>{p.bio}</p>}
            {!!p.focusChips?.length && (
              <Row>
                {p.focusChips.slice(0, 3).map((chip) => (
                  <span
                    key={chip.id}
                    className="rounded-md border px-2 py-1 text-xs text-muted"
                  >
                    {chip.label}
                  </span>
                ))}
              </Row>
            )}
            <p className="text-xs text-muted">
              {p.publicProgramCount} Programs · {p.followerCount} followers
            </p>
            <ErrorMessage error={follow.error || unfollow.error} />
          </Stack>
        </div>
        {programRows.length > 0 && (
          <Panel>
            <Stack>
              <h2>Programs</h2>
              <Grid className="grid-cols-1 sm:grid-cols-2">
                {programRows.map((program) => (
                  <Link
                    key={program.id}
                    to={`/programs/${program.id}?returnTo=${encodeURIComponent(`/${handle}`)}`}
                    className="rounded-lg border p-3 transition-colors hover:border-accent"
                  >
                    {program.coverUrl && (
                      <img
                        src={program.coverUrl}
                        alt=""
                        className="mb-3 aspect-video w-full rounded-md object-cover"
                      />
                    )}
                    <strong>{program.title}</strong>
                    <p className="mt-2 text-xs text-muted">
                      {program.frequencyLabel}
                      {program.durationDays
                        ? ` · ${program.durationDays} days`
                        : ''}{' '}
                      · {program.accessMode === 'OPEN' ? 'Free' : 'Access'}
                    </p>
                  </Link>
                ))}
              </Grid>
            </Stack>
          </Panel>
        )}
        {activityRows.length > 0 && (
          <Panel>
            <Stack>
              <h2>Activities</h2>
              {activityRows.map((a) => (
                <Link
                  key={a.id}
                  to={`/activities/${a.id}?returnTo=${encodeURIComponent(`/${handle}`)}`}
                  className="rounded-lg border p-3 hover:border-accent"
                >
                  <strong>{a.title}</strong>
                  <p className="mt-1 text-xs text-muted">
                    {a.instructionCount} instructions · {a.mediaCount} media
                  </p>
                </Link>
              ))}
            </Stack>
          </Panel>
        )}
        {mediaRows.length > 0 && (
          <Panel>
            <Stack>
              <h2>Media</h2>
              <ThumbnailGrid
                items={mediaRows.map((m) => ({
                  id: m.id,
                  thumbnailUrl: m.thumbnailUrl,
                  type: m.type,
                  alt: m.alt,
                }))}
              />
            </Stack>
          </Panel>
        )}
        {isOwner && (
          <Panel>
            <Stack>
              <h2>Manage</h2>
              <Link to="/programs/new" className={linkButton}>
                Create Program
              </Link>
              <Link to="/library" className={linkButton}>
                My Programs
              </Link>
              <Link to="/media" className={linkButton}>
                My Media
              </Link>
              <Link to="/settings" className={linkButton}>
                Settings
              </Link>
            </Stack>
          </Panel>
        )}
      </Stage>
    </Page>
  )
}
