# Programs App

A personal weekly calendar for following structured programs, a guided authoring workspace, and a creator marketplace.

Requirements: [`docs/specs/`](docs/specs/). Project state and deviations: [`CLAUDE.md`](CLAUDE.md).

## Status

Phase 1 (contract) is complete: database schema, API spec, and generated SDK types. The server and web app are not built yet, so `pnpm dev` has nothing to run.

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
