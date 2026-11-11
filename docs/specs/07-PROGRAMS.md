# PROGRAMS — Authoring, schedule templates, enrollment, access, publishing

**Status:** Authoritative P1 contract · **Authority:** Program models, joins/versions, access/unlocking. Calendar occurrences belong to `09-CALENDARS.md`. UI locked workspace belongs to `03-UX.md`.

## 1. Boundary

A Program is a **reusable, authored collection of Activities with a schedule template** and media. It may serve multiple goals, but P1 does not need a mandatory Goal record or objective management screen. A creator can draft for a long time, independently publish/withdraw, and use public/seeded/private author-owned Activities. Participants **enroll** into a specific published Program Version; each obtains personal dated Calendar Items. A Program Group optionally links their participation but never merges their calendars.

Program is **not** Calendar. `ProgramScheduleItem` is a template placement and not `Activity` itself: Leg Raises may occur on Mon/Wed/Fri with different defaults while retaining one reusable Activity identity.

**Program Day vs Activity Session:** a Program Day is a relative day with at least one placement, used for authoring, counts, and group alignment. Each placement becomes its own Calendar Item for each participant, with independent status, Activity Sessions, and results (`09-CALENDARS.md`). Nothing is executed or logged at the Program Day level.

## 2. Entities and fields

| Model | Essential columns | Constraints |
|---|---|---|
| `Program` | `id`, `slug?`, `creatorId`, `title`, `description?`, `categoryId`, `programTypeId`, `focusId?`, `level`, `sessionMinutes?`, `coverMediaId?`, `visibility`, `status`, `latestPublishedVersionId?`, `draftRevision`, timestamps | creator FK; unique `(creatorId,slug)`; indexes by category/type/focus/level/sessionMinutes/status |
| `ProgramTag` | `programId`, `tagId`, `position` | composite PK `(programId,tagId)`; links Program to cross-category `Tag` records |
| `ProgramSlugAlias` | `id`, `programId`, `creatorId?`, `slug`, `createdAt` | unique `(creatorId,slug)`; preserves historical slugs across renames |
| `ProgramVersion` | `id`, `programId`, `versionNumber`, `title`, `description?`, `programTypeId`, `focusId?`, `level`, `sessionMinutes?`, `durationDays?`, `cycleDays?`, `frequency`, `generationMode`, `programDayCount`, `placementCount`, `publishedAt?`, `createdById` | unique `(programId,versionNumber)`; `publishedAt` null = the single editable draft; immutable once published |
| `ProgramScheduleItem` | `id`, `programVersionId`, `activityId`, `activityRevisionId`, `relativeDay`, `localTime?`, `position`, `targetOverrides JSON?`, `isManual` | FK, valid offsets, ordered index; `isManual` placements survive regeneration |
| `ProgramAccessPolicy` | `programId PK`, `accessMode OPEN/APPROVAL/PAID`, `previewPolicy JSON?` | PAID requires an active `ProgramPrice` and ACTIVE payout account |
| `ProgramPrice` | `id`, `programId`, `kind ONE_TIME/MONTHLY`, `currency USD`, `amountMinor`, `providerPriceId?`, `active` | at most one active price of each kind |
| `ProgramEnrollment` | `id`, `userId`, `programId`, `programVersionId`, `pendingVersionId?`, `groupId?`, `startLocalDate`, `timezone`, `status`, `activeKey?`, `generatedThroughDate?`, timestamps | one row per **run**: a person may hold several runs of one Program at once (see Runs below); `activeKey` is informational, not unique; indexed user/status |
| `ProgramAccessGrant` | `id`, `userId`, `programId`, `source OPEN/APPROVAL/PURCHASE/SUBSCRIPTION/ADMIN`, `sourceRef?`, `grantedAt`, `expiresAt?`, `revokedAt?` | unique `(source,sourceRef)`; `sourceRef` required for purchase, subscription, and approval |
| `ProgramApprovalRequest` | `id`, `userId`, `programId`, `status`, `requestedAt`, `resolvedAt?`, `activeKey?` | unique pending per pair via `activeKey` |
| `ProgramSource` | `programId`, `sourceProgramVersionId`, `copiedById` | preserve provenance when copying a template |
| `ProgramStat` | `programId PK`, `enrollmentCount`, `completionRate`, `retention30d`, `computedAt` | derived; suppressed from public display below a minimum sample |
| `CreatorPayoutAccount` | `userId PK`, `providerAccountId`, `status ONBOARDING/ACTIVE/RESTRICTED`, `chargesEnabled`, `payoutsEnabled`, timestamps | one per user |
| `ProgramPurchase` | `id`, `userId`, `programId`, `priceId`, `amountMinor`, `platformFeeMinor`, `currency`, `status`, `providerCheckoutId`, `providerPaymentId?`, timestamps | unique provider IDs |
| `BillingSubscription` | `id`, `userId`, `programId`, `priceId`, `status`, `providerSubscriptionId`, `currentPeriodEnd?`, `cancelAtPeriodEnd`, timestamps | unique provider ID |
| `BillingEvent` | `id`, `providerEventId`, `type`, `payload JSON`, `processedAt?`, `error?`, `createdAt` | unique provider event ID; audit and idempotency |

