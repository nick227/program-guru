import { db, Prisma, type PrismaClient } from '../../src/client'
import {
  localSink,
  platformIllustration,
  platformProgramCover,
  publishPlatformFiles,
  type PlatformIllustration,
  type PlatformMediaSink,
} from '../platform-media'
import { assertValidSeedPack, SEEDED_ACTIVITIES, STARTER_PROGRAMS } from './content'
import { ACHIEVEMENT_DEFINITIONS, METRIC_DEFINITIONS, TOOL_DEFINITIONS } from './definitions'
import { retireObsoletePlatformSeeds } from './retire'
import { CATEGORIES, FOCUSES, PROGRAM_TYPES, TAGS } from './taxonomy'
import { changed, deterministicUuid, SEEDED_AT } from './utils'

/** One READY platform photo (original + THUMB variant) under a deterministic id; safe to re-run. */
async function upsertPlatformPhoto(prisma: PrismaClient, key: string, photo: PlatformIllustration) {
  const id = deterministicUuid(key)
  const content = {
    originalStorageKey: photo.original.storageKey,
    mime: photo.original.mime,
    byteSize: BigInt(photo.original.byteSize),
    width: photo.original.width,
    height: photo.original.height,
    alt: photo.alt,
    license: photo.license,
    attribution: photo.attribution,
    sourceUrl: null,
    state: 'READY' as const,
  }
  await prisma.mediaAsset.upsert({
    where: { id },
    create: { id, ownerId: null, type: 'PHOTO', uploadedAt: SEEDED_AT, ...content },
    update: content,
  })
  const thumb = {
    storageKey: photo.thumb.storageKey,
    mime: photo.thumb.mime,
    byteSize: BigInt(photo.thumb.byteSize),
    width: photo.thumb.width,
    height: photo.thumb.height,
  }
  await prisma.mediaVariant.upsert({
    where: { mediaId_kind: { mediaId: id, kind: 'THUMB' } },
    create: { id: deterministicUuid(`media-variant:thumb:${key}`), mediaId: id, kind: 'THUMB', ...thumb },
    update: thumb,
  })
  return id
}

