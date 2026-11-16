import {
  formatProgramDuration,
  programPublishInput,
  programVisibilityLabel,
  type ProgramVisibility,
} from '@/components/program-authoring/programFields'
import { ProgramVisibilityButtons, PublishCheckIssues } from '@/components/program-authoring/PublishControls'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  useCurrentUser,
  useJoinProgram,
  useMyEnrollments,
  usePublishCheck,
  usePublishProgram,
} from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { Avatar } from '@/components/ui/Avatar'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import { programHero, activityHero } from '@/lib/hero'
import { today } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
import { buildProgramUrl, toAbsoluteUrl } from '@/lib/urls'
import { formatDurationMinutes } from '@/lib/durationMinutes'
import { formatTargetTime } from '@/lib/targetTime'
import { ShareLinkField } from '@/components/social/ShareLink'
import type { Workspace } from '@/components/program-authoring/types'
import { cn } from '@/lib/utils'
import {
  BarChart3,
  Calendar,
  CalendarDays,
  Clock,
  FileText,
  Globe,
  Layers,
  Link2,
  Lock,
  Repeat,
  ShieldCheck,
  Sparkles,
  Tag,
  Target,
  Timer,
  Video,
} from 'lucide-react'

function formatProgramLevel(level?: string | null) {
  if (!level) return null
  switch (level) {
    case 'ALL_LEVELS':
      return 'All Levels'
    case 'BEGINNER':
      return 'Beginner'
    case 'INTERMEDIATE':
      return 'Intermediate'
    case 'ADVANCED':
      return 'Advanced'
    default:
      return level.replace(/_/g, ' ')
  }
}

function formatAccessMode(mode?: string | null) {
  switch (mode) {
    case 'OPEN':
      return 'Open Access'
    case 'INVITE_ONLY':
      return 'Invite Only'
    case 'APPROVAL':
      return 'Approval Required'
    case 'PAID':
      return 'Paid'
    default:
      return mode ?? 'Open Access'
  }
}

