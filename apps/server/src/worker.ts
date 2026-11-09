// Background worker entry point: a separate process (a second Railway service) built from the same
// package as the API so it shares domain code and the Prisma client. Safe to run several copies.
import { execFileSync } from 'child_process'
import { db } from '@project/db'
import { storage } from './infrastructure/storage'
import { assertProductionConfig } from './lib/config'
import { drain } from './worker/outbox'
import { cleanup, dailySummaries, extendHorizons, programStats, timedReminders } from './worker/jobs'

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 5_000)
const MINUTE = 60_000
const HOUR = 60 * MINUTE

type Job = { name: string; everyMs: number; run: () => Promise<unknown>; last: number }
// Intervals are overridable (WORKER_<NAME>_EVERY_MS) so verification runs can exercise each job quickly.
const every = (name: string, fallback: number) => Number(process.env[`WORKER_${name.toUpperCase()}_EVERY_MS`] ?? fallback)
const jobs: Job[] = [
  { name: 'reminders', everyMs: every('reminders', MINUTE), run: async () => [await timedReminders(), await dailySummaries()], last: 0 },
  { name: 'horizons', everyMs: every('horizons', HOUR), run: extendHorizons, last: 0 },
  { name: 'stats', everyMs: every('stats', HOUR), run: programStats, last: 0 },
  { name: 'cleanup', everyMs: every('cleanup', 6 * HOUR), run: cleanup, last: 0 },
]

let stopping = false

async function tick() {
  await drain()
  const now = Date.now()
  for (const job of jobs) {
    if (now - job.last < job.everyMs) continue
    job.last = now
    try {
      await job.run()
    } catch (err) {
      console.error(`[worker] ${job.name} failed:`, err)
    }
  }
}

/**
 * Fail fast instead of leaving uploads stuck in PROCESSING: the media pipeline needs ffmpeg and
 * ffprobe, every job needs the database, and production needs R2 (storage() enforces that).
 */
async function preflight() {
  assertProductionConfig('worker')
  for (const bin of ['ffmpeg', 'ffprobe']) {
    try {
      execFileSync(bin, ['-version'], { stdio: 'ignore' })
    } catch {
      throw new Error(`${bin} is not on PATH (Railway: set RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg on the worker)`)
    }
  }
  await db.$queryRaw`SELECT 1`
  storage()
}

let wake: (() => void) | null = null

async function main() {
  await preflight()
  console.log(`[worker] started (storage: ${process.env.STORAGE_PROVIDER ?? 'local'}${process.env.STORAGE_DIR ? ` at ${process.env.STORAGE_DIR}` : ''})`)
  while (!stopping) {
    try {
      await tick()
    } catch (err) {
      console.error('[worker] tick failed:', err)
    }
    // A stop signal ends the wait at once, so dev watchers and deploys never force-kill.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, TICK_MS)
      wake = () => {
        clearTimeout(timer)
        resolve()
      }
    })
    wake = null
  }
  await db.$disconnect()
  console.log('[worker] stopped')
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true
    wake?.()
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