export async function seedDatabase(prisma: PrismaClient = db, opts: { sink?: PlatformMediaSink } = {}) {
  assertValidSeedPack()

  // 0. Platform illustration files first: rows only ever reference objects storage can serve.
  const illustrations = new Map(SEEDED_ACTIVITIES.filter((a) => !a.textOnly).map((a) => [a.slug, platformIllustration(a.slug)]))
  const covers = new Map(
    STARTER_PROGRAMS.flatMap((sp) => {
      const cover = platformProgramCover(sp.slug)
      return cover ? [[sp.slug, cover] as const] : []
    }),
  )
  const published = await publishPlatformFiles(
    opts.sink ?? localSink(),
    [...illustrations.values(), ...covers.values()].flatMap((i) => [i.original, i.thumb]),
  )

  // 1. Categories
  const categoryBySlug = new Map<string, string>()
  for (const c of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      create: { id: deterministicUuid(`category:${c.slug}`), slug: c.slug, label: c.label, icon: c.icon, position: c.position },
      update: { label: c.label, icon: c.icon, position: c.position },
    })
    categoryBySlug.set(c.slug, row.id)
  }

  // 2. Focuses (platform-seeded have createdById = null; scoped by categorySlug:slug)
  const focusByKey = new Map<string, string>()
  for (const f of FOCUSES) {
    const categoryId = categoryBySlug.get(f.categorySlug)!
    const existing = await prisma.focus.findFirst({ where: { categoryId, slug: f.slug, createdById: null } })
    const row = existing
      ? changed(existing, { label: f.label, position: f.position })
        ? await prisma.focus.update({ where: { id: existing.id }, data: { label: f.label, position: f.position } })
        : existing
      : await prisma.focus.create({
          data: {
            id: deterministicUuid(`focus:${f.categorySlug}:${f.slug}`),
            categoryId,
            slug: f.slug,
            label: f.label,
            position: f.position,
            createdById: null,
          },
        })
    focusByKey.set(`${f.categorySlug}:${f.slug}`, row.id)
  }

  // 3. ProgramTypes & ProgramTypeFocus links (pruning stale focus links)
  const programTypeBySlug = new Map<string, string>()
  for (const pt of PROGRAM_TYPES) {
    const categoryId = categoryBySlug.get(pt.categorySlug)!
    const row = await prisma.programType.upsert({
      where: { categoryId_slug: { categoryId, slug: pt.slug } },
      create: {
        id: deterministicUuid(`program-type:${pt.slug}`),
        categoryId,
        slug: pt.slug,
        label: pt.label,
        isFeatured: pt.isFeatured,
        position: pt.position,
      },
      update: {
        label: pt.label,
        isFeatured: pt.isFeatured,
        position: pt.position,
      },
    })
    programTypeBySlug.set(pt.slug, row.id)

    const desiredFocusIds: string[] = []
    for (const [idx, focusSlug] of pt.focusSlugs.entries()) {
      const focusId = focusByKey.get(`${pt.categorySlug}:${focusSlug}`)!
      desiredFocusIds.push(focusId)
      await prisma.programTypeFocus.upsert({
        where: { programTypeId_focusId: { programTypeId: row.id, focusId } },
        create: { programTypeId: row.id, focusId, position: idx },
        update: { position: idx },
      })
    }
    await prisma.programTypeFocus.deleteMany({
      where: { programTypeId: row.id, focusId: { notIn: desiredFocusIds } },
    })
  }

  // 3b. Cross-category Tags
  const tagBySlug = new Map<string, string>()
  for (const t of TAGS) {
    const row = await prisma.tag.upsert({
      where: { slug: t.slug },
      create: {
        id: deterministicUuid(`tag:${t.slug}`),
        slug: t.slug,
        label: t.label,
        group: t.group,
        position: t.position,
      },
      update: {
        label: t.label,
        group: t.group,
        position: t.position,
      },
    })
    tagBySlug.set(t.slug, row.id)
  }

  // 4. MetricDefinitions
  const metricByKey = new Map<string, string>()
  for (const m of METRIC_DEFINITIONS) {
    const row = await prisma.metricDefinition.upsert({
      where: { key: m.key },
      create: {
        id: deterministicUuid(`metric:${m.key}`),
        key: m.key,
        label: m.label,
        valueType: m.valueType,
        unit: m.unit,
        precision: m.precision,
        aggregation: m.aggregation,
        betterDirection: m.betterDirection,
        validation: m.validation ?? undefined,
      },
      update: {
        label: m.label,
        valueType: m.valueType,
        unit: m.unit,
        precision: m.precision,
        aggregation: m.aggregation,
        betterDirection: m.betterDirection,
        validation: m.validation ?? undefined,
      },
    })
    metricByKey.set(m.key, row.id)
  }

  // 5. ToolDefinitions
  const toolByKey = new Map<string, string>()
  for (const t of TOOL_DEFINITIONS) {
    const row = await prisma.toolDefinition.upsert({
      where: { key: t.key },
      create: {
        id: deterministicUuid(`tool:${t.key}`),
        key: t.key,
        label: t.label,
        componentKey: t.componentKey,
        defaultConfig: t.defaultConfig,
      },
      update: {
        label: t.label,
        componentKey: t.componentKey,
        defaultConfig: t.defaultConfig,
      },
    })
    toolByKey.set(t.key, row.id)
  }

  // 6. AchievementDefinitions
  for (const a of ACHIEVEMENT_DEFINITIONS) {
    await prisma.achievementDefinition.upsert({
      where: { key: a.key },
      create: {
        id: deterministicUuid(`achievement:${a.key}`),
        key: a.key,
        label: a.label,
        description: a.description,
        icon: a.icon,
        ruleKind: a.ruleKind,
        threshold: a.threshold,
        position: a.position,
      },
      update: {
        label: a.label,
        description: a.description,
        icon: a.icon,
        ruleKind: a.ruleKind,
        threshold: a.threshold,
        position: a.position,
      },
    })
  }

  // 7. Curated Seeded Activities with rights-cleared MediaAssets, Revisions, Instructions, Metrics, and Tools
  const activityBySlug = new Map<string, { activityId: string; revisionId: string }>()
  for (const act of SEEDED_ACTIVITIES) {
    const categoryId = categoryBySlug.get(act.categorySlug)!
    const activityId = deterministicUuid(`activity:${act.slug}`)
    const revisionId = deterministicUuid(`activity-revision:${act.slug}:1`)

    const existingAct = await prisma.activity.findUnique({ where: { slug: act.slug } })
    const actComparable = {
      categoryId,
      title: act.title,
      summary: act.summary,
      durationMinutes: act.durationMinutes ?? null,
      targetTime: act.targetTime ?? null,
      frequency: act.frequency ?? null,
    }
    const actWriteData = {
      categoryId,
      title: act.title,
      summary: act.summary,
      durationMinutes: act.durationMinutes ?? null,
      targetTime: act.targetTime ?? null,
      frequency: act.frequency ? (act.frequency as Prisma.InputJsonValue) : Prisma.DbNull,
    }
    const savedAct = existingAct
      ? changed(existingAct, actComparable)
        ? await prisma.activity.update({ where: { id: existingAct.id }, data: actWriteData })
        : existingAct
      : await prisma.activity.create({
          data: {
            id: activityId,
            slug: act.slug,
            creatorId: null,
            ...actWriteData,
            status: 'PUBLISHED',
            visibility: 'PUBLIC',
          },
        })

    // Sync ActivityFocus join rows and prune stale focuses
    const desiredFocusIds = act.focusSlugs.map((fSlug) => focusByKey.get(`${act.categorySlug}:${fSlug}`)!)
    for (const focusId of desiredFocusIds) {
      await prisma.activityFocus.upsert({
        where: { activityId_focusId: { activityId: savedAct.id, focusId } },
        create: { activityId: savedAct.id, focusId },
        update: {},
      })
    }
    await prisma.activityFocus.deleteMany({
      where: { activityId: savedAct.id, focusId: { notIn: desiredFocusIds } },
    })

    // Upsert Revision 1 with full schedule metadata snapshots
    const revData = {
      titleSnapshot: act.title,
      summarySnapshot: act.summary,
      durationMinutesSnapshot: act.durationMinutes ?? null,
      targetTimeSnapshot: act.targetTime ?? null,
      frequencySnapshot: act.frequency ? (act.frequency as Prisma.InputJsonValue) : Prisma.DbNull,
      publishedAt: SEEDED_AT,
    }
    const rev = await prisma.activityRevision.upsert({
      where: { activityId_revisionNumber: { activityId: savedAct.id, revisionNumber: 1 } },
      create: {
        id: revisionId,
        activityId: savedAct.id,
        revisionNumber: 1,
        ...revData,
      },
      update: revData,
    })

    if (savedAct.latestPublishedRevisionId !== rev.id) {
      await prisma.activity.update({ where: { id: savedAct.id }, data: { latestPublishedRevisionId: rev.id } })
    }

    // Upsert concise Instructions and prune extra positions
    await prisma.instruction.deleteMany({
      where: { activityRevisionId: rev.id, position: { gte: act.instructions.length } },
    })
    for (const [pos, ins] of act.instructions.entries()) {
      const instructionKey = deterministicUuid(`instruction-key:${act.slug}:${pos}`)
      await prisma.instruction.upsert({
        where: { activityRevisionId_position: { activityRevisionId: rev.id, position: pos } },
        create: {
          id: deterministicUuid(`instruction:${act.slug}:${pos}`),
          activityRevisionId: rev.id,
          instructionKey,
          position: pos,
          title: ins.title ?? null,
          body: ins.body,
        },
        update: {
          instructionKey,
          title: ins.title ?? null,
          body: ins.body,
        },
      })
    }

    // Replace Activity-level Metric bindings deterministically
    await prisma.activityMetric.deleteMany({ where: { activityRevisionId: rev.id, instructionId: null } })
    for (const [pos, mb] of act.metrics.entries()) {
      const metricDefinitionId = metricByKey.get(mb.key)!
      await prisma.activityMetric.create({
        data: {
          id: deterministicUuid(`activity-metric:${act.slug}:${mb.key}:${pos}`),
          activityRevisionId: rev.id,
          instructionId: null,
          metricDefinitionId,
          position: pos,
          required: mb.required ?? false,
          defaults: mb.target !== undefined ? { target: mb.target } : undefined,
        },
      })
    }

    // Replace Activity-level Tool bindings deterministically
    await prisma.activityTool.deleteMany({ where: { activityRevisionId: rev.id, instructionId: null } })
    for (const [pos, tb] of act.tools.entries()) {
      const toolDefinitionId = toolByKey.get(tb.key)!
      await prisma.activityTool.create({
        data: {
          id: deterministicUuid(`activity-tool:${act.slug}:${tb.key}:${pos}`),
          activityRevisionId: rev.id,
          instructionId: null,
          toolDefinitionId,
          position: pos,
          config: (tb.config ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      })
    }

    // Rights-cleared platform MediaAsset & attachments (unless textOnly outlier)
    const attachmentId = deterministicUuid(`attachment:photo:${act.slug}`)
    await prisma.mediaAttachment.deleteMany({
      where: { activityRevisionId: rev.id, ...(act.textOnly ? {} : { id: { not: attachmentId } }) },
    })
    if (!act.textOnly) {
      const photo = illustrations.get(act.slug)!
      const photoId = deterministicUuid(`media:photo:${act.slug}`)
      await prisma.mediaAsset.upsert({
        where: { id: photoId },
        create: {
          id: photoId,
          ownerId: null,
          type: 'PHOTO',
          originalStorageKey: photo.original.storageKey,
          mime: photo.original.mime,
          byteSize: BigInt(photo.original.byteSize),
          width: photo.original.width,
          height: photo.original.height,
          state: 'READY',
          alt: photo.alt,
          license: photo.license,
          attribution: photo.attribution,
          sourceUrl: null,
          uploadedAt: SEEDED_AT,
        },
        update: {
          originalStorageKey: photo.original.storageKey,
          mime: photo.original.mime,
          byteSize: BigInt(photo.original.byteSize),
          width: photo.original.width,
          height: photo.original.height,
          alt: photo.alt,
          license: photo.license,
          attribution: photo.attribution,
          sourceUrl: null,
          state: 'READY',
        },
      })
      await prisma.mediaVariant.upsert({
        where: { mediaId_kind: { mediaId: photoId, kind: 'THUMB' } },
        create: {
          id: deterministicUuid(`media-variant:thumb:${act.slug}`),
          mediaId: photoId,
          kind: 'THUMB',
          storageKey: photo.thumb.storageKey,
          mime: photo.thumb.mime,
          byteSize: BigInt(photo.thumb.byteSize),
          width: photo.thumb.width,
          height: photo.thumb.height,
        },
        update: {
          storageKey: photo.thumb.storageKey,
          mime: photo.thumb.mime,
          byteSize: BigInt(photo.thumb.byteSize),
          width: photo.thumb.width,
          height: photo.thumb.height,
        },
      })
      await prisma.mediaAttachment.upsert({
        where: { id: attachmentId },
        create: { id: attachmentId, mediaId: photoId, activityRevisionId: rev.id, purpose: 'ILLUSTRATION', position: 0 },
        update: {},
      })

      if (act.hasVideo) {
        await prisma.mediaAsset.updateMany({
          where: { id: deterministicUuid(`media:video:${act.slug}`), deletedAt: null },
          data: { deletedAt: SEEDED_AT },
        })
      }
    }

    activityBySlug.set(act.slug, { activityId: savedAct.id, revisionId: rev.id })
  }

  // 8. Curated Starter Programs (one polished Program per core category)
  for (const sp of STARTER_PROGRAMS) {
    const programId = deterministicUuid(`program:${sp.slug}`)
    const versionId = deterministicUuid(`program-version:${sp.slug}:1`)
    const categoryId = categoryBySlug.get(sp.categorySlug)!
    const programTypeId = programTypeBySlug.get(sp.programTypeSlug)!
    const focusId = sp.focusSlug ? focusByKey.get(`${sp.categorySlug}:${sp.focusSlug}`)! : null
    const curated = covers.get(sp.slug)
    const coverMediaId = curated
      ? await upsertPlatformPhoto(prisma, `media:cover:${sp.slug}`, curated)
      : deterministicUuid(`media:photo:${sp.activitySlugs[0]!}`)
    const programDayCount = new Set(sp.placements.map((p) => p.relativeDay)).size
    const placementCount = sp.placements.length

    // Content only, and only when changed: never re-publish an archived or moderated starter Program.
    const canonicalSlug = sp.slug.replace(/^starter-/, '')
    const programLevel = sp.level ?? 'ALL_LEVELS'
    const programSessionMinutes = sp.sessionMinutes ?? null
    const programSessionPresentation = sp.sessionPresentation ?? 'SEPARATE'
    const programContent = {
      categoryId,
      programTypeId,
      focusId,
      level: programLevel,
      sessionMinutes: programSessionMinutes,
      sessionPresentation: programSessionPresentation,
      title: sp.title,
      description: sp.description,
      coverMediaId,
      slug: canonicalSlug,
    }
    const existingProgram = await prisma.program.findUnique({ where: { id: programId } })
    if (!existingProgram) {
      await prisma.program.create({
        data: { id: programId, creatorId: null, ...programContent, status: 'PUBLISHED', visibility: 'PUBLIC', draftRevision: 1 },
      })
    } else if (changed(existingProgram, programContent)) {
      await prisma.program.update({ where: { id: programId }, data: programContent })
    }

    const desiredTagIds: string[] = []
    for (const [pos, tagSlug] of (sp.tagSlugs ?? []).entries()) {
      const tagId = tagBySlug.get(tagSlug)!
      desiredTagIds.push(tagId)
      await prisma.programTag.upsert({
        where: { programId_tagId: { programId, tagId } },
        create: { programId, tagId, position: pos },
        update: { position: pos },
      })
    }
    await prisma.programTag.deleteMany({
      where: { programId, tagId: { notIn: desiredTagIds } },
    })

    const aliasId = deterministicUuid(`program-alias:${sp.slug}`)
    const existingAlias = await prisma.programSlugAlias.findFirst({
      where: { creatorId: null, slug: sp.slug },
    })
    if (!existingAlias) {
      await prisma.programSlugAlias.create({
        data: { id: aliasId, programId, creatorId: null, slug: sp.slug },
      })
    }

    await prisma.programAccessPolicy.upsert({
      where: { programId },
      create: { programId, accessMode: 'OPEN' },
      update: { accessMode: 'OPEN' },
    })

    // Initialize neutral ProgramStat if missing; never overwrite real usage stats with synthetic numbers.
    await prisma.programStat.upsert({
      where: { programId },
      create: { programId, enrollmentCount: 0, completionRate: null, rankScore: 0 },
      update: {},
    })

    const versionContent = {
      title: sp.title,
      description: sp.description,
      programTypeId,
      focusId,
      level: programLevel,
      sessionMinutes: programSessionMinutes,
      sessionPresentation: programSessionPresentation,
      durationDays: sp.durationDays,
      cycleDays: sp.durationDays === null && sp.frequency.kind !== 'MONTHLY' ? 7 : null,
      frequency: sp.frequency as Prisma.InputJsonValue,
      generationMode: sp.generationMode,
      programDayCount,
      placementCount,
      publishedAt: SEEDED_AT,
    }
    const existingVersion = await prisma.programVersion.findUnique({
      where: { programId_versionNumber: { programId, versionNumber: 1 } },
    })
    if (!existingVersion) {
      await prisma.programVersion.create({
        data: { id: versionId, programId, versionNumber: 1, ...versionContent },
      })
    } else if (changed(existingVersion, versionContent)) {
      await prisma.programVersion.update({ where: { id: existingVersion.id }, data: versionContent })
    }

    await prisma.program.updateMany({
      where: { id: programId, NOT: { latestPublishedVersionId: versionId } },
      data: { latestPublishedVersionId: versionId },
    })
    await prisma.program.updateMany({
      where: { id: programId, latestPublishedVersionId: null },
      data: { latestPublishedVersionId: versionId },
    })

    // Sync placements and prune stale ProgramScheduleItems when schedule shrinks
    const desiredItemIds: string[] = []
    for (const [idx, pl] of sp.placements.entries()) {
      const ref = activityBySlug.get(pl.activitySlug)!
      const scheduleItemId = deterministicUuid(`program-schedule-item:${sp.slug}:${idx}`)
      desiredItemIds.push(scheduleItemId)
      const itemData = {
        activityId: ref.activityId,
        activityRevisionId: ref.revisionId,
        relativeDay: pl.relativeDay,
        position: pl.position,
        localTime: pl.localTime ?? null,
        frequency: pl.frequency ? (pl.frequency as Prisma.InputJsonValue) : Prisma.DbNull,
        targetOverrides: pl.targetOverrides ? (pl.targetOverrides as Prisma.InputJsonValue) : Prisma.DbNull,
      }
      await prisma.programScheduleItem.upsert({
        where: { id: scheduleItemId },
        create: { id: scheduleItemId, programVersionId: versionId, ...itemData },
        update: itemData,
      })
    }
    await prisma.programScheduleItem.deleteMany({
      where: { programVersionId: versionId, id: { notIn: desiredItemIds } },
    })
  }

  // 9. Safely archive obsolete platform seed rows while preserving existing user data
  const retired = await retireObsoletePlatformSeeds(prisma)

  return {
    categories: CATEGORIES.length,
    focuses: FOCUSES.length,
    programTypes: PROGRAM_TYPES.length,
    tags: TAGS.length,
    metrics: METRIC_DEFINITIONS.length,
    tools: TOOL_DEFINITIONS.length,
    achievements: ACHIEVEMENT_DEFINITIONS.length,
    activities: SEEDED_ACTIVITIES.length,
    starterPrograms: STARTER_PROGRAMS.length,
    retiredPrograms: retired.retiredPrograms,
    retiredActivities: retired.retiredActivities,
    platformMediaFiles: published.verified,
    platformMediaUploaded: published.uploaded,
  }
}

/**
 * Local development only: the default ADMIN account (README). Runs from `pnpm db:seed`, which
 * db-guard refuses outside a localhost database; never part of seedDatabase(), so production
 * bootstrap never creates it. Idempotent: keeps an existing password, restores ADMIN and ACTIVE.
 */
export const DEV_ADMIN = { email: 'admin-dev@test.local', password: 'admin dev password', handle: 'admindev', displayName: 'Admin Dev' }
// bcrypt (cost 12) of DEV_ADMIN.password, precomputed so this package needs no bcrypt dependency.
const DEV_ADMIN_HASH = '$2a$12$q.IgCIAGElCj1W/5tegXxeQs3TU8mrBlMaHrrusGT4o88ZDhzv3.C'

export async function seedDevAdmin(prisma: PrismaClient = db) {
  if (process.env.NODE_ENV === 'production') throw new Error('seedDevAdmin is for local development only')
  const data = { role: 'ADMIN' as const, status: 'ACTIVE' as const, deactivatedAt: null, emailVerifiedAt: new Date() }
  const user = await prisma.user.upsert({ where: { email: DEV_ADMIN.email }, update: data, create: { email: DEV_ADMIN.email, ...data } })
  await prisma.localCredential.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, passwordHash: DEV_ADMIN_HASH } })
  await prisma.userProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, handle: DEV_ADMIN.handle, displayName: DEV_ADMIN.displayName } })
  await prisma.userPreference.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } })
  return DEV_ADMIN.email
}
