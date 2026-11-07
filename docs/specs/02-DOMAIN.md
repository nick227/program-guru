# DOMAIN — Canonical language, taxonomy, and cross-domain invariants

**Status:** Authoritative P1 baseline · **Authority:** names, identity, ownership, cross-domain relationships. Domain-specific fields belong only in docs 06–12; avoid duplicating their schemas here.

## 1. Canonical glossary

| Term | Precise meaning | Never confuse with |
|---|---|---|
| **User** | Identity owning a personal calendar, records, and content | Creator role |
| **Category** | Broad subject of content | Program Type or Focus |
| **Program Type** | Seeded/custom answer to “What are you creating?” | User-chosen title |
| **Focus** | More specific subject under a Type | Activity tag |
| **Program** | Reusable authored curriculum and relative scheduling intent | User's actual calendar |
| **Program Version** | Immutable published snapshot of a Program | Editable draft |
| **Program Enrollment** | User adopting a specific Program Version | Following its creator; payment subscription |
| **Activity** | Reusable canonical action definition | Calendar occurrence |
| **Activity Revision** | Stable revision/snapshot of Activity instructions/definitions | Personal result |
| **Instruction** | Optional ordered guidance inside an Activity, usually 1–3 | Required separate step/page |
| **Schedule Template** | Relative placements supplied by Program Version | User's dated Calendar |
| **Program Day** | A relative day in a Schedule Template with at least one placement; unit shown as `24 program days` | Activity Session or Calendar Item |
| **Placement** | One Activity on one Program Day, as a Program Schedule Item | The Activity itself |
| **Calendar** | One user's aggregate personal schedule | Program or group |
| **Calendar Item** | Dated occurrence of one Activity on that Calendar | Reusable Activity or a whole Program Day |
| **Calendar Recurrence** | A user's personal repeat rule that generates Calendar Items for a standalone Activity | Program Schedule Template |
| **Activity Session** | Actual start/pause/finish attempt for one Calendar Item or unscheduled Activity; independent per Activity | Program Day; generic presence on Calendar |
| **Result Entry** | Actual typed measurements, notes, and attachments | Target/default metric |
| **Program Group** | Optional collaborative participation around a Program/version | Shared editable calendar |
| **Group Occurrence** | Stable key identifying the equivalent Program occurrence across group members | A member's Calendar Item |
| **Completion Share** | Minimal, consented record that a member finished a group occurrence | Result Entry |
| **Media Asset** | Privately owned file/library item with storage metadata | Published attachment |
| **Media Attachment** | A link from asset to Program, Activity, Instruction, Log, or Profile | Permission to publish |
| **Media Contribution** | Submission/recommendation of owned media for another entity | Approved/public asset automatically |
| **Post/Public Media** | Explicitly published audience-facing item | Private activity journal |
| **Follow** | Relationship with another user | Enrollment in program |
| **Access Grant** | Authoritative permission to unlock Program content | Subscription billing event |
| **Program Purchase** | Verified one-time payment for a Program | Access Grant or Enrollment |
| **Billing Subscription** | Recurring monthly payment for one Program | Program Enrollment or creator Follow |
| **Creator Payout Account** | A user's payment-provider account for receiving earnings | Separate creator role |
| **Achievement** | Milestone derived from a user's actual completions | Streak, score, or public ranking |

Avoid `Workout`, `Exercise`, `Set`, `Lesson`, or `Habit` in core entities; these are titles, seeded types, tags, or domain-specific metric labels. Prefer product labels “Activity”, “Program”, “Calendar”, “Instruction”, “My Media”.

## 2. Proposed taxonomy (data, not enums for every label)

Hierarchy: `Category → ProgramType → Focus`; optional `ActivityTag` classifications and `MetricDefinition` at Activity/Instruction. These are seedable lookup records with stable IDs/slugs, position, icon, active/retired state, and optional `createdById`; custom types/focus may initially be private to author. Do not make user-entered titles into taxonomy records automatically.

