# Personal Program library

## Implemented surfaces

`/library` is a media-led management table with Program, Status, Progress, Next Activity, Source, Updates and Actions. Search covers name, type and creator. Status filters cover All, Active, Not Started, Paused, Completed and Archived. Created by me excludes source copies. Sorts use actual last participation, name or occurrence completion ratio (unknown progress last).

`/library?program=<id>` is the personal management surface: upcoming Activities, completion, consistency through yesterday, recorded timer time, activity history, pinned version, adjusted placements and selectable previous runs. It is separate from the public Program overview and editor.

Owned Program editing links to the existing `/programs/:id/workspace` four-step editor. Scheduling a never-started owned definition links to its publish step. Nonowners customize through the existing copy endpoint. No editor implementation files are part of this change.

Uses existing typography, dark/light tokens, shared hero resolution and category fallback; honors the application's theme preference. Desktop uses a semantic table; narrow screens reorganize the same rows without page overflow. There is no new sidebar.

Friends and Social are deliberately omitted: existing group membership and completion shares do not supply a privacy-aware Program-level friends/social summary. No placeholder counts are displayed.

## Model audit and reused capabilities

- `Program`: definition ownership, visibility, publication state. Definition ownership is not participation.
- `ProgramVersion`: draft when `publishedAt` is null; published snapshots have immutable content and schedule items.
- `ProgramSource`: copied definition -> exact source version, with copying user and timestamp.
- `ProgramEnrollment`: personal run, pinned version, start date, timezone, optional group and `pendingVersionId`; `activeKey` allows one live run per user/Program. Terminal runs retain history.
- `CalendarItem`: dated occurrences, planned/done/skipped/cancelled/not-participating status, personal adjustments and pinned Activity revision.
- `ActivitySession`: started/ended timestamps, recorded active seconds and manual completion flag. Results attach to sessions.
- Reused authenticated enrollment pause/resume and leave endpoints; existing copy, join and editor routes; existing outbox-backed version offers and update review/adoption surface.

## Schema and API additions

Migration `20261108090000_personal_program_library` adds:

- `ProgramLibraryState(userId, programId, archivedAt)`: personal organization, independent of source publication. Foreign keys restrict source deletion.
- `CalendarItem.pausedByEnrollment`: identifies exactly the future unstarted items suspended by personal pause/archive. Resume restores only marked future items, preserving their IDs, placements and adjustments. Past suspended dates remain cancelled. In-progress sessions are not cancelled.

`GET /me/program-library` returns only definitions owned by the viewer and Programs in which they have a run, including typed personal projections. `POST /me/program-library/{programId}` supports ARCHIVE, RESTORE and RESTART. Restart requires the expected run ID, rejects stale/replayed run changes, and atomically ends the old run and creates a fresh enrollment in the same pinned version. Existing entitlement checks apply. Old results and personal adjustments stay with the old run. Restart starts today in that run's timezone. If the person is still an active member of the run's Program Group, the new run is linked to the same membership (no new membership, sharing preference unchanged; the group's start date and other members' calendars are untouched). Leaving the group is a separate action.

Archive pauses a live run and sets only the viewer's archive state. Restore restores library visibility; resume is a separate explicit action. Remove from Calendar ends participation and cancels future unstarted items without deleting the Program or completed results. There is no source-delete action or cascading publication deletion.

Pause/resume now operates on Calendar items as well as enrollment status. Update adoption requires an active run so it cannot materialize Calendar items into a paused run.

## Metric definitions

- Planned: materialized eligible occurrences; excludes ordinary cancellations and dates marked NOT_PARTICIPATING. Pause-marked items remain in the progress denominator to avoid an artificial jump when pausing.
- Completed: eligible occurrences with DONE status, not number of sessions.
- Completion: completed / planned; unknown when no eligible occurrences exist. Ongoing Programs explicitly show the generated schedule, not lifetime progress.
- Completed status: explicit COMPLETED enrollment or all eligible finite-run occurrences done after materialization has reached the finite schedule end. No time-based inferred completion.
- Consistency: completed due occurrences / all due eligible occurrences strictly before today in the enrollment timezone. Pause-marked cancellations are excluded; today is not yet due.
- Recorded time: stored active seconds of nonmanual sessions that have recorded participation. Live unflushed timer time is not estimated. Null when no such timer data exists, distinct from recorded zero.
- Last participation: latest recorded session end/start, not definition modification time.
- History: latest 30 eligible historical occurrences per run. Upcoming: next 10 planned occurrences. Previous runs remain selectable.
- Not Started includes future runs and definitions without a live run; a removed run remains visible in run history and can be restarted.

## Minimal future creator-update model

Existing immutable versions, `ProgramSource.sourceProgramVersionId`, enrollment `programVersionId` and persisted `pendingVersionId` provide the foundation. The current indicator is shown only for a real pending version. Copies remain independent definitions and do not automatically subscribe to their source.

Add later, only when needed:

1. `ProgramUpdate(id, programId, kind, publishedAt, authorId, title, body, targetVersionId?, contentRefs?)`, with kinds ANNOUNCEMENT, OPTIONAL_CONTENT and VERSION. Optional content references published Activity revisions; it must not mutate existing versions.
2. `EnrollmentUpdateReceipt(enrollmentId, updateId, offeredAt, readAt?, dismissedAt?, adoptedAt?, adoptedVersionId?)`, unique per enrollment/update. Keep delivery/read state separate from adoption.
3. An explicit review showing additions/removals and affected dates. Announcements change no schedule. Optional content requires a selection and placement decision. Version adoption requires confirmation, rechecking entitlement and comparing the currently pinned version.
4. Adoption protects completed, in-progress, past and personally adjusted occurrences; user changes never silently revert. Conflicts require choices. New-version schedule projection must check already-existing adjusted placements to avoid duplicate slots. Group version alignment requires a separate explicit choice.
5. Record adoption provenance and retain the old version. Dismissal/read state cannot imply adoption. No broadcast/feed infrastructure is included in this milestone.

## Verification and limits

Passing: 40 Program API tests and 22 Calendar API tests against local MySQL, including contract validation, ownership/copy/join/private access, zero-history metrics, pause/resume, preserved results and placements, independent restart, stale restart rejection and cross-user authorization. Three selection unit tests and desktop/mobile Playwright flows cover filters, sorts, insights, no page overflow and editor handoff. Web production build and server typecheck pass.

The new migration has been applied to local development and test databases only. No remote deployment or push.

Limits: library projections currently load the viewer's complete library/runs for correct global search/sort. Large long-lived libraries should move aggregation and pagination server-side and load detailed run history on demand. The UI offers the existing version-review surface rather than a new content diff/adoption workflow. No friend counts, creator announcements, fabricated time estimates, streaks or subscriber broadcasting. The existing build reports a large JavaScript chunk warning.
