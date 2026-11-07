// Minimal seeded catalog for domain tests: Fitness → Workout → Strength, two metrics, a timer
// tool, and two published platform Activities (Squats, Leg Raises).
import { db } from '@project/db'

export async function seedCatalog() {
  const fitness = await db.category.create({ data: { slug: 'fitness', label: 'Fitness', position: 1 } })
  const strength = await db.focus.create({ data: { categoryId: fitness.id, slug: 'strength', label: 'Strength' } })
  const workout = await db.programType.create({
    data: { categoryId: fitness.id, slug: 'workout', label: 'Workout', isFeatured: true, focuses: { create: { focusId: strength.id } } },
  })
  const reps = await db.metricDefinition.create({ data: { key: 'repetitions', label: 'Reps', valueType: 'INTEGER', unit: 'reps', aggregation: 'SUM', betterDirection: 'HIGHER' } })
  const duration = await db.metricDefinition.create({ data: { key: 'duration', label: 'Duration', valueType: 'DURATION', unit: 's', aggregation: 'SUM' } })
  const timer = await db.toolDefinition.create({ data: { key: 'TIMER', label: 'Timer', componentKey: 'timer' } })
  const illustration = await db.mediaAsset.create({
    data: { type: 'PHOTO', originalStorageKey: 'platform/squats.png', mime: 'image/png', byteSize: 100, state: 'READY', license: 'CC0', attribution: 'Platform', alt: 'Squat illustration' },
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
