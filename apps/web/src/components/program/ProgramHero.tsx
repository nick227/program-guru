import { formatProgramDuration } from '@/components/program-authoring/programFields'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  Check,
  Layers,
  Pencil,
  Tag,
  Play,
  Repeat,
  Share2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EntityHero } from '@/components/shared/EntityHero'
import { MediaViewer } from '@/components/media/MediaViewer'
import type { Hero } from '@/lib/hero'
import { buildProfileUrl } from '@/lib/urls'
import { cn } from '@/lib/utils'

export interface ProgramHeroProps {
  title: string
  description?: string | null
  /** Identity image, resolved through `programHero` so the fallback chain stays shared. */
  hero: Hero
  durationDays?: number | null
  frequencyLabel?: string | null
  activityCount: number
  categoryLabel?: string | null
  creator?: {
    handle?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  } | null
  creatorReturnTo?: string
  isPlatform?: boolean
  isOwner?: boolean
  statusBadges?: { label: string; tone?: 'default' | 'accent' | 'attention' }[]
  /** Primary action label for the viewer's access state; omitted when there is no action. */
  primaryLabel?: string | null
  backTo?: string
  backLabel?: string
  onPrimary?: () => void
  /** Disables the primary action (in flight, unavailable, or already done this visit). */
  primaryDisabled?: boolean
  primaryLoading?: boolean
  /** Shows a check instead of the play icon, e.g. "Program Added". */
  primaryDone?: boolean
  /** Compact content under the action row, e.g. previous run dates. */
  primaryNote?: ReactNode
  onShare?: () => void
  onDoTogether?: () => void
  onEditProgram?: () => void
  editLabel?: string
  editExpanded?: boolean
  className?: string
}

/**
 * Editorial Program Storefront hero: dominant typography, framed artwork, clear hierarchy.
 */
