export function UnreadDot({
  count,
  label = 'Unread notifications',
}: {
  count: number
  label?: string
}) {
  if (count <= 0) return null
  return (
    <span
      aria-label={`${count} ${label}`}
      className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-attention px-1 text-[10px] font-semibold text-white"
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