Taxonomy tables `Category`, `ProgramType`, `Focus` live in shared classification and are specified in `02-DOMAIN.md`. Actual multi-goal linkage is future; no goal IDs in Program core. `frequency` is a validated structured value such as `{"kind":"N_PER_WEEK","n":3}`. Consolidated persistence: `packages/db/prisma/schema.prisma`.

## 3. DTOs

```ts
interface ProgramSummaryDto { id:string; title:string; type:{id:string;label:string}; focus?:{id:string;label:string};
  level:'BEGINNER'|'INTERMEDIATE'|'ADVANCED'|'ALL_LEVELS'; sessionMinutes:number|null; tags:{id:string;slug:string;label:string;group:string|null}[];
  creator:UserSummaryDto; coverUrl:string|null; durationDays:number|null; programDays:number|null;
  placements:number|null; prices:ProgramPriceDto[];
  visibility:'PRIVATE'|'UNLISTED'|'PUBLIC'; accessMode:'OPEN'|'APPROVAL'|'PAID';
  viewerAccess:'OWNER'|'GRANTED'|'PREVIEW'|'REQUESTED'|'LAPSED'; }
interface ProgramPriceDto { id:string; kind:'ONE_TIME'|'MONTHLY'; amountMinor:number; currency:'USD'; }
interface ProgramWorkspaceDto extends ProgramSummaryDto { status:'DRAFT'|'PUBLISHED'|'ARCHIVED';
  frequencyLabel:string; instructionCount:number; activities:ProgramActivityRowDto[]; draftRevision:number; }
interface ProgramActivityRowDto { placementId:string; activityId:string; title:string;
  instructionCount:number; mediaCount:number; metrics:{key:string;label:string;unit?:string}[]; }
interface ProgramPreviewDto extends ProgramSummaryDto { description:string|null;
  safeActivityOutline:{title:string;dayIndex?:number;mediaPreviewUrl?:string}[];
  canJoin:boolean; canRequestAccess:boolean; canPurchase:boolean; }
interface CreateProgramDto { programTypeId:string; focusId?:string|null; }
interface UpdateProgramDraftDto { title?:string; description?:string|null; categoryId?:string;
  programTypeId?:string; focusId?:string|null; level?:'BEGINNER'|'INTERMEDIATE'|'ADVANCED'|'ALL_LEVELS';
  sessionMinutes?:number|null; tagSlugs?:string[]; durationDays?:number|null;
  frequency?:FrequencyDto; generationMode?:'ALL_EACH_DAY'|'ROTATE'; visibility?:'PRIVATE'|'UNLISTED'|'PUBLIC';
  expectedRevision:number; }
interface FrequencyDto { kind:'DAILY'|'WEEKDAYS'|'N_PER_WEEK'|'FLEXIBLE'|'CUSTOM'; n?:number; offsets?:number[]; }
interface PlaceActivityDto { activityId:string; activityRevisionId?:string; relativeDay:number;
  time?:string|null; position?:number; targetOverrides?:Record<string,unknown>; }
interface JoinProgramDto { programVersionId:string; startLocalDate:string; timezone:string;
  groupId?:string|null; idempotencyKey:string; }
interface CreateCheckoutDto { priceId:string; idempotencyKey:string; }
interface CheckoutDto { checkoutUrl:string; purchaseId:string|null; subscriptionId:string|null; }
interface EnrollmentDto { id:string; programVersionId:string; startLocalDate:string; status:string;
  calendarItemCount:number; groupId:string|null; }
```

