# Frontend foundation and first browser slice

Status: local implementation, 2026-11-07. This describes implementation decisions; requirements remain in `docs/specs/01–13`. Backend work remains owned by Claude. No API/schema/migration changes are part of this work.

## Inventory before implementation

- `apps/web` and `apps/worker` absent; working tree clean at the initial inventory.
- Existing SDK: `openapi-fetch`, generated OpenAPI types, auth hooks; retain this client.
- OpenAPI: 148 operations; enough to compose the core OPEN/free Program journey.
- Page generator still emitted per-operation CRUD screens with Shell/Card. It is now an explicit no-op so existing bootstrap callers cannot recreate that architecture.
- Real seed script absent at inventory; test fixtures are not a usable application library.
- Verified author/participant test accounts not configured in frontend environment.
- Backend changes appeared during implementation and were left untouched.

## Scope

One path: sign in → seeded Program discovery → create a Program from existing Activities → edit its title → review automatic schedule → publish OPEN → another account joins after a dated placement preview → weekly calendar → record results, Start/Pause/Resume/Finish → return to original week/day → Undo.

Existing drafts are resumable through My Programs. The minimal Activity detail and standalone Add Activity routes make the calendar's existing entry points usable. This is not the full P1 UI: no billing, media capture/viewer, profiles, notifications, group editing, advanced recurrence, custom Activity authoring, or manual placement editor has been built. Media sections display counts only in this slice. The session controller preserves the mandated row order and hides empty collaboration/community sections.

## Routing and focus

- `/`: personal Calendar. `?week=YYYY-MM-DD&day=YYYY-MM-DD` owns selection; dates are validated. Today is evaluated in the authenticated user's preference timezone.
- `/discover`: public Program discovery; `q` and return origin in the URL.
- `/programs/new`: focused type/focus selection; creates a private server draft.
- `/programs/:id`: public preview, authenticated free join, dated enrollment preview.
- `/programs/:id/workspace`: owner workspace. `?panel=activities|edit|calendar|publish` opens a single focused view. These are full views in the initial slice, not nested modals. Refresh/direct links restore the selected view, and browser Back returns naturally.
- `/occurrences/:id?returnTo=...`: dated Activity; successful Finish returns to a validated same-app calendar URL with `completed=<itemId>` for Undo.
- `/activities/:id`: reusable Activity detail, distinct from a dated occurrence.
- `/library`, `/add-activity`, `/login`: narrow supporting routes.

No persistent navigation shell or sidebar. The Calendar account widget exposes My Programs, theme, and sign out. Unknown routes show Not found rather than silently redirecting. Route-level failures have a recovery screen. Path changes focus the main landmark; browser Back and ordinary links remain available. Only 401 means sign-in required; auth server failures remain retryable errors.

## Server cache and SDK ownership

All remote queries/mutations live in `packages/sdk/src/hooks`. Pages import SDK hooks; components receive props. No browser imports from server/Prisma and no new transport layer. `apiData` only unwraps the existing client's response, preserving status/code/message/fieldErrors/requestId through `ApiError`.

Central keys are in `packages/sdk/src/queryKeys.ts`. Every resource key also includes the current viewer ID (or anonymous), including public DTOs that carry viewer permissions, so an identity change cannot reuse another user’s projection. Filters are part of list keys; paginated discovery, Activity picker, and My Programs use cursors. Calendar keys include both range endpoints. Workspace, placements, preview, and publish-check are separate query resources under a Program prefix.

The application QueryClient owns confirmed server state. No duplicate entity store, localStorage auth, persistent private cache, or offline mutation queue. Queries consume AbortSignals. Login/register/logout cancel requests and clear caches to prevent account-switch reuse. Foreground refetch is enabled; cached content remains during refresh. Read retries exclude 4xx; writes have no automatic retries and reject offline.

| Mutation | Invalidated resources |
|---|---|
| Create Program | My Programs |
| Edit draft / add Activities | Program workspace, placements, publish-check, previews and lists |
| Publish | Programs and discovery |
| Join | Programs, discovery, calendar ranges |
| Create session / save results | Dated occurrence |
| Session action / Undo | Calendar ranges, occurrences, Programs, achievement prefix |
| Add standalone Activity | Calendar ranges |

Invalidation completes before mutation success is surfaced. Finish and Undo never optimistically assert completion. Program draft mutations share a serialization scope; stale revisions are still rejected rather than automatically rebased. A VERSION_CONFLICT refetches relevant server state without erasing local edits.

## Draft and write rules

