import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  Layers,
  MoreHorizontal,
  Pencil,
  Play,
  Repeat,
  Share2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EntityHero } from '@/components/EntityHero'
import { MediaViewer } from './MediaViewer'
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
  isPlatform?: boolean
  isOwner?: boolean
  /** Primary action label for the viewer's access state; omitted when there is no action. */
  primaryLabel?: string | null
  backTo?: string
  backLabel?: string
  onPrimary?: () => void
  onDoTogether?: () => void
  onEditProgram?: () => void
  className?: string
}

/**
 * Program Storefront hero (13 §4): artwork, identity, commitment and one primary action.
 * Shows only what the preview API returned; missing values are omitted.
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
  isPlatform = false,
  isOwner = false,
  primaryLabel,
  backTo = '/discover',
  backLabel = 'Browse Programs',
  onPrimary,
  onDoTogether,
  onEditProgram,
  className,
}: ProgramHeroProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [watching, setWatching] = useState(false)

  const handleShare = async () => {
    setMenuOpen(false)
    try {
      if (navigator.share) {
        await navigator.share({ title, url: window.location.href })
      } else {
        await navigator.clipboard.writeText(window.location.href)
        toast.success('Program link copied')
      }
    } catch {
      // Share sheet dismissed or clipboard refused: nothing changed.
    }
  }

  // Image scrims are black/white alpha by design (04-UI §4): they sit on photography in both themes.
  const glass = 'border border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/20'

  return (
    <section
      aria-label={`${title} hero`}
      className={cn(
        'relative w-full overflow-hidden rounded-[var(--radius-panel)] bg-black text-white',
        'min-h-[340px] md:min-h-[380px]',
        className,
      )}
    >
      <div className="absolute inset-0 z-0">
        <EntityHero
          hero={hero}
          size="banner"
          className="absolute inset-0 aspect-auto h-full w-full rounded-none"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      </div>

      <div className="relative z-10 flex min-h-[340px] max-w-4xl flex-col justify-between p-6 sm:p-8 md:min-h-[380px] md:p-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <Link
            to={backTo}
            className="group inline-flex items-center gap-2 text-sm font-medium text-white/75 transition-colors hover:text-white"
          >
            <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
            <span>{backLabel}</span>
          </Link>
          {isOwner && (
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', glass)}>
              <Pencil size={12} />
              Your Program
            </span>
          )}
        </div>

        <div className="my-auto space-y-4">
          <h1
            className="font-display font-bold leading-tight tracking-tight text-white"
            style={{ fontSize: 'var(--type-hero-title)' }}
          >
            {title}
          </h1>

          <div className="flex flex-wrap items-center gap-2.5 text-sm text-white/80">
            {creator ? (
              <Link
                to={buildProfileUrl(creator.handle ?? '')}
                className="inline-flex items-center gap-2 font-medium transition-colors hover:text-white"
              >
                <Avatar
                  src={creator.avatarUrl}
                  name={creator.displayName ?? 'Creator'}
                  size="sm"
                  className="h-5 w-5 ring-1 ring-white/30"
                />
                <span>by {creator.displayName}</span>
              </Link>
            ) : isPlatform ? (
              <span className="font-medium text-white/90">by Program Guru</span>
            ) : null}
            {(creator || isPlatform) && categoryLabel && <span className="text-white/40">·</span>}
            {categoryLabel && (
              <span className={cn('inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold', glass)}>
                {categoryLabel}
              </span>
            )}
          </div>

          {description && (
            <p className="line-clamp-2 max-w-2xl text-sm leading-relaxed text-white/80 md:text-base">
              {description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4 pt-1 text-sm font-medium text-white/80 sm:gap-6">
            <span className="inline-flex items-center gap-2">
              <Calendar size={15} className="text-white/60" />
              {durationDays ? `${durationDays} days` : 'Ongoing'}
            </span>
            {frequencyLabel && (
              <span className="inline-flex items-center gap-2">
                <Repeat size={15} className="text-white/60" />
                {frequencyLabel}
              </span>
            )}
            {activityCount > 0 && (
              <span className="inline-flex items-center gap-2">
                <Layers size={15} className="text-white/60" />
                {activityCount} {activityCount === 1 ? 'activity' : 'activities'}
              </span>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 pt-6">
          {primaryLabel && onPrimary && (
            <Button size="lg" onClick={onPrimary} className="gap-2 px-6 font-semibold">
              <Play size={16} className="translate-x-0.5 fill-current" />
              <span>{primaryLabel}</span>
            </Button>
          )}
          {onDoTogether && (
            <Button
              variant="outline"
              size="lg"
              onClick={onDoTogether}
              className={cn('gap-2 px-5 font-semibold', glass)}
            >
              <Users size={16} />
              <span>Do this together</span>
            </Button>
          )}
          {hero.media?.type === 'VIDEO' && (
            <Button
              variant="outline"
              size="lg"
              onClick={() => setWatching(true)}
              className={cn('gap-2 px-5 font-semibold', glass)}
            >
              <Play size={16} className="fill-current translate-x-0.5" />
              <span>Watch preview</span>
            </Button>
          )}
          {isOwner && onEditProgram && (
            <Button
              variant="outline"
              size="lg"
              onClick={onEditProgram}
              className={cn('gap-2 px-4 font-semibold', glass)}
            >
              <Pencil size={15} />
              <span>Edit Program</span>
            </Button>
          )}
          <div className="relative">
            <button
              type="button"
              aria-label="More options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
              className={cn('flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] transition-colors', glass)}
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute left-0 top-12 z-50 min-w-44 overflow-hidden rounded-[var(--radius-control)] border border-border bg-surface p-1 text-sm text-foreground shadow-xl sm:left-auto sm:right-0">
                  <button
                    type="button"
                    onClick={() => void handleShare()}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left font-medium transition-colors hover:bg-surface-muted"
                  >
                    <Share2 size={14} className="text-muted" />
                    <span>Share Program</span>
                  </button>
                </div>
              </>
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
