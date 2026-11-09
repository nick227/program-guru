import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ParticipationStatus = 'planned' | 'active' | 'completed' | 'paused' | 'unavailable'

const LABELS: Record<ParticipationStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  completed: 'Completed',
  paused: 'Paused',
  unavailable: 'Unavailable',
}

/**
 * Participation state as text plus a `--color-status-*` dot (04-UI §4a). The label carries the
 * meaning; the dot is decorative, so state never depends on color alone.
 */
export function StatusText({
  status,
  children,
  className,
}: {
  status: ParticipationStatus
  children?: ReactNode
  className?: string
}) {
  return (
    <span className={cn('status-text', className)} data-status={status}>
      <span className="status-text__dot" aria-hidden />
      {children ?? LABELS[status]}
    </span>
  )
}

/** My Programs library status → participation state. */
export function libraryStatusTone(status: string): ParticipationStatus {
  switch (status) {
    case 'Active':
      return 'active'
    case 'Paused':
      return 'paused'
    case 'Completed':
      return 'completed'
    case 'Archived':
      return 'unavailable'
    default:
      return 'planned'
  }
}

/** Enrollment status (API `EnrollmentStatus`) → participation state and label. */
export function enrollmentStatusText(status?: string | null): { status: ParticipationStatus; label: string } {
  switch (status) {
    case 'PAUSED':
      return { status: 'paused', label: 'Paused' }
    case 'COMPLETED':
      return { status: 'completed', label: 'Completed' }
    case 'PENDING_ACCESS':
      return { status: 'planned', label: 'Waiting for access' }
    case 'LEFT':
      return { status: 'unavailable', label: 'Left' }
    default:
      return { status: 'active', label: 'Active' }
  }
}
