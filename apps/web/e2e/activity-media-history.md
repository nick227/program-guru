# Activity media history acceptance

The Activity occurrence's My Media panel keeps its current-attempt controls and adds
“Media from all attempts”. History uses `GET /activities/{activityId}/my-attempts` for
paginated attempt rows (including empty attempts and result entries with no media) and
loads attachments on demand via `GET /media-attachments` only when an attempt is opened,
without an Activity detail request, so private history remains available for restricted
Activities. Results, session controls, and Calendar return URLs are unchanged.

- Viewer-scoped SDK query, cursor pagination, cancellation, and media/session mutation invalidation.
- Lists attempts newest first with occurrence date, recording time, status, session reference, and result entry targets (including empty attempts).
- Loads attachments only when an attempt is opened (`Manage media`), avoiding unnecessary requests and rate-limit exhaustion.
- Uses MediaGrid's existing MediaItem primitive, MediaViewer, MediaPicker and attachment hooks.
- Detach removes a link, not the asset. Undo restores the original result-entry target and purpose.
- “Attach to this attempt” / “Attach to this result” selects existing library media for that historical result entry (or creates the first result entry on an existing non-abandoned empty session without starting a new attempt), preserving detach → refresh → reattach to the original ResultEntry.
- Deleted/non-ready media cannot open; deleted links remain detachable.
- Refresh authorization failures hide cached history, including open history viewers and pickers.

## Verification

From repository root:

```sh
pnpm --filter web test
E2E_PORT=5191 pnpm --filter web exec playwright test --workers=2
pnpm --filter web build
pnpm --filter @project/sdk typecheck
pnpm sdk:check
```

Live browser acceptance requires a local API running this branch (with the
`my-attempts` endpoint), seeded platform Activities and READY platform photos, pointed
at a dedicated non-shared database. Configure the API's
CORS origin for the test web port. It creates two uniquely named test users, one
calendar occurrence, and 25 attempts through real APIs. It does not reset the DB
or modify existing users. Test-created records are retained in the local database.

Reproducible run (isolated API, worker and dedicated database `programs_app_history_live`; also
runs account-switch isolation and the author → publish → join → Finish/Undo journey):

```sh
pnpm exec tsx apps/web/scripts/history-live.ts
```

Against an API you started yourself:

```sh
HISTORY_TEST_API=http://localhost:3047 VITE_API_URL=http://localhost:3047 \
  E2E_PORT=5197 pnpm --filter web exec playwright test \
  --config activity-media-history.live.config.ts
```

The live test checks pagination, historical detach/restore, persistence, unchanged
current results/session/calendar item, empty history for another user, denial of
another user's detach, and anonymous denial. Mocked desktop/mobile tests additionally
cover playback, selected historical targets, deleted media, restricted Activities,
authorization loss on refresh, failed-detach recovery, and Calendar navigation.

## Empty attempts

`GET /activities/{activityId}/my-attempts` enumerates sessions, not attachments, so an
attempt whose last link was detached remains listed after refresh and can be reattached
to its original ResultEntry. Expired Program access, archive and moderation keep own
history listable (server tests in `activity-media-history.test.ts`).
