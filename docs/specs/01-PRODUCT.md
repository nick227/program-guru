# PRODUCT — Goal platform / P1 proof of concept

**Status:** Authoritative P1 baseline · **Audience:** product, design, engineering · **Authority:** product objectives, priorities, scope, acceptance criteria, decision log. See `02-DOMAIN.md` for vocabulary and `03-UX.md` for interaction behavior.

## 1. Product thesis

A personal calendar is the everyday workspace for following meaningful programs. Users may create or adopt a program, perform and log its activities, document progress privately, and share selected evidence with collaborators or the public. Creators can build reusable programs from a strong starter activity catalog, add original instructional media, publish, acquire followers, and earn money through one-time Program purchases and monthly Program subscriptions.

**Not** a fitness-only app, generic social feed, standalone to-do list, or calendar-sharing product. Fitness is the first fully demonstrated vertical; finance, relationships, wellness, education, and user-defined topics must work in the **same** domain model from P1.

### Product hierarchy

1. **Calendar:** what I am doing this week and today, across programs, including standalone and recurring personal activities.
2. **Activity occurrence:** what I need to do, record, and optionally share today.
3. **Program:** why the scheduled activity is here, and what structured curriculum I am following.
4. **Creation:** an ongoing authoring workspace, not an obligatory once-only wizard.
5. **Community:** collaboration, instructional content, discovery, creator audience, and monetization underneath the daily practice.

### P1 priority

**Program authoring is the primary P1 success criterion:** prove that someone can create a legitimate, reusable Program from quality seeded content, publish it, and have others successfully follow it. The product hierarchy above describes what a daily user sees; this priority describes what P1 must prove.

### Product promises

- Starting a program or one-off activity is simple; one small decision at a time.
- Scheduling is automatic. Duration and frequency generate a schedule; people adjust only when they want to.
- A user's schedule, results, recordings, and notes belong to that user even when a creator changes a program.
- Personal records are private by default; sharing is a deliberate act with a visible audience.
- Programs and activities can be independently private, unlisted, or public (where applicable); their publication settings do not automatically override private logs.
- Seeded activity definitions, instructions, graphics, and media let an author make a legitimate program without filming or writing everything first.
- Community media helps teach an activity across many programs, without leaking private source content or conflating unrelated variations.

## 2. P1 user roles and jobs

| Role (behavior, not mandatory account type) | Primary job | First useful outcome |
|---|---|---|
| Participant | Follow activities, keep a personal record | Weekly calendar populated; complete an activity |
| Program author | Compose and publish a structured program | Publish a browsable, coherent program from seeded content |
| Activity contributor | Create or improve reusable instructions/media | Save an activity or submit an instructional contribution |
| Collaborator | Do a shared program while tracking individual results | See a friend's permitted completion and react |
| Creator building an audience | Publish and distribute valuable programs/media | Public profile, followers, engaged viewers, enrollments |
| Moderator/admin | Keep shared assets accurate, safe, and rights-cleared | Review reports, remove unsafe material, preserve records |

One user may perform all these jobs. There is no special `CREATOR` account role in P1.

## 3. Primary journeys and definition of done

### A. First daily visit

1. Open app directly to the **weekly Calendar** with today highlighted. A first-time user sees an empty week with a prominent `Browse Programs` action.
2. Tap an activity tile (thumbnail/icon, title, time/status, unread indication).
3. See its Activity occurrence page in the locked seven-row order (`03-UX.md` §6).
4. Change an applicable metric with a simple control; start/finish; optionally attach a private photo or video.
5. `Finish` returns to the same calendar week and date with completion visible. The entry survives navigation/reload.

**Done when:** an individual can complete this without discovering menus or opening a separate instruction document.

### B. Adopt a program

1. From calendar, choose **Add Program**, browse the seeded/public catalog first, or search it and the personal library.
2. Open program preview: creator, type/focus, duration/frequency, activity list, outline, pricing/access, media, participants (if shared).
3. Choose Join/Unlock. Check access policy before granting full content; collect approval or payment if required.
4. Select start date (default earliest sensible date, editable). The Program's schedule is placed automatically; preview the additions and confirm.
5. Calendar shows one independent occurrence per scheduled Activity. Participant may move/remove own items without changing the original template.

