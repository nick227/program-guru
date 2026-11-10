import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  label: string
  href?: string
}

/** Shallow, compact breadcrumb trail for entity and contextual sub-pages. */
export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[]
  className?: string
}) {
  if (!items.length) return null

  return (
    <nav aria-label="Breadcrumb" className={cn('breadcrumbs', className)}>
      <ol className="breadcrumbs__list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="breadcrumbs__item">
              {index > 0 && (
                <ChevronRight
                  size={14}
                  aria-hidden
                  className="breadcrumbs__sep"
                />
              )}
              {item.href && !isLast ? (
                <Link to={item.href} className="breadcrumbs__link">
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className="breadcrumbs__current"
                >
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

