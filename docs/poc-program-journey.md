# POC Program journey

The one experience the POC proves: a creator publishes a public Program, ten people join, each follows their own calendar, shares selected progress, and sees when the creator publishes an update.

It is covered end to end at the API level by `apps/server/src/__tests__/program-journey.test.ts`: a creator, ten participants, follows, a block, one group joined through USER, EMAIL and LINK invitations, completions, a reaction, group media with a comment, a second version, one accept and one decline.

Scope is the existing `Program`, `ProgramVersion`, `ProgramEnrollment`, `CalendarItem` and `ProgramGroup` model. No new tables, editions, runs, communities or aggregation jobs.

## Status by step

| # | Step | Status | Where |
|---|---|---|---|
| 1 | Creator publishes a PUBLIC Program | Works | `domains/programs/authoring.service.ts` `publish`; web `ProgramWorkspace` publish step |
| 2 | Others discover it and start it independently | Works | `GET /discover` (`social.service.ts:35`), `GET /programs/{id}` (`browse.service.ts` `preview`), `POST /programs/{id}/enrollments` (`enrollment.service.ts:155`); web `/discover`, `/programs/:id` |
| 3 | My Programs: status, progress, participation counts, participating friends | Personal status and progress work (`GET /me/program-library`). Counts and friends: **server logic added, not yet in the API** (proposal below) | `domains/programs/participation.service.ts` (new) |
| 4 | Invite friends or join an existing group | Works: USER, EMAIL and LINK; an existing enrollment is linked without changing the calendar | `domains/groups/group.service.ts` `accept`/`acceptMine` (`:481`, `:490`); web `/join/:token`, `/groups/:id` |
| 5 | Group participation, completions, reactions, group media | Works; private values, notes and session ids never reach other members; outsiders get 404 | `group.service.ts` `react` (`:567`), `listGroupCompletions`, `listGroupMedia`, media publication comments |
| 6 | Creator publishes a new version | Works: live enrollments get `pendingVersionId`, `ProgramVersionPublished` → `PROGRAM_UPDATE` notification | `authoring.service.ts:506–513`, `worker/handlers.ts:223` |
| 7 | "Update available"; accept keeps results and adjustments, decline keeps pin | **Fixed**: accepting used to duplicate kept items (see below). Decline worked | `enrollment.service.ts:241` (`acceptUpdate`), `:257` (`dismissUpdate`); `calendar/materialize.ts`; web `Program.tsx:263` banner, `/library` Updates column |

## Fixed: accepting an update duplicated kept items

`acceptUpdate` deletes future, unadjusted, untouched PLANNED items and materializes the new version from today. The new version's schedule items have new ids, so their idempotency keys did not match the kept items. The new version therefore added:

- a second copy beside a **done or in-progress** item from today onward (for example, today's finished Squats plus a new PLANNED Squats);
- a copy beside a **moved** item at its original Program Day;
- a fresh item where the participant had **removed** one (a CANCELLED item with `isUserAdjusted`), silently reverting their change.

Fix in `apps/server/src/domains/calendar/materialize.ts` (`dropSlotsKeptFromOtherVersions`): when materializing, any item of the same enrollment that came from another version already fills its (Activity, Program Day) slot, and the new version skips that slot. Matching is by count, because a Program Day can hold the same Activity twice. Items of the version being materialized are still deduplicated by idempotency key, so a first join, a horizon extension or a resume behave as before. The journey test fails without this change: Program Day 0 is duplicated and Program Day 3 is re-added.

## Step 3: participation data (proposal for the My Programs owner)

### Privacy rules

These come from the specs and decide what can be shown:

- **Counts** are aggregates. They are suppressed below `MIN_PUBLIC_SAMPLE` (5) for every viewer, the creator included (`12-SOCIAL.md` §10, `13-PROFILES-AND-EXPERIENCE.md` resolved decisions).
- **Participating friends** are only the people whose participation the viewer can already see: fellow ACTIVE members of an ACTIVE group the viewer belongs to for that Program, who have a live run linked to that group. `10-COLLABORATION.md` §4 gives a follower outside the group nothing ("Follower not in group: No"), and `12-SOCIAL.md` says a follow never implies enrollment. So "people I follow who are enrolled" would expose private participation, and it is **not** implemented. Blocks in either direction hide the person. People the viewer follows are listed first, with `viewerFollows: true`.
- To show followed people outside a shared group, the spec has to change first: a new row in the `10-COLLABORATION.md` §4 matrix, ideally an explicit per-enrollment opt-in. That is a product decision and is not made here.

### Definitions (as implemented in `participationSummaries`)

- `participantCount`: distinct users with an ACTIVE or PAUSED enrollment, with user status ACTIVE. It counts people, not runs, so a restart from My Programs is not counted twice. `ProgramStat.enrollmentCount` counts every enrollment ever made, including LEFT runs and restarts. Use `participantCount` for this column.
- `activeMemberCount`: of those participants, the ones with a DONE item in that enrollment and a FINISHED session ending in the last 7 days.
- `friends`: up to 4 `UserSummary` (id, handle, displayName, avatarUrl) plus `viewerFollows`. `friendCount` is the full number.

Each call makes one query per signal for the whole list of Programs, not one per Program.

### Proposed diff: `packages/api-spec/openapi.yaml` (owner: My Programs)

Add to `components/schemas`:

```yaml
    ProgramParticipation:
      type: object
      description: Privacy-safe participation signals. Counts are null below the minimum public sample; friends are fellow members of the viewer's own groups for this Program only.
      required: [participantCount, activeMemberCount, friends, friendCount]
      properties:
        participantCount:
          type: [integer, 'null']
        activeMemberCount:
          type: [integer, 'null']
          description: Participants who finished an Activity in the last 7 days.
        friends:
          type: array
          maxItems: 4
          items:
            allOf:
              - $ref: '#/components/schemas/UserSummary'
              - type: object
                required: [viewerFollows]
                properties:
                  viewerFollows:
                    type: boolean
        friendCount:
          type: integer
```

In `PersonalProgram`, add `participation` to `required` and to `properties`:

```diff
       required:
         - program
         - owned
         - publicationStatus
         - sourceVersionId
         - sourceLabel
         - status
         - current
         - runs
+        - participation
       properties:
         ...
+        participation:
+          $ref: '#/components/schemas/ProgramParticipation'
```

`UserSummary` does not set `additionalProperties: false` (checked), so the `allOf` extension validates and serializes.

Optional, for Program Detail: add the same `participation` property to `ProgramPreview`, and fill it in `browse.service.ts` `preview` with `await participationSummary(viewerId, programId)`.

### Proposed diff: `apps/server/src/domains/programs/library.service.ts` (owner: My Programs)

```diff
 import { programInclude, toProgramSummary } from './mapper'
 import { enrollInTx, joinableVersion } from './enrollment.service'
+import { participationSummaries } from './participation.service'
@@ export async function library(userId: string, programId?: string) {
   if (programId && !programs.length) throw notFound('Personal Program')
+  const participation = await participationSummaries(userId, programs.map((p) => p.id))
   return Promise.all(
     programs.map(async (p) => {
@@
         status,
         current,
         runs,
+        participation: participation.get(p.id)!,
       }
```

`handlers/programs.ts` needs no change: it returns the service result, and Fastify serializes it from the schema.

### SDK and web (owner: My Programs)

- Run `pnpm --filter @project/sdk generate` (or the repo's usual types script) after the spec change. `useProgramLibrary` then exposes `participation` with no hook changes.
- Table cell: `participantCount` and `activeMemberCount` show as "10 participants · 4 active this week". Leave the cell out when the counts are null; do not show 0 or a placeholder. Friends use the existing `AvatarStack` with `friends` and "+N" from `friendCount - friends.length`.

## Known limitations (deliberately not changed: scope correction)

- ~~Groups are tied to one version~~: resolved by "Mixed-version groups" below.
- **Joining an existing group requires an invitation** (USER, EMAIL or LINK). There is no group directory or join request. That matches the spec.
- `ProgramStat.enrollmentCount` (Program preview, ranking) counts enrollments, not people. It is left unchanged because `performance-hardening.test.ts` pins its reference behavior. The new `participantCount` is the right number for My Programs.
- Not built: ProgramEdition, ProgramRun, a global Community, a rules engine, cohort infrastructure, calendar virtualization, aggregation changes, ADR 0002, spec rewrites for scale.

## Mixed-version groups (P0)

Requirement: one group can hold members on different versions of its Program. For example, Alice on v1, Bob on v2 and Charlie on v1 all stay in "Morning Workout". Their calendars and Activity revisions can differ; their membership does not.

### Where groups were bound to a version (before this change)

| Constraint | Where | Effect |
|---|---|---|
| Occurrence key `programVersionId:scheduleItemId:cycleIndex` | `calendar/materialize.ts:13`, `:78`; `groups/group.service.ts:75–76` | Both ids are per-version: `openDraftVersion` copies schedule items with **new ids** (`programs/authoring.service.ts:43–60`), and `regenerate` recreates them. So the same Activity on the same Program Day never matches across versions |
| Linking an existing enrollment | `group.service.ts:69` (`programVersionId: group.programVersionId`) | A member on another version was silently not linked |
| Invitation join state | `group.service.ts:336` → `ENROLLED_OTHER_VERSION`, refused at `:407` | Anyone on the latest version could not join an older group |
| New invitee enrollment | `group.service.ts:425` (`joinableVersion(..., group.programVersionId)`) | Newcomers were enrolled on the group's creation version, not the current one |
| Direct join with `groupId` | `programs/enrollment.service.ts:173` | Refused "This group follows a different version" |
| Collaborators row | `calendar/occurrence.service.ts:127–160` | Every member without a share read `PENDING`, including members whose version has no such Activity |
| Equality on the key | completion shares (`session.service.ts:120–131`), shared media (`occurrence.service.ts:179`, `media.service.ts:683`), calendar tiles (`calendar.service.ts:41–88`), notification deep links (`worker/handlers.ts:80`, `:97`) | All of these compare the key with `=`, so a version-independent key fixes them with no query changes |

### Chosen change: no schema change, no API shape change

1. **`ProgramGroup.programVersionId` means "version at creation".** Join, link and enrollment checks are anchored on the Program (`version.programId`). A different Program is still refused.
2. **A version-independent occurrence key**, `programId:activityId:programDayIndex:ordinal`. `ordinal` is the 0-based rank of that placement among placements of the **same Activity on the same relative day** in its version, ordered by `(position, id)`.
3. **A forward-only data migration** (`20261109000000_version_independent_occurrence_keys` (named after the latest timestamped migration so it sorts last)). It rewrites legacy three-part keys in `CalendarItem.groupOccurrenceKey`, `CompletionShare.occurrenceKey`, `MediaPublication.occurrenceKey` and `Notification.groupOccurrenceKey`, using the schedule item and version the old key names. Calendar dates, statuses, sessions and results are untouched; only the group overlay key changes. Existing completion shares, reactions (attached to shares by id), group media and comments (attached to publications by id) keep their permissions and line up with the new key.
4. **Joining uses the currently available version.** A new invitee is enrolled on `Program.latestPublishedVersionId` through the same `joinableVersion` + `enrollInTx` path, so visibility, moderation, approval, payment and invitation checks are unchanged. A member already following any version of the same Program is linked as they are; their calendar is never migrated.
5. **Collaborators row:** a member with no linked item for that key is left out of the row and out of `finished of total`. They are never shown as `PENDING` (missed) for an Activity their version doesn't schedule. `UNKNOWN` (sharing off) and `NOT_PARTICIPATING` still apply to members who do have the item.

### Compatibility rule: what counts as "the same Activity"

Two members' occurrences are compatible when they share **Program, Activity id, absolute Program Day index and same-day ordinal**.

- The legacy key cannot work across versions, because both of its ids are regenerated for every version.
- `(activityId, day)` is already the identity the system relies on. Schedule regeneration keeps manual placements by `activityId:relativeDay` (`authoring.service.ts:93`). Accepting an update keeps a slot by `(activityId, programDayIndex)` (`materialize.ts` `dropSlotsKeptFromOtherVersions`). Keys and dedupe now agree.
- The Activity **id** is stable across revisions, so a v2 that only edits Squats' instructions still compares Squats with Squats. A customized copy is a different Activity id and is deliberately not compatible.
- The absolute Program Day index (`cycle × cycleLength + relativeDay`) is what both SYNC and ASYNC groups already display (`Program Day 7`), so it stays meaningful when start dates differ.
- The ordinal handles a manually duplicated placement (the same Activity twice on one day) without depending on `position`, which shifts when other Activities are inserted.
- Not compatible: a different Activity, a different Program Day, or an Activity the other version dropped. Those members are omitted, never marked missed.

The key is at most 36+1+36+1+5+1+2 = 82 characters, within the existing `VarChar(140)` columns.

### Spec change

`10-COLLABORATION.md` §1–§3 is updated in the same commit. The `ProgramGroup` row says the version is the one at creation, the occurrence key format is the new one, and `ENROLLED_OTHER_VERSION` is no longer produced (it stays in the enum for compatibility). The web branch at `apps/web/src/pages/Group.tsx:178` becomes unreachable and can be removed by the web owner later; no web change is required.

### Implemented and verified

The change was made as proposed. `program-journey.test.ts` covers:

- a mixed v1/v2 group: two members accept, one declines, two leave the offer pending;
- membership and the enrollment's group link kept after accepting;
- v2 newcomers joining through a USER invitation and through the LINK, and a v1 outsider linked through the link with an unchanged calendar;
- cross-version completion, reaction and the day-tile count;
- v2 members left out (not "missing") of a v1-only Activity;
- pre-update completions, reactions, media and comments still visible to a new v2 member;
- 404 for non-members;
- one item per (Activity, Program Day) after accepting.

A second test rewrites keys back to the legacy format, runs the migration SQL twice, and checks that the result equals the keys the server writes, including a repeated same-day placement.

### Remaining risks

- The migration was applied to `programs_app_test` only. Run `pnpm db:deploy` for `programs_app_dev`. Production runs it at the next deploy, before start.
- Same-day ordinals tie-break on schedule item id when two placements of one Activity share a `position`. JavaScript compares the ids as plain strings, MySQL uses the column collation. This only matters for manual duplicates with equal positions created before the migration.
- Outbox events already queued with a legacy key resolve their deep link to no calendar item. The notification still appears, without the item link.
- A SYNC group keeps one shared start date. A v2 joiner whose version has a different duration still starts on it; their Program Days line up and later days simply don't exist on the shorter side.
- A participant who is already in a group for the Program, including the Program owner, can no longer create a second group on another version. Previously the version mismatch let that through. This matches the one-group-per-Program rule.
- `apps/web/src/pages/Group.tsx:178` still has a branch for `ENROLLED_OTHER_VERSION`, which the server no longer returns (owner: web).