**Done when:** another user's published program populates an independent personal calendar without scheduling each Activity by hand, with no source mutation.

### C. Author a program over days or weeks

1. Create from **Add Program**; guide with selectable Type → Focus → unique activity count → choose/create activities → duration/frequency → review the automatically generated schedule and adjust it if wanted → details → publish.
2. Every step is optional in ordering after creation; save progress as a private draft automatically.
3. Return to **Program Workspace**: compact title/type/focus/duration/frequency/session-count header, Draft badge, `Edit`/`Calendar`; `Activities` heading/count/Add; click rows showing title, instruction count, media count, metrics; bottom `Preview & Publish`.
4. Seeded activity picker supplies reusable objects; author may customize a personal copy, author new activities, and add instructions/media.
5. Publish after basic validation, licensing, audience, and access checks. There is no creator application; quality is assessed after publishing from completion and retention signals.

**Done when:** creator assembles and publishes a complete program without mandatory manual descriptions or video recording.

### D. Participate with friends

1. Invite a person to the same Program Group by handle, email, or share link (not a shared calendar account).
2. Each member enrolls, gets a personal calendar, and controls their own completion and private media.
3. Within a shared occurrence, see participant avatars and permitted completion, react to completions, and view or comment on media members explicitly shared with the group.
4. Notifications open the correct activity and day. General chat and live video are **not** in P1.

**Done when:** two friends following a one-month daily challenge can see each other's permitted progress and exchange reactions without exposure of private measurements or journals.

### E. Build an audience

1. Publish an Activity and/or Program independently; choose discoverability and access.
2. Add or submit owned media at Activity or Instruction level, with explicit permission for public use and attribution.
3. Viewers can access relevant instructional videos from other programs via the canonical Activity relationship, engage with the **individual media item**, and follow its creator.
4. Creator sees usable engagement counts and program participation without access to private records.

## 4. P1 scope

| Capability | P1 requirement | Guardrail / deliberate deferral |
|---|---|---|
| Authentication & profile | Required unique handle, one combined public profile, optional private-follow approval, email/password and Google | No separate creator tier; no Apple login |
| Calendar | Weekly default view, multiple programs, standalone Activities, recurring personal entries, add/move/remove/complete, overlap display | No third-party calendar sync |
| Program authoring | Eight non-linear guided steps, workspace, draft autosave, automatic scheduling with manual adjustment, publish/version | No arbitrary scripting/workflow engine |
| Activity catalog | Curated seeds organized by Category and Focus, search/filter, customize a personal copy, private/public creation | No uncontrolled duplicate canonicalization |
| Instructions | Compact text and media; usually 1–3 per seeded activity; media/metrics/tools at both levels | No mandatory nesting beyond one instruction level |
| Media | Platform assets, My Library, camera capture and upload, thumbnails, audience, attribution | No trimming, capture presets, transcription, or community reuse library |
| Sessions/logging | Start, pause, resume, finish per Activity occurrence; effective duration and typed metrics | No universal assumption of reps/weight; a Program day is not a session |
| Collaboration | Groups, three invite paths, shared completion, completion reactions, group-shared media with comments | No general chat or live video |
| Social | Public content discovery, combined creator profiles, follows, likes and views on public media | No full algorithmic feed; no comments on public media |
| Marketplace | Open, approval, one-time purchase, monthly Program subscription; server-verified entitlements; creator payouts | Ships after the core experience; USD only. Creator-channel membership is the separate **P1+** epic in §10 |
| Achievements | Simple milestones derived from actual completions | No streaks, leaderboards, or public comparison |
| Analytics | Personal last/best/count, participant summary, privacy-safe site counts, Program completion and retention | No unverified claims/medical/financial advice |
| Notifications | In-app notifications on the user widget, deep links, optional daily email reminder | No web push in P1 |
| Trust | Reporting, moderation queue, audit trail, takedown | No pre-publication creator approval |

