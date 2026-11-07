// Minimal seeded catalog for domain tests: Fitness → Workout → Strength, two metrics, a timer
// tool, and two published platform Activities (Squats, Leg Raises).
import { Readable } from 'stream'
import { db } from '@project/db'
import { storage } from '../../infrastructure/storage'

/** The catalog seeded by seedCatalog, if a test file already created it in its own hooks. */
export async function existingCatalog(): Promise<Awaited<ReturnType<typeof seedCatalog>> | null> {
  const fitness = await db.category.findUnique({ where: { slug: 'fitness' } })
  if (!fitness) return null
  const strength = await db.focus.findUniqueOrThrow({ where: { categoryId_slug: { categoryId: fitness.id, slug: 'strength' } } })
  const workout = await db.programType.findUniqueOrThrow({ where: { categoryId_slug: { categoryId: fitness.id, slug: 'workout' } } })
  const reps = await db.metricDefinition.findUniqueOrThrow({ where: { key: 'repetitions' } })
  const duration = await db.metricDefinition.findUniqueOrThrow({ where: { key: 'duration' } })
  const timer = await db.toolDefinition.findUniqueOrThrow({ where: { key: 'TIMER' } })
  const illustration = await db.mediaAsset.findUniqueOrThrow({ where: { originalStorageKey: 'platform/squats.png' } })
  const load = async (slug: string) => {
    const activity = await db.activity.findUniqueOrThrow({ where: { slug } })
    return { activity, revision: await db.activityRevision.findUniqueOrThrow({ where: { id: activity.latestPublishedRevisionId! } }) }
  }
  return { fitness, strength, workout, reps, duration, timer, illustration, squats: await load('squats'), legRaises: await load('leg-raises') }
}

export async function seedCatalog() {
  const fitness = await db.category.create({ data: { slug: 'fitness', label: 'Fitness', position: 1 } })
  const strength = await db.focus.create({ data: { categoryId: fitness.id, slug: 'strength', label: 'Strength' } })
  const workout = await db.programType.create({
    data: { categoryId: fitness.id, slug: 'workout', label: 'Workout', isFeatured: true, focuses: { create: { focusId: strength.id } } },
  })
  const reps = await db.metricDefinition.create({ data: { key: 'repetitions', label: 'Reps', valueType: 'INTEGER', unit: 'reps', aggregation: 'SUM', betterDirection: 'HIGHER' } })
  const duration = await db.metricDefinition.create({ data: { key: 'duration', label: 'Duration', valueType: 'DURATION', unit: 's', aggregation: 'SUM' } })
  const timer = await db.toolDefinition.create({ data: { key: 'TIMER', label: 'Timer', componentKey: 'timer' } })
  // Bytes on disk before the row: never leave an ownerless MediaAsset pointing at a missing key.
  const illustrationBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  await storage().write('platform/squats.png', Readable.from(illustrationBytes), illustrationBytes.length)
  const illustration = await db.mediaAsset.create({
    data: {
      type: 'PHOTO',
      originalStorageKey: 'platform/squats.png',
      mime: 'image/png',
      byteSize: illustrationBytes.length,
      state: 'READY',
      license: 'CC0',
      attribution: 'Platform',
      alt: 'Squat illustration',
    },
  })
  const thumbBytes = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64')
  await storage().write('platform/squats-thumb.webp', Readable.from(thumbBytes), thumbBytes.length)
  await db.mediaVariant.create({
    data: {
      mediaId: illustration.id,
      kind: 'THUMB',
      storageKey: 'platform/squats-thumb.webp',
      mime: 'image/webp',
      byteSize: thumbBytes.length,
      width: 1,
      height: 1,
    },
  })

  async function platformActivity(slug: string, title: string, instructions: string[]) {
    const a = await db.activity.create({
      data: { slug, categoryId: fitness.id, title, status: 'PUBLISHED', visibility: 'PUBLIC', focuses: { create: { focusId: strength.id } } },
    })
    const rev = await db.activityRevision.create({
      data: {
        activityId: a.id,
        revisionNumber: 1,
        titleSnapshot: title,
        publishedAt: new Date(),
        metrics: { create: { metricDefinitionId: reps.id, defaults: { target: 10 } } },
        instructions: { create: instructions.map((body, position) => ({ position, body, instructionKey: crypto.randomUUID() })) },
        attachments: { create: { mediaId: illustration.id, purpose: 'ILLUSTRATION' } },
      },
    })
    await db.activity.update({ where: { id: a.id }, data: { latestPublishedRevisionId: rev.id } })
    return { activity: a, revision: rev }
  }

  const squats = await platformActivity('squats', 'Squats', ['Stand tall', 'Sit back', 'Drive up'])
  const legRaises = await platformActivity('leg-raises', 'Leg Raises', ['Lie flat', 'Raise legs'])
  return { fitness, strength, workout, reps, duration, timer, illustration, squats, legRaises }
}

export async function seedAchievements() {
  await db.achievementDefinition.createMany({
    skipDuplicates: true,
    data: [
      { key: 'first-completion', label: 'First step', description: 'Completed your first activity', icon: 'sparkles', ruleKind: 'TOTAL_COMPLETIONS', threshold: 1, position: 0 },
      { key: 'ten-completions', label: 'Ten done', description: 'Completed 10 activities', icon: 'medal', ruleKind: 'TOTAL_COMPLETIONS', threshold: 10, position: 1 },
      { key: 'program-completed', label: 'Program complete', description: 'Finished every activity in a program', icon: 'trophy', ruleKind: 'PROGRAM_COMPLETED', position: 2 },
    ],
  })
}

/** Real media made with ffmpeg so the worker pipeline runs end to end. */
export function makeMedia(kind: 'png' | 'mp4-with-gps') {
  const { execFileSync } = require('child_process') as typeof import('child_process')
  const { mkdtempSync, readFileSync } = require('fs') as typeof import('fs')
  const { join } = require('path') as typeof import('path')
  const { tmpdir } = require('os') as typeof import('os')
  const dir = mkdtempSync(join(tmpdir(), 'fixture-'))
  const out = join(dir, kind === 'png' ? 'x.png' : 'x.mp4')
  const args =
    kind === 'png'
      ? ['-f', 'lavfi', '-i', 'color=c=red:s=96x64', '-frames:v', '1', out]
      : ['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '1.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-metadata', 'location=+40.6892-074.0445/', '-movflags', '+use_metadata_tags', out]
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])
  return readFileSync(out)
}
