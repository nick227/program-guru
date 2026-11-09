import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Section heading (04-UI §4a): the section-title role, an optional one-line description and an
 * optional trailing action. Use `level={3}` for a section nested under another `h2`.
 */
export function SectionHeader({
  title,
  description,
  action,
  level = 2,
  id,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  level?: 2 | 3
  id?: string
  className?: string
}) {
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <div className={cn('section-header', className)}>
      <div className="section-header__text">
        <Heading id={id}>{title}</Heading>
        {description && <p className="section-header__description">{description}</p>}
      </div>
      {action && <div className="section-header__action">{action}</div>}
    </div>
  )
}
