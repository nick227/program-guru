# Gatherings audit — every `ProgramGroup` assumption

**Purpose:** supports `docs/specs/10-COLLABORATION.md` §9 (standalone Activity gatherings, proposed). Audited 2026-11-14 at commit `60fb888`. Line numbers refer to that commit.

**Question per finding:** does it assume a Program/version? What breaks if `ProgramGroup.programVersionId` is null (a gathering)? What is the minimal change?

Legend: **OK** works unchanged for a gathering · **Branch** needs a gathering branch · **Guard** must reject or skip gatherings · **Contract** OpenAPI/SDK shape change.

## 1. Schema (`packages/db/prisma/schema.prisma`)

| Finding | Program assumption | If `programVersionId` is null | Minimal change |
|---|---|---|---|
| `ProgramGroup.programVersionId String` + `version` relation (schema.prisma:1279, :1294) | Required FK to `ProgramVersion` | Cannot insert | **Make optional.** Add `kind` (PROGRAM \| GATHERING), `activityId?`, `startLocalTime?`, `placeId?`, `capacity?`. Reuse `startLocalDate` and `timezone` (:1287–1288) for the gathering's date and zone |
| `@@index([programVersionId, status])` (:1302) | Program lookups | Unaffected | Add `@@index([activityId, kind, status, startLocalDate])` for "upcoming gatherings" |
| `GroupMember` (:1307–1321): `groupId`, `role`, `status`, `sharedCompletionEnabled`, cascade on group delete | None | OK | None |
| `GroupInvitation` (:1323–1343): `kind USER/EMAIL/LINK`, token hash, cascade | None in the row (the Program appears only in previews; see server) | OK | None |
| `CompletionShare.groupId` required, `occurrenceKey` required, `calendarItemId?` SET NULL, `@@unique([groupId, calendarItemId])` (:1345–1373) | None: keyed by group + occurrence | OK. A gathering is a group, so shares, reactions and comments work | None. This is the main reason to reuse groups rather than add a new model |
| `CompletionReaction`, `CompletionComment` (:1375–1405) | None | OK | None |
| `MediaPublication.groupId?` SET NULL, `occurrenceKey?`, `audience GROUP`, `@@index([groupId, occurrenceKey, status])` (:1560–1601) | None | OK | None |
| `ProgramEnrollment.groupId?` SET NULL (:840) | A group member *follows the Program* through an enrollment | Gatherings have no enrollment | None to the schema; the gathering link must live on `CalendarItem` (below) |
| `CalendarItem.groupOccurrenceKey VarChar(140)` (:1095, index :1124) | The group is reached only through `enrollment.groupId` | A gathering item has no enrollment, so the room cannot find its group | **Add `CalendarItem.gatheringId?`** (FK → `ProgramGroup`, SET NULL, indexed). Key = `gathering:<groupId>` |
| `Notification.groupOccurrenceKey` (:1733, :1743) | None | OK | None |
| Presence | **No table**: in-memory map in `presence.service.ts:18` | Works per process; not shared across replicas (existing limitation, not gathering-specific) | None for the POC; note the risk |
| CHECK constraints (`0001_init/migration.sql:1469–1480`) | None on group tables | — | A new CHECK `(kind='PROGRAM') = (programVersionId IS NOT NULL)` and `(kind='GATHERING') = (activityId IS NOT NULL)` is allowed. Per CLAUDE.md, columns in a CHECK need `Restrict` FKs (true for `programVersionId`; make `activityId` Restrict). Keep `placeId` (SET NULL) **out** of the CHECK |
| Enums: `GroupMode SYNC/ASYNC`, `GroupVisibility`, `GroupJoinPolicy`, `GroupStatus ACTIVE/CLOSED`, `GroupRole`, `InviteKind`; notification types include `GROUP_INVITE`, `MEMBER_JOINED`, `COMPLETION_*`, `GROUP_MEDIA_*` | — | All reusable | Add one enum value, `GATHERING_CHANGED` (time/place change or cancellation); open decision |

## 2. Server

### `apps/server/src/domains/groups/group.service.ts`

