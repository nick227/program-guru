// Admin content import (12-SOCIAL §7a). Structured JSON → platform-owned draft Programs with nested
// Activities. The OpenAPI schema validates shape; this file resolves references and checks domain
// rules, reporting every issue before anything is written. A valid import is written in one
// transaction (all or nothing) and is replay-safe through its idempotency key.
import { randomUUID } from 'crypto'
import { db, type Prisma, type ProgramLevel, type SessionPresentation } from '@project/db'
import { isValidMinutes, isValidTargetTime, PROGRAM_LEVELS, SESSION_PRESENTATIONS, validateFrequencyRule, type ContentIssue } from '@project/shared'
import { badRequest } from '../../lib/errors'
import { requestHash, withIdempotency } from '../../lib/idempotency'
import { isOpenlyReadable } from '../activities/access'
import { regenerate } from '../programs/authoring.service'
import { allocateActivitySlug, allocateProgramSlug } from '../programs/slug.service'
import { DEFAULT_DURATION_DAYS, DEFAULT_FREQUENCY, type Frequency, type GenerationMode } from '../programs/schedule'
import { authorFor } from './authors'

type Visibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC'
export type ImportActivity = {
  ref?: string
  title?: string
  summary?: string | null
  durationMinutes?: number | null
  targetTime?: string | null
  frequency?: Frequency
  category?: string
  focuses?: string[]
  instructions?: { title?: string | null; body?: string | null }[]
  metrics?: { metric: string; required?: boolean }[]
  tools?: { tool: string }[]
}
export type ImportProgram = {
  title: string
  description?: string | null
  programType: string
  focus?: string | null
  level?: ProgramLevel
  sessionMinutes?: number | null
  sessionPresentation?: SessionPresentation
  tags?: string[]
  visibility?: Visibility
  durationDays?: number | null
  frequency?: Frequency
  generationMode?: GenerationMode
  activities: ImportActivity[]
}
export type ImportInput = { dryRun?: boolean; idempotencyKey?: string; programs: ImportProgram[] }

type Issue = ContentIssue
const MAX_NEW_ACTIVITIES = 300
const SCOPE = 'admin:import'
const ITEM_SCOPE = 'admin:import:item'

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
const bySlugOrId = (value: string) => (isUuid(value) ? { id: value } : { slug: value })

/** Loads every taxonomy row and Activity the batch names, in a handful of queries. */
async function loadReferences(programs: ImportProgram[]) {
  const all = programs.flatMap((p) => p.activities)
  const names = <T,>(xs: (T | undefined | null)[]) => [...new Set(xs.filter((x): x is T => !!x))]
  const anyOf = (values: string[]) => values.flatMap((v) => [bySlugOrId(v)])
  const typeNames = names(programs.map((p) => p.programType))
  const focusNames = names([...programs.map((p) => p.focus), ...all.flatMap((a) => a.focuses ?? [])])
  const tagNames = names(programs.flatMap((p) => p.tags ?? []))
  const categoryNames = names(all.map((a) => a.category))
  const refs = names(all.map((a) => a.ref))
  const [types, focuses, tags, categories, activities, metrics, tools] = await Promise.all([
    typeNames.length ? db.programType.findMany({ where: { OR: anyOf(typeNames), isActive: true, reviewState: 'APPROVED' } }) : [],
    focusNames.length ? db.focus.findMany({ where: { OR: anyOf(focusNames), isActive: true, reviewState: 'APPROVED' } }) : [],
    tagNames.length ? db.tag.findMany({ where: { OR: anyOf(tagNames), isActive: true } }) : [],
    categoryNames.length ? db.category.findMany({ where: { OR: anyOf(categoryNames), isActive: true } }) : [],
    refs.length ? db.activity.findMany({ where: { OR: anyOf(refs) } }) : [],
    db.metricDefinition.findMany({ where: { key: { in: names(all.flatMap((a) => a.metrics?.map((m) => m.metric) ?? [])) }, ownerId: null } }),
    db.toolDefinition.findMany({ where: { key: { in: names(all.flatMap((a) => a.tools?.map((t) => t.tool) ?? [])) } } }),
  ])
  /** Slugs repeat across categories for types and focuses: prefer the one in `categoryId`. */
  const pick = <R extends { id: string; slug: string | null; categoryId?: string }>(rows: R[], value: string, categoryId?: string) => {
    const matches = rows.filter((r) => r.id === value || r.slug === value)
    return matches.find((r) => r.categoryId === categoryId) ?? (matches.length === 1 ? matches[0] : undefined)
  }
  return {
    type: (v: string) => pick(types, v),
    focus: (v: string, categoryId: string) => pick(focuses, v, categoryId),
    tag: (v: string) => tags.find((t) => t.id === v || t.slug === v),
    category: (v: string) => pick(categories, v),
    activity: (v: string) => activities.find((a) => a.id === v || a.slug === v),
    metric: (key: string) => metrics.find((m) => m.key === key),
    tool: (key: string) => tools.find((t) => t.key === key),
  }
}

