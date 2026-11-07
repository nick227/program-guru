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

- [x] Schema: 61 models, initial migration with CHECK constraints, verified on MySQL 8.4.13
- [x] Railway pre-deploy migration config and guarded database scripts
- [x] OpenAPI: 146 operations; SDK types generated
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

- **MySQL 8.4.13 everywhere.** Railway's MySQL template uses `image: mysql:8`, which resolves to 8.4.13 (same Docker digest, checked 2026-11-07). CI pins `mysql:8.4.13`. Local runs the same release.
- **Local MySQL** is user-level, from `scripts/local-mysql.sh` (no sudo, no Docker): binaries in `~/.local/opt/mysql-8.4.13`, data in `~/.local/share/programs-app-mysql`, `127.0.0.1:3307`, systemd user service `programs-app-mysql` (enabled). Same start flags as Railway's template. Root credentials: `~/.local/share/programs-app-mysql/root.cnf` (0600). App user `programs_app` can reach only `programs_app_dev`, `programs_app_shadow`, `programs_app_test`. `pnpm db:local:setup` rebuilds all of this idempotently and writes the URLs into `.env`.
- **Never touch MariaDB.** The system MariaDB 10.11 on 3306 holds ~20 other projects' databases. Ubuntu's `mysql-server` package conflicts with it; that is why local MySQL is user-level.
- **One schema, one migration history** for every environment. Author migrations locally with `pnpm db:migrate`; everything else runs only `pnpm db:deploy` (`prisma migrate deploy`), which never resets or drops data.
- **Railway:** `railway.json` runs `pnpm db:deploy` as the pre-deploy command. The server service sets `DATABASE_URL=${{MySQL.MYSQL_URL}}`.
- **Guard:** `db:migrate`, `db:seed`, `db:reset`, `db:studio` go through `scripts/db-guard.ts` and refuse any host but localhost, `NODE_ENV=production`, or a Railway environment.
- **Verified on MySQL 8.4.13:** `0001_init` applies cleanly; all 4 CHECKs reject invalid rows; `prisma migrate dev` generates an empty migration (no drift). `prisma migrate diff --from-migrations` falsely lists the two FULLTEXT indexes; ignore that tool's output for them. A full rebuild takes ~30s.
- A column in a CHECK cannot have a CASCADE or SET NULL foreign key on MySQL; those relations declare `Restrict`.

## Last Session Summary

Revised Phase 1: applied approved simplifications (removed Calendar, SessionSegment, UploadSession, MediaContribution, ActivityTag/Link; GroupMember INVITED), strengthened IdempotencyKey (request hash, state, expiry), and reviewed overlapping operations one by one (155 → 146). Kept instruction-level metrics, Tools, user-defined taxonomy, Program copying. Installed isolated MySQL 8.4.13 and verified the migration on it. Phase 2 (server) started.
