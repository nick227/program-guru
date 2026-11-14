// Deterministic, idempotent platform seed entrypoint.
// All media references are original platform-owned CC0-1.0 assets — never scraped, copyrighted, or unlicensed.
// Safe to re-run in production: catalog rows are upserted by deterministic id, existing status/visibility
// decisions on active items stand, and obsolete seed entries are safely archived without deleting user history.
import { db } from '../src/client'
import { seedDatabase, seedDevAdmin } from './seed/writer'

export { SEEDED_ACTIVITIES, STARTER_PROGRAMS, SEED_CONTENT_PACK, assertValidSeedPack } from './seed/content'
export { STARTER_ACTIVITIES, STARTER_CATALOG_PROGRAMS, STARTER_CATALOG, STARTER_PLACES, STARTER_ACTIVITY_PLACES, DOMAIN_SLUG_ALIASES, dependencyPlacements } from './seed/content/starter'
export { CATEGORIES, FOCUSES, PROGRAM_TYPES, TAGS, TAXONOMY, CATEGORY_DEFINITIONS, DOMAIN_DEFINITIONS, TAG_DEFINITIONS, assertValidTaxonomy } from './seed/taxonomy'
export { METRIC_DEFINITIONS, TOOL_DEFINITIONS, ACHIEVEMENT_DEFINITIONS } from './seed/definitions'
export { RETIRED_ACTIVITY_SLUGS, RETIRED_STARTER_PROGRAM_SLUGS, retireObsoletePlatformSeeds } from './seed/retire'
export { deterministicUuid } from './seed/utils'
export { DEV_ADMIN, seedDatabase, seedDevAdmin } from './seed/writer'
export { seedDemoFixtures } from './seed/fixtures'
export { bootstrapDatabase, checkDatabaseConsistency, inspectMigrations, validateBootstrapPack } from './seed/bootstrap'

const isMain = Boolean(process.argv[1]?.replace(/\\/g, '/').endsWith('prisma/seed.ts'))
if (isMain) {
  seedDatabase()
    .then(async (summary) => {
      console.log('Seeded platform catalog:', summary)
      console.log('Development admin:', await seedDevAdmin())
    })
    .catch((err) => {
      console.error('Failed to seed platform catalog:', err)
      process.exitCode = 1
    })
    .finally(async () => {
      await db.$disconnect()
    })
}
