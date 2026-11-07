# COLLABORATION — Program groups, invites, shared completion, reactions, group media

**Status:** Authoritative P1 contract · **Authority:** cross-user participation. Individual Calendar Items, Sessions and private results are in `09-CALENDARS.md`; media assets and publications in `11-MEDIA.md`; public engagement and follow graph in `12-SOCIAL.md`.

## 1. Collaboration premise

Two friends can adopt a **shared Program**, see each other's consented activity completion, react to it, and optionally share recordings and comment on them. They **never** share a single editable personal Calendar or inherit unrestricted access to each other's private Activity Logs. A collaborative Program is represented by `ProgramGroup` and members, with each member having an individual `ProgramEnrollment` and calendar.

Example: “30 Days — 10 Push-ups + 10 Sit-ups.” Group owner creates a group on a Program Version and invites a friend; both adopt the schedule; on day 7 each sees the other's permitted completion of each Activity and can react; both retain private metrics and media unless specifically shared.

**P1 communication is completion reactions and comments on group-shared media.** General group chat, direct messages, and live video are deferred. `groupOccurrenceKey` stays stable so a future conversation or call resource can attach to it without migrating data.

## 2. Group scope

| Entity | Key fields | Ownership / rule |
|---|---|---|
| `ProgramGroup` | id, programVersionId, ownerId, name?, mode SYNC/ASYNC, startLocalDate?, timezone?, joinLinkEnabled, status ACTIVE/CLOSED, createdAt | Group tied to one Program Version; not a separate Program |
| `GroupMember` | groupId, userId, role OWNER/MEMBER, status ACTIVE/LEFT/REMOVED (pending invites live in `GroupInvitation`), joinedAt?, sharedCompletionEnabled | Exactly one row per pair; participation/access checked |
| `GroupInvitation` | id, groupId, kind USER/EMAIL/LINK, invitedUserId?, invitedEmailHash?, tokenHash, expiresAt, status PENDING/ACCEPTED/REVOKED/EXPIRED, createdAt | USER and EMAIL are single-use; LINK is reusable until revoked or expired; no email disclosure in public API |
| `CompletionShare` | id, groupId, occurrenceKey, calendarItemId, userId, activityId, programDayIndex, completedAt, revokedAt? | Minimal completion event, never metric detail; unique per calendarItemId |
| `CompletionReaction` | completionShareId, userId, emoji, createdAt | Unique per share, user, emoji; emoji from a small fixed set |

Group-shared media is a `MediaPublication` with `audience GROUP` plus `groupId` and `occurrenceKey` (`11-MEDIA.md`). Its comments are `MediaComment` rows (`12-SOCIAL.md`).

Occurrence key is stable across members, not a user's Calendar Item ID: `programVersionId:scheduleItemId:cycleIndex`. For `SYNC`, members share a group start date. For `ASYNC`, each member has a personal start date, the same key still maps equivalent occurrences, and the UI shows `Program Day 7` rather than implying a shared calendar date. Consolidated persistence: `packages/db/prisma/schema.prisma`.

## 3. Collaboration lifecycle

**Group:** created by an enrolled participant or the Program owner → invite → accept → active membership. Group may be CLOSED; membership LEFT or REMOVED ends access to group content (the author's own past comments follow retention policy). If Program is archived, an existing group stays readable while access is valid; new joins are blocked.

**Joining, three ways:** invite an existing user by handle; invite by email address; share a join link. All three end at the same acceptance flow.

**Invitation:** PENDING → ACCEPTED or REVOKED/EXPIRED. `Accept` requires signed-in matching intended user, or a valid link token. If the Program is locked, access (approval or payment) is obtained before active membership; an invitation never bypasses entitlement. Expired tokens cannot be replayed. Acceptance continues to the enrollment and Calendar confirm flow, and states plainly that completion will be visible to members and can be turned off.

**Completion:** participant finishes one Activity occurrence → personal result saved → service checks `sharedCompletionEnabled` and active membership → creates a minimal `CompletionShare` for that occurrence (activity, program day, status only) → members can react. Each Activity occurrence shares separately; there is no whole-day share. Turning sharing off or undoing the completion sets `revokedAt`, which hides it; this never changes the member's personal log.

**Group media:** a member explicitly shares one of their READY assets to the group from the viewer or the My Media row, creating a `MediaPublication` with `audience GROUP`. Members can comment. The owner can remove it at any time, and removal hides its comments. Nothing is shared automatically.

## 4. Privacy & membership matrix

| Information | Owner | Active group member | Follower not in group | Public |
|---|---|---|---|---|
| Own calendar dates/results | Full | No | No | No |
| Other member completed status | N/A | If shared | No | No |
| Other member reps/amounts/notes | N/A | No, unless specifically shared | No | No |
| Completion reactions | Yes | Yes | No | No |
| Group-shared media and its comments | Yes | Yes | No | No |
| Program's approved public instruction media | According to policy | According to policy | According to policy | According to visibility |

A creator/follower relationship by itself does not grant group membership. User blocks take precedence; provide reporting/removal, and group owner moderation of comments and members.

## 5. UI contract

On Activity occurrence: **Collaborators row is third**, after Today's Results and before Session Controls. It is the visually prominent social element on the page: 1–4 avatars, `2 of 3 finished`, and reaction controls on permitted completions. The user can finish and log without touching it. No group means the row is absent, not disabled. `Shared Media` is the separate seventh row, with no tab switch required; comments open in the viewer.

`Program Group` view, accessed from participant avatars or Program Detail, shows members, invitation control, recent permitted completions, and shared media. Keep icon/photo UI compact, no large group dashboard or leaderboards. For asynchronous participants, label comparable `Program Day 7` instead of claiming the same calendar date.

Notifications: badge on top-right User widget for a member joining, a reaction to your completion, a comment on your shared media, and new shared media; deep link to the correct `calendarItemId` or publication. A muted group suppresses notifications. No alert for the user's own actions.

## 6. DTOs and operations

```ts
interface GroupSummaryDto { id:string; programVersionId:string; programTitle:string; name:string|null;
  mode:'SYNC'|'ASYNC'; memberCount:number; myRole:'OWNER'|'MEMBER'; }
interface CreateGroupDto { programVersionId:string; name?:string|null; mode:'SYNC'|'ASYNC';
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

Endpoints: `GET|POST /groups`, `GET|PATCH /groups/:id` (includes members), `PATCH /groups/:id/members/me`, `DELETE /groups/:id/members/:userId`, `GET|POST /groups/:id/invitations`, `DELETE /groups/:id/invitations/:invitationId`, `GET /group-invitations/:token`, `POST /group-invitations/:token/accept`, `GET /groups/:id/completions`, `POST /completion-shares/:id/reactions`, `DELETE /completion-shares/:id/reactions/:emoji`, `GET /groups/:id/media`. Comments use `/media-publications/:id/comments`.

## 7. Tests

- Two friends have independent calendars, both can see shared completion statuses but not private results.
- Completion shares are per Activity occurrence; no collision across groups or activities; three Activities on a Program Day share separately.
- `SYNC` and `ASYNC` have correct day labels when start dates differ.
- Membership removed: group media, comments, and signed URLs return no unauthorized data.
- Handle, email, and link invitations: single-use where specified, expiry, revoke, blocked user, no enrollment access bypass.
- Reaction and comment auth, idempotency, moderation/rate limits; undoing a completion hides its share.
- Solo Activity page never displays empty collaborator/Shared Media placeholders.
- Notifications deep-link to authorized activity and do not leak private metrics in payload.
