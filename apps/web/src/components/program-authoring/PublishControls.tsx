import type { usePublishCheck } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { cn } from '@/lib/utils'
import {
  PROGRAM_VISIBILITIES,
  programVisibilityLabel,
  type ProgramVisibility,
} from './programFields'

/** Public / Link only / Private toggle used before publishing. */
export function ProgramVisibilityButtons({
  value,
  onChange,
  disabled,
  className,
  buttonClassName,
}: {
  value: ProgramVisibility
  onChange: (next: ProgramVisibility) => void
  disabled?: boolean
  className?: string
  buttonClassName?: string
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)} role="group" aria-label="Program visibility">
      {PROGRAM_VISIBILITIES.map((v) => (
        <Button
          key={v}
          type="button"
          size="sm"
          aria-pressed={value === v}
          variant={value === v ? 'default' : 'outline'}
          className={buttonClassName}
          disabled={disabled}
          onClick={() => onChange(v)}
        >
          {programVisibilityLabel(v)}
        </Button>
      ))}
    </div>
  )
}

/** Publish-check state: request errors, loading, and each blocking issue as an alert. */
export function PublishCheckIssues({
  check,
  error,
}: {
  check: ReturnType<typeof usePublishCheck>
  /** A publish or save error shown in the same place. */
  error?: unknown
}) {
  return (
    <>
      <ErrorMessage error={check.error || error} retry={() => void check.refetch()} />
      {check.isPending && <Loading />}
      {check.data?.issues.map((issue) => (
        <p
          role="alert"
          className="text-xs font-medium text-danger"
          key={`${issue.code}:${issue.field}:${issue.activityId}`}
        >
          {issue.message}
        </p>
      ))}
    </>
  )
}
