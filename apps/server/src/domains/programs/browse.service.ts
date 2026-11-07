// Program Storefront data (13-PROFILES-AND-EXPERIENCE.md §4) and full version content for entitled users.
import { db } from '@project/db'
import { notFound } from '../../lib/errors'
import { getDetail } from '../activities/activity.service'
import { loadRevisions } from '../activities/mapper'
import { mediaUrl } from '../media/urls'
import { canSeeProgram, isProgramOwner, marketplaceEnabled, resolveAccess } from './access'
import { programInclude, toPlacement, toProgramSummary } from './mapper'
import { parseFrequency } from './schedule'

const MIN_PUBLIC_SAMPLE = 5 // 12 §10: suppress small-group statistics

/** `invited`: a valid group invitation lets its holder preview a private Program (07 §5). */
export async function preview(viewerId: string | null, programId: string, opts: { invited?: boolean } = {}) {
  const p = await db.program.findUnique({ where: { id: programId }, include: programInclude })
  if (!p || (!(await canSeeProgram(viewerId, p)) && !(opts.invited && p.status === 'PUBLISHED' && !p.moderatedAt))) throw notFound('Program')
  const access = await resolveAccess(viewerId, p)
  const version = p.latestPublished
  const items = version
    ? await db.programScheduleItem.findMany({ where: { programVersionId: version.id }, orderBy: [{ relativeDay: 'asc' }, { position: 'asc' }] })
    : []
  const revs = await loadRevisions(items.map((i) => i.activityRevisionId))
  // Preview-safe outline: titles, first day, and only platform-licensed imagery. Never locked
  // instructions or a creator's private media (07 §3).
  const outline: { title: string; dayIndex: number | null; mediaPreviewUrl: string | null }[] = []
  const seen = new Set<string>()
  for (const i of items) {
    if (seen.has(i.activityId)) continue
    seen.add(i.activityId)
    const rev = revs.get(i.activityRevisionId)
    const platformVisual = rev?.attachments.find((a) => a.media.ownerId === null && a.media.state === 'READY')
    outline.push({ title: rev?.titleSnapshot ?? 'Activity', dayIndex: i.relativeDay, mediaPreviewUrl: platformVisual ? mediaUrl(platformVisual.mediaId) : null })
  }
  const [stat, mine] = await Promise.all([
    db.programStat.findUnique({ where: { programId } }),
    viewerId ? db.programEnrollment.findFirst({ where: { userId: viewerId, programId, status: { in: ['ACTIVE', 'PAUSED', 'PENDING_ACCESS'] } } }) : null,
  ])
  const sampleOk = (stat?.enrollmentCount ?? 0) >= MIN_PUBLIC_SAMPLE
  const mode = p.policy?.accessMode ?? 'OPEN'
  const joinable = p.status === 'PUBLISHED' && !!version && !mine
  const owner = isProgramOwner(p, viewerId)
  return {
    ...toProgramSummary(p, access),
    description: version?.description ?? p.description,
    latestVersionId: version?.id ?? null,
    safeActivityOutline: outline,
    enrollmentCount: sampleOk ? stat!.enrollmentCount : null,
    completionRate: sampleOk && stat?.completionRate != null ? Number(stat.completionRate) : null,
    canJoin: !!viewerId && joinable && (owner || mode === 'OPEN' || access === 'GRANTED'),
    canRequestAccess: !!viewerId && joinable && !owner && mode === 'APPROVAL' && access === 'PREVIEW',
    canPurchase: !!viewerId && joinable && !owner && mode === 'PAID' && marketplaceEnabled() && p.prices.length > 0 && (access === 'PREVIEW' || access === 'LAPSED'),
    myEnrollmentId: mine?.id ?? null,
  }
}

/** Full content of a published version (or the owner's draft): owner or entitled users only. */
export async function versionDetail(viewerId: string, versionId: string) {
  const version = await db.programVersion.findUnique({ where: { id: versionId }, include: { program: true } })
  if (!version) throw notFound('Program')
  const p = version.program
  const owner = isProgramOwner(p, viewerId)
  if (!owner && (!version.publishedAt || !(await canSeeProgram(viewerId, p)) || (await resolveAccess(viewerId, p)) !== 'GRANTED')) {
    throw notFound('Program')
  }
  const items = await db.programScheduleItem.findMany({ where: { programVersionId: versionId }, orderBy: [{ relativeDay: 'asc' }, { position: 'asc' }] })
  const revs = await loadRevisions(items.map((i) => i.activityRevisionId))
  const pinned = new Map<string, string>()
  for (const i of items) if (!pinned.has(i.activityId)) pinned.set(i.activityId, i.activityRevisionId)
  const activities = []
  for (const [activityId, revisionId] of pinned) activities.push(await getDetail(viewerId, activityId, revisionId))
  return {
    id: version.id,
    programId: p.id,
    versionNumber: version.versionNumber,
    title: version.title,
    description: version.description,
    durationDays: version.durationDays,
    cycleDays: version.cycleDays,
    frequency: parseFrequency(version.frequency),
    programDays: version.programDayCount,
    placements: version.placementCount,
    publishedAt: version.publishedAt?.toISOString() ?? null,
    schedule: items.map((i) => toPlacement(i, revs.get(i.activityRevisionId)?.titleSnapshot ?? 'Activity')),
    activities,
  }
}
