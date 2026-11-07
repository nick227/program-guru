import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'
export const Page = ({
  className,
  ...props
}: ComponentPropsWithoutRef<'main'>) => (
  <main
    id="main"
    className={cn(
      'mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8',
      className,
    )}
    {...props}
  />
)
export const Stage = ({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) => (
  <div
    className={cn('mx-auto flex w-full max-w-xl flex-col gap-6', className)}
    {...props}
  />
)
export const Panel = ({
  className,
  ...props
}: ComponentPropsWithoutRef<'section'>) => (
  <section
    className={cn('rounded-xl border bg-surface p-4 sm:p-6', className)}
    {...props}
  />
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
