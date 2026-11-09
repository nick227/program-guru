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

- **Groups are tied to one version** (`10-COLLABORATION.md` §1). After a group member accepts an update, their new items carry occurrence keys of the new version. Those items no longer line up with members still on the old version, so the Collaborators row is empty for them. Past and kept items, and their completion shares, stay in the group. New joiners start on the latest version, and an invitation to an old-version group then reads `ENROLLED_OTHER_VERSION`. Changing this means changing the group↔version relationship, which is out of scope. For a group, the decision is per member until the spec defines group-level version alignment.
- **Joining an existing group requires an invitation** (USER, EMAIL or LINK). There is no group directory or join request. That matches the spec.
- `ProgramStat.enrollmentCount` (Program preview, ranking) counts enrollments, not people. It is left unchanged because `performance-hardening.test.ts` pins its reference behavior. The new `participantCount` is the right number for My Programs.
- Not built: ProgramEdition, ProgramRun, a global Community, a rules engine, cohort infrastructure, calendar virtualization, aggregation changes, ADR 0002, spec rewrites for scale.
