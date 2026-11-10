# `apps/web` — Page and Component Composition Analysis

Status: analysis, 2026-11-10. Taken from the working tree, uncommitted files included (some belong to another agent's in-progress work). This document describes how the code is built today. It doesn't change any requirement. Requirements stay in `docs/specs/01–13`, and the locked layouts (`03-UX.md` §2, §4, §6) still apply. It replaces the component counts in `components-inventory.md` (2026-11-08), which listed 38 component files. There are now 65.

| Area | Files | Lines |
|---|---:|---:|
| `src/pages` (including `program-workspace/`, `studio/`) | 33 | 8,547 |
| `src/components` (domain) | 50 | 6,820 |
| `src/components/ui` (primitives) | 15 | 761 |
| `src/admin` | 18 | 1,933 |

---

> **2026-11-10:** `src/components/` is now organized by feature (`ui/`, `program/`, `program-authoring/`, `activity/`, `calendar/`, `media/`, `social/`, `account/`, `shared/`; see `apps/web/src/components/README.md`). `LibraryBrowser` is now `pages/Browse.tsx`. File paths below predate that move; the component names are unchanged.

## 1. Site map

All routes are declared in `src/App.tsx` under one `Root` layout. **Guard** means the route sits under `<AuthGuard />`.

### 1.1 Public routes

| Path | Page export | File | Purpose |
|---|---|---|---|
| `/login` | `LoginPage` | `pages/Login.tsx` | Sign in (`ui/Form`) |
| `/register` | `RegisterPage` | `pages/Auth.tsx` | Create an account |
| `/verify-email` | `VerifyEmailPage` | `pages/Auth.tsx` | Confirm an email token; resend |
| `/forgot-password` | `ForgotPasswordPage` | `pages/Auth.tsx` | Request a reset email |
| `/reset-password` | `ResetPasswordPage` | `pages/Auth.tsx` | Set a new password |
| `/discover` | `ProgramCreatePage` | `pages/ProgramCreate.tsx` | **Same page as `/programs/new`, without a guard** (see §6.3) |
| `/browse` | `LibraryBrowserPage` | `components/LibraryBrowser.tsx` | Browse Programs and Activities in the library, with a pick mode for returning a choice to the caller |
| `/:handle/:slug` | `ProgramPage` (only when the handle starts with `@`) | `pages/Program.tsx` | Creator-scoped Program URL `/@creator/slug` |
| `/programs/:id` | `ProgramPage` | `pages/Program.tsx` | Program detail by id or slug |
| `/activities/:id` | `ActivityPage` | `pages/Activity.tsx` | Reusable Activity detail |
| `/join/:token` | `GroupInvitationJoinPage` | `pages/Group.tsx` | Accept a group invitation link |
| `/unsubscribe`, `/email/unsubscribe` | `UnsubscribePage` | `pages/Unsubscribe.tsx` | One-click opt-out of email reminders |
| `/u/:handle` | redirect | `App.tsx` | Legacy link, redirects to `/@handle` |
| `/:handle` | `ProfilePage` for `@handle`; otherwise redirects to `/@handle` | `pages/Profile.tsx` | Public profile |
| `*` | `NotFoundPage` | `App.tsx` | |

### 1.2 Signed-in routes (Guard)

| Path | Page export | File | Purpose |
|---|---|---|---|
| `/` | `CalendarPage` | `pages/Calendar.tsx` | Home. Day, Week, Month and Year views |
| `/library` | `LibraryPage` | `pages/Discover.tsx` | "My Programs" (see §6.3 on the file name) |
| `/programs/new` | `ProgramCreatePage` | `pages/ProgramCreate.tsx` | Add Program: choose a type, a title, a cover and a starting point |
| `/programs/:id/workspace[/:step]` | `ProgramWorkspacePage` | `pages/ProgramWorkspace.tsx` | Three-step authoring workspace: details, activities, publish |
| `/occurrences/:id` | `OccurrencePage` | `pages/Occurrence.tsx` | Participant Activity for one dated occurrence (`03-UX.md` §6) |
| `/add-activity` | `AddActivityPage` | `pages/Activity.tsx` | Create a standalone Activity, or pick one, and place it on the Calendar |
| `/media` | `MediaStudioPage` | `pages/MediaStudio.tsx` | The user's media library |
| `/media/:id` | `MediaPublicationPage` | `pages/MediaPublication.tsx` | One media item, with its group discussion |
| `/notifications` | `NotificationsPage` | `pages/Notifications.tsx` | Filterable notifications and upcoming reminders |
| `/achievements` | `AchievementsPage` | `pages/Achievements.tsx` | Achievements and their visibility |
| `/groups/:id[/invitations/:invitationId]` | `GroupPage` | `pages/Group.tsx` | Group home, or an invitation decision |
| `/settings[/follow-requests\|/billing]` | `SettingsPage` | `pages/Settings.tsx` | One page. The sub-paths scroll to panel anchors |
| `/studio` | `StudioPage` | `pages/Studio.tsx` | Creator Studio, in six `?section=` panels |
| `/admin/*` | `AdminApp` | `admin/registry.tsx` | Admin built from the resource registry (`docs/admin-resources.md`) |

### 1.3 How users reach pages

There is no primary navigation (`03-UX.md` §2). Pages are reached three ways:

- **App header** (`Root`): the brand link to `/`, plus `AccountMenu` (bell popover and account menu) or `Sign in`.
- **AccountMenu links:** Profile, Studio, My Programs (`/library`), Media, Notifications, Achievements, Settings, and Admin for moderators.
- **Contextual links:** the Calendar sub-header (`+ Program`, Browse, `+ Activity`), a `Back` link on every secondary page (`components/Navigation.tsx`), and `returnTo` query parameters built by `lib/urls.ts` and `buildBrowseUrl`.

```text
Calendar (/) ──+ Program──▶ ProgramCreate ──Continue──▶ ProgramWorkspace ──Publish──▶ Program
    │      └──Browse────▶ /browse ──pick──▶ (back to the caller with a saved draft)
    │      └──+ Activity─▶ AddActivity ──place──▶ Calendar
    └──tile──▶ Occurrence ──▶ Program · Group · Media
AccountMenu ─▶ Profile · Studio · My Programs · Media · Notifications · Achievements · Settings · Admin
```

---

## 2. App shell

`App.tsx › Root` is the only layout route. It renders, in order:

1. A skip link to `#main`.
2. `PwaUpdatePrompt` (`components/PwaControls`).
3. An offline banner (`useOnline`).
4. A sticky header with the brand and `AccountMenu`, or `Sign in`.
5. `<Outlet />`.

On every route change it scrolls to the top and moves focus to `<main>`. `RouteError` and `NotFoundPage` use `Page`/`Stage` from `ui/Layout`. `AppToaster` is mounted in `main.tsx`.

Pages pick a width with a `Page` modifier:

- `page--wide`: Calendar, My Programs, `/browse`.
- `page--content`: Program, Occurrence, Profile.
- No modifier, with `Stage` as the column: every other page.

---

## 3. Page composition

Each tree lists the visual order of the page. Plain lines are sections written inline in the page file. `‹Name›` is an imported component.

### Calendar — `pages/Calendar.tsx` (521)
```text
Page.page--wide
├─ header.sub-header: "Calendar" · Browse Programs · Search (/browse) · + Activity
├─ Controls: ‹ prev · period heading · next › · Today · ‹SegmentedControl› Day/Week/Month/Year · filter menu
├─ Panel: daily-reminder prompt (offered once, inline time Input)
├─ Panel: undo removal
├─ YearOverview (local function)      — Year view
├─ ‹CalendarSurface› → ‹ActivityTile› (pill and card densities) → ‹AvatarStack›, ‹CategoryIcon›, ‹UnreadDot›
└─ Panel: "Nothing scheduled here" + Browse / Add Activity
```

### Add Program — `pages/ProgramCreate.tsx` (333)
```text
Page › Stage
├─ ‹Back› Calendar
├─ ‹ProgramHeader› (inline title)  ·  ‹ProgramStepper› (disabled, on "details")
├─ No type chosen: Grid of ProgramType buttons
└─ Type chosen: ‹MediaTray› cover · description textarea · Continue
               ‹SuggestionRail› "Suggested" (+ Browse → /browse in pick mode)
               starting-point row: ‹EntityHero size=thumb›
```
The type is kept in `?type=`. The draft is saved through `writeBrowseDraft` and read back with `readBrowseDraft` when the user returns from `/browse`.

### Program Workspace — `pages/ProgramWorkspace.tsx` (85) and `pages/program-workspace/`
```text
Page › Stage
├─ ‹WorkspaceHeader›  ·  ‹TitleEditor› → ‹ProgramHeader›  ·  ‹ProgramStepper›
└─ step (from useWorkspaceStep):
   ├─ details    ‹DetailsStep›    → ‹ProgramMediaTray› cover · description · ‹ProgramDurationButtons›
   ├─ activities ‹ActivitiesStep› → ‹WorkspaceActivityRow›×n (‹EntityHero›, ‹ActivityFrequencyButtons›,
   │                                 ‹ActivityDurationField›, ‹ActivityMediaTray›)
   │                                ‹CreateActivitySection› (‹MediaTray›, schedule controls)
   │                                links to /browse?kind=activities (‹LibraryBrowser› workspace mode)
   └─ publish    ‹PublishStep›    → ‹EntityHero› preview · ‹WorkspaceTogether› → ‹ProgramGroups›
```
This page is the area covered by the locked layout in `03-UX.md` §4. The spec describes one continuous page with no separate Details or Schedule section. The code splits it into three steps. Check this against the spec before Phase 3 sign-off (§6.4).

### Program detail — `pages/Program.tsx` (626)
```text
Page.page--content
├─ ‹ProgramHero› (→ ‹EntityHero›, ‹Avatar›, ‹MediaViewer›): back, badges, primary CTA, Edit Program
├─ Owner only: ‹ProgramOwnerBanner› + ‹ProgramOwnerEditPanel› (inline editor; → ‹EntityMediaTray›, ScheduleControls, ‹DeleteProgramDialog›)
├─ ‹ProgramPersonalOverview› (progress, run switcher, update offer, ‹ProgramLibraryActions›)
├─ section "Activities" ‹SectionHeader›
│   ├─ Owner editing: ‹WorkspaceActivityRow›×n + ‹CreateActivitySection› (taken from the workspace)
│   └─ Otherwise: grid of ‹ProgramActivityCard› (from the workspace, or the public safeActivityOutline)
├─ ‹ProgramPersonalDetailsGrid› (upcoming items, history, source, runs)
├─ Two columns: ‹ProgramSchedulePreview› (start date, Start Program), or the "Start Program" draft notice
│               ‹ProgramTogether› (→ ‹AvatarStack›, ‹ShareLinkCard›)
└─ ‹ReportButton›
```
This page reuses the workspace's activity editor in place. As a result, the participant view, the creator view and the authoring tools all meet in one 626-line file.

### Participant Activity — `pages/Occurrence.tsx` (910)
```text
Page.page--content › OccurrenceContent
├─ ‹Back› (Calendar, Program or My Programs, from the origin)
├─ Panel: blocker for unsaved results
├─ ActivityIdentity (local): ‹EntityHero›, ‹CategoryIcon›, ‹StatusText›, SessionElapsed, phase actions
│                            (Start / Complete / Pause / Resume / Undo / Upload)
└─ .activity-layout (bento grid)
   ├─ OccurrenceToday (local): stats strip · ‹MetricInput›×n · ‹OccurrenceInstructions›
   ├─ ‹ActivityTogether› (group only; → ‹Avatar›, ‹UnreadDot›, ‹GroupInviteLink›)
   ├─ ‹OccurrenceMedia› → ‹RelatedMedia› (→ ‹MediaTray›, ‹MediaViewer›), ‹RelatedMediaMenu›, ‹GroupMediaThread›
   └─ community aggregate line
```
The rows follow the locked order in `03-UX.md` §6 (Hero, Today, Together, Related Media), with one difference: **My Metrics is rendered inside `OccurrenceToday`**, not as its own row 3. There are three local components (`ActivityIdentity`, `OccurrenceToday`, `SessionElapsed`, about 450 lines together). They are good candidates to move into `components/occurrence/`.

### Activity — `pages/Activity.tsx` (543)
```text
ActivityPage:     Page › Stage › ‹Back› · title · ‹ReportButton› · Panel "Instructions" · ‹ActivityRelatedMedia›
AddActivityPage:  Page › Stage › ‹Back› · "Add Activity"
                  ├─ Panel: ‹ActivityMediaTray› · ‹ActivityBasicsFields› · date, time and repeat fields
                  └─ ‹SuggestionRail› "Suggestions" · ‹EntityHero› for the picked item · Browse → /browse?kind=activities
```
`ActivityPage` imports only the `RiverItem` type from `RelatedMediaRiver`. The rendered gallery is `ActivityRelatedMedia`.

### My Programs — `pages/Discover.tsx` › `LibraryPage` (294)
```text
Page.page--wide
├─ header.sub-header "My Programs": Calendar · Browse · + Program
├─ search Input · sort ‹Select› · status filter tabs
└─ list of ProgramRow (local): ‹EntityHero›, Status (‹StatusText›), Progress, ‹ProgramPeople›,
                               ‹ProgramLibraryActions› (→ ‹DeleteProgramDialog›)
   or ‹EmptyState›
```

### Library browser — `components/LibraryBrowser.tsx` › `LibraryBrowserPage` (580)
This is a full page that lives in `components/`. It has three modes: public browse, pick-and-return (for Add Program and Add Activity), and workspace (adds a picked Activity to a Program through `useAddExistingActivity`). It is built from `SegmentedControl` (Programs or Activities), search, creator and sort `Select`s, and grids of `SuggestionRail`/`DiscoveryCard` → `EntityHero`.

### Profile — `pages/Profile.tsx` (680)
```text
Page.page--content
├─ Identity header: ‹Avatar›, handle, private-account badge, counts, follow, unfollow and request buttons,
│                   ‹ReportButton›, OwnerFollowRequestsBadge, IncomingFollowRequestControls (local)
├─ section Programs    ‹SectionHeader› + ‹ProgramActivityCard› grid
├─ section Activities  ‹SectionHeader› + ‹ProgramActivityCard› grid
├─ section Media       ‹SectionHeader› + ‹ThumbnailGrid› (→ ‹MediaGrid›)
├─ aside: Milestones · ‹ShareLinkCard› "Share Profile" · Manage (owner only)
```

### Group — `pages/Group.tsx` (1,007, the largest page)
```text
GroupInvitationJoinPage: Page › Stage › "Group Invitation" › InvitationDecisionPanel (local; start-date and timezone choice)
GroupPage: Page › Stage
├─ Invitation state → InvitationDecisionPanel  ·  unavailable state
└─ Group home: title · Panel summary · Panel Participation & Notification settings (share completions, mute)
               Panel Members · Panel Invite Collaborators (by handle, by email, ‹GroupInviteLink›)
               Panel Manage group (owner) · Panel Group Completions · Panel Shared media
```
Every panel is written inline, and the page has seven mutation hooks. This is the strongest candidate for splitting into `pages/group/*Panel.tsx`, following the pattern `studio/` already uses.

### Settings — `pages/Settings.tsx` (466)
One `Stage` holds these panels: `#reminders` (timezone, in-app, email, time, group and follow toggles, group mutes, ‹UpcomingRemindersPanel›), `#follow-requests`, Account, Appearance, and `#billing`. Its `<select>` elements are raw HTML.

### Studio — `pages/Studio.tsx` (69) and `pages/studio/`
A tab `Row` driven by `?section=` (`studio/sections.ts`) renders one of these panels: `LibraryPanel` (→ ‹DeleteProgramDialog›), `PublishingPanel`, `ChannelPanel`, `AudiencePanel`, `DashboardPanel` or `OrganizationPanel`. This is the model to copy for Group and Settings.

### Smaller pages
| Page | Composition |
|---|---|
| Login, Auth (×4) | `AuthShell` (local) → `Panel` → `ui/Form` (schema-driven fields) |
| Notifications (144) | `Back` · filter `Row role=tablist` · `NotificationRow`×n · `UpcomingRemindersPanel` · `UnreadDot` |
| MediaStudio (103) | `Back` · `MediaLibrary` (→ `MediaGrid`, `MediaCapture`) · `MediaViewer` |
| MediaPublication (172) | `Back` · media panel · author `Avatar` · `ReportButton` · Panel "Group Discussion" |
| Achievements (118) | `Back` · a `Panel` per achievement with a visibility toggle |
| Unsubscribe (94) | `Back` · `Panel` showing the token result |
| Admin | `AdminLayout` → `ResourceTable` / `ResourceEditor` / `ResourceCreate` / `ResourceImport`, from the definitions in `admin/resources/*`. Reuses `EntityMediaTray` and `WorkspaceActivityRow` |

---

## 4. Component catalogue by layer

### 4.1 `ui/` primitives (15 files)
`Layout` (`Page`, `Stage`, `Panel`, `Row`, `Grid`, `Stack`) is used by about 50 files. `Button` and `Feedback` (`ErrorMessage`, `Loading`, `EmptyState`) are used by about 60 each. `Input` is used by 25 and `Select` by 7. `Textarea` (6) and `Form` (2) are used mostly by admin and auth. `Avatar` (11), `SectionHeader` (6), `SegmentedControl` (3), `StatusText` (5), `Spinner`, `Skeleton`, `AppToaster`, and `voice/*`.

### 4.2 Shared domain building blocks
| Component | Used by | Role |
|---|---|---|
| `Navigation` (`Back`, `linkButton`) | 26 files | Back link and link-styled button class |
| `EntityHero` (+ `useCategorySlugOf`) | 12 files | One visual identity for Programs and Activities: hero, card and thumb sizes, category fallback |
| `SuggestionRail` / `DiscoveryCard` | LibraryBrowser, Activity, ProgramCreate | Horizontal rail of pickable cards |
| `ProgramActivityCard` | Program, Profile | Card linking to a Program or an Activity |
| `ReportButton` | Activity, MediaPublication, Profile, Program | Report dialog |
| `AvatarStack`, `UnreadDot`, `CategoryIcon` | Tiles, groups, notifications | Small badges |
| `ShareLink` (`ShareLinkField`, `ShareLinkCard`) | ProgramTogether, Profile | Copyable public link |

### 4.3 Feature families
| Family | Components | Pages |
|---|---|---|
| Calendar | `CalendarSurface` → `ActivityTile` | Calendar |
| Program | `ProgramHero`, `ProgramHeader`, `ProgramStepper`, `ProgramOwnerEditor`, `ProgramPersonalOverview`, `ProgramSchedulePreview`, `ProgramTogether`, `ProgramGroups`, `ProgramPeople`, `ProgramLibraryActions`, `DeleteProgramDialog` | Program, ProgramCreate, Workspace, My Programs |
| Occurrence | `OccurrenceInstructions`, `OccurrenceMedia`, `MetricInput`, `ActivityTogether` | Occurrence |
| Activity | `ActivityBasicsFields`, `ActivityRelatedMedia` | Activity |
| Media | `MediaTray` (the shared tray, `04-UI.md` §4a), `EntityMediaTray` (`ProgramMediaTray`, `ActivityMediaTray`), `RelatedMedia`, `RelatedMediaMenu`, `RelatedMediaRiver`, `MediaViewer`, `MediaLibrary`, `MediaGrid`, `ThumbnailGrid`, `MediaCapture`, `GroupMediaThread` | Occurrence, Activity, Workspace, MediaStudio, Profile, Admin |
| Groups | `GroupInviteLink`, `GroupMediaThread`, `ProgramGroups` | Group, Occurrence, Workspace |
| Notifications and account | `AccountMenu`, `NotificationRow`, `UpcomingRemindersPanel`, `PwaControls` | Shell, Notifications, Settings |

### 4.4 Media composition chain
```text
MediaTray ─┬─ EntityMediaTray (Program/Activity cover, illustrations)  ← Workspace, ProgramOwnerEditor, Activity, Admin
           └─ RelatedMedia (+ MediaViewer) ─┬─ ActivityRelatedMedia (+ RelatedMediaMenu)  ← Activity
                                            ├─ OccurrenceMedia (+ RelatedMediaMenu, GroupMediaThread) ← Occurrence
                                            ├─ RelatedMediaRiver  ← (only its RiverItem type is used)
                                            └─ ProgramMediaGallery  ← (no consumer)
MediaLibrary (+ MediaGrid, MediaCapture) ← MediaStudio, MediaPicker (no consumer)
```

---

## 5. Composition patterns that are working

- **One identity component.** `EntityHero` is the single way Programs and Activities are drawn across 12 files, with category-themed fallbacks. Keep it that way.
- **One media tray.** Covers, illustrations and Related Media all build on `MediaTray`, which matches `04-UI.md` §4a.
- **Context returns through the URL.** `returnTo`, `buildBrowseUrl` and the browse-draft helpers let `/browse` act as a shared picker for Add Program, Add Activity and the Workspace, without modals.
- **Panels as files.** `studio/` and `program-workspace/steps/` show the right size: one file per panel or step, with a thin page that switches between them.
- **No `Card` or `Shell`.** All pages use `Layout` primitives as `CLAUDE.md` requires. The old `ui/Card` is gone.

---

## 6. Findings

### 6.1 Components with no consumer
**Status 2026-11-10:** done. All six components below have been deleted. `RiverItem` now lives in `RelatedMedia.tsx`.

These had no import anywhere in `src/`:

| Component | Lines | Note |
|---|---:|---|
| `MediaPicker` | 115 | The only other consumer of `MediaLibrary` besides MediaStudio. Replaced by `MediaTray` and `/browse`. |
| `MediaAttachments` | 90 | Replaced by `RelatedMedia` and `RelatedMediaMenu`. |
| `ProgramMediaGallery` | 27 | A thin `RelatedMedia` wrapper. Program detail doesn't render a gallery. |
| `ProgramParticipationStrip` | 84 | Probably replaced by `ProgramPersonalOverview`. |
| `SessionUpload` | 77 | Occurrence uploads go through `OccurrenceMedia` and `useEntityMedia`. |

`RelatedMediaRiver` (13 lines) wasn't rendered anywhere either. Only its `RiverItem` type was used, and that type has moved to `RelatedMedia.tsx`.

### 6.2 Layering inversions
`components/` and `lib/` should not depend on `pages/`. In the working tree they do. In committed `HEAD`, only `admin/sections/NestedActivities.tsx` does; the others come from uncommitted Program and Workspace work that is still in progress (`ScheduleControls.tsx` and `ProgramOwnerEditor.tsx` are untracked). **Status 2026-11-10:** done. `ScheduleControls`, `WorkspaceActivityRow`, `CreateActivitySection`, `useAddExistingActivity` and `types.ts` now live in `components/program-authoring/`. The Workspace steps, Program detail, `ProgramOwnerEditor`, `LibraryBrowser` and Admin import them from there. The three-step Workspace and its page-private parts (`useWorkspaceStep`, the step components, `WorkspaceHeader`) stay under `pages/program-workspace/`.

- `components/LibraryBrowser.tsx` imports `pages/program-workspace/hooks/useAddExistingActivity` and `pages/program-workspace/types`.
- `components/ProgramOwnerEditor.tsx` imports `pages/program-workspace/components/steps/ScheduleControls`.
- `pages/Program.tsx` imports `WorkspaceActivityRow` and `CreateActivitySection` from the workspace steps.
- `admin/sections/NestedActivities.tsx` imports `WorkspaceActivityRow`.
- `lib/scheduleProjection.ts`, `lib/discoveryCards.ts` and `lib/useEntityMedia.ts` take types from components (`SurfaceItem`, `DiscoveryCardModel`, `MediaTrayItem`). These are `import type` only, so it's minor, but those types belong in `lib/`.

**Fix:** move `ScheduleControls`, `WorkspaceActivityRow`, `CreateActivitySection`, `useAddExistingActivity` and the workspace `types.ts` into `components/program-authoring/`. They are shared authoring parts, not private to a page. Move the shared types that `lib/` needs into `lib/` or `@project/sdk`.

### 6.3 Names that don't match their routes
- `pages/Discover.tsx` exports `LibraryPage`, which is "My Programs" at `/library`.
- `/discover` renders `ProgramCreatePage` without a guard. This is apparently on purpose, because the button reads "Sign in to continue". It is still confusing next to `/browse`, which is the real discovery surface. Either redirect `/discover` to `/browse`, or rename it.
- `LibraryBrowserPage` is a route-level page that lives in `components/`.

Suggested renames: `Discover.tsx` → `MyPrograms.tsx`, and move `LibraryBrowser.tsx` to `pages/Browse.tsx`, keeping its `buildBrowseUrl` and draft helpers in `lib/browse.ts`.

### 6.4 Places to check against the spec
**Status 2026-11-10:** resolved in the spec. `03-UX.md` §4 now describes the approved three-step Workspace and the owner's inline editing on Program detail. §6 records that My Metrics renders inside Today and allows the optional community line.

- **Workspace (§4, locked):** the spec describes one page (header, name, Activities list, inline schedule, `Preview & Publish`). The code has a three-step `ProgramStepper`. Program detail also adds a second inline editor (`ProgramOwnerEditPanel` plus `WorkspaceActivityRow`). Decide which one is canonical, or record in the spec that the steps are allowed.
- **Participant Activity (§6, locked):** My Metrics is merged into Today, not shown as row 3. A community aggregate line is added after Related Media, but the spec says "These rows are the whole page". Confirm or adjust.

### 6.5 Pages too large to work in comfortably
| Page | Lines | Suggested split |
|---|---:|---|
| `Group.tsx` | 1,007 | `pages/group/`: InvitationDecision, Participation, Members, Invite, Manage, Completions, SharedMedia |
| `Occurrence.tsx` | 910 | `components/occurrence/`: ActivityIdentity, OccurrenceToday, SessionElapsed. Keep the session state machine in a hook |
| `Profile.tsx` | 680 | `ProfileIdentity`, `FollowControls`, and the sections |
| `Program.tsx` | 626 | Move the owner-editing branch of the Activities section into one component |
| `LibraryBrowser.tsx` | 580 | Separate the three modes from the grid and filters |

### 6.6 Inconsistent primitives
- Raw `<select>` appears in Settings, Group, ProgramGroups, RelatedMediaMenu and four `studio/*` panels, even though `ui/Select` exists.
- Raw `<textarea>` appears in ProgramCreate, ActivityBasicsFields, three workspace steps and ChannelPanel, even though `ui/Textarea` exists. As a result, voice input and error wiring are inconsistent across forms.
- **Status 2026-11-10, dialogs:** done. `ui/Dialog` (with `useModalDialog`) is the only native `<dialog>`. Confirmations, Report, the media viewer and capture all use it, and every one returns focus to its opener. AccountMenu's popover is intentionally not a modal.
- Dialogs were hand-built in eight components: ReportButton, MediaViewer, MediaCapture, DeleteProgramDialog, ProgramLibraryActions, AccountMenu, MediaPicker, and admin `actions`. A shared `ui/Dialog` with one focus trap would remove most of that duplication.

---

## 7. Suggested order of work
1. ~~Delete the unused components (§6.1).~~ Done.
2. ~~Move the shared authoring parts out of `pages/program-workspace` (§6.2).~~ Done.
3. Settle the Workspace and Occurrence questions against `03-UX.md` §4 and §6 (§6.4), changing the spec first if needed.
4. Split `Group.tsx` and `Occurrence.tsx` (§6.5).
5. Rename the files listed in §6.3, add `ui/Dialog`, and replace the raw `select` and `textarea` elements (§6.6).
