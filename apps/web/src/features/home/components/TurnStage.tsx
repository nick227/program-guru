import { Activity, ArrowLeft, Check, Play, X } from 'lucide-react'
import type {
  AssistantTurn,
  CardAction,
  ChoiceButton,
  DiscoveryState,
  PreviewTarget,
} from '../engine/types'
import { InlineExecution } from './InlineExecution'
import { InlinePreview } from './InlinePreview'

interface TurnStageProps {
  turn: AssistantTurn
  discoveryState: DiscoveryState
  showWhy?: boolean
  previewTarget: PreviewTarget | null
  executionItemId: string | null
  isSignedIn: boolean
  todayIso: string
  canGoBack: boolean
  loading?: boolean
  actionPending?: boolean
  onChoice: (choice: ChoiceButton) => void
  onClearFilter: (key: 'maxMinutes' | 'categoryId' | 'level') => void
  onPreview: (target: PreviewTarget) => void
  onClosePreview: () => void
  onCloseExecution: () => void
  onExecutionCompleted: (title: string) => void
  onNextAfterExecution: () => void
  onOpenOccurrencePage: (itemId: string) => void
  onCardAction: (action: CardAction) => void
  onBack: () => void
}

/**
 * Centered single-turn conversational stage:
 * one prominent question, a short contextual sentence, an optional compact card
 * (or inline day schedule / inline detail preview), and 2-4 large pill response buttons.
 */