**Monetization contract:** every user may publish paid Programs without an application, after completing payment onboarding, email verification, and content compliance checks. Paid access is enabled in production only when checkout, refunds, entitlement verification, creator payout, compliance, and tax/ledger pathways all work end to end; until then it stays behind a server-side flag and is never presented as working. See `07-PROGRAMS.md` and `05-ARCHITECTURE.md`.

### Delivery order

1. **Seeded libraries:** Activities, Instructions, media, and starter Programs.
2. **Program authoring:** guided creation, editing, copying, automatic scheduling, publishing.
3. **Calendar participation:** weekly view, standalone and recurring entries, Activity execution, results, private history, reminders, achievements.
4. **Collaboration:** invites, shared progress, group media and comments, completion reactions.
5. **Creator marketplace:** discovery, profiles, ranking, moderation, then purchases, subscriptions, and entitlements.

## 5. Success measures

- **Activation:** user adds a first program or standalone activity to Calendar.
- **Task completion:** percentage of scheduled activities correctly logged; activity UI completion latency, not surveillance.
- **Author activation (primary):** draft reaches publish-ready state; Program published; others enroll and follow it; seeded-activity reuse rate.
- **Program quality:** completion and retention, used to improve catalog ranking.
- **Catalog quality:** seeded activities with complete usable instruction/media rights; copy-to-original attribution preserved.
- **Collaboration:** invited users who join, permitted activity interactions, return visits (without nudging unhealthy streak behavior).
- **Content quality:** useful public contributions, moderation resolution rate; popularity never sole ranking factor.
- **Commercial health:** access granted only on authoritative entitlement; refund, lapse, and revocation reflected reliably.

Do not optimize for inflated screen time, pressure to post, streak anxiety, or public disclosure of sensitive personal results.

## 6. Acceptance scenarios (cross-functional)

### Required end-to-end tests

1. A new user adopts a seeded Program and gets a populated weekly calendar without manually scheduling each Activity.
2. A creator builds a complete Program using seeded Activities, modifies personal copies, and publishes without modifying the originals.
3. Two friends join the same Program, complete activities independently, see permitted progress, and exchange reactions.
4. A user records results, saves private media, and returns to the calendar without unnecessary steps.
5. A creator sells a Program through a one-time purchase or monthly subscription, and server-verified entitlements correctly control access.

### Further scenarios

1. Two program creators reuse **Leg Raises**; one source program is private. Only public/licensed contributions appear on the shared Activity hub.
2. Program creator changes a published activity after a participant joined; participant's historical plan and results remain stable.
3. User moves Monday's session to Tuesday; neither the Program template nor collaborator calendar changes.
4. User records a private video in an occurrence and later explicitly shares it with the group; prior private state never exposes it.
5. A group-shared media item receives a comment; authorized members are notified; unrelated followers cannot open the media or its comments.
6. Two friends join a 30-day daily challenge with different personal start dates; group day alignment must be explicitly selected or shown as asynchronous, never silently assumed.
7. A locked program reveals only preview-safe metadata; API and media URLs do not bypass access checks.
8. A program with no collaborators shows no empty collaboration row. A single-instruction video appears directly rather than behind a mandatory instruction screen.
9. A deleted/archived creator resource does not corrupt participant history; moderated public assets disappear from discovery promptly.
10. Program with three Activities on one Program day creates three Calendar Items; each has its own sessions and results, and finishing one does not affect the others.
11. A user creates a standalone Activity repeating every Tuesday, moves one occurrence, cancels all future ones, and keeps past results.
12. A monthly subscription lapses: full content locks, the user's results and history remain; a one-time purchase stays accessible under its purchased terms.
13. Reversing a completion withdraws an achievement that depended on it.

## 7. Out of scope for P1

General group chat and direct messaging, video meetings/WebRTC, comments on public media, web push, Apple login, capture presets and video trimming, community media reuse library, multi-currency pricing, advanced recommendation feeds, invasive creator analytics, AI coaching, device health integrations, inter-program dependency engines, third-party calendar sync, streaks and leaderboards, and automated financial transactions.

