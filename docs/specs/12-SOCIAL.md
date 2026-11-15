# SOCIAL — Discovery, creator identity, engagement, notifications, trust

**Status:** Authoritative P1 contract · **Authority:** public discovery, creator profiles, following, publication engagement, notifications, reminders and moderation. Identity/follow-request persistence is `06-USERS.md`; media assets and publication rights belong to `11-MEDIA.md`; completion reactions belong to `10-COLLABORATION.md`.

## 1. Social is a supporting layer, not the app's front door

Daily user opens **Calendar**, not a feed. Social experiences develop from meaningful use of Programs and Activities: discover a creator, join an authored program, watch a helpful instructional video, follow creator, like it, share **selected** work, and optionally invite friends. No primary navigation bar or general social feed is required for P1; `Explore` and creator profiles open contextually from `+ Program`, Program Preview, Media Viewer and user widget.

## 2. Social content hierarchy

- **Creator profile:** one combined public UserProfile with handle/bio/avatar and permitted public Programs, Activities, media, shared achievements. No `Creator` role/model.
- **Program discovery:** published PUBLIC Programs, composable server-side filters by Category/Type/Focus, `level`, `duration` bucket, `maxSessionMinutes`, `tags`, `accessMode`, `timing` (`ALL`, `STARTING_SOON`, or deferred `HAPPENING_NOW` when live presence exists), and text query; seeded Programs featured first for new users; ranked by relevance plus completion and retention. Program results may surface up to one discoverable `PUBLIC` Group (`featuredGroup`) with member count, recent check-in activity, and optional scheduled start, never exposing private groups or member lists. `STARTING_SOON` requires an actual upcoming `startLocalDate` on an active `PUBLIC` group; `HAPPENING_NOW` requires real live presence infrastructure (deferred, never fabricated from active enrollments). UNLISTED only direct-link preview; PRIVATE not indexed.
- **Activity discovery:** approved public canonical Activities, Domain/Category, instruction counts/media, creator attribution; use as is or customize a copy.
- **Media discovery:** approved publications attached to canonical Activity or Instruction; views and likes accrue **per publication** not private files.
- **Follow:** accepted relationship to user; private profiles use approval. Never implies Program enrollment or unlock.
- **Group social:** completion reactions and comments on group-shared media, scoped to the group; never public.

**Sorting:** Programs rank by relevance to search/category + editorial/seed quality + completion and retention (`ProgramStat`) + recency; cap suspicious amplification. Media ranking is defined in `11-MEDIA.md` §5. Popularity alone must never determine safety, financial instruction quality, or wellness recommendations.

## 3. Entities

| Entity | Fields | Notes |
|---|---|---|
| `UserFollow`, `FollowRequest`, `UserBlock` | Defined in `06-USERS.md` | Don't duplicate tables here |
| `MediaPublication` | Defined in `11-MEDIA.md` | Content and rights owner |
| `MediaReaction` | publicationId, userId, type LIKE, createdAt | Unique `(publicationId,userId,type)` |
| `MediaComment` | id, publicationId, authorId, body, createdAt, editedAt?, deletedAt?, status VISIBLE/HIDDEN | **P1: GROUP-audience publications only**; flat, no replies; rate limit |
| `PublicationView` or aggregate events | publicationId, viewerHash/sessionId?, qualifiedAt | Deduped counted view; minimize identifying retention |
| `Notification` | id, recipientId, actorId?, type, title, deepLink, entityKind, entityId, groupOccurrenceKey?, dedupeKey?, createdAt, readAt? | In-app indicator and deep link; unique `dedupeKey` |
| `ReminderDispatch` | userId, localDate, channel IN_APP/EMAIL, sentAt | Composite PK; prevents double-sending |
| Notification preferences | Fields on `UserPreference` (`06-USERS.md`) | Reminders, groups, follows, muted groups |
| `ContentReport` | id, reporterId, targetType, targetId, reason, details?, status OPEN/RESOLVED/DISMISSED, createdAt, resolvedAt? | Moderate Program, Activity, MediaPublication, Comment, User |
| `ModerationAction` | id, moderatorId, targetType/id, action, reason, createdAt, expiresAt? | Audit, takedown, restriction |
| `DiscoveryIndex` (deferred) | Derived search projection | P1 queries Program and Activity directly with indexes and MySQL full-text |


