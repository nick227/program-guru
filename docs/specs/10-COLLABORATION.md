# COLLABORATION — Program groups, invites, shared completion, reactions, group media

**Status:** Authoritative P1 contract · **Authority:** cross-user participation. Individual Calendar Items, Sessions and private results are in `09-CALENDARS.md`; media assets and publications in `11-MEDIA.md`; public engagement and follow graph in `12-SOCIAL.md`.

## 1. Collaboration premise

Two friends can adopt a **shared Program**, see each other's consented activity completion, react to it, and optionally share recordings and comment on them. They **never** share a single editable personal Calendar or inherit unrestricted access to each other's private Activity Logs. A collaborative Program is represented by `ProgramGroup` and members, with each member having an individual `ProgramEnrollment` and calendar.

Example: “30 Days — 10 Push-ups + 10 Sit-ups.” Group owner creates a group on a Program Version and invites a friend; both adopt the schedule; on day 7 each sees the other's permitted completion of each Activity and can react; both retain private metrics and media unless specifically shared.

**P1 communication is completion reactions and comments on group-shared media.** General group chat, direct messages, and live video are deferred. `groupOccurrenceKey` stays stable so a future conversation or call resource can attach to it without migrating data.

## 2. Group scope

| Entity | Key fields | Ownership / rule |
|---|---|---|
| `ProgramGroup` | id, programVersionId, ownerId, name?, mode SYNC/ASYNC, visibility PRIVATE/PUBLIC, joinPolicy INVITE_ONLY/OPEN, startLocalDate?, timezone?, joinLinkEnabled, status ACTIVE/CLOSED, createdAt | Group belongs to one Program; `programVersionId` is the version it was created on. Members may follow different versions of that Program; their membership never depends on it. Defaults to `PRIVATE` + `INVITE_ONLY`; `PUBLIC` groups require a `PUBLIC`, `PUBLISHED` Program. Not a separate Program |
| `GroupMember` | groupId, userId, role OWNER/MEMBER, status ACTIVE/LEFT/REMOVED (pending invites live in `GroupInvitation`), joinedAt?, sharedCompletionEnabled | Exactly one row per pair; participation/access checked |
| `GroupInvitation` | id, groupId, kind USER/EMAIL/LINK, invitedUserId?, invitedEmailHash?, tokenHash, expiresAt, status PENDING/ACCEPTED/DECLINED/REVOKED/EXPIRED, createdAt | USER and EMAIL are single-use; LINK is reusable until revoked or expired; at most one pending USER/EMAIL invitation per invitee and group; no email disclosure in public API |
| `CompletionShare` | id, groupId, occurrenceKey, calendarItemId, userId, activityId, programDayIndex, completedAt, revokedAt? | Minimal completion event, never metric detail; unique per calendarItemId |
| `CompletionReaction` | completionShareId, userId, emoji, createdAt | Unique per share, user, emoji; emoji from a small fixed set |

Group-shared media is a `MediaPublication` with `audience GROUP` plus `groupId` and `occurrenceKey` (`11-MEDIA.md`). Its comments are `MediaComment` rows (`12-SOCIAL.md`).

Occurrence key is stable across members and versions, not a user's Calendar Item ID: `programId:activityId:programDayIndex:ordinal` (absolute Program Day; `ordinal` ranks repeated placements of the same Activity on that day by position). Version and schedule-item ids are regenerated per version, so they are not part of it. Members whose version does not schedule an occurrence are left out of its Collaborators row and counts, never shown as missing it. For `SYNC`, members share a group start date. For `ASYNC`, each member has a personal start date, the same key still maps equivalent occurrences, and the UI shows `Program Day 7` rather than implying a shared calendar date. Consolidated persistence: `packages/db/prisma/schema.prisma`.

## 3. Collaboration lifecycle

