# P1 media foundation

Authoritative requirements: `docs/specs/01–13`, especially 03 UX, 04 UI, 06 data model, 10 Activities and 11 Media. This document describes implementation, not a replacement contract.

## One model, four contexts

`MediaAsset` stores the upload; `MediaAttachment` places that asset; `MediaPublication` grants a publication audience. Never encode privacy in an attachment purpose. Private is a personal-library projection, **not** a third backend audience enum. Absence of a publication alone does not guarantee privacy: readable instructional attachments and avatar/cover pointers can authorize access under existing parent rules. Group maps to GROUP and Community to PUBLIC. Publishing is explicit, server-authorized and moderated; PENDING is not publicly approved.

| UI context | Existing attachment target | Important boundary |
| --- | --- | --- |
| Profile | PROFILE / user ID | AVATAR/COVER attachment alone does not update profile pointers |
| Program | PROGRAM / program ID | COVER attachment alone does not update draft coverMediaId |
| Activity demonstrations | ACTIVITY_REVISION / owned draft revision ID | Never send the canonical Activity ID |
| Activity personal recordings/history | RESULT_ENTRY / result entry ID | Still part of Activity, not a separate log system |
| Instruction | INSTRUCTION / draft instruction ID | Never send instructionKey in place of ID |

The same asset ID can be attached to multiple targets. Upload once. Attachments do not create publications. However, readable Program/revision/instruction attachments and profile/cover pointers can authorize delivery through existing parent rules. Personal RESULT_ENTRY attachments do not become group/community contributions automatically.

## Developer API

All requests use the existing generated SDK and `getApiClient`. Signed binary PUT transport is centralized in the SDK; no second JSON client exists.

- `useMediaLibrary({ source: 'mine' | 'platform', q?, type? })`: cursor-paginated projection. Only the selected source is fetched. Polls while listed assets are UPLOADING/PROCESSING.
- `useMediaUpload()`: `upload(file)`, `retry()`, `stage`, `busy`, `error`. Keeps the ticket and file in memory. Failed PUT retries the same ticket; failed completion retries completion without resending bytes. No offline queue or automatic mutation retry. Expired tickets require selecting the file again. Cancelling a picker does not cancel server processing or delete the private asset.
- `useMediaAsset(id)`: owner asset state with processing polling. Blocked/failed assets are not selectable. Worker retry is not currently a contract operation.
- `useAttachMedia()`: accepts the generated AttachMediaInput. `mediaTarget(context)` converts the four UI contexts to existing targets. Caller selects purpose explicitly.
- `useMediaAttachments(context)`: server-backed, viewer-scoped attachment pagination.
- `useDetachMedia()`: deletes a known attachment ID, not its asset.
- `useMediaPublication()`: explicit POST publication mutation using the generated PublishMediaInput. No automatic invocation from upload/attachment. Advanced publishing UI is deferred.
- `useMediaUrl(mediaId, publicationId?)`: viewer-scoped, non-persisted signed delivery URL. Never use thumbnail URLs for original-image/video playback. Failure hides stale content and allows explicit retry.
- `useUpdateMedia()` / `useDeleteMedia()`: owner library management. Deletion requires explicit confirmation in the UI.

`queryKeys.mediaLibrary`, `mediaAsset`, `mediaUrl` own media keys. All authenticated reads append the current viewer key. Auth changes clear caches. Mutations invalidate media and affected occurrence, Program, Activity and user projections. There is no second persistent attachment store. Local state owns only search/selection, upload retry stage and unsaved descriptions.

### Server-backed attachment management

Backend `1fb1fd7` supplies `GET /media-attachments?targetKind=…&targetId=…&cursor=…&limit=…`. `useMediaAttachments(context)` maps the existing UI context through `mediaTarget`, pages the response and scopes the cache to the current viewer. Each link includes its attachment ID, target, purpose, position, `mediaState`, `mediaDeleted` and thumbnail data.

`MediaAttachments` renders these links, supports pagination, viewing and detach, and retains links when a mutation fails. Pass `readOnly` for published revision/instruction management. `MediaPicker` accepts `context`; it reads every attachment page before enabling selection and blocks selection on enumeration errors. No attachment IDs are synthesized or persisted locally.

`useAttachSessionMedia` reloads session detail before attaching and reuses its existing unscoped result entry, creating one only when none exists. This replaces the temporary result-entry ref. Mutation invalidation covers session detail, attachment collections and occurrence projections. Activity management shows all result-entry attachments in the current attempt. The broader My Media history projection remains viewable; enumerating older attempts is still a separate API discovery limitation.

## Components

