import { Calendar, CheckCircle2 } from 'lucide-react'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

export interface ScheduleOutlineItem {
  title: string
  /** 0-based Program day of the Activity's first placement, from the preview outline. */
  dayIndex: number | null
}

export interface ProgramSchedulePreviewProps {
  durationDays?: number | null
  frequencyLabel?: string | null
  programDays?: number | null
  placements?: number | null
  activities?: ScheduleOutlineItem[]
  startDate?: string
  onStartDateChange?: (date: string) => void
  onStartProgram?: () => void
  isStarting?: boolean
  isEnrolled?: boolean
  signedIn?: boolean
  loginUrl?: string
  timezone?: string
  onViewSchedule?: () => void
  className?: string
}

const WEEK_DAYS = [
  { short: 'M', name: 'Mon', index: 0 },
  { short: 'T', name: 'Tue', index: 1 },
  { short: 'W', name: 'Wed', index: 2 },
  { short: 'T', name: 'Thu', index: 3 },
  { short: 'F', name: 'Fri', index: 4 },
  { short: 'S', name: 'Sat', index: 5 },
  { short: 'S', name: 'Sun', index: 6 },
]

/**
 * Compact, visual weekly schedule: rhythm pills (M-T-W-T-F-S-S), duration summary,
 * and integrated start action.
 */
export function ProgramSchedulePreview({
  durationDays,
  frequencyLabel,
  activities = [],
  startDate,
  onStartDateChange,
  onStartProgram,
  isStarting = false,
  isEnrolled = false,
  signedIn = true,
  loginUrl,
  timezone,
  onViewSchedule,
  className,
}: ProgramSchedulePreviewProps) {
  // Compute active days in week (0 = Monday, ... 6 = Sunday)
  const explicitDays = activities
    .filter((a) => a.dayIndex != null)
    .map((a) => a.dayIndex! % 7)

  const activeDays = new Set<number>()
  if (explicitDays.length > 0) {
    for (const d of explicitDays) activeDays.add(d)
  } else {
    // Fallback heuristic based on frequencyLabel or defaults
    const freq = frequencyLabel?.toLowerCase() || ''
    if (freq.includes('daily') || freq.includes('7')) {
      for (let i = 0; i < 7; i++) activeDays.add(i)
    } else if (freq.includes('5')) {
      for (let i = 0; i < 5; i++) activeDays.add(i)
    } else if (freq.includes('2')) {
      activeDays.add(1)
      activeDays.add(3)
    } else {
      // Default: Mon, Wed, Fri
      activeDays.add(0)
      activeDays.add(2)
      activeDays.add(4)
    }
  }

  const weeks = durationDays ? Math.round(durationDays / 7) : 0
  const durationText = durationDays
    ? weeks > 0
      ? `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`
      : `${durationDays} days`
    : 'Flexible length'


  return (
    <section
      aria-label="Start Program"
      className={cn('rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-5', className)}
    >
      <div className="space-y-1">
        <SectionHeader
          title="Start Program"
          className="pb-0"
        />
      </div>


      {/* Start Date & Action Sitting Naturally Together */}
      <div className="pt-3">
        {isEnrolled ? (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-accent/5 rounded-lg p-3 border border-accent/20">
            <div className="flex items-center gap-2 text-xs font-semibold text-accent">
              <CheckCircle2 size={16} />
              <span>You are currently enrolled</span>
            </div>
            {onViewSchedule && (
              <Button size="sm" variant="outline" onClick={onViewSchedule}>
                Open Schedule
              </Button>
            )}
          </div>
        ) : signedIn ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                disabled={isStarting}
                onChange={(e) => onStartDateChange?.(e.target.value)}
                className="h-10 flex-1 bg-surface text-sm font-medium"
              />
              <Button
                size="md"
                className="h-10 shrink-0 px-5 font-bold shadow-xs"
                disabled={isStarting}
                loading={isStarting}
                onClick={onStartProgram}
              >
                Start Program
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-foreground">Ready to start?</h4>
              <p className="text-xs text-muted truncate">Sign in to set your start date.</p>
            </div>
            {loginUrl && (
              <a href={loginUrl} className="btn btn--primary btn--sm shrink-0 font-semibold">
                Sign in to join
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
