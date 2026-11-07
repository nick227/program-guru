// Empties every table before each test. Faster and safer than a hand-maintained FK-ordered list.
import { beforeEach, afterAll } from 'vitest'
import { db } from '@project/db'

let tables: string[] | null = null

beforeEach(async () => {
  tables ??= (
    await db.$queryRawUnsafe<{ t: string }[]>(
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> '_prisma_migrations'",
    )
  ).map((r) => r.t)
  await db.$transaction([
    db.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0'),
    ...tables.map((t) => db.$executeRawUnsafe(`DELETE FROM \`${t}\``)),
    db.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1'),
  ])
  // Fail loudly here, not as a confusing unique-key collision inside the next test.
  const leftover = await db.user.count()
  if (leftover) throw new Error(`Test reset left ${leftover} users: work from a previous test is still running`)
})

afterAll(async () => {
  await db.$disconnect()
})
