# Frontend adversarial review — 2026-11-07

Baseline: 9848a4b, plus the media foundation changes in this branch. Backend and worker code were reviewed read-only. Shared-worktree changes were moved to an isolated worktree after another process stashed the checkout. Backend changes in that stash were not imported.

## Findings, ordered by consequence

1. **Backend dependency: attachment round trip is incomplete.** No attachment-list GET and no attachment IDs in domain thumbnail projections. Existing links cannot be detached reliably after reload. Do not mask this with a frontend shadow model.
2. **Security dependency: media delivery authorization needs server evidence.** The original viewer rendered thumbnail URLs as media, dropped publication IDs and autoplayed video. Fixed: authorized delivery URL lookup, preserved publication IDs, no autoplay, no stale fallback on denied delivery. This does not prove group/paid access security; publication-aware delivery and locked occurrence filtering belong to Claude.
3. **Lifecycle failure originally looked like success.** Upload completion may return PROCESSING. Fixed: explicit upload stages, owner asset/library polling, READY selection gate, ticket-preserving retry and persistent errors. Worker failure has no retry endpoint.
4. **Activity Add lost context and did not attach.** Fixed: in-place picker and explicit JOURNAL attachment to a result entry; return week/day and dirty metrics stay mounted. No publishing side effect. Ambiguous attachment retries still need backend idempotency.
5. **Locked Activity order had drifted.** Standalone Guidance appeared above Today’s Results. Fixed: compact instruction controls live inside Today’s Results; outer sequence is Header → Results → optional Collaborators → Controls → Metrics → My Media → optional Shared → optional Community → optional Stats. Shared/community count badges were removed from grids. Remaining: these galleries disappear when empty; group participation context should expose an empty Shared row/action when appropriate.
6. **Modal accessibility was incomplete.** Fixed native dialog focus containment, scroll lock, Escape, origin focus restoration, and explicit media load recovery. Added desktop/mobile tests. Remaining: browser Back does not close a modal before navigating, swipe navigation and a full assistive-technology audit remain.
7. **Public profile route differs from spec.** Current `/:handle` should reconcile with `/u/:handle`. Portfolio thumbnails previously had no action; they are now disabled rather than falsely interactive, but still need viewer wiring. Profile/Program avatar/cover pickers are integration examples rather than completed editor features.
8. **Program workspace mostly preserves locked structure.** It has title/status, type/focus/duration, frequency/program days, Calendar, Activities counts, instruction/media counts/metrics and Preview & Publish. Missing P1 depth: complete draft field editing, Activity revision authoring/reordering and integrated cover selection. Empty Activities repeats Add in header and body; reduce duplication in the next workspace pass. Calendar link copy should align with “Edit Calendar”.
9. **Generic architecture holds, with localized duplication.** Page/Stage/Panel/Row/Grid/Stack remain layout owners; no shell/sidebar/CRUD generator. Removed manually duplicated Panel styling around embedded instructions. ThumbnailGrid (domain projections) and MediaGrid (asset selection) now share MediaItem rendering while keeping readiness/selection behavior in the asset grid. SDK hook aliases retain compatibility while sharing one library query implementation.
10. **Copy and loading cleanup.** Clarified that uploads start private, attaching creates no publication, and delivery can inherit the destination’s access rules and the claim that P1 recording waits on future presets. Library now has loading/empty/error/processing states and fetches only its selected source. Profile projection errors/pagination and all empty-state actions need a separate pass.

## Specifications coverage

| Specification | Current frontend assessment |
| --- | --- |
| 01 Product | Calendar-first core journey exists. P1 breadth is still partial; do not describe this as all P1 complete. |
| 02 Concepts | Media ownership/attachment/publication preserved. No independent Group Media or Personal Log product. |
| 03 UX | Button-driven primary journey and local context retained. Browser Back/picker history and full calendar interaction remain gaps. |
| 04 UI | Generic primitives and restrained Tailwind styling; native modal a11y improved. No global navigation shell. |
| 05 Architecture | Existing generated SDK/TanStack Query used. Private caches viewer-scoped; mutations are not queued offline. |
| 06 Data | Targets map to existing IDs. No new storage tables/models. Attachment enumeration gap remains explicit. |
| 07 Programs | Workspace structure present; richer authoring and media editor integration incomplete. |
| 08 Groups | Occurrence group projection shown. Complete group lifecycle and gallery management remain outside this slice. |
| 09 Calendar | Weekly calendar + Finish/Undo journey exists. Day/month/manual scheduling and recurrence UX need full follow-up coverage. |
| 10 Activities | Nine-row ordering restored. Results/session controls remain the primary experience; media targets result entries. |
| 11 Media | Library/picker/upload/viewer foundation implemented. Advanced publishing, reactions and processing retries remain incomplete. |
| 12 Profile | Basic profile surfaces exist; avatar/cover/portfolio picker wiring and route consistency remain. |
| 13 Implementation | Core browser slice tested with mocked contracts. Backend gate completion and live-media authorization must be assessed separately. |

## Progress assessment

CLAUDE.md reports Phase 2 backend completion: 148 operations, worker, seed catalog, billing behind a flag, and 227 API contract tests. Those are backend-reported gates, not tests rerun by this frontend task. The frontend has progressed from the calendar/Program journey to initial profile, notification and media surfaces. This media work establishes reusable behavior and exposes missing contracts; it does not make the entire product production-ready.

Mobile testing covers Chromium at desktop and 360px widths. Camera/device behavior, Safari, screen readers and real signed-stream expiry require additional verification. Mocked authorization failures validate fail-closed rendering, not server security.