export function TurnStage({
  turn,
  discoveryState,
  showWhy,
  previewTarget,
  executionItemId,
  isSignedIn,
  todayIso,
  canGoBack,
  loading,
  actionPending,
  onChoice,
  onClearFilter,
  onPreview,
  onClosePreview,
  onCloseExecution,
  onExecutionCompleted,
  onNextAfterExecution,
  onOpenOccurrencePage,
  onCardAction,
  onBack,
}: TurnStageProps) {
  if (previewTarget) {
    const isGroup =
      previewTarget.kind === 'group' || previewTarget.kind === 'session'

    if (isGroup) {
      return (
        <section className="flex w-full flex-1 flex-col">
          <div className="flex w-full items-center justify-between gap-4 border-b border-border/50 px-6 py-2.5">
            <div className="flex min-w-0 items-baseline gap-2.5">
              <p className="truncate font-display text-sm font-semibold">
                {turn.question}
              </p>
              {turn.contextLine && (
                <p className="hidden truncate text-xs text-muted sm:inline">
                  {turn.contextLine}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClosePreview}
              className="shrink-0 rounded-full border border-border/70 px-3 py-1 text-xs font-medium text-muted transition hover:text-inherit"
            >
              Back
            </button>
          </div>
          <div className="flex w-full flex-1 flex-col">
            <InlinePreview
              target={previewTarget}
              isSignedIn={isSignedIn}
              todayIso={todayIso}
              onClose={onClosePreview}
              onExecute={onCardAction}
            />
          </div>
        </section>
      )
    }

    return (
      <section className="flex w-full flex-col items-center text-center">
        <InlinePreview
          target={previewTarget}
          isSignedIn={isSignedIn}
          todayIso={todayIso}
          onClose={onClosePreview}
          onExecute={onCardAction}
        />
      </section>
    )
  }

  if (executionItemId) {
    return (
      <section className="flex w-full flex-col items-center text-center">
        <InlineExecution
          itemId={executionItemId}
          onClose={onCloseExecution}
          onCompleted={onExecutionCompleted}
          onNextSuggestion={onNextAfterExecution}
          onOpenFullPage={onOpenOccurrencePage}
          onPreviewCreator={onPreview}
        />
      </section>
    )
  }

  const memoryChips: Array<{ key: 'maxMinutes' | 'categoryId' | 'level'; label: string }> = []
  if (discoveryState.categoryName) {
    memoryChips.push({ key: 'categoryId', label: discoveryState.categoryName })
  }
  if (discoveryState.maxMinutes && discoveryState.maxMinutes < 999) {
    memoryChips.push({ key: 'maxMinutes', label: `${discoveryState.maxMinutes} min` })
  }
  if (discoveryState.level) {
    memoryChips.push({
      key: 'level',
      label: discoveryState.level.replace('_', ' ').toLowerCase(),
    })
  }

  return (
    <section
      aria-label="Conversation"
      className="mx-auto flex w-full max-w-[620px] flex-col items-center px-6 py-8 text-center"
    >
      <div
        key={`${turn.nodeId}:${turn.card?.id ?? ''}`}
        className="flex w-full flex-col items-center gap-5 animate-in fade-in duration-200"
      >
        {memoryChips.length > 0 && turn.nodeId !== 'opening' && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {memoryChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => onClearFilter(chip.key)}
                aria-label={`Remove ${chip.label} filter`}
                className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface-raised/50 px-2.5 py-0.5 text-xs text-muted transition hover:text-inherit"
              >
                <span className="capitalize">{chip.label}</span>
                <X size={11} aria-hidden />
              </button>
            ))}
          </div>
        )}
        <div className="space-y-2.5">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {turn.question}
          </h1>
          {turn.contextLine && (
            <p className="mx-auto max-w-md text-sm text-muted sm:text-base">
              {turn.contextLine}
            </p>
          )}
          {showWhy && turn.whyReason && (
            <p className="mx-auto max-w-md rounded-xl border border-border/70 bg-surface-raised/60 px-4 py-2.5 text-xs text-muted sm:text-sm">
              {turn.whyReason}
            </p>
          )}
        </div>

        {turn.nodeId === 'day_schedule' && turn.cards && turn.cards.length > 0 && (
          <ul
            aria-label="Today's schedule"
            className="w-full max-w-md divide-y divide-border/50 border-y border-border/50 text-left"
          >
            {turn.cards.map((item) => {
              const isDone = item.status === 'DONE'
              const isSkipped =
                item.status === 'SKIPPED' || item.status === 'NOT_PARTICIPATING'
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={actionPending}
                    onClick={() => onCardAction(item.primaryAction)}
                    className="group flex w-full items-center gap-3 py-2.5 transition hover:opacity-85 disabled:opacity-50"
                  >
                    <span className="w-14 shrink-0 text-xs tabular-nums text-muted">
                      {item.localTime || 'Any time'}
                    </span>

                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-lg border border-border/50 object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-surface-muted/60 text-muted">
                        <Activity size={14} aria-hidden />
                      </div>
                    )}

                    <span
                      className={`min-w-0 flex-1 truncate text-sm font-medium ${
                        isDone || isSkipped ? 'text-muted line-through' : ''
                      }`}
                    >
                      {item.title}
                    </span>

                    <span className="shrink-0">
                      {isDone ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                          <Check size={13} aria-hidden />
                          <span>Done</span>
                        </span>
                      ) : isSkipped ? (
                        <span className="text-xs text-muted">Skipped</span>
                      ) : (
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 text-muted transition group-hover:border-accent group-hover:text-accent">
                          <Play size={11} className="translate-x-0.5 fill-current" aria-hidden />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex w-full max-w-xl flex-wrap items-center justify-center gap-3 pt-1">
          {turn.choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              disabled={loading || actionPending}
              onClick={() => onChoice(choice)}
              className={
                choice.variant === 'primary'
                  ? 'inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-105 disabled:opacity-50'
                  : 'inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-surface-raised/50 px-6 py-2.5 text-sm font-medium transition hover:bg-surface-raised disabled:opacity-50'
              }
            >
              {choice.label}
            </button>
          ))}
        </div>

        {canGoBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-1 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted transition hover:text-inherit"
          >
            <ArrowLeft size={14} aria-hidden />
            <span>Back</span>
          </button>
        )}
      </div>
    </section>
  )
}
