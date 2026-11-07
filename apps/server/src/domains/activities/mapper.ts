import { db, type Prisma } from '@project/db'
import { mediaUrl } from '../media/urls'
import { toUserSummary } from '../users/mapper'

export const revisionInclude = {
  instructions: {
    orderBy: { position: 'asc' },
    include: {
      metrics: { orderBy: { position: 'asc' }, include: { metric: true } },
      tools: { orderBy: { position: 'asc' }, include: { tool: true } },
      attachments: { orderBy: { position: 'asc' }, include: { media: true } },
    },
  },
  metrics: { orderBy: { position: 'asc' }, include: { metric: true } },
  tools: { orderBy: { position: 'asc' }, include: { tool: true } },
  attachments: { orderBy: { position: 'asc' }, include: { media: true } },
} satisfies Prisma.ActivityRevisionInclude

export type RevisionFull = Prisma.ActivityRevisionGetPayload<{ include: typeof revisionInclude }>
type MetricBinding = RevisionFull['metrics'][number]
type ToolBinding = RevisionFull['tools'][number]
type Attachment = RevisionFull['attachments'][number]

export const activityInclude = {
  creator: { include: { profile: true } },
  focuses: true,
} satisfies Prisma.ActivityInclude
export type ActivityWithCreator = Prisma.ActivityGetPayload<{ include: typeof activityInclude }>

export function toMediaThumb(a: Attachment, canSelect = true) {
  const m = a.media
  return {
    id: m.id,
    thumbnailUrl: m.state === 'READY' ? mediaUrl(m.id, 'thumb') : null,
    type: m.type,
    durationMs: m.durationMs,
    alt: m.alt ?? '',
    canSelect,
  }
}

export function toMetricBinding(b: MetricBinding) {
  const defaults = (b.defaults as { target?: unknown } | null) ?? null
  const t = defaults?.target
  return {
    id: b.id,
    metricDefinitionId: b.metricDefinitionId,
    key: b.metric.key,
    label: b.metric.label,
    valueType: b.metric.valueType,
    unit: b.metric.unit,
    required: b.required,
    defaultTarget: typeof t === 'number' || typeof t === 'string' || typeof t === 'boolean' ? t : null,
  }
}

export function toToolBinding(b: ToolBinding) {
  return {
    id: b.id,
    key: b.tool.key,
    label: b.tool.label,
    componentKey: b.tool.componentKey,
    config: (b.config as Record<string, unknown> | null) ?? (b.tool.defaultConfig as Record<string, unknown> | null) ?? null,
  }
}

export function toInstruction(i: RevisionFull['instructions'][number]) {
  return {
    id: i.id,
    instructionKey: i.instructionKey,
    position: i.position,
    title: i.title,
    body: i.body,
    media: i.attachments.map((a) => toMediaThumb(a)),
    metrics: i.metrics.map(toMetricBinding),
    tools: i.tools.map(toToolBinding),
  }
}

const VISUAL_PURPOSES = ['COVER', 'ILLUSTRATION', 'DEMONSTRATION'] as const

export function summarizeRevision(rev: RevisionFull | null) {
  if (!rev) return { instructionCount: 0, mediaCount: 0, metricLabels: [] as string[], thumbnailUrl: null as string | null }
  const allAttachments = [...rev.attachments, ...rev.instructions.flatMap((i) => i.attachments)]
  const visual =
    rev.attachments.find((a) => (VISUAL_PURPOSES as readonly string[]).includes(a.purpose) && a.media.state === 'READY') ??
    allAttachments.find((a) => a.media.state === 'READY')
  const metricLabels = [...new Set([...rev.metrics, ...rev.instructions.flatMap((i) => i.metrics)].map((m) => m.metric.label))]
  return {
    instructionCount: rev.instructions.length,
    mediaCount: allAttachments.length,
    metricLabels,
    thumbnailUrl: visual ? mediaUrl(visual.media.id, 'thumb') : null,
  }
}

export function toActivitySummary(a: ActivityWithCreator, rev: RevisionFull | null) {
  return {
    id: a.id,
    revisionId: rev?.id ?? null,
    title: rev?.titleSnapshot ?? a.title,
    summary: rev ? rev.summarySnapshot : a.summary,
    creator: a.creator?.profile ? toUserSummary(a.creator.profile) : null,
    categoryId: a.categoryId,
    focusIds: a.focuses.map((f) => f.focusId),
    ...summarizeRevision(rev),
    visibility: a.visibility,
    status: a.status,
    isCopy: a.sourceActivityId !== null,
    isPlatform: a.creatorId === null,
  }
}

/** Loads revisions for many activities in one query, keyed by revision id. */
export async function loadRevisions(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map<string, RevisionFull>()
  const rows = await db.activityRevision.findMany({ where: { id: { in: unique } }, include: revisionInclude })
  return new Map(rows.map((r) => [r.id, r]))
}
