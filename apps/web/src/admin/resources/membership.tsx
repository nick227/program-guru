// Membership: read-mostly views over existing billing and access records. Grant and revoke use the
// existing audited operations; prices are set by creators and refunds happen in Stripe (ADR 0001).
import { useAdminList, useGrantProgramAccess, useRevokeProgramAccess, type AdminListQuery, type AdminListRow } from '@project/sdk'
import { defineResource, type Field } from '../types'
import { date, label, money, options, Person, ProgramLink, useProgramSearch, useUserSearch, yesNo } from './shared'

type Grant = AdminListRow<'/admin/membership/grants'>
type Subscription = AdminListRow<'/admin/membership/subscriptions'>
type Purchase = AdminListRow<'/admin/membership/purchases'>
type Price = AdminListRow<'/admin/membership/prices'>
type NewGrant = { userId: string; programId: string; expiresAt: string | null; reason: string }

export const grants = defineResource<Grant, Grant, AdminListQuery<'/admin/membership/grants'>>({
  path: 'membership',
  section: 'membership',
  label: 'Access',
  singular: 'Access grant',
  list: {
    useList: (q) => useAdminList('/admin/membership/grants', q),
    rowId: (g) => g.id,
    filters: [
      { key: 'source', label: 'Source', options: options(['OPEN', 'APPROVAL', 'PURCHASE', 'SUBSCRIPTION', 'ADMIN']) },
      { key: 'active', label: 'Active', options: yesNo },
    ],
    columns: [
      { key: 'user', label: 'Person', render: (g) => <Person person={g.user} /> },
      { key: 'program', label: 'Program', render: (g) => <ProgramLink program={g.program} /> },
      { key: 'source', label: 'Source', render: (g) => label(g.source) },
      { key: 'state', label: 'State', render: (g) => (g.active ? `Active${g.expiresAt ? ` until ${date(g.expiresAt)}` : ''}` : g.revokedAt ? `Revoked ${date(g.revokedAt)}` : `Expired ${date(g.expiresAt)}`) },
      { key: 'granted', label: 'Granted', render: (g) => date(g.grantedAt), priority: 'low' },
    ],
    actions: [
      {
        label: 'Revoke',
        tone: 'danger',
        when: (g) => g.active,
        confirm: (g) => `${g.user.displayName} loses access to "${g.program.title}". Their calendar, results and media stay. A paid grant also needs a refund or cancellation in Stripe.`,
        useRun: () => {
          const m = useRevokeProgramAccess()
          return (g) => m.mutateAsync(g.id)
        },
      },
    ],
    links: [{ label: 'Grant access', href: '/admin/membership/new', primary: true }],
    empty: 'No access grants match.',
  },
  create: {
    title: 'Grant Program access',
    submitLabel: 'Grant access',
    initial: { userId: '', programId: '', expiresAt: null, reason: '' } satisfies NewGrant,
    fields: [
      { kind: 'reference', name: 'userId', label: 'Person', required: true, search: useUserSearch, placeholder: 'Name, handle or email' },
      { kind: 'reference', name: 'programId', label: 'Program', required: true, search: useProgramSearch, placeholder: 'Program title' },
      { kind: 'date', name: 'expiresAt', label: 'Expires', help: 'Leave empty for access that does not expire.' },
      { kind: 'text', name: 'reason', label: 'Reason', required: true, maxLength: 500, help: 'Kept with the grant.' },
    ] satisfies Field<NewGrant>[],
    useCreate: () => {
      const m = useGrantProgramAccess()
      return async (v: NewGrant) => (await m.mutateAsync({ programId: v.programId, userId: v.userId, reason: v.reason.trim(), expiresAt: v.expiresAt ? new Date(`${v.expiresAt}T23:59:59`).toISOString() : null })).id
    },
    next: () => '/admin/membership',
  },
})

export const subscriptions = defineResource<Subscription, Subscription, AdminListQuery<'/admin/membership/subscriptions'>>({
  path: 'membership/subscriptions',
  section: 'membership',
  label: 'Subscriptions',
  singular: 'Subscription',
  list: {
    useList: (q) => useAdminList('/admin/membership/subscriptions', q),
    rowId: (s) => s.id,
    filters: [{ key: 'status', label: 'Status', options: options(['INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED']) }],
    columns: [
      { key: 'user', label: 'Person', render: (s) => <Person person={s.user} /> },
      { key: 'program', label: 'Program', render: (s) => <ProgramLink program={s.program} /> },
      { key: 'price', label: 'Price', render: (s) => `${money(s.amountMinor, s.currency)}/mo` },
      { key: 'status', label: 'Status', render: (s) => `${label(s.status)}${s.cancelAtPeriodEnd ? ' · ends at period end' : ''}` },
      { key: 'period', label: 'Paid through', render: (s) => date(s.currentPeriodEnd), priority: 'low' },
    ],
    empty: 'No subscriptions match.',
  },
})

export const purchases = defineResource<Purchase, Purchase, AdminListQuery<'/admin/membership/purchases'>>({
  path: 'membership/purchases',
  section: 'membership',
  label: 'Purchases',
  singular: 'Purchase',
  list: {
    useList: (q) => useAdminList('/admin/membership/purchases', q),
    rowId: (p) => p.id,
    filters: [{ key: 'status', label: 'Status', options: options(['PENDING', 'PAID', 'REFUNDED', 'DISPUTED']) }],
    columns: [
      { key: 'user', label: 'Person', render: (p) => <Person person={p.user} /> },
      { key: 'program', label: 'Program', render: (p) => <ProgramLink program={p.program} /> },
      { key: 'amount', label: 'Amount', render: (p) => money(p.amountMinor, p.currency) },
      { key: 'fee', label: 'Platform fee', render: (p) => money(p.platformFeeMinor, p.currency), priority: 'low' },
      { key: 'status', label: 'Status', render: (p) => label(p.status) },
      { key: 'date', label: 'Date', render: (p) => date(p.createdAt), priority: 'low' },
    ],
    empty: 'No purchases match.',
  },
})

export const prices = defineResource<Price, Price, AdminListQuery<'/admin/membership/prices'>>({
  path: 'membership/prices',
  section: 'membership',
  label: 'Prices',
  singular: 'Price',
  list: {
    useList: (q) => useAdminList('/admin/membership/prices', q),
    rowId: (p) => p.id,
    filters: [{ key: 'active', label: 'Current', options: yesNo }],
    columns: [
      { key: 'program', label: 'Program', render: (p) => <ProgramLink program={p.program} /> },
      { key: 'price', label: 'Price', render: (p) => `${money(p.amountMinor, p.currency)}${p.kind === 'MONTHLY' ? '/mo' : ''}` },
      { key: 'kind', label: 'Kind', render: (p) => (p.kind === 'MONTHLY' ? 'Monthly' : 'One-time') },
      { key: 'sales', label: 'Sales', render: (p) => `${p.purchaseCount} purchases · ${p.subscriptionCount} subscriptions` },
      { key: 'state', label: 'State', render: (p) => (p.active ? 'Current' : 'Retired'), priority: 'low' },
    ],
    empty: 'No Program prices yet. Creators set prices on their Programs.',
  },
})
