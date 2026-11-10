// Content: Programs and Activities in one table. Platform content is edited (programs.tsx,
// activities.tsx); anyone else's is moderation-only (hide, restore, unlist) and keeps its creator.
import { useAdminArchive, useAdminList, useAdminPublish, useDeleteProgram, useImportAdminContent, useModerateAdminContent, type AdminListQuery, type AdminListRow } from '@project/sdk'
import { BadgeList } from '../components/ResourceEditor'
import { defineResource, type Action, type Badge, type ImportResult } from '../types'
import { date, label, options, Person, yesNo } from './shared'

export type ContentItem = AdminListRow<'/admin/content'>

export const statusBadges = (r: { status: string; visibility: string; moderated?: boolean; hasUnpublishedChanges?: boolean; isPlatform?: boolean }): Badge[] => [
  { label: label(r.status), tone: r.status === 'PUBLISHED' ? 'accent' : 'muted' },
  ...(r.hasUnpublishedChanges ? [{ label: 'Unpublished changes', tone: 'warning' as const }] : []),
  ...(r.moderated ? [{ label: 'Hidden by moderation', tone: 'danger' as const }] : []),
]

const publishable = (r: ContentItem) => r.isPlatform && (r.status !== 'PUBLISHED' || r.hasUnpublishedChanges)
const usePublish = () => {
  const m = useAdminPublish()
  return (r: ContentItem) => m.mutateAsync({ kind: r.kind, id: r.id, visibility: r.visibility, accessMode: r.accessMode ?? 'OPEN', expectedRevision: r.draftRevision })
}
const useArchive = () => {
  const m = useAdminArchive()
  return (r: ContentItem) => m.mutateAsync({ kind: r.kind, id: r.id })
}
const moderate = (action: 'HIDE' | 'RESTORE' | 'UNLIST') => function useModerate() {
  const m = useModerateAdminContent()
  return (r: ContentItem, ctx: { reason: string }) => m.mutateAsync({ kind: r.kind, id: r.id, action, reason: ctx.reason })
}

const actions: Action<ContentItem>[] = [
  { label: (r) => (r.status === 'ARCHIVED' ? 'Restore' : 'Publish'), when: publishable, useRun: usePublish, confirm: (r) => `Publishes "${r.title}" as ${label(r.visibility).toLowerCase()}.` },
  { label: 'Archive', when: (r) => r.isPlatform && r.status === 'PUBLISHED', useRun: useArchive, confirm: 'Removes it from discovery and new joins. Participants keep everything.' },
  {
    label: 'Delete',
    tone: 'danger',
    when: (r) => r.isPlatform && r.kind === 'PROGRAM',
    confirm: 'Deletes the Program. If anyone joined, bought or copied it, it is kept for them and only hidden.',
    useRun: () => {
      const m = useDeleteProgram()
      return (r) => m.mutateAsync(r.id)
    },
  },
  { label: 'Hide', when: (r) => !r.isPlatform && !r.moderated, useRun: moderate('HIDE'), reason: true, confirm: 'Hides it everywhere. The creator keeps it.' },
  { label: 'Restore', when: (r) => !r.isPlatform && r.moderated, useRun: moderate('RESTORE'), reason: true },
  { label: 'Unlist', when: (r) => !r.isPlatform && r.kind === 'PROGRAM' && r.visibility === 'PUBLIC', useRun: moderate('UNLIST'), reason: true, confirm: 'Removes it from search and discovery; direct links keep working.' },
]

const EXAMPLE = JSON.stringify(
  {
    programs: [
      {
        title: 'Core Foundations',
        description: 'Four weeks of short core sessions.',
        programType: 'workout',
        focus: 'strength',
        visibility: 'PUBLIC',
        durationDays: 28,
        frequency: { kind: 'N_PER_WEEK', n: 3 },
        activities: [
          { ref: 'plank' },
          { ref: 'dead-bug' },
          {
            title: 'Hollow Hold',
            summary: 'Hold a tight hollow position.',
            instructions: [
              { title: 'Set up', body: 'Lie on your back, arms overhead.' },
              { title: 'Hold', body: 'Lift shoulders and legs; keep the lower back down.' },
            ],
            metrics: [{ metric: 'duration', required: true }],
            tools: [{ tool: 'TIMER' }],
          },
        ],
      },
    ],
  },
  null,
  2,
)