| Category | Seeded Program Types | Example Focus values |
|---|---|---|
| Fitness | Workout, Mobility Routine, Walking Plan | Strength, Cardio, Flexibility, Endurance, General Fitness |
| Wellness | Wellness Routine, Meditation Routine, Sleep Routine, Reflection Plan | Mindfulness, Relaxation, Rest, Daily Reflection |
| Finance | Savings Plan, Budget Routine, Financial Learning | Emergency Fund, Spending Review, Fundamentals |
| Relationships | Relationship Plan, Connection Plan, Shared Activity Plan | Friends, Family, Communication, Quality Time |
| Education | Study Program, Practice Routine, Reading Plan | Languages, Music, Exam Prep, Professional Skills |
| Custom | Custom Program | Author-entered focus (subject to moderation if public) |

Taxonomy requirements:

- `Category`: immutable stable slug/ID; public label editable via localization; global broad aggregation.
- `ProgramType`: belongs to one Category; stable slug, label, icon; `isFeatured` marks the types on the first creation screen (Workout, Wellness Routine, Savings Plan, Study Program, Relationship Plan); seeded or user-defined; not Program title.
- `Focus`: belongs to one Category; scoped slug, label, position; seeded/user-defined. `ProgramTypeFocus` lists which Focus values each Program Type offers. Activities link to Focus many-to-many so the library can be browsed by Category and Focus.
- `ActivityTag`: many-to-many, narrow tags such as `bodyweight`, `no-equipment`, `beginner`, `indoor`; no hardcoded workout columns.
- `MetricDefinition`: stable key, data type, unit, aggregation, display format, favorable direction if relevant, optional range/validation. Reps/count, duration, distance, amount, yes/no, free text are metric configurations, not fixed Activity columns.
- `ToolDefinition`: timer, counter, checklist, notes, calculator, media-capture; component key + safe declarative configuration; no executable code from users.
- `SchedulePattern`: daily, weekdays, N per week, relative days, sequential, flexible, ongoing; stored as structured scheduling rule, not as taxonomy-only strings.
- `MediaPurpose`: cover, demonstration, illustration, journal, avatar, contribution; purpose is attachment metadata, not separate file class.

**Custom taxonomy governance:** free text shown first only when “Other” chosen. Normalize label, store author and review state, keep user-defined values local by default; public discovery taxonomy accepts curated/approved labels, rather than globalizing every typo.

## 3. Cardinalities and authority

```text
User 1─1 Profile, Preferences; User 1─N Calendar (one default in P1)
User 1─N Programs authored; User 1─N Activities authored; User 1─N Media Assets
Program 1─N Versions (at most one unpublished draft); Version 1─N Schedule Template Items
Schedule Template Item N─1 Activity Revision (versioned content reference)
Activity 1─N Revisions; Activity Revision 1─N Instructions
User N─M Program Versions via Enrollment
User 1─N Calendar Items; Calendar Item N─1 Activity Revision
Calendar Item 0─N Activity Sessions; Session 0─N Result Entries
Calendar Recurrence 1─N Calendar Items; User 1─N Achievements
Program Group N─1 Program Version; Group N─M Users via Membership
Group + occurrence key 0─N Completion Shares; Completion Share 0─N Reactions
Group Media Publication 0─N Comments
MediaAsset N─M valid attachment targets through typed MediaAttachment
User N─M User via accepted Follow / optional FollowRequest
```

A user's Calendar can contain **several Programs and standalone activities**. Program template scheduling is relative (day index, recurrence); Calendar Items use absolute, timezone-aware occurrence dates. A shared group is an overlay on separate calendars, not a universal jointly editable calendar.

## 4. Canonical ownership and permission invariants

1. User owns their Calendar, Calendar Items, Sessions, Entries, private notes, and personal capture library. An author does not own participants' logs.
2. Program creator owns their Program and draft, not enrolled users' schedules. Publish creates immutable Version; participants adopt specific version.
3. Activity creator owns the definition/revision they authored. Seeded activities have platform ownership; editing someone else's definition creates a personal copy: a new Activity with source attribution and optional canonical-root link.
4. Media uploader owns MediaAsset and grants scoped permissions on attachments/publications; attachment alone does not change an asset's audience.
5. `PRIVATE`, `UNLISTED`, and `PUBLIC` determine discoverability; **AccessPolicy** determines program content access. These are independent axes.
6. Explicit `ShareGrant` or scoped publication is necessary to expose personal recordings to group/public. Group membership does not grant access to all private results by default.
7. Personal completion is not conditional on watching, liking, uploading, commenting, or being in a group.
8. User can join a Program without following creator, and follow creator without enrollment or paid access.
9. A Schedule Template may be reused or copied; moving a Calendar Item changes only that user's instance, including within a group.
10. Archive and moderation actions preserve integrity of historical personal records; public distribution is revoked independently.
11. A Program Day groups placements for authoring and display only. Each Calendar Item has independent status, sessions, and results; there is no day-level session or result.
12. Enrollment, Access Grant, and Billing Subscription stay separate. Entitlement comes only from a verified provider event, approval, open access, or admin grant.

