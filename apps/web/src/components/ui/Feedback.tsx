import { ApiError } from '@project/sdk'
import { Button } from './Button'
import { Skeleton } from './Skeleton'
export function ErrorMessage({
  error,
  retry,
}: {
  error: unknown
  retry?: () => void
}) {
  if (!error) return null
  return (
    <div
      role="alert"
      className="space-y-2 rounded-lg border border-danger/40 bg-surface p-4 text-danger"
    >
      <p>{error instanceof Error ? error.message : 'Something went wrong.'}</p>
      {error instanceof ApiError && error.fieldErrors && (
        <ul>
          {Object.entries(error.fieldErrors).map(([field, message]) => (
            <li key={field}>
              {field}: {message}
            </li>
          ))}
        </ul>
      )}
      {error instanceof ApiError && error.requestId && (
        <p className="text-xs text-muted">Reference: {error.requestId}</p>
      )}
      {retry && (
        <Button variant="outline" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  )
}
export function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}
