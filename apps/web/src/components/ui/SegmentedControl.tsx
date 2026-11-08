import React from 'react'
import { cn } from '@/lib/utils'

export type SegmentedOption<T extends string = string> = {
  value: T
  label: React.ReactNode
  ariaLabel?: string
  icon?: React.ReactNode
}

export type SegmentedControlProps<T extends string = string> = {
  options: (SegmentedOption<T> | T)[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
  ariaLabel?: string
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center rounded-full p-1 bg-surface-muted border border-border/60 transition-colors',
        size === 'sm' && 'gap-0.5 text-xs',
        size === 'md' && 'gap-1 text-sm',
        className,
      )}
    >
      {options.map((opt) => {
        const option = typeof opt === 'string' ? { value: opt as T, label: opt } : opt
        const isSelected = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={option.ariaLabel}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex items-center justify-center font-medium rounded-full transition-all duration-fast select-none',
              size === 'sm' && 'px-3 py-1 text-xs leading-none',
              size === 'md' && 'px-4 py-1.5 text-sm leading-tight',
              isSelected
                ? 'bg-surface text-foreground shadow-sm font-semibold border border-border/40'
                : 'text-muted hover:text-foreground hover:bg-surface/50 border border-transparent',
            )}
          >
            {option.icon && <span className="mr-1.5 inline-flex items-center">{option.icon}</span>}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