Consolidated persistence: `packages/db/prisma/schema.prisma`. `entityKind`/`entityId` in Notification is a **deep-link projection** from outbox, not an ownership authorization source; destination rechecks auth. For ContentReport and ModerationAction, use target resolution and integrity checks.

`NotificationType`: `ACTIVITY_REMINDER`, `DAILY_SUMMARY`, `FOLLOW_REQUEST`, `FOLLOW_ACCEPTED`, `GROUP_INVITE`, `MEMBER_JOINED`, `COMPLETION_SHARED`, `COMPLETION_REACTION`, `GROUP_MEDIA_SHARED`, `GROUP_MEDIA_COMMENT`, `CONTRIBUTION_APPROVED`, `PROGRAM_ACCESS`, `PROGRAM_UPDATE`, `ACHIEVEMENT_EARNED`, `PAYMENT_ISSUE`.

## 4. Engagement semantics

- **Like:** explicit button on public media viewer (not on a user's private file); per user+publication idempotent toggle. Allow unlike.
- **View:** qualified visible playback/image view event, with dedup window and basic bot mitigation; display rounded aggregate. Mere grid impression does not count.
- **Comment:** on **group-shared media only** in P1; attached to publication ID and author, visible to active group members. May be removed by author, the media owner, or the group owner, and may be reported. Public media has no comments in P1.
- **Share/link:** only content explicitly public or appropriately unlisted with entitlement-safe preview link; never share private result URL.
- **Follow:** from creator/media/program profile link, with approval for private profile and optional block. Following does not automatically enroll or grant access.
- **Program popularity:** aggregate eligible public program enrollments, views, useful completions without publishing personal raw metrics; quality/freshness considered in ranking.

## 5. Discovery UX

**Entry points:** Calendar `+ Program` → `Browse`, Community (`/browse`), Home and its Home Agent, Program Detail creator/avatar, Activity Picker search, Media Viewer creator tap, user widget → Profile / published content. Home is not an algorithmic feed (§5a).

**Program browse:** the first thing a new user sees after `Browse Programs`. Seeded (platform) and creator Programs compete on the same quality and recency ordering (§5c); platform content is never placed first unconditionally. Focused search input, compact Domain/Type chips, optional Category filter and Free/Approval/Paid, image thumbnail + program title + creator + duration/frequency + access; tap opens safe preview. `Join` appears only when access permitted; otherwise `Request Access` or `Unlock` with clear terms.

**Activity browse:** selected program type/focus guides suggested seeded library first; searchable list with thumb/title/instruction count/metrics and `Use` or `Customize Copy`. Avoid displaying hundreds of social likes inside picker rows.

**Creator profile:** layout contract in `13-PROFILES-AND-EXPERIENCE.md` §3. One combined page: handle/avatar/bio, published Programs and Activities, eligible public Media, shared achievements, follower count, Follow/Requested button; private profile applies approval semantics. No private Calendar or raw result statistics on creator page.

**Activity media viewer:** compact thumbnails/swipes, program creator media first if eligible, attribution + like/views, next/previous. Optional `Contribute` when authorized. Creator attribution should link to public profile; program source visible only where safe.

## 5a. Catalog discovery surfaces (decided 2026-11-14, `01-PRODUCT.md` §11)

**One source.** Community, Home, the Home Agent and the Calendar rail all read `GET /discover` through the existing SDK hooks and render the one shared discovery card. None adds its own ranking or recommendation engine. One shared web helper decides the primary action for a card: `Join` only when access is permitted and the viewer is neither the creator nor already a member or enrolled; members see `Open`, creators see `Manage`/`Open`.

**Truthful data only.** Show only real participants, real check-ins, real live sessions and real Places. Never fabricate hosts, venues, availability, attendees or shared participation. A filter or section appears only when the current data can populate it.

**Community (primary investment).**
- Browse Programs, Activities and Creators by **Domain → Category**: Domain chips, then that Domain's Categories. URL-addressable, like existing filters.
- **City, never nearby.** Location discovery says "in Austin" / "City", never "nearby", "near you" or distances, until sourced coordinates and true proximity filtering exist.
- **Places:** a Places section and a **city** filter, shown only when at least one active Place has a public Activity. A Place opens a drawer (modeled on the Activity preview drawer) with its name, address, access note, source link and the public Activities that suggest it, labeled "Suggested place".
- **Shortcuts** ("how I want to spend my time"): one compact row of presets over existing filters only: Quick · 15 min (Activity duration), Daily habits (published default frequency `DAILY`), Social and Outdoors (Domains), In <city> (Place city, when Places exist), Starting soon (Program timing, only when such a Program exists). A shortcut switches to its kind, drops the other kind's filters, and toggles off by removing only its own values. "With others" waits for gatherings (10-COLLABORATION §9).
- **Popular and new mixed:** Home, the Community Activities section and the Calendar rail alternate the existing `POPULAR` and `NEW` orderings before picking across Domains, so new catalog content is visible without invented popularity.
- **Participation filters** use only existing data: Happening now (live sessions), Starting soon, and open public Groups. No online/in-person/solo classification (deferred).
- Large, useful images and minimal chrome; existing card, section and drawer components.
- **Activity cards open the dedicated Activity page** (decided 2026-11-15), like gathering rows. The quick-preview drawer opens only from the card's explicit Preview (eye) action, and from Places and creator drawers. Each Activity card, the drawer and the Activity page offer **Add to Schedule** (`03-UX.md` §2a); the Activity page also offers **Start now** (reusing today's planned personal item).

