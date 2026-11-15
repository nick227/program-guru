import { useEffect, useRef, type PointerEvent } from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight, MapPin, UserPlus } from 'lucide-react'
import type { components } from '@project/sdk'
import { EntityHero } from '@/components/shared/EntityHero'
import { Avatar } from '@/components/ui/Avatar'
import { Skeleton } from '@/components/ui/Skeleton'
import { gatheringWhen } from '@/components/activity/ActivityGatherings'
import { formatDurationMinutes } from '@/lib/durationMinutes'
import { activityHero, type CategorySlugOf } from '@/lib/hero'
import { peopleLine, stepIndex, swipeStep, type SurferCard } from '../engine/surferDeck'

type UserSummary = components['schemas']['UserSummary']

interface ActivitySurferProps {
  deck: SurferCard[]
  index: number
  loading: boolean
  /** Arrow keys apply only while the surfer is the page's focus (no preview, no form field). */
  keyboardActive: boolean
  categorySlugOf: CategorySlugOf
  viewerId: string | null
  followedIds: ReadonlySet<string>
  followPending: boolean
  onIndexChange: (index: number) => void
  onParticipate: (card: SurferCard) => void
  onSchedule: (card: SurferCard) => void
  onOpenCreator: (handle: string) => void
  onFollow: (user: UserSummary) => void
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

/**
 * Home's Activity surfer (03-UX §2a): one media-led Activity at a time. Next/Previous only change local
 * state; Participate opens the focused preview. People appear only from a real gathering.
 */
export function ActivitySurfer({
  deck,
  index,
  loading,
  keyboardActive,
  categorySlugOf,
  viewerId,
  followedIds,
  followPending,
  onIndexChange,
  onParticipate,
  onSchedule,
  onOpenCreator,
  onFollow,
}: ActivitySurferProps) {
  const card = deck[index] ?? null
  const start = useRef<{ x: number; y: number } | null>(null)
  // A swipe that ends on the media button must not also open the preview.
  const swiped = useRef(false)
  const go = (delta: number) => {
    const next = stepIndex(index, delta, deck.length)
    if (next !== index) onIndexChange(next)
  }
  const goRef = useRef(go)
  goRef.current = go

  useEffect(() => {
    if (!keyboardActive) return
    const onKey = (e: KeyboardEvent) => {
      // Never under a modal (Add to Schedule, Report) or while typing.
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || isTyping(e.target) || document.querySelector('dialog[open]')) return
      if (e.key === 'ArrowRight') goRef.current(1)
      else if (e.key === 'ArrowLeft') goRef.current(-1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyboardActive])

  // Warm the neighbours' images so Next feels instant.
  useEffect(() => {
    for (const i of [index + 1, index + 2, index - 1]) {
      const src = deck[i] ? activityHero(deck[i]!.activity, categorySlugOf).src : null
      if (src) new Image().src = src
    }
  }, [deck, index, categorySlugOf])

  if (loading && !card) {
    return (
      <section aria-label="Activities" className="mx-auto w-full max-w-5xl px-4 sm:px-6" role="status">
        <Skeleton className="aspect-[4/3] w-full rounded-[var(--radius-panel)] sm:aspect-[16/9]" />
      </section>
    )
  }
  if (!card) return null

  const { activity, gathering } = card
  const hero = activityHero(activity, categorySlugOf)
  const people = peopleLine(gathering)
  const place = gathering?.place ?? null
  const creator = activity.creator
  const canFollow = !!viewerId && !!creator && creator.id !== viewerId && !followedIds.has(creator.id)
  const meta = [formatDurationMinutes(activity.durationMinutes), !gathering && activity.place ? `${activity.place.name}, ${activity.place.locality}` : null]
    .filter(Boolean)
    .join(' · ')

  const onPointerDown = (e: PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: PointerEvent) => {
    const s = start.current
    start.current = null
    const step = s ? swipeStep(e.clientX - s.x, e.clientY - s.y) : 0
    swiped.current = step !== 0
    if (step) go(step)
  }

  return (
    <section
      aria-label="Activities"
      aria-roledescription="carousel"
      className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 sm:px-6 mt-28"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted">Activities</h2>
        <p className="text-xs tabular-nums text-muted" aria-live="polite">
          {index + 1} of {deck.length}
        </p>
      </div>

      <div
        key={activity.id}
        aria-roledescription="slide"
        aria-label={activity.title}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (start.current = null)}
        // Native image drag would cancel a mouse swipe.
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={(e) => {
          if (!swiped.current) return
          swiped.current = false
          e.preventDefault()
          e.stopPropagation()
        }}
        className="flex touch-pan-y select-none flex-col overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface animate-in fade-in duration-150"
      >
        <button
          type="button"
          onClick={() => onParticipate(card)}
          aria-label={`Preview ${activity.title}`}
          className="relative block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <EntityHero hero={hero} size="banner" interactive={false} className="aspect-[4/3] w-full rounded-none sm:aspect-[16/9]" />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-4 pt-16 text-white sm:px-6">
            {card.source === 'now' && (
              <span className="w-fit rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-foreground">
                Happening now
              </span>
            )}
            <span className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{activity.title}</span>
            {meta && <span className="text-sm text-white/85">{meta}</span>}
          </span>
        </button>

        <div className="flex flex-col gap-3 p-4 sm:px-6">
          {gathering && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {gathering.members.length > 0 && (
                <span className="flex -space-x-2" aria-hidden>
                  {gathering.members.slice(0, 5).map((m) => (
                    <Avatar key={m.id} src={m.avatarUrl} name={m.displayName} size="sm" className="ring-2 ring-surface" />
                  ))}
                </span>
              )}
              <span className="text-sm">
                {people && <span className="font-semibold">{people}</span>}
                <span className="text-muted">{people ? ' · ' : ''}{gatheringWhen(gathering)}</span>
              </span>
              {place && (
                <span className="inline-flex items-center gap-1 text-sm text-muted">
                  <MapPin size={13} aria-hidden />
                  {place.name}, {place.locality}
                </span>
              )}
            </div>
          )}
          {card.reason && <p className="text-sm text-muted">{card.reason}</p>}

          <div className="flex items-center justify-between gap-3">
            {creator ? (
              <button
                type="button"
                onClick={() => onOpenCreator(creator.handle)}
                className="inline-flex min-w-0 items-center gap-2 text-sm text-muted transition hover:text-inherit"
              >
                <Avatar src={creator.avatarUrl} name={creator.displayName} size="sm" />
                <span className="truncate">by {creator.displayName}</span>
              </button>
            ) : (
              <span className="text-sm text-muted">by Program Guru</span>
            )}
            {canFollow && (
              <button
                type="button"
                disabled={followPending}
                onClick={() => onFollow(creator)}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium transition hover:bg-surface-raised disabled:opacity-50"
              >
                <UserPlus size={13} aria-hidden />
                Follow
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label="Previous Activity"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised/50 transition hover:bg-surface-raised disabled:opacity-40"
        >
          <ChevronLeft size={20} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onParticipate(card)}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground transition hover:brightness-105"
        >
          Participate
        </button>
        <button
          type="button"
          onClick={() => onSchedule(card)}
          aria-label="Add to Schedule"
          title="Add to Schedule"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised/50 transition hover:bg-surface-raised"
        >
          <CalendarPlus size={18} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index >= deck.length - 1}
          aria-label="Next Activity"
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-1 rounded-full border border-border bg-surface-raised/50 px-5 text-sm font-medium transition hover:bg-surface-raised disabled:opacity-40"
        >
          Next
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>
    </section>
  )
}