| Lines | Function | Program assumption | Gathering effect | Change |
|---|---|---|---|---|
| 26–36 | `activeMember`, `ownedGroup` | None | OK | — |
| 38–66 | `toSummary` | Reads `g.version.programId/title` | Crash on null `version` | **Branch + Contract:** `programId/programVersionId/programTitle` nullable; add `kind`, `activity`, `startLocalTime`, `place`, `capacity` |
| 67–88 | `isStartingSoonGroup` | Uses `mode`/`startLocalDate`/`timezone` only | OK; also usable for "starting soon" gatherings | — |
| 90–161 | `recentCheckInCounts`, `loadGroupAggregates` (blocking at 114–133) | None | OK | — |
| 163–188 | `toPublicGroupSummary` | `g.version.*` | Crash | **Branch + Contract** (as `toSummary`) |
| 205–223 | `startingSoonProgramIds` | `version.program` filter | Gathering rows excluded by the join | **Guard:** add `kind: 'PROGRAM'` explicitly |
| 226–268 | `featuredGroupsForPrograms` | Groups per Program | Excluded | **Guard** (`kind: 'PROGRAM'`) |
| 270–316 | `listByProgram` | Program-scoped | Excluded | **Guard** |
| 318–384 | `listByActivity` | Groups *of Programs containing* the Activity; access via schedule items (328–345) | Gatherings not listed | **Branch:** also return the Activity's open/visible gatherings, or a separate list op (spec §9.6) |
| 386–412 | `toDetail` | `include: { version }`, `myEnrollment` | Crash | **Branch:** `myEnrollment: null`; add `myCalendarItemId` for gatherings |
| 419–440 | `linkEnrollment` | Stamps Program keys via `occurrenceKey(programId,…)` | N/A | **Guard:** skip; gatherings call `linkGatheringItem` (new: one item, key `gathering:<id>`) |
| 442–468 | `unlinkEnrollment`, `depart` | Clears enrollment link | Gathering item stays linked | **Branch:** on leave/remove, detach the member's gathering item (spec §9.4) |
| 470–481 | `listMine` | `include: { version }` | Crash | **Branch** (null-safe include) |
| 483–531 | `create` | Requires a published version, Program enrollment, Program visibility (495–508) | N/A | **Separate op** `createGathering` (spec §9.3); keep this Program-only |
| 538–588 | `update` | Public requires a public Program (563–567) | Wrong rule | **Branch:** public requires a public published Activity; owner may edit date/time/place/capacity |
| 589–608 | `updateMyMembership` | Owner hand-off (598–600) | OK | **Branch:** gathering leave also detaches the item |
| 610–631 | `removeMember` | Via `depart` | As above | Branch through `depart` |
| 639–686 | `invite` | `openForJoins` (643) reads `g.version.program` | Crash | **Branch** `openForJoins`: gathering = `status ACTIVE` ∧ Activity published, unmoderated ∧ start not past ∧ capacity not full |
| 697–707 | invitation include / `openForJoins` | `version.program.policy` | Crash | **Branch** |
| 744–783 | `evaluateGroupJoinState` | Program access, enrollment, "leave other group" | Meaningless | **Branch:** states `ALREADY_MEMBER`, `READY_TO_JOIN`, `FULL`, `PAST`, `UNAVAILABLE` |
| 791–806 | `toPreview` (invitation) | `programPreview` | Crash | **Branch + Contract:** preview carries `activity`/time/place instead of `program` |
| 838–916 | `executeGroupJoin` | Entitlement, enrollment, `enrollInTx`, `linkEnrollment` | N/A | **Branch:** membership + one Calendar Item, one transaction (spec §9.4) |
| 922–961 | `loadPublicGroup`, `previewPublic` | Program visibility (928–929), `programPreview` (942) | Crash/reject | **Branch** |
| 962–1011 | `joinPublic`, `idempotentAccept`, `accept`, `acceptMine` | Idempotency only when `input.enrollment` (982) | Gathering join must be idempotent too | **Branch:** gathering join always requires `idempotencyKey` |
| 1029–1036 | `expireInvitations` | None | OK | — |
| 1062–1161 | reactions, `listCompletions` (blocked filter 1092), `listMedia` | None | OK | — |
| 1163–1323 | `createCheckIns` | Key = `item.groupOccurrenceKey ?? 'activity:<activityId>'` (1231) | OK once the item carries `gathering:<id>` | — (prefixes cannot collide; see spec §9.2) |
| 1324–1400 | completion comments | None | OK | — |

### Other server code

