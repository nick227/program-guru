import { Link } from 'react-router-dom'
import type { components } from '@project/sdk'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { linkButton } from '@/components/shared/Navigation'
import {
  formatNotificationTimestamp,
  getNotificationMeta,
  resolveNotificationLink,
} from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { buildProfileUrl } from '@/lib/urls'

type Notification = components['schemas']['Notification']

export function NotificationRow({
  notification: n,
  timezone,
  compact = false,
  marking = false,
  onMarkRead,
  onNavigate,
}: {
  notification: Notification
  timezone?: string
  compact?: boolean
  marking?: boolean
  onMarkRead?: (id: string) => void
  onNavigate?: (notification: Notification) => void
}) {
  const unread = !n.readAt
  const meta = getNotificationMeta(n.type)
  const target = resolveNotificationLink(n)

  const handleOpen = () => {
    if (unread && onMarkRead) {
      onMarkRead(n.id)
    }
    onNavigate?.(n)
  }

  return (
    <Panel
      data-testid={`notification-item-${n.id}`}
      data-unread={unread ? 'true' : 'false'}
      className={cn(
        'transition-colors',
        compact ? 'p-3' : 'p-4',
        unread ? 'border-accent bg-accent/5' : 'opacity-80',
      )}
    >
      <Stack className="gap-2">
        <Row className=" items-start justify-between gap-2">
          <Row className="min-w-0 flex-1 items-center gap-2">
            {unread && (
              <span
                aria-label="Unread"
                className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent"
              />
            )}
            <span className="rounded border px-1.5 py-0.5 text-[11px] font-medium text-muted">
              {meta.label}
            </span>
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
              onClick={() => onMarkRead(n.id)}
            >
              Mark read
            </Button>
          )}
        </Row>

        <div className="flex items-start gap-3">
          {n.actor && (
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
          )}
          <div className="min-w-0 flex-1">
            <Link
              to={target}
              onClick={handleOpen}
              className="block break-words font-semibold hover:text-accent hover:underline"
            >
              {n.title}
            </Link>
            {n.actor && (
              <p className="mt-1 text-xs text-muted">
                {n.actor.displayName} (@{n.actor.handle})
              </p>
            )}
          </div>
        </div>

        {!compact && (
          <Row className="mt-1 justify-between">
            <Link to={target} onClick={handleOpen} className={linkButton}>
              {meta.actionLabel}
            </Link>
            <span className="text-xs text-muted">
              {unread ? 'Unread' : 'Read'}
            </span>
          </Row>
        )}
      </Stack>
    </Panel>
  )
}

