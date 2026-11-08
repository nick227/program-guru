import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

export const Page = ({
  className,
  ...props
}: ComponentPropsWithoutRef<'main'>) => (
  <main id="main" className={cn('page', className)} {...props} />
)

export const Stage = ({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) => (
  <div className={cn('stage', className)} {...props} />
)

export const Panel = ({
  className,
  ...props
}: ComponentPropsWithoutRef<'section'>) => (
  <section className={cn('panel', className)} {...props} />
)

export const Row = ({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) => (
  <div
    className={cn('flex flex-wrap items-center gap-3', className)}
    {...props}
  />
)

export const Grid = ({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) => (
  <div className={cn('grid gap-3', className)} {...props} />
)

export const Stack = ({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) => (
  <div className={cn('flex flex-col gap-4', className)} {...props} />
)
