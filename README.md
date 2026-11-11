# Programs App

A personal weekly calendar for following structured programs, a guided authoring workspace, and a creator marketplace.

Requirements: [`docs/specs/`](docs/specs/). Project state and deviations: [`CLAUDE.md`](CLAUDE.md).

## Status

- **Phase 1 (Contract):** Complete (`packages/db/prisma/schema.prisma` with 59 models, `0001_init` migration with MySQL CHECK constraints, `packages/api-spec/openapi.yaml` with 148 operations, and generated SDK types in `packages/sdk`).
- **Phase 2 (API Server & Seed Data):** Core API server (`apps/server`) is implemented and hardened across 138 of 148 OpenAPI operations (`system`, `auth`, `users`, `catalog`, `activities`, `programs`, `calendar`, `sessions`, `groups`, `media`, `social`, `notifications`, `moderation`). The 10 `billing` operations (`createPayoutOnboardingLink`, `getMyPayoutAccount`, `createCheckoutSession`, `listMyPurchases`, `listMySubscriptions`, `cancelSubscription`, `createBillingPortalSession`, `listCreatorEarnings`, `listCreatorSales`, `handleStripeWebhook`) remain intentionally deferred until after the core experience per `01-PRODUCT.md` §3.
- **Seed Library (`packages/db/prisma/seed/`):** Deterministic, idempotent catalog and bootstrap system (`docs/database-bootstrap.md`) populating 6 Categories, 20 Focuses, 17 ProgramTypes, 10 Tags, 11 MetricDefinitions, 6 ToolDefinitions, 7 AchievementDefinitions, 25 curated Activities (with instructions, metrics, tools, schedules, and rights-cleared CC0-1.0 platform media assets), and 5 published Starter Programs.
- **Pending Services:** Background worker (`apps/worker`) for outbox dispatch, media variant transcoding, horizon extension, and daily reminder emails; Stripe Connect billing handlers.

## Setup

1. `pnpm install`
2. `pnpm db:local:setup` installs an isolated MySQL 8.4.13 on 127.0.0.1:3307 (no sudo, no Docker), creates the `programs_app` user and databases, and writes `.env`
3. `pnpm db:local:autostart` starts it with your WSL session (optional)
4. `pnpm --filter @project/db generate && pnpm db:bootstrap -- --fixtures=demo`

## Database commands

| Command | Where | What it does |
|---|---|---|
| `pnpm db:local:start` / `stop` / `status` | Local | Control the local MySQL |
| `pnpm db:bootstrap` | Anywhere, including Railway | Migrates (`prisma migrate deploy`), validates assets, syncs catalog & media |
| `pnpm db:bootstrap -- --fixtures=demo` | Local only | Same as `db:bootstrap`, plus opt-in demo users, group & sample participation |
| `pnpm db:bootstrap:check` | Anywhere | Read-only validation of content pack, asset checksums, migrations & DB consistency |
| `pnpm db:bootstrap:reset` | Local only | Drops, migrates, and rebuilds a disposable local database |
| `pnpm db:deploy` | Anywhere, including Railway | Applies committed migrations. Never resets or drops data |
| `pnpm db:status` | Anywhere | Shows which migrations are applied |
| `pnpm db:migrate` | Local only | Creates a new migration from schema changes |
| `pnpm db:seed` | Local only | Legacy seed alias (catalog + local dev admin) |
| `pnpm db:reset` | Local only | Drops and rebuilds the local database |
| `pnpm db:studio` | Local only | Opens Prisma Studio |

Local-only commands refuse to run unless `DATABASE_URL` points at localhost.

## Default development account

`pnpm db:seed` creates (or restores) one local admin account:

| Email | Password | Role |
|---|---|---|
| `admin-dev@test.local` | `admin dev password` | ADMIN (`/admin`) |

It exists only in local databases. Production bootstrap never creates it, and `db:seed` refuses any non-localhost database. Real admins are promoted from existing accounts with `pnpm --filter server admin grant <email>` (`admin:prod` on Railway).

## Deployment (Railway)

- `railway.json` runs `pnpm db:deploy` before each release starts.
- On the server service, set `DATABASE_URL=${{MySQL.MYSQL_URL}}`.
- Deploy with `pnpm release` (pushes to the connected branch).

## Other commands

| Command | Description |
|---|---|
| `pnpm sdk:generate` | Regenerate SDK types from the OpenAPI spec |
| `pnpm sdk:check` | Fail if committed types have drifted from the spec |
| `pnpm spec:lint` | Lint the OpenAPI spec |
| `pnpm typecheck` | TypeScript check all packages |
