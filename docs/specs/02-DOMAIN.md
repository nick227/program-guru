# DOMAIN — Canonical language, taxonomy, and cross-domain invariants

**Status:** Authoritative P1 baseline · **P1+:** Creator Channel concepts in §10 (`01-PRODUCT.md` §10) · **Authority:** names, identity, ownership, cross-domain relationships. Domain-specific fields belong only in docs 06–13; avoid duplicating their schemas here.

## 1. Canonical glossary

| Term | Precise meaning | Never confuse with |
|---|---|---|
| **User** | Identity owning a personal calendar, records, and content | Creator role |
| **Domain** (stored as `Category`) | Broad subject of content, e.g. Music, Fitness & Sports | Program Type or Category |
| **Category** (stored as `Focus`) | Specific subject within one Domain, e.g. Guitar, Swimming | Activity tag; difficulty |
| **Program Type** | Seeded/custom answer to “What are you creating?”; belongs to one Domain | User-chosen title |
| **Place** | A real physical location an Activity can suggest or an occurrence can be scheduled at | Event, host, venue partner or booking |
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
| **Media Contribution** | A PUBLIC Media Publication targeting someone else's Activity or Instruction; enters moderation as PENDING | Approved/public asset automatically |
| **Post** | First-class channel content item (text, images, videos, links) that may reference Programs, Activities, or other channel content without duplicating them | MediaAsset; private activity journal; Program description |
| **Media Publication** | Explicit audience-facing distribution of a MediaAsset (and optional contribution workflow) | Post; private library item; MediaAttachment alone |
| **Follow** | Relationship with another user | Enrollment; channel subscription |
| **Access Grant** | Authoritative permission to unlock **Program** content (`ProgramAccessGrant`) | Channel entitlement; subscription billing event |
| **Program Purchase** | Verified one-time payment for a Program | Access Grant or Enrollment |
| **Billing Subscription** | Recurring monthly payment for **one Program** (`programId` required) | Channel membership billing; Program Enrollment; Follow |
| **Channel Membership** | Recurring monthly payment for a creator's channel plan | Program BillingSubscription; Follow |
| **Channel Entitlement** | Authoritative permission to unlock **subscriber-inclusive** channel content | `ProgramAccessGrant`; Follow |
| **Creator Channel** | A user's one public catalog/profile plus one private management workspace for owned content | Separate creator account role; Program Group |
| **Creator Payout Account** | A user's payment-provider account for receiving earnings | Separate creator role |
| **Achievement** | Milestone derived from a user's actual completions | Streak, score, or public ranking |

Avoid `Workout`, `Exercise`, `Set`, `Lesson`, or `Habit` in core entities; these are titles, seeded types, tags, or domain-specific metric labels. Prefer product labels “Activity”, “Program”, “Calendar”, “Instruction”, “My Media”.

## 2. Proposed taxonomy (data, not enums for every label)

**Vocabulary (decided 2026-11-14, `01-PRODUCT.md` §11).** Every user-facing label, document and editorial file says **Domain** for the broad subject and **Category** for the specific one. Storage and the API are unchanged: the `Category` model, `categoryId` and `/catalog/categories` mean Domain; the `Focus` model, `ActivityFocus`, `focusId` and `/catalog/focuses` mean Category. The rest of this section uses the storage names where it describes records.

**Domains.** Existing slugs are immutable; their labels change. Editorial files use the right-hand slugs, and the seed mapper translates them.

| Stored `Category.slug` | Domain label | Editorial slug |
|---|---|---|
| `fitness` | Fitness & Sports | `fitness-sports` |
| `wellness` | Health & Wellness | `health-wellness` |
| `finance` | Work & Finance | `work-finance` |
| `relationships` | Social | `social` |
| `education` | Learning | `learning` |
| `arts-creativity` (new) | Arts & Creativity | same |
| `music` (new) | Music | same |
| `games` (new) | Games | same |
| `entertainment` (new) | Entertainment | same |
| `outdoors-nature` (new) | Outdoors & Nature | same |
| `food-cooking` (new) | Food & Cooking | same |
| `home-community` (new) | Home & Community | same |
| `custom` | Custom | none; authoring fallback, never listed as a Domain in discovery |

Existing Focus values keep their Domain and every reference to them (for example Education → Music keeps its Programs and Activities); new content in a subject that now has its own Domain goes there (new music content goes under Music). A starter Category that matches an existing Focus in the same Domain reuses it (Health & Wellness → Mindfulness).

**No tiers.** Domains, Categories, Activities and seed files carry no tier, complexity or difficulty classification, and none replaces it.

