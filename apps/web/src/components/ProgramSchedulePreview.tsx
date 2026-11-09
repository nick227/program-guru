import { Calendar } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export interface ScheduleOutlineItem {
  title: string
  /** 0-based Program day of the Activity's first placement, from the preview outline. */
  dayIndex: number | null
}

export interface ProgramSchedulePreviewProps {
  durationDays?: number | null
  frequencyLabel?: string | null
  /** Days that have at least one Activity. */
  programDays?: number | null
  /** Total scheduled Activities across the Program. */
  placements?: number | null
  activities?: ScheduleOutlineItem[]
  onPreviewDates?: () => void
  className?: string
}

/**
 * Schedule summary from the preview API only. The exact dates come from
 * `Preview my calendar` (server-generated for the chosen start date), never from guesses here.
 */
export function ProgramSchedulePreview({
  durationDays,
  frequencyLabel,
  programDays,
  placements,
  activities = [],
  onPreviewDates,
  className,
}: ProgramSchedulePreviewProps) {
  const facts = [
    { label: 'Length', value: durationDays ? `${durationDays} days` : 'Ongoing' },
    frequencyLabel ? { label: 'Rhythm', value: frequencyLabel } : null,
    programDays != null ? { label: 'Program days', value: String(programDays) } : null,
    placements != null ? { label: 'Sessions', value: String(placements) } : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null)

  const firstDays = activities
    .filter((a) => a.dayIndex != null)
    .sort((a, b) => a.dayIndex! - b.dayIndex!)

  return (
    <section
      aria-label="Program schedule"
      className={cn(
        'w-full space-y-5 rounded-[var(--radius-panel)] border border-border bg-surface p-5 sm:p-6',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Calendar size={20} aria-hidden className="mt-1 shrink-0 text-muted" />
        <div>
          <h2 className="font-display font-bold text-foreground" style={{ fontSize: 'var(--type-section-title)' }}>
            Schedule
          </h2>
          <p className="text-sm text-muted">Placed on your Calendar from the day you start.</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-xs text-muted">{fact.label}</dt>
            <dd className="m-0 text-base font-semibold text-foreground">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {firstDays.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground">First sessions</h3>
          <ul className="space-y-1.5 text-sm">
            {firstDays.map((activity, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3">
                <span className="truncate text-foreground">{activity.title}</span>
                <span className="shrink-0 font-mono text-xs text-muted">Day {activity.dayIndex! + 1}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onPreviewDates && (
        <Button variant="outline" className="w-full gap-2 font-semibold" onClick={onPreviewDates}>
          <Calendar size={15} />
          <span>Preview dates on my Calendar</span>
        </Button>
      )}
    </section>
  )
}
