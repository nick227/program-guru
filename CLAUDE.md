# Project State

Goal-oriented platform: a personal weekly calendar for following structured Programs, a Program authoring workspace, and a creator marketplace. Product name: Program Guru.

**Requirements live only in `docs/specs/01–13`.** `schema.prisma` and `openapi.yaml` implement them and must not contradict them. Change the spec first.

## MVP

**What it does:** People follow structured programs on a personal weekly calendar, and anyone can author, publish, and sell them from a reusable activity library.

**Users:** one account type that can participate, create, and collaborate, plus MODERATOR/ADMIN for platform moderation. No creator role.

**In V1:** auth with handles and combined public profiles; seeded library by Category and Focus (rights-cleared illustrations, selected demonstration videos); copy-on-customize; Program authoring with automatic scheduling and manual adjustment; weekly calendar; standalone Activities and recurring personal entries; independent per-Activity sessions and results; camera recording and upload; groups with three invite paths, shared completion, completion reactions, group media comments; follows, discovery, likes on public media; in-app notifications and optional daily email reminders; achievements derived from actual completions; reporting and moderation; one-time purchases and monthly Program subscriptions, after the core experience.

**Parking lot (V2+):** general chat and direct messages, live video, public media comments, web push, Apple login, capture presets and trimming, community media reuse library, creator-wide plans, multi-currency, calendar sync, AI coaching.

**Assumptions:** USD only. Moderation is a report queue and audited actions. Stripe Connect configuration is decided in an ADR before billing is built.