**Promoted out of this list into P1+ (§10):** creator-channel membership, channel-subscriber-only content, unified creator content workspace (including Posts), and channel earnings/audience analytics. Those remain out of the original P1 milestone and must not block Program Authoring.

## 8. Document map

`02-DOMAIN.md` = taxonomy/relationships; `03-UX.md` = flows/layout; `04-UI.md` = primitives; `05-ARCHITECTURE.md` = implementation; `06-USERS.md`, `07-PROGRAMS.md`, `08-ACTIVITIES.md`, `09-CALENDARS.md`, `10-COLLABORATION.md`, `11-MEDIA.md`, `12-SOCIAL.md` = authoritative domain contracts; `13-PROFILES-AND-EXPERIENCE.md` = creator pages, loading states, visual direction. These thirteen documents are the only requirements; `packages/db/prisma/schema.prisma` and `packages/api-spec/openapi.yaml` implement them and must not contradict them.

**P1+ Creator Channel & Publishing** extends `02-DOMAIN.md` §10 and cross-references monetization (`07-PROGRAMS.md`, `05-ARCHITECTURE.md` §12, ADR 0001), profiles (`06-USERS.md`, `12-SOCIAL.md`, `13-PROFILES-AND-EXPERIENCE.md`), Programs (`07-PROGRAMS.md`), Activities/Instructions (`08-ACTIVITIES.md`), and media (`11-MEDIA.md`). Domain contracts 06–13 remain authoritative for their existing surfaces until amended for this epic.

## 9. Decision log

| # | Question | Decision |
|---|---|---|
| 1 | What users see on opening | Weekly calendar |
| 2 | Adding a first program | Browse seeded programs |
| 3 | After finishing an activity | Return to calendar |
| 4 | Customization | Simple by default, advanced on demand |
| 5 | Seeded activity organization | Category and Focus |
| 6 | Customizing an existing activity | Creates a personal copy |
| 7 | Instruction presentation | Compact text and media |
| 8 | Scheduling | Automatic distribution, with manual calendar adjustment |
| 9 | Activity page emphasis | Prominent collaborator row within the locked seven-row order; results stay above it |
| 10 | Initial recording | Camera and upload |
| 11 | Public media selection | Creator-selected media first; the rest ranked by popularity, relevance, quality review, and safety |
| 12 | Creator identity | Combined public profile |
| 13 | Joining together | Handle invite, email invite, and share link |
| 14 | What collaborators see | Permitted completion, group-shared media, and comments on that media |
| 15 | P1 communication | Completion reactions and group media comments; general chat and live video deferred |
| 16 | Notifications | In-app notifications and optional daily email reminders |
| 17 | Monetization (P1) | One-time purchases and monthly **Program** subscriptions, implemented after the core experience |
| 18 | Who can sell | Every user, after payment onboarding, verification, and compliance; no separate creator account role |
| 19 | Quality signal | Completion and retention |
| 20 | Top P1 priority | Program authoring |
| 21 | Program day vs session | A Program day is a schedule unit; every Activity occurrence has its own independent sessions and results |
| 22 | Personal scheduling | Standalone Activities and recurring personal entries are P1 |
| 23 | Achievements | Simple milestones derived from actual completions |
| 24 | Seed media | Rights-cleared illustrations throughout, selected demonstration videos |
| 25 | Creator channel (P1+) | One public channel/profile + one private management workspace per user who publishes |
| 26 | Channel vs Program billing | Monthly creator subscription unlocks subscriber-inclusive content; individually priced Programs remain; do not overload `ProgramAccessGrant` or `BillingSubscription.programId` |
| 27 | Audience relationships | Followers, Program participants, and paying channel subscribers are distinct |
| 28 | Content access axes | Ownership, publication status, audience access, and pricing are separate; never collapse into one visibility field |
| 29 | Subscribe ≠ enroll | Channel subscribe never auto-enrolls or populates Calendar; lapse preserves personal history |
| 30 | Unified creator workspace | One management surface for Programs, Activities, Instructions, Media, and Posts |

## 10. P1+ epic — Creator Channel & Publishing

