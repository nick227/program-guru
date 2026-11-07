# USERS — Identity, profiles, preferences, following requests

**Status:** Authoritative P1 baseline · **Authority:** User domain persistence, authentication/public identity; social distribution in `12-SOCIAL.md`. **Decisions:** handle required, single profile, private-follow approval, all users may create/publish (subject to safety/auth permissions).

## 1. Ownership

`User` is an account principal. `UserProfile` represents its one public-facing identity. A creator is a user who publishes, not a separate account role: every user can publish and sell, subject to `PublishingPolicy`. `UserRole` (`USER`, `MODERATOR`, `ADMIN`) exists only for platform moderation. A user owns a personal Calendar, authored Programs/Activities, MediaAssets and ResultEntries through foreign keys in those domains. User DAO must not load every owned entity by default.

## 2. Table schema (MySQL/Prisma-oriented)

| Model | Fields | Constraints/indexes |
|---|---|---|
| `User` | `id UUID PK`, `email varchar(254)`, `emailVerifiedAt?`, `role USER/MODERATOR/ADMIN`, `status ACTIVE/SUSPENDED/DEACTIVATED`, `createdAt`, `updatedAt`, `deactivatedAt?` | unique normalized email; status index |
| `UserProfile` | `userId PK/FK`, `handle varchar(40)`, `displayName varchar(80)`, `bio varchar(500)?`, `avatarMediaId?`, `coverMediaId?`, `visibility PUBLIC/PRIVATE`, timestamps | unique normalized handle; owned by User; one-to-one |
| `UserPreference` | `userId PK/FK`, `timezone varchar(64)`, `locale varchar(20)`, `defaultVisibility PRIVATE/UNLISTED/PUBLIC`, `inAppRemindersEnabled`, `dailyEmailEnabled`, `dailyReminderTime HH:mm`, `notifyGroupActivity`, `notifyFollowRequests`, `mutedGroupIds JSON?` | one-to-one; defaults UTC/en-US/PRIVATE, in-app on, daily email **off**, 08:00 |
| `AuthIdentity` | `id`, `userId FK`, `provider GOOGLE`, `providerSubject`, `createdAt` | unique `(provider,providerSubject)`, user index |
| `LocalCredential` | `userId PK/FK`, `passwordHash`, `updatedAt` | one-to-one; never serialized; absent for Google-only accounts |
| `Session` | `id`, `userId FK`, `tokenHash`, `expiresAt`, `createdAt`, `lastUsedAt?` | unique tokenHash; raw token only ever in the cookie |
| `AuthToken` | `id`, `userId FK`, `purpose VERIFY_EMAIL/RESET_PASSWORD`, `tokenHash`, `expiresAt`, `usedAt?`, `createdAt` | single-use; unique tokenHash |
| `UserFollow` | `followerId FK`, `followedId FK`, `createdAt` | composite PK, reverse lookup index, disallow self |
| `FollowRequest` | `id`, `requesterId FK`, `targetId FK`, `status`, `resolvedAt?`, `createdAt`, `updatedAt` | unique pair, target/status/time index |
| `UserBlock` (recommended P1) | `blockerId FK`, `blockedId FK`, `createdAt` | composite PK, self-block disallowed; takes precedence over follow |

**Why UserBlock now?** Public creator pages and shared groups need a basic safety boundary. Block clears accepted follows/pending requests; prevents future user-to-user follows/direct reactions, and restricts discovery interactions, while group moderation decides existing shared-room visibility.


The consolidated persistence definition for all domains is `packages/db/prisma/schema.prisma`. Avatar references get an ownership/READY check in MediaService.

## 3. DTOs

```ts
type UUID = string;
type ProfileVisibility = 'PUBLIC' | 'PRIVATE';
type Visibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
type FollowRelationship = 'NONE' | 'FOLLOWING' | 'REQUESTED' | 'INCOMING_REQUEST';
interface RegisterUserDto { email: string; password: string; handle: string; displayName: string; }
interface UserSummaryDto { id: UUID; handle: string; displayName: string; avatarUrl: string|null; }
interface UserProfileDto extends UserSummaryDto {
  bio: string|null; coverUrl: string|null; visibility: ProfileVisibility; relationship: FollowRelationship;
  followerCount: number; followingCount: number; publicProgramCount: number; focusChips: {id:string;label:string}[];
}
interface UserMeDto { id:UUID; email:string; emailVerified:boolean; status:UserStatus;
  profile:UserProfileDto; preferences:UserPreferencesDto; createdAt:string; }
interface UserPreferencesDto { timezone:string; locale:string; defaultVisibility:Visibility; notifications:NotificationPrefsDto; }
interface NotificationPrefsDto { inAppReminders:boolean; dailyEmail:boolean; dailyReminderTime:string;
  groupActivity:boolean; followRequests:boolean; mutedGroupIds:UUID[]; }
interface UpdateProfileDto { handle?:string; displayName?:string; bio?:string|null;
  avatarMediaId?:UUID|null; coverMediaId?:UUID|null; visibility?:ProfileVisibility; }
interface UpdatePreferencesDto { timezone?:string; locale?:string;
  defaultVisibility?:Visibility; notifications?:Partial<NotificationPrefsDto>; }
interface FollowActionDto { relationship:FollowRelationship; requestId:UUID|null; }
interface FollowRequestDto { id:UUID; requester:UserSummaryDto; createdAt:string; status:'PENDING'|'APPROVED'|'DECLINED'|'CANCELLED'; }
```

