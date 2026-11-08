import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

export const Card = ({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) => (
  <div className={cn('card', className)} {...props} />
)
