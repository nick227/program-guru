import { useState } from 'react'
import {
  useCurrentUser,
  useMarkNotificationsRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@project/sdk'
import { Page, Stage, Stack, Panel, Row } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back } from '@/components/shared/Navigation'
import { UnreadDot } from '@/components/shared/UnreadDot'
import { NotificationRow } from '@/components/account/NotificationRow'
import { UpcomingRemindersPanel } from '@/components/account/UpcomingRemindersPanel'
import {
  getNotificationMeta,
  notificationUnreadCount,
  type NotificationCategory,
  type NotificationType,
} from '@/lib/notifications'
import { useNotificationActions } from '@/lib/useNotificationActions'
import { useDocumentTitle } from '@/lib/title'

const FILTERS: { id: NotificationCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'direct', label: 'Direct' },
  { id: 'groups', label: 'Groups' },
  { id: 'reminder', label: 'Reminders' },
  { id: 'participation', label: 'Participation' },
  { id: 'achievement', label: 'Achievements' },
  { id: 'program', label: 'Updates & Social' },
]

const DIRECT_TYPES = new Set<NotificationType>([
  'FOLLOW_REQUEST',
  'FOLLOW_ACCEPTED',
  'GROUP_INVITE',
  'COMPLETION_COMMENT',
  'GROUP_MEDIA_COMMENT',
  'COMPLETION_REACTION',
  'PROGRAM_ACCESS',
  'CONTRIBUTION_APPROVED',
  'PAYMENT_ISSUE',
])

const GROUPS_TYPES = new Set<NotificationType>([
  'GROUP_INVITE',
  'MEMBER_JOINED',
  'COMPLETION_SHARED',
  'COMPLETION_REACTION',
  'COMPLETION_COMMENT',
  'GROUP_MEDIA_SHARED',
  'GROUP_MEDIA_COMMENT',
])

export function NotificationsPage() {
  useDocumentTitle('Notifications')
  const me = useCurrentUser()
  const [filter, setFilter] = useState<NotificationCategory>('all')
  const list = useNotifications({ filter })
  const unread = useUnreadNotificationCount()
  const mark = useMarkNotificationsRead()

  const timezone = me.data?.data.preferences.timezone ?? 'UTC'
  const rows = list.data?.pages.flatMap((p) => p.data) ?? []
  const unreadTotal =
    unread.data?.count ??
    rows.reduce((sum, n) => sum + notificationUnreadCount(n), 0)
  const hasUnread =
    unreadTotal > 0 || rows.some((n) => notificationUnreadCount(n) > 0)

  const getInlineAction = useNotificationActions({
    rows,
    onMarkRead: (ids) => mark.mutate({ ids }),
  })

  const filteredRows = rows.filter((n) => {
    if (filter === 'all') return true
    if (filter === 'unread') return notificationUnreadCount(n) > 0
    if (filter === 'direct') return DIRECT_TYPES.has(n.type)
    if (filter === 'groups') return GROUPS_TYPES.has(n.type)
    return getNotificationMeta(n.type).category === filter
  })

  return (
    <Page className="page--content">
      <Stage>
        <Row className="justify-between">
          <Back to="/calendar">Calendar</Back>
        </Row>

        <Row className="justify-between">
          <Row className="gap-2">
            <h1>Notifications</h1>
            <UnreadDot count={unreadTotal} inline />
          </Row>
          <Button
            variant="outline"
            disabled={!hasUnread || mark.isPending}
            loading={mark.isPending}
            onClick={() => mark.mutate({ all: true })}
          >
            Mark all read
          </Button>
        </Row>

        <Row
          role="tablist"
          aria-label="Filter notifications"
          className="flex-nowrap overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
        >
          {FILTERS.map((tab) => {
            const active = filter === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tab.id)}
                className={`min-h-11 min-w-11 shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-accent bg-accent text-white'
                    : 'bg-surface text-muted hover:bg-surface-muted hover:text-text'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </Row>

        <ErrorMessage
          error={list.error || mark.error}
          retry={() => void list.refetch()}
        />

        {list.isPending ? (
          <Loading />
        ) : filteredRows.length === 0 ? (
          <Panel>
            <p className="text-muted">
              {filter === 'all'
                ? 'You are caught up.'
                : filter === 'unread'
                  ? 'No unread notifications.'
                  : 'No notifications in this category.'}
            </p>
          </Panel>
        ) : (
          <Stack className="gap-2">
            {filteredRows.map((n) => (
              <NotificationRow
                key={n.groupKey ?? n.id}
                notification={n}
                timezone={timezone}
                marking={mark.isPending}
                inlineAction={getInlineAction(n)}
                onMarkRead={(ids) => mark.mutate({ ids })}
              />
            ))}
          </Stack>
        )}

        {list.hasNextPage && (
          <Button
            variant="outline"
            loading={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            Load more
          </Button>
        )}

        <UpcomingRemindersPanel />
      </Stage>
    </Page>
  )
}
