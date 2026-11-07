import { cn } from '@/lib/utils'

interface AvatarProps {
  src?: string | null
  name?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const initials =
    name
      ?.split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? '?'

  return (
    <div
      className={cn(
        'rounded-full bg-surface-muted flex items-center justify-center overflow-hidden shrink-0 font-medium',
        sizes[size],
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt={name ?? ''}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-muted-foreground">{initials}</span>
      )}
    </div>
  )
}
