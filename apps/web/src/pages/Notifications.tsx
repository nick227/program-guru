import { useState } from 'react'
import {
  useCalendar,
  useCurrentUser,
  useMarkNotificationsRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@project/sdk'
import { Page, Stage, Row } from '@/components/ui/Layout'
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
import { addDays, today } from '@/lib/dates'
import { Bell, CheckCheck } from 'lucide-react'

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
  const currentDay = today(timezone)
  const calendar = useCalendar(currentDay, addDays(currentDay, 1))
  const todayItems = (calendar.data ?? []).filter(
    (item) => item.localDate === currentDay,
  )

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

        <Row className="justify-between items-center">
          <Row className="gap-2.5 items-center">
            <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
            <UnreadDot count={unreadTotal} inline />
          </Row>
          <Button
            variant="outline"
            disabled={!hasUnread || mark.isPending}
            loading={mark.isPending}
            onClick={() => mark.mutate({ all: true })}
            className="rounded-full text-xs font-semibold h-8 px-3 border-border/70 hover:bg-surface-muted"
          >
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
            Mark all read
          </Button>
        </Row>

        {/* Filter Navigation: Sleek iOS/Android pill tray */}
        <div
          role="tablist"
          aria-label="Filter notifications"
          className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar sm:flex-wrap sm:overflow-visible sm:pb-0"
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
                className={`min-h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 py-1 text-xs font-semibold transition-all ${
                  active
                    ? 'bg-accent text-white shadow-sm'
                    : 'bg-surface/80 dark:bg-surface/50 border border-border/50 text-muted hover:border-border hover:bg-surface-muted hover:text-text'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <ErrorMessage
          error={list.error || mark.error}
          retry={() => void list.refetch()}
        />

        {list.isPending ? (
          <Loading />
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-surface/40 p-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-muted text-muted shadow-sm">
              <Bell className="h-6 w-6 opacity-60" />
            </div>
            <p className="text-base font-semibold text-text">
              {filter === 'all'
                ? 'You are caught up.'
                : filter === 'unread'
                  ? 'No unread notifications.'
                  : 'No notifications in this category.'}
            </p>
            <p className="mt-1 text-xs text-muted max-w-sm">
              {filter === 'all'
                ? 'New reminders, milestone unlocks, and group updates will appear here.'
                : filter === 'unread'
                  ? 'You have reviewed all your active notifications.'
                  : 'Try switching to All to view your previous notifications.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredRows.map((n) => (
              <NotificationRow
                key={n.groupKey ?? n.id}
                notification={n}
                timezone={timezone}
                marking={mark.isPending}
                inlineAction={getInlineAction(n)}
                onMarkRead={(ids) => mark.mutate({ ids })}
                todayItems={todayItems}
              />
            ))}
          </div>
        )}

        {list.hasNextPage && (
          <Button
            variant="outline"
            className="w-full rounded-2xl py-2.5 font-semibold text-xs border-border/70 hover:bg-surface-muted"
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