**Home** (revised 2026-11-15; the surfer was later retired, so Home shows no Activity section: `03-UX.md` §2a): formerly the **Activity surfer** (`03-UX.md` §2a): one media-led Activity at a time with Next/Previous, built only from existing reads (`listGatherings` NOW and UPCOMING, `getMyOpportunities`, and the `POPULAR`/`NEW` Activity orderings picked across Domains). Each Activity appears once. A gathering is a way to do that Activity with others, never a separate kind of card: the card names the Activity and shows the gathering's real members (avatars, at most 8 visible), member count, active count (members with a running or paused session, never presence), date, time and Place, exactly as `Gathering` already exposes them. An Activity with no visible gathering shows no avatars and no counts. No Activity-wide participation count exists yet.

**Home Agent.** (Intents revised 2026-11-15: Explore Activities, Explore Programs, Create a Program, Continue editing; `03-UX.md` §2a.) The intent menu's `Find something new` choice becomes **`Find something to do`**, shown whether or not `Continue where I left off` is available, and enters the existing `explore_interest` flow (Creators, Programs, Activities). The Domain choices in the existing `now_interest` step come from `listCategories`, without `custom`. The flow, its deterministic ordering and its eligibility rules stay as they are; no new nodes or engine.

**Calendar.** One compact rail of at most 6 Activities to schedule, shown in the Day view side panel when nothing is selected and beneath the empty-week message. It is never a persistent band under the grid (`03-UX.md` §2). Adding uses the existing add-calendar-item flow, including the Activity's suggested Place.



## 5b. Opportunity Radar (approved 2026-11-15)

Answers "what's something worthwhile I can actually do, with the right people, at the right time?" from real records, with a stated reason for every suggestion. No scoring model, no new engine.

**`GET /me/opportunities?limit`** (signed in; `limit` ≤ 20, default 10) returns two lists:

- **`recommendations`**: upcoming gatherings (10 §9) the viewer can join. Each has `reasons` (one or more, in tier order), `fitsSchedule`, and `calendarItemId` (the viewer's own item that joining would reuse, when one exists). Tiers, best first:
  1. **On your Calendar**: a planned item of the same Activity on the same day that is not in any group ("You have Walk Outdoors on Sat; 3 people are doing it at 9:00 AM").
  2. **In your Program**: the Activity is in one of the viewer's active enrollments ("Part of 30-Day Wellness").
  3. **People you've done things with**: its owner or a member shared an earlier gathering with the viewer ("Sam, from an earlier gathering, is going").
  4. **Your interests**: one of its Categories, inherited from its Activity or added by its organizer (10 §9.12), matches Activities the viewer has completed ("Related to your interest in Theatre: you've done 3 Theatre Activities"); otherwise its Domain does ("You've done 4 Arts & Creativity Activities"). Completed Activities only; scheduled ones are the Calendar signal.
  Within a tier, soonest first; deduplicated by gathering id; a gathering with no reason is never shown.
- **`needsPeople`**: gatherings the viewer has joined that have a capacity and open spots, with `openSpots`. A separate participation prompt whose only action is Share; never a recommendation to join.

**Eligibility.** Recommendations include only public, open gatherings, or private ones with a pending invitation addressed to the viewer (Do It Again); never past, full, closed, already joined, owned by a user who blocks or is blocked by the viewer, or on an unpublished or moderated Activity. A gathering whose time is within an hour of one of the viewer's timed Calendar items on the same day (other than the item it would reuse) is excluded as a conflict; date-only gatherings never conflict. Co-participant signals use only gatherings both people were members of, minus blocks.

**Bounds.** At most 200 candidate gatherings in the next 84 days; viewer signals from at most 84 days of Calendar items, active enrollments and 500 completed items; full gathering summaries only for returned items.

**Surfaces.** One primary action each: a recommendation's is **Join** (reusing `calendarItemId` when present, then opening the viewer's occurrence); a needs-people item's is **Share**.
- **Home Agent:** "Do something together" leads with the top recommendation and its reasons; "See another" moves through the list; with none, the existing Program-session results follow unchanged. No new Agent action.
- **Home:** the Agent's "Do something together" (above) is Home's only Radar surface since the surfer was retired (2026-11-15); there is no Home rail or needs-people prompt.