| File:lines | Finding | Gathering effect | Change |
|---|---|---|---|
| `groups/presence.service.ts:33–91` | Heartbeat/leave by group membership | OK | — |
| `groups/presence.service.ts:93–220` | `listLivePublicSessions` filters `version: { program: discoverable }` (104–119) and builds titles/thumbnails from `g.version` (165–218) | Gatherings never appear as live | **Branch** (title/thumbnail from the Activity) or leave out for the POC (open decision) |
| `calendar/occurrence.service.ts:125–146` | Collaborators: `groupId = item.enrollment?.groupId` (126); peer items matched via `enrollment.groupId` (146) | **Room is empty for gatherings** | **Branch:** `groupId = item.enrollment?.groupId ?? item.gatheringId`; peers matched by `groupOccurrenceKey` + `gatheringId` |
| `calendar/occurrence.service.ts:212–215` | Shared media by `groupId + occurrenceKey` | OK once `groupId` resolves | — |
| `calendar/occurrence.service.ts:236` | `creatorId` from `enrollment.program` | null for gatherings (fine: Activity creator shown elsewhere) | — |
| `calendar/materialize.ts:20, :103` | Program key `programId:activityId:day:ordinal` | Not used by gatherings | — |
| `calendar/calendar.service.ts:304–372` (`update`), `:374` (`cancel`) | Moves/cancels a personal item; no group awareness | A moved gathering item would still claim participation | **Branch:** moving date/time/place or cancelling a gathering item leaves the gathering (spec §9.5) |
| `calendar/calendar.service.ts:206` (`add`) | Independent personal items; unique `idempotencyKey` | OK: never links to a gathering | — |
| `programs/enrollment.service.ts:174–190` | Enroll with `groupId` checks `group.version.programId` (179) | Must reject a gathering id | **Guard:** require `kind: 'PROGRAM'` |
| `programs/delete.service.ts:20, :62–64` | Deletes groups by `programVersionId` | Gatherings untouched (null) | — |
| `programs/participation.service.ts:79–90` | Program participation signals via group members | Gathering members would be counted if not filtered | **Guard** (`kind: 'PROGRAM'`) |
| `media/media.service.ts:699–743, :773–776` | GROUP audience: requires `groupId` + active membership | OK | — |
| `social/social.service.ts:115` | `featuredGroupsForPrograms` for discover | Excluded via Guard above | — |
| `social/social.service.ts:369` | Comments only on GROUP media | OK | — |
| `worker/handlers.ts:89–135` | `CompletionShared` etc.: recipients = active members; deep link to the item with the same `groupOccurrenceKey` | OK (links to `/occurrences/:id`) | — |
| `worker/handlers.ts:142–160` | `GroupInvited` title/email use `group.version.title` | Crash/blank | **Branch:** Activity title, date, time and Place name |
| `worker/jobs.ts:262–306` | Ranking stats by `e.programId` | None | — |

## 3. Web

| File:lines | Finding | Gathering effect | Change |
|---|---|---|---|
| `components/activity/ActivityTogether.tsx` | No Program references | OK: the participation rail for the room | — |
| `pages/Occurrence.tsx:385–432` | Together row shown when `o.collaborators` | OK once the server resolves `gatheringId` | — |
| `components/group-stage/GroupStage.tsx:58` | `useProgramVersion(g.programVersionId)` unconditionally | Request with an empty id | **Branch:** skip for gatherings |
| `components/group-stage/GroupStage.tsx:158–209`, `GroupCheckInModal.tsx:176` | `g.name \|\| g.programTitle` | Blank title | Fallback to the Activity title |
| `pages/Group.tsx:115–156, :331, :1027` | Invitation preview reads `preview.program` | Crash | **Branch:** show Activity, date, time, Place |
| `pages/Group.tsx:493–494, :541–577` | `myEnrollment` block (start dates) | Hidden (null) | Show "On your calendar: <date time>" with a link to the item |
| `components/program/ProgramGroups.tsx:58–207`, `components/social/GroupStatus.tsx:96–173` | Program-scoped group lists | Must not list gatherings | Guarded server-side; no change |
| `pages/Browse.tsx:634, :851` | `featuredGroup` cards are Program groups | Unaffected | "With others" shortcut uses the new gatherings filter (spec §9.6) |
| `lib/joinEligibility.ts` | `groupAction(viewerIsMember, joinPolicy)` | Reusable | Extend with `full` and `past` → no Join (spec §9.4) |

## 4. Risks

1. **Contract churn:** `GroupSummary`, `GroupDetail`, `PublicGroupSummary`, `PublicGroupPreview`, `LiveSessionSummary` require `programId`/`programVersionId`/`programTitle` (openapi.yaml :11056, :11355, :11224, :11288, :11160). Making them nullable touches every web consumer above; the SDK types catch each one at compile time.
2. **Hidden Program filters:** any query reaching groups through `version: { program: … }` silently excludes gatherings. Good for Program surfaces, wrong for gathering ones. Add explicit `kind` filters rather than relying on the join.
3. **Occurrence room lookup** depends on enrollments today (`occurrence.service.ts:126`). Without `CalendarItem.gatheringId`, gatherings have no room.
4. **Presence is per process** (`presence.service.ts:18`): live counts are wrong across replicas. This is existing behaviour, but more visible for gatherings.
5. **`executeGroupJoin`** (838–916) is the most complex Program path. A gathering join must be a separate, small branch; do not route it through enrollment logic.
