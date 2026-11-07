# Programs App

A personal weekly calendar for following structured programs, a guided authoring workspace, and a creator marketplace.

Requirements: [`docs/specs/`](docs/specs/). Project state and deviations: [`CLAUDE.md`](CLAUDE.md).

## Status

- **Phase 1 (Contract):** Complete (`packages/db/prisma/schema.prisma` with 59 models, `0001_init` migration with MySQL CHECK constraints, `packages/api-spec/openapi.yaml` with 148 operations, and generated SDK types in `packages/sdk`).
- **Phase 2 (API Server & Seed Data):** Core API server (`apps/server`) is implemented and hardened across 138 of 148 OpenAPI operations (`system`, `auth`, `users`, `catalog`, `activities`, `programs`, `calendar`, `sessions`, `groups`, `media`, `social`, `notifications`, `moderation`). The 10 `billing` operations (`createPayoutOnboardingLink`, `getMyPayoutAccount`, `createCheckoutSession`, `listMyPurchases`, `listMySubscriptions`, `cancelSubscription`, `createBillingPortalSession`, `listCreatorEarnings`, `listCreatorSales`, `handleStripeWebhook`) remain intentionally deferred until after the core experience per `01-PRODUCT.md` §3.
- **Seed Library (`packages/db/prisma/seed.ts`):** Deterministic, idempotent seed script populating 6 Categories, 20 Focuses, 17 ProgramTypes, 11 MetricDefinitions, 6 ToolDefinitions, 7 AchievementDefinitions, 81 Activities (with instructions, metrics, tools, and rights-cleared CC0-1.0 platform media assets), and 5 published Starter Programs.
- **Pending Services:** Background worker (`apps/worker`) for outbox dispatch, media variant transcoding, horizon extension, and daily reminder emails; Stripe Connect billing handlers.

## Setup

1. `pnpm install`
2. `pnpm db:local:setup` installs an isolated MySQL 8.4.13 on 127.0.0.1:3307 (no sudo, no Docker), creates the `programs_app` user and databases, and writes `.env`
3. `pnpm db:local:autostart` starts it with your WSL session (optional)
4. `pnpm --filter @project/db generate && pnpm db:deploy`

## Database commands

| Command | Where | What it does |
|---|---|---|
| `pnpm db:local:start` / `stop` / `status` | Local | Control the local MySQL |
| `pnpm db:deploy` | Anywhere, including Railway | Applies committed migrations. Never resets or drops data |
| `pnpm db:status` | Anywhere | Shows which migrations are applied |
| `pnpm db:migrate` | Local only | Creates a new migration from schema changes |
| `pnpm db:seed` | Local only | Loads development data |
| `pnpm db:reset` | Local only | Drops and rebuilds the local database |
| `pnpm db:studio` | Local only | Opens Prisma Studio |

Local-only commands refuse to run unless `DATABASE_URL` points at localhost.

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