## 5c. Program discovery quality (approved 2026-11-15)

Within the existing UI (no layout changes), `GET /discover?kind=PROGRAM` gains:

- **`creatorScope=FOLLOWING`** (Programs and Creators): only creators the viewer follows, minus blocks. Home's "Following" mode uses it, so Following means actual follows.
- **`sort=FOR_YOU`** (signed in; otherwise treated as `RELEVANT`): every item carries one truthful `reason` (`kind`, `label`). Owned Programs and any the viewer has ever enrolled in are excluded (they stay in normal browsing). Existing eligibility (published, public, not moderated, not deleted) and block filtering apply. Tiers, best first:
  1. **Following**: by a creator the viewer follows ("From Maya, who you follow"; "New from Maya, who you follow" when published in the last 60 days).
  2. **Your interests**: the Program's Category, else Domain, matches Activities the viewer has completed ("Matches your Photography Activities"); or the Domain the viewer picked in the Agent or in Community filters ("In Arts & Creativity, which you picked").
  3. **Explore**: everything else eligible, interleaved across Domains, established and new alike ("Explore Fitness", or "New in Fitness" only when published in the last 60 days). This is what a cold-start user sees, varied rather than only recent.
  Within each tier the base order is rank score, then newest; **emerging creators** (no Program with a rank score yet, or a first Program published in the last 60 days) are interleaved so that at most two established Programs precede an eligible emerging one. An emerging Program appears only through a tier it truly qualifies for, never as filler. Platform Programs are never emerging.
  Participation by people the viewer follows is **not** a reason: a follow alone never reveals someone's enrollment (10 §4); group co-participation only exists for Programs the viewer is in, which For You excludes.
  Bounded: at most 300 candidates, 500 follows and 500 completed items read per request.
- **`RELEVANT`** (default): rank score, then newest; the unconditional platform-first term is removed.

**Home's first suggestion and Community Following (approved 2026-11-15).** When nothing on the viewer's Calendar leads, Home's first signed-in Program suggestion walks the `FOR_YOU` order with its reason, and "Another idea" continues down it, so a new account sees varied established and new Programs across Domains rather than whatever was published last. The newest Program (labelled "New") appears only when `FOR_YOU` returns nothing eligible. Home claims progress ("You've been working on…") only after a completion or recorded participation; before that it names the Program's first scheduled Activity. Community's existing Creator filter gains **Following** (signed in, Programs) through `creatorScope=FOLLOWING`; the owner's "N following" profile count links to it. Home gains no Following control. Profiles stay private by default; nothing changes privacy automatically.

**Public outcomes (rule; nothing published yet).** A completion percentage such as "68% finished week 1" may be shown only when enough eligible participants have actually reached the end of that period (the denominator is participants whose week 1 has ended, not sign-ups). Below that threshold, show counts ("8 people finished week 1") only when they meet the privacy minimum (§10); otherwise nothing. Recommendation reasons never cite outcomes.

## 6. Notifications and reminders