**Status:** Authoritative product contract for the next milestone after original P1 · **Does not replace P1** · Program Authoring remains the primary P1 success criterion (§1). Implementation of this epic starts only after the original P1 gate; schema, API, billing, and UI changes are deferred until assigned.

### Intent

A creator manages an ongoing **channel**: a public profile/catalog and a private workspace for all owned content, audience, memberships, and earnings. P1 already supports Program-centric access (`OPEN` / `APPROVAL` / `PAID`) and per-Program purchases/subscriptions (`07-PROGRAMS.md`, ADR 0001). P1+ adds **channel membership** so creators can grow a catalog over time without selling every item separately, while retaining à-la-carte Program pricing.

### Locked product rules

1. Every user can become a creator; there is no separate creator account role (`06-USERS.md`).
2. A creator has **one** public channel/profile and **one** private management workspace (`13-PROFILES-AND-EXPERIENCE.md` extended, not duplicated).
3. A monthly **creator subscription** unlocks all content explicitly designated **subscriber-inclusive**.
4. Creators may still sell individual Programs through one-time purchases or Program-specific subscriptions (`07-PROGRAMS.md`).
5. **Followers**, **Program participants**, and **paying channel subscribers** are distinct relationships (`12-SOCIAL.md`, `07-PROGRAMS.md`, `02-DOMAIN.md` §10).
6. Publishable content may be **Public**, **Private**, **Program-restricted**, or **Channel-subscriber-only** (audience access; see axes below).
7. Subscribing never automatically enrolls someone in a Program or populates their calendar.
8. Cancellation or payment lapse removes protected access but preserves personal history (same locking pattern as Program subscriptions: instructional content withheld; sessions, results, and personal media remain — `09-CALENDARS.md`, `05-ARCHITECTURE.md` §12).
9. Creator media reuses `MediaAsset`, `MediaAttachment`, and `MediaPublication` (`11-MEDIA.md`); no parallel media stack.
10. Reuse Stripe Connect and existing billing infrastructure (`docs/adr/0001-billing-stripe-connect.md`). Do **not** overload `ProgramAccessGrant` or `BillingSubscription.programId` for channel membership — introduce channel-scoped instruments and entitlements (`02-DOMAIN.md` §10).

### Content the creator controls

The workspace covers **all owned content types** in one place:

| Type | Notes |
|---|---|
| **Programs** | Drafts, versions, publish/unpublish/archive; access policy and Program prices remain as in `07-PROGRAMS.md` |
| **Activities** | Create, customize copies, publish/archive; library organization |
| **Instructions** | Owned by Activity revisions (`08-ACTIVITIES.md`); editable/enriched in the authoring workflow without a separate admin system |
| **Media** | Library, attach, publish, contribute; rights and moderation via `11-MEDIA.md` |
| **Posts** | First-class channel content: text, images, videos, and links; may **reference** Programs, Activities, and other channel content without duplicating those records |

### Four independent axes (never collapse)

For every publishable item, keep these separate:

| Axis | Controls | Examples |
|---|---|---|
| **Ownership** | Who may edit / delete | Creator user id; copy-on-customize for Activities |
| **Publication status** | Lifecycle | `DRAFT`, `PUBLISHED`, `UNPUBLISHED`, `ARCHIVED` (+ immutable versions where the domain already requires them) |
| **Audience access** | Who may view protected substance | `PRIVATE`, `PUBLIC`, `PROGRAM_RESTRICTED`, `CHANNEL_SUBSCRIBER` |
| **Pricing / inclusion** | How money or membership applies | Free; Program one-time; Program monthly; **subscriber-inclusive** (covered by channel plan); individually excluded from the channel plan |

Discoverability (listed vs unlisted vs not indexed) remains the existing Program/Activity visibility concern where already defined; it is not a substitute for audience access or pricing.

### Unified creator workspace

One private management surface (not per-type admin apps) organized around:

