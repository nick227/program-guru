# Site Pages Inventory & Quick Breakdown

Source of truth: `apps/web/src/App.tsx` (React Router) and `apps/web/src/admin/registry.tsx`.

## App Shell & Layout Widths

All routes render inside `App.tsx` (`Root`), which provides a skip link, `PwaUpdatePrompt`, offline banner, and sticky header (`Program.Guru` brand link + `AccountMenu` or `Sign in`).

- **`page--wide`**: Calendar (`/`), My Programs (`/library`), Library Browser (`/browse`).
- **`page--content`**: Program (`/programs/:id`, `/@handle/:slug`), Occurrence (`/occurrences/:id`), Profile (`/@handle`).
- **Default (`Page` + `Stage`)**: Auth, Program Create, Program Workspace, Add Activity, Media, Notifications, Achievements, Group, Settings, Studio, Unsubscribe, Error/404.

## Public Routes

| Route | Component | Source | Purpose |
|---|---|---|---|
| `/login` | `LoginPage` | `pages/Login.tsx` | Email/password sign-in |
| `/register`, `/verify-email`, `/forgot-password`, `/reset-password` | `RegisterPage`, `VerifyEmailPage`, `ForgotPasswordPage`, `ResetPasswordPage` | `pages/Auth.tsx` | Account registration, verification, and password recovery |
| `/discover` | `DiscoverRedirect` | `App.tsx` | Redirects to `/browse` preserving query params |
| `/browse` | `LibraryBrowserPage` | `pages/Browse.tsx` | Community discovery & picker (`?category=`, `?type=`, `?focus=`, legacy `?facet=`, `?pick=`) |
| `/programs/:id`, `/:handle/:slug` | `ProgramPage` / `ProgramAliasRoute` | `pages/Program.tsx` | Program overview, schedule preview, people, and groups (`@handle` prefix required for alias) |
| `/activities/:id` | `ActivityPage` | `pages/Activity.tsx` | Reusable Activity details and instructions |
| `/join/:token` | `GroupInvitationJoinPage` | `pages/Group.tsx` | Accept a group invitation link |
| `/unsubscribe`, `/email/unsubscribe` | `UnsubscribePage` | `pages/Unsubscribe.tsx` | One-click email reminder opt-out |
| `/:handle`, `/u/:handle` | `ProfilePage` / `ProfileRedirect` | `pages/Profile.tsx` | Public profile (`/@handle`; bare or `/u/` redirects to `/@handle`) |
| `*` | `NotFoundPage` | `App.tsx` | 404 fallback |

## Signed-In Routes (`<AuthGuard />`)

| Route | Component | Source | Purpose |
|---|---|---|---|
| `/` | `CalendarPage` | `pages/Calendar.tsx` | Home schedule: Day, Week, Month, and Year views |
| `/library` | `LibraryPage` | `pages/MyPrograms.tsx` | "My Programs" library with status, ownership, and search filters |
| `/programs/new` | `ProgramCreatePage` | `pages/ProgramCreate.tsx` | Create Program (choose type, title, cover, starting point) |
| `/programs/:id/workspace[/:step]` | `ProgramWorkspacePage` | `pages/ProgramWorkspace.tsx` | 3-step authoring workspace: `details`, `activities`, `publish` |
| `/occurrences/:id` | `OccurrencePage` | `pages/Occurrence.tsx` | Dated occurrence execution, instructions, metrics, media, and social |
| `/add-activity` | `AddActivityPage` | `pages/AddActivity.tsx` | Create or pick a standalone Activity and place it on the Calendar |
| `/media` | `MediaStudioPage` | `pages/MediaStudio.tsx` | User media library, upload, and camera capture |
| `/media/:id` | `MediaPublicationPage` | `pages/MediaPublication.tsx` | Media item view with group discussion |
| `/notifications` | `NotificationsPage` | `pages/Notifications.tsx` | Filterable notification feed and upcoming reminders |
| `/achievements` | `AchievementsPage` | `pages/Achievements.tsx` | Earned achievements and profile visibility toggles |
| `/groups/:id[/invitations/:invitationId]` | `GroupPage` | `pages/Group.tsx` | Group hub, activity/media feed, and invitation actions |
| `/settings[/follow-requests\|/billing]` | `SettingsPage` | `pages/Settings.tsx` | Preferences, timezone/reminders, follow requests, and billing |
| `/studio` | `StudioPage` | `pages/Studio.tsx` | Creator Studio (`?section=`): `library`, `publishing`, `channel`, `audience`, `dashboard`, `organization` |
| `/admin/*` | `AdminApp` | `admin/registry.tsx` | Moderator/admin CRUD console across 11 registered resources |

## Quick Breakdown

- **Totals**: 21 page/app modules (`20` files in `apps/web/src/pages/` + `admin/registry.tsx`) serving 34 route entries in `App.tsx` (15 public, 18 authenticated, 1 catch-all `*`) plus dynamic admin sub-routes.
- **Navigation model**: No persistent sidebar; users navigate via `AccountMenu` (Profile, Studio, My Programs, Media, Notifications, Achievements, Settings, Admin), Calendar sub-header (`+ Program`, Browse, `+ Activity`), and contextual `Back` / `returnTo` links.
- **Multi-panel & multi-step pages**:
  - **Studio** (`/studio`): 6 `?section=` panels (`library` default, `publishing`, `channel`, `audience`, `dashboard`, `organization`).
  - **Program Workspace** (`/programs/:id/workspace`): 3 steps (`details`, `activities`, `publish`).
  - **Admin** (`/admin/*`): Index defaults to `content`; resources at `content`, `programs`, `activities`, `users`, `audit`, `moderation`, `moderation/media`, `membership`, `membership/subscriptions`, `membership/purchases`, `membership/prices` (with `/new`, `/import`, `/:id` where configured).
- **Discovery routing**: `/discover` redirects to `/browse` preserving query params; `/programs/new` remains guarded.
