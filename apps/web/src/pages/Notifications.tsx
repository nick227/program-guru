import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useCurrentUser,
  useMarkNotificationsRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@project/sdk'
import { Page, Stage, Stack, Panel, Row } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/shared/Navigation'
import { UnreadDot } from '@/components/shared/UnreadDot'
import { NotificationRow } from '@/components/account/NotificationRow'
import { UpcomingRemindersPanel } from '@/components/account/UpcomingRemindersPanel'
import {
  getNotificationMeta,
  type NotificationCategory,
} from '@/lib/notifications'
import { useDocumentTitle } from '@/lib/title'

const FILTERS: { id: NotificationCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'reminder', label: 'Reminders' },
  { id: 'group', label: 'Groups' },
  { id: 'participation', label: 'Participation' },
  { id: 'achievement', label: 'Achievements' },
  { id: 'program', label: 'Updates & Social' },
]

export function NotificationsPage() {
  useDocumentTitle('Notifications')
  const me = useCurrentUser()
  const list = useNotifications()
  const unread = useUnreadNotificationCount()
  const mark = useMarkNotificationsRead()
  const [filter, setFilter] = useState<NotificationCategory>('all')

  const timezone = me.data?.data.preferences.timezone ?? 'UTC'
  const rows = list.data?.pages.flatMap((p) => p.data) ?? []
  const unreadTotal =
    unread.data?.count ?? rows.filter((n) => !n.readAt).length
  const hasUnread = unreadTotal > 0 || rows.some((n) => !n.readAt)

  const filteredRows = rows.filter((n) => {
    if (filter === 'all') return true
    if (filter === 'unread') return !n.readAt
    return getNotificationMeta(n.type).category === filter
  })

  return (
    <Page>
      <Stage>
        <Row className="justify-between">
          <Back to="/">Calendar</Back>
          <Link to="/settings" className={linkButton}>
            Reminder preferences
          </Link>
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

        <Row role="tablist" aria-label="Filter notifications">
          {FILTERS.map((tab) => {
            const active = filter === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tab.id)}
                className={`min-h-11 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
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
                key={n.id}
                notification={n}
                timezone={timezone}
                marking={mark.isPending}
                onMarkRead={(id) => mark.mutate({ ids: [id] })}
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
