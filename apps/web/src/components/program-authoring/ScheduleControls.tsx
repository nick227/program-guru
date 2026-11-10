import { formatProgramDuration, PROGRAM_DURATION_PRESETS } from './programFields'
import { useUpdateProgram } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/Input'
import { Row } from '@/components/ui/Layout'
import { useOnline } from '@/lib/useOnline'
import { formatDurationMinutes, MAX_DURATION_MINUTES } from '@/lib/durationMinutes'
import type { Workspace } from './types'

export type Frequency = NonNullable<Workspace['frequency']>

const DURATION_OPTIONS: (number | null)[] = [...PROGRAM_DURATION_PRESETS, null]

/** Preset durations in minutes. */
export const ACTIVITY_DURATION_PRESETS = [10, 15, 20, 30, 45, 60, 120]

export const FREQUENCY_OPTIONS: { label: string; value: Frequency }[] = [
  { label: '1 day/week', value: { kind: 'N_PER_WEEK', n: 1 } },
  { label: '2 days/week', value: { kind: 'N_PER_WEEK', n: 2 } },
  { label: '3 days/week', value: { kind: 'N_PER_WEEK', n: 3 } },
  { label: '4 days/week', value: { kind: 'N_PER_WEEK', n: 4 } },
  { label: '5 days/week', value: { kind: 'N_PER_WEEK', n: 5 } },
  { label: 'Weekdays', value: { kind: 'WEEKDAYS' } },
  { label: 'Daily', value: { kind: 'DAILY' } },
  { label: 'Flexible', value: { kind: 'FLEXIBLE' } },
]

export function isSameFrequency(current: Frequency | null | undefined, option: Frequency) {
  if (!current) return false
  if (option.kind === 'N_PER_WEEK') {
    return current.kind === 'N_PER_WEEK' && (current.n ?? 3) === option.n
  }
  return current.kind === option.kind
}

/** Format a Frequency value using the shared schedule option labels. */
export function formatFrequency(frequency: Frequency | null | undefined): string | null {
  if (!frequency) return null
  const match = FREQUENCY_OPTIONS.find((opt) => isSameFrequency(frequency, opt.value))
  if (match) return match.label
  if (frequency.kind === 'N_PER_WEEK' && frequency.n) return `${frequency.n} days/week`
  if (frequency.kind === 'CUSTOM') return 'Custom schedule'
  return null
}

export function ProgramDurationButtons({ ws }: { ws: Workspace }) {
  const update = useUpdateProgram(ws.id)
  const online = useOnline()

  return (
    <div className="space-y-2">
      <ErrorMessage error={update.error} />
      <Row role="group" aria-label="Program duration" className="flex-wrap gap-2">
        {DURATION_OPTIONS.map((days) => {
          const active = ws.durationDays === days
          return (
            <Button
              key={days ?? 'ongoing'}
              type="button"
              size="sm"
              aria-pressed={active}
              variant={active ? 'default' : 'outline'}
              disabled={!online || update.isPending}
              onClick={() =>
                update.mutate({
                  durationDays: days,
                  expectedRevision: ws.draftRevision,
                })
              }
            >
              {formatProgramDuration(days)}
            </Button>
          )
        })}
      </Row>
    </div>
  )
}

export function ActivityFrequencyButtons({
  value,
  onChange,
  disabled,
  ariaLabel = 'Activity frequency',
}: {
  value: Frequency
  onChange: (next: Frequency) => void
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <Row role="group" aria-label={ariaLabel} className="flex-wrap gap-2">
      {FREQUENCY_OPTIONS.map((option) => {
        const active = isSameFrequency(value, option.value)
        return (
          <Button
            key={option.label}
            type="button"
            size="sm"
            aria-pressed={active}
            variant={active ? 'default' : 'outline'}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        )
      })}
    </Row>
  )
}

export function ActivityDurationField({
  value,
  onChange,
  disabled,
  inputAriaLabel = 'Activity duration (optional)',
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  inputAriaLabel?: string
}) {
  const current = Number(value.trim())
  return (
    <div className="space-y-2">
      <Row role="group" aria-label="Activity duration presets" className="flex-wrap gap-2">
        {ACTIVITY_DURATION_PRESETS.map((preset) => {
          const active = current === preset
          return (
            <Button
              key={preset}
              type="button"
              size="sm"
              aria-pressed={active}
              variant={active ? 'default' : 'outline'}
              disabled={disabled}
              onClick={() => onChange(active ? '' : String(preset))}
            >
              {formatDurationMinutes(preset)}
            </Button>
          )
        })}
      </Row>
      <Input
        aria-label={inputAriaLabel}
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_DURATION_MINUTES}
        step={1}
        placeholder="Minutes"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
