// 02-DOMAIN.md §2: Category → ProgramType → Focus as seeded lookup data. User-defined values are
// private to their author (reviewState PENDING) until curated; they never enter public discovery.
import { db, type Prisma } from '@project/db'
import { badRequest, notFound } from '../../lib/errors'

const visibleTaxonomy = (viewerId: string | null): Prisma.ProgramTypeWhereInput & Prisma.FocusWhereInput => ({
  isActive: true,
  OR: [{ reviewState: 'APPROVED' }, ...(viewerId ? [{ createdById: viewerId }] : [])],
})

export async function listCategories() {
  const rows = await db.category.findMany({ where: { isActive: true, reviewState: 'APPROVED' }, orderBy: { position: 'asc' } })
  return rows.map((c) => ({ id: c.id, slug: c.slug, label: c.label, icon: c.icon }))
}

type TypeRow = Prisma.ProgramTypeGetPayload<{ include: { focuses: true } }>
const toProgramType = (t: TypeRow) => ({
  id: t.id,
  categoryId: t.categoryId,
  slug: t.slug,
  label: t.label,
  icon: t.icon,
  isFeatured: t.isFeatured,
  focusIds: [...t.focuses].sort((a, b) => a.position - b.position).map((f) => f.focusId),
})

export async function listProgramTypes(viewerId: string | null, categoryId?: string) {
  const rows = await db.programType.findMany({
    where: { ...visibleTaxonomy(viewerId), ...(categoryId ? { categoryId } : {}) },
    include: { focuses: true },
    orderBy: [{ isFeatured: 'desc' }, { position: 'asc' }, { label: 'asc' }],
  })
  return rows.map(toProgramType)
}

const toFocus = (f: { id: string; categoryId: string; slug: string; label: string }) => ({
  id: f.id,
  categoryId: f.categoryId,
  slug: f.slug,
  label: f.label,
})

export async function listFocuses(viewerId: string | null, filter: { categoryId?: string; programTypeId?: string }) {
  const rows = await db.focus.findMany({
    where: {
      ...visibleTaxonomy(viewerId),
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.programTypeId ? { programTypes: { some: { programTypeId: filter.programTypeId } } } : {}),
    },
    orderBy: [{ position: 'asc' }, { label: 'asc' }],
  })
  return rows.map(toFocus)
}

function slugify(label: string) {
  return (
    label
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'custom'
  )
}

async function assertCategory(categoryId: string) {
  const c = await db.category.findUnique({ where: { id: categoryId } })
  if (!c || !c.isActive) throw notFound('Category')
}

/**
 * 02 §2 "Other": normalize the label and reuse an existing value (approved, or the author's own)
 * instead of creating duplicates or globalizing typos.
 */
export async function createCustomProgramType(userId: string, input: { categoryId: string; label: string }) {
  await assertCategory(input.categoryId)
  const label = input.label.trim().replace(/\s+/g, ' ')
  if (!label) throw badRequest('Enter a name', { label: 'is required' })
  const existing = await db.programType.findFirst({
    where: { categoryId: input.categoryId, label, OR: [{ reviewState: 'APPROVED' }, { createdById: userId }] },
    include: { focuses: true },
  })
  if (existing) return toProgramType(existing)
  const base = `u-${slugify(label)}`
  for (let n = 0; n < 50; n++) {
    const slug = n === 0 ? base : `${base}-${n}`
    const clash = await db.programType.findUnique({ where: { categoryId_slug: { categoryId: input.categoryId, slug } } })
    if (clash) continue
    const created = await db.programType.create({
      data: { categoryId: input.categoryId, slug, label, reviewState: 'PENDING', createdById: userId, position: 1000 },
      include: { focuses: true },
    })
    return toProgramType(created)
  }
  throw badRequest('Choose a different name', { label: 'is too similar to existing values' })
}

export async function createCustomFocus(userId: string, input: { categoryId: string; label: string }) {
  await assertCategory(input.categoryId)
  const label = input.label.trim().replace(/\s+/g, ' ')
  if (!label) throw badRequest('Enter a name', { label: 'is required' })
  const existing = await db.focus.findFirst({
    where: { categoryId: input.categoryId, label, OR: [{ reviewState: 'APPROVED' }, { createdById: userId }] },
  })
  if (existing) return toFocus(existing)
  const base = `u-${slugify(label)}`
  for (let n = 0; n < 50; n++) {
    const slug = n === 0 ? base : `${base}-${n}`
    const clash = await db.focus.findUnique({ where: { categoryId_slug: { categoryId: input.categoryId, slug } } })
    if (clash) continue
    return toFocus(
      await db.focus.create({
        data: { categoryId: input.categoryId, slug, label, reviewState: 'PENDING', createdById: userId, position: 1000 },
      }),
    )
  }
  throw badRequest('Choose a different name', { label: 'is too similar to existing values' })
}

export async function listMetricDefinitions(viewerId: string | null, q?: string) {
  const term = q?.trim()
  const rows = await db.metricDefinition.findMany({
    where: {
      OR: [{ ownerId: null }, ...(viewerId ? [{ ownerId: viewerId }] : [])],
      ...(term ? { AND: [{ OR: [{ label: { contains: term } }, { key: { contains: term.toLowerCase() } }] }] } : {}),
    },
    orderBy: { label: 'asc' },
  })
  return rows.map((m) => ({
    id: m.id,
    key: m.key,
    label: m.label,
    valueType: m.valueType,
    unit: m.unit,
    precision: m.precision,
    aggregation: m.aggregation,
    betterDirection: m.betterDirection,
    validation: (m.validation as Record<string, unknown> | null) ?? null,
  }))
}

export async function listToolDefinitions() {
  const rows = await db.toolDefinition.findMany({ orderBy: { label: 'asc' } })
  return rows.map((t) => ({
    id: t.id,
    key: t.key,
    label: t.label,
    componentKey: t.componentKey,
    defaultConfig: (t.defaultConfig as Record<string, unknown> | null) ?? null,
  }))
}

export async function listTags() {
  const rows = await db.tag.findMany({
    where: { isActive: true },
    orderBy: [{ position: 'asc' }, { label: 'asc' }],
  })
  return rows.map((t) => ({
    id: t.id,
    slug: t.slug,
    label: t.label,
    group: t.group ?? null,
  }))
}
