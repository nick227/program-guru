import { type Ref } from 'react'
import {
  Activity,
  ArrowLeft,
  Check,
  ChevronUp,
  Compass,
  ExternalLink,
  RotateCcw,
  RotateCw,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import type {
  AssistantTurn,
  CardAction,
  ChoiceButton,
  DiscoveryState,
  PreviewTarget,
} from '../engine/types'
import { ActivityExecution, type ActivityExecutionHandle } from '@/components/activity/ActivityExecution'
import { ActivityParticipation } from '@/components/activity/ActivityParticipation'
import { InlinePreview } from './InlinePreview'
import { TurnHero } from './TurnHero'

export interface HomeAgentSectionProps {
  turn: AssistantTurn
  discoveryState: DiscoveryState
  showWhy?: boolean
  previewTarget: PreviewTarget | null
  executionItemId: string | null
  isSignedIn: boolean
  todayIso: string
  expanded: boolean
  onToggleExpanded: () => void
  onSelectStartingAction: (action: 'now' | 'new' | 'continue') => void
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
  executionRef?: Ref<ActivityExecutionHandle>
  onCardAction: (action: CardAction) => void
  onBack: () => void
  onReset: () => void
  showReset: boolean
}

/**
 * Studio-quality Home Agent section:
 * Compact, lightweight starting state by default, expanding into a focused
 * interactive assistant without dashboard clutter or heavy decorative borders.
 */
export function HomeAgentSection({
  turn,
  discoveryState,
  showWhy,
  previewTarget,
  executionItemId,
  isSignedIn,
  todayIso,
  expanded,
  onToggleExpanded,
  onSelectStartingAction,
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
  executionRef,
  onCardAction,
  onBack,
  onReset,
  showReset,
}: HomeAgentSectionProps) {
  // ── Compact Starting State ─────────────────────────────────
  // An open preview or execution always shows (Start now on a Home card opens the stage here).
  if (!expanded && !previewTarget && !executionItemId) {
    return (
      <section
        aria-labelledby="home-agent-title"
        className="rounded-3xl border border-accent/25 bg-gradient-to-b from-accent/[0.08] via-surface to-surface p-4 sm:p-5 shadow-xs transition-all hover:border-accent/40"
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Sparkles size={16} aria-hidden />
            </div>
            <div>
              <h2
                id="home-agent-title"
                className="font-display text-sm sm:text-base font-bold text-foreground leading-tight"
              >
                Home Agent
              </h2>
              <p className="text-xs text-muted">What sounds good right now?</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleExpanded}
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-3.5 py-1 text-xs font-semibold text-accent transition hover:bg-accent/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span>Try it</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-1 border-t border-accent/15">
          <button
            type="button"
            onClick={() => onSelectStartingAction('now')}
            className="group flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-1.5 sm:gap-2 rounded-2xl bg-accent/15 hover:bg-accent/25 border border-accent/30 p-2.5 sm:p-3 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Zap size={14} className="text-accent shrink-0 mt-0.5" aria-hidden />
            <span className="text-[11px] sm:text-xs font-semibold text-foreground leading-tight">
              Do something now
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelectStartingAction('new')}
            className="group flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-1.5 sm:gap-2 rounded-2xl bg-surface hover:bg-accent/[0.04] border border-border/70 p-2.5 sm:p-3 transition shadow-2xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Compass size={14} className="text-accent shrink-0 mt-0.5" aria-hidden />
            <span className="text-[11px] sm:text-xs font-semibold text-foreground leading-tight">
              Find something new
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelectStartingAction('continue')}
            className="group flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-1.5 sm:gap-2 rounded-2xl bg-surface hover:bg-accent/[0.04] border border-border/70 p-2.5 sm:p-3 transition shadow-2xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <RotateCw size={14} className="text-accent shrink-0 mt-0.5" aria-hidden />
            <span className="text-[11px] sm:text-xs font-semibold text-foreground leading-tight">
              Continue what I've started
            </span>
          </button>
        </div>
      </section>
    )
  }

  // ── Inline Detail Previews & Active Execution ─────────────
  if (previewTarget) {
    return (
      <section
        aria-labelledby="home-agent-title"
        className="p-4 sm:p-6"
      >
        <div className="flex w-full flex-col">
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

  if (executionItemId) {
    return (
      <section
        aria-labelledby="home-agent-title"
        className="rounded-2xl border border-border/60 bg-surface p-4 sm:p-6"
      >
        <div className="flex w-full items-center justify-between gap-4 border-b border-border/40 pb-3 mb-4">
          <h2 id="home-agent-title" className="font-display text-sm sm:text-base font-semibold text-foreground">
            Activity in Progress
          </h2>
          <button
            type="button"
            onClick={onCloseExecution}
            className="shrink-0 rounded-full border border-border/70 px-3 py-1 text-xs font-medium text-muted transition hover:border-border hover:text-foreground"
          >
            Close
          </button>
        </div>
        <ActivityExecution
          ref={executionRef}
          layout="stage"
          itemId={executionItemId}
          onClose={onCloseExecution}
          onCompleted={onExecutionCompleted}
          onNext={onNextAfterExecution}
          nextLabel="Next suggestion"
          onOpenFullPage={onOpenOccurrencePage}
          onOpenPerson={(handle) => onPreview({ kind: 'creator', handle })}
        />
      </section>
    )
  }

  // ── Expanded Interactive Conversational Assistant ───────────
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
      aria-labelledby="home-agent-title"
      className="transition-all"
    >

      {/* Main turn content */}
      <div
        key={`${turn.nodeId}:${turn.card?.id ?? ''}`}
        className="mx-auto min-h-[90vh] flex w-full max-w-lg justify-center flex-col items-center gap-4 text-center animate-in fade-in duration-200"
      >
        {memoryChips.length > 0 && turn.nodeId !== 'opening' && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {memoryChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => onClearFilter(chip.key)}
                aria-label={`Remove ${chip.label} filter`}
                className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface px-2.5 py-0.5 text-xs text-muted transition hover:text-foreground"
              >
                <span className="capitalize">{chip.label}</span>
                <X size={11} aria-hidden />
              </button>
            ))}
          </div>
        )}

        {turn.card && turn.nodeId !== 'day_schedule' && (
          <div className="w-full max-w-sm">
            <TurnHero card={turn.card} onOpen={() => onPreview(turn.card!.previewTarget)} />
          </div>
        )}

        <div className="space-y-1">
          <h3 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {turn.question}
          </h3>
          {turn.contextLine && (
            <p className="text-xs sm:text-sm text-muted max-w-md mx-auto leading-relaxed">
              {turn.contextLine}
            </p>
          )}
          {showWhy && turn.whyReason && (
            <p className="mx-auto max-w-md rounded-xl border border-border/60 bg-surface px-4 py-2 text-xs text-muted">
              {turn.whyReason}
            </p>
          )}
        </div>

        {turn.card?.previewTarget.kind === 'activity' && turn.nodeId !== 'day_schedule' && (
          <ActivityParticipation
            variant="summary"
            activity={{ id: turn.card.previewTarget.id, title: turn.card.title }}
            returnTo="/"
            className="flex justify-center text-left"
          />
        )}

        {turn.nodeId === 'day_schedule' && turn.cards && turn.cards.length > 0 && (
          <ul
            aria-label="Today's schedule"
            className="w-full max-w-md divide-y divide-border/40 border-y border-border/40 text-left my-2"
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
                          <ExternalLink size={11} className="translate-x-0.5 fill-current" aria-hidden />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex w-full max-w-md flex-wrap items-center justify-center gap-2 pt-1">
          {turn.choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              disabled={loading || actionPending}
              onClick={() => onChoice(choice)}
              className={
                choice.variant === 'primary'
                  ? 'inline-flex min-h-9 items-center justify-center rounded-full bg-accent px-5 py-2 text-xs sm:text-sm font-semibold text-accent-foreground transition hover:brightness-105 disabled:opacity-50'
                  : 'inline-flex min-h-9 items-center justify-center rounded-full border border-border/70 bg-surface px-5 py-2 text-xs sm:text-sm font-medium text-foreground transition hover:border-border hover:bg-surface-raised disabled:opacity-50'
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
            className="mt-1 inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted transition hover:text-foreground"
          >
            <ArrowLeft size={13} aria-hidden />
            <span>Back</span>
          </button>
        )}
      </div>
    </section>
  )
}
