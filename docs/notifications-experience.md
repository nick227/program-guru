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
| `GROUP_INVITE` (email/link) | `/join/:token` | [`GroupInvitationJoinPage`](../apps/web/src/pages/Group.tsx) (invitation preview, privacy disclosure, `join.status`-driven schedule confirmation, `Accept invitation` / `Decline invitation`) |
| `GROUP_INVITE` (handle) | `/groups/:id/invitations/:invitationId` | [`GroupPage`](../apps/web/src/pages/Group.tsx) (loads received invitation via `GET /users/me/group-invitations`, drives acceptance via `POST /users/me/group-invitations/:invitationId/accept` and `join.status`, and links directly to the user's personal Calendar) |
| `GROUP_INVITE_ACCEPTED`, `GROUP_MEMBER_JOINED`, `GROUP_MEMBER_COMPLETED` | `/groups/:id` | [`GroupPage`](../apps/web/src/pages/Group.tsx) (members, personal schedule card, completion sharing toggle, group mute toggle, leave/remove controls, completions feed with Program Day labels and emoji reactions) |
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

## 5. Group Invitation & Participation Integration (`b4fcc98`)

- **Handle-based & Received Invitations (`/groups/{groupId}/invitations/{invitationId}` & `GET /users/me/group-invitations`)**:
  - When a user opens `/groups/:id/invitations/:invitationId` (or `/groups/:id` with a pending invitation), [`GroupPage`](../apps/web/src/pages/Group.tsx) queries `useMyGroupInvitations()` (`GET /users/me/group-invitations`) to render the received `InvitationPreview` without requiring a raw link token.
  - Acceptance calls `useAcceptMyGroupInvitation()` (`POST /users/me/group-invitations/{invitationId}/accept`) and decline calls `useDeclineMyGroupInvitation()` (`POST /users/me/group-invitations/{invitationId}/decline`).
- **`join.status`-Driven Enrollment & Schedule Confirmation**:
  - Both `/join/:token` (`GroupInvitationJoinPage`) and `/groups/:id/invitations/:invitationId` (`GroupPage`) drive their decision controls from `preview.join.status`:
    - `CONFIRM_ENROLLMENT` (`SYNC` group): Displays the group's shared start date and timezone selector, sending `{ enrollment: { startLocalDate, timezone, idempotencyKey } }` on acceptance.
    - `SELECT_SCHEDULE` (`ASYNC` group): Displays start date and timezone controls so the participant chooses their own schedule on acceptance.
    - `READY_TO_JOIN`: Links the user's existing active enrollment for the Program without altering their personal calendar dates (highlighting `Program Day` comparison when `startDateDiffers` is true).
    - `ALREADY_MEMBER`, `SIGN_IN_REQUIRED`, `ACCESS_REQUIRED`, `PAYMENT_REQUIRED`, `ENROLLED_OTHER_VERSION`, `LEAVE_OTHER_GROUP`, `UNAVAILABLE`: Renders contextual guidance and actions.
- **Leaving & Member Removal**:
  - Leaving (`PATCH /groups/{groupId}/members/me` `{ leave: true }`) or owner removal (`DELETE /groups/{groupId}/members/{userId}`) immediately revokes group access (`GET /groups/{groupId}` returns `404`), unlinks the enrollment, and revokes group completion shares while preserving the participant's personal calendar items, sessions, results, and media.


