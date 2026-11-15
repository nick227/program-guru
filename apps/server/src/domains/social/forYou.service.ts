// FOR_YOU Program ordering (12-SOCIAL §5c): deterministic tiers over real records with one truthful
// reason per Program, an emerging-creator interleave, and the existing eligibility filter. No model.
import { db, type Prisma } from '@project/db'

const MAX_CANDIDATES = 300
const MAX_FOLLOWS = 500
const MAX_COMPLETED = 500
const NEW_DAYS = 60

export type ForYouReason = { kind: 'FOLLOWING' | 'YOUR_INTERESTS' | 'EXPLORE'; label: string }

type Candidate = {
  id: string
  creatorId: string | null
  categoryId: string
  focusId: string | null
  createdAt: Date
  rankScore: number
  creatorName: string | null
  domainLabel: string
  focusLabel: string | null
}

/** At most two established Programs before an eligible emerging one; base order kept within each. */
export function interleaveEmerging<T>(items: T[], isEmerging: (item: T) => boolean): T[] {
  const established = items.filter((i) => !isEmerging(i))
  const emerging = items.filter(isEmerging)
  const out: T[] = []
  let run = 0
  while (established.length || emerging.length) {
    if (emerging.length && (run >= 2 || !established.length)) {
      out.push(emerging.shift()!)
      run = 0
    } else {
      out.push(established.shift()!)
      run++
    }
  }
  return out
}

/**
 * Explore: interleave emerging creators within each Domain, then rotate across Domains, so a cold-start
 * viewer sees varied Domains and emerging creators alike.
 */
function acrossDomains(items: Candidate[], isEmerging: (c: Candidate) => boolean): Candidate[] {
  const byDomain = new Map<string, Candidate[]>()
  for (const c of items) byDomain.set(c.categoryId, [...(byDomain.get(c.categoryId) ?? []), c])
  const queues = new Map([...byDomain].map(([k, v]) => [k, interleaveEmerging(v, isEmerging)]))
  const out: Candidate[] = []
  while (out.length < items.length) {
    for (const q of queues.values()) {
      const next = q.shift()
      if (next) out.push(next)
    }
  }
  return out
}

/**
 * Orders eligible Programs for one viewer. `where` is the caller's eligibility and filter clause; owned
 * and ever-enrolled Programs are excluded here. Returns the ids in order with their reasons.
 */
export async function forYouOrder(viewerId: string, where: Prisma.ProgramWhereInput, pickedDomainId: string | undefined, now = new Date()) {
  const recent = new Date(now.getTime() - NEW_DAYS * 86_400_000)
  const rows = await db.program.findMany({
    where: {
      AND: [
        where,
        { OR: [{ creatorId: null }, { creatorId: { not: viewerId } }] },
        { enrollments: { none: { userId: viewerId } } },
      ],
    },
    select: {
      id: true,
      creatorId: true,
      categoryId: true,
      focusId: true,
      createdAt: true,
      stat: { select: { rankScore: true } },
      category: { select: { label: true } },
      focus: { select: { label: true } },
      creator: { select: { profile: { select: { displayName: true } } } },
    },
    orderBy: [{ stat: { rankScore: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_CANDIDATES,
  })
  const candidates: Candidate[] = rows.map((r) => ({
    id: r.id,
    creatorId: r.creatorId,
    categoryId: r.categoryId,
    focusId: r.focusId,
    createdAt: r.createdAt,
    rankScore: Number(r.stat?.rankScore ?? 0),
    creatorName: r.creator?.profile?.displayName ?? null,
    domainLabel: r.category.label,
    focusLabel: r.focus?.label ?? null,
  }))

  const creatorIds = [...new Set(candidates.map((c) => c.creatorId).filter((id): id is string => !!id))]
  const [follows, completed, ranked, firsts] = await Promise.all([
    db.userFollow.findMany({ where: { followerId: viewerId }, select: { followedId: true }, take: MAX_FOLLOWS }),
    db.calendarItem.findMany({
      where: { ownerId: viewerId, status: 'DONE' },
      select: { activity: { select: { categoryId: true, focuses: { select: { focusId: true } } } } },
      orderBy: { updatedAt: 'desc' },
      take: MAX_COMPLETED,
    }),
    creatorIds.length
      ? db.programStat.findMany({ where: { rankScore: { gt: 0 }, program: { creatorId: { in: creatorIds } } }, select: { program: { select: { creatorId: true } } } })
      : [],
    creatorIds.length
      ? db.program.groupBy({ by: ['creatorId'], where: { creatorId: { in: creatorIds }, status: 'PUBLISHED' }, _min: { createdAt: true } })
      : [],
  ])
  const followed = new Set(follows.map((f) => f.followedId))
  const doneDomains = new Set(completed.map((c) => c.activity.categoryId))
  const doneFocuses = new Set(completed.flatMap((c) => c.activity.focuses.map((f) => f.focusId)))
  const rankedCreators = new Set(ranked.map((r) => r.program.creatorId))
  const firstAt = new Map(firsts.map((f) => [f.creatorId, f._min.createdAt]))
  // Emerging: no ranked Program yet, or a first Program in the last 60 days. Platform is never emerging.
  const emerging = (c: Candidate) =>
    !!c.creatorId && (!rankedCreators.has(c.creatorId) || (firstAt.get(c.creatorId) ?? new Date(0)) >= recent)
  const isNew = (c: Candidate) => c.createdAt >= recent

  const reasons = new Map<string, ForYouReason>()
  const following: Candidate[] = []
  const interests: Candidate[] = []
  const explore: Candidate[] = []
  for (const c of candidates) {
    if (c.creatorId && followed.has(c.creatorId) && c.creatorName) {
      following.push(c)
      reasons.set(c.id, { kind: 'FOLLOWING', label: `${isNew(c) ? 'New from' : 'From'} ${c.creatorName}, who you follow` })
    } else if (c.focusId && doneFocuses.has(c.focusId) && c.focusLabel) {
      interests.push(c)
      reasons.set(c.id, { kind: 'YOUR_INTERESTS', label: `Matches your ${c.focusLabel} Activities` })
    } else if (doneDomains.has(c.categoryId)) {
      interests.push(c)
      reasons.set(c.id, { kind: 'YOUR_INTERESTS', label: `Matches your ${c.domainLabel} Activities` })
    } else if (pickedDomainId && c.categoryId === pickedDomainId) {
      interests.push(c)
      reasons.set(c.id, { kind: 'YOUR_INTERESTS', label: `In ${c.domainLabel}, which you picked` })
    } else {
      explore.push(c)
      reasons.set(c.id, { kind: 'EXPLORE', label: `${isNew(c) ? 'New in' : 'Explore'} ${c.domainLabel}` })
    }
  }
  const ordered = [
    ...interleaveEmerging(following, emerging),
    ...interleaveEmerging(interests, emerging),
    ...acrossDomains(explore, emerging),
  ]
  return { ids: ordered.map((c) => c.id), reasons }
}
