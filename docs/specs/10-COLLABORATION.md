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
