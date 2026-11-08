# Activity media history acceptance

The Activity occurrence's My Media panel keeps its current-attempt controls and adds
“Media from all attempts”. History uses `GET /activities/{activityId}/my-media`, not
an Activity detail request, so private history can remain available for restricted
Activities. Results, session controls, and Calendar return URLs are unchanged.

- Viewer-scoped SDK query, cursor pagination, cancellation, and media mutation invalidation.
- Groups attachment links by session, displaying occurrence date, recording time, and session reference.
- Uses MediaGrid's existing MediaItem primitive, MediaViewer, MediaPicker and attachment hooks.
- Detach removes a link, not the asset. Undo restores the original result-entry target and purpose.
- “Attach to this attempt” selects existing library media for that historical result entry.
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

Live browser acceptance requires an unmodified local API at backend `5c3a3eb` or
newer, seeded platform Activities and READY platform photos. Configure the API's
CORS origin for the test web port. It creates two uniquely named test users, one
calendar occurrence, and 25 attempts through real APIs. It does not reset the DB
or modify existing users. Test-created records are retained in the local database.

```sh
HISTORY_TEST_API=http://localhost:3041 VITE_API_URL=http://localhost:3041 \
  E2E_PORT=5192 pnpm --filter web exec playwright test \
  --config activity-media-history.live.config.ts
```

The live test checks pagination, historical detach/restore, persistence, unchanged
current results/session/calendar item, empty history for another user, denial of
another user's detach, and anonymous denial. Mocked desktop/mobile tests additionally
cover playback, selected historical targets, deleted media, restricted Activities,
authorization loss on refresh, failed-detach recovery, and Calendar navigation.

## Remaining backend contract limitation

The endpoint enumerates **attachments**, not attempts. If the last link on an old
attempt is detached, then the page is refreshed, that attempt no longer appears.
The asset still exists in My Library and can be attached to the current attempt;
Undo can restore the original historical target while the view remains mounted.
Selecting that now-empty historical attempt after refresh requires a session/result
history listing contract. No backend changes were made for this work.
