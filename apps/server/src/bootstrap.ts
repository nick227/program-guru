// Production bootstrap (pre-deploy, after `pnpm db:deploy`): delegates to the single unified
// `bootstrapDatabase` engine with the configured storage sink and no demo fixtures.
import { Readable } from 'stream'
import { bootstrapDatabase, db } from '@project/db'
import { type PlatformMediaSink } from '@project/db/prisma/platform-media'
import { isStorageMiss, storage } from './infrastructure/storage'
import { assertProductionConfig } from './lib/config'

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
  const summary = await bootstrapDatabase({
    prisma: db,
    sink: storageSink(),
    mode: 'sync',
    fixtures: 'none',
    skipMigrate: true,
  })
  console.log(JSON.stringify({ bootstrap: 'ok', ...summary, ms: Date.now() - started }))
}

main()
  .catch((err) => {
    console.error('[bootstrap] failed:', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
