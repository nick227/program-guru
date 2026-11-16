import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Flame,
  Heart,
  MessageSquare,
  Sparkles,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { components } from '@project/sdk'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import {
  formatLocalTime,
  formatNotificationTimestamp,
  notificationActors,
  notificationGroupCount,
  notificationIds,
  notificationUnreadCount,
  resolveNotificationLink,
} from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { buildProfileUrl } from '@/lib/urls'

type Notification = components['schemas']['Notification']
type CalendarItem = components['schemas']['CalendarItem']

export interface NotificationInlineAction {
  canAct: boolean
  pending?: boolean
  resolved?: 'accepted' | 'declined' | null
  error?: string | null
  onAccept: () => void
  onDecline: () => void
}

interface NotificationVisual {
  icon: LucideIcon
  badgeBg: string
  sourceName: string
  defaultSubtitle: string
}

function getNotificationVisual(type: string): NotificationVisual {
  switch (type) {
    case 'ACTIVITY_REMINDER':
      return {
        icon: Flame,
        badgeBg:
          'bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-500 dark:text-amber-400 border-amber-500/30 shadow-[0_2px_8px_rgba(245,158,11,0.15)]',
        sourceName: 'Activity Reminder',
        defaultSubtitle: 'Scheduled on your calendar · Ready to start',
      }
    case 'DAILY_SUMMARY':
      return {
        icon: CalendarDays,
        badgeBg:
          'bg-gradient-to-br from-violet-500/20 to-indigo-500/20 text-violet-500 dark:text-violet-400 border-violet-500/30 shadow-[0_2px_8px_rgba(139,92,246,0.15)]',
        sourceName: 'Daily Schedule',
        defaultSubtitle: 'Your planned activities for today',
      }
    case 'FOLLOW_REQUEST':
      return {
        icon: UserPlus,
        badgeBg:
          'bg-gradient-to-br from-sky-500/20 to-cyan-500/20 text-sky-500 dark:text-sky-400 border-sky-500/30 shadow-[0_2px_8px_rgba(14,165,233,0.15)]',
        sourceName: 'Follow Request',
        defaultSubtitle: 'Wants to follow your activity',
      }
    case 'FOLLOW_ACCEPTED':
      return {
        icon: UserCheck,
        badgeBg:
          'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-500 dark:text-emerald-400 border-emerald-500/30 shadow-[0_2px_8px_rgba(16,185,129,0.15)]',
        sourceName: 'Social',
        defaultSubtitle: 'Accepted your follow request',
      }
    case 'GROUP_INVITE':
      return {
        icon: Users,
        badgeBg:
          'bg-gradient-to-br from-teal-500/20 to-emerald-500/20 text-teal-500 dark:text-teal-400 border-teal-500/30 shadow-[0_2px_8px_rgba(20,184,166,0.15)]',
        sourceName: 'Group Invitation',
        defaultSubtitle: 'Invited you to train together with the group',
      }
    case 'MEMBER_JOINED':
      return {
        icon: Users,
        badgeBg:
          'bg-gradient-to-br from-blue-500/20 to-indigo-500/20 text-blue-500 dark:text-blue-400 border-blue-500/30 shadow-[0_2px_8px_rgba(59,130,246,0.15)]',
        sourceName: 'Group Update',
        defaultSubtitle: 'Joined your group',
      }
    case 'COMPLETION_SHARED':
      return {
        icon: CheckCircle2,
        badgeBg:
          'bg-gradient-to-br from-emerald-500/20 to-green-500/20 text-emerald-500 dark:text-emerald-400 border-emerald-500/30 shadow-[0_2px_8px_rgba(16,185,129,0.15)]',
        sourceName: 'Activity Completed',
        defaultSubtitle: 'Completed a scheduled activity',
      }
    case 'COMPLETION_REACTION':
      return {
        icon: Heart,
        badgeBg:
          'bg-gradient-to-br from-rose-500/20 to-pink-500/20 text-rose-500 dark:text-rose-400 border-rose-500/30 shadow-[0_2px_8px_rgba(244,63,94,0.15)]',
        sourceName: 'Reaction',
        defaultSubtitle: 'Cheered on your recent check-in',
      }
    case 'COMPLETION_COMMENT':
      return {
        icon: MessageSquare,
        badgeBg:
          'bg-gradient-to-br from-indigo-500/20 to-blue-500/20 text-indigo-500 dark:text-indigo-400 border-indigo-500/30 shadow-[0_2px_8px_rgba(99,102,241,0.15)]',
        sourceName: 'Discussion',
        defaultSubtitle: 'Commented on your check-in',
      }
    case 'GROUP_MEDIA_SHARED':
      return {
        icon: Sparkles,
        badgeBg:
          'bg-gradient-to-br from-purple-500/20 to-violet-500/20 text-purple-500 dark:text-purple-400 border-purple-500/30 shadow-[0_2px_8px_rgba(168,85,247,0.15)]',
        sourceName: 'Group Media',
        defaultSubtitle: 'Shared media in the group',
      }
    case 'GROUP_MEDIA_COMMENT':
      return {
        icon: MessageSquare,
        badgeBg:
          'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-500 dark:text-indigo-400 border-indigo-500/30 shadow-[0_2px_8px_rgba(99,102,241,0.15)]',
        sourceName: 'Discussion',
        defaultSubtitle: 'Commented on shared group media',
      }
    case 'CONTRIBUTION_APPROVED':
      return {
        icon: CheckCircle2,
        badgeBg:
          'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-500 dark:text-emerald-400 border-emerald-500/30 shadow-[0_2px_8px_rgba(16,185,129,0.15)]',
        sourceName: 'Contribution',
        defaultSubtitle: 'Your submission was approved',
      }
    case 'PROGRAM_ACCESS':
      return {
        icon: Sparkles,
        badgeBg:
          'bg-gradient-to-br from-violet-500/20 to-purple-500/20 text-violet-500 dark:text-violet-400 border-violet-500/30 shadow-[0_2px_8px_rgba(139,92,246,0.15)]',
        sourceName: 'Program Access',
        defaultSubtitle: 'Full access granted to program content',
      }
    case 'PROGRAM_UPDATE':
      return {
        icon: Sparkles,
        badgeBg:
          'bg-gradient-to-br from-purple-500/20 to-indigo-500/20 text-purple-500 dark:text-purple-400 border-purple-500/30 shadow-[0_2px_8px_rgba(168,85,247,0.15)]',
        sourceName: 'Program Update',
        defaultSubtitle: 'A creator update is available to sync',
      }
    case 'ACHIEVEMENT_EARNED':
      return {
        icon: Trophy,
        badgeBg:
          'bg-gradient-to-br from-amber-500/20 to-yellow-500/20 text-amber-500 dark:text-yellow-400 border-amber-500/30 shadow-[0_2px_8px_rgba(245,158,11,0.15)]',
        sourceName: 'Milestone Unlocked',
        defaultSubtitle: 'Congratulations! You unlocked a new achievement',
      }
    case 'PAYMENT_ISSUE':
      return {
        icon: CreditCard,
        badgeBg:
          'bg-gradient-to-br from-red-500/20 to-rose-500/20 text-red-500 dark:text-red-400 border-red-500/30 shadow-[0_2px_8px_rgba(239,68,68,0.15)]',
        sourceName: 'Billing Notice',
        defaultSubtitle: 'Action required on your billing account',
      }
    default:
      return {
        icon: Bell,
        badgeBg:
          'bg-gradient-to-br from-accent/20 to-accent/10 text-accent border-accent/30 shadow-[0_2px_8px_rgba(0,0,0,0.05)]',
        sourceName: 'Notification',
        defaultSubtitle: 'New update',
      }
  }
}