/** Every issue in the batch, keyed by JSON path, so the whole file can be fixed in one pass. */
async function check(input: ImportInput) {
  const refs = await loadReferences(input.programs)
  const issues: Issue[] = []
  const add = (path: string, message: string) => issues.push({ path, message })
  let newActivities = 0

  const plan = input.programs.map((p, pi) => {
    const at = `programs.${pi}`
    if (!p.title.trim()) add(`${at}.title`, 'is required')
    const type = refs.type(p.programType)
    if (!type) add(`${at}.programType`, `no approved program type "${p.programType}"`)
    const focus = p.focus && type ? refs.focus(p.focus, type.categoryId) : null
    if (p.focus && type && !focus) add(`${at}.focus`, `no approved focus "${p.focus}"`)
    if (p.level && !PROGRAM_LEVELS.includes(p.level)) add(`${at}.level`, `invalid level "${p.level}"`)
    if (p.sessionPresentation && !SESSION_PRESENTATIONS.includes(p.sessionPresentation)) {
      add(`${at}.sessionPresentation`, `invalid sessionPresentation "${p.sessionPresentation}"`)
    }
    if (p.sessionMinutes !== undefined && p.sessionMinutes !== null && !isValidMinutes(p.sessionMinutes)) {
      add(`${at}.sessionMinutes`, 'must be between 1 and 1440')
    }
    const tagIds = (p.tags ?? []).map((t, ti) => {
      const row = refs.tag(t)
      if (!row) add(`${at}.tags.${ti}`, `no active tag "${t}"`)
      return row?.id ?? ''
    })
    if (p.frequency) validateFrequencyRule(p.frequency, `${at}.frequency`, issues)
    const seen = new Set<string>()
    const activities = p.activities.map((a, ai) => {
      const aat = `${at}.activities.${ai}`
      if (a.ref) {
        if (a.title || a.summary || a.durationMinutes !== undefined || a.targetTime !== undefined || a.frequency || a.category || a.focuses || a.instructions || a.metrics || a.tools) {
          add(aat, 'use either ref or new Activity fields, not both')
        }
        const existing = refs.activity(a.ref)
        // Platform Activities, or anyone's openly published ones (the same rule as adding to a draft).
        const usable = existing && existing.status !== 'ARCHIVED' && (existing.creatorId === null || isOpenlyReadable(existing))
        if (!usable) add(`${aat}.ref`, `no usable activity "${a.ref}"`)
        else if (seen.has(existing.id)) add(`${aat}.ref`, 'appears twice in this program')
        if (existing) seen.add(existing.id)
        return { kind: 'ref' as const, activity: existing ?? null }
      }
      newActivities++
      if (!a.title?.trim()) add(`${aat}.title`, 'is required (or give ref)')
      if (a.durationMinutes !== undefined && a.durationMinutes !== null && !isValidMinutes(a.durationMinutes)) {
        add(`${aat}.durationMinutes`, 'must be between 1 and 1440')
      }
      if (a.targetTime !== undefined && a.targetTime !== null && !isValidTargetTime(a.targetTime)) {
        add(`${aat}.targetTime`, 'must be HH:MM (24-hour)')
      }
      if (a.frequency) validateFrequencyRule(a.frequency, `${aat}.frequency`, issues)
      const category = a.category ? refs.category(a.category) : null
      if (a.category && !category) add(`${aat}.category`, `no category "${a.category}"`)
      const categoryId = category?.id ?? type?.categoryId ?? ''
      const focusIds = (a.focuses ?? []).map((f, fi) => {
        const row = refs.focus(f, categoryId)
        if (!row) add(`${aat}.focuses.${fi}`, `no approved focus "${f}"`)
        return row?.id ?? ''
      })
      const metrics = (a.metrics ?? []).map((m, mi) => {
        const row = refs.metric(m.metric)
        if (!row) add(`${aat}.metrics.${mi}.metric`, `no platform metric "${m.metric}"`)
        return { id: row?.id ?? '', required: m.required ?? false }
      })
      if (new Set(metrics.map((m) => m.id)).size !== metrics.length) add(`${aat}.metrics`, 'has duplicates')
      const tools = (a.tools ?? []).map((t, ti) => {
        const row = refs.tool(t.tool)
        if (!row) add(`${aat}.tools.${ti}.tool`, `no tool "${t.tool}"`)
        return row?.id ?? ''
      })
      return { kind: 'new' as const, input: a, categoryId, focusIds: [...new Set(focusIds)], metrics, tools }
    })
    return { input: p, type, focus, tagIds: [...new Set(tagIds.filter(Boolean))], activities }
  })
  if (newActivities > MAX_NEW_ACTIVITIES) add('programs', `creates ${newActivities} activities; the limit is ${MAX_NEW_ACTIVITIES} per import`)
  return { plan, issues }
}

