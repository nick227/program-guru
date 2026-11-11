import { execFileSync } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { db, type PrismaClient } from '../../src/client'
import {
  configuredSink,
  loadManifest,
  repoRoot,
  verifyPlatformAssetChecksums,
  type PlatformMediaSink,
} from '../platform-media'
import { assertValidSeedPack, SEEDED_ACTIVITIES, STARTER_PROGRAMS } from './content'
import { seedDemoFixtures } from './fixtures'
import { deterministicUuid } from './utils'
import { seedDatabase } from './writer'

export type BootstrapFixturesMode = 'none' | 'demo'

export type BootstrapOptions = {
  prisma?: PrismaClient
  sink?: PlatformMediaSink
  mode?: 'sync' | 'check' | 'reset'
  fixtures?: BootstrapFixturesMode
  skipMigrate?: boolean
}

/** Validates taxonomy, content pack references, and committed media checksums before touching DB or storage. */
export function validateBootstrapPack() {
  assertValidSeedPack()
  const manifest = loadManifest()
  for (const act of SEEDED_ACTIVITIES) {
    if (!act.textOnly && !manifest.assets[act.slug]) {
      throw new Error(`Missing illustration in manifest.json for activity "${act.slug}"`)
    }
  }
  for (const prog of STARTER_PROGRAMS) {
    if (!manifest.programCovers?.[prog.slug]) {
      throw new Error(`Missing curated cover in manifest.json for starter program "${prog.slug}"`)
    }
  }
  const verifiedFiles = verifyPlatformAssetChecksums()
  return {
    activities: SEEDED_ACTIVITIES.length,
    programs: STARTER_PROGRAMS.length,
    verifiedFiles,
  }
}

export async function inspectMigrations(prisma: PrismaClient) {
  const migrationsDir = join(repoRoot(), 'packages/db/prisma/migrations')
  const expected = existsSync(migrationsDir)
    ? readdirSync(migrationsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : []
  const rows = await prisma
    .$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
    .catch(() => {
      throw new Error('No migration history in this database: run `pnpm db:deploy` or `pnpm db:bootstrap` first')
    })
  const applied = new Set(rows.map((r) => r.migration_name))
  const pending = expected.filter((m) => !applied.has(m))
  return { expectedCount: expected.length, appliedCount: applied.size, pending }
}

/** Read-only consistency & inventory inspection. Never mutates the database or storage. */
export async function checkDatabaseConsistency(prisma: PrismaClient) {
  const pack = validateBootstrapPack()
  const migrations = await inspectMigrations(prisma)

  const starterIds = STARTER_PROGRAMS.map((sp) => deterministicUuid(`program:${sp.slug}`))
  const [
    brokenPrograms,
    missingStarterCovers,
    brokenActivities,
    emptyPublishedPrograms,
    categories,
    focuses,
    programTypes,
    tags,
    managedProgramsActive,
    managedProgramsArchived,
    managedActivitiesActive,
    managedActivitiesArchived,
    userPrograms,
    userActivities,
    users,
    groups,
    enrollments,
  ] = await Promise.all([
    prisma.program.findMany({
      where: {
        creatorId: null,
        status: 'PUBLISHED',
        latestPublishedVersionId: null,
      },
      select: { id: true, slug: true, title: true },
    }),
    prisma.program.findMany({
      where: {
        id: { in: starterIds },
        status: 'PUBLISHED',
        coverMediaId: null,
      },
      select: { id: true, slug: true, title: true },
    }),
    prisma.activity.findMany({
      where: {
        creatorId: null,
        status: 'PUBLISHED',
        latestPublishedRevisionId: null,
      },
      select: { id: true, slug: true, title: true },
    }),
    prisma.program.findMany({
      where: {
        creatorId: null,
        status: 'PUBLISHED',
        latestPublished: { is: { placementCount: 0 } },
      },
      select: { id: true, slug: true, title: true },
    }),
    prisma.category.count({ where: { isActive: true } }),
    prisma.focus.count({ where: { createdById: null, isActive: true } }),
    prisma.programType.count({ where: { createdById: null, isActive: true } }),
    prisma.tag.count({ where: { isActive: true } }),
    prisma.program.count({ where: { creatorId: null, status: 'PUBLISHED' } }),
    prisma.program.count({ where: { creatorId: null, status: 'ARCHIVED' } }),
    prisma.activity.count({ where: { creatorId: null, status: 'PUBLISHED' } }),
    prisma.activity.count({ where: { creatorId: null, status: 'ARCHIVED' } }),
    prisma.program.count({ where: { creatorId: { not: null } } }),
    prisma.activity.count({ where: { creatorId: { not: null } } }),
    prisma.user.count(),
    prisma.programGroup.count(),
    prisma.programEnrollment.count(),
  ])

  const describeRows = (rows: { id: string; slug: string | null; title: string }[]) =>
    rows.map((r) => `${r.slug ?? r.id} (${r.title})`).join(', ')

  const consistencyProblems: string[] = []
  if (migrations.pending.length) {
    consistencyProblems.push(`Unapplied migrations: ${migrations.pending.join(', ')}`)
  }
  if (brokenPrograms.length > 0) {
    consistencyProblems.push(`${brokenPrograms.length} published managed Program(s) missing latestPublishedVersionId: ${describeRows(brokenPrograms)}`)
  }
  if (missingStarterCovers.length > 0) {
    consistencyProblems.push(`${missingStarterCovers.length} starter Program(s) missing coverMediaId: ${describeRows(missingStarterCovers)}`)
  }
  if (brokenActivities.length > 0) {
    consistencyProblems.push(`${brokenActivities.length} published managed Activity/Activities missing latestPublishedRevisionId: ${describeRows(brokenActivities)}`)
  }
  if (emptyPublishedPrograms.length > 0) {
    consistencyProblems.push(`${emptyPublishedPrograms.length} published managed Program(s) have 0 placements: ${describeRows(emptyPublishedPrograms)}`)
  }

  return {
    ok: consistencyProblems.length === 0,
    problems: consistencyProblems,
    pack,
    migrations,
    counts: {
      categories,
      focuses,
      programTypes,
      tags,
      managedProgramsActive,
      managedProgramsArchived,
      managedActivitiesActive,
      managedActivitiesArchived,
      userPrograms,
      userActivities,
      users,
      groups,
      enrollments,
    },
  }
}

export function assertLocalResetAllowed(env: NodeJS.ProcessEnv = process.env) {
  if (env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID) {
    throw new Error('Refusing --reset on Railway')
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing --reset when NODE_ENV=production')
  }
  const url = env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  const host = new URL(url).hostname
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(`Refusing --reset against non-local database host "${host}"`)
  }
}

