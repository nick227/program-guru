import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const sizes = { sm: 14, md: 18, lg: 24 }

export function Spinner({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <Loader2
      size={sizes[size]}
      className={cn('animate-spin text-muted-foreground', className)}
    />
  )
}

export function PageSpinner() {
  return (
    <div className="flex h-48 items-center justify-center">
      <Spinner size="lg" />
    </div>
  )
}