**Group:** created by an enrolled participant or the Program owner → invite → accept → active membership. Group may be CLOSED; membership LEFT or REMOVED ends access to group content (the author's own past comments follow retention policy). If Program is archived, an existing group stays readable while access is valid; new joins are blocked.

**Joining, four ways:** invite an existing user by handle; invite by email address; share a join link; or direct-join a `PUBLIC` group with `joinPolicy = OPEN`. All four end at the same schedule-confirmation and membership-linking flow. Private (`PRIVATE`) groups are never listed publicly or discoverable without authorization. Public (`PUBLIC`) groups may be discovered in Community and on their Program page (name, mode, member count, optional scheduled start), without exposing member lists or private data to non-members; `OPEN` public groups still enforce Program access (APPROVAL/PAID) and block checks, and removed members require an owner invitation rather than direct join.

**Invitation:** PENDING → ACCEPTED, DECLINED (by the invitee, USER/EMAIL only), REVOKED (by its creator or the group owner) or EXPIRED (14 days; swept by the worker and never accepted after expiry). `Accept` requires signed-in matching intended user, or a valid link token. A USER invitee finds the invitation in the app (their received invitations) without needing the token. If the Program is locked, access (approval or payment) is obtained before active membership; an invitation never bypasses entitlement. Expired tokens cannot be replayed. Acceptance states plainly that completion will be visible to members and can be turned off. New joins are blocked when the group is closed or the Program is archived, moderated, or no longer published.

**Join state.** Before accepting, the service tells the participant exactly what is needed (`join.status`):

| Status | Meaning | Accept |
|---|---|---|
| `SIGN_IN_REQUIRED` | Viewer is anonymous | Not possible |
| `UNAVAILABLE` | Group closed, Program archived/moderated/unpublished | Refused (`404`) |
| `ACCESS_REQUIRED` / `PAYMENT_REQUIRED` | Locked Program without entitlement | Refused until access is granted |
| `ALREADY_MEMBER` | Already an active member | Returns the group; nothing changes |
| `READY_TO_JOIN` | Already following any version of this Program, not in another group for it | Joins and links the existing enrollment; the calendar is not changed. If a SYNC group's start date differs, `startDateDiffers` is true and the UI labels Program Days |
| `CONFIRM_ENROLLMENT` | SYNC group, not yet following | The participant confirms the group's start date and timezone; accept carries the enrollment on the version currently published |
| `SELECT_SCHEDULE` | ASYNC group, not yet following | The participant chooses a start date and timezone; accept carries the enrollment on the version currently published |
| `ENROLLED_OTHER_VERSION` | No longer produced: a participant on any version of the group's Program is `READY_TO_JOIN`. Kept in the enum for compatibility | — |
| `LEAVE_OTHER_GROUP` | Following this version with another active group | Refused (`409`); leave the other group first |

When enrollment is needed, membership, entitlement, enrollment and calendar items are created in **one transaction** after the participant confirmed the schedule: a validation or scheduling failure leaves no membership, enrollment, or calendar items behind. Calendar items are never created without that confirmation.

**Late joiners.** A same-start-date (SYNC) group keeps the Program's original schedule for everyone: a participant who joins after the start date gets the same calendar dates and Program Days as the group. Activities dated before they joined are `NOT_PARTICIPATING` (`09-CALENDARS.md` §4.11): shown as Not Participating, never Missed, and excluded from their completion and adherence. In other members' Collaborators row such an occurrence reads `NOT_PARTICIPATING` and is left out of `finished of total`.

**Restarting a Program** (a new run from My Programs) keeps the person's group: the new enrollment links to their existing active membership, whose sharing preference is unchanged, and no second membership is created. The group's start date and other members' calendars are never changed; a SYNC member who restarts reads `startDateDiffers` like a late joiner and is compared by Program Day. The ended run keeps its results, media and completion history in the group feed, but only a member's current run counts in an occurrence's Collaborators row, `finished of total` and the calendar's shared-completion count. Leaving the group remains a separate action.

**Leaving and removal** take effect on the next request: group views, completions, reactions, shared media, comments and signed URLs stop. The member's enrollment is unlinked (its group occurrence keys cleared) and their completion shares to the group are revoked; their calendar, sessions, results and media are untouched. Media they shared to the group stays visible to remaining members unless they withdraw it (`DELETE /media-publications/:id`, allowed after leaving), delete the asset, or it is moderated. Pending invitations the departing member created are revoked. Removal also revokes pending invitations addressed to the removed user; a removed member cannot rejoin through a join link, and only the group owner can invite them again.

**Completion:** participant finishes one Activity occurrence → personal result saved → service checks `sharedCompletionEnabled` and active membership → creates a minimal `CompletionShare` for that occurrence (activity, program day, status only) → members can react. Each Activity occurrence shares separately; there is no whole-day share. Turning sharing off or undoing the completion sets `revokedAt`, which hides it; this never changes the member's personal log.

**Group media:** a member explicitly shares one of their READY assets to the group from the viewer or the My Media row, creating a `MediaPublication` with `audience GROUP`. Members can comment. The owner can remove it at any time, and removal hides its comments. Nothing is shared automatically.

## 4. Privacy & membership matrix

| Information | Owner | Active group member | Follower not in group | Public |
|---|---|---|---|---|
| Own calendar dates/results | Full | No | No | No |
| Other member completed status | N/A | If shared | No | No |
| Other member started (in progress) on this occurrence | N/A | If shared (same `sharedCompletionEnabled` setting); means a session was started, never that they are online now | No | No |
| Other member is participating (avatar on My Programs) | N/A | If shared | No (aggregate counts only) | Aggregate counts only, suppressed below the minimum sample |
| Other member reps/amounts/notes | N/A | No, unless specifically shared | No | No |
| An Activity's participant count (12 §10a) | Same band as public | Same band as public | Same band as public | `0` exactly; `Fewer than 5` for 1–4; the exact number from 5 |
| Who participates in an Activity (avatars) | Self | Members of gatherings of it the viewer may see | Same, never from a follow | Members of public open gatherings only |
| Completion reactions | Yes | Yes | No | No |
| Group-shared media and its comments | Yes | Yes | No | No |
| Program's approved public instruction media | According to policy | According to policy | According to policy | According to visibility |

A creator/follower relationship by itself does not grant group membership. User blocks take precedence; provide reporting/removal, and group owner moderation of comments and members.

## 5. UI contract

On Activity occurrence: **Collaborators row is third**, after Today's Results and before Session Controls. It is the visually prominent social element on the page: 1–4 avatars, `2 of 3 finished`, each permitted member's state (`Finished 2h ago`, `Started`, `Not yet`), and reaction controls on permitted completions. It may summarise group media shared for this occurrence (`3 shared · 2 comments`) as a link to the Related Media row; thumbnails and comments stay there, so there is still one media section. It never claims live presence. The user can finish and log without touching it. No group means the row is absent, not disabled. `Shared Media` is the separate seventh row, with no tab switch required; comments open in the viewer.

`Program Group` view, accessed from participant avatars or Program Detail, shows members, invitation control, recent permitted completions, and shared media. Keep icon/photo UI compact, no large group dashboard or leaderboards. For asynchronous participants, label comparable `Program Day 7` instead of claiming the same calendar date.

Notifications: badge on top-right User widget for a member joining, a reaction to your completion, a comment on your shared media, and new shared media; deep link to the correct `calendarItemId` or publication. A muted group suppresses notifications. No alert for the user's own actions.

## 6. DTOs and operations

```ts
interface GroupSummaryDto { id:string; programId:string; programVersionId:string; programTitle:string; name:string|null;
  mode:'SYNC'|'ASYNC'; visibility:'PRIVATE'|'PUBLIC'; joinPolicy:'INVITE_ONLY'|'OPEN';
  startLocalDate:string|null; timezone:string|null; memberCount:number; myRole:'OWNER'|'MEMBER'; }
interface PublicGroupSummaryDto { id:string; programId:string; programVersionId:string; programTitle:string;
  name:string|null; mode:'SYNC'|'ASYNC'; visibility:'PUBLIC'; joinPolicy:'INVITE_ONLY'|'OPEN';
  memberCount:number; startLocalDate:string|null; timezone:string|null; startingSoon:boolean; viewerIsMember:boolean; }
interface CreateGroupDto { programVersionId:string; name?:string|null; mode:'SYNC'|'ASYNC';
  visibility?:'PRIVATE'|'PUBLIC'; joinPolicy?:'INVITE_ONLY'|'OPEN';
  startLocalDate?:string|null; timezone?:string|null; }
interface InviteToGroupDto { kind:'USER'|'EMAIL'|'LINK'; handle?:string; email?:string; }
interface GroupInvitationDto { id:string; kind:'USER'|'EMAIL'|'LINK'; status:string; expiresAt:string;
  joinUrl:string|null; }
interface GroupMemberDto { user:UserSummaryDto; role:'OWNER'|'MEMBER'; status:string; sharedCompletion:boolean; }
interface CollaboratorStatusDto { user:UserSummaryDto; status:'DONE'|'PENDING'|'UNKNOWN';
  completionShareId:string|null; reactions:ReactionCountDto[]; }
interface CollaboratorSummaryDto { groupId:string; members:CollaboratorStatusDto[]; finishedCount:number;
  totalCount:number; unreadCount:number; }
interface ReactionCountDto { emoji:string; count:number; reactedByMe:boolean; }
interface AddReactionDto { emoji:string; idempotencyKey:string; }
interface SetCompletionSharingDto { enabled:boolean; }
```

```ts
interface GroupDao {
  create(input:NewGroup,db:Db):Promise<GroupRow>;
  addMember(groupId:string,userId:string,role:GroupRole,db:Db):Promise<void>;
  setMemberStatus(groupId:string,userId:string,status:GroupMemberStatus,db:Db):Promise<void>;
  listMembers(groupId:string,db:Db):Promise<GroupMemberRow[]>;
}
interface CompletionDao {
  share(input:NewCompletionShare,db:Db):Promise<CompletionShareRow>;
  revoke(calendarItemId:string,at:Date,db:Db):Promise<void>;
  listForOccurrence(groupId:string,occurrenceKey:string,db:Db):Promise<CompletionShareRow[]>;
  react(shareId:string,userId:string,emoji:string,db:Db):Promise<void>;
  unreact(shareId:string,userId:string,emoji:string,db:Db):Promise<void>;
}
```

`GroupService`: invitations, membership, synchronous/asynchronous join policy. `CompletionSharingService`: share policy, reactions, and emitted events; consumes `SessionFinished`.

Endpoints: `GET|POST /groups`, `GET /programs/:programId/groups`, `GET /groups/:id/preview`, `POST /groups/:id/join`, `GET|PATCH /groups/:id` (includes members), `PATCH /groups/:id/members/me`, `DELETE /groups/:id/members/:userId`, `GET|POST /groups/:id/invitations`, `DELETE /groups/:id/invitations/:invitationId`, `GET /group-invitations/:token`, `POST /group-invitations/:token/accept`, `POST /group-invitations/:token/decline`, `GET /users/me/group-invitations`, `POST /users/me/group-invitations/:id/accept`, `POST /users/me/group-invitations/:id/decline` (accept and join take an optional `enrollment { startLocalDate?, timezone, idempotencyKey }`), `GET /groups/:id/completions`, `POST /completion-shares/:id/reactions`, `DELETE /completion-shares/:id/reactions/:emoji`, `GET /groups/:id/media`. Comments use `/media-publications/:id/comments`.

## 7. Tests

- Two friends have independent calendars, both can see shared completion statuses but not private results.
- Completion shares are per Activity occurrence; no collision across groups or activities; three Activities on a Program Day share separately.
- `SYNC` and `ASYNC` have correct day labels when start dates differ.
- Membership removed: group media, comments, and signed URLs return no unauthorized data.
- Handle, email, and link invitations: single-use where specified, expiry, revoke, decline, duplicate pending invitations refused, blocked user, no enrollment access bypass.
- Late joiner in a SYNC group: original dates kept, pre-join items NOT_PARTICIPATING and excluded from progress, completion rate and group counts; catch-up and undo behave as specified.
- After leaving: completion shares withdrawn, shared media retained for members until withdrawn by its owner.
- Accept → enrollment → personal calendar in one step; an existing enrollment links without calendar changes; enrollment or schedule failure leaves no membership; removed members cannot rejoin by link.
- Reaction and comment auth, idempotency, moderation/rate limits; undoing a completion hides its share.
- Solo Activity page never displays empty collaborator/Shared Media placeholders.
- Notifications deep-link to authorized activity and do not leak private metrics in payload.

## 8. Check-In-Centered Collaboration & Animated Group Stage

**Shared Participation Experience:** the participation room requirements (occurrence identity, participant rail, Shared Moments, share link, lifecycle) are in `docs/shared-participation-experience.md` (added 2026-11-14, unchanged from the product document). Participation code must not change without reviewing it.

Check-ins are the core Group collaboration loop (`Complete → Check in → See others → React → Return`), providing shared momentum without real-time meeting rooms, leaderboards, or forced schedules:
- Completing an Activity saves personal progress; sharing a check-in with one or more active Groups (`POST /check-ins` or via occurrence completion) is explicit and never duplicates Activity completions or Calendar items.
- Check-ins belong to `(activityId, userId)` and optionally `calendarItemId`, supporting repeat Program runs, standalone Activities, optional check-in note, optional group-scoped media attachment (`View media`), emoji reactions, and check-in discussion (`GET|POST /completion-shares/:id/comments`, `DELETE /completion-comments/:id`).
- Private Group check-ins, media, and discussion remain visible exclusively to active Group members. Public Group discovery surfaces only Group identity, member count, real recent check-in count, and optional scheduled start, with one-click Join for open Groups (`Open Group` once joined) and no automatic Program run creation.
- **Full-Screen Participation Stage (`/groups/:id`):** Designed in three layers — (1) minimal full-screen `Stage` showing members and Group identity, (2) `Events` driven by real member joins, check-ins, media shares, and reactions, and (3) interchangeable visual `Animations` themes (`constellation`, `campfire`, `sprout`) configured per Group (`stageTheme`). History and group management stay in clean slide-over panels.

## 9. Standalone Activity gatherings (approved 2026-11-14)

**Status:** Approved for implementation in small milestones (G1 schema and Program-path guards, G2 server, G3 web). Audit of every pre-existing group assumption, with file:line references: `docs/gatherings-audit.md`. Participation behaviour follows `docs/shared-participation-experience.md`.

### 9.1 Journey and rules

**Activity → Join an existing gathering, or Create a time → it is on my Calendar → the existing `/occurrences/:id` room.** No separate event pages, no event-management concepts, no new room, no new execution engine. A Program is never required.

1. **Personal scheduling stays independent.** Two people who each schedule chess for Saturday 2 PM are never linked, shown together, or counted together. Only an explicit join connects someone to a gathering.
2. A **gathering** is one shared occurrence of one Activity: a date, an optional time, the creator's timezone, an optional Place, an optional capacity, and its members. It is not a Program, a recurrence or an event.
3. A gathering's Place is suggested and chosen by participants, never a host, sponsor, booking or opening hours (02 §4.11, 08 §2a).
4. Counts, avatars and statuses come from real records only. Scheduled is not online; "active" means an Activity session is running or paused.
5. **Recurring gatherings are out of scope.** Activities stay recurring and independently schedulable for individuals (09 §2).

### 9.2 Model: a gathering is a group without a Program

A gathering reuses `ProgramGroup` with `kind = GATHERING`: membership, roles and owner hand-off, link invitations, completion shares, reactions, comments, GROUP media, check-ins, presence and the occurrence room all work unchanged. A separate model was rejected because completion shares, GROUP media, reactions, comments, invitations and presence are all keyed by group.

**Occurrence identity.** Each gathering's occurrence key is `gathering:<groupId>`. It cannot collide with Program keys (`<programId>:<activityId>:<day>:<ordinal>`) or with the check-in fallback `activity:<activityId>`.

**Migration `20261114180000_gatherings` (additive):**

```text
enum GroupKind { PROGRAM, GATHERING }
ProgramGroup  + kind GroupKind @default(PROGRAM)            -- every existing row stays PROGRAM
              ~ programVersionId String?                     -- FK stays ON DELETE RESTRICT
              + activityId String? FK → Activity RESTRICT
              + startLocalTime String? VARCHAR(5)            -- startLocalDate and timezone are reused
              + placeId String? FK → Place SET NULL          -- outside the CHECK
              + capacity Int?                                -- null = no limit; no default limit
              + @@index([activityId, kind, status, startLocalDate]), @@index([placeId])
              CHECK ((kind = 'PROGRAM' AND programVersionId IS NOT NULL AND activityId IS NULL)
                  OR (kind = 'GATHERING' AND programVersionId IS NULL AND activityId IS NOT NULL AND startLocalDate IS NOT NULL))
CalendarItem  + gatheringId String? FK → ProgramGroup SET NULL, indexed
```

A member's gathering item has `gatheringId = <group>`, `groupOccurrenceKey = 'gathering:<group>'`, `placeId` = the gathering's Place, no enrollment and no recurrence. One member has at most one linked item per gathering.

### 9.3 Program paths are protected explicitly

Every Program-group code path filters `kind: 'PROGRAM'` instead of relying on a join through the Program, and handles the now-optional Program reference explicitly. All existing `/groups/...` operations (detail, update, members, invitations, join, accept, enrollment with a group, starting soon, featured groups, live sessions, participation stats) act on Program groups only: a gathering id returns 404 there. Operations keyed only by group id that work for both kinds: completion shares, reactions, comments, GROUP media, check-ins and presence. One helper resolves an item's group: `item.enrollment?.groupId ?? item.gatheringId`; it is used by the occurrence room, Calendar tiles and session completion sharing.

### 9.4 Create a time

- From the Activity page: date, optional time, optional Place (defaults to the Activity's suggested Place), **Open to others**. Off = an ordinary personal Calendar Item (09 §2). On = a gathering whose owner is its first member.
- **Private and invite-only by default:** `visibility PRIVATE`, `joinPolicy INVITE_ONLY`; members share a link. **List publicly** (`visibility PUBLIC`, `joinPolicy OPEN`) is an explicit second choice, allowed only for PUBLIC Activities. Members may share links (`memberLinkSharingEnabled = true`).
- Only published PUBLIC or UNLISTED Activities that the creator can read can be gathered around.
- Capacity is optional; empty means no limit.
- **Reuse, not duplicate:** when `calendarItemId` names the creator's own compatible item (same Activity, PLANNED, not in a Program or another gathering), that item becomes the gathering item, taking the gathering's date, time and Place; a recurrence-generated item is detached from its recurrence.
- The gathering's date and time are in the creator's timezone. Each member's item stores the same moment in that member's own timezone; date-only gatherings keep the date.

### 9.5 Join and leave

**Join** is one repeat-safe operation (`idempotencyKey` required): open public gatherings directly, private ones with a valid share-link token. In one transaction it creates or reactivates membership and links exactly one Calendar Item for the member: it **reuses** a compatible personal item on the same date (same Activity, PLANNED, not in a Program or another gathering), otherwise creates one. It returns `{ gathering, calendarItemId }` and the client opens `/occurrences/:calendarItemId`. Joining again as a member returns the same result. Join is refused with 409 when the gathering is full or has started; a closed gathering, a private one without a valid link, or one whose owner has blocked the viewer is not found (404) for non-members.

**Leave** keeps the member's Calendar Item as a personal occurrence: the gathering link and key are cleared and the item stays PLANNED. Completion shares the member made are withdrawn as in §3. When the owner leaves, ownership passes to the longest-standing member (existing behaviour); when the last member leaves, the gathering closes.

### 9.6 Changes after joining (never silently claim participation)

- **A member moves, re-times, re-places, skips or cancels their own gathering item:** the client confirms "This leaves the gathering"; the server then leaves the gathering automatically as part of the same update. Other members are unaffected.
- **The owner changes date, time, Place or capacity:** linked members' items move with it. Capacity below the current member count is refused. **The owner closes the gathering:** status CLOSED; members' items stay as personal occurrences without the gathering link.
- **Notifications reuse existing infrastructure:** joins use `MEMBER_JOINED`; owner changes and closing use `PROGRAM_UPDATE` with gathering-specific copy and a deep link to the member's item. No new notification type.
- After the start (date-only: after that date), joins are refused; the shared media remain the occurrence memory (`shared-participation-experience.md` §7).

### 9.7 Discovery and sharing

- **Activity page:** "Upcoming gatherings": public open gatherings and any the viewer belongs to, not past, soonest first, each with date, time, Place and city, real member count, and Join or Open (`joinEligibility`). Below, **Create a time**.
- **Happening now:** public gatherings with at least one member's Activity session running or paused (authoritative session records) appear first in Community's Happening Now.
- **With others** shortcut: Activities that have an upcoming public open gathering.
- **Share link:** `/gatherings/{id}` (with `?invite=<token>` for private ones) shows that exact occurrence and Join or Open. City wording only, never "nearby".
- **Privacy:** a private gathering's date, time, Place and members are visible to members and to holders of a valid link. Blocking filters members and hides gatherings owned by a blocked user.

### 9.8 API (new operations; existing group DTOs unchanged)

| Operation | Contract |
|---|---|
| `createGathering` `POST /activities/{activityId}/gatherings` | `{ localDate, localTime?, placeId?, calendarItemId?, listPublicly?, capacity?, idempotencyKey }` → `{ gathering, calendarItemId }` (201) |
| `listActivityGatherings` `GET /activities/{activityId}/gatherings` | Upcoming visible gatherings (public; viewer-aware) |
| `listGatherings` `GET /gatherings?when=NOW\|UPCOMING&locality` | Public gatherings: active now, or upcoming |
| `getGathering` `GET /gatherings/{gatheringId}?invite=` | One gathering; private needs membership or a valid link token, else 404 |
| `joinGathering` `POST /gatherings/{gatheringId}/join` | `{ invite?, idempotencyKey }` → `{ gathering, calendarItemId }` |
| `leaveGathering` `POST /gatherings/{gatheringId}/leave` | → `{ calendarItemId }` (the kept personal item, or null) |
| `updateGathering` `PATCH /gatherings/{gatheringId}` (owner) | `{ localDate?, localTime?, placeId?, capacity?, listPublicly?, close? }` → `gathering` |
| `createGatheringLink` `POST /gatherings/{gatheringId}/link` (member) | → `{ url, expiresAt }` (existing LINK invitation, token shown once) |
| `/discover` | ACTIVITY: `hasOpenGathering` |
| `CalendarItem` | + `gatheringId` |

`Gathering`: `id, activity (ActivitySummary), localDate, localTime, timezone, place, capacity, visibility, joinPolicy, status, owner, memberCount, members (up to 8 visible UserSummary), scheduledCount, activeCount, completedCount, isFull, isPast, viewerIsMember, viewerIsOwner, viewerCalendarItemId`.

### 9.9 Tests

- **Program groups unchanged:** the existing group, enrollment, invitation, check-in and Stage suites pass untouched; a gathering id returns 404 on every Program-only `/groups` operation; Program discovery, featured groups, starting soon, live sessions and participation stats never include gatherings.
- **Two-person journey:** A creates (private) → B cannot see it without the link → A mints a link → B opens it and joins → both Calendars have one item each at the same moment and Place → both rooms show two members → B starts a session and A sees B active → B finishes and the completion is shared to the gathering → A lists publicly → it appears under Upcoming and With others → B leaves → B's item remains PLANNED as a personal occurrence and the room shows one member.
- **Independence:** two users scheduling the same Activity at the same time independently share nothing.
- **Repeat-safety and reuse:** replaying a join returns the same `calendarItemId`; a different payload with the same key is 409; joining with a compatible personal item links it instead of creating a second; a Program item is never reused.
- **Refusals:** full, past, closed, private without link, blocked owner, private Activity, public listing of a non-public Activity.
- **After joining:** a member moving their item leaves the gathering; the owner changing time or Place moves linked items; the owner closing keeps members' items as personal ones.

### 9.10 Decisions (2026-11-14)

1. Capacity is optional, with no default limit.
2. Leaving keeps the Calendar Item as a personal occurrence and removes the gathering link.
3. New gatherings are private and invite-only; listing publicly is an explicit choice.
4. Public gatherings with running or paused sessions appear in Happening Now.
5. Existing notification types are reused (`MEMBER_JOINED`, `PROGRAM_UPDATE`); no new type.
6. Recurring gatherings are out of scope; recurring Activities remain supported for individuals.

### 9.11 Programs, suggestions, Do It Again, phases (approved 2026-11-14, milestone G4)

**Solo Program items join gatherings.** A Calendar Item from a Program enrollment *without* a Program group may become a member's gathering item: joining reuses it (explicitly via `calendarItemId`, or automatically as the compatible item on the same date). It keeps its `enrollmentId`, Program day, sessions, results and progress; only its time and Place take the gathering's. A Program item is reused only on the gathering's own date, so joining never moves a Program day to another date. Leaving keeps it in the Program. If the owner later changes the gathering's date or time, the linked item moves with it like any other member's item (a personal adjustment of that Program day).

**Program-group items keep their identity.** An item whose enrollment belongs to a Program group already carries that group's occurrence key; it is never attached to a gathering (one item, one group). Such a user may still join a gathering, which then creates a separate standalone item. That is an explicit choice, never an automatic duplicate.

**Suggestion on the occurrence.** A planned item that is not in any group shows one compact line when public gatherings of the same Activity exist on the same date: "N people are doing this on <day> · Join". Joining passes the item's id, so the existing item is reused. Data: `listActivityGatherings`, filtered to that date. City wording only.

**Joining on another date says so (approved 2026-11-15).** Joining never moves a Program day. When a join creates a separate item while the member still has a planned Program item of the same Activity on another date, the join result names that date (`GatheringJoinResult.otherProgramItemDate`) and the confirmation says both: the gathering is its own Calendar item, and the Program still has the Activity on that date. Same-day suggestions appear wherever the planned item is shown: the occurrence and the Calendar panel.

**Do It Again.** `repeatGathering` `POST /gatherings/{gatheringId}/repeat` `{ localDate, localTime?, inviteParticipants?, idempotencyKey }` → `{ gathering, calendarItemId }`. Any active member may repeat a gathering: a new gathering with the same Activity, Place, capacity, visibility and join policy, owned by the person repeating it, on their Calendar. With `inviteParticipants`, the other current members of the original receive a personal invitation (an existing USER `GroupInvitation`, `GROUP_INVITE` notification linking to `/gatherings/{id}`); an addressed, pending invitation lets them see and join a private gathering. No recurrence is created (decision 6).

**Phase-aware hero (03 §6 row order unchanged).** Only the Hero's emphasis changes. *Before* (planned, no session): date, time, Place and participants lead. *During* (session running or paused): session controls lead; gathering controls stay compact. *After* (completed): completion and shared memories lead (a count of shared photos and videos linking to Related Media), plus Do It Again for gathering members.

**Tests (G4):** solo Program item joins by reuse with enrollment, Program day and progress intact; a Program item on another date is not moved; a Program-group item is never attached (explicit id refused; auto-reuse skips it, creating a separate item); repeated joins return the same item; leaving keeps the Program item; a Calendar adjustment of a Program gathering item leaves the gathering and keeps the enrollment; repeat creates a new gathering for the repeater with the same settings and invites prior members, who can then see and join it privately; the two-person journey still passes.

**No completion before the gathering (approved 2026-11-15).** A member cannot finish a gathering item before the gathering's scheduled date and time (09 §3, `completionOpensAt`), so a future gathering never reports anyone as finished.

### 9.12 Discovery associations and "Looking for" (approved 2026-11-15)

Discovery-first, not coordination-first: the catalog connects relevant people with real gatherings; everyone joins with the same Join (§9.5). No roles, quotas, approvals or new participation states.

**Categories.** A gathering **inherits** its Activity's Categories (`ActivityFocus`) and may have **up to 3 additional** curated Categories (`GatheringFocus`: gathering, Category, position). Additional Categories must be approved and active, are deduplicated, and may not repeat an inherited one. They live only on the gathering: the Activity's own classification never changes. The owner sets them at creation or later; Do It Again copies them.

**Looking for.** An optional owner-written note, at most 140 characters (trimmed; empty clears it), for example "Looking for actors and lighting help". It is shown wherever the gathering is visible (share page, room, Radar, Community) and follows the gathering's visibility. It is reportable (report target `GATHERING`); a moderator's HIDE hides the note (the gathering itself is unaffected) until RESTORE. A user whose publishing is restricted cannot set a non-empty note. Do It Again copies it.

**Schema (additive, `20261115120000_gathering_discovery`):** `GatheringFocus(groupId, focusId, position)` with both foreign keys cascading; `ProgramGroup.lookingFor VARCHAR(140) NULL`, `ProgramGroup.lookingForHiddenAt DATETIME NULL`; `ReportTargetType` gains `GATHERING`.

**API.** `CreateGatheringInput` and `UpdateGatheringInput` gain `focusIds` (≤ 3) and `lookingFor`. `Gathering` gains `categories` (`{ id, label, inherited }`, inherited first) and `lookingFor` (null when empty or hidden). `listGatherings` gains `focusId` and `categoryId` (Domain), matching inherited or additional Categories.

**Discovery.** Community: with a Category or Domain selected, a compact "Gatherings" row shows public upcoming gatherings matching through inherited or additional Categories. Radar's interest reason (12 §5b) uses the gathering's inherited and additional Categories (completed Activities only), falling back to Domain.

**Tests:** inherited and additional Categories both match in Community and Radar; additional Categories never change the Activity; duplicates and inherited repeats are rejected; at most 3; the note respects visibility, is reportable, hides on moderation and restores; restricted users cannot set it; joining is unchanged.

