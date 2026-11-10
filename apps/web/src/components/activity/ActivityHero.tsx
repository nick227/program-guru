import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import type { components } from '@project/sdk'
import { Avatar } from '@/components/ui/Avatar'
import { EntityHero } from '@/components/shared/EntityHero'
import type { Hero } from '@/lib/hero'
import { buildProfileUrl } from '@/lib/urls'

type Creator = components['schemas']['UserSummary']

export interface ActivityMeta {
  key: string
  icon: LucideIcon
  label: ReactNode
}

/**
 * Shared Activity header for `/activities/:id` and `/occurrences/:id`.
 * One grid: thumbnail, kicker (context + status), title with summary, a meta
 * line (creator first), then an optional action band. The page supplies the
 * actions; this component holds no participation or editing state.
 */
export function ActivityHero({
  hero,
  context,
  status,
  title,
  summary,
  creator,
  returnTo,
  meta = [],
  extraMeta,
  footnote,
  actions,
}: {
  hero: Hero
  context: string
  status?: ReactNode
  title: string
  summary?: string | null
  creator?: Creator | null
  returnTo: string
  meta?: ActivityMeta[]
  /** Live values (e.g. a running timer) that belong on the meta line. */
  extraMeta?: ReactNode
  footnote?: ReactNode
  actions?: ReactNode
}) {
  const hasMeta = !!creator || meta.length > 0 || !!extraMeta
  return (
    <header className="activity-hero">
      {/* The image, or the category fallback tile when there is none. */}
      <EntityHero hero={hero} size="header" className="activity-hero__thumb" />

      <div className="activity-hero__kicker">
        <p className="activity-hero__context">{context}</p>
        {status}
      </div>

      <div className="activity-hero__text">
        <h1 className="activity-hero__title">{title}</h1>
        {summary && <p className="activity-hero__summary">{summary}</p>}
        {footnote}
      </div>

      {hasMeta && (
        <div className="activity-hero__meta">
          {creator && (
            <Link
              to={`${buildProfileUrl(creator.handle)}?returnTo=${encodeURIComponent(returnTo)}`}
              className="activity-hero__creator"
            >
              <Avatar
                src={creator.avatarUrl}
                name={creator.displayName}
                size="sm"
                className="h-6 w-6 ring-1 ring-border"
              />
              <span>
                by <strong className="font-semibold">{creator.displayName}</strong>
              </span>
            </Link>
          )}
          {meta.map(({ key, icon: Icon, label }) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <Icon size={14} aria-hidden />
              {label}
            </span>
          ))}
          {extraMeta}
        </div>
      )}

      {actions && <div className="activity-actions">{actions}</div>}
    </header>
  )
}
