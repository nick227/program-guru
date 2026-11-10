// Moderation (12-SOCIAL §7): the report queue and pending public media contributions, over the
// existing moderation operations. Every resolution records a reason in the audit trail.
import { Link } from 'react-router-dom'
import { useAdminList, useModeratePublication, useResolveReport, type AdminListQuery, type AdminListRow, type components } from '@project/sdk'
import { defineResource, type Action } from '../types'
import { date, label, options, Person } from './shared'

type Report = AdminListRow<'/moderation/reports'>
type Publication = AdminListRow<'/moderation/publications'>
type Kind = components['schemas']['ModerationActionKind']

const targetHref = (t: Report['target']) =>
  ({ PROGRAM: `/programs/${t.id}`, ACTIVITY: `/activities/${t.id}`, MEDIA: `/media/${t.id}`, USER: `/admin/users/${t.id}`, COMMENT: undefined })[t.type]

/** One resolution: a status, an optional moderation action on the target, and the audit reason. */
const resolution = (status: 'RESOLVED' | 'DISMISSED', action?: Kind) =>
  function useResolution() {
    const m = useResolveReport()
    return (r: Report, ctx: { reason: string }) => m.mutateAsync({ reportId: r.id, status, reason: ctx.reason, ...(action ? { action } : {}) })
  }

const open = (r: Report) => r.status === 'OPEN'
const reportActions: Action<Report>[] = [
  { label: 'Hide content', when: (r) => open(r) && r.target.type !== 'USER', reason: true, confirm: 'Hides it everywhere. The owner keeps their copy.', useRun: resolution('RESOLVED', 'HIDE') },
  { label: 'Unlist', when: (r) => open(r) && r.target.type === 'PROGRAM', reason: true, confirm: 'Removes the Program from search and discovery; direct links keep working.', useRun: resolution('RESOLVED', 'UNLIST') },
  { label: 'Restrict publishing', when: (r) => open(r) && r.target.type === 'USER', reason: true, confirm: 'The account can no longer publish publicly. Existing content stays.', useRun: resolution('RESOLVED', 'RESTRICT_PUBLISHING') },
  { label: 'Suspend account', tone: 'danger', when: (r) => open(r) && r.target.type === 'USER', reason: true, confirm: 'Signs the account out and blocks sign-in.', useRun: resolution('RESOLVED', 'SUSPEND_USER') },
  { label: 'Resolve', when: open, reason: true, confirm: 'Closes the report without changing the content.', useRun: resolution('RESOLVED') },
  { label: 'Dismiss', when: open, reason: true, useRun: resolution('DISMISSED') },
]

export const reports = defineResource<Report, Report, AdminListQuery<'/moderation/reports'>>({
  path: 'moderation',
  section: 'moderation',
  label: 'Reports',
  singular: 'Report',
  list: {
    useList: (q) => useAdminList('/moderation/reports', q),
    rowId: (r) => r.id,
    rowHref: () => undefined,
    filters: [{ key: 'status', label: 'Status', options: options(['RESOLVED', 'DISMISSED']), allLabel: 'open' }],
    columns: [
      { key: 'reason', label: 'Reason', render: (r) => <span><strong>{label(r.reason)}</strong>{r.details && <span className="block text-xs text-muted">{r.details}</span>}</span> },
      {
        key: 'target',
        label: 'Reported',
        render: (r) => {
          const href = targetHref(r.target)
          return href ? <Link to={href} className="hover:text-accent">{label(r.target.type)}</Link> : label(r.target.type)
        },
      },
      { key: 'reporter', label: 'By', render: (r) => <Person person={r.reporter ? { ...r.reporter, handle: r.reporter.handle ?? null } : null} />, priority: 'low' },
      { key: 'filed', label: 'Filed', render: (r) => date(r.createdAt) },
      { key: 'status', label: 'Status', render: (r) => (r.resolvedAt ? `${label(r.status)} ${date(r.resolvedAt)}` : label(r.status)), priority: 'low' },
    ],
    actions: reportActions,
    empty: 'No reports here.',
  },
})

export const contributions = defineResource<Publication, Publication, AdminListQuery<'/moderation/publications'>>({
  path: 'moderation/media',
  section: 'moderation',
  label: 'Media approvals',
  singular: 'Contribution',
  list: {
    useList: (q) => useAdminList('/moderation/publications', q),
    rowId: (p) => p.id,
    rowHref: (p) => `/media/${p.id}`,
    columns: [
      { key: 'media', label: 'Media', render: (p) => (p.media.thumbnailUrl ? <img src={p.media.thumbnailUrl} alt={p.media.alt || 'Contributed media'} className="h-14 w-20 rounded object-cover" /> : 'Media') },
      { key: 'caption', label: 'Caption', render: (p) => p.caption || <span className="text-muted">No caption</span> },
      { key: 'by', label: 'By', render: (p) => <Person person={p.creator ? { ...p.creator, handle: p.creator.handle ?? null } : null} /> },
      { key: 'activity', label: 'For', render: (p) => (p.activityId ? <Link to={`/activities/${p.activityId}`} className="hover:text-accent">Activity</Link> : '—'), priority: 'low' },
      { key: 'shared', label: 'Shared', render: (p) => date(p.publishedAt), priority: 'low' },
    ],
    actions: [
      {
        label: 'Approve',
        useRun: () => {
          const m = useModeratePublication()
          return (p) => m.mutateAsync({ publicationId: p.id, decision: 'APPROVE' })
        },
      },
      {
        label: 'Reject',
        tone: 'danger',
        reason: true,
        confirm: 'It stays in the owner’s library; it just is not shown publicly.',
        useRun: () => {
          const m = useModeratePublication()
          return (p, ctx) => m.mutateAsync({ publicationId: p.id, decision: 'REJECT', note: ctx.reason })
        },
      },
    ],
    empty: 'No public contributions are waiting for review.',
  },
})