Do not return full locked instructions/media in ProgramPreviewDto. `ProgramWorkspaceDto` is owner-facing only. Published version data should be fetched by explicit version ID; cache aggressively but respect media takedown/access.

## 4. DAO/service boundaries

```ts
interface ProgramDao {
  createDraft(authorId:string,typeId:string,focusId:string|null,db:Db):Promise<ProgramRow>;
  getOwnerWorkspace(programId:string,db:Db):Promise<ProgramAggregate|null>;
  updateDraft(programId:string,patch:DraftPatch,expectedRevision:number,db:Db):Promise<ProgramAggregate>;
  replaceDraftPlacements(programId:string,placements:DraftPlacement[],db:Db):Promise<void>;
  publishSnapshot(programId:string,snapshot:ValidatedSnapshot,db:Db):Promise<ProgramVersionRow>;
  listPublic(filters:ProgramSearch,page:Page,db:Db):Promise<PageOf<ProgramSummaryRow>>;
}
interface EnrollmentDao {
  findActive(userId:string,versionId:string,db:Db):Promise<EnrollmentRow|null>;
  create(data:NewEnrollment,db:Db):Promise<EnrollmentRow>;
  setStatus(id:string,status:EnrollmentStatus,db:Db):Promise<void>;
}
interface AccessDao {
  resolve(userId:string,programId:string,db:Db):Promise<AccessDecision>;
  grant(data:NewGrant,db:Db):Promise<GrantRow>;
  revoke(grantId:string,reason:string,db:Db):Promise<void>;
}
```

Copying a published starting point creates a new private Program and editable draft, copies reusable Activities/placements that the user may access, and records the source Program Version in `ProgramSource`. The source remains unchanged. A personal Program is added to the Calendar by publishing its customized snapshot as PRIVATE/OPEN and enrolling the owner in that version; these existing API calls are sequential, so the client must surface a partial failure and let the owner retry enrollment without publishing another version.

`ProgramAuthoringService`: stages/autosave, source references, copy, publish validation. `ProgramScheduleService`: automatic generation and manual adjustments. `ProgramBrowseService`: public search and preview. `ProgramAccessService`: access policy, approval requests, grant resolution. `ProgramEnrollmentService`: join, group selection, calendar materialization, leave, accept update. `BillingService`: payout onboarding, checkout, webhooks, grant changes. Keep money operations out of ProgramAuthoringService.

## 5. Access & publication matrix

| Program visibility | Access mode | Discover listing | Direct link preview | Full content / join |
|---|---|---|---|---|
| PRIVATE | OPEN | No | Owner only | Owner only until explicitly invited/authorized |
| UNLISTED | OPEN | No | Yes for link holder | Open after join; never expose private media |
| PUBLIC | OPEN | Yes | Yes | Join grants access |
| UNLISTED/PUBLIC | APPROVAL | Public only | Yes | Pending request; creator approval grants |
| UNLISTED/PUBLIC | PAID | Public only | Yes | Verified purchase or active subscription grants |

PRIVATE + PAID/APPROVAL is rejected at publish. Profile privacy, group membership and Program access never automatically grant access to private participant results. Direct preview metadata is limited and safe; uploads are never leaked via generic `/media` endpoints.

## 6. Program lifecycle and change handling

Draft created in a single action from Type (other wizard answers editable later) → autosaved indefinitely → preview even when incomplete → publish runs basic validation: meaningful title, at least one Activity placement, valid referenced revisions, noncontradictory schedule, media rights and chosen access → immutable Version 1 → further edit produces new draft Version N+1 → publish update → Program remains published with latest public version. Existing Enrollments keep their pinned Version. Publishing an update sets `pendingVersionId` and offers an `Update available` prompt; **nothing changes until the participant accepts**, and accepting keeps past results and personal overrides while replacing future unadjusted items. Archive removes discovery/new joins but retains historical records and valid access policy as required.

