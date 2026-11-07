# Frontend/backend media reconciliation

Frontend branch: `codex/media-foundation` (isolated worktree `programs-app-media`).
Backend handoff reviewed read-only: `claude/phase3-media-verification` at `e80b944`, `docs/media-integration.md`.

## Implemented against the committed handoff

- Upload PUT uses ticket headers verbatim and `credentials: omit`; no application authorization headers are attached.
- Owner asset polling waits for processing, with distinct FAILED/BLOCKED guidance. Failed completion retries completion, not upload. Failed byte transfer reuses the ticket.
- Media type filters use the existing SDK query; audio URLs are not rendered as image thumbnails.
- Delivery URLs go directly to native image/audio/video elements. Video uses inline controls and metadata preloading. Seeking/Range, storage, transcoding and permission enforcement remain server responsibilities.
- Native device capture remains the P1 implementation. Capture inside the picker reuses its modal boundary.
- Browser tests use mocked HTTP, including actual image decoding in the viewer. They do not verify live storage, transcoding or backend authorization. Claude's handoff reports a separately verified live API/worker journey.

## Required before reload-stable attachment management

Claude's committed OpenAPI at the reviewed revision has no GET attachment collection. Do not consume the uncommitted experimental contract in shared main or infer links from thumbnail IDs.

Required server-owned contract:

1. Enumerate links by authorized target with pagination: attachment ID, media ID, target, purpose, position, asset state/deletion information, and available display media. Clarify read-only versus editable published targets.
2. Stable duplicate protection for repeated/concurrent attachment creation, with documented behavior for a conflicting purpose/position and detach/re-attach.
3. Delivery scoped to publicationId, with group membership, Program access, blocks, moderation and revocation enforced by the server. Signed URL lifetime remains a backend decision.
4. READY-only attachment enforcement.

When that contract is committed and reconciled, regenerate only SDK generated types from Claude's reviewed OpenAPI; preserve `src/hooks/useMedia.ts`, `src/media.ts` and media query keys. Add `useMediaAttachments(context)`, replace temporary attachment tracking, and test:

Select → Attach → Refresh → View → Detach → Refresh → Confirm removed.

No frontend-side attachment store, competing client, Range handler or storage pipeline is needed.

## Shared-main work requiring reconciliation

Before the user clarified frontend-only ownership, the backend-directed request caused this agent to edit shared-main backend files. Those changes were **not** merged or adopted into this frontend branch. They were left untouched when ownership was corrected; do not treat them as Claude-approved contracts. They included attachment enumeration/uniqueness, delivery authorization/signing, media seed/storage changes, OpenAPI/generated types and contract fixtures. The associated server test command had already completed (25 tests) when stopped. No backend integration tests were run for the subsequent frontend work.

Claude should reconcile that shared-main work with its Range/storage implementation. This branch does not reset/stash shared main and does not edit server files. Further backend tests require a dedicated database.

Validation for this follow-up: 10 unit tests, web production build, SDK typecheck; all 44 desktop/mobile browser cases verified (42 passed in the full run, the two new upload-to-render cases passed on targeted rerun after disambiguating decorative icons in the selector). No backend/storage implementation was added to this branch.
