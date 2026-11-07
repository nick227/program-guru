# Project State

Goal-oriented platform: a personal weekly calendar for following structured Programs, a Program authoring workspace, and a creator marketplace. Working name: Programs App.

**Requirements live only in `docs/specs/01–13`.** `schema.prisma` and `openapi.yaml` implement them and must not contradict them. Change the spec first.

## MVP

**What it does:** People follow structured programs on a personal weekly calendar, and anyone can author, publish, and sell them from a reusable activity library.

**Users:** one account type that can participate, create, and collaborate, plus MODERATOR/ADMIN for platform moderation. No creator role.

**In V1:** auth with handles and combined public profiles; seeded library by Category and Focus (rights-cleared illustrations, selected demonstration videos); copy-on-customize; Program authoring with automatic scheduling and manual adjustment; weekly calendar; standalone Activities and recurring personal entries; independent per-Activity sessions and results; camera recording and upload; groups with three invite paths, shared completion, completion reactions, group media comments; follows, discovery, likes on public media; in-app notifications and optional daily email reminders; achievements derived from actual completions; reporting and moderation; one-time purchases and monthly Program subscriptions, after the core experience.

**Parking lot (V2+):** general chat and direct messages, live video, public media comments, web push, Apple login, capture presets and trimming, community media reuse library, creator-wide plans, multi-currency, calendar sync, AI coaching.

**Assumptions:** USD only. Moderation is a report queue and audited actions. Stripe Connect configuration is decided in an ADR before billing is built.

**Locked, do not reinterpret:** Program Workspace layout (`03-UX.md` §4), nine-row Activity page (`03-UX.md` §6), calendar-first with no primary navigation (`03-UX.md` §2).

## Stack

Factory defaults: pnpm monorepo, Vite + React + Tailwind, Fastify routed from OpenAPI via `fastify-openapi-glue`, `openapi-fetch` SDK with React Query hooks, Prisma + MySQL 8. Deploy: Railway (API, worker, DB) and Vercel (web) on sibling subdomains. Storage: Cloudflare R2.

## Phase Completed

Phase 1 — Contract. Next: Phase 2 — Server.

## Modules Built

- [x] Schema: 67 models, initial migration with CHECK constraints
- [x] Railway pre-deploy migration config and guarded database scripts
- [x] OpenAPI: 155 operations; SDK types generated
- [ ] Server, worker, frontend, seed content: not started

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
| UI | `Shell`, `Card` | No `Shell` or `Card`; `Page/Stage/Panel/Row/Grid/Stack` | `03-UX.md` §2, `04-UI.md` |
| Page generator | Stubs for every operation | Auth and routing only: **extend `SKIP_OP_IDS` before running** or it emits 100+ wrong pages | Sparse routes |
| Plugins | Catalog | Custom: Stripe, email, signed upload + ffmpeg worker, rate limiting. `file-upload` is reference only | Not in the factory catalog |

## Phase 2 Notes

- Public routes with `security: []` resolve an optional viewer from the cookie themselves. `me` must stay a reserved handle.
- Fastify serializes from the response schema, so undeclared fields are dropped and required ones must exist. Register the error handler before glue, or validation errors fail serialization.
- `handleStripeWebhook` needs the raw body for signature verification.
- `fastify-openapi-glue` warns that `service` is deprecated in favor of `serviceHandlers`.

## Database

- **One schema, one migration history** (`packages/db/prisma`) for every environment. Migrations are authored locally with `pnpm db:migrate` and committed; every other environment only runs `pnpm db:deploy` (`prisma migrate deploy`), which never resets or drops data.
- **Railway:** `railway.json` runs `pnpm db:deploy` as the pre-deploy command, before the new release starts. The server service sets `DATABASE_URL=${{MySQL.MYSQL_URL}}`. Railway's stock MySQL template runs **MySQL 9.4**, not 8.
- **Local:** `.env` points at localhost only. `db:migrate`, `db:seed`, `db:reset`, and `db:studio` go through `scripts/db-guard.ts`, which refuses any host other than localhost, `NODE_ENV=production`, or a Railway environment.
- **Local MySQL is not set up yet.** This machine runs MariaDB 10.11 on port 3306 holding about 20 other projects' databases; it must not be modified. Native MySQL conflicts with it (see Last Session Summary).
- Migration `0001_init` is verified on MariaDB 10.11 only. Do not author migrations against MariaDB: it reports JSON columns and full-text indexes as drift.
- A column in a CHECK cannot have a CASCADE or SET NULL foreign key on MySQL; those relations declare `Restrict`.

## Last Session Summary

Merged the addendum, the follow-up adjustments, and `13-PROFILES-AND-EXPERIENCE.md` into one authoritative spec set. Phase 1 contract complete and committed. Added Railway pre-deploy migrations and guarded database scripts.

**Blocked before Phase 2:** local MySQL. Ubuntu's `mysql-server-8.0` package conflicts with the installed `mariadb-server` (both provide `virtual-mysql-server`, share `/var/lib/mysql`, `/etc/mysql`, the `mysql` service name and port 3306), and installing it would remove MariaDB. Pending decision: run a user-level MySQL alongside MariaDB on port 3307, matching Railway's version. Also pending: whether to apply the P1 scope simplifications from the review.