export function PublishStep({
  ws,
  onBack,
  onPublished,
}: {
  ws: Workspace
  onBack: () => void
  /** Instead of opening the Program page after publishing (Home's builder). */
  onPublished?: () => void
}) {
  const check = usePublishCheck(ws.id)
  const publish = usePublishProgram(ws.id)
  const join = useJoinProgram(ws.id)
  const me = useCurrentUser()
  const enrollments = useMyEnrollments()
  const online = useOnline()
  const navigate = useNavigate()
  const categorySlugOf = useCategorySlugOf()
  const [visibility, setVisibility] = useState<ProgramVisibility>(
    ws.visibility === 'PRIVATE' ? 'PUBLIC' : ws.visibility,
  )
  const [startNow, setStartNow] = useState(true)

  const isEnrolled = !!enrollments.data?.pages
    .flatMap((page) => page.data)
    .find((entry) => entry.program.id === ws.id && ['ACTIVE', 'PAUSED'].includes(entry.status))

  const tz =
    me.data?.data.preferences.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone

  const isDraft = ws.status !== 'PUBLISHED'
  const shareUrl = toAbsoluteUrl(buildProgramUrl({ id: ws.id, title: ws.title }))
  const hero = programHero(ws, categorySlugOf)

  const totalPlacements =
    ws.placements ??
    ws.activities.reduce((acc, a) => acc + (a.placementCount || 0), 0)

  const priceSummary =
    ws.accessMode === 'PAID' && ws.prices?.length > 0
      ? ws.prices
          .slice(0, 1)
          .map((price) => {
            const formatted = new Intl.NumberFormat(undefined, {
              style: 'currency',
              currency: price.currency || 'USD',
            }).format(price.amountMinor / 100)
            return price.kind === 'MONTHLY' ? `${formatted}/mo` : formatted
          })[0]
      : null

  const handlePublish = async () => {
    try {
      const published = await publish.mutateAsync(programPublishInput(ws, visibility))

      if (startNow && !isEnrolled) {
        const versionId =
          published.latestPublishedVersionId ?? ws.latestPublishedVersionId
        if (versionId) {
          try {
            await join.mutateAsync({
              programVersionId: versionId,
              startLocalDate: today(tz),
              timezone: tz,
              idempotencyKey: crypto.randomUUID(),
            })
          } catch {
            /* publish still succeeded even if calendar join errored */
          }
        }
      }

      toast.success(
        startNow && !isEnrolled
          ? 'Program published and added to your calendar'
          : 'Program published',
      )
      if (onPublished) onPublished()
      else navigate(buildProgramUrl({ id: ws.id, title: ws.title }))
    } catch {
      /* show validation */
    }
  }

  return (
    <Stack className="gap-8">
      {/* 1. Large & Bold Program Showcase Hero Card */}
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-sm">
        {/* Prominent Hero Image & Overlay */}
        <div className="relative aspect-[16/9] sm:aspect-[2.4/1] w-full min-h-[14rem] sm:min-h-[18rem] bg-surface-muted overflow-hidden">
          <EntityHero
            hero={hero}
            size="banner"
            interactive={false}
            showVideoBadge={false}
            className="!aspect-auto h-full w-full object-cover rounded-none"
          />
          {/* Subtle dark gradient overlay for optimal legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/20" />

          {/* Floating Badges */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-black/60 text-white backdrop-blur-md border border-white/15">
              <Sparkles size={12} className="text-accent" />
              {ws.type.label}
            </span>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md border',
                  ws.status === 'PUBLISHED'
                    ? 'bg-emerald-500/25 text-emerald-200 border-emerald-500/40'
                    : 'bg-amber-500/25 text-amber-200 border-amber-500/40',
                )}
              >
                {ws.status === 'PUBLISHED' ? 'Published' : 'Draft'}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-black/50 text-white/90 backdrop-blur-md border border-white/15">
                {visibility === 'PUBLIC' && <Globe size={11} />}
                {visibility === 'UNLISTED' && <Link2 size={11} />}
                {visibility === 'PRIVATE' && <Lock size={11} />}
                {programVisibilityLabel(visibility)}
              </span>
            </div>
          </div>

          {/* Large, Bold Program Title & Creator on image overlay */}
          <div className="absolute bottom-5 left-5 right-5 text-white">
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight drop-shadow-sm">
              {ws.title || 'Untitled Program'}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 text-xs sm:text-sm text-white/90">
              {ws.creator && (
                <div className="flex items-center gap-2">
                  <Avatar
                    src={ws.creator.avatarUrl}
                    name={ws.creator.displayName ?? 'Creator'}
                    size="sm"
                    className="h-5 w-5 ring-1 ring-white/30"
                  />
                  <span className="font-medium text-white">{ws.creator.displayName}</span>
                </div>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={13} className="text-white/70" />
                {formatProgramDuration(ws.durationDays)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Layers size={13} className="text-white/70" />
                {ws.activities.length} {ws.activities.length === 1 ? 'Activity' : 'Activities'}
              </span>
              {totalPlacements > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={13} className="text-white/70" />
                  {totalPlacements} Sessions
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Program Specifications & Full Metadata */}
        <div className="p-5 sm:p-6 space-y-6">
          {/* Description */}
          {ws.description ? (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                About this Program
              </h4>
              <p className="text-sm sm:text-base text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {ws.description}
              </p>
            </div>
          ) : (
            <p className="text-sm italic text-muted">No description provided yet.</p>
          )}

          {/* Everything we know about the Program: Specs Grid */}
          <div className="space-y-3 pt-3 border-t border-border">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Program Details & Overview
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Duration */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-muted/60 border border-border/50">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Calendar size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Duration
                  </div>
                  <div className="text-sm font-bold text-foreground truncate">
                    {formatProgramDuration(ws.durationDays)}
                  </div>
                </div>
              </div>

              {/* Total Activities */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-muted/60 border border-border/50">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Layers size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Activities
                  </div>
                  <div className="text-sm font-bold text-foreground truncate">
                    {ws.activities.length} {ws.activities.length === 1 ? 'Activity' : 'Activities'}
                  </div>
                </div>
              </div>

              {/* Schedule / Frequency */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-muted/60 border border-border/50">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Repeat size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Frequency
                  </div>
                  <div className="text-sm font-bold text-foreground truncate">
                    {ws.frequencyLabel || 'As scheduled'}
                  </div>
                </div>
              </div>

              {/* Total Placements */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-muted/60 border border-border/50">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <CalendarDays size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Total Sessions
                  </div>
                  <div className="text-sm font-bold text-foreground truncate">
                    {totalPlacements} {totalPlacements === 1 ? 'Session' : 'Sessions'}
                  </div>
                </div>
              </div>

              {/* Focus (if set) */}
              {ws.focus && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-muted/60 border border-border/50">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Target size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                      Focus
                    </div>
                    <div className="text-sm font-bold text-foreground truncate">
                      {ws.focus.label}
                    </div>
                  </div>
                </div>
              )}

              {/* Level */}
              {ws.level && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-muted/60 border border-border/50">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <BarChart3 size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                      Level
                    </div>
                    <div className="text-sm font-bold text-foreground truncate">
                      {formatProgramLevel(ws.level)}
                    </div>
                  </div>
                </div>
              )}

              {/* Session Duration */}
              {ws.sessionMinutes && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-muted/60 border border-border/50">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Timer size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                      Session Time
                    </div>
                    <div className="text-sm font-bold text-foreground truncate">
                      {ws.sessionMinutes} mins
                    </div>
                  </div>
                </div>
              )}

              {/* Total Instructions */}
              {ws.instructionCount > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-muted/60 border border-border/50">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                      Instructions
                    </div>
                    <div className="text-sm font-bold text-foreground truncate">
                      {ws.instructionCount} {ws.instructionCount === 1 ? 'step' : 'steps'}
                    </div>
                  </div>
                </div>
              )}

              {/* Access Mode */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-muted/60 border border-border/50">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <ShieldCheck size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Access
                  </div>
                  <div className="text-sm font-bold text-foreground truncate">
                    {priceSummary || formatAccessMode(ws.accessMode)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tags */}
          {ws.tags && ws.tags.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="text-xs font-semibold text-muted uppercase tracking-wider">Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {ws.tags.map((t) => (
                  <span
                    key={t.id || t.slug}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-surface-muted text-foreground border border-border/60"
                  >
                    <Tag size={10} className="text-muted" />
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. All Activity Data Section */}
      <Panel className="rounded-xl border border-border/80 bg-surface p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-border">
          <div className="flex items-center gap-2.5">
            <h3 className="font-display text-lg font-bold text-foreground">Program Activities</h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-accent/15 text-accent">
              {ws.activities.length}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs font-semibold"
            onClick={onBack}
          >
            Edit Activities
          </Button>
        </div>

        {ws.activities.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {ws.activities.map((act, index) => {
              const actHero = activityHero(
                {
                  title: act.title,
                  categoryId: ws.type.categoryId,
                },
                categorySlugOf,
              )
              return (
                <div
                  key={act.activityId}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/70 bg-surface-muted/40 hover:bg-surface-muted/70 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface border border-border text-xs font-bold text-muted">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <EntityHero
                      hero={actHero}
                      size="row"
                      interactive={false}
                      className="h-14 w-16 sm:w-20 shrink-0 rounded-lg overflow-hidden border border-border/60 object-cover"
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <h4 className="font-display font-bold text-base text-foreground truncate">
                        {act.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span className="inline-flex items-center gap-1 font-semibold text-accent">
                          <Repeat size={12} />
                          {act.frequencyLabel}
                        </span>
                        {act.durationMinutes && (
                          <span className="inline-flex items-center gap-1">
                            <Clock size={12} />
                            {formatDurationMinutes(act.durationMinutes)}
                          </span>
                        )}
                        {act.targetTime && (
                          <span className="inline-flex items-center gap-1">
                            <Timer size={12} />
                            {formatTargetTime(act.targetTime)}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={12} />
                          {act.placementCount} {act.placementCount === 1 ? 'session' : 'sessions'}
                        </span>
                        {act.instructionCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <FileText size={12} />
                            {act.instructionCount} {act.instructionCount === 1 ? 'step' : 'steps'}
                          </span>
                        )}
                        {act.mediaCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Video size={12} />
                            {act.mediaCount} media
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Metrics Tracked */}
                  {act.metrics && act.metrics.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap self-end sm:self-center shrink-0">
                      <span className="text-[11px] font-medium text-muted">Track:</span>
                      {act.metrics.map((metric) => (
                        <span
                          key={metric}
                          className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-surface border border-border text-foreground"
                        >
                          {metric}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8 rounded-xl border border-dashed border-border p-6 space-y-2">
            <p className="text-sm font-semibold text-foreground">No activities added yet</p>
            <p className="text-xs text-muted max-w-sm mx-auto">
              Programs need at least one activity before they can be published.
            </p>
            <Button size="sm" className="mt-2 font-semibold" onClick={onBack}>
              Go to Activities
            </Button>
          </div>
        )}
      </Panel>

      {/* 3. Visibility & Share Link Section */}
      <Panel className="rounded-xl border border-border/80 bg-surface p-5 sm:p-6 space-y-5">
        <div className="space-y-1">
          <h3 className="font-display text-lg font-bold text-foreground">Publishing & Sharing</h3>
          <p className="text-xs text-muted">
            Configure how your program appears in public listings and preview its share link.
          </p>
        </div>

        {/* Visibility Controls */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted">
            Program Visibility
          </label>
          <ProgramVisibilityButtons
            value={visibility}
            onChange={setVisibility}
            buttonClassName="h-9 px-4 font-semibold"
          />
          <p className="text-xs text-muted">
            {visibility === 'PUBLIC'
              ? 'Public: Discoverable by everyone in Search, Browse, and on your profile.'
              : visibility === 'UNLISTED'
                ? 'Link only: Anyone with the direct link can view and join, but it will not appear in public search.'
                : 'Private: Only visible to you. Nobody else can access or join.'}
          </p>
        </div>

        {/* Share Link Preview (Disabled until publish) */}
        <div className="pt-4 border-t border-border space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Share Link
            </span>
            {isDraft ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                <Lock size={11} /> Preview · Active after publish
              </span>
            ) : visibility === 'PRIVATE' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-surface-muted text-muted border border-border">
                <Lock size={11} /> Disabled (Private Program)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                <Globe size={11} /> Active Link
              </span>
            )}
          </div>

          <ShareLinkField
            url={shareUrl}
            shareTitle={ws.title}
            copiedMessage="Program link copied"
            inputLabel="Program link"
            disabled={isDraft || visibility === 'PRIVATE'}
          />

          {isDraft ? (
            <p className="text-xs text-muted">
              This link is reserved for your program. It will be enabled for sharing and copying immediately once published.
            </p>
          ) : visibility === 'PRIVATE' ? (
            <p className="text-xs text-muted">
              Private programs cannot be shared with other users. To enable sharing, change visibility to Public or Link only.
            </p>
          ) : null}
        </div>

        <PublishCheckIssues check={check} error={publish.error} />
      </Panel>

      {/* Consistent Bottom Navigation */}
      <Row className="justify-between items-center pt-6 mt-4 border-t border-border">
        <Button
          variant="outline"
          size="lg"
          className="h-11 px-6 font-semibold"
          onClick={onBack}
        >
          Back
        </Button>
        <Row className="items-center gap-4">
          {!isEnrolled && (
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-foreground select-none">
              <input
                type="checkbox"
                checked={startNow}
                onChange={(e) => setStartNow(e.target.checked)}
                className="h-4 w-4 rounded text-accent focus:ring-accent accent-accent cursor-pointer"
              />
              <span>Start now</span>
            </label>
          )}
          <Button
            size="lg"
            className="h-11 px-8 font-semibold"
            disabled={
              !online ||
              !check.data?.canPublish ||
              publish.isPending ||
              join.isPending
            }
            loading={publish.isPending || join.isPending}
            onClick={handlePublish}
          >
            {ws.status === 'PUBLISHED' ? 'Publish Update' : 'Publish Program'}
          </Button>
        </Row>
      </Row>
    </Stack>
  )
}
