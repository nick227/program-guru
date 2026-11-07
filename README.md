# Programs App

A personal weekly calendar for following structured programs, a guided authoring workspace, and a creator marketplace.

Requirements: [`docs/specs/`](docs/specs/). Project state and deviations: [`CLAUDE.md`](CLAUDE.md).

## Status

Phase 1 (contract) is complete: database schema, API spec, and generated SDK types. The server and web app are not built yet, so `pnpm dev` has nothing to run.

## Setup

1. `cp .env.example .env` (points at a local database on localhost)
2. `pnpm install`
3. `pnpm --filter @project/db generate`
4. `pnpm db:deploy`

## Database commands

| Command | Where | What it does |
|---|---|---|
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