Notification **indicator overlays user widget** in Calendar header with an unread count badge, 30-second background polling, window-focus refresh, and immediate invalidation after mutations. The header Bell dropdown stays compact: latest 6 grouped entries with `All`, `Direct`, and `Groups` quick filters, inline Accept/Decline for follow requests and group invitations (when pending and authorized), and links to `/notifications` and `/settings`. `/notifications` is the full Notification Center with server-side filters, cursor pagination, real avatar stacks, and expandable grouped entries.

**Grouping:** Related reactions (`COMPLETION_REACTION`), comments (`COMPLETION_COMMENT`, `GROUP_MEDIA_COMMENT`), and group participation events (`COMPLETION_SHARED`, `GROUP_MEDIA_SHARED`, `MEMBER_JOINED`) are grouped server-side before pagination by recipient, event family, target entity, and a bounded time window (6 hours). Each grouped entry preserves all underlying notification `ids`, accurate `unreadCount`, distinct `actors` (for avatar stacks), and underlying `items` for expansion. Marking a grouped entry read marks all of its underlying `ids` read.

**In-app reminders (default on):** a timed Calendar Item creates one `ACTIVITY_REMINDER` when due. On days with planned items, a `DAILY_SUMMARY` appears at the user's reminder time. Own actions never notify self, and muted groups / blocked users are suppressed. Keep payloads minimal: no exact private scores, savings balances, health metrics, personal notes or raw video preview in email or notification payloads.

**Daily email (optional, default off):** opt in from Settings or the one-time prompt on first Program adoption. Sent once at the user's chosen local time (default 08:00) in their timezone, only on days with planned items, listing that day's Activities with a link to the Calendar. Every email has a one-click unsubscribe. No other reminder email and no web push in P1. Transactional email (verification, reset, invites) is separate from this preference.

Examples (copy): `3 activities today`, `Alex completed today's activity`, `Comment on your video`, `New follow request`, `Your video was approved`, `Access granted`. Do **not** include exact private scores, savings balances, health metrics, personal notes or raw video preview in email or notification payloads.

## 7. Authorization & moderation

- For each program/activity/media discovery query: `PUBLISHED + PUBLIC + not blocked/moderated + rights valid`; UNLISTED requires direct exact link, not search.
- Likes require logged-in active user, visibility rights, block checks, rate limit. Comments additionally require active group membership. Both have report capability.
- Private creator followers may view only allowed public/follower-scope profile content, not automatically private Programs or media.
- Activity Hub includes media only from approved public publications with explicit canonical mapping; reject leaked paid/private Program footage.
- User may report content (copyright, unsafe guidance, harassment, privacy). Moderator may hide publication or comment, unlist a Program, remove account ability to publish, revoke entitlement if legally appropriate, and keep audit trail. Publishing is not pre-approved; reporting and moderation are the safeguard.
- Domain-sensitive safety: fitness/wellness instructions should avoid medical claims; finance examples should not expose individual finances or promise returns; relationships content must respect privacy and consent. Do not use public comparison/leaderboards as default.

## 7a. Platform administration

One admin surface (`/admin`) for platform content, accounts and access. It is reachable only by `ADMIN`; `MODERATOR` keeps the report and publication queues and manual grants above. Every admin operation is authorized server-side (`adminOnlyAuth`), goes through the same domain services and validation as ordinary authoring, and never through a generic CRUD endpoint.

- **Platform content** (`creatorId = null`: the seeded library and anything admins create or import) is authored by any active `ADMIN` through the ordinary Program and Activity operations, with the same drafts, revisions, publish checks and tombstone deletion. Version and revision rows record the admin who made each change. Platform Programs cannot use PAID access.
- **User-owned content** is moderation-only for admins: hide, restore, unlist. Admins never edit it, so creator attribution and version history stay the creator's.
- **Unpublish** is archive. An archived Program is restored by publishing it again (`07-PROGRAMS.md` §6).
- **Import** creates platform Programs with nested Activities from structured JSON. It is validated as a whole before anything is written (`dryRun` returns every issue), written in one transaction as drafts, and replay-safe through an idempotency key. Publishing stays an explicit, reviewed step.
- **Accounts:** admins search users, change role (`USER`/`MODERATOR`/`ADMIN`) and suspend or reactivate. The last active `ADMIN` can never be demoted, suspended or deactivated, whichever path is used.
- **Moderation:** the report queue (resolve with hide, unlist, restrict publishing or suspend; or dismiss; on a closed account report, unrestrict: `RESTORE` ends any active publishing restriction and lifts a suspension, with a reason, audited) and pending public media contributions (approve or reject), over the moderation operations above. Signed-in users report Programs, Activities, media and accounts from those pages.
- **Shared platform media:** files on platform content stay owned by the admin who uploaded them, but deleting one from a personal library is refused (409) while a platform Program or Activity still uses it.
- **Membership:** read-only views of existing Program prices, purchases, subscriptions and access grants, plus the existing manual grant and revoke. There are no platform plans or limits, and refunds stay in the provider dashboard (ADR 0001).
- **Audit:** role changes, suspensions, moderation, and publish, archive and delete of platform content each write a `ModerationAction`. A null `moderatorId` means a server-side command.
- **Initial admins** are promoted from existing accounts by an explicit, idempotent server command (`admin grant <email>`; `pnpm --filter server admin` locally, `admin:prod` in the API service). No environment variable, production seed or client path can grant `ADMIN`. The local development seed alone creates a known admin (`admin-dev@test.local`, see README) and refuses any non-localhost database.