const summarize = (plan: Awaited<ReturnType<typeof check>>['plan']) =>
  plan.map((p, index) => ({
    index,
    id: null as string | null,
    title: p.input.title.trim(),
    activityCount: p.activities.length,
    newActivityCount: p.activities.filter((a) => a.kind === 'new').length,
  }))

type Plan = Awaited<ReturnType<typeof check>>['plan'][number]

/** Writes one Program draft and its new Activities. Mirrors create/addActivities, inside the batch transaction. */
async function writeProgram(tx: Prisma.TransactionClient, adminId: string, p: Plan) {
  const order: { activityId: string; activityRevisionId: string; frequency?: Frequency | null; localTime?: string | null }[] = []
  for (const a of p.activities) {
    if (a.kind === 'ref') {
      const existing = a.activity!
      const latest = existing.creatorId === null ? await tx.activityRevision.findFirst({ where: { activityId: existing.id }, orderBy: { revisionNumber: 'desc' }, select: { id: true, frequencySnapshot: true, targetTimeSnapshot: true } }) : null
      const revId = latest?.id ?? existing.latestPublishedRevisionId!
      const rev = latest ?? (await tx.activityRevision.findUnique({ where: { id: revId }, select: { frequencySnapshot: true, targetTimeSnapshot: true } }))
      order.push({
        activityId: existing.id,
        activityRevisionId: revId,
        frequency: (rev?.frequencySnapshot as Frequency | null) ?? null,
        localTime: rev?.targetTimeSnapshot ?? null,
      })
      continue
    }
    const title = a.input.title!.trim()
    const summary = a.input.summary?.trim() || null
    const durationMinutes = a.input.durationMinutes ?? null
    const targetTime = a.input.targetTime ?? null
    const frequency = (a.input.frequency ?? undefined) as Prisma.InputJsonValue | undefined
    const activity = await tx.activity.create({
      data: {
        creatorId: null,
        categoryId: a.categoryId,
        title,
        summary,
        durationMinutes,
        targetTime,
        frequency,
        focuses: { create: a.focusIds.map((focusId) => ({ focusId })) },
      },
    })
    const rev = await tx.activityRevision.create({
      data: {
        activityId: activity.id,
        revisionNumber: 1,
        titleSnapshot: title,
        summarySnapshot: summary,
        durationMinutesSnapshot: durationMinutes,
        targetTimeSnapshot: targetTime,
        frequencySnapshot: frequency,
        editorId: adminId,
      },
    })
    for (const [position, i] of (a.input.instructions ?? []).entries()) {
      await tx.instruction.create({ data: { activityRevisionId: rev.id, instructionKey: randomUUID(), position, title: i.title?.trim() || null, body: i.body || null } })
    }
    for (const [position, m] of a.metrics.entries()) {
      await tx.activityMetric.create({ data: { activityRevisionId: rev.id, metricDefinitionId: m.id, position, required: m.required } })
    }
    for (const [position, toolDefinitionId] of a.tools.entries()) {
      await tx.activityTool.create({ data: { activityRevisionId: rev.id, toolDefinitionId, position } })
    }
    await allocateActivitySlug(tx, { activityId: activity.id, title })
    order.push({ activityId: activity.id, activityRevisionId: rev.id, frequency: a.input.frequency ?? null, localTime: targetTime })
  }
  const title = p.input.title.trim()
  const description = p.input.description?.trim() || null
  const durationDays = p.input.durationDays === undefined ? DEFAULT_DURATION_DAYS : p.input.durationDays
  const level = p.input.level ?? 'ALL_LEVELS'
  const sessionMinutes = p.input.sessionMinutes ?? null
  const sessionPresentation = p.input.sessionPresentation ?? 'SEPARATE'
  const program = await tx.program.create({
    data: {
      creatorId: null,
      title,
      description,
      categoryId: p.type!.categoryId,
      programTypeId: p.type!.id,
      focusId: p.focus?.id ?? null,
      level,
      sessionMinutes,
      sessionPresentation,
      visibility: p.input.visibility ?? 'PRIVATE',
      policy: { create: { accessMode: 'OPEN' } },
      ...(p.tagIds.length ? { tags: { create: p.tagIds.map((tagId, position) => ({ tagId, position })) } } : {}),
    },
  })
  const version = await tx.programVersion.create({
    data: {
      programId: program.id,
      versionNumber: 1,
      title,
      description,
      programTypeId: p.type!.id,
      focusId: p.focus?.id ?? null,
      level,
      sessionMinutes,
      sessionPresentation,
      durationDays,
      cycleDays: durationDays === null ? 7 : null,
      frequency: (p.input.frequency ?? DEFAULT_FREQUENCY) as Prisma.InputJsonValue,
      ...(p.input.generationMode ? { generationMode: p.input.generationMode } : {}),
      createdById: adminId,
    },
  })
  await allocateProgramSlug(tx, { programId: program.id, creatorId: null, title })
  await regenerate(tx, version, order, false)
  return program.id
}

