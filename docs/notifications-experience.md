# P1 Notifications, Reminders & Inbox Experience

## Overview

This document describes the frontend implementation and backend contract integration for the P1 Notifications, Reminders, and Inbox experience in `programs-app`.

## 1. Notification Surfaces & UX

- **Calendar Header Account Widget ([`AccountMenu.tsx`](../apps/web/src/components/AccountMenu.tsx))**:
  - Accessible directly from the Calendar header without a global sidebar or shell (`03-UX.md` §1, §5).
  - Displays a restrained unread count indicator ([`UnreadDot.tsx`](../apps/web/src/components/UnreadDot.tsx)) when `unreadCount > 0`.
  - **Desktop (`sm` and above)**: Opens a compact dropdown (`sm:w-96`) showing recent notifications, individual `Mark read` actions, `Mark all read`, and links to the full Inbox (`/notifications`) and reminder settings (`/settings#reminders`).
  - **Mobile (`< sm`)**: Renders a mobile-friendly bottom slide-up sheet (`fixed inset-x-0 bottom-0 rounded-t-2xl`) with backdrop and `Escape` close support.
- **Dedicated Notification Inbox ([`Notifications.tsx`](../apps/web/src/pages/Notifications.tsx), `/notifications`)**:
  - Category filter tabs (`All`, `Unread`, `Reminders`, `Groups`, `Participation`, `Achievements`, `Updates & Social`).
  - Cursor-based pagination (`Load more`) via `useNotifications()` (`GET /notifications?cursor=&limit=`).
  - Individual `Mark read` and batch `Mark all read` via `useMarkNotificationsRead()` (`POST /notifications/read`).
  - Contextual navigation via [`resolveNotificationLink()`](../apps/web/src/lib/notifications.ts) with automatic mark-read on click.
  - Loading, error + retry, filtered empty, and all-caught-up states.
  - Embedded [`UpcomingRemindersPanel.tsx`](../apps/web/src/components/UpcomingRemindersPanel.tsx) showing upcoming scheduled Activities in the user's configured timezone.

## 2. Contextual Deep-Link Routing

All `Notification.deepLink` targets emitted by `apps/server/src/worker/handlers.ts` and `apps/server/src/worker/jobs.ts` resolve to participant-facing routes in [`App.tsx`](../apps/web/src/App.tsx):

| Notification Type | Server Deep Link | Frontend Destination |
| --- | --- | --- |
| `ACTIVITY_REMINDER` | `/occurrences/:occurrenceId` | [`OccurrencePage`](../apps/web/src/pages/Occurrence.tsx) |
| `DAILY_REMINDER` | `/calendar` | [`CalendarPage`](../apps/web/src/pages/Calendar.tsx) |
| `PROGRAM_PUBLISHED`, `PROGRAM_UPDATED`, `ENROLLMENT_RESTARTED` | `/programs/:slug` | [`ProgramPage`](../apps/web/src/pages/Program.tsx) (includes `Update available` banner with `Accept update` / `Dismiss`) |
| `GROUP_INVITE` (email/link) | `/join/:token` | [`GroupInvitationPage`](../apps/web/src/pages/Group.tsx) (invitation preview, privacy disclosure, `Join Group`) |
| `GROUP_INVITE` (handle) | `/groups/:id/invitations/:invitationId` | [`GroupPage`](../apps/web/src/pages/Group.tsx) (group detail + token acceptance fallback when invitee is not yet an active member) |
| `GROUP_INVITE_ACCEPTED`, `GROUP_MEMBER_JOINED`, `GROUP_MEMBER_COMPLETED` | `/groups/:id` | [`GroupPage`](../apps/web/src/pages/Group.tsx) (members, completion sharing toggle, group mute toggle, completions feed with emoji reactions) |
| `COMPLETION_REACTION` | `/occurrences/:occurrenceId` | [`OccurrencePage`](../apps/web/src/pages/Occurrence.tsx) (shows collaborator reactions on the completion) |
| `GROUP_MEDIA_SHARED`, `GROUP_MEDIA_COMMENT`, `CONTRIBUTION_APPROVED` | `/media/:publicationId` | [`MediaPublicationPage`](../apps/web/src/pages/MediaPublication.tsx) |
| `FOLLOW_REQUEST` | `/settings/follow-requests` | [`SettingsPage`](../apps/web/src/pages/Settings.tsx) (`#follow-requests` section with `Approve` / `Decline`) |
| `FOLLOW_ACCEPTED` | `/u/:handle` | [`ProfilePage`](../apps/web/src/pages/Profile.tsx) |
| `ACHIEVEMENT_EARNED` | `/achievements` | [`AchievementsPage`](../apps/web/src/pages/Achievements.tsx) (`Share on profile` toggle) |

