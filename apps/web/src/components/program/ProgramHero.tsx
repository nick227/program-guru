import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, Globe, Link2, Lock, Pencil, Play, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EntityHero } from '@/components/shared/EntityHero'
import { MediaViewer } from '@/components/media/MediaViewer'
import {
  PROGRAM_VISIBILITIES,
  programVisibilityLabel,
  type ProgramVisibility,
} from '@/components/program-authoring/programFields'
import type { Hero } from '@/lib/hero'
import { buildProfileUrl } from '@/lib/urls'
import { cn } from '@/lib/utils'

export interface ProgramHeroProps {
  title: string
  description?: string | null
  /** Identity image, resolved through `programHero` so the fallback chain stays shared. */
  hero: Hero
  categoryLabel?: string | null
  categoryHref?: string | null
  creator?: {
    handle?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  } | null
  creatorReturnTo?: string
  isPlatform?: boolean
  isOwner?: boolean
  /** Real participant count; omitted (null) below the public sample size. Never estimated. */
  participantCount?: number | null
  /** Compact plain-text metadata items (e.g. duration, frequency, activity count). */
  metadata?: (string | null | undefined)[]
  /** Primary action label for the viewer's access state; omitted when there is no action. */
  primaryLabel?: string | null
  onPrimary?: () => void
  /** Disables the primary action (in flight, unavailable, or already done this visit). */
  primaryDisabled?: boolean
  primaryLoading?: boolean
  /** Shows a check instead of the play icon, e.g. "Program Added". */
  primaryDone?: boolean
  /** Compact content beside the primary action, e.g. previous run dates. */
  primaryNote?: ReactNode
  /** One secondary action right after the primary, e.g. Add to Schedule (13 §4). */
  secondaryAction?: ReactNode
  /** Canonical link to share; defaults to the current page. */
  shareUrl?: string
  onShare?: () => void
  onEditProgram?: () => void
  editLabel?: string
  editExpanded?: boolean
  ownerVisibility?: {
    value: ProgramVisibility
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
    pending?: boolean
    disabled?: boolean
    onChange: (next: ProgramVisibility) => void
  }
  className?: string
}

/**
 * Clean, spacious Program Hero with consistent editorial hierarchy:
 * 1. Category kicker
 * 2. Bold title
 * 3. Creator attribution + structured specs line
 * 4. Readable description
 * 5. Dominant primary CTAs
 * 6. Quiet past runs note
 * 7. Dedicated owner & utility toolbar along bottom hairline
 */
