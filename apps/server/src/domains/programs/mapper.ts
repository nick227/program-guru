import type { Prisma } from '@project/db'
import { mediaUrl } from '../media/urls'
import { toUserSummary } from '../users/mapper'
import { frequencyLabel, parseFrequency } from './schedule'
import type { ViewerAccess } from './access'

export const programInclude = {
  programType: { include: { focuses: true } },
  focus: true,
  creator: { include: { profile: true } },
  policy: true,
  prices: { where: { active: true }, orderBy: { kind: 'asc' } },
  latestPublished: true,
  coverMedia: true,
} satisfies Prisma.ProgramInclude

export type ProgramFull = Prisma.ProgramGetPayload<{ include: typeof programInclude }>
type Version = NonNullable<ProgramFull['latestPublished']>

const toProgramType = (t: ProgramFull['programType']) => ({
  id: t.id,
  categoryId: t.categoryId,
  slug: t.slug,
  label: t.label,
  icon: t.icon,
  isFeatured: t.isFeatured,
  focusIds: t.focuses.map((f) => f.focusId),
})

export const toPrice = (p: ProgramFull['prices'][number]) => ({ id: p.id, kind: p.kind, amountMinor: p.amountMinor, currency: p.currency })

/** `version` is the one whose numbers to show: the latest published for most viewers, the draft for its owner. */
export function toProgramSummary(p: ProgramFull, viewerAccess: ViewerAccess, version: Version | null = p.latestPublished) {
  return {
    id: p.id,
    title: version?.title ?? p.title,
    type: toProgramType(p.programType),
    focus: p.focus ? { id: p.focus.id, categoryId: p.focus.categoryId, slug: p.focus.slug, label: p.focus.label } : null,
    creator: p.creator?.profile ? toUserSummary(p.creator.profile) : null,
    coverUrl: p.coverMediaId
      ? p.coverMedia?.type === 'VIDEO'
        ? mediaUrl(p.coverMediaId, 'poster')
        : mediaUrl(p.coverMediaId, 'original')
      : null,
    coverMedia: p.coverMediaId && p.coverMedia && p.coverMedia.state === 'READY'
      ? {
          id: p.coverMedia.id,
          type: p.coverMedia.type as 'PHOTO' | 'VIDEO',
          thumbnailUrl: mediaUrl(p.coverMedia.id, 'thumb'),
          posterUrl: p.coverMedia.type === 'VIDEO'
            ? mediaUrl(p.coverMedia.id, 'poster')
            : mediaUrl(p.coverMedia.id, 'original'),
          playbackUrl: p.coverMedia.type === 'VIDEO'
            ? mediaUrl(p.coverMedia.id, 'stream')
            : null,
          durationMs: p.coverMedia.type === 'VIDEO' ? p.coverMedia.durationMs : null,
        }
      : null,
    durationDays: version?.durationDays ?? null,
    programDays: version ? version.programDayCount : null,
    placements: version ? version.placementCount : null,
    frequencyLabel: version ? frequencyLabel(parseFrequency(version.frequency)) : null,
    visibility: p.visibility,
    accessMode: p.policy?.accessMode ?? 'OPEN',
    prices: p.prices.map(toPrice),
    viewerAccess,
    isPlatform: p.creatorId === null,
    slug: p.slug ?? null,
    canonicalUrl: p.creator?.profile?.handle && p.slug
      ? `/@${p.creator.profile.handle}/${p.slug}`
      : p.slug
      ? `/programs/${p.slug}`
      : `/programs/${p.id}`,
  }
}

export const toPlacement = (i: {
  id: string
  activityId: string
  activityRevisionId: string
  relativeDay: number
  localTime: string | null
  position: number
  targetOverrides: Prisma.JsonValue
  isManual: boolean
}, title: string) => ({
  id: i.id,
  activityId: i.activityId,
  revisionId: i.activityRevisionId,
  title,
  relativeDay: i.relativeDay,
  localTime: i.localTime,
  position: i.position,
  targetOverrides: (i.targetOverrides as Record<string, unknown> | null) ?? null,
  isManual: i.isManual,
})
