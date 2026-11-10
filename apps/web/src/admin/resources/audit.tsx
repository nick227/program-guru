// Audit trail: embedded in editors as "History" with a fixed targetId; not a tab of its own.
import { useAdminList, type AdminListQuery, type AdminListRow } from '@project/sdk'
import { defineResource } from '../types'
import { dateTime, label, Person } from './shared'

type Entry = AdminListRow<'/admin/audit'>

export const audit = defineResource<Entry, Entry, AdminListQuery<'/admin/audit'>>({
  path: 'audit',
  section: 'users',
  label: 'History',
  singular: 'Entry',
  nav: false,
  list: {
    useList: (q) => useAdminList('/admin/audit', q),
    rowId: (e) => e.id,
    rowHref: () => undefined,
    columns: [
      { key: 'action', label: 'Action', render: (e) => label(e.action) },
      { key: 'reason', label: 'Reason', render: (e) => e.reason },
      { key: 'actor', label: 'By', render: (e) => (e.actor ? <Person person={e.actor} /> : <span className="text-muted">Server command</span>) },
      { key: 'when', label: 'When', render: (e) => dateTime(e.createdAt) },
    ],
    empty: 'No administrative changes yet.',
  },
})
