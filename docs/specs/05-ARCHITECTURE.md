# ARCHITECTURE — TypeScript, Prisma/MySQL, services, API and delivery

**Status:** Authoritative P1 engineering baseline · **Authority:** cross-cutting technical contracts, security, deployment/testing strategy. Domain DAOs/DTOs are defined in docs 06–12; do not duplicate them here.

## 1. Stack

pnpm monorepo. React + TypeScript + Vite (responsive web/PWA), Tailwind, React Router, TanStack Query. Fastify TypeScript API routed from an OpenAPI 3.1 spec (`fastify-openapi-glue`), Prisma ORM, MySQL 8.4 everywhere: Railway's MySQL template (`mysql:8`, currently 8.4.13), CI (`mysql:8.4.13`), and local development (an isolated user-level 8.4.13 from `scripts/local-mysql.sh`). One Prisma schema and one migration history serve every environment; only `prisma migrate deploy` runs outside a developer machine. S3-compatible object storage on Cloudflare R2 and CDN for media. Secure httpOnly session cookies. Hosted on Railway (API, worker, database) and Vercel (web), on sibling subdomains. Use standard open-source accessibility primitives selectively for dialogs/popovers; do not adopt a giant UI kit as a second design language.

Avoid importing Prisma types into browser packages. The SDK is the only bridge between frontend and backend.

## 2. Repository boundaries

```text
apps/web/src/
  pages/                 # sparse route shells: Calendar, Program, Activity, Media, Profile
  components/ui/         # Page, Stage, Panel, Row, Grid, Stack + shared controls
  components/            # props-only controls; no data fetching
  lib/                   # formatting, view-model mapping, non-data utility hooks
apps/server/src/
  index.ts               # registers fastify-openapi-glue; no hand-registered routes
  handlers/              # one named export per operationId; barrel export; delegates only
  domains/{users,catalog,programs,activities,calendars,collaboration,media,social,billing}/
    *.service.ts, *.dao.ts, *.mapper.ts
  infrastructure/{auth,storage,email,events,stripe}/
apps/server/src/worker.ts + worker/   # second process (own Railway service, same build): outbox,
                         # media processing, reminders, schedule horizon, ranking, cleanup
packages/api-spec/       # openapi.yaml: the wire contract, written before implementation
packages/sdk/            # generated types, typed client, React Query hooks
packages/db/             # prisma/schema.prisma, migrations, seeds
```

Favor plain functions + focused DAO/service modules. Data hooks live in `packages/sdk`, never in `apps/web`.

## 3. Dependency direction

`Spec validation/auth → Handler → Service (permission + transaction + domain policy) → DAO (Prisma persistence)`. Mapper creates DTO; UI maps DTO into view model. No handler reaches Prisma directly; no DAO checks request cookies; no UI is trusted to authorize media/publication or paid access.

**API success shape:** `{ data: T }`, and `{ data: T[], meta: { hasMore: boolean, nextCursor: string | null } }` for lists.

