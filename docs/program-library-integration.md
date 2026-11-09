# Program Library frontend integration

This pass reuses the completed personal-library backend. It adds no schema, endpoints, publication behavior or editor steps.

## Connected flow

- `/library/browse` mounts the shared full-screen Program browser over the Library. All Program types are available; users can narrow the existing discovery query by type, focus and search.
- Discovery selections open the existing Program overview and enrollment preview/confirmation flow, preserving the browser return URL. Successful participation continues to Calendar. The overview links back to personal management.
- Library search, ownership filter, status and sorting live in the URL. Management and occurrence links retain those filters. Returning from discovery reuses the viewer-scoped query cache.
- Intent-based prefetch warms the actual preview/workspace queries on pointer entry or keyboard focus. UUID Program routes skip redundant slug resolution; preview endpoints still enforce access. Alias navigation retains return parameters.
- A background Library refetch error no longer discards cached rows. AuthGuard keeps cached authenticated content for transient errors while still redirecting on 401. No cache clearing, global stale-time changes or synthetic preview/workspace DTOs are introduced.

## Media and controls

EntityHero is shared by Library, browser and overview. It provides a compact landscape row size, clips loaded imagery to the shape, and consistently displays category-token fallback art when media is absent or fails. Library-specific fallback styling is removed.

ProgramLibraryActions owns the personal controls separately from page layout and editor responsibilities:

- Start: route to existing editor scheduling for owned definitions, or existing enrollment flow for source Programs.
- Continue: next planned Activity, with a return link to personal management; management when nothing is scheduled.
- Resume: explicit enrollment resume.
- View: completed, archived, or already-scheduled future runs. Future runs never offer another enrollment.

Edit, Customize, Update Review, Restart, Calendar removal and personal archiving live in the contextual menu. Pending updates appear as a quiet identity marker rather than a dedicated action column. Archived Programs are accessible through a secondary view. Both the menu and archived detail explain that Restore returns visibility but keeps a paused schedule paused; a subsequent Resume is explicit. A restoration toast repeats this distinction.

The concurrent Remove from Programs workflow is retained as a secondary action: leave the current Calendar run, then personally archive. The source is never deleted and history is preserved. It uses two existing operations; if the second fails the leave has still succeeded and the action can be retried.

## Verification

- Unit tests cover state-based actions, avoiding duplicate future enrollment, editor/participation handoffs, filter-preserving return links, selection logic and shared hero resolution.
- Desktop/mobile integration tests cover browser return/search state, no document reload, query-cache reuse, real existing enrollment request shape, archived visibility, restore versus resume, cover rendering and broken-image fallback.
- Tests use mocked API transport for browser journeys; no new backend behavior was added. The earlier milestone's API integration tests remain the backend evidence.
- Separate browser test ports and artifact directories avoid collisions with parallel agents.

Parallel People/Type and group/media work is preserved in the working tree and not bundled into this integration commit. The four-step editor is not edited by this pass. Build retains the existing bundle-size warning.