**Locked, do not reinterpret:** Program Workspace layout (`03-UX.md` §4), locked Activity row order with one Related Media section (`03-UX.md` §6; My Metrics now lives in Today's Results), calendar-first with no primary navigation (`03-UX.md` §2).

## Stack

Factory defaults: pnpm monorepo, Vite + React + Tailwind, Fastify routed from OpenAPI via `fastify-openapi-glue`, `openapi-fetch` SDK with React Query hooks, Prisma + MySQL 8. Deploy: Railway (API, worker, DB) via `.railway/railway.ts` (IaC; `railway.json` is deprecated) and Vercel (web) on sibling subdomains. Storage: Cloudflare R2. Release state and P0s: `docs/release/poc-release-checklist.md`.

## Phase Completed

Phase 2 — Server, worker, billing: complete and gated (2026-11-07). Phase 3 (frontend) is next. An earlier session started `apps/web` ahead of the Phase 2 gate; see `docs/frontend-foundation.md`.

## Modules Built

- [x] Schema: 62 models, migrations `0001_init` and `0002_rate_limit_bucket`, 4 CHECK constraints, 2 FULLTEXT indexes, verified on MySQL 8.4.13
- [x] OpenAPI: 148 operations across 14 tags; SDK types generated
- [x] Server (`apps/server`): **148 of 148 operations implemented**
- [x] Worker (`apps/server/src/worker.ts`, a second process from the same build): outbox delivery, ffmpeg media pipeline, email, timed reminders and daily summaries, calendar horizons, ranking statistics, cleanup
- [x] Billing: Stripe Connect per `docs/adr/0001-billing-stripe-connect.md`, behind `MARKETPLACE_ENABLED` (default off)
- [x] Seed data (`packages/db/prisma/seed.ts`): 6 Categories, 20 Focuses, 17 ProgramTypes, 11 metrics, 6 tools, 7 achievements, 81 Activities with CC0 platform media, 5 starter Programs
- [x] Tests: 227 passing against `programs_app_test`, including all five required end-to-end tests (`01-PRODUCT.md` §6) at the API level and a contract case for every operationId (`__tests__/helpers/contract.ts`)
- [ ] Frontend (`apps/web`) and SDK domain hooks: partial (earlier session)

## Running

| Process | Local | Railway |
|---|---|---|
| API | `pnpm --filter server dev` (port 3001) | `pnpm --filter server start` (esbuild bundle `dist/index.js`; pre-deploy `pnpm db:deploy && pnpm --filter server bootstrap:prod`) |
| Worker | `pnpm --filter server worker` | separate service, `pnpm --filter server start:worker`, same build and env, `RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg` |
| Web | `pnpm --filter web dev` (port 5173) | Vercel |

The worker is safe to run as several copies (outbox claims use `FOR UPDATE SKIP LOCKED`; reminders claim `ReminderDispatch`). It needs `ffmpeg` and `ffprobe` on the PATH.

## Contract Notes for Frontend / SDK

1. **Locked occurrences:** when an entitlement for a PAID or APPROVAL Program lapses or is revoked, `occurrence.item.locked` is `true`; instructional content (`instructions`, `tools`, instruction-scoped metrics) is withheld, while the user's own session, recorded values, stats, and media remain.
2. **Idempotency keys** (`minLength: 8`) on join, checkout, add calendar item, sessions, reactions, and comments: a replay returns the original result; reusing a key with a different payload is `409 CONFLICT`.
3. **Media attachment purposes:** `COVER | DEMONSTRATION | ILLUSTRATION | JOURNAL | AVATAR | OTHER`. Attaching never changes who can see an asset.
4. **Uploads:** `POST /media/uploads` → `PUT uploadUrl` (local: the API's `/media/uploads/{id}/content?token=`; R2: a presigned URL) → `POST /media/uploads/{id}/complete` → the worker makes it `READY`. Until then `GET /media/{id}/url` is `400`. User photos are always served as the re-encoded, metadata-free rendition.
5. **Checkout:** `POST /programs/{id}/checkout` returns a Stripe-hosted `checkoutUrl`. Returning from Checkout proves nothing: poll the preview or enrollment until `viewerAccess` becomes `GRANTED` (set only by a verified webhook). `getProgramPublishCheck.marketplaceEnabled` and `ProgramPreview.canPurchase` say whether paid access is available.

## Deviations from Factory Defaults

| Area | Default | This project | Why |
|---|---|---|---|
| Schema changes | `prisma db push` | `prisma migrate`; `pnpm db:deploy` in bootstrap and CI | Hand-written CHECKs, and money tables need a history |
| IDs | cuid | UUID `Char(36)` | `02-DOMAIN.md` §7 |
| Error shape | `{error, code?}` | `{code, message, fieldErrors?, requestId}` | `05-ARCHITECTURE.md` §3. **Patch the template error handler in Phase 2** |
| Auth models | `passwordHash`, `username`, `suspendedAt` on User; raw token | `LocalCredential`, `handle`, `UserStatus`; hashed `Session.tokenHash` | `06-USERS.md`. **Adapt `AuthService`, `security.ts`, seed in Phase 2**. `useAuth.ts` already adapted |
| Cookies | `SameSite=None` in production | `SameSite=Lax` on sibling subdomains | CSRF. Needs a custom domain before deploy |
| Server layout | `services/` | `handlers/` then `domains/*/{service,dao,mapper}` | Transactions share a DB client |
| adminAuth | ADMIN only | MODERATOR or ADMIN | `12-SOCIAL.md` |
| UI | `Shell`, `Card` | No `Shell` or `Card`; `Page/Stage/Panel/Row/Grid/Stack` plus the shared visual patterns in `04-UI.md` §4a | `03-UX.md` §2, `04-UI.md` |
| Page generator | Stubs for every operation | Auth and routing only: **extend `SKIP_OP_IDS` before running** or it emits 100+ wrong pages | Sparse routes |
| Plugins | Catalog | Custom: Stripe, email, signed upload + ffmpeg worker, rate limiting. `file-upload` is reference only | Not in the factory catalog |

## Phase 2 Notes

- Public routes with `security: []` resolve an optional viewer from the cookie themselves. `me` must stay a reserved handle.
- Fastify serializes from the response schema: undeclared fields are dropped, required ones must exist.
- JSON bodies keep their raw text (`request.rawBody`) for Stripe signatures. Binary bodies (local uploads) skip schema validation; the handler enforces size, token, and type.
- Rate limiting is database-backed (`RateLimitBucket`) so it holds across replicas; the Stripe webhook route is exempt.
- `pnpm lint` passes vacuously: no package has a lint script yet. Add ESLint before the Phase 5 gate.

## Database

- **MySQL 8.4.13 everywhere.** Railway's MySQL template uses `image: mysql:8`, which resolves to 8.4.13 (same Docker digest, checked 2026-11-07). CI pins `mysql:8.4.13`. Local runs the same release.
- **Local MySQL** is user-level, from `scripts/local-mysql.sh` (no sudo, no Docker): binaries in `~/.local/opt/mysql-8.4.13`, data in `~/.local/share/programs-app-mysql`, `127.0.0.1:3307`, systemd user service `programs-app-mysql` (enabled). Same start flags as Railway's template. Root credentials: `~/.local/share/programs-app-mysql/root.cnf` (0600). App user `programs_app` can reach only `programs_app_dev`, `programs_app_shadow`, `programs_app_test`. `pnpm db:local:setup` rebuilds all of this idempotently and writes the URLs into `.env`.
- **Never touch MariaDB.** The system MariaDB 10.11 on 3306 holds ~20 other projects' databases. Ubuntu's `mysql-server` package conflicts with it; that is why local MySQL is user-level.
- **One schema, one migration history** for every environment. Author migrations locally with `pnpm db:migrate`; everything else runs only `pnpm db:deploy` (`prisma migrate deploy`), which never resets or drops data.
- **Railway:** `.railway/railway.ts` runs `pnpm db:deploy` (both services) and the idempotent `bootstrap:prod` (API) before start; `DATABASE_URL` references `MySQL.MYSQL_URL`. Production processes refuse to start on missing or weak config (`apps/server/src/lib/config.ts`).
- **Platform media** is committed under `packages/db/prisma/platform-assets/` (CC0 title cards plus a checksummed manifest); regenerate with `pnpm --filter @project/db assets:generate`. Seed and bootstrap publish it through the storage layer.
- **Guard:** `db:migrate`, `db:seed`, `db:reset`, `db:studio` go through `scripts/db-guard.ts` and refuse any host but localhost, `NODE_ENV=production`, or a Railway environment.
- **Verified on MySQL 8.4.13:** `0001_init` applies cleanly; all 4 CHECKs reject invalid rows; `prisma migrate dev` generates an empty migration (no drift). `prisma migrate diff --from-migrations` falsely lists the two FULLTEXT indexes; ignore that tool's output for them. A full rebuild takes ~30s.
- A column in a CHECK cannot have a CASCADE or SET NULL foreign key on MySQL; those relations declare `Restrict`.

## Last Session Summary

Completed Phase 2. Built the worker (outbox delivery with scrubbing of tokens and invitee addresses, ffmpeg pipeline that strips metadata including GPS, Resend/capture email, reminders, horizons, stats, cleanup). Wrote ADR 0001 and implemented billing with Stripe Connect (Accounts v2 recipients, destination charges, webhook-only fulfillment, refunds, disputes, lapse) behind `MARKETPLACE_ENABLED`. Added the required private-media and paid-access tests and a contract case for every operation; `pnpm test:generate` adds nothing. Committed an earlier session's uncommitted database-backed rate limiting separately (it adds the 62nd model).