Endpoints: `GET /admin/content`, `POST /admin/content/import`, `POST /admin/content/{kind}/{id}/moderation`, `GET /admin/users`, `GET|PATCH /admin/users/{userId}`, `GET /admin/membership/{prices|purchases|subscriptions|grants}`, `GET /admin/audit`.

## 8. DTOs

```ts
interface DiscoverQueryDto { kind:'PROGRAM'|'ACTIVITY'|'CREATOR'; q?:string; categoryId?:string;
  programTypeId?:string; focusId?:string; accessMode?:'OPEN'|'APPROVAL'|'PAID'; cursor?:string; limit?:number;
  sort?:'RELEVANT'|'NEW'|'POPULAR'; }
interface DiscoverResultDto { items:(ProgramSummaryDto|ActivitySummaryDto|UserSummaryDto)[];
  nextCursor:string|null; }
interface PublicMediaDto { publicationId:string; media:MediaThumbDto; creator:UserSummaryDto;
  activityId?:string; views:number; likes:number; likedByMe:boolean; }
interface MediaCommentDto { id:string; author:UserSummaryDto; body:string;
  createdAt:string; editedAt:string|null; }
interface AddCommentDto { body:string; idempotencyKey:string; }
interface NotificationEntryDto { id:string; type:string; title:string; actor:UserSummaryDto|null;
  createdAt:string; readAt:string|null; deepLink:string; }
interface NotificationDto extends NotificationEntryDto {
  entityKind?:string; entityId?:string; groupOccurrenceKey?:string|null;
  groupKey?:string; ids?:string[]; count?:number; unreadCount?:number;
  actors?:UserSummaryDto[]; actorCount?:number; items?:NotificationEntryDto[]; }
interface ReportContentDto { target:{type:'PROGRAM'|'ACTIVITY'|'MEDIA'|'COMMENT'|'USER';id:string};
  reason:'HARASSMENT'|'PRIVACY'|'COPYRIGHT'|'MISLEADING'|'UNSAFE'|'OTHER'; details?:string; }
```

`PublicMediaDto` and Program/Activity summaries must be server redacted for audience; do not send private fields and hope UI hides them.

## 9. DAO/service endpoints

```ts
interface SocialDao {
  searchPublic(q:DiscoveryQuery,viewerId:string|null,db:Db):Promise<PageOf<DiscoveryRow>>;
  toggleLike(publicationId:string,userId:string,db:Db):Promise<{liked:boolean;likes:number}>;
  addComment(publicationId:string,userId:string,body:string,db:Db):Promise<CommentRow>;
  listComments(publicationId:string,page:Page,db:Db):Promise<PageOf<CommentRow>>;
  listNotifications(recipientId:string,page:Page,db:Db):Promise<PageOf<NotificationRow>>;
  markRead(recipientId:string,ids:string[],db:Db):Promise<void>;
  report(input:ReportWrite,db:Db):Promise<ReportRow>;
}
```

`DiscoveryService` runs search with read-time permissions; `EngagementService` writes like/comment/view; `ProgramStatService` computes completion and retention; `NotificationService` consumes outbox, recipient policy, badge/read state; `ReminderService` runs the scheduled scan; `ModerationService` validates reports/action/audit; `FollowService` belongs to Users but emits social events.

