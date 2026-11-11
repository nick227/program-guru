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
 * Program Storefront hero (13 §4): cover on the left; kicker, title, summary, creator and real
 * participation on the right, then the one primary action. Nothing is drawn over the media.
 */
export function ProgramHero({
  title,
  description,
  hero,
  categoryLabel,
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
        'grid grid-cols-1 items-start gap-6 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-10',
        className,
      )}
    >
      <EntityHero
        hero={hero}
        size="card"
        interactive={false}
        showVideoBadge={false}
        className="aspect-square w-full max-w-xs rounded-2xl border border-border/50 bg-surface-muted sm:max-w-none"
      />

      <div className="min-w-0 space-y-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              {categoryLabel ? `Program · ${categoryLabel}` : 'Program'}
            </p>
            {isOwner && ownerVisibility && (
              <div className="flex flex-wrap items-center gap-2">
                {ownerVisibility.status !== 'PUBLISHED' && (
                  <span className="rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
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
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60',
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
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          {description && (
            <p className="max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              {description}
            </p>
          )}
        </div>

        {(creator || isPlatform || participantCount != null) && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {creator ? (
              <Link
                to={
                  creatorReturnTo
                    ? `${buildProfileUrl(creator.handle ?? '')}?returnTo=${encodeURIComponent(creatorReturnTo)}`
                    : buildProfileUrl(creator.handle ?? '')
                }
                className="inline-flex items-center gap-2 font-medium text-foreground transition-colors hover:text-accent"
              >
                <Avatar
                  src={creator.avatarUrl}
                  name={creator.displayName ?? 'Creator'}
                  size="sm"
                  className="h-6 w-6"
                />
                <span>{creator.displayName}</span>
              </Link>
            ) : isPlatform ? (
              <span className="font-medium text-muted">Program Guru</span>
            ) : null}
            {participantCount != null && (
              <span className="text-muted">
                <strong className="font-semibold tabular-nums text-foreground">
                  {participantCount.toLocaleString()}
                </strong>{' '}
                {participantCount === 1 ? 'participant' : 'participants'}
              </span>
            )}
          </div>
        )}

        {metaItems.length > 0 && (
          <p className="text-sm text-muted">
            {metaItems.join(' · ')}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-1">
          {primaryLabel && onPrimary && (
            <Button
              size="lg"
              onClick={onPrimary}
              disabled={primaryDisabled}
              loading={primaryLoading}
              className="gap-2 px-7 text-base font-semibold"
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
          {primaryNote}
        </div>

        <div className="flex flex-wrap items-center gap-1 text-sm">
          {hero.media?.type === 'VIDEO' && (
            <Button variant="ghost" size="sm" onClick={() => setWatching(true)} className="gap-1.5 text-muted">
              <Play size={14} className="fill-current" aria-hidden />
              Watch preview
            </Button>
          )}
          {isOwner && onEditProgram && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={editExpanded}
              onClick={onEditProgram}
              className="gap-1.5 text-muted"
            >
              <Pencil size={14} aria-hidden />
              {editLabel}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleShare()}
            className="gap-1.5 text-muted"
          >
            <Share2 size={14} aria-hidden />
            Share
          </Button>
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