export function NotificationRow({
  notification: n,
  timezone,
  marking = false,
  inlineAction,
  onMarkRead,
  todayItems,
}: {
  notification: Notification
  timezone?: string
  marking?: boolean
  inlineAction?: NotificationInlineAction
  onMarkRead?: (ids: string[]) => void
  todayItems?: CalendarItem[]
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
  const canExpand = items.length > 1
  const target = resolveNotificationLink(n)
  const visual = getNotificationVisual(n.type)
  const VisualIcon = visual.icon

  const isDailyNotice =
    n.type === 'DAILY_SUMMARY' ||
    /\b\d+\s+activities?\s+today\b/i.test(n.title)

  const handleOpen = () => {
    if (unread && onMarkRead) {
      onMarkRead(ids)
    }
  }

  return (
    <div
      data-testid={`notification-item-${n.id}`}
      data-unread={unread ? 'true' : 'false'}
      data-group-count={groupCount}
      className={cn(
        'group relative overflow-hidden rounded-2xl border p-3.5 sm:p-4 transition-all duration-200',
        unread
          ? 'border-border/80 bg-surface/90 dark:bg-surface/70 shadow-[0_4px_16px_rgba(0,0,0,0.05)] ring-1 ring-accent/20'
          : 'border-border/40 bg-surface/60 dark:bg-surface/40 opacity-90 hover:opacity-100 hover:border-border hover:shadow-sm',
      )}
    >
      {/* Subtle indicator bar for unread notifications */}
      {unread && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent rounded-l-2xl shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" />
      )}

      <div className="flex items-start gap-3.5">
        {/* Leading Visual: App Squircle / User Avatar */}
        {visibleActors.length > 1 ? (
          <div className="relative shrink-0 pt-0.5">
            <div
              className="flex items-center -space-x-3"
              aria-label={`${totalActors} people`}
            >
              {visibleActors.map((actor) => (
                <Link
                  key={actor.id}
                  to={buildProfileUrl(actor.handle)}
                  onClick={handleOpen}
                  aria-label={actor.displayName}
                  className="rounded-xl ring-2 ring-surface transition-transform hover:scale-105"
                >
                  <Avatar
                    src={actor.avatarUrl}
                    name={actor.displayName}
                    size="md"
                    className="h-10 w-10 sm:h-11 sm:w-11 rounded-[14px] shadow-sm"
                  />
                </Link>
              ))}
              {extraActors > 0 && (
                <span className="inline-flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-[14px] border border-border bg-surface-muted text-xs font-bold text-muted ring-2 ring-surface">
                  +{extraActors}
                </span>
              )}
            </div>
            <div
              className={cn(
                'absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-surface shadow-sm',
                visual.badgeBg,
              )}
            >
              <VisualIcon className="h-2.5 w-2.5" />
            </div>
          </div>
        ) : n.actor ? (
          <div className="relative shrink-0 pt-0.5">
            <Link
              to={buildProfileUrl(n.actor.handle)}
              onClick={handleOpen}
              className="block rounded-xl ring-2 ring-surface transition-transform hover:scale-105"
              aria-label={n.actor.displayName}
            >
              <Avatar
                src={n.actor.avatarUrl}
                name={n.actor.displayName}
                size="md"
                className="h-10 w-10 sm:h-11 sm:w-11 rounded-[14px] shadow-sm"
              />
            </Link>
            <div
              className={cn(
                'absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-surface shadow-sm',
                visual.badgeBg,
              )}
            >
              <VisualIcon className="h-2.5 w-2.5" />
            </div>
          </div>
        ) : (
          <div className="shrink-0 pt-0.5">
            <div
              className={cn(
                'flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-[14px] border transition-transform hover:scale-105',
                visual.badgeBg,
              )}
            >
              <VisualIcon className="h-5 w-5" />
            </div>
          </div>
        )}

        {/* Notification Main Content: Dominant Title + Time Row & Description */}
        <div className="min-w-0 flex-1">
          {/* Top Line: Strongly Dominant Headline & Right-Aligned Time / Mark Read */}
          <div className="flex items-baseline justify-between gap-2">
            <Link
              to={target}
              onClick={handleOpen}
              className="block text-[15px] sm:text-base font-bold text-text hover:text-accent tracking-tight leading-snug transition-colors line-clamp-1"
            >
              {n.title}
            </Link>

            <div className="flex shrink-0 items-center gap-1.5 text-xs">
              <span className="text-[11px] sm:text-xs text-muted/70 whitespace-nowrap">
                {formatNotificationTimestamp(n.createdAt, timezone)}
              </span>

              {unread && onMarkRead && (
                <button
                  type="button"
                  disabled={marking}
                  aria-label={`Mark "${n.title}" read`}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onMarkRead(ids)
                  }}
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent/10 transition-colors"
                >
                  <span
                    aria-label="Unread"
                    className="h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-accent/30 animate-pulse"
                  />
                  <span className="hidden sm:inline">Mark read</span>
                </button>
              )}
            </div>
          </div>

          {/* Subtitle / Descriptive Context */}
          {isDailyNotice ? (
            <div className="mt-1 space-y-1.5">
              <p className="text-xs text-muted leading-relaxed">
                {todayItems && todayItems.length > 0
                  ? "Today's scheduled agenda:"
                  : "You have scheduled activities for today. Tap to open your day's calendar."}
              </p>
              {todayItems && todayItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {todayItems.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface-muted/70 px-2 py-0.5 text-xs font-medium text-text shadow-sm"
                    >
                      <Clock className="h-3 w-3 text-accent" />
                      <span className="font-semibold text-accent">
                        {item.localTime
                          ? formatLocalTime(item.localTime)
                          : 'Anytime'}
                      </span>
                      <span className="text-muted/60">·</span>
                      <span className="truncate max-w-[150px]">{item.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : visibleActors.length === 1 && n.actor ? (
            <p className="mt-0.5 text-xs text-muted leading-relaxed">
              <span className="font-semibold text-text">
                {n.actor.displayName}
              </span>{' '}
              <span className="opacity-75">(@{n.actor.handle})</span> ·{' '}
              {visual.defaultSubtitle}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted leading-relaxed">
              {visual.defaultSubtitle}
            </p>
          )}

          {/* Inline Action Buttons (Mobile-styled like Google Messages / iOS banner) */}
          {inlineAction && (inlineAction.canAct || inlineAction.resolved) && (
            <div className="mt-3 flex items-center justify-end gap-2.5 pt-1">
              {inlineAction.resolved ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
                  <Check className="h-3.5 w-3.5 text-accent" />
                  {inlineAction.resolved === 'accepted'
                    ? 'Accepted'
                    : 'Declined'}
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-full px-3 text-xs font-semibold text-muted hover:text-text hover:bg-surface-muted"
                    disabled={inlineAction.pending}
                    onClick={inlineAction.onDecline}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-8 rounded-full px-4 text-xs font-semibold shadow-sm"
                    disabled={inlineAction.pending}
                    loading={inlineAction.pending}
                    onClick={inlineAction.onAccept}
                  >
                    Accept
                  </Button>
                </div>
              )}
              {inlineAction.error && (
                <p className="mt-1 text-xs text-danger">{inlineAction.error}</p>
              )}
            </div>
          )}

          {/* Grouped Updates (Expandable notification stack) */}
          {canExpand && (
            <div className="mt-2 pt-1.5 border-t border-border/40">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-text transition-colors"
              >
                {expanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {expanded ? 'Hide updates' : `Show ${items.length} updates`}
              </button>
              {expanded && (
                <div className="mt-2 space-y-1.5 pl-2.5 border-l-2 border-border/70">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-2 text-xs py-1"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        {item.actor && (
                          <Avatar
                            src={item.actor.avatarUrl}
                            name={item.actor.displayName}
                            size="sm"
                            className="h-4 w-4 text-[9px] rounded-md"
                          />
                        )}
                        <div className="min-w-0">
                          <Link
                            to={resolveNotificationLink(item)}
                            onClick={handleOpen}
                            className="block break-words font-medium text-text hover:text-accent"
                          >
                            {item.title}
                          </Link>
                          <span className="text-[11px] text-muted">
                            {formatNotificationTimestamp(
                              item.createdAt,
                              timezone,
                            )}
                          </span>
                        </div>
                      </div>
                      {!item.readAt && (
                        <span
                          aria-label="Unread item"
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
