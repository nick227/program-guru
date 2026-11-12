import { Activity, ArrowRight, Layers, Play, User, Users } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import type { AssistantCard, CardAction, PreviewTarget } from '../engine/types'

interface PresentationSurfaceProps {
  title?: string
  items: AssistantCard[]
  loading?: boolean
  pending?: boolean
  onSelect: (card: AssistantCard) => void
  onAction: (action: CardAction) => void
  onPreviewCreator: (target: PreviewTarget) => void
}

function RowIcon({ kind }: { kind: AssistantCard['kind'] }) {
  switch (kind) {
    case 'scheduled':
    case 'activity':
      return <Activity size={18} aria-hidden />
    case 'program':
      return <Layers size={18} aria-hidden />
    case 'session':
      return <Users size={18} aria-hidden />
    case 'creator':
      return <User size={18} aria-hidden />
  }
}

function ActionIcon({ action }: { action: CardAction }) {
  if (action.type === 'open_occurrence' || action.type === 'open_activity') {
    return <Play size={15} className="translate-x-0.5 fill-current" aria-hidden />
  }
  return <ArrowRight size={15} aria-hidden />
}

/**
 * Bottom-aligned Presentation rail beneath Conversation.
 * Owns all entity visuals: one primary entity by default, or up to three horizontal items.
 */
export function PresentationSurface({
  title = 'Suggested',
  items,
  loading,
  pending,
  onSelect,
  onAction,
  onPreviewCreator,
}: PresentationSurfaceProps) {
  const visible = items.slice(0, 3)
  if (!loading && visible.length === 0) return null

  return (
    <section
      aria-label="Presentation"
      className="w-full border-t border-border/50 py-5"
    >
      <div className="mx-auto w-full max-w-[620px] px-6">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted">
          {title}
        </p>
        {loading ? (
          <div className="h-14 w-full animate-pulse rounded-xl bg-surface-muted/50" />
        ) : visible.length === 1 ? (
          (() => {
            const item = visible[0]!
            return (
              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="flex min-w-0 flex-1 items-center gap-3.5 text-left transition hover:opacity-85"
                >
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-xl border border-border/50 object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-surface-muted/80 text-muted">
                      <RowIcon kind={item.kind} />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-semibold sm:text-base">
                      {item.title}
                    </p>
                    <p className="truncate text-xs text-muted">{item.subtitle}</p>
                  </div>
                </button>

                <div className="flex shrink-0 items-center gap-3">
                  {item.participants && item.participants.users.length > 0 && (
                    <div className="hidden -space-x-1.5 sm:flex">
                      {item.participants.users.slice(0, 3).map((person) => (
                        <button
                          key={person.id}
                          type="button"
                          onClick={() =>
                            onPreviewCreator({
                              kind: 'creator',
                              handle: person.handle,
                            })
                          }
                          aria-label={`Preview ${person.displayName}`}
                          className="rounded-full ring-2 ring-surface transition hover:z-10 hover:scale-105"
                        >
                          <Avatar
                            src={person.avatarUrl}
                            name={person.displayName}
                            size="sm"
                          />
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onAction(item.primaryAction)}
                    aria-label={`Open ${item.title}`}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition hover:brightness-105 disabled:opacity-50"
                  >
                    <ActionIcon action={item.primaryAction} />
                  </button>
                </div>
              </div>
            )
          })()
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {visible.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                className="flex items-center gap-3 rounded-xl border border-border/50 bg-surface/60 p-2.5 text-left transition hover:bg-surface"
              >
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg border border-border/50 object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-surface-muted/80 text-muted">
                    <RowIcon kind={item.kind} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold sm:text-sm">
                    {item.title}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {item.subtitle}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
