import { createHash, randomUUID } from 'node:crypto'
import { db, type Place, type Prisma } from '@project/db'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { withIdempotency } from '../../lib/idempotency'
import { offsetArgs, toOffsetPage } from '../../lib/paging'

export type BusinessLink = { handle: string; displayName: string; profileUrl: string }
export function toPlace(p: Place, viewerId: string | null = null, businessProfile: BusinessLink | null = null) {
  if (p.visibility === 'PRIVATE' && (!viewerId || p.submittedByUserId !== viewerId)) return null
  return {
    id: p.id, slug: p.slug, name: p.name, kind: p.kind, addressLine: p.addressLine,
    locality: p.locality, region: p.region, countryCode: p.countryCode, postalCode: p.postalCode,
    sourceUrl: p.sourceUrl, accessNote: p.accessNote, visibility: p.visibility,
    businessProfile, isActive: p.isActive, updatedAt: p.updatedAt.toISOString(),
    canManage: !!viewerId && (p.businessProfileUserId === viewerId || (p.visibility === 'PRIVATE' && p.submittedByUserId === viewerId)),
  }
}
export type PlaceMap = Map<string, ReturnType<typeof toPlace>>

/** One profile query for a whole result set, with visibility, account status and both block directions. */
export async function projectPlaces(rows: (Place | null)[], viewerId: string | null): Promise<PlaceMap> {
  const places = rows.filter((p): p is Place => !!p)
  const ids = [...new Set(places.map(p => p.businessProfileUserId).filter((id): id is string => !!id))]
  const blocked = viewerId && ids.length ? await db.userBlock.findMany({
    where: { OR: [{ blockerId: viewerId, blockedId: { in: ids } }, { blockedId: viewerId, blockerId: { in: ids } }] },
    select: { blockerId: true, blockedId: true },
  }) : []
  const hidden = new Set(blocked.map(b => b.blockerId === viewerId ? b.blockedId : b.blockerId))
  const profiles = ids.length ? await db.userProfile.findMany({
    where: { userId: { in: ids.filter(id => !hidden.has(id)) }, visibility: 'PUBLIC', user: { status: 'ACTIVE' } },
    select: { userId: true, handle: true, displayName: true },
  }) : []
  const byId = new Map(profiles.map(p => [p.userId, { handle: p.handle, displayName: p.displayName, profileUrl: `/@${p.handle}` }]))
  return new Map(places.map(p => [p.id, toPlace(p, viewerId, byId.get(p.businessProfileUserId ?? '') ?? null)]))
}
const visible = (viewerId: string | null): Prisma.PlaceWhereInput => ({
  OR: [{ visibility: 'PUBLIC' }, ...(viewerId ? [{ visibility: 'PRIVATE' as const, submittedByUserId: viewerId }] : [])],
})
export async function listPlaces(viewerId: string | null, filter: { q?: string; locality?: string; cursor?: string; limit?: number; publicOnly?: boolean }) {
  const { limit, skip, take } = offsetArgs({ ...filter, limit: Math.min(filter.limit ?? 10, 25) })
  const q = filter.q?.trim()
  const rows = await db.place.findMany({
    where: { AND: [filter.publicOnly ? { visibility: 'PUBLIC' } : visible(viewerId), { isActive: true }, ...(filter.locality ? [{ locality: filter.locality.trim() }] : []),
      ...(q ? [{ OR: ['name', 'addressLine', 'locality', 'region', 'postalCode'].map(field => ({ [field]: { contains: q } })) }] : [])] },
    orderBy: [{ name: 'asc' }, { id: 'asc' }], skip, take,
  })
  const projected = await projectPlaces(rows, viewerId)
  return toOffsetPage(rows, limit, skip, p => projected.get(p.id)!)
}
export async function getPlace(ref: string, viewerId: string | null = null) {
  const row = await db.place.findFirst({ where: { AND: [visible(viewerId), { OR: [{ id: ref }, { slug: ref }] }] } })
  if (!row || (!row.isActive && (!viewerId || (row.businessProfileUserId !== viewerId && row.submittedByUserId !== viewerId)))) throw notFound('Place')
  return (await projectPlaces([row], viewerId)).get(row.id)!
}
export async function assertActivePlace(placeId: string | null | undefined, viewerId: string | null = null) {
  if (!placeId) return
  const p = await db.place.findFirst({ where: { id: placeId, isActive: true, ...visible(viewerId) } })
  if (!p) throw badRequest('Choose an available location', { placeId: 'not found' })
}
export type PlaceInput = {
  name: string; addressLine: string; locality?: string; region?: string; countryCode: string; postalCode?: string | null
  kind?: string; sourceUrl?: string | null; accessNote?: string | null
}
const clean = (value: string) => value.trim().replace(/\s+/g, ' ')
function fields(input: PlaceInput) {
  const name = clean(input.name), addressLine = clean(input.addressLine)
  if (!name || !addressLine) throw badRequest('Enter a location name and address')
  const countryCode = input.countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(countryCode)) throw badRequest('Use a two-letter country code')
  const sourceUrl = safeWebsite(input.sourceUrl)
  const data = { name, addressLine, locality: clean(input.locality ?? ''), region: clean(input.region ?? ''), countryCode,
    postalCode: input.postalCode?.trim() || null, kind: input.kind?.trim() || 'other', sourceUrl, accessNote: input.accessNote?.trim() || null }
  const normalized = [name, addressLine, data.locality, data.region, countryCode, data.postalCode ?? ''].map(v => v.normalize('NFKC').toLowerCase()).join('|')
  return { ...data, addressFingerprint: createHash('sha256').update(normalized).digest('hex') }
}
export function safeWebsite(value: string | null | undefined) {
  if (!value?.trim()) return null
  try {
    const u = new URL(value.trim())
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error()
    if (u.toString().length > 500) throw new Error()
    return u.toString()
  } catch { throw badRequest('Enter an http or https website address') }
}
export async function createPlace(userId: string, input: PlaceInput & { visibility?: 'PUBLIC' | 'PRIVATE'; linkToMyBusiness?: boolean; idempotencyKey: string }) {
  const { idempotencyKey, ...request } = input
  const data = fields(input)
  const visibility = input.visibility ?? 'PUBLIC'
  if (input.linkToMyBusiness && visibility !== 'PUBLIC') throw badRequest('Business directory locations must be public')
  return withIdempotency({ userId, scope: 'places:create', key: idempotencyKey, request,
    load: ref => getPlace(ref, userId),
    run: async () => {
      const duplicate = await db.place.findFirst({ where: { AND: [visible(userId), { isActive: true }, { OR: [{ addressFingerprint: data.addressFingerprint }, { name: data.name, addressLine: data.addressLine, locality: data.locality, countryCode: data.countryCode }] }] } })
      if (duplicate) throw conflict('This location already exists. Search for and select it; contact an administrator to associate an existing business location.')
      const id = randomUUID()
      await db.place.create({ data: { ...data, id, slug: `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 65)}-${id}`,
        visibility, provenance: 'USER', submittedByUserId: userId, businessProfileUserId: input.linkToMyBusiness ? userId : null } })
      return { ref: id, result: await getPlace(id, userId) }
    },
  })
}
export async function updatePlace(userId: string, id: string, input: Partial<PlaceInput> & { expectedUpdatedAt: string; isActive?: boolean; unlinkBusiness?: boolean }) {
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM Place WHERE id = ${id} FOR UPDATE`
    const p = await tx.place.findUnique({ where: { id } })
    if (!p) throw notFound('Place')
    if (p.businessProfileUserId !== userId && !(p.visibility === 'PRIVATE' && p.submittedByUserId === userId)) throw forbidden('You do not manage this location')
    if (p.updatedAt.toISOString() !== new Date(input.expectedUpdatedAt).toISOString()) throw conflict('This location changed. Reload and try again.')
    const data = fields({ ...p, addressLine: p.addressLine ?? '', ...input })
    await tx.place.update({ where: { id }, data: { ...data, isActive: input.isActive, ...(input.unlinkBusiness ? { businessProfileUserId: null } : {}) } })
  })
  // The unlink response must not require continued management rights.
  const p = await db.place.findUniqueOrThrow({ where: { id } })
  return (await projectPlaces([p], userId)).get(id)!
}
export async function associatePlace(adminId: string, id: string, input: { businessProfileUserId: string | null; expectedUpdatedAt: string }) {
  if ((await db.user.findUnique({ where: { id: adminId } }))?.role !== 'ADMIN') throw forbidden()
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM Place WHERE id = ${id} FOR UPDATE`
    const p = await tx.place.findUnique({ where: { id } })
    if (!p || p.visibility !== 'PUBLIC') throw notFound('Place')
    if (p.updatedAt.toISOString() !== new Date(input.expectedUpdatedAt).toISOString()) throw conflict('This location changed. Reload and try again.')
    if (input.businessProfileUserId && !await tx.userProfile.findFirst({ where: { userId: input.businessProfileUserId, user: { status: 'ACTIVE' } } })) throw badRequest('Choose an active profile')
    await tx.place.update({ where: { id }, data: { businessProfileUserId: input.businessProfileUserId } })
    await tx.placeAssociationAudit.create({ data: { actorId: adminId, placeId: id, previousProfileId: p.businessProfileUserId, nextProfileId: input.businessProfileUserId } })
  })
  const place = await db.place.findUniqueOrThrow({ where: { id } })
  return (await projectPlaces([place], adminId)).get(id)!
}