export function ProgramHero({
  title,
  description,
  hero,
  categoryLabel,
  categoryHref,
  creator,
  creatorReturnTo,
  isPlatform = false,
  isOwner = false,
  participantCount,
  metadata,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryLoading = false,
  primaryDone = false,
  primaryNote,
  secondaryAction,
  shareUrl,
  onShare,
  onEditProgram,
  editLabel = 'Edit Program',
  editExpanded,
  ownerVisibility,
  className,
}: ProgramHeroProps) {
  const [watching, setWatching] = useState(false)
  const metaItems = (metadata ?? []).filter((item): item is string => Boolean(item && item.trim()))

  const handleShare = async () => {
    if (onShare) {
      onShare()
      return
    }
    try {
      if (navigator.share) {
        await navigator.share({ title, url: shareUrl ?? window.location.href })
      } else {
        await navigator.clipboard.writeText(shareUrl ?? window.location.href)
        toast.success('Program link copied')
      }
    } catch {
      // dismissed
    }
  }

  return (
    <section
      aria-label={`${title} hero`}
      className={cn(
        'grid grid-cols-1 items-start gap-8 sm:grid-cols-[18rem_minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-12',
        className,
      )}
    >
      <EntityHero
        hero={hero}
        size="card"
        interactive={false}
        showVideoBadge={false}
        className="aspect-[4/3] w-full max-w-none rounded-2xl border border-border/60 bg-surface-muted overflow-hidden shadow-xs"
      />

      <div className="min-w-0 space-y-5">
        <div className="space-y-2.5">
          {/* Category Kicker */}
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            {categoryHref ? (
              <Link to={categoryHref} className="transition-opacity hover:opacity-80">
                {categoryLabel ? `Program · ${categoryLabel}` : 'Program'}
              </Link>
            ) : (
              <span>{categoryLabel ? `Program · ${categoryLabel}` : 'Program'}</span>
            )}
          </p>

          {/* Title */}
          <h1 className="font-display text-3xl font-bold leading-[1.08] tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {title}
          </h1>

          {/* Subtitle / Description */}
          {description && (
            <p className="max-w-2xl text-base sm:text-lg leading-relaxed text-muted">
              {description}
            </p>
          )}

          {/* Attribution & Core Specs Line */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted pt-1">
            {creator ? (
              <Link
                to={
                  creatorReturnTo
                    ? `${buildProfileUrl(creator.handle ?? '')}?returnTo=${encodeURIComponent(creatorReturnTo)}`
                    : buildProfileUrl(creator.handle ?? '')
                }
                className="inline-flex items-center gap-1.5 font-medium text-foreground transition-colors hover:text-accent"
              >
                <Avatar
                  src={creator.avatarUrl}
                  name={creator.displayName ?? 'Creator'}
                  size="sm"
                  className="h-5 w-5"
                />
                <span>{creator.displayName}</span>
              </Link>
            ) : isPlatform ? (
              <span className="font-medium text-muted">Program Guru</span>
            ) : null}

            {metaItems.map((item, idx) => (
              <span key={idx} className="inline-flex items-center gap-2">
                <span className="text-muted/40" aria-hidden>·</span>
                <span>{item}</span>
              </span>
            ))}

            {participantCount != null && (
              <span className="inline-flex items-center gap-2">
                <span className="text-muted/40" aria-hidden>·</span>
                <span>
                  <strong className="font-semibold tabular-nums text-foreground">
                    {participantCount.toLocaleString()}
                  </strong>{' '}
                  {participantCount === 1 ? 'participant' : 'participants'}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Action Row */}
        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap items-center gap-3">
            {primaryLabel && onPrimary && (
              <Button
                size="lg"
                onClick={onPrimary}
                disabled={primaryDisabled}
                loading={primaryLoading}
                className="w-full gap-2 px-7 text-base font-semibold sm:w-auto"
              >
                {!primaryLoading &&
                  (primaryDone ? (
                    <Check size={18} strokeWidth={2.5} aria-hidden />
                  ) : (
                    <Play size={16} className="translate-x-0.5 fill-current" aria-hidden />
                  ))}
                <span>{primaryLabel}</span>
              </Button>
            )}
            {secondaryAction}
          </div>

          {/* Previous runs / note */}
          {primaryNote && (
            <div className="pt-0.5 text-xs">
              {primaryNote}
            </div>
          )}
        </div>

        {/* Contextual Owner & Utility Toolbar along subtle bottom separator */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/50 pt-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {hero.media?.type === 'VIDEO' && (
              <Button variant="ghost" size="sm" onClick={() => setWatching(true)} className="gap-1.5 text-muted">
                <Play size={14} className="fill-current" aria-hidden />
                Watch preview
              </Button>
            )}
            {isOwner && onEditProgram && (
              <Button
                variant="outline"
                size="sm"
                aria-expanded={editExpanded}
                onClick={onEditProgram}
                className="gap-1.5"
              >
                <Pencil size={14} aria-hidden />
                {editLabel}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleShare()}
              className="gap-1.5 text-muted hover:text-foreground"
            >
              <Share2 size={14} aria-hidden />
              Share
            </Button>
          </div>

          {/* Owner Visibility Segmented Control */}
          {isOwner && ownerVisibility && (
            <div className="flex items-center gap-2">
              {ownerVisibility.status !== 'PUBLISHED' && (
                <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {ownerVisibility.status === 'DRAFT' ? 'Draft' : 'Archived'}
                </span>
              )}
              <div
                role="group"
                aria-label="Program visibility"
                className="inline-flex items-center rounded-full border border-border/80 bg-surface p-0.5"
              >
                {PROGRAM_VISIBILITIES.map((v) => {
                  const active = ownerVisibility.value === v
                  const Icon = v === 'PUBLIC' ? Globe : v === 'UNLISTED' ? Link2 : Lock
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={active}
                      disabled={ownerVisibility.disabled || ownerVisibility.pending}
                      onClick={() => {
                        if (!active) ownerVisibility.onChange(v)
                      }}
                      className={cn(
                        'inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60',
                        active
                          ? 'bg-accent text-accent-foreground shadow-sm'
                          : 'text-muted hover:text-foreground',
                      )}
                    >
                      <Icon size={12} aria-hidden />
                      <span>{programVisibilityLabel(v)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
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
