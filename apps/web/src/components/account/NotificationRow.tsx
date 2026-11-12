import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { components } from '@project/sdk'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { linkButton } from '@/components/shared/Navigation'
import {
  formatNotificationTimestamp,
  getNotificationMeta,
  notificationActors,
  notificationGroupCount,
  notificationIds,
  notificationUnreadCount,
  resolveNotificationLink,
} from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { buildProfileUrl } from '@/lib/urls'

type Notification = components['schemas']['Notification']

export interface NotificationInlineAction {
  canAct: boolean
  pending?: boolean
  resolved?: 'accepted' | 'declined' | null
  error?: string | null
  onAccept: () => void
  onDecline: () => void
}

export function NotificationRow({
  notification: n,
  timezone,
  compact = false,
  marking = false,
  inlineAction,
  onMarkRead,
  onNavigate,
}: {
  notification: Notification
  timezone?: string
  compact?: boolean
  marking?: boolean
  inlineAction?: NotificationInlineAction
  onMarkRead?: (ids: string[]) => void
  onNavigate?: (notification: Notification) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const ids = notificationIds(n)
  const unreadCount = notificationUnreadCount(n)
  const unread = unreadCount > 0
  const groupCount = notificationGroupCount(n)
  const actors = notificationActors(n)
  const visibleActors = actors.slice(0, 4)
  const totalActors = n.actorCount ?? actors.length
  const extraActors = Math.max(0, totalActors - visibleActors.length)
  const items = n.items ?? []
  const canExpand = !compact && items.length > 1
  const meta = getNotificationMeta(n.type)
  const target = resolveNotificationLink(n)

  const handleOpen = () => {
    if (unread && onMarkRead) {
      onMarkRead(ids)
    }
    onNavigate?.(n)
  }

  return (
    <Panel
      data-testid={`notification-item-${n.id}`}
      data-unread={unread ? 'true' : 'false'}
      data-group-count={groupCount}
      className={cn(
        'transition-colors',
        compact ? 'p-3' : 'p-4',
        unread ? 'border-accent bg-accent/5' : 'opacity-85',
      )}
    >
      <Stack className="gap-2">
        <Row className="items-start justify-between gap-2">
          <Row className="min-w-0 flex-1 flex-wrap items-center gap-2">
            {unread && (
              <span
                aria-label="Unread"
                className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent"
              />
            )}
            <span className="rounded border px-1.5 py-0.5 text-[11px] font-medium text-muted">
              {meta.label}
            </span>
            {groupCount > 1 && (
              <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-text">
                {groupCount}
              </span>
            )}
            <span className="text-xs text-muted">
              {formatNotificationTimestamp(n.createdAt, timezone)}
            </span>
          </Row>
          {unread && onMarkRead && (
            <Button
              variant="ghost"
              className="min-h-11 px-2 py-1 text-xs"
              disabled={marking}
              aria-label={`Mark "${n.title}" read`}
              onClick={() => onMarkRead(ids)}
            >
              Mark read
            </Button>
          )}
        </Row>

        <div className="flex items-start gap-3">
          {visibleActors.length > 1 ? (
            <div
              className="flex shrink-0 items-center -space-x-2"
              aria-label={`${totalActors} people`}
            >
              {visibleActors.map((actor) => (
                <Link
                  key={actor.id}
                  to={buildProfileUrl(actor.handle)}
                  onClick={handleOpen}
                  aria-label={actor.displayName}
                  className="rounded-full ring-2 ring-surface"
                >
                  <Avatar
                    src={actor.avatarUrl}
                    name={actor.displayName}
                    size="sm"
                  />
                </Link>
              ))}
              {extraActors > 0 && (
                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border bg-surface-muted px-1 text-[10px] font-medium text-muted ring-2 ring-surface">
                  +{extraActors}
                </span>
              )}
            </div>
          ) : (
            n.actor && (
              <Link
                to={buildProfileUrl(n.actor.handle)}
                onClick={handleOpen}
                className="shrink-0"
                aria-label={n.actor.displayName}
              >
                <Avatar
                  src={n.actor.avatarUrl}
                  name={n.actor.displayName}
                  size="sm"
                />
              </Link>
            )
          )}
          <div className="min-w-0 flex-1">
            <Link
              to={target}
              onClick={handleOpen}
              className="block break-words font-semibold hover:text-accent hover:underline"
            >
              {n.title}
            </Link>
            {visibleActors.length === 1 && n.actor && (
              <p className="mt-1 text-xs text-muted">
                {n.actor.displayName} (@{n.actor.handle})
              </p>
            )}
          </div>
        </div>

        {inlineAction && (inlineAction.canAct || inlineAction.resolved) && (
          <Stack className="gap-1.5 pt-1">
            {inlineAction.resolved ? (
              <p className="text-xs font-medium text-muted">
                {inlineAction.resolved === 'accepted' ? 'Accepted' : 'Declined'}
              </p>
            ) : (
              <Row className="gap-2">
                <Button
                  size="sm"
                  variant="default"
                  disabled={inlineAction.pending}
                  loading={inlineAction.pending}
                  onClick={inlineAction.onAccept}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={inlineAction.pending}
                  onClick={inlineAction.onDecline}
                >
                  Decline
                </Button>
              </Row>
            )}
            {inlineAction.error && (
              <p className="text-xs text-danger">{inlineAction.error}</p>
            )}
          </Stack>
        )}

        {canExpand && (
          <div className="pt-1">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-text"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? 'Hide updates' : `Show ${items.length} updates`}
            </button>
            {expanded && (
              <Stack className="mt-2 gap-2 border-l-2 border-border pl-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-2 text-xs"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      {item.actor && (
                        <Avatar
                          src={item.actor.avatarUrl}
                          name={item.actor.displayName}
                          size="sm"
                          className="h-5 w-5 text-[10px]"
                        />
                      )}
                      <div className="min-w-0">
                        <Link
                          to={resolveNotificationLink(item)}
                          onClick={handleOpen}
                          className="block break-words text-text hover:text-accent hover:underline"
                        >
                          {item.title}
                        </Link>
                        <span className="text-[11px] text-muted">
                          {formatNotificationTimestamp(item.createdAt, timezone)}
                        </span>
                      </div>
                    </div>
                    {!item.readAt && (
                      <span
                        aria-label="Unread item"
                        className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                      />
                    )}
                  </div>
                ))}
              </Stack>
            )}
          </div>
        )}

        {!compact && (
          <Row className="mt-1 justify-between">
            <Link to={target} onClick={handleOpen} className={linkButton}>
              {meta.actionLabel}
            </Link>
            <span className="text-xs text-muted">
              {unread
                ? unreadCount > 1
                  ? `${unreadCount} unread`
                  : 'Unread'
                : 'Read'}
            </span>
          </Row>
        )}
      </Stack>
    </Panel>
  )
}