1. **Content management and publishing** — create, edit, duplicate, organize, preview, publish, unpublish, archive, and delete where permitted; featured placement; channel organization; publishing history.
2. **Programs and instructional media** — Programs, Activities, Instructions, MediaAssets/attachments/publications, and Posts in one inventory with filters by type, status, audience, and monetization.
3. **Subscribers and audience** — followers, channel subscribers, Program participants, pending approvals; access revocation and moderation hooks (`12-SOCIAL.md`).
4. **Pricing and memberships** — channel plan price; per-Program prices; subscriber-inclusion toggles; payout account status (`CreatorPayoutAccount`).
5. **Analytics and earnings** — views/engagement where authorized, enrollments, completions/retention (`ProgramStat`), subscriber counts, and earnings aggregates. Minimal truthful metrics first; invasive analytics stay deferred.

### Entitlement precedence

When multiple grants could apply to the same Program or media, resolve access as the **most permissive valid grant** among:

1. Owner / authorized editor.
2. Active **channel** entitlement covering subscriber-inclusive content.
3. Active **Program** entitlement (`OPEN`, approved `APPROVAL`, `PURCHASE`, Program `SUBSCRIPTION`, or `ADMIN` — existing `ProgramAccessGrant` sources).
4. Explicit share / group publication rules for media (`11-MEDIA.md`, `10-COLLABORATION.md`).

Denial rules still win: blocks, moderation hides, revoked grants, and lapsed subscriptions remove protected access. Channel entitlement never bypasses Program-restricted items that are not subscriber-inclusive, nor individually sold Programs excluded from the channel plan.

### Mixed-access content

- A channel may mix public free Posts, subscriber-only media, free OPEN Programs, APPROVAL Programs, PAID Programs excluded from the plan, and PAID Programs also marked subscriber-inclusive.
- Subscriber-inclusive designation is **explicit** per item (or clear inherited default the creator can override); silence does not enroll content into the plan.
- Referencing a Program from a Post does not grant Program access; the viewer still needs the appropriate Program or channel entitlement to unlock Program substance.
- Instructional media attached to a locked Program remains withheld per existing locked-occurrence rules even if a related Post is public.

### Publishing and revisions

- Programs and Activities keep existing version/revision rules (`07-PROGRAMS.md`, `08-ACTIVITIES.md`).
- Posts use draft → publish → unpublish/archive with edit history sufficient for moderation; unpublishing removes distribution without deleting the creator's source media.
- Revising published instructional content follows Activity revision / Program version acceptance rules already specified; channel membership does not force participants onto new versions.
- Featured order and channel organization are creator-controlled presentation metadata, not ownership or entitlement.

### Creator Studio screen responsibilities

Entry: Own Profile → Manage → **Creator Studio** (`/studio`), also from the account menu. Calendar remains home; Studio is not a primary nav tab (`13-PROFILES-AND-EXPERIENCE.md`).

| Studio section | Responsibility | Reuses |
|---|---|---|
| **Library** | Unified inventory of owned Programs, Activities, Media; Posts when the Posts API exists | `07`, `08`, `11` list contracts |
| **Publishing** | Draft/publish/archive (and revoke media publication); deep-link to Program Workspace / Activity authoring for edits | `07`, `08`, `11` publish/archive |
| **Channel** | Branding: display name, bio, avatar, cover, profile visibility; featured/sections when Featured API exists | `06`, `13` |
| **Audience** | Distinct Follow / Program participant / channel subscriber; follow requests and Program access approvals now; rosters when list APIs exist | `12`, `07` |
| **Dashboard** | Earnings aggregates, Program enrollment/completion signals, payout status | `getCreatorEarnings`, Program preview stats, ADR 0001 |
| **Organization** | Featured order, collections/series when those contracts exist; until then public catalog = recent published Programs | `02` §10 |
| **Subscriber view** | Public channel already on `/:handle`; subscriber-only shelf after Channel Entitlement | `13`, `02` §10 |

### Capability slices (smallest useful vs deferred)