- `MediaLibrary`: shared controller for search, source selection, upload/capture, readiness, pagination and errors; network behavior comes from SDK hooks. Props: `onSelect(asset)`, `selecting?`, `selected?: string[]`.
- `MediaGrid` / `MediaItem`: asset presentation. Selection mode disables processing, failed, blocked and already-selected IDs. Rendering never assumes a thumbnail implies availability.
- `MediaPicker`: `onSelect(asset): Promise<void>`, `onClose`, `selected?`, `title?`. Mobile bottom sheet, desktop side panel, native modal focus containment, scroll lock and origin focus restoration. Keeps originating route mounted. Awaited attachment errors remain in place; duplicate clicks are serialized.
- `MediaViewer`: `items`, `index`, `onIndex`, `onClose`, optional owner-action content. Fetches authorized delivery for the active item only; supports photo/video/audio, previous/next, keyboard and explicit failure recovery. No autoplay. Preserve publicationId and attribution when adapting public/group thumbs.
- `MediaCapture`: fullscreen, device-native file capture; uses the same private upload pipeline. Desktop can fall back to file selection. No MediaRecorder, camera presets, worker or storage implementation is introduced.

`/media` manages the personal library, with platform selection, upload, fullscreen preview, description update and confirmed deletion. It introduces no global navigation shell.

## Integration recipe

Inside the owning page/controller, create a mutation and pass it to the picker. This is the same integration for all four contexts:

```tsx
const attach = useAttachMedia()
const [picking, setPicking] = useState(false)
// Select ONE context owned by this page:
const context: MediaContext = { kind: 'Profile', userId }
// const context: MediaContext = { kind: 'Program', programId }
// const context: MediaContext = { kind: 'Activity', revisionId: draftRevisionId }
// const context: MediaContext = { kind: 'Instruction', instructionId: draftInstructionId }

{picking && <MediaPicker
  selected={existingMedia.map(media => media.id)}
  onClose={() => setPicking(false)}
  onSelect={async asset => {
    await attach.mutateAsync({
      mediaId: asset.id,
      target: mediaTarget(context),
      purpose: 'DEMONSTRATION', // e.g. OTHER for portfolio; JOURNAL for personal recordings
    })
  }} />}
```

For Program covers/profile avatars, use the corresponding owner update mutation with the selected asset ID and required revision token. Attachment alone does not replace that update. Keep API authorization on the server; do not infer permission from the picker source.

The concrete Activity integration is `Occurrence.tsx` → `OccurrenceMedia`. Only the user's explicit selection creates a session/result entry when needed, then attaches JOURNAL media to RESULT_ENTRY. A failed attachment retains its result-entry ID for retry in the current page. My Media, Shared Media and Community Media use the same viewer. Group/community publication IDs are preserved. Results remain editable and origin week/day/scroll survive opening the picker. No completion or publication is triggered by selecting media.

For a genuinely new backend target, first obtain a server-owned OpenAPI/Prisma change. For a new UI using an existing target, compose the picker and mediaTarget without creating tables, uploaders, clients or audience flags.

## Verified backend baseline and remaining limits

`1fb1fd7` is integrated into this isolated branch without changing backend files. It provides owner-authorized attachment enumeration (including published targets), READY-only attachment checks, and five database unique indexes on `(mediaId, target FK, purpose)`. Repeating an attach returns the same link; a conflicting explicit position returns 409. Detach removes the link, never the asset. Published revision/instruction mutation remains forbidden.

Publication-specific delivery checks the requested publication against media ID, audience, membership, Program access, blocks, moderation and revocation. The API rechecks delivery authorization on each proxied fetch/range request. Native browser media elements own playback; this frontend introduces no Range, storage or processing implementation.

Remaining limits: no processing-retry endpoint; a failed file requires a new upload. No API enumerates all historical Activity attempts from the aggregate My Media thumbnails, so management covers the current attempt's persisted result entries. Group/community publishing/reactions, swipe navigation, browser-Back modal handling and expanded Profile/Program editor wiring remain outside this slice.

## Verification

`pnpm --filter web test`, `pnpm --filter web build`, and `pnpm --filter web exec playwright test` run unit/build/browser checks. Browser media cases mock HTTP and cover private attachment, reuse without upload, processing → READY, failed PUT retry, attachment denial/retry, delivery denial, focus restoration and narrow layout. They are not storage/worker/authorization integration tests. Claude's backend tests must verify locked content, revoked publication access, group membership, ownership, storage delivery and transcoding.

Validation on this branch: 38 browser cases (desktop/mobile), 9 unit tests, web production build and SDK typecheck passed. Final targeted media suite covers 20 of those browser cases. No live storage/worker tests were run by this task.

## Integration follow-up

The subsequent frontend pass follows Claude's committed `docs/media-integration.md` at `e80b944`: ticket-only credential-free PUTs, native playback, owner polling and native device capture. See [media-reconciliation.md](media-reconciliation.md) for the outstanding server-owned contract and shared-worktree reconciliation notes. Attachment enumeration has now landed at `1fb1fd7`; the current-attempt attachment/detach round trip uses that committed contract.
