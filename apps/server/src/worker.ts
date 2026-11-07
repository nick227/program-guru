// Background worker entry point: a separate process (a second Railway service) built from the same
// package as the API so it shares domain code and the Prisma client. Safe to run several copies.
import { db } from '@project/db'
import { drain } from './worker/outbox'
import { cleanup, dailySummaries, extendHorizons, programStats, timedReminders } from './worker/jobs'

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 5_000)
const MINUTE = 60_000
const HOUR = 60 * MINUTE

type Job = { name: string; everyMs: number; run: () => Promise<unknown>; last: number }
const jobs: Job[] = [
  { name: 'reminders', everyMs: MINUTE, run: async () => [await timedReminders(), await dailySummaries()], last: 0 },
  { name: 'horizons', everyMs: HOUR, run: extendHorizons, last: 0 },
  { name: 'stats', everyMs: HOUR, run: programStats, last: 0 },
  { name: 'cleanup', everyMs: 6 * HOUR, run: cleanup, last: 0 },
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

async function main() {
  console.log('[worker] started')
  while (!stopping) {
    try {
      await tick()
    } catch (err) {
      console.error('[worker] tick failed:', err)
    }
    await new Promise((r) => setTimeout(r, TICK_MS))
  }
  await db.$disconnect()
  console.log('[worker] stopped')
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