Endpoints: `GET /discover` (Activity results also filter by `placeId`, `locality`, `hasPlace`, planned-minutes `duration` and default `frequency`; search also matches the Place name and city), `GET /catalog/places?locality&q` and `GET /catalog/places/:slugOrId` (public; active Places only), `GET /users/:handle/programs`, `GET /users/:handle/activities`, `GET /users/:handle/publications`, `GET /users/:handle/achievements`, `POST|DELETE /media-publications/:id/likes`, `GET|POST /media-publications/:id/comments`, `DELETE /media-comments/:id`, `POST /media-publications/:id/views` (qualified), `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/read`, `POST /email/unsubscribe`, `POST /reports`, `GET /moderation/reports`, `POST /moderation/reports/:id/resolve`.

## 10. Analytics and privacy

Public counts are coarse aggregated and non-identifying; suppress or round small group statistics where individual inference possible. Personal results stay owner-only unless explicitly shared; never make “community average body measurements / savings amount” a default graph. Creator analytics may include their own content views, adoption, likes and comments, but **not** a list of participants' private completion values. Use per-publication public engagement aggregates and per-program enrollment, completion, and retention aggregates. Completion and retention are computed only as aggregates and suppressed below a minimum sample size.

## 10a. Activity participation (approved 2026-11-15)

**Participant.** A distinct ACTIVE user with at least one Calendar Item of that exact Activity whose status is `PLANNED`, `DONE` or `SKIPPED` (on their Calendar now or in the past; not `CANCELLED`, not `NOT_PARTICIPATING`). People are counted, not occurrences or completions: a recurring entry, a Program run and a gathering of the same Activity count that person once. A customized copy is its own Activity. Deactivated and suspended users are not counted.

**Disclosure of the count** (minimum sample 5, §10): `0` is shown exactly (it identifies no one); `1–4` is shown as **Fewer than 5**, never as a number and never as 0; `5` and above exactly. The same band applies to everyone, signed in or out; a participating viewer additionally sees "including you".

**Avatars are separate from the count**: the viewer (when a participant) and members of gatherings of that Activity the viewer may see (10 §4, §9; public open gatherings, or ones the viewer belongs to), minus blocks, at most 8. Solo participation is never shown as an avatar, and a follow never reveals it (§5c).

**Shared activity** comes only from those gatherings: members with a running or paused session (`doing it now`, never presence) versus members of upcoming gatherings (`going`), with the next one's date, time and Place.

**`GET /activities/participation?ids=`** (optional sign-in, at most 50 ids) returns, for each Activity the viewer may see (others are omitted, never confirmed): `participants {band, count}`, `avatars`, `shared {activeNow, going, nextGathering}`, and for a signed-in viewer `viewer {everAdded, lastAddedAt, completedCount, lastCompletedDate, inProgressItemId, upcoming[≤3] with their recurrence}`. One request serves every Activity rendered together.

## 11. Tests

- PUBLIC vs UNLISTED vs PRIVATE discovery; direct link still enforces locked preview/media permissions.
- Like uniqueness/idempotency, rapid toggles, same media in multiple programs accrues on publication identity.
- Private media cannot be liked/commented/viewed via publication endpoints without a valid publication.
- Owner/blocked/suspended cases; comment report, hide, restoration; publication take-down invalidates search.
- Notifications badge, mark read, deep-link to correct authorized occurrence, zero sensitive payload.
- Daily email: off by default; correct local time across timezones and DST; no send on empty days; no double send on worker restart; unsubscribe works.
- Comments rejected on PUBLIC publications and for non-members.
- Program ranking uses completion and retention; small samples are suppressed.
- Creator follower cannot read private logs or locked program just because of Follow relationship.
- Public Activity carousel excludes other programs' private or paywalled videos unless separately licensed/published.
- Discovery (§5a): `/discover?kind=ACTIVITY&locality=Austin` returns only Activities whose Place is in Austin; `placeId` likewise; inactive Places never appear; the city filter and Places section are absent with zero Places.
- No discovery card offers `Join` to the creator or an existing member/enrollee (shared helper unit test, used by Community, Home, Agent and Calendar rail).
- Home range section: at most 6 cards, at least 3 Domains when 3 exist; the Agent's `Find something to do` reaches `explore_interest` with data-driven Domains.
