# Database Bootstrap

One unified, idempotent database bootstrap system initializes and synchronizes any database (local or Railway/production) from the same declarative taxonomy and modular content packs (`packages/db/prisma/seed/`).

## Commands

| Command | Purpose |
|---|---|
| `pnpm db:bootstrap` | Run `prisma migrate deploy`, validate content & media checksums, upload platform media to configured storage (`local` or `r2`), upsert managed taxonomy/programs/activities/definitions, archive retired platform seeds, and verify DB consistency. |
| `pnpm db:bootstrap -- --fixtures=demo` | Same as above, plus opt-in demo fixtures (`admin-dev@test.local`, `alex`, `sam`, sample `Morning Core Crew` group, enrollments, and initial calendar items). Refused when `NODE_ENV=production`. |
| `pnpm db:bootstrap:check` | Read-only validation: verifies taxonomy, content pack references, `manifest.json` asset SHA-256 checksums, database connectivity, migration status, and consistency checks without writing anything. |
| `pnpm db:bootstrap:reset` | Local-only destructive reset (guarded by `db-guard.ts` + `assertLocalResetAllowed`): drops and rebuilds a disposable localhost database cleanly. |

## Environment Differences

Environment differences are strictly limited to:
- `DATABASE_URL` (MySQL connection string)
- Storage settings (`STORAGE_PROVIDER=local` + `STORAGE_DIR`, or `STORAGE_PROVIDER=r2` + `S3_ENDPOINT` / `R2_ACCOUNT_ID`, `S3_REGION`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`)
- Fixture opt-in (`--fixtures=demo` or `BOOTSTRAP_FIXTURES=demo`; never enabled in production)

## Managed vs. User Records

- **Managed platform records** (`creatorId: null`, `ownerId: null`, `createdById: null`) use deterministic UUIDs and are updated idempotently by `pnpm db:bootstrap`. Retired platform seed slugs are archived (`status: 'ARCHIVED'`) rather than deleted so participant enrollments and history stay intact.
- **User-generated records** (`creatorId !== null` / `ownerId !== null`) are never modified or removed by bootstrap.

## Railway / Production Execution

In Railway, `.railway/railway.ts` runs `pnpm db:deploy && pnpm --filter server bootstrap:prod` (which delegates to the exact same `bootstrapDatabase` engine). To run the unified CLI directly against Railway's environment variables (without demo fixtures):

```bash
NODE_ENV=production pnpm db:bootstrap
```

Or to verify consistency before/after a deploy without mutations:

```bash
pnpm db:bootstrap:check
```

