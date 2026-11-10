import { useId, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The one card shell for every section below an Activity header (Activity
 * definition and Occurrence): icon + heading, optional description, optional
 * header action, then content. Use `as="div"` when the content is already its
 * own labelled region, so the page does not announce the same name twice.
 */
export function ActivitySection({
  id,
  icon: Icon,
  title,
  description,
  action,
  as: Tag = 'section',
  className,
  children,
}: {
  id?: string
  icon: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  as?: 'section' | 'div'
  className?: string
  children?: ReactNode
}) {
  const headingId = useId()
  return (
    <Tag
      id={id}
      aria-labelledby={Tag === 'section' ? headingId : undefined}
      className={cn('activity-card', className)}
    >
      <div className="activity-card__header">
        <div className="activity-card__heading">
          <div className="activity-card__title">
            <Icon size={18} className="shrink-0 text-accent" aria-hidden />
            <h2 id={headingId}>{title}</h2>
          </div>
          {description && <p className="activity-card__description">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Tag>
  )
}
