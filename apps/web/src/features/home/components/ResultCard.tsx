import { Activity, ArrowRight, Layers, Play, User, UserPlus, Users } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import type { AssistantCard, CardAction, PreviewTarget } from '../engine/types'

interface ResultCardProps {
  card: AssistantCard
  onPreview: (target: PreviewTarget) => void
  onAction: (action: CardAction) => void
  pending?: boolean
}

function CardKindIcon({ kind }: { kind: AssistantCard['kind'] }) {
  switch (kind) {
    case 'scheduled':
    case 'activity':
      return <Activity size={20} aria-hidden />
    case 'program':
      return <Layers size={20} aria-hidden />
    case 'session':
      return <Users size={20} aria-hidden />
    case 'creator':
      return <User size={20} aria-hidden />
  }
}

function ActionButtonIcon({ action }: { action: CardAction }) {
  if (action.type === 'open_occurrence' || action.type === 'open_activity') {
    return <Play size={18} className="translate-x-0.5 fill-current" aria-hidden />
  }
  if (action.type === 'follow_creator') {
    return <UserPlus size={18} aria-hidden />
  }
  return <ArrowRight size={18} aria-hidden />
}

/**
 * Compact horizontal media/action card rendered directly inside a conversational turn.
 */
export function ResultCard({
  card,
  onPreview,
  onAction,
  pending,
}: ResultCardProps) {
  return (
    <div className="w-full max-w-lg rounded-2xl border border-border bg-surface-raised/65 p-4 shadow-sm backdrop-blur-sm transition hover:border-border/90 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onPreview(card.previewTarget)}
          className="flex min-w-0 flex-1 items-center gap-4 text-left transition hover:opacity-85"
        >
          {card.thumbnailUrl ? (
            <img
              src={card.thumbnailUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-xl border border-border/60 object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-surface-muted/80 text-muted">
              <CardKindIcon kind={card.kind} />
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold tracking-tight sm:text-lg">
              {card.title}
            </p>
            <p className="truncate text-sm text-muted">{card.subtitle}</p>
          </div>
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() => onAction(card.primaryAction)}
          aria-label={`Open ${card.title}`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition hover:brightness-105 disabled:opacity-50"
        >
          <ActionButtonIcon action={card.primaryAction} />
        </button>
      </div>

      {card.participants &&
        (card.participants.users.length > 0 ||
          (card.participants.avatarUrls?.length ?? 0) > 0) && (
          <div className="mt-3 flex items-center gap-2.5 border-t border-border/50 pt-3">
            <div className="flex -space-x-2">
              {card.participants.users.length > 0
                ? card.participants.users.slice(0, 4).map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onPreview({ kind: 'creator', handle: person.handle })
                      }}
                      aria-label={`Preview ${person.displayName}`}
                      title={`${person.displayName} (@${person.handle})`}
                      className="rounded-full ring-2 ring-surface-raised transition hover:z-10 hover:scale-105"
                    >
                      <Avatar
                        src={person.avatarUrl}
                        name={person.displayName}
                        size="sm"
                      />
                    </button>
                  ))
                : card.participants.avatarUrls?.slice(0, 4).map((url, idx) => (
                    <div
                      key={`${url}-${idx}`}
                      className="rounded-full ring-2 ring-surface-raised"
                    >
                      <Avatar src={url} name="Participant" size="sm" />
                    </div>
                  ))}
            </div>
            <span className="text-xs text-muted">
              {card.participants.count && card.participants.count > 0
                ? `${card.participants.count} · ${card.participants.label}`
                : card.participants.label}
            </span>
          </div>
        )}
    </div>
  )
}