/** A replay: the same request (hash-checked), so the plan's summary still describes it. */
async function loadResult(adminId: string, key: string, summary: ReturnType<typeof summarize>) {
  const items = await db.idempotencyKey.findMany({ where: { userId: adminId, scope: ITEM_SCOPE, key: { startsWith: `${key}:` } } })
  const ids = items.sort((a, b) => Number(a.key.split(':').pop()) - Number(b.key.split(':').pop())).map((i) => i.resultRef!)
  return { dryRun: false, valid: true, issues: [] as Issue[], programs: summary.map((s, i) => ({ ...s, id: ids[i] ?? null })) }
}

export async function importContent(adminId: string, input: ImportInput) {
  const author = await authorFor(adminId)
  if (!author.platform) throw badRequest('Only admins import platform content')
  const { plan, issues } = await check(input)
  if (input.dryRun) return { dryRun: true, valid: issues.length === 0, issues, programs: summarize(plan) }
  if (issues.length) throw badRequest('The import has problems; nothing was saved', Object.fromEntries(issues.map((i) => [i.path, i.message])))
  const key = input.idempotencyKey
  if (!key) throw badRequest('An idempotency key is required to import', { idempotencyKey: 'is required' })
  const { dryRun: _d, idempotencyKey: _k, ...request } = input
  const hash = requestHash(request)
  return withIdempotency({
    userId: adminId,
    scope: SCOPE,
    key,
    request,
    load: (ref) => loadResult(adminId, ref, summarize(plan)),
    run: async () => {
      const ids = await db.$transaction(
        async (tx) => {
          const created: string[] = []
          for (const [index, p] of plan.entries()) {
            const id = await writeProgram(tx, adminId, p)
            created.push(id)
            // Per-Program result rows let a replay return exactly what this import created.
            await tx.idempotencyKey.create({
              data: { userId: adminId, scope: ITEM_SCOPE, key: `${key}:${index}`, requestHash: hash, state: 'COMPLETED', resultRef: id, expiresAt: new Date(Date.now() + 24 * 3600_000) },
            })
          }
          return created
        },
        { timeout: 120_000 },
      )
      const summary = summarize(plan)
      return { ref: key, result: { dryRun: false, valid: true, issues: [] as Issue[], programs: summary.map((s, i) => ({ ...s, id: ids[i]! })) } }
    },
  })
}