function runPrismaCommand(args: string[]) {
  const root = repoRoot()
  const dbPkgDir = join(root, 'packages/db')
  const localBin = join(dbPkgDir, 'node_modules/.bin/prisma')
  const rootBin = join(root, 'node_modules/.bin/prisma')
  const prismaBin = existsSync(localBin) ? localBin : rootBin
  execFileSync(prismaBin, args, { cwd: dbPkgDir, stdio: 'inherit', env: process.env })
}

/**
 * Single unified database bootstrap entrypoint for both local development and Railway/production.
 * Differences between environments come strictly from DATABASE_URL, STORAGE_PROVIDER/R2_*, and fixtures.
 */
export async function bootstrapDatabase(opts: BootstrapOptions = {}) {
  const prisma = opts.prisma ?? db
  const mode = opts.mode ?? 'sync'
  const fixtures = opts.fixtures ?? 'none'
  const sink = opts.sink ?? configuredSink()

  if (mode === 'check') {
    const report = await checkDatabaseConsistency(prisma)
    if (!report.ok) {
      throw new Error(`Bootstrap check failed:\n- ${report.problems.join('\n- ')}`)
    }
    return { mode: 'check' as const, storage: sink.name, ...report }
  }

  // Validate taxonomy, content pack, and asset checksums before any DB or storage mutation.
  validateBootstrapPack()

  if (mode === 'reset') {
    assertLocalResetAllowed()
    runPrismaCommand(['migrate', 'reset', '--force', '--skip-seed'])
  } else if (!opts.skipMigrate) {
    runPrismaCommand(['migrate', 'deploy'])
  }

  const migrations = await inspectMigrations(prisma)
  if (migrations.pending.length) {
    throw new Error(`Migrations not applied: ${migrations.pending.join(', ')}`)
  }

  const catalog = await seedDatabase(prisma, { sink })
  const demo = fixtures === 'demo' ? await seedDemoFixtures(prisma) : null
  const verification = await checkDatabaseConsistency(prisma)
  if (!verification.ok) {
    throw new Error(`Post-bootstrap consistency check failed:\n- ${verification.problems.join('\n- ')}`)
  }

  return {
    mode,
    storage: sink.name,
    migrations: migrations.appliedCount,
    catalog,
    fixtures: demo,
    counts: verification.counts,
  }
}