## 3. Activity Reminders & Preferences

- **Upcoming Scheduled Activities ([`UpcomingRemindersPanel.tsx`](../apps/web/src/components/UpcomingRemindersPanel.tsx), [`selectUpcomingReminders()`](../apps/web/src/lib/notifications.ts))**:
  - Selects upcoming `SCHEDULED` calendar items for today (where `localTime >= currentTime` in the user's IANA timezone) and future dates.
  - Deduplicates repeated occurrences (`occurrenceId` or `activityId:localDate:localTime`) so users never see duplicate reminder rows.
- **Reminder & Notification Preferences ([`Settings.tsx`](../apps/web/src/pages/Settings.tsx), `/settings`)**:
  - Persists `timezone` (validated IANA timezone), `inAppReminders`, `dailyEmail`, `dailyReminderTime` (`HH:mm`), `groupActivity`, `followRequests`, and `mutedGroupIds` via `PATCH /users/me/preferences`.
- **One-Time Daily Email Opt-In Prompt ([`Calendar.tsx`](../apps/web/src/pages/Calendar.tsx))**:
  - Triggered once after a user's first Program adoption (`03-UX.md` §5, `12-SOCIAL.md` §6), allowing immediate opt-in to daily email summaries or dismissal (`No thanks`).
- **One-Click Email Unsubscribe ([`Unsubscribe.tsx`](../apps/web/src/pages/Unsubscribe.tsx), `/unsubscribe`)**:
  - Consumes the signed `?token=` query parameter via `POST /email/unsubscribe` (`useUnsubscribeDailyEmail()`).

## 4. Query Refresh & No-Polling Strategy

- Removed the 60-second `refetchInterval` timer from `useUnreadNotificationCount()` in [`packages/sdk/src/hooks/useNotifications.ts`](../packages/sdk/src/hooks/useNotifications.ts).
- Relies on `refetchOnWindowFocus: true` and targeted React Query invalidations when opening the notification panel, marking notifications read, joining/updating enrollments, accepting invitations, or updating preferences.

## 5. Audited Backend Contract Notes

- **Handle-based `GROUP_INVITE` deep link (`/groups/{groupId}/invitations/{invitationId}`)**:
  - When a group member invites a user by handle (`kind: 'USER'`), `group.service.ts` hashes the invitation token (`sha256(token)`) before storing `GroupInvitation` and emits an outbox event containing `{ groupId, invitationId }` (without the raw `token`).
  - `apps/server/src/worker/handlers.ts` sets `deepLink: /groups/${p.groupId}/invitations/${p.invitationId}`.
  - However, `GET /groups/{groupId}` requires an `ACTIVE` group membership (`activeMember`), and `POST /group-invitations/{token}/accept` requires the raw invitation `token` (not `invitationId`).
  - **Frontend Handling**: Rather than inventing local state or modifying backend contracts, [`GroupPage`](../apps/web/src/pages/Group.tsx) handles `/groups/:id/invitations/:invitationId` gracefully and, if `GET /groups/:id` returns `404` while the user is still `INVITED`, explains the invitation link requirement and lets the user paste the raw invitation link/token to redirect to `/join/:token`.
  - **Recommended Backend Follow-up**: Add `POST /groups/{groupId}/invitations/{invitationId}/accept` (authenticated for `invitedUserId === req.user.id`) or include a short-lived signed token in the `GROUP_INVITE` outbox payload so handle-based invitations can be accepted in one click without the raw link token.

