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

**Program browse:** the first thing a new user sees after `Browse Programs`, leading with seeded Programs. Focused search input, compact Domain/Type chips, optional Category filter and Free/Approval/Paid, image thumbnail + program title + creator + duration/frequency + access; tap opens safe preview. `Join` appears only when access permitted; otherwise `Request Access` or `Unlock` with clear terms.

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
- **Participation filters** use only existing data: Happening now (live sessions), Starting soon, and open public Groups. No online/in-person/solo classification (deferred).
- Large, useful images and minimal chrome; existing card, section and drawer components.

**Home.** One compact, media-led section showing the range of Activities: at most 6 Activity cards from at least 3 different Domains (when 3 exist), chosen by taking the most popular Activity per Domain in turn. Each card opens the existing Activity preview. No other Home changes.

**Home Agent.** The intent menu's `Find something new` choice becomes **`Find something to do`**, shown whether or not `Continue where I left off` is available, and enters the existing `explore_interest` flow, whose Domain choices come from data. The flow, its deterministic ordering and its eligibility rules stay as they are; no new nodes or engine.

**Calendar.** One compact rail of at most 6 Activities to schedule, shown in the Day view side panel when nothing is selected and beneath the empty-week message. It is never a persistent band under the grid (`03-UX.md` §2). Adding uses the existing add-calendar-item flow, including the Activity's suggested Place.



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

Endpoints: `GET /discover` (Activity results also filter by `placeId` and `locality`), `GET /catalog/places?locality&q` and `GET /catalog/places/:slugOrId` (public; active Places only), `GET /users/:handle/programs`, `GET /users/:handle/activities`, `GET /users/:handle/publications`, `GET /users/:handle/achievements`, `POST|DELETE /media-publications/:id/likes`, `GET|POST /media-publications/:id/comments`, `DELETE /media-comments/:id`, `POST /media-publications/:id/views` (qualified), `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/read`, `POST /email/unsubscribe`, `POST /reports`, `GET /moderation/reports`, `POST /moderation/reports/:id/resolve`.

## 10. Analytics and privacy

Public counts are coarse aggregated and non-identifying; suppress or round small group statistics where individual inference possible. Personal results stay owner-only unless explicitly shared; never make “community average body measurements / savings amount” a default graph. Creator analytics may include their own content views, adoption, likes and comments, but **not** a list of participants' private completion values. Use per-publication public engagement aggregates and per-program enrollment, completion, and retention aggregates. Completion and retention are computed only as aggregates and suppressed below a minimum sample size.

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