export function ProgramHero({
  title,
  description,
  hero,
  durationDays,
  frequencyLabel,
  activityCount,
  categoryLabel,
  creator,
  creatorReturnTo,
  isPlatform = false,
  isOwner = false,
  statusBadges,
  primaryLabel,
  backTo,
  backLabel = 'Community',
  onPrimary,
  primaryDisabled = false,
  primaryLoading = false,
  primaryDone = false,
  primaryNote,
  onShare,
  onEditProgram,
  editLabel = 'Edit Program',
  editExpanded,
  className,
}: ProgramHeroProps) {
  const [watching, setWatching] = useState(false)

  const handleShare = async () => {
    if (onShare) {
      onShare()
      return
    }
    try {
      if (navigator.share) {
        await navigator.share({ title, url: window.location.href })
      } else {
        await navigator.clipboard.writeText(window.location.href)
        toast.success('Program link copied')
      }
    } catch {
      // dismissed
    }
  }

  const durationText = formatProgramDuration(durationDays || null)

  return (
    <section
      aria-label={`${title} hero`}
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border border-border bg-surface p-6 sm:p-8 lg:p-10 shadow-sm',
        className,
      )}
    >
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-12">
        {/* Left Column: Dominant Information & Primary Hierarchy */}
        <div className="flex flex-col justify-between space-y-6 lg:col-span-7">
          {(backTo || (statusBadges && statusBadges.length > 0)) && (
            <div className="flex items-center justify-between gap-4">
              {backTo ? (
                <Link
                  to={backTo}
                  className="group inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
                >
                  <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
                  <span>{backLabel}</span>
                </Link>
              ) : (
                <span />
              )}
              {statusBadges && statusBadges.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {statusBadges.map((badge) => (
                    <span
                      key={badge.label}
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        badge.tone === 'accent'
                          ? 'bg-accent/15 text-accent'
                          : badge.tone === 'attention'
                            ? 'bg-attention/15 text-attention'
                            : 'bg-surface-muted text-muted',
                      )}
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {title}
            </h1>

            {creator ? (
              <div className="flex items-center gap-2.5 text-sm text-foreground">
                <Link
                  to={
                    creatorReturnTo
                      ? `${buildProfileUrl(creator.handle ?? '')}?returnTo=${encodeURIComponent(creatorReturnTo)}`
                      : buildProfileUrl(creator.handle ?? '')
                  }
                  className="inline-flex items-center gap-2 font-medium hover:text-accent transition-colors"
                >
                  <Avatar
                    src={creator.avatarUrl}
                    name={creator.displayName ?? 'Creator'}
                    size="sm"
                    className="h-6 w-6 ring-1 ring-border"
                  />
                  <span>by <strong className="font-semibold">{creator.displayName}</strong></span>
                </Link>
              </div>
            ) : isPlatform ? (
              <span className="text-sm font-medium text-muted">by Program Guru</span>
            ) : null}

            {description && (
              <p className="max-w-2xl text-base leading-relaxed text-muted line-clamp-3 sm:text-lg">
                {description}
              </p>
            )}

            {/* Commitments & Specs */}
            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-medium text-muted sm:gap-5 sm:text-sm">
              {categoryLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2.5 py-1 text-foreground">
                  <Tag size={14} className="text-accent" />
                  {categoryLabel}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2.5 py-1 text-foreground">
                <Calendar size={14} className="text-accent" />
                {durationText}
              </span>
              {frequencyLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2.5 py-1 text-foreground">
                  <Repeat size={14} className="text-accent" />
                  {frequencyLabel}
                </span>
              )}
              {activityCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2.5 py-1 text-foreground">
                  <Layers size={14} className="text-accent" />
                  {activityCount} {activityCount === 1 ? 'activity' : 'activities'}
                </span>
              )}
            </div>
          </div>

          {/* Action Hierarchy */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {primaryLabel && onPrimary && (
              <Button
                size="lg"
                onClick={onPrimary}
                disabled={primaryDisabled}
                loading={primaryLoading}
                className="gap-2 px-7 text-base font-bold shadow-md hover:shadow-lg transition-all"
              >
                {!primaryLoading &&
                  (primaryDone ? (
                    <Check size={18} strokeWidth={2.5} aria-hidden />
                  ) : (
                    <Play size={18} className="translate-x-0.5 fill-current" aria-hidden />
                  ))}
                <span>{primaryLabel}</span>
              </Button>
            )}
            {hero.media?.type === 'VIDEO' && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => setWatching(true)}
                className="gap-2 px-5 font-semibold"
              >
                <Play size={16} className="fill-current translate-x-0.5" />
                <span>Watch preview</span>
              </Button>
            )}
            {isOwner && onEditProgram && (
              <Button
                variant={editExpanded ? 'default' : 'outline'}
                size="lg"
                aria-expanded={editExpanded}
                onClick={onEditProgram}
                className="gap-2 px-5 font-semibold"
              >
                <Pencil size={15} />
                <span>{editLabel}</span>
              </Button>
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
          {primaryNote}
        </div>

        {/* Right Column: Clean Framed Artwork */}
        <div className="lg:col-span-5">
          <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] lg:aspect-[4/3] overflow-hidden rounded-xl border border-border bg-surface-muted shadow-md group">
            <EntityHero
              hero={hero}
              size="card"
              className="h-full w-full rounded-none"
            />
            {hero.media?.type === 'VIDEO' && (
              <button
                type="button"
                aria-label="Play preview video"
                onClick={() => setWatching(true)}
                className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px] transition-opacity group-hover:bg-black/40"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform group-hover:scale-110">
                  <Play size={24} className="translate-x-0.5 fill-current" />
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {watching && hero.media && (
        <MediaViewer
          items={[
            {
              id: hero.media.id,
              url: hero.media.playbackUrl ?? hero.src ?? '',
              type: 'VIDEO',
              alt: `${title} preview`,
              credit: creator?.displayName ?? undefined,
            },
          ]}
          index={0}
          onIndex={() => {}}
          onClose={() => setWatching(false)}
        />
      )}
    </section>
  )
}
