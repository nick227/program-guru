import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef } from 'react'
import { Spinner } from './Spinner'
import { cn } from '@/lib/utils'

const buttonVariants = cva('btn', {
  variants: {
    variant: {
      default: 'btn--primary',
      outline: 'btn--outline',
      ghost: 'btn--ghost',
      destructive: 'btn--danger',
      link: 'btn--link',
    },
    size: {
      sm: 'btn--sm',
      md: 'btn--md',
      lg: 'btn--lg',
      icon: 'btn--icon',
    },
  },
  defaultVariants: { variant: 'default', size: 'md' },
})

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
      type={props.type ?? 'button'}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'
