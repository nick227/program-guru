import { useEffect } from 'react'
import { ExternalLink, MapPin, X } from 'lucide-react'
import type { components } from '@project/sdk'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import { activityHero } from '@/lib/hero'

type S = components['schemas']

/**
 * A Place and the public Activities that suggest it (08 §2a, 12 §5a). Platform-curated facts only: it
 * never says or implies that the venue hosts, organizes or endorses an Activity, and never claims hours.
 */
export function PlacePreviewDrawer({
  place,
  activities,
  onSelectActivity,
  onClose,
}: {
  place: S['Place'] | null
  activities: S['ActivitySummary'][]
  onSelectActivity: (activityId: string) => void
  onClose: () => void
}) {
  const categorySlugOf = useCategorySlugOf()

  useEffect(() => {
    if (!place) return
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
  }, [place, onClose])

  if (!place) return null
  const address = [place.addressLine, `${place.locality}, ${place.region}`].filter(Boolean).join(', ')

  return (
    <div role="dialog" aria-modal="true" aria-label={place.name} className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close place"
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px]"
      />

      <div className="browse-sidebar-scroll relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border/60 bg-background shadow-2xl">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border/40 bg-background/95 px-6 py-4 backdrop-blur">
          <span className="truncate font-display text-base font-semibold text-foreground">{place.name}</span>
          <button
            type="button"
            aria-label="Close place"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-8 p-6">
          <div className="space-y-3">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">{place.name}</h2>
            <p className="flex items-start gap-2 text-sm text-muted">
              <MapPin size={16} aria-hidden className="mt-0.5 shrink-0" />
              <span>{address}</span>
            </p>
            {place.accessNote && (
              <p className="rounded-lg border border-border/60 bg-surface-muted/60 p-3 text-sm text-foreground/85">
                <span className="font-medium">Before you go: </span>
                {place.accessNote}
              </p>
            )}
            <a
              href={place.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              Visitor information
              <ExternalLink size={13} aria-hidden />
            </a>
          </div>

          <section aria-labelledby="place-activities" className="space-y-4">
            <div>
              <h3 id="place-activities" className="font-display text-lg font-semibold text-foreground">
                Activities that suggest this place
              </h3>
              <p className="mt-1 text-sm text-muted">
                Suggested place only. Nothing here is hosted or organized by {place.name}.
              </p>
            </div>
            <ul className="space-y-3">
              {activities.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onSelectActivity(a.id)}
                    className="flex w-full items-center gap-4 rounded-xl p-2 text-left transition-colors hover:bg-surface-muted"
                  >
                    <EntityHero
                      hero={activityHero(a, categorySlugOf)}
                      size="card"
                      interactive={false}
                      showVideoBadge={false}
                      className="aspect-video w-32 shrink-0 overflow-hidden rounded-lg"
                    />
                    <span className="min-w-0">
                      <span className="block font-display text-base font-semibold text-foreground">{a.title}</span>
                      {a.summary && <span className="mt-1 line-clamp-2 block text-sm text-muted">{a.summary}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