**Program Types for new Domains.** `Program.programTypeId` is required and a Program's Domain is taken from its Program Type, so every Domain needs at least one active Program Type before a Program can be created in it. Each new Domain gets exactly one general Program Type, generated from the Domain's seed definition (label `<Domain> Program`, not featured, offering all of the Domain's Categories). New Domains need no hand-authored Program Types.

Hierarchy: `Category → ProgramType → Focus`; `MetricDefinition` at Activity/Instruction. These are seedable lookup records with stable IDs/slugs, position, icon, active/retired state, and optional `createdById`; custom types/focus may initially be private to author. Do not make user-entered titles into taxonomy records automatically.

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
- **Cross-category Program attributes (`ProgramLevel`, `sessionMinutes`, `Tag`/`ProgramTag`):** `level` (`BEGINNER` | `INTERMEDIATE` | `ADVANCED` | `ALL_LEVELS`), `sessionMinutes` (typical single-session commitment in minutes), and composable cross-category `Tag` records (`ProgramTag` join table) organize and filter Programs uniformly across categories without adding category-specific columns (never add hardcoded workout columns).
- `MetricDefinition`: stable key, data type, unit, aggregation, display format, favorable direction if relevant, optional range/validation. Reps/count, duration, distance, amount, yes/no, free text are metric configurations, not fixed Activity columns.
- `ToolDefinition`: timer, counter, checklist, notes, calculator, media-capture; component key + safe declarative configuration; no executable code from users.
- `SchedulePattern`: daily, weekdays, N per week, relative days, sequential, flexible, ongoing; stored as structured scheduling rule, not as taxonomy-only strings.
- `MediaPurpose`: cover, demonstration, illustration, journal, avatar, contribution; purpose is attachment metadata, not separate file class.

**Custom taxonomy governance:** free text shown first only when “Other” chosen. Normalize label, store author and review state, keep user-defined values local by default; public discovery taxonomy accepts curated/approved labels, rather than globalizing every typo.

## 3. Cardinalities and authority

```text
User 1─1 Profile, Preferences; User 1─1 personal Calendar (its Calendar Items and Recurrences are owned by the user directly)
User 1─1 Creator Channel (same identity; public profile is the channel face; P1+ management workspace is private)
User 1─N Programs authored; User 1─N Activities authored; User 1─N Media Assets; User 1─N Posts (P1+)
Program 1─N Versions (at most one unpublished draft); Version 1─N Schedule Template Items
Schedule Template Item N─1 Activity Revision (versioned content reference)
Activity 1─N Revisions; Activity Revision 1─N Instructions
User N─M Program Versions via Enrollment
User 1─N Calendar Items; Calendar Item N─1 Activity Revision
Place 0─N Activities (suggested place); Place 0─N Calendar Items and Recurrences (scheduled place)
Calendar Item 0─N Activity Sessions; Session 0─N Result Entries
Calendar Recurrence 1─N Calendar Items; User 1─N Achievements
Program Group N─1 Program Version; Group N─M Users via Membership
Group + occurrence key 0─N Completion Shares; Completion Share 0─N Reactions
Group Media Publication 0─N Comments
MediaAsset N─M valid attachment targets through typed MediaAttachment
User N─M User via accepted Follow / optional FollowRequest
User N─M Creator Channel via Channel Membership / Channel Entitlement (P1+; distinct from Follow and Enrollment)
Post N─M referenced Programs / Activities / Media / Posts by reference only (P1+)
```

A user's Calendar can contain **several Programs and standalone activities**. Program template scheduling is relative (day index, recurrence); Calendar Items use absolute, timezone-aware occurrence dates. A shared group is an overlay on separate calendars, not a universal jointly editable calendar.

## 4. Canonical ownership and permission invariants

1. User owns their Calendar, Calendar Items, Sessions, Entries, private notes, and personal capture library. An author does not own participants' logs.
2. Program creator owns their Program and draft, not enrolled users' schedules. Publish creates immutable Version; participants adopt specific version.
3. Activity creator owns the definition/revision they authored. Seeded activities have platform ownership; editing someone else's definition creates a personal copy: a new Activity with source attribution and optional canonical-root link.
4. Media uploader owns MediaAsset and grants scoped permissions on attachments/publications; attachment alone does not change an asset's audience.
5. Discoverability (`PRIVATE` / `UNLISTED` / `PUBLIC` where defined), **publication status**, **audience access**, and **pricing/inclusion** are independent axes. Never collapse them into one visibility field. Program **AccessPolicy** remains the Program join/unlock policy (`07-PROGRAMS.md`); channel audience access is specified in §10.
6. Explicit `ShareGrant` or scoped publication is necessary to expose personal recordings to group/public. Group membership does not grant access to all private results by default.
7. Personal completion is not conditional on watching, liking, uploading, commenting, or being in a group.
8. User can join a Program without following creator, follow creator without enrollment or paid access, and subscribe to a channel without enrollment or Calendar population (P1+).
9. A Schedule Template may be reused or copied; moving a Calendar Item changes only that user's instance, including within a group.
10. Archive and moderation actions preserve integrity of historical personal records; public distribution is revoked independently.
11. Places are platform-curated catalog records (`08-ACTIVITIES.md` §2a). Linking an Activity or occurrence to a Place never makes the venue a host, organizer, sponsor or endorser, and never implies opening hours, availability, bookings or attendees. Only a future verified venue claim (deferred) may change that.
11. A Program Day groups placements for authoring and display only. Each Calendar Item has independent status, sessions, and results; there is no day-level session or result.
12. Enrollment, Program Access Grant, and Program Billing Subscription stay separate. Channel Membership and Channel Entitlement stay separate from those three and from Follow. Entitlement comes only from a verified provider event, approval, open access, channel membership rules, or admin grant.

## 5. States, expressed where they belong

- User: `ACTIVE`, `SUSPENDED`, `DEACTIVATED`.
- Program: `DRAFT`, `PUBLISHED`, `ARCHIVED`; published Versions immutable. `deletedAt` marks an owner-deleted Program kept only because other people's records depend on it (`07-PROGRAMS.md` §6); it is never shown to the owner or in discovery.
- Activity: `DRAFT`, `PUBLISHED`, `ARCHIVED` with versioned instructional content.
- Enrollment: `PENDING_ACCESS`, `ACTIVE`, `PAUSED`, `LEFT`, `COMPLETED` (separate from version and billing).
- Calendar Item: `PLANNED`, `CANCELLED`, `SKIPPED`, `DONE` (derived from chosen completion/session policy), `NOT_PARTICIPATING` (dated before the participant joined; `10-COLLABORATION.md` §3).
- Session: `READY`, `ACTIVE`, `PAUSED`, `FINISHED`, `ABANDONED`.
- Media: `UPLOADING`, `PROCESSING`, `READY`, `FAILED`, `BLOCKED`; audience handled separately.
- Follow request: `PENDING`, `APPROVED`, `DECLINED`, `CANCELLED`.
- Program Purchase: `PENDING`, `PAID`, `REFUNDED`, `DISPUTED`.
- Billing Subscription: `INCOMPLETE`, `ACTIVE`, `PAST_DUE`, `CANCELED`, `EXPIRED`.
- Creator Payout Account: `ONBOARDING`, `ACTIVE`, `RESTRICTED`.
- Group membership: `ACTIVE`, `LEFT`, `REMOVED` (pending invites are `GroupInvitation`).

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

- **Economic model (P1):** per-Program one-time purchase, per-Program monthly subscription, or both. Billing and enrollment are never conflated. Creator-channel plans are **P1+** (§10), not part of the original P1 milestone.
- **Economic model (P1+):** a monthly creator/channel subscription unlocks content explicitly marked subscriber-inclusive; individually priced Programs may still be sold one-time or via Program subscription. See `01-PRODUCT.md` §10.
- **Future live calls:** not in P1. `groupOccurrenceKey` remains stable so a future conversation or call resource can attach to it.
- **Copied Activities and canonical hubs:** a public copy does not join a canonical hub automatically; only approved equivalence contributes to aggregated demonstrations.
- **Published Program updates:** the enrolled version stays stable; moving to a newer version requires the participant's acceptance.

## 9. Domain document owners

`06-USERS.md` identity; `07-PROGRAMS.md` program/enrollment/access; `08-ACTIVITIES.md` activity/instruction/metric/tool; `09-CALENDARS.md` personal scheduling/sessions/logs; `10-COLLABORATION.md` groups/rooms; `11-MEDIA.md` assets/capture/attachments; `12-SOCIAL.md` discovery/follow/engagement/moderation; `13-PROFILES-AND-EXPERIENCE.md` public channel/profile surfaces. P1+ channel membership, Posts, and unified creator workspace concepts in §10 will amend those owners when implementation is assigned — this section is the cross-domain contract until then.

## 10. P1+ Creator Channel — additional domain concepts

Product rules and acceptance tests: `01-PRODUCT.md` §10. Monetization/payout mechanics reuse `07-PROGRAMS.md`, `05-ARCHITECTURE.md` §12, and `docs/adr/0001-billing-stripe-connect.md`. Profiles and discovery: `06-USERS.md`, `12-SOCIAL.md`, `13-PROFILES-AND-EXPERIENCE.md`. Media: `11-MEDIA.md`. **No schema or API in this revision** — names below are conceptual.

### Concepts to add (without overloading P1 tables)

| Concept | Purpose | Must not reuse as |
|---|---|---|
| **CreatorChannel** | Identity-scoped channel settings: public face = profile; private workspace pointer; optional default subscriber-inclusion policy | A second User or CREATOR role |
| **ChannelPlan / ChannelPrice** | Monthly USD price for channel membership (Connect + Checkout `mode: subscription`) | `ProgramPrice` rows for Programs |
| **ChannelMembership** | Financial instrument for the buyer↔creator channel subscription (provider subscription id, period, status) | `BillingSubscription` with a null/fake `programId` |
| **ChannelEntitlement** | Server-authoritative unlock for subscriber-inclusive content (`expiresAt`, revoke, sourceRef → membership) | `ProgramAccessGrant` |
| **ContentAudience** | Per-item audience: `PRIVATE` \| `PUBLIC` \| `PROGRAM_RESTRICTED` \| `CHANNEL_SUBSCRIBER` | Discoverability-only visibility enums |
| **SubscriberInclusion** | Explicit flag/policy: whether channel entitlement covers this item | Implied by `PUBLIC` or by Program `accessMode` alone |
| **Post** | Channel post with body/media/link payload and reference list to existing Programs, Activities, Media, or Posts | `MediaPublication` alone; duplicating Program/Activity rows |
| **PostReference** | Typed pointer from Post → existing content id | Copy-on-write of the target |
| **ChannelFeaturedItem / ChannelOrganization** | Presentation order and sections on the public channel | Ownership or entitlement |
| **PublishingRevision / history** | Enough audit for Posts and channel policy changes; Programs/Activities keep existing version models | A single global revision table that replaces ProgramVersion / ActivityRevision |

### Relationship distinctions

| Relationship | Grants |
|---|---|
| Follow | Social graph / follower-scoped profile bits only |
| Program Enrollment | Participation in a Program Version; Calendar materialization per `07` / `09` |
| Program Access Grant | Unlock of that Program's protected instructional content |
| Channel Entitlement | Unlock of items marked subscriber-inclusive on that creator's channel |
| Group membership | Collaboration overlay for a Program; not channel-wide access |

### Entitlement precedence (domain)

Most permissive **valid** grant wins among owner/editor, active channel entitlement (subscriber-inclusive items only), active Program grant, and explicit media share/publication rules. Blocks, moderation, and revocation always remove access. Channel entitlement does not create Enrollment or Calendar Items. Lapse/cancel sets protected content to locked while preserving personal history — same participant-data invariant as Program subscription lapse.

### Mixed access and media

Creators may mix free public Posts, channel-subscriber media, and Programs under OPEN / APPROVAL / PAID, with optional subscriber-inclusion on eligible items. Media continues to flow through `MediaAsset` → `MediaAttachment` → `MediaPublication`. Attaching never grants audience; publication and audience access do. Instructions remain owned by Activity revisions; the unified workspace edits them through Activity authoring, not a parallel Instruction CMS.

### Backend contracts still required (coordinate before inventing UI persistence)

| Contract | Needed for |
|---|---|
| Posts + PostReference CRUD | Channel posts; Library Posts tab; announcements |
| Collection / series + ordered refs | Content organization beyond Program |
| ChannelPlan / ChannelMembership / ChannelEntitlement | Creator subscription; subscriber-only shelf |
| ContentAudience + SubscriberInclusion on eligible items | Mixed free / subscriber / Program-priced catalog |
| ChannelFeaturedItem / ChannelOrganization | Persisted featured order and curated sections |
| Content `publishAt` / schedule | Scheduled publishing |
| `listFollowers` / `listFollowing` | Audience rosters (counts exist today) |
| Creator-facing enrollment / Program-subscriber lists | Participant vs paying Program subscriber management |
| Unpublish-to-draft (if archive is insufficient) | Full DRAFT ↔ PUBLISHED ↔ UNPUBLISHED lifecycle |

Until these land, Creator Studio must call existing Program/Activity/Media/profile/billing/follow-request operations only.

### Implementation constraint

When this epic is built: extend OpenAPI/Prisma in dedicated migrations; keep `MARKETPLACE_ENABLED` (or a sibling flag) gating paid channel checkout; webhook-only entitlement mutation; USD only unless product later amends multi-currency. Frontend must not invent local persistence for the contracts above.