Passwords and OAuth subjects **never** appear in UserMeDto. `UserProfileDto.relationship` is computed for the viewer, not stored. Private profile may expose handle/name/avatar but not restricted posts, private media, or program access.

## 4. DAO and service contracts

```ts
interface UserDao {
  create(data:{email:string} , db:Db):Promise<UserRow>;
  findById(id:UUID, db:Db):Promise<UserRow|null>;
  findByEmail(normalizedEmail:string,db:Db):Promise<UserRow|null>;
  setStatus(id:UUID,status:UserStatus,db:Db):Promise<void>;
  verifyEmail(id:UUID,at:Date,db:Db):Promise<void>;
}
interface ProfileDao {
  create(row:NewProfileRow,db:Db):Promise<ProfileRow>;
  findByHandle(handle:string,db:Db):Promise<ProfileRow|null>;
  update(userId:UUID,patch:ProfilePatch,db:Db):Promise<ProfileRow>;
}
interface PreferenceDao {
  upsert(userId:UUID,patch:PreferencePatch,db:Db):Promise<PreferenceRow>;
}
interface FollowDao {
  getPair(a:UUID,b:UUID,db:Db):Promise<FollowStateRow|null>;
  request(a:UUID,b:UUID,db:Db):Promise<FollowRequestRow>;
  approve(requestId:UUID,db:Db):Promise<void>;
  decline(requestId:UUID,db:Db):Promise<void>;
  unfollow(a:UUID,b:UUID,db:Db):Promise<void>;
  listFollowers(userId:UUID,page:Page,db:Db):Promise<PageOf<UserRow>>;
}
```

`AuthService`: local/Google login, session, verify, reset; `UserService`: status/email/deactivate; `ProfileService`: handle/profile/edit; `PreferenceService`: settings; `FollowService`: approval graph/blocks; `PublishingPolicy`: active+verified+not restricted+correct content rights, plus ACTIVE payout account for paid access. DAO does not enforce HTTP/session semantics.

## 5. Lifecycle and follow privacy

- User `ACTIVE ↔ SUSPENDED` (admin only); `ACTIVE → DEACTIVATED` (user request), reactivation via verified flow. Deletion is a separate account-erasure/retention workflow with media, payments, and adopted content policies.
- On public profile, Follow action creates `UserFollow` directly; on private profile it creates pending `FollowRequest`. Accept creates Follow and closes request atomically; decline/cancel closes without Follow. Private → Public **does not** approve pending requests automatically; existing accepted followers remain on Public → Private.
- Repeated request pair can reopen latest request if allowed after cooldown; rate-limit harassment; UserBlock overrides follow/request and prevents future interactions.
- `Follow` never grants automatic access to `PRIVATE` Activity recordings or `PAID` Programs.

## 6. UX contract and endpoints

Profile via avatar in Calendar header; no primary sidebar. User widget includes unread badge and short destinations: My Programs, My Media, Profile, Notifications, Settings. The **combined public profile** shows published Programs, Activities, public media, and achievements the user chose to share, only when permitted. Never show private journal, results, or Calendar on it. Settings holds reminders and payout onboarding.

Routes: `POST /auth/register|login|logout|google|verify-email|forgot-password|reset-password`, `GET /auth/me` (returns `UserMeDto`), `PATCH /users/me/profile`, `PATCH /users/me/preferences`, `POST /users/me/deactivate`, `GET /users/:handle`, `GET /users?q`, `POST|DELETE /follow-users/:userId`, `GET /users/me/follow-requests`, `POST /follow-requests/:id/approve|decline`, `POST|DELETE /blocked-users/:userId`.

## 7. Validation, security and tests

- Normalize email; handle lowercase ASCII (suggest `^[a-z0-9][a-z0-9._-]{2,29}$` with reserved list), enforce collation + unique index; race conflicts return `CONFLICT`.
- Keep one profile/preferences record created transactionally, not lazy on public route.
- Bcrypt cost 12, hashed session tokens, httpOnly Secure cookies with `SameSite=Lax` across sibling subdomains, rate limits, token rotation, email verification for publication.
- Permissions cover anonymous, signed-in unrelated, accepted follower, pending follower, owner, blocked, suspended.
- Tests: duplicate/parallel registration; self-follow blocked; private approval; block overrides; privacy toggle; deletion preserves authorized adopted snapshot but removes identity as retention rules require; username changes do not break stable ID references.
