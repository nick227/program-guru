# Media integration status

Frontend: `codex/media-foundation`, isolated worktree `programs-app-media`.
Backend baseline: **1fb1fd7**, already integrated on main and imported into this frontend branch. Backend files are unchanged relative to that baseline; shared main was not modified. The earlier shared-main media changes were reconciled by Claude in that commit.

## Verified contracts

- `GET /media-attachments` enumerates an owned target with cursor pagination. Links carry attachment ID, media ID, target, purpose, position, asset state/deletion information and display media. Published targets can be enumerated; published revision/instruction changes still require a draft.
- Attachment creation requires READY. Unique indexes protect `(mediaId, target FK, purpose)` for all five persistence targets. A replay returns the existing link; conflicting explicit position returns 409.
- Delivery binds publicationId and viewer context and checks audience, group membership, Program access, blocks, moderation and revocation. Local/R2 delivery and HTTP Range remain server-owned. The browser uses native media elements.
- SDK generated types came from the committed backend contract and pass `pnpm sdk:check`. Existing frontend hooks were preserved and extended.

## Frontend implementation

`useMediaAttachments(context)` provides server-backed pagination. `MediaAttachments` manages known links, including unavailable/deleted assets; pass `readOnly` for published content. `MediaPicker` reads all attachment pages before allowing selection and blocks on enumeration errors instead of treating failures as an empty list.

`useAttachSessionMedia` reloads session detail and reuses an existing unscoped result entry. There is no temporary result-entry ID ref or persistent frontend attachment store. Attach/detach invalidates link collections, session detail and occurrence projections. Activity management enumerates each result entry in the current attempt; detaching never deletes the library asset.

The existing Library, Picker, Viewer and native device capture remain. The live test caught and fixed empty search requests (`q=`): blank search is now omitted to satisfy server validation.

## Verification

- 52 mocked HTTP browser cases on desktop/mobile, including pagination, refresh-stable selection, attachment denial, deleted assets and failed-detach recovery.
- 11 unit tests, web build/typecheck, SDK typecheck and SDK drift check.
- Two **real API + worker + browser** journeys, one photo and one video: Upload → READY → Attach → Refresh → View/play → Detach → Refresh. Confirmed the library asset still exists and can be selected again after detach.

Run `apps/web/scripts/media-live.ts` with `MEDIA_TEST_DATABASE_URL` naming **programs_app_codex_media_roundtrip** on local MySQL :3307. It applies committed migrations, seeds fixtures, creates a fresh account without resetting the database, and starts the unchanged API/worker with dedicated ports and a private temporary storage directory. It never uses programs_app_test or the development database. See `apps/web/README.md` for the command.

The live test verifies actual processing/playback and current-attempt attachment management, not every server authorization permutation. Claude's backend tests own the authorization matrix.

## Remaining boundary

No additional backend contract blocks the verified current-attempt round trip. My Media also aggregates older attempts; those thumbnails do not expose their result-entry/attempt IDs. Managing **all historical** links still needs a server-owned way to discover those IDs. Older media remains viewable. No alternative media product, HTTP client, Range handler, storage provider or processing pipeline was introduced.