**Three distinct actions.**
- **Remove from My Programs** (participant): stops participating (leaves the run) and hides the Program from the person's library and Calendar. The source Program is untouched.
- **Archive** (owner): hides from discovery and blocks new joins; the owner keeps it in Creator Studio and can restore it by publishing.
- **Delete** (owner, `DELETE /programs/:id`, explicit destructive confirmation): permanent. In one transaction it deletes the owner's own runs of the Program with their Calendar Items, sessions, results, completion shares and result-media attachments (the media assets themselves stay in the owner's library). Calendar Items are deleted, never detached into standalone entries. Then:
  - **Nobody else involved** (no other person's enrollment, access grant, purchase, subscription, group membership, or a copy made from its versions): the Program, its versions, schedule, groups, prices, policy, approval requests, library states and media attachments are deleted.
  - **Others involved:** the Program is tombstoned (`deletedAt`, status `ARCHIVED`). It disappears from the owner's Creator Studio and My Programs and from discovery; nobody can join, buy or copy it; the owner loses owner controls; only people tied to it (enrollment or grant) can still open it. Other participants' enrollments, Calendar Items, sessions, results, media, groups, grants and money records are untouched. Earnings history stays with the creator.
  - **Subscriptions stop renewing.** Deleting sets every live monthly subscription to cancel at period end (an outbox event calls the provider, so it retries until it succeeds). Nothing is refunded or revoked early: payment history stays, and access already paid for continues through the current period and then lapses by the normal rule (§8). A subscription checkout that completes after the deletion is cancelled at period end the same way.

`Activity` public/private is independent from Program. To publish a Program containing a private **author-owned** Activity, publish an immutable ActivityRevision pinned by the Program Version; an entitled participant can read that revision through the Program, and gains no standalone access to the private Activity object. For a private **third-party** Activity, deny publish unless proper license/explicit grant. This must be validated before preview/publish.

## 7. Automatic scheduling

`ProgramScheduleService.generate` is deterministic and runs whenever activities, duration, or frequency change.

**Which days.** Frequency gives offsets within each 7-day block counted from Day 1: `DAILY` all days; `WEEKDAYS` and `N_PER_WEEK` n=5 `[0,1,2,3,4]`; n=1 `[0]`, n=2 `[0,3]`, n=3 `[0,2,4]`, n=4 `[0,1,3,4]`, n=6 `[0..5]`; `FLEXIBLE` behaves as n=3 and is labeled as a suggestion; `CUSTOM` uses author-chosen offsets. A Program with `WEEKDAYS` defaults its participant's start date to the next Monday.

**Which activities.** `generationMode` defaults to `ALL_EACH_DAY`: every selected Activity on every Program Day. `ROTATE` places one Activity per Program Day in round-robin order. The 3-activity, 3-days-a-week, 8-week example gives 24 Program Days and 72 placements under `ALL_EACH_DAY`, or 24 placements under `ROTATE`.

**Per-Activity frequency (decided 2026-11-10).** Frequency belongs to each Activity in a Program, not to the Program. An Activity's effective frequency in a Program is, in order: the Program's override for that Activity (stored on its schedule items, `ProgramScheduleItem.frequency`, and copied with the version); else the pinned revision's `frequencySnapshot` (08 §2); else the version's legacy `ProgramVersion.frequency`, which is kept only so existing Programs schedule exactly as before and is no longer edited in authoring or Admin forms. Generation applies each Activity's effective frequency to the "Which days" rules above. Program **duration** is unchanged: `durationDays` (days or weeks) or null for ongoing.

**Duration.** Finite Programs store every placement. Ongoing Programs (`durationDays` null) store one cycle with `cycleDays` default 7, repeated at enrollment.

**Manual adjustment.** Moving, adding, or duplicating a placement sets `isManual`. Regeneration replaces only non-manual placements, and warns before removing manual placements for an Activity no longer selected. Displayed counts are always computed from actual placements: `programDayCount` distinct days, `placementCount` total rows, activity count distinct Activity IDs.

**Runs (repeat participation).** A Program is a reusable template that a person can run any number of times. Each `Start Program` or `Run It Again` creates a new enrollment (a run) starting today on the latest joinable version; earlier runs, their Calendar Items and results are kept unchanged, never replaced or deleted. A Program's duration shapes a run's initial schedule; it does not decide whether the person "is running" the Program. Accidental duplicate submissions are prevented by the join request's idempotency key (one key per page visit); an intentional start on a later visit is a new run. Overlapping Activities across runs are left to the Calendar (`09-CALENDARS.md`). `Restart` in My Programs keeps its replace semantics (it ends the current run).

**Personal calendars.** See `09-CALENDARS.md` §4. Enrollment places these relative days on dates with no further decisions; a participant's manual changes affect only their Calendar Items.

## 7a. Workspace and editor UX

**Locked:** header (title, type/focus, duration, frequency, program-day count, Draft, Edit/Calendar), Activities summary + Add, clickable activity rows (title, instruction/media counts, metrics), bottom Preview & Publish. No redundant Program Details or Schedule section. Eight creation choices are hints; workspace is not a checklist. Relative Calendar editor opens already populated, and allows drag/drop and explicit Move fallback. Activity library selection from existing/seeded/public, customize a copy or Create; return selection to exact placement.

## 8. Seed data / publishing validation

Program starters should include realistic duration/frequency defaults and a small sample per broad category, but **Activities** are core seeds. Seed a few polished complete Programs to prove browsing (e.g. beginner core, daily meditation, Spanish basics, saving routine, staying in touch). All seeded texts/media must be reviewed and licensed for reuse. Schedule validation: ongoing nullable duration; placements within duration; frequency as recommendation, not guaranteed count if manually edited. Publish-time basic validation never judges quality; completion and retention (`ProgramStat`) improve catalog ranking afterward.

**Selling rules.** Every user may set prices. Publishing PAID requires an ACTIVE payout account, whose onboarding requires a verified email. Publishing OPEN or APPROVAL Programs does not require email verification. A Program may offer one-time, monthly, or both, in USD. A one-time purchase grants the Program under its purchased terms, including later versions, with no expiry. A monthly subscription grants access while paid; when it lapses, full content locks while Calendar Items, results, and media stay the user's. Changing a price does not change existing purchases or subscriptions. Enrollment never implies billing, and canceling billing never deletes an enrollment.

## 9. Tests

- Draft autosave/optimistic lock, revisit from any stage, add/copy/rename without losing placements.
- Program with Activity repeated three times has 1 unique Activity and 3 occurrences.
- Automatic generation is deterministic for every frequency; `ALL_EACH_DAY` vs `ROTATE` counts are correct; regeneration keeps manual placements.
- Three placements on one Program Day produce three Calendar Items with independent sessions and results.
- Update prompt: nothing changes until accepted; accepting keeps results and personal overrides.
- Public preview exposes no locked instructions/private media; full API and CDN checks match.
- Publish Program with author-private activity creates safe snapshot but does not publish original globally.
- Published Version immutable; new version does not mutate enrolled calendars or historical record.
- OPEN/APPROVAL/PAID gating; manual access grant expiry/revoke; idempotent join; payment cannot be asserted by client.
- Webhook replay and out-of-order delivery; purchase, renewal, lapse, refund, and dispute each produce the correct grant; lapsed subscriber keeps history.
- Join personal start date + timezone materializes correct dates; personal calendar move does not modify template.
- Archived program unavailable in discovery, previously completed logs remain accessible to owner.
- Delete with nobody else involved removes the Program and the owner's runs, items, sessions and results, leaves no standalone Calendar orphans, and keeps media assets. Delete with a live subscription sets it to cancel at period end and keeps its grant until then. Delete with another participant tombstones it: gone from the owner's Studio, library and Calendar and from discovery and joins, while the participant's run, history and Calendar are unchanged.