- Title edits live in a local controller separate from the server query. A 600ms debounce sends a snapshot with `expectedRevision`; only one write runs at a time. Further typing remains local and is sent after the previous save confirms its revision.
- Refetch never replaces an edited title. Conflict UI shows the server title and requires an explicit discard or save-against-current-version decision.
- Invalid/empty titles are not autosaved. Other authoring actions are explicit, confirmed mutations; no global form engine.
- Navigation with dirty text/results is blocked until the user stays or explicitly discards. Browser unload warns. Inputs are not stored on disk; a forced reload can lose unsaved text.
- Offline edits remain local and require explicit Retry after reconnection. No replay occurs on reconnect. Write controls are disabled offline.
- Join and session creation keep an idempotency key for a particular attempt. Changed join inputs start a new attempt. SDK mutations do not invent unsupported idempotency fields.
- Only entered metrics are sent. Targets/previous values remain visibly separate suggestions. Confirmed result groups are removed from the local dirty set; Finish waits for pending result writes, then the server action.
- Result writes and session transitions are not one atomic API call. A result save can succeed while Finish fails; the UI remains on the Activity and offers a server refresh. This is explicit partial progress, never a successful completion.

## Visual system

Factory templates supply the standard Button, Input, Textarea, Form, Avatar, Skeleton, Spinner, and EmptyState; project adaptations enforce semantic tokens, accessible labels and 44px controls. Page/Stage/Panel/Row/Grid/Stack are thin native wrappers. No Card or Shell.

Light palette: background `#eef2f6`, white surfaces, slate text, muted blue-gray borders, teal primary actions. Optional dark palette follows the system preference with a user override. Trebuchet display headings and Segoe/system body type avoid external font dependencies. The prominent seven-day selector is the visual anchor. Mobile shows the selected day; desktop shows seven columns. Motion is limited to short state transitions and disabled for reduced motion.

## API dependencies and handoff to Claude

1. **Live prerequisites:** supply a rights-cleared seeded Program and Workout/Strength Activities (including Squats/Reps for the current live test), plus two verified local accounts. `packages/db/prisma/seed.ts` was absent at inventory; Claude added an uncommitted seed script during this session, which this work did not modify or execute. Frontend tests must not reset the shared DB or bypass verification.
2. **Occurrence authorization:** the earlier review found instructions returned for locked items. The UI suppresses locked instructional rendering, but that is not authorization. Claude is changing this backend path concurrently; its fix and server tests must establish denial before any paid flow is considered secure. No security claim is made by the frontend test suite.
3. **Write idempotency:** `SessionActionInput`, `SaveResultEntryInput`, and Undo lack the general idempotency contract described in architecture §4. Actions have revision guards; result appends do not. No automatic retries are enabled. Lost-response recovery needs a backend reconciliation/idempotency decision before retry UX is broadened.
4. **Result draft concurrency:** save-result has no expected revision; multi-tab result editing can append competing entries. Do not promise autosaved synchronized metrics yet.
5. **Auth/demo setup:** registration and verification UI are outside this slice. Use existing verified accounts; never stub authentication in application code.
6. **Media/background events:** intentionally delegated to Claude. No pretend capture, processing, or notification delivery controls.
7. **Production routing:** the eventual static host must rewrite application paths to index.html. Sibling-subdomain cookie/CORS setup remains a deployment prerequisite. Nothing was deployed.

The OPEN journey's routes are sufficient; none of these findings authorize frontend changes to the API contract or backend implementation.

## Verification

`pnpm --filter web test` exercises error-envelope preservation, date arithmetic, and return-path validation. `pnpm --filter web test:e2e` runs the real React app against a deterministic mocked HTTP boundary, on desktop and mobile. It covers the full two-account journey, dirty navigation, conflicts, offline behavior, error context, auth failures, and unsuccessful Finish. These tests are not backend integration proof.

`pnpm --filter web test:e2e:live` runs the same journey against a running real API using explicit environment credentials. It has no mocks, DB access, reset, or verification bypass. Missing prerequisites fail clearly. See `apps/web/README.md`.

### Local results

- 18 Playwright checks passed (9 scenarios on desktop and mobile), including the complete two-account journey; mocked HTTP boundary.
- 3 unit tests passed; frontend build/typecheck (including test sources), SDK typecheck, and SDK drift check passed.
- Calendar screenshots inspected at 360px and 1280px; keyboard/overflow checks also exercised 320px and 768px.
- Live backend journey not run: no API listener or verified account credentials were available. Seed implementation appeared as Claude's uncommitted work and was left alone.
- No server test run/reset was performed by this frontend task, avoiding interference with Claude's concurrent backend tests.