## 5. States, expressed where they belong

- User: `ACTIVE`, `SUSPENDED`, `DEACTIVATED`.
- Program: `DRAFT`, `PUBLISHED`, `ARCHIVED`; published Versions immutable.
- Activity: `DRAFT`, `PUBLISHED`, `ARCHIVED` with versioned instructional content.
- Enrollment: `PENDING_ACCESS`, `ACTIVE`, `PAUSED`, `LEFT`, `COMPLETED` (separate from version and billing).
- Calendar Item: `PLANNED`, `CANCELLED`, `SKIPPED`, `DONE` (derived from chosen completion/session policy).
- Session: `READY`, `ACTIVE`, `PAUSED`, `FINISHED`, `ABANDONED`.
- Media: `UPLOADING`, `PROCESSING`, `READY`, `FAILED`, `BLOCKED`; audience handled separately.
- Follow request: `PENDING`, `APPROVED`, `DECLINED`, `CANCELLED`.
- Program Purchase: `PENDING`, `PAID`, `REFUNDED`, `DISPUTED`.
- Billing Subscription: `INCOMPLETE`, `ACTIVE`, `PAST_DUE`, `CANCELED`, `EXPIRED`.
- Creator Payout Account: `ONBOARDING`, `ACTIVE`, `RESTRICTED`.
- Group membership: `INVITED`, `ACTIVE`, `LEFT`, `REMOVED`.

All state transitions must be checked by services with actor, ownership, and role. Do not create a universal status enum.

## 6. Content lineage and shared Activity media

If 100 programs contain Leg Raises, there should be a **canonical Activity identity** and independently attributed content. A derivative Activity retains `sourceActivityId` and `canonicalActivityId` only after author selection or moderation-confirmed equivalence. Different movements or context-specific adaptations must not be silently merged by title similarity. Community media aggregation includes **only** approved, explicitly public, licensed contributions mapped to that canonical identity or relevant Instruction, ordered with current Program creator's eligible selected content first. Public likes and views apply to media **publication**, not the viewer's private result or an Activity definition as a whole.

## 7. General API/data conventions

- IDs: UUID stored as `Char(36)` project-wide; opaque strings in API responses; DB indexes on foreign keys.
- Times: store UTC instants; schedule with IANA timezone + local date/time where meaningful; keep day-index separate from absolute dates.
- `position`: stable integer order, service can renumber transactionally; prefer sortable keys if collaboration editing increases.
- DTOs: explicit create/patch/read contracts; `undefined` = unchanged, `null` = clear field; no raw Prisma objects at API boundary.
- DAOs: persistence only; Services: orchestration, state, permissions, publishing; Mappers: output projection; UI: view state, no business authorization.
- Audit: version/author/edit timestamps for public content and policy changes; do not expose private details in public counts.
- Content constraints: sanitize rich text, safe upload metadata, validated typed metrics, server-side search and publication authorization.
- Paginate library/media/comments with cursors; do not prefetch infinite grids.

## 8. Resolved domain choices

- **Economic model:** per-Program one-time purchase, per-Program monthly subscription, or both. No creator-wide plan in P1. Billing and enrollment are never conflated.
- **Future live calls:** not in P1. `groupOccurrenceKey` remains stable so a future conversation or call resource can attach to it.
- **Copied Activities and canonical hubs:** a public copy does not join a canonical hub automatically; only approved equivalence contributes to aggregated demonstrations.
- **Published Program updates:** the enrolled version stays stable; moving to a newer version requires the participant's acceptance.

## 9. Domain document owners

`06-USERS.md` identity; `07-PROGRAMS.md` program/enrollment/access; `08-ACTIVITIES.md` activity/instruction/metric/tool; `09-CALENDARS.md` personal scheduling/sessions/logs; `10-COLLABORATION.md` groups/rooms; `11-MEDIA.md` assets/capture/attachments; `12-SOCIAL.md` discovery/follow/engagement/moderation.
