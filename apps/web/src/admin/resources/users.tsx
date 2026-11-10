// Users: search accounts, inspect them, change role, suspend or reactivate. The account's Programs,
// access and history are the Content, Membership and audit tables with a fixed filter.
import { useAdminList, useAdminUser, useUpdateAdminUser, type AdminListQuery, type AdminListRow, type components } from '@project/sdk'
import { ResourceForm } from '../components/ResourceForm'
import { ResourceTable } from '../components/ResourceTable'
import { defineResource, type Badge, type Field } from '../types'
import { audit } from './audit'
import { content } from './content'
import { grants, purchases, subscriptions } from './membership'
import { date, label, options } from './shared'

type User = AdminListRow<'/admin/users'>
type Detail = components['schemas']['AdminUserDetail']
type Access = { role: Detail['role']; status: 'ACTIVE' | 'SUSPENDED'; reason: string }

const ROLES = ['USER', 'MODERATOR', 'ADMIN'] as const
const badges = (u: User): Badge[] => [
  ...(u.role !== 'USER' ? [{ label: label(u.role), tone: 'accent' as const }] : []),
  ...(u.status !== 'ACTIVE' ? [{ label: label(u.status), tone: 'danger' as const }] : []),
  ...(!u.emailVerified ? [{ label: 'Unverified', tone: 'muted' as const }] : []),
]

const accessFields: Field<Access>[] = [
  { kind: 'select', name: 'role', label: 'Role', required: true, options: options(ROLES), help: 'Moderators review reports; admins also manage content, accounts and access.' },
  { kind: 'select', name: 'status', label: 'Status', required: true, options: options(['ACTIVE', 'SUSPENDED']), help: 'Suspending signs the account out everywhere.' },
  { kind: 'text', name: 'reason', label: 'Reason', required: true, maxLength: 500, help: 'Kept in the audit log.' },
]

function AccessForm({ user }: { user: Detail }) {
  const update = useUpdateAdminUser()
  if (user.status === 'DEACTIVATED') return <p className="text-sm text-muted">Deactivated {date(user.deactivatedAt)} by its owner. Only the owner can reactivate it.</p>
  return (
    <ResourceForm
      key={`${user.role}:${user.status}`}
      fields={accessFields}
      initial={{ role: user.role, status: user.status as Access['status'], reason: '' }}
      submitLabel="Save access"
      onSubmit={(v, c) => update.mutateAsync({ userId: user.id, reason: v.reason.trim(), ...(c.role ? { role: c.role } : {}), ...(c.status ? { status: c.status } : {}) })}
    />
  )
}

export const users = defineResource<User, Detail, AdminListQuery<'/admin/users'>>({
  path: 'users',
  section: 'users',
  label: 'Users',
  singular: 'User',
  list: {
    useList: (q) => useAdminList('/admin/users', q),
    rowId: (u) => u.id,
    search: 'Name, handle or email',
    filters: [
      { key: 'role', label: 'Role', options: options(ROLES) },
      { key: 'status', label: 'Status', options: options(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']) },
    ],
    columns: [
      { key: 'name', label: 'Name', render: (u) => <>{u.displayName}{u.handle && <span className="font-normal text-muted"> @{u.handle}</span>}</> },
      { key: 'email', label: 'Email', render: (u) => u.email, priority: 'low' },
      { key: 'access', label: 'Access', render: (u) => (badges(u).length ? badges(u).map((b) => b.label).join(' · ') : 'User') },
      { key: 'joined', label: 'Joined', render: (u) => date(u.createdAt), priority: 'low' },
    ],
  },
  editor: {
    useRecord: useAdminUser,
    title: (u) => u.displayName,
    subtitle: (u) => `${u.handle ? `@${u.handle} · ` : ''}${u.email} · joined ${date(u.createdAt)}`,
    badges: (u) => badges(u),
    actions: [{ label: 'View profile', href: (u) => `/${u.handle}`, when: (u) => !!u.handle && u.status === 'ACTIVE' }],
    sections: [
      { key: 'access', title: 'Access', render: (u) => <AccessForm user={u} /> },
      { key: 'programs', title: 'Content', render: (u) => <ResourceTable resource={content} fixed={{ creatorId: u.id }} /> },
      { key: 'grants', title: 'Program access', when: (u) => u.counts.grants > 0, render: (u) => <ResourceTable resource={grants} fixed={{ userId: u.id }} /> },
      { key: 'subscriptions', title: 'Subscriptions', when: (u) => u.counts.subscriptions > 0, render: (u) => <ResourceTable resource={subscriptions} fixed={{ userId: u.id }} /> },
      { key: 'purchases', title: 'Purchases', when: (u) => u.counts.purchases > 0, render: (u) => <ResourceTable resource={purchases} fixed={{ userId: u.id }} /> },
      { key: 'history', title: 'History', render: (u) => <ResourceTable resource={audit} fixed={{ targetId: u.id }} /> },
    ],
  },
})
