import { cn } from '@/lib/utils'

export function UnreadDot({
  count,
  label = 'Unread notifications',
  inline = false,
  dotOnly = false,
  className,
}: {
  count: number
  label?: string
  inline?: boolean
  dotOnly?: boolean
  className?: string
}) {
  if (count <= 0) return null
  if (dotOnly) {
    return (
      <span
        role="status"
        aria-label={`${count} ${label}`}
        className={cn(
          inline
            ? 'inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-accent'
            : 'absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-surface',
          className,
        )}
      />
    )
  }
  return (
    <span
      role="status"
      aria-label={`${count} ${label}`}
      className={cn(
        inline
          ? 'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/15 px-1.5 font-mono text-xs font-medium text-accent'
          : ' -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-medium text-white ring-2 ring-surface',
        !inline && 'absolute',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
