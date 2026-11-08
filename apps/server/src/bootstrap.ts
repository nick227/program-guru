// Production bootstrap (pre-deploy, after `pnpm db:deploy`): verifies every committed migration is
// applied, then publishes platform media to the configured storage (R2 in production) and upserts the
// platform catalog. Idempotent and non-destructive: safe on every deploy. Creates no users.
import { readdirSync } from 'fs'
import { join } from 'path'
import { Readable } from 'stream'
import { db, seedDatabase } from '@project/db'
import { repoRoot, type PlatformMediaSink } from '@project/db/prisma/platform-media'
import { isStorageMiss, storage } from './infrastructure/storage'
import { assertProductionConfig } from './lib/config'

async function assertMigrated() {
  const expected = readdirSync(join(repoRoot(), 'packages/db/prisma/migrations'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
  const rows = await db.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`.catch(() => {
    throw new Error('No migration history in this database: run pnpm db:deploy before bootstrap')
  })
  const applied = new Set(rows.map((r) => r.migration_name))
  const missing = expected.filter((m) => !applied.has(m))
  if (missing.length) throw new Error(`Migrations not applied (run pnpm db:deploy first): ${missing.join(', ')}`)
  return expected.length
}

export const storageSink = (): PlatformMediaSink => {
  const s = storage()
  return {
    name: `storage:${s.kind}`,
    async size(key) {
      try {
        return await s.size(key)
      } catch (err) {
        if (isStorageMiss(err)) return null
        throw err
      }
    },
    async put(key, bytes) {
      await s.write(key, Readable.from(bytes), bytes.length)
    },
  }
}

async function main() {
  assertProductionConfig('bootstrap')
  const started = Date.now()
  const migrations = await assertMigrated()
  const summary = await seedDatabase(db, { sink: storageSink() })
  console.log(JSON.stringify({ bootstrap: 'ok', migrations, storage: storage().kind, ...summary, ms: Date.now() - started }))
}

main()
  .catch((err) => {
    console.error('[bootstrap] failed:', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