| Capability | Smallest useful P1+ | Deferred |
|---|---|---|
| Unified Content Library | One Studio inventory: Programs + Activities + Media (+ Posts when API exists) | Bulk ops, advanced search facets |
| Publishing lifecycle | `DRAFT` → `PUBLISHED` → `ARCHIVED`; media revoke as unpublish; return-to-draft/`scheduled` only after contracts | Promotions, A/B releases |
| Channel customization | Profile cover/avatar/bio + recent public Programs as catalog | Full layout builder, themes |
| Collections / series | `Collection` + ordered refs (new contract) | Nested series, collaborative editing |
| Subscriber channel feed | Channel entitlement + subscriber-inclusive items | Algorithmic ranking |
| Audience management | Distinct relationships; follow + access approval queues; rosters when list APIs exist | CRM, messaging |
| Scheduling / announcements | `publishAt` on Post/Program release (new contract) | Campaign calendar |
| Creator dashboard | Earnings summary + Program enrollment/completion + approval counts | Funnels, cohort retention UI |
| Reuse / version pinning | Existing ProgramVersion + ActivityRevision acceptance | Cross-creator remix marketplace |
| Audience + monetization controls | Program access/prices today; subscriber-inclusion flag with channel plan | Revenue splits, coupons, tiers |

### Delivery phases (implementation order when assigned)

| Phase | Scope |
|---|---|
| **A — Foundation** | Channel ownership model, followers vs subscribers, channel membership + entitlement, content eligibility axes, access inheritance. No new account role. |
| **B — Workspace** | Unified management UI for all content types, visibility/audience/pricing controls, publishing status, audience lists. |
| **C — Subscriber experience** | Follow, subscribe, browse eligible catalog, join Programs still requiring enrollment, retain history after cancel/lapse. |
| **D — Business tools** | Payouts reuse, earnings, subscriber analytics, monetization settings. |

Reuse Stripe Connect (destination charges, webhook-only fulfillment, `MARKETPLACE_ENABLED` discipline) rather than replacing it.

**API-backed Studio subset (shippable before channel contracts):** Library (Programs/Activities/Media), Program/Activity/Media publish-archive actions against existing ops, Channel branding via `updateMyProfile`, Audience follow-request and Program access-request queues, Dashboard via `getCreatorEarnings` / payout account / Program preview stats. Posts, collections, channel membership, featured persistence, content scheduling, and audience rosters remain blocked on backend contracts listed in `02-DOMAIN.md` §10.

### Acceptance tests (P1+; in addition to §6)

1. A user with no special role publishes a Post and a Program from the unified workspace; both appear on the same public channel/profile under their respective audience settings.
2. A monthly channel subscription grants access to items marked subscriber-inclusive and **does not** enroll the subscriber in any Program or add Calendar Items.
3. An individually priced Program excluded from the channel plan remains locked to a channel subscriber until purchased or Program-subscribed; a subscriber-inclusive Program unlocks without a separate Program payment.
4. Follow without subscribe shows only public channel content; subscribe without follow still receives subscriber-inclusive access.
5. Cancel or lapse of the channel subscription locks protected content; the user's prior enrollments' personal sessions, results, and private media remain.
6. Creating, editing, duplicating, publishing, unpublishing, and archiving work for Programs, Activities, Media publications, and Posts from the **same** workspace; Instructions are edited through Activity revision flows without a second admin system.
7. A Post may link a Program and an Activity by reference; deleting or archiving the Post does not delete those records; deleting referenced content breaks the reference safely without orphan entitlement grants.
8. Channel billing instruments are distinct from `BillingSubscription.programId` / `ProgramAccessGrant`; Program checkout and channel checkout can coexist for the same creator and buyer.
9. Rights, report, and moderation actions can revoke distribution or entitlement without destroying the owner's private library assets (`11-MEDIA.md`, `12-SOCIAL.md`).
10. Analytics show truthful subscriber count and earnings aggregates without exposing other users' private results.

#### API-backed Studio subset (runnable before channel contracts)

11. Owner opens Creator Studio Library and sees owned Programs, Activities, and Media from server lists; Posts show as unavailable until the Posts API exists.
12. Owner archives a published Program from Studio (or workspace) and it leaves public discovery while personal participant history remains.
13. Owner updates channel branding (display name, bio, avatar or cover) via profile update; the public profile reflects the change.
14. Owner approves or declines a pending follow request and a Program access request from Studio Audience.
15. Dashboard shows payout/earnings aggregates and Program enrollment or completion figures without fabricating subscriber-channel metrics.
