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
- `useDetachMedia()`: deletes a known attachment ID, not its asset.
- `useMediaPublication()`: explicit POST publication mutation using the generated PublishMediaInput. No automatic invocation from upload/attachment. Advanced publishing UI is deferred.
- `useMediaUrl(mediaId, publicationId?)`: viewer-scoped, non-persisted signed delivery URL. Never use thumbnail URLs for original-image/video playback. Failure hides stale content and allows explicit retry.
- `useUpdateMedia()` / `useDeleteMedia()`: owner library management. Deletion requires explicit confirmation in the UI.

`queryKeys.mediaLibrary`, `mediaAsset`, `mediaUrl` own media keys. All authenticated reads append the current viewer key. Auth changes clear caches. Mutations invalidate media and affected occurrence, Program, Activity and user projections. There is no second persistent attachment store. Local state owns only search/selection, upload retry stage and unsaved descriptions.

### Why there is no fake useMediaAttachments(context)

The contract has POST attachment and DELETE by ID, but no GET attachment collection. Domain projections return thumbnails without attachment IDs. A hook promising a reload-stable attachment list/detach would fabricate data. Render existing domain media arrays, retain the mutation's returned attachment ID if immediate detach is needed, and await a server-owned list contract before adding that hook. Do not persist a shadow attachment table in localStorage.

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

## Contract dependencies and limits

1. Attachment enumeration with IDs and target scope is needed for reload-stable selection/detach. Occurrence My Media is an aggregate, so its selected IDs prevent duplicates in that visible projection, not globally.
2. Attach is not idempotent across clients or ambiguous network failures. UI serialization cannot guarantee exactly once. Backend uniqueness/idempotency is required before claiming it.
3. The inspected backend accepted PROCESSING attachments although the specification requires READY; this frontend gates READY. Claude owns enforcement.
4. The inspected delivery handler did not use publicationId although the OpenAPI query declares it. Frontend preserves it; Claude must verify context-specific publication authorization and revocation. Concurrent backend changes may supersede this finding.
5. No retry-processing endpoint. FAILED/BLOCKED remains unavailable; a new upload is a new asset. Upload cancellation/abandoned-ticket reconciliation and resumable byte transfer are not implemented.
6. Full group/community browsing pagination, public likes/views/comments, profile/Program editor wiring, swipe viewer navigation and browser-Back modal history integration remain follow-up UI work. Core picker closure uses Close/Escape without navigation.
7. Device camera capture is browser/device dependent. Advanced camera and publishing controls are intentionally deferred.

## Verification

`pnpm --filter web test`, `pnpm --filter web build`, and `pnpm --filter web exec playwright test` run unit/build/browser checks. Browser media cases mock HTTP and cover private attachment, reuse without upload, processing → READY, failed PUT retry, attachment denial/retry, delivery denial, focus restoration and narrow layout. They are not storage/worker/authorization integration tests. Claude's backend tests must verify locked content, revoked publication access, group membership, ownership, storage delivery and transcoding.

Validation on this branch: 38 browser cases (desktop/mobile), 9 unit tests, web production build and SDK typecheck passed. Final targeted media suite covers 20 of those browser cases. No live storage/worker tests were run by this task.