function useContentImport() {
  const m = useImportAdminContent()
  return async (payload: unknown, opts: { dryRun: boolean; idempotencyKey?: string }): Promise<ImportResult> => {
    const r = await m.mutateAsync({ ...(payload as { programs: never[] }), ...opts })
    return {
      valid: r.valid,
      issues: r.issues,
      rows: r.programs.map((p) => ({
        key: String(p.index),
        title: p.title,
        detail: `${p.activityCount} activities, ${p.newActivityCount} new`,
        href: p.id ? `/admin/programs/${p.id}` : undefined,
      })),
    }
  }
}

export const content = defineResource<ContentItem, ContentItem, AdminListQuery<'/admin/content'>>({
  path: 'content',
  section: 'content',
  label: 'Content',
  singular: 'Content',
  list: {
    useList: (q) => useAdminList('/admin/content', q),
    rowId: (r) => r.id,
    rowHref: (r) => (r.isPlatform ? `/admin/${r.kind === 'PROGRAM' ? 'programs' : 'activities'}/${r.id}` : `/${r.kind === 'PROGRAM' ? 'programs' : 'activities'}/${r.id}`),
    search: 'Search titles',
    filters: [
      { key: 'kind', label: 'Type', options: options(['PROGRAM', 'ACTIVITY']) },
      { key: 'owner', label: 'Owner', options: [{ value: 'PLATFORM', label: 'Program Guru' }, { value: 'USERS', label: 'Users' }] },
      { key: 'status', label: 'Status', options: options(['DRAFT', 'PUBLISHED', 'ARCHIVED']) },
      { key: 'visibility', label: 'Privacy', options: options(['PRIVATE', 'UNLISTED', 'PUBLIC']) },
      { key: 'moderated', label: 'Hidden', options: yesNo },
    ],
    columns: [
      { key: 'title', label: 'Title', render: (r) => r.title },
      { key: 'kind', label: 'Type', render: (r) => <span className="text-muted">{label(r.kind)} · {r.typeLabel}{r.durationDays ? ` · ${Math.round(r.durationDays / 7)} wk` : ''}</span> },
      { key: 'owner', label: 'Owner', render: (r) => <Person person={r.creator} />, priority: 'low' },
      { key: 'status', label: 'Status', render: (r) => <BadgeList badges={statusBadges(r)} /> },
      { key: 'visibility', label: 'Privacy', render: (r) => label(r.visibility) },
      { key: 'updated', label: 'Updated', render: (r) => date(r.updatedAt), priority: 'low' },
    ],
    actions,
    bulk: [
      { label: 'Publish', when: publishable, confirm: 'Publish the selected platform drafts with their own privacy settings.', useRun: usePublish },
      { label: 'Archive', when: (r) => r.isPlatform && r.status === 'PUBLISHED', confirm: 'Archive the selected platform content.', useRun: useArchive },
    ],
    links: [
      { label: 'Import', href: '/admin/content/import' },
      { label: 'New Activity', href: '/admin/activities/new' },
      { label: 'New Program', href: '/admin/programs/new', primary: true },
    ],
    empty: 'No content matches these filters.',
  },
  import: {
    title: 'Import Programs',
    description: (
      <>
        Programs with nested Activities, as JSON. Use <code>ref</code> (a slug or id) for an existing Activity, or give the new Activity's fields. Program types, focuses and categories are
        slugs; metrics and tools are catalog keys. Everything is checked before anything is saved, and every Program arrives as a platform draft. Publishing is a separate step after review.
      </>
    ),
    example: EXAMPLE,
    useImport: useContentImport,
    reviewHref: '/admin?owner=PLATFORM&status=DRAFT',
  },
})