**API error shape:** `{ code: string, message: string, fieldErrors?: Record<string,string>, requestId: string }`. Stable codes include `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `ACCESS_REQUIRED`, `PAYMENT_REQUIRED`, `RATE_LIMITED`, `MEDIA_PROCESSING`, `VERSION_CONFLICT`. Do not leak existence of private objects when caller lacks discovery rights (404 where appropriate).

## 4. Cross-domain DTO conventions

- DTOs in docs 06–12 define meaning; `openapi.yaml` is their wire form under the same names without the `Dto` suffix (`ProgramSummaryDto` → `ProgramSummary`). Never return Prisma rows.
- Request `PATCH` uses optional keys; `undefined` unchanged, nullable fields use explicit `null` for clearing.
- UUIDs opaque strings; RFC3339 UTC instants; local date `YYYY-MM-DD`; timezone IANA; pagination `cursor`+`limit` capped (default 20, max 100).
- Every mutation checks ownership/role/access and returns either updated DTO or a typed success state.
- Immutable `Version` IDs are explicit on Program enrollments, schedule snapshot entries and any referenced Activity revision.
- **Idempotency:** every retried write (join, checkout, add calendar item, session action, reaction, comment, upload completion) carries an `idempotencyKey`. The service claims it in `IdempotencyKey` with a hash of the request before doing work. A replay with the same request returns the stored result; the same key with a different request is a `CONFLICT`; a concurrent duplicate waits on the claim. Payments are protected three ways: idempotency keys on checkout, unique provider IDs on purchases and subscriptions, and webhook deduplication by provider event ID in `BillingEvent`.
- **Concurrency:** drafts, sessions, and calendar items use optimistic guards (`expectedRevision` or `expectedUpdatedAt`); a stale write is a `VERSION_CONFLICT`, never a silent overwrite.
- Optimistic updates only for reversible, low-risk changes (toggle reaction); completion and paid access display confirmed server state.

## 5. DAO / service transaction rules

- DAO methods accept a `Db` / Prisma transaction client; they do not each open their own transaction on composite operations.
- Registration creates identity+profile+preferences+auth in one transaction.
- Publish validates snapshot, rights, references, visibility/access, increments version atomically.
- Program join validates access, creates Enrollment/AccessGrant and the first horizon of planned Calendar Items atomically, with idempotent result; the worker extends the horizon later.
- Follow approval creates accepted relationship and resolves request atomically.
- Group invite acceptance creates membership and allowed calendar linkage without leaking others' private data.
- Session `Start/Pause/Resume/Finish` uses an optimistic revision guard to prevent double-finish or double-counted time.
- Media publish attaches only READY/licensed asset; writes audit record; removal from public discovery invalidates CDN/public tokens.

## 6. Authoritative security gates

| Action | Required server checks |
|---|---|
| View public Program preview | published, visible, not moderated; preview-safe fields only |
| View full program | owner or valid AccessGrant/OPEN + enrollment policy; object visibility |
| Edit Program or Activity | original creator or authorized editor; personal copy otherwise |
| Publish Program/Activity | active user (email verification not required), policy, content validation, rights to public media |
| Publish with PAID access | above + ACTIVE Creator Payout Account + marketplace flag enabled |
| Moderate | `MODERATOR` or `ADMIN` role via `adminAuth`-style security handler |
| Read personal Session/Entry | owner or explicitly scoped sharing policy |
| View group statuses and group media | ACTIVE group membership + specific occurrence access |
| View private media | authorized owner/recipient audience; short-lived signed URL |
| React/comment | authenticated, content visible, not suspended/rate-limited |
| Acquire paid grant | verified provider webhook/ledger, never client assertion |

`ProfileVisibility` is not a blanket permission for all content; `MediaAsset` ownership and publication audience are separate. Do not expose raw object storage URLs/keys in DTOs.

## 7. API namespaces

`packages/api-spec/openapi.yaml` is the authoritative list of routes.

```text
/auth/*, /users/:handle, /users/me/*, /follow-users/:userId, /blocked-users/:userId
/catalog/categories, /catalog/program-types, /catalog/focuses, /catalog/metrics, /catalog/tools
/programs, /programs/:id, /programs/:id/draft/*, /programs/:id/publish, /programs/:id/prices
/programs/:id/enrollments, /programs/:id/checkout, /enrollments/:id
/activities, /activities/:id, /activities/:id/copy, /activities/:id/publish
/calendar/items, /calendar/recurrences, /calendar-items/:id, /sessions/:id/*
/groups, /groups/:id/invitations, /group-invitations/:token, /completion-shares/:id/reactions
/media/*, /media-attachments, /media-publications/:id/*, /media-comments/:id
/discover, /notifications, /email/unsubscribe, /achievements, /reports, /moderation/*
/billing/payout-account, /billing/subscriptions, /billing/webhooks/stripe
```

UI routes remain sparse (`/`, `/programs/:id`, `/activities/:id`, `/u/:handle`) and use route-aware panels rather than pages for every API resource.

## 8. Database strategy / schema decisions

Schema changes go through `prisma migrate`; hand-written SQL in migrations adds the CHECK constraints Prisma cannot express. Under MySQL 8, a column used in a CHECK cannot have a CASCADE or SET NULL foreign-key action, so those FKs use `Restrict`/`NoAction`. Partial uniqueness (for example one active enrollment) uses a nullable key column maintained by the service with a normal unique index.

Use relational tables for identity, ownership, enrollments, schedules, sessions, metrics and published media. JSON permitted only for **validated declarative configuration** (`MetricDefinition.validation`, `ToolDefinition.config`, layout/storage technical metadata), never an unvalidated object blob to bypass schema. MySQL unique constraints protect handle/email, program version numbers, enrollments, group membership, event idempotency, reaction uniqueness.

For polymorphic media links choose a typed attachment join (`MediaAttachment` with **one target FK among Program, ActivityRevision, Instruction, ResultEntry, Profile**, enforced by service plus DB CHECK under MySQL 8) or purpose-specific joins if ORM friction is high. Do not use `targetType`+`targetId` without referential integrity unless thoroughly justified. The Media domain owns the final definition.

Persist both `ActivityId` (canonical relationship) and `ActivityRevisionId` (display/history stability) on scheduled placements. Track source attribution through `sourceActivityId` and moderated `canonicalActivityId` so public cross-program aggregation is safe and deterministic.

## 9. Calendar/time model

- Template: one placement row per Activity per `relativeDay`, local time optional, ordered by `position`; date-free content. Finite Programs store every placement. Ongoing Programs store one repeating cycle (`cycleDays`).
- User: `localDate` and optional local time within IANA user zone; derive `scheduledAtUtc` for notifications/order; DST ambiguous/nonexistent times handled by explicit policy with tests.
- Schedule materialization: bounded 12-week future horizon, deterministic idempotency keys; the worker extends it daily; never explode infinite ongoing recurrence into rows. Program enrollments and personal Calendar Recurrences share this mechanism.
- Personal move/skip is an override on an occurrence, not mutation of template.
- Group occurrences use a stable key derived from Program Version, schedule item, and cycle index, so SYNC and ASYNC members map to the same occurrence even when their dates differ.

## 10. Media pipeline / performance

Browser requests upload authorization → storage signed PUT/multipart → completion callback verifies size/type/hash → worker runs ffmpeg probe, H.264 MP4 transcode (browsers record different formats), poster and thumbnail → READY variants → attach/publish. Public and private signed delivery policies are distinct; protect original files. Rate/size/duration limits, malware scanning, EXIF stripping for public photos, safe MIME inspection, capture permissions, caption availability, storage quotas, and deletion retention are required from early implementation.

Use lazy thumb loading, pagination, poster frame for video, HTTP range for playback, caching of static seeded assets; do not mount dozens of video players in a grid. Views count via deduplicated eligible viewing events, not impressions/thumbnail renders.

## 11. Events, notifications, reminders

Events such as `SessionFinished`, `CompletionShared`, `CompletionReacted`, `GroupMediaCommented`, `FollowRequestReceived`, `MediaPublicationModerated`, `ProgramAccessGranted`, and `AchievementEarned` enter a transactional outbox table in the same transaction as the change. The worker process polls it with `FOR UPDATE SKIP LOCKED`; no Redis or external queue in P1. The worker delivers each event at least once, so consumers are idempotent. Notification service resolves audience and deep link; delivery is in-app. No realtime transport in P1: the client refetches on focus and after mutations.

**Reminders:** the worker runs a periodic scan. It creates an in-app reminder when a timed Calendar Item comes due, and a daily in-app summary and optional email at each user's chosen local time. `ReminderDispatch` is unique per user, local date, and channel, so restarts do not double-send. Email goes through a replaceable `EmailProvider` (also used for verification, password reset, and invites).

No notification for one's own action; allow mute per group; quiet hours respect timezone.

## 12. Billing and entitlements

Keep these separate: `ProgramEnrollment` (participation), `ProgramAccessGrant` (entitlement), `ProgramPurchase` and `BillingSubscription` (financial instruments). Provider: Stripe Connect with hosted Checkout and hosted onboarding; the configuration is recorded in `docs/adr/0001-billing-stripe-connect.md`. Webhooks are the only way a financial event creates or changes a grant; the client is never trusted. Every webhook is stored in `BillingEvent`, deduplicated by provider event ID, and processed idempotently.

| Provider event | Effect |
|---|---|
| One-time payment succeeded | Purchase `PAID`; grant with no expiry |
| Subscription paid or renewed | Subscription `ACTIVE`; grant `expiresAt` = period end plus a short grace window |
| Subscription canceled or unpaid at period end | Grant expires; Calendar Items and results stay; full content locks |
| Refund or lost dispute | Purchase updated; grant revoked; history stays |
| Payout account updated | Payout account status updated; paid publishing allowed only when `ACTIVE` |

Refund, tax, receipt, and support policies must exist before `MARKETPLACE_ENABLED` is turned on in production. While the flag is off, PAID is shown as disabled, and P1 validates locking through OPEN/APPROVAL/manual admin grants. See the access matrix in `07-PROGRAMS.md`.

## 13. Test pyramid and P1 release gates

1. **Unit:** taxonomy resolver, schedule expansion, typed metric validation/aggregation, state machines, audience policy, media selection/sort.
2. **DAO/DB integration:** FKs, uniqueness, transactions, idempotency, cascade/archive, data migration, MySQL collation.
3. **API authorization:** owner vs collaborator vs follower vs anonymous for each public/private/unlisted object; signed media; locked preview; blocked account.
4. **UI component:** Program Workspace locked rows, Activity row order, picker return path, keyboard and touch, autosave conflicts, media capture denial.
5. **Browser E2E:** the five required tests in `01-PRODUCT.md` §6, plus third-account denial of private and group content.
6. **Ops:** migration on fresh DB, seed determinism, storage purge/retention, event retry, upload failure, large library pagination, session resume after crash.

## 14. Development sequencing

Contract, identity, taxonomy → seeded Activity/Instruction/metrics and platform media → Program draft/workspace/automatic schedule/copy/publish, with upload → personal Calendar, standalone and recurring entries, Activity occurrence/session/results, reminders, achievements → groups, shared completion, reactions, group media comments → discovery, profiles, ranking, moderation → purchases, subscriptions, payouts. Deliver thin vertical slices and use seeded demonstration accounts/assets.

## 15. Implementation decisions

Password hashing: bcrypt cost 12. Sessions: server-side `Session` rows storing a hash of the token. Storage: Cloudflare R2. Queue: database outbox. Recurrence: simple structured rule evaluated in-house, no RRULE library. Email: replaceable provider, Resend by default. Checkout: Stripe. Record any change or the Stripe Connect configuration in a short ADR under `docs/adr/`. Do not make UI behavior depend on provider internals.
