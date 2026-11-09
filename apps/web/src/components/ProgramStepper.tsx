import React from 'react'
import { cn } from '@/lib/utils'

export type ProgramStep = 'details' | 'activities' | 'publish'

export const PROGRAM_STEPS: {
  id: ProgramStep
  number: number
  label: string
  shortLabel: string
}[] = [
  { id: 'details', number: 1, label: 'Details', shortLabel: 'Details' },
  { id: 'activities', number: 2, label: 'Activities', shortLabel: 'Activities' },
  { id: 'publish', number: 3, label: 'Publish & Share', shortLabel: 'Publish' },
]

export function ProgramStepper({
  currentStep,
  onSelectStep,
  disabled = false,
}: {
  currentStep: ProgramStep
  onSelectStep: (step: ProgramStep) => void
  disabled?: boolean
}) {
  const currentIndex = PROGRAM_STEPS.findIndex((s) => s.id === currentStep)

  return (
    <nav
      aria-label="Program editor steps"
      className="my-3 w-full rounded-xl border border-border bg-surface-raised p-1.5 sm:p-2"
    >
      <ol className="grid grid-cols-3 gap-1 sm:gap-2">
        {PROGRAM_STEPS.map((step, index) => {
          const isCurrent = step.id === currentStep
          const isPast = index < currentIndex

          return (
            <li key={step.id} className="min-w-0">
              <button
                type="button"
                disabled={disabled}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => onSelectStep(step.id)}
                className={cn(
                  'group flex w-full flex-col items-center justify-center rounded-lg px-2 py-2 text-center transition-colors sm:flex-row sm:gap-2 sm:px-3 sm:py-2.5',
                  isCurrent
                    ? 'bg-accent text-white shadow-sm font-semibold'
                    : isPast
                      ? 'text-foreground hover:bg-surface'
                      : 'text-muted hover:bg-surface hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                    isCurrent
                      ? 'bg-white text-accent'
                      : isPast
                        ? 'bg-accent/20 text-accent group-hover:bg-accent/30'
                        : 'bg-muted/30 text-muted group-hover:text-foreground',
                  )}
                >
                  {step.number}
                </span>
                <span className="truncate text-xs sm:text-sm font-semibold">
                  {step.label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
