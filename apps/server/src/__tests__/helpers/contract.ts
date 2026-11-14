// Contract cases: one per operationId. Each case builds only the state it needs (World getters are
// memoized per test), calls the route as the right user, asserts the declared success status, and
// validates the body against openapi.yaml. Protected operations also assert 401 without credentials.
import { expect } from 'vitest'
import Stripe from 'stripe'
import { db } from '@project/db'
import { asAuth, rootAdminId, seedUser, testAdminId, testOtherUserId, testUserId, validateResponse } from './index'
import { existingCatalog, makeMedia, seedAchievements, seedCatalog, seedPlace } from './fixtures'
import { setBillingGateway, type BillingGateway } from '../../infrastructure/stripe'
import { unsubscribeToken } from '../../domains/social/notification.service'
import { drain } from '../../worker/outbox'

type App = { inject: (opts: any) => Promise<any> }
type Who = 'alice' | 'bob' | 'carol' | 'mod' | 'admin' | 'anon'
export const carolId = '00000000-0000-4000-8000-0000000000c0'
const ids: Record<Exclude<Who, 'anon'>, string> = { alice: testUserId, bob: testOtherUserId, carol: carolId, mod: testAdminId, admin: rootAdminId }
const START = '2026-11-09'

class Fake implements BillingGateway {
  async createRecipientAccount() {
    return { id: 'acct_world' }
  }
  async createOnboardingLink() {
    return { url: 'https://connect.stripe.test/onboard' }
  }
  async transfersStatus() {
    return 'active'
  }
  async ensurePrice(i: { kind: string; amountMinor: number }) {
    return { priceId: `price_${i.kind}_${i.amountMinor}`, productId: 'prod_world' }
  }
  async productOfPrice() {
    return 'prod_world'
  }
  async createCheckout() {
    return { id: `cs_world_${Math.random().toString(36).slice(2)}`, url: 'https://checkout.stripe.test/world' }
  }
  async setCancelAtPeriodEnd() {}
  async subscription() {
    return { status: 'active', customerId: 'cus_world', currentPeriodEnd: null, cancelAtPeriodEnd: false }
  }
  async portalLink() {
    return { url: 'https://billing.stripe.test/portal' }
  }
}

/** Lazily built shared state. Every getter runs once per test. */
export class World {
  private memo = new Map<string, Promise<any>>()
  constructor(readonly app: App) {}
  private once<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (!this.memo.has(key)) this.memo.set(key, fn())
    return this.memo.get(key)!
  }
  call(who: Who, method: string, url: string, payload?: unknown) {
    return this.app.inject({ method, url, headers: who === 'anon' ? {} : asAuth(ids[who]), ...(payload !== undefined ? { payload } : {}) })
  }
  async ok(who: Who, method: string, url: string, payload?: unknown) {
    const res = await this.call(who, method, url, payload)
    if (res.statusCode >= 300) throw new Error(`World setup ${method} ${url} → ${res.statusCode}: ${res.body}`)
    return res.json().data
  }

  cat = () => this.once('cat', async () => {
    // Reuse whatever the surrounding test file already seeded in its own hooks.
    if (!(await db.user.findUnique({ where: { id: carolId } }))) await seedUser(carolId, 'carol', { visibility: 'PRIVATE' })
    await db.userProfile.update({ where: { userId: carolId }, data: { visibility: 'PRIVATE' } })
    await seedAchievements()
    return (await existingCatalog()) ?? seedCatalog()
  })
  /** The ADMIN account (the default test users include only a MODERATOR). */
  admin = () => this.once('admin', async () => {
    if (!(await db.user.findUnique({ where: { id: rootAdminId } }))) await seedUser(rootAdminId, 'root', { role: 'ADMIN' })
    return rootAdminId
  })
  /** Alice's draft program with both seeded activities. */
  draft = () => this.once('draft', async () => {
    const c = await this.cat()
    let ws = await this.ok('alice', 'POST', '/programs', { programTypeId: c.workout.id, focusId: c.strength.id })
    ws = await this.ok('alice', 'POST', `/programs/${ws.id}/draft/activities`, { activityIds: [c.squats.activity.id, c.legRaises.activity.id], expectedRevision: ws.draftRevision })
    return ws as { id: string; draftRevision: number }
  })
  placement = () => this.once('placement', async () => (await this.ok('alice', 'GET', `/programs/${(await this.draft()).id}/draft/placements`))[0] as { id: string })
  /** Alice's published PUBLIC OPEN program, which Alice herself follows. */
  program = () => this.once('program', async () => {
    const d = await this.draft()
    const ws = await this.ok('alice', 'POST', `/programs/${d.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: d.draftRevision })
    await this.ok('alice', 'POST', `/programs/${d.id}/enrollments`, { programVersionId: ws.latestPublishedVersionId, startLocalDate: START, timezone: 'America/Chicago', idempotencyKey: 'world-alice-join' })
    return { id: d.id as string, versionId: ws.latestPublishedVersionId as string }
  })
  /** Bob's own enrollment, outside any group. */
  bobEnrollment = () => this.once('bobEnrollment', async () => {
    const p = await this.program()
    return (await this.ok('bob', 'POST', `/programs/${p.id}/enrollments`, { programVersionId: p.versionId, startLocalDate: START, timezone: 'America/Chicago', idempotencyKey: 'world-bob-join' })) as { id: string }
  })
  /** Alice's group on the program, with Bob as a member following through it. */
  group = () => this.once('group', async () => {
    const p = await this.program()
    const g = await this.ok('alice', 'POST', '/groups', { programVersionId: p.versionId, mode: 'SYNC', name: 'World crew' })
    const inv = await this.ok('alice', 'POST', `/groups/${g.id}/invitations`, { kind: 'USER', handle: 'bob' })
    // One step: membership, enrollment and calendar together (10 §3).
    await this.ok('bob', 'POST', `/group-invitations/${inv.joinUrl.split('/join/')[1]}/accept`, { enrollment: { timezone: 'America/Chicago', idempotencyKey: 'world-bob-group-join' } })
    return g as { id: string }
  })
  publicGroup = () => this.once('publicGroup', async () => {
    const c = await this.cat()
    let ws = await this.ok('alice', 'POST', '/programs', { programTypeId: c.workout.id, focusId: c.strength.id })
    ws = await this.ok('alice', 'POST', `/programs/${ws.id}/draft/activities`, { activityIds: [c.squats.activity.id], expectedRevision: ws.draftRevision })
    const pub = await this.ok('alice', 'POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })
    const g = await this.ok('alice', 'POST', '/groups', { programVersionId: pub.latestPublishedVersionId, mode: 'SYNC', visibility: 'PUBLIC', joinPolicy: 'OPEN', startLocalDate: START, timezone: 'America/Chicago', name: 'Public crew' })
    return { id: g.id as string, programId: ws.id as string }
  })
  linkInvite = () => this.once('linkInvite', async () => {
    const g = await this.group()
    const inv = await this.ok('alice', 'POST', `/groups/${g.id}/invitations`, { kind: 'LINK' })
    return { id: inv.id as string, token: inv.joinUrl.split('/join/')[1] as string }
  })
  aliceItem = () => this.once('aliceItem', async () => {
    await this.program()
    return db.calendarItem.findFirstOrThrow({ where: { ownerId: testUserId, programDayIndex: 0 }, orderBy: { createdAt: 'asc' } })
  })
  /** A finished session with one result, shared with the group. */
  session = () => this.once('session', async () => {
    await this.group()
    const c = await this.cat()
    const item = await this.aliceItem()
    const s = await this.ok('alice', 'POST', '/sessions', { calendarItemId: item.id, idempotencyKey: 'world-session' })
    const entry = await this.ok('alice', 'POST', `/sessions/${s.id}/results`, { values: [{ metricDefinitionId: c.reps.id, value: 12 }] })
    await this.ok('alice', 'POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: s.revision })
    return { id: s.id as string, entryId: entry.id as string }
  })
  openSession = () => this.once('openSession', async () => {
    const c = await this.cat()
    return (await this.ok('alice', 'POST', '/sessions', { activityId: c.legRaises.activity.id, idempotencyKey: 'world-open-session' })) as { id: string; revision: number }
  })
  share = () => this.once('share', async () => {
    await this.session()
    return db.completionShare.findFirstOrThrow({ where: { userId: testUserId } })
  })
  /** Alice's processed photo. */
  photo = () => this.once('photo', async () => {
    await this.cat()
    const bytes = makeMedia('png')
    const t = await this.ok('alice', 'POST', '/media/uploads', { filename: 'p.png', mime: 'image/png', sizeBytes: bytes.length, alt: 'World photo' })
    await this.app.inject({ method: 'PUT', url: t.uploadUrl.replace(/^https?:\/\/[^/]+/, ''), headers: { 'content-type': 'application/octet-stream' }, payload: bytes })
    await this.ok('alice', 'POST', `/media/uploads/${t.uploadId}/complete`)
    await drain()
    return { id: t.mediaId as string }
  })
  groupPublication = () => this.once('groupPublication', async () => {
    const g = await this.group()
    const m = await this.photo()
    const item = await this.aliceItem()
    return (await this.ok('alice', 'POST', '/media-publications', { mediaId: m.id, audience: 'GROUP', groupId: g.id, occurrenceKey: item.groupOccurrenceKey })) as { id: string }
  })
  publicPublication = () => this.once('publicPublication', async () => {
    const c = await this.cat()
    const m = await this.photo()
    const p = await this.ok('alice', 'POST', '/media-publications', { mediaId: m.id, audience: 'PUBLIC', activityId: c.squats.activity.id, license: 'CC-BY-4.0' })
    await this.ok('mod', 'POST', `/moderation/publications/${p.id}`, { decision: 'APPROVE' })
    return p as { id: string }
  })
  pendingPublication = () => this.once('pendingPublication', async () => {
    const c = await this.cat()
    const m = await this.photo()
    return (await this.ok('alice', 'POST', '/media-publications', { mediaId: m.id, audience: 'PUBLIC', activityId: c.legRaises.activity.id, license: 'CC0-1.0' })) as { id: string }
  })
  comment = () => this.once('comment', async () => {
    const p = await this.groupPublication()
    return (await this.ok('bob', 'POST', `/media-publications/${p.id}/comments`, { body: 'Nice!', idempotencyKey: 'world-comment' })) as { id: string }
  })
  followRequest = () => this.once('followRequest', async () => {
    await this.cat()
    return (await this.ok('alice', 'POST', `/follow-users/${carolId}`)).requestId as string
  })
  approvalProgram = () => this.once('approvalProgram', async () => {
    const c = await this.cat()
    let ws = await this.ok('alice', 'POST', '/programs', { programTypeId: c.workout.id })
    ws = await this.ok('alice', 'POST', `/programs/${ws.id}/draft/activities`, { activityIds: [c.squats.activity.id], expectedRevision: ws.draftRevision })
    await this.ok('alice', 'POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'APPROVAL', expectedRevision: ws.draftRevision })
    return { id: ws.id as string }
  })
  accessRequest = () => this.once('accessRequest', async () => (await this.ok('bob', 'POST', `/programs/${(await this.approvalProgram()).id}/access-requests`)) as { id: string })
  recurrence = () => this.once('recurrence', async () => {
    const c = await this.cat()
    return (await this.ok('alice', 'POST', '/calendar/items', { activityId: c.squats.activity.id, localDate: START, localTime: '18:00', recurrence: { kind: 'WEEKLY', weekdays: [1] }, idempotencyKey: 'world-recurrence' })) as {
      item: { id: string; updatedAt: string }
      recurrence: { id: string }
    }
  })
  achievement = () => this.once('achievement', async () => {
    await this.session()
    return db.userAchievement.findFirstOrThrow({ where: { userId: testUserId } })
  })
  notification = () => this.once('notification', async () => {
    await this.cat()
    return db.notification.create({ data: { recipientId: testUserId, type: 'FOLLOW_REQUEST', title: 'New follow request', deepLink: '/', entityKind: 'USER', entityId: carolId } })
  })
  report = () => this.once('report', async () => (await this.ok('bob', 'POST', '/reports', { target: { type: 'PROGRAM', id: (await this.program()).id }, reason: 'MISLEADING' })) as { id: string })
  grant = () => this.once('grant', async () => (await this.ok('mod', 'POST', `/moderation/programs/${(await this.approvalProgram()).id}/grants`, { userId: carolId, reason: 'Support' })) as { id: string })
  /** Marketplace on, Alice paid program, Bob's active subscription. */
  market = () => this.once('market', async () => {
    process.env.MARKETPLACE_ENABLED = 'true'
    setBillingGateway(new Fake())
    const c = await this.cat()
    await db.creatorPayoutAccount.create({ data: { userId: testUserId, providerAccountId: 'acct_world', status: 'ACTIVE', chargesEnabled: true, payoutsEnabled: true } })
    let ws = await this.ok('alice', 'POST', '/programs', { programTypeId: c.workout.id })
    ws = await this.ok('alice', 'POST', `/programs/${ws.id}/draft/activities`, { activityIds: [c.squats.activity.id], expectedRevision: ws.draftRevision })
    const prices = await this.ok('alice', 'PUT', `/programs/${ws.id}/prices`, { prices: [{ kind: 'ONE_TIME', amountMinor: 1500 }, { kind: 'MONTHLY', amountMinor: 400 }] })
    ws = await this.ok('alice', 'GET', `/programs/${ws.id}/workspace`)
    await this.ok('alice', 'POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'PAID', expectedRevision: ws.draftRevision })
    const monthly = prices.find((p: any) => p.kind === 'MONTHLY')
    const sub = await db.billingSubscription.create({ data: { userId: testOtherUserId, programId: ws.id, priceId: monthly.id, status: 'ACTIVE', providerSubscriptionId: 'sub_world', currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000) } })
    return { programId: ws.id as string, oneTimePriceId: prices.find((p: any) => p.kind === 'ONE_TIME').id as string, subscriptionId: sub.id }
  })
  /** An upload waiting for content. */
  pendingUpload = () => this.once('pendingUpload', async () => {
    await this.cat()
    const bytes = makeMedia('png')
    const t = await this.ok('alice', 'POST', '/media/uploads', { filename: 'q.png', mime: 'image/png', sizeBytes: bytes.length })
    return { ...t, bytes } as { uploadId: string; uploadUrl: string; bytes: Buffer }
  })
  uploaded = () => this.once('uploaded', async () => {
    const t = await this.pendingUpload()
    await this.app.inject({ method: 'PUT', url: t.uploadUrl.replace(/^https?:\/\/[^/]+/, ''), headers: { 'content-type': 'application/octet-stream' }, payload: t.bytes })
    return t
  })
  attachment = () => this.once('attachment', async () => {
    const m = await this.photo()
    const s = await this.session()
    return (await this.ok('alice', 'POST', '/media-attachments', { mediaId: m.id, target: { kind: 'RESULT_ENTRY', id: s.entryId }, purpose: 'JOURNAL' })) as { id: string }
  })
  /** Alice's public, open gathering for Squats (10 §9). */
  gathering = () => this.once('gathering', async () => {
    const c = await this.cat()
    const r = await this.ok('alice', 'POST', `/activities/${c.squats.activity.id}/gatherings`, { localDate: '2027-03-06', localTime: '14:00', listPublicly: true, idempotencyKey: 'world-gathering-1' })
    return { id: r.gathering.id as string, activityId: c.squats.activity.id as string }
  })
  /** Bob, joined to Alice's gathering. */
  gatheringMember = () => this.once('gatheringMember', async () => {
    const g = await this.gathering()
    await this.ok('bob', 'POST', `/gatherings/${g.id}/join`, { idempotencyKey: 'world-gathering-join' })
    return g
  })
}

type Case = {
  as: Who
  protected?: boolean
  status?: number
  request: (w: World) => Promise<{ method: string; url: string; payload?: unknown; headers?: Record<string, string> }>
  /** Responses that are not JSON (files, redirects) are checked here instead of against the schema. */
  check?: (res: any) => void
}

const signer = new Stripe('sk_test_signature_only')

export const cases: Record<string, Case> = {
  // ── auth
  login: { as: 'anon', request: async (w) => (await w.cat(), await w.call('anon', 'POST', '/auth/register', { email: 'erin@example.com', password: 'a long password', handle: 'erin', displayName: 'Erin' }), { method: 'POST', url: '/auth/login', payload: { email: 'erin@example.com', password: 'a long password' } }) },
  loginWithGoogle: { as: 'anon', status: 501, request: async () => ({ method: 'POST', url: '/auth/google', payload: { idToken: 'not-configured-in-tests' } }), check: (r) => expect(r.json().code).toBe('NOT_IMPLEMENTED') },
  logout: { as: 'alice', protected: true, request: async () => ({ method: 'POST', url: '/auth/logout' }) },
  getCurrentUser: { as: 'alice', protected: true, request: async () => ({ method: 'GET', url: '/auth/me' }) },
  resendVerificationEmail: { as: 'alice', protected: true, request: async () => ({ method: 'POST', url: '/auth/verify-email/resend' }) },
  forgotPassword: { as: 'anon', request: async () => ({ method: 'POST', url: '/auth/forgot-password', payload: { email: 'alice@test.local' } }) },
  resetPassword: {
    as: 'anon',
    request: async (w) => {
      await w.call('anon', 'POST', '/auth/forgot-password', { email: 'alice@test.local' })
      const ev = await db.outboxEvent.findFirstOrThrow({ where: { type: 'PasswordResetRequested' } })
      return { method: 'POST', url: '/auth/reset-password', payload: { token: (ev.payload as any).token, password: 'brand new password' } }
    },
  },
  // ── users
  deactivateMe: { as: 'bob', protected: true, request: async () => ({ method: 'POST', url: '/users/me/deactivate' }) },
  listMyFollowRequests: { as: 'carol', protected: true, request: async (w) => (await w.followRequest(), { method: 'GET', url: '/users/me/follow-requests' }) },
  unfollowUser: { as: 'alice', protected: true, request: async (w) => (await w.followRequest(), { method: 'DELETE', url: `/follow-users/${carolId}` }) },
  approveFollowRequest: { as: 'carol', protected: true, request: async (w) => ({ method: 'POST', url: `/follow-requests/${await w.followRequest()}/approve` }) },
  declineFollowRequest: { as: 'carol', protected: true, request: async (w) => ({ method: 'POST', url: `/follow-requests/${await w.followRequest()}/decline` }) },
  blockUser: { as: 'alice', protected: true, request: async () => ({ method: 'POST', url: `/blocked-users/${testOtherUserId}` }) },
  unblockUser: { as: 'alice', protected: true, request: async (w) => (await w.ok('alice', 'POST', `/blocked-users/${testOtherUserId}`), { method: 'DELETE', url: `/blocked-users/${testOtherUserId}` }) },
  // ── catalog
  listCategories: { as: 'anon', request: async (w) => (await w.cat(), { method: 'GET', url: '/catalog/categories' }) },
  // ── gatherings (10 §9)
  listActivityGatherings: { as: 'anon', request: async (w) => ({ method: 'GET', url: `/activities/${(await w.gathering()).activityId}/gatherings` }) },
  createGathering: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: `/activities/${(await w.cat()).squats.activity.id}/gatherings`, payload: { localDate: '2027-04-01', idempotencyKey: 'contract-create-gathering' } }) },
  listGatherings: { as: 'anon', request: async (w) => (await w.gathering(), { method: 'GET', url: '/gatherings?when=UPCOMING' }) },
  getGathering: { as: 'anon', request: async (w) => ({ method: 'GET', url: `/gatherings/${(await w.gathering()).id}` }) },
  updateGathering: { as: 'alice', protected: true, request: async (w) => ({ method: 'PATCH', url: `/gatherings/${(await w.gathering()).id}`, payload: { localTime: '10:00' } }) },
  joinGathering: { as: 'bob', protected: true, request: async (w) => ({ method: 'POST', url: `/gatherings/${(await w.gathering()).id}/join`, payload: { idempotencyKey: 'contract-join-gathering' } }) },
  leaveGathering: { as: 'bob', protected: true, request: async (w) => ({ method: 'POST', url: `/gatherings/${(await w.gatheringMember()).id}/leave` }) },
  createGatheringLink: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: `/gatherings/${(await w.gathering()).id}/link` }) },
  listPlaces: { as: 'anon', request: async () => (await seedPlace(), { method: 'GET', url: '/catalog/places?locality=Austin' }) },
  getPlace: { as: 'anon', request: async () => ({ method: 'GET', url: `/catalog/places/${(await seedPlace()).slug}` }) },
  createCustomProgramType: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: '/catalog/program-types', payload: { categoryId: (await w.cat()).fitness.id, label: 'Kettlebell Circuit' } }) },
  listFocuses: { as: 'anon', request: async (w) => ({ method: 'GET', url: `/catalog/focuses?categoryId=${(await w.cat()).fitness.id}` }) },
  listToolDefinitions: { as: 'anon', request: async (w) => (await w.cat(), { method: 'GET', url: '/catalog/tools' }) },
  // ── activities
  createActivity: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: '/activities', payload: { title: 'Wall Push', categoryId: (await w.cat()).fitness.id } }) },
  getActivity: { as: 'anon', request: async (w) => ({ method: 'GET', url: `/activities/${(await w.cat()).squats.activity.id}` }) },
  updateActivityDraft: { as: 'alice', protected: true, request: async (w) => ({ method: 'PATCH', url: `/activities/${(await w.ok('alice', 'POST', '/activities', { title: 'A', categoryId: (await w.cat()).fitness.id })).id}/draft`, payload: { title: 'B', expectedRevision: 0 } }) },
  putActivityInstructions: { as: 'alice', protected: true, request: async (w) => ({ method: 'PUT', url: `/activities/${(await w.ok('alice', 'POST', '/activities', { title: 'A', categoryId: (await w.cat()).fitness.id })).id}/draft/instructions`, payload: { instructions: [{ title: 'Go' }], expectedRevision: 0 } }) },
  putActivityMetrics: { as: 'alice', protected: true, request: async (w) => { const c = await w.cat(); return { method: 'PUT', url: `/activities/${(await w.ok('alice', 'POST', '/activities', { title: 'A', categoryId: c.fitness.id })).id}/draft/metrics`, payload: { metrics: [{ metricDefinitionId: c.reps.id }], expectedRevision: 0 } } } },
  putActivityTools: { as: 'alice', protected: true, request: async (w) => { const c = await w.cat(); return { method: 'PUT', url: `/activities/${(await w.ok('alice', 'POST', '/activities', { title: 'A', categoryId: c.fitness.id })).id}/draft/tools`, payload: { tools: [{ toolDefinitionId: c.timer.id }], expectedRevision: 0 } } } },
  publishActivity: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: `/activities/${(await w.ok('alice', 'POST', '/activities', { title: 'A', categoryId: (await w.cat()).fitness.id })).id}/publish`, payload: { visibility: 'PUBLIC', expectedRevision: 0 } }) },
  archiveActivity: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: `/activities/${(await w.ok('alice', 'POST', '/activities', { title: 'A', categoryId: (await w.cat()).fitness.id })).id}/archive` }) },
  listActivityPublicMedia: { as: 'anon', request: async (w) => (await w.publicPublication(), { method: 'GET', url: `/activities/${(await w.cat()).squats.activity.id}/public-media` }) },
  getActivityMyStats: { as: 'alice', protected: true, request: async (w) => (await w.session(), { method: 'GET', url: `/activities/${(await w.cat()).squats.activity.id}/my-stats` }) },
  // ── programs
  listMyPrograms: { as: 'alice', protected: true, request: async (w) => (await w.draft(), { method: 'GET', url: '/programs' }) },
  createProgram: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: '/programs', payload: { programTypeId: (await w.cat()).workout.id } }) },
  getProgramPreview: { as: 'anon', request: async (w) => ({ method: 'GET', url: `/programs/${(await w.program()).id}` }) },
  getProgramWorkspace: { as: 'alice', protected: true, request: async (w) => ({ method: 'GET', url: `/programs/${(await w.draft()).id}/workspace` }) },
  updateProgramDraft: { as: 'alice', protected: true, request: async (w) => { const d = await w.draft(); return { method: 'PATCH', url: `/programs/${d.id}/draft`, payload: { title: 'Renamed', expectedRevision: d.draftRevision } } } },
  updateProgramVisibility: { as: 'alice', protected: true, request: async (w) => { const d = await w.draft(); return { method: 'PATCH', url: `/programs/${d.id}/visibility`, payload: { visibility: 'UNLISTED', expectedRevision: d.draftRevision } } } },
  addProgramActivities: { as: 'alice', protected: true, request: async (w) => { const c = await w.cat(); const ws = await w.ok('alice', 'POST', '/programs', { programTypeId: c.workout.id }); return { method: 'POST', url: `/programs/${ws.id}/draft/activities`, payload: { activityIds: [c.squats.activity.id], expectedRevision: ws.draftRevision } } } },
  updateProgramActivity: { as: 'alice', protected: true, request: async (w) => { const d = await w.draft(); return { method: 'PATCH', url: `/programs/${d.id}/draft/activities/${(await w.cat()).squats.activity.id}`, payload: { frequency: { kind: 'N_PER_WEEK', n: 2 }, expectedRevision: d.draftRevision } } } },
  removeProgramActivity: { as: 'alice', protected: true, request: async (w) => { const d = await w.draft(); return { method: 'DELETE', url: `/programs/${d.id}/draft/activities/${(await w.cat()).legRaises.activity.id}?expectedRevision=${d.draftRevision}` } } },
  listProgramPlacements: { as: 'alice', protected: true, request: async (w) => ({ method: 'GET', url: `/programs/${(await w.draft()).id}/draft/placements` }) },
  addProgramPlacement: { as: 'alice', protected: true, request: async (w) => { const d = await w.draft(); return { method: 'POST', url: `/programs/${d.id}/draft/placements`, payload: { activityId: (await w.cat()).squats.activity.id, relativeDay: 1, expectedRevision: d.draftRevision } } } },
  updateProgramPlacement: { as: 'alice', protected: true, request: async (w) => { const d = await w.draft(); return { method: 'PATCH', url: `/programs/${d.id}/draft/placements/${(await w.placement()).id}`, payload: { localTime: '06:30', expectedRevision: d.draftRevision } } } },
  deleteProgramPlacement: { as: 'alice', protected: true, request: async (w) => { const d = await w.draft(); return { method: 'DELETE', url: `/programs/${d.id}/draft/placements/${(await w.placement()).id}?expectedRevision=${d.draftRevision}` } } },
  regenerateProgramSchedule: { as: 'alice', protected: true, request: async (w) => { const d = await w.draft(); return { method: 'POST', url: `/programs/${d.id}/draft/schedule/regenerate`, payload: { generationMode: 'ROTATE', expectedRevision: d.draftRevision } } } },
  getProgramPublishCheck: { as: 'alice', protected: true, request: async (w) => ({ method: 'GET', url: `/programs/${(await w.draft()).id}/publish-check` }) },
  publishProgram: { as: 'alice', protected: true, request: async (w) => { const d = await w.draft(); return { method: 'POST', url: `/programs/${d.id}/publish`, payload: { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: d.draftRevision } } } },
  archiveProgram: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: `/programs/${(await w.program()).id}/archive` }) },
  deleteProgram: { as: 'alice', protected: true, request: async (w) => ({ method: 'DELETE', url: `/programs/${(await w.draft()).id}` }) },
  getProgramVersion: { as: 'alice', protected: true, request: async (w) => ({ method: 'GET', url: `/program-versions/${(await w.program()).versionId}` }) },
  previewEnrollment: { as: 'bob', protected: true, request: async (w) => { const p = await w.program(); return { method: 'POST', url: `/programs/${p.id}/enrollments/preview`, payload: { programVersionId: p.versionId, startLocalDate: START, timezone: 'America/Chicago' } } } },
  joinProgram: { as: 'bob', protected: true, request: async (w) => { const p = await w.program(); return { method: 'POST', url: `/programs/${p.id}/enrollments`, payload: { programVersionId: p.versionId, startLocalDate: START, timezone: 'America/Chicago', idempotencyKey: 'contract-join' } } } },
  listMyEnrollments: { as: 'bob', protected: true, request: async (w) => (await w.bobEnrollment(), { method: 'GET', url: '/enrollments' }) },
  getEnrollment: { as: 'bob', protected: true, request: async (w) => ({ method: 'GET', url: `/enrollments/${(await w.bobEnrollment()).id}` }) },
  updateEnrollment: { as: 'bob', protected: true, request: async (w) => ({ method: 'PATCH', url: `/enrollments/${(await w.bobEnrollment()).id}`, payload: { status: 'PAUSED' } }) },
  leaveEnrollment: { as: 'bob', protected: true, request: async (w) => ({ method: 'POST', url: `/enrollments/${(await w.bobEnrollment()).id}/leave`, payload: { futureItems: 'REMOVE' } }) },
  acceptEnrollmentUpdate: {
    as: 'bob',
    protected: true,
    request: async (w) => {
      const e = await w.bobEnrollment()
      const p = await w.program()
      const ws = await w.ok('alice', 'PATCH', `/programs/${p.id}/draft`, { title: 'Version 2', expectedRevision: (await w.ok('alice', 'GET', `/programs/${p.id}/workspace`)).draftRevision })
      await w.ok('alice', 'POST', `/programs/${p.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })
      return { method: 'POST', url: `/enrollments/${e.id}/accept-update` }
    },
  },
  dismissEnrollmentUpdate: { as: 'bob', protected: true, request: async (w) => ({ method: 'POST', url: `/enrollments/${(await w.bobEnrollment()).id}/dismiss-update` }) },
  createProgramAccessRequest: { as: 'bob', protected: true, request: async (w) => ({ method: 'POST', url: `/programs/${(await w.approvalProgram()).id}/access-requests` }) },
  listProgramAccessRequests: { as: 'alice', protected: true, request: async (w) => (await w.accessRequest(), { method: 'GET', url: `/programs/${(await w.approvalProgram()).id}/access-requests` }) },
  approveProgramAccessRequest: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: `/access-requests/${(await w.accessRequest()).id}/approve` }) },
  declineProgramAccessRequest: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: `/access-requests/${(await w.accessRequest()).id}/decline` }) },
  // ── billing
  getPayoutAccount: { as: 'alice', protected: true, request: async (w) => (await w.market(), { method: 'GET', url: '/billing/payout-account' }) },
  startPayoutOnboarding: { as: 'alice', protected: true, request: async (w) => (await w.market(), { method: 'POST', url: '/billing/payout-account/onboarding' }) },
  createProgramCheckout: { as: 'carol', protected: true, request: async (w) => { const m = await w.market(); return { method: 'POST', url: `/programs/${m.programId}/checkout`, payload: { priceId: m.oneTimePriceId, idempotencyKey: 'contract-checkout' } } } },
  listMyPurchases: { as: 'bob', protected: true, request: async (w) => (await w.market(), { method: 'GET', url: '/billing/purchases' }) },
  listMySubscriptions: { as: 'bob', protected: true, request: async (w) => (await w.market(), { method: 'GET', url: '/billing/subscriptions' }) },
  cancelSubscription: { as: 'bob', protected: true, request: async (w) => ({ method: 'POST', url: `/billing/subscriptions/${(await w.market()).subscriptionId}/cancel` }) },
  resumeSubscription: { as: 'bob', protected: true, request: async (w) => ({ method: 'POST', url: `/billing/subscriptions/${(await w.market()).subscriptionId}/resume` }) },
  createBillingPortalLink: { as: 'bob', protected: true, request: async (w) => (await w.market(), { method: 'POST', url: '/billing/portal' }) },
  getCreatorEarnings: { as: 'alice', protected: true, request: async (w) => (await w.market(), { method: 'GET', url: '/billing/earnings' }) },
  handleStripeWebhook: {
    as: 'anon',
    request: async (w) => {
      await w.cat()
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_contract'
      const body = JSON.stringify({ id: 'evt_contract', object: 'event', type: 'customer.created', data: { object: { id: 'cus_x' } } })
      return { method: 'POST', url: '/billing/webhooks/stripe', payload: body, headers: { 'content-type': 'application/json', 'stripe-signature': signer.webhooks.generateTestHeaderString({ payload: body, secret: 'whsec_contract' }) } }
    },
  },
  // ── calendar
  listCalendarItems: { as: 'alice', protected: true, request: async (w) => (await w.program(), { method: 'GET', url: `/calendar/items?start=${START}&end=2026-11-15` }) },
  addCalendarItem: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: '/calendar/items', payload: { activityId: (await w.cat()).squats.activity.id, localDate: START, idempotencyKey: 'contract-add-item' } }) },
  getActivityOccurrence: { as: 'alice', protected: true, request: async (w) => (await w.session(), { method: 'GET', url: `/calendar-items/${(await w.aliceItem()).id}/occurrence` }) },
  updateCalendarItem: { as: 'alice', protected: true, request: async (w) => { const i = await w.aliceItem(); return { method: 'PATCH', url: `/calendar-items/${i.id}`, payload: { localDate: '2026-11-10', expectedUpdatedAt: i.updatedAt.toISOString() } } } },
  cancelCalendarItem: { as: 'alice', protected: true, request: async (w) => ({ method: 'DELETE', url: `/calendar-items/${(await w.aliceItem()).id}` }) },
  moveCalendarItemToOpenSlot: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: `/calendar-items/${(await w.recurrence()).item.id}/move-to-open-slot` }) },
  undoCalendarItemCompletion: { as: 'alice', protected: true, request: async (w) => (await w.session(), { method: 'POST', url: `/calendar-items/${(await w.aliceItem()).id}/undo-completion` }) },
  listCalendarRecurrences: { as: 'alice', protected: true, request: async (w) => (await w.recurrence(), { method: 'GET', url: '/calendar/recurrences' }) },
  updateCalendarRecurrence: { as: 'alice', protected: true, request: async (w) => ({ method: 'PATCH', url: `/calendar/recurrences/${(await w.recurrence()).recurrence.id}`, payload: { localTime: '19:00', effectiveFromDate: '2026-11-16' } }) },
  endCalendarRecurrence: { as: 'alice', protected: true, request: async (w) => ({ method: 'DELETE', url: `/calendar/recurrences/${(await w.recurrence()).recurrence.id}?effectiveFromDate=2026-11-16` }) },
  // ── sessions
  createSession: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: '/sessions', payload: { calendarItemId: (await w.aliceItem()).id, idempotencyKey: 'contract-session' } }) },
  getSession: { as: 'alice', protected: true, request: async (w) => ({ method: 'GET', url: `/sessions/${(await w.session()).id}` }) },
  applySessionAction: { as: 'alice', protected: true, request: async (w) => { const s = await w.openSession(); return { method: 'POST', url: `/sessions/${s.id}/actions`, payload: { action: 'START', expectedRevision: s.revision } } } },
  saveSessionResult: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: `/sessions/${(await w.openSession()).id}/results`, payload: { values: [{ metricDefinitionId: (await w.cat()).reps.id, value: 8 }] } }) },
  // ── achievements
  listMyAchievements: { as: 'alice', protected: true, request: async (w) => (await w.achievement(), { method: 'GET', url: '/achievements/me' }) },
  updateMyAchievement: { as: 'alice', protected: true, request: async (w) => ({ method: 'PATCH', url: `/achievements/${(await w.achievement()).id}`, payload: { isShared: true } }) },
  listUserAchievements: { as: 'anon', request: async (w) => (await w.achievement(), { method: 'GET', url: '/users/alice/achievements' }) },
  // ── groups
  listMyGroups: { as: 'bob', protected: true, request: async (w) => (await w.group(), { method: 'GET', url: '/groups' }) },
  listProgramGroups: { as: 'anon', request: async (w) => ({ method: 'GET', url: `/programs/${(await w.publicGroup()).programId}/groups` }) },
  listActivityGroups: { as: 'anon', request: async (w) => { const g = await w.publicGroup(); return { method: 'GET', url: `/activities/${(await w.cat()).squats.activity.id}/groups?programId=${g.programId}` } } },
  getPublicGroupPreview: { as: 'anon', request: async (w) => ({ method: 'GET', url: `/groups/${(await w.publicGroup()).id}/preview` }) },
  joinGroup: { as: 'bob', protected: true, request: async (w) => ({ method: 'POST', url: `/groups/${(await w.publicGroup()).id}/join`, payload: { enrollment: { timezone: 'America/Chicago', idempotencyKey: 'contract-bob-public-join' } } }) },
  createGroup: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: '/groups', payload: { programVersionId: (await w.program()).versionId, mode: 'ASYNC' } }) },
  getGroup: { as: 'bob', protected: true, request: async (w) => ({ method: 'GET', url: `/groups/${(await w.group()).id}` }) },
  updateGroup: { as: 'alice', protected: true, request: async (w) => ({ method: 'PATCH', url: `/groups/${(await w.group()).id}`, payload: { name: 'Renamed crew' } }) },
  updateMyGroupMembership: { as: 'bob', protected: true, request: async (w) => ({ method: 'PATCH', url: `/groups/${(await w.group()).id}/members/me`, payload: { sharedCompletion: false } }) },
  removeGroupMember: { as: 'alice', protected: true, request: async (w) => ({ method: 'DELETE', url: `/groups/${(await w.group()).id}/members/${testOtherUserId}` }) },
  listGroupInvitations: { as: 'alice', protected: true, request: async (w) => (await w.linkInvite(), { method: 'GET', url: `/groups/${(await w.group()).id}/invitations` }) },
  createGroupInvitation: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: `/groups/${(await w.group()).id}/invitations`, payload: { kind: 'EMAIL', email: 'friend@example.com' } }) },
  revokeGroupInvitation: { as: 'alice', protected: true, request: async (w) => ({ method: 'DELETE', url: `/groups/${(await w.group()).id}/invitations/${(await w.linkInvite()).id}` }) },
  getGroupInvitation: { as: 'anon', request: async (w) => ({ method: 'GET', url: `/group-invitations/${(await w.linkInvite()).token}` }) },
  declineGroupInvitation: { as: 'carol', protected: true, request: async (w) => {
    const g = await w.group()
    const inv = await w.ok('alice', 'POST', `/groups/${g.id}/invitations`, { kind: 'USER', handle: 'carol' })
    return { method: 'POST', url: `/group-invitations/${inv.joinUrl.split('/join/')[1]}/decline` }
  } },
  listMyGroupInvitations: { as: 'carol', protected: true, request: async (w) => {
    const g = await w.group()
    await w.ok('alice', 'POST', `/groups/${g.id}/invitations`, { kind: 'USER', handle: 'carol' })
    return { method: 'GET', url: '/users/me/group-invitations' }
  } },
  acceptMyGroupInvitation: { as: 'carol', protected: true, request: async (w) => {
    const g = await w.group()
    const inv = await w.ok('alice', 'POST', `/groups/${g.id}/invitations`, { kind: 'USER', handle: 'carol' })
    return { method: 'POST', url: `/users/me/group-invitations/${inv.id}/accept`, payload: { enrollment: { timezone: 'America/Chicago', idempotencyKey: 'contract-carol-accept-mine' } } }
  } },
  declineMyGroupInvitation: { as: 'carol', protected: true, request: async (w) => {
    const g = await w.group()
    const inv = await w.ok('alice', 'POST', `/groups/${g.id}/invitations`, { kind: 'USER', handle: 'carol' })
    return { method: 'POST', url: `/users/me/group-invitations/${inv.id}/decline` }
  } },
  acceptGroupInvitation: { as: 'carol', protected: true, request: async (w) => ({ method: 'POST', url: `/group-invitations/${(await w.linkInvite()).token}/accept`, payload: { enrollment: { timezone: 'America/Chicago', idempotencyKey: 'contract-carol-accept' } } }) },
  listGroupCompletions: { as: 'bob', protected: true, request: async (w) => (await w.share(), { method: 'GET', url: `/groups/${(await w.group()).id}/completions` }) },
  addCompletionReaction: { as: 'bob', protected: true, request: async (w) => ({ method: 'POST', url: `/completion-shares/${(await w.share()).id}/reactions`, payload: { emoji: '👏', idempotencyKey: 'contract-reaction' } }) },
  removeCompletionReaction: { as: 'bob', protected: true, request: async (w) => { const s = await w.share(); await w.ok('bob', 'POST', `/completion-shares/${s.id}/reactions`, { emoji: '👏', idempotencyKey: 'contract-reaction-2' }); return { method: 'DELETE', url: `/completion-shares/${s.id}/reactions/${encodeURIComponent('👏')}` } } },
  createCheckIns: { as: 'alice', protected: true, request: async (w) => { const g = await w.group(); const item = await w.aliceItem(); await w.share(); return { method: 'POST', url: '/check-ins', payload: { activityId: item.activityId, groupIds: [g.id], calendarItemId: item.id, note: 'Checked in!', idempotencyKey: 'contract-checkin-1' } } } },
  listCompletionComments: { as: 'bob', protected: true, request: async (w) => ({ method: 'GET', url: `/completion-shares/${(await w.share()).id}/comments` }) },
  addCompletionComment: { as: 'bob', protected: true, request: async (w) => ({ method: 'POST', url: `/completion-shares/${(await w.share()).id}/comments`, payload: { body: 'Great job!', idempotencyKey: 'contract-checkin-comment-1' } }) },
  deleteCompletionComment: { as: 'bob', protected: true, request: async (w) => { const s = await w.share(); const c = await w.ok('bob', 'POST', `/completion-shares/${s.id}/comments`, { body: 'Remove me', idempotencyKey: 'contract-checkin-comment-del' }); return { method: 'DELETE', url: `/completion-comments/${c.id}` } } },
  listGroupMedia: { as: 'bob', protected: true, request: async (w) => (await w.groupPublication(), { method: 'GET', url: `/groups/${(await w.group()).id}/media` }) },
  // ── media
  listActivityMyMedia: { as: 'alice', protected: true, request: async (w) => (await w.attachment(), { method: 'GET', url: `/activities/${(await w.cat()).squats.activity.id}/my-media` }) },
  listActivityMyAttempts: { as: 'alice', protected: true, request: async (w) => (await w.attachment(), { method: 'GET', url: `/activities/${(await w.cat()).squats.activity.id}/my-attempts` }) },
  listMediaAttachments: { as: 'alice', protected: true, request: async (w) => (await w.attachment(), { method: 'GET', url: `/media-attachments?targetKind=RESULT_ENTRY&targetId=${(await w.session()).entryId}` }) },
  listMyMedia: { as: 'alice', protected: true, request: async (w) => (await w.photo(), { method: 'GET', url: '/media/mine' }) },
  listPlatformMedia: { as: 'alice', protected: true, request: async (w) => (await w.cat(), { method: 'GET', url: '/media/platform' }) },
  createMediaUpload: { as: 'alice', protected: true, request: async () => ({ method: 'POST', url: '/media/uploads', payload: { filename: 'x.png', mime: 'image/png', sizeBytes: 100 } }) },
  uploadMediaContent: { as: 'anon', request: async (w) => { const t = await w.pendingUpload(); return { method: 'PUT', url: t.uploadUrl.replace(/^https?:\/\/[^/]+/, ''), payload: t.bytes, headers: { 'content-type': 'application/octet-stream' } } } },
  completeMediaUpload: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: `/media/uploads/${(await w.uploaded()).uploadId}/complete` }) },
  getMediaFile: {
    as: 'anon',
    request: async (w) => {
      const m = await w.photo()
      const url = (await w.ok('alice', 'GET', `/media/${m.id}/url`)).url as string
      return { method: 'GET', url: url.replace(/^https?:\/\/[^/]+/, '') }
    },
    check: (r) => {
      expect(r.statusCode).toBe(200)
      expect(r.headers['content-type']).toBe('image/jpeg')
    },
  },
  getMedia: { as: 'alice', protected: true, request: async (w) => ({ method: 'GET', url: `/media/${(await w.photo()).id}` }) },
  updateMedia: { as: 'alice', protected: true, request: async (w) => ({ method: 'PATCH', url: `/media/${(await w.photo()).id}`, payload: { alt: 'Updated alt' } }) },
  deleteMedia: { as: 'alice', protected: true, request: async (w) => ({ method: 'DELETE', url: `/media/${(await w.photo()).id}` }) },
  getMediaUrl: { as: 'alice', request: async (w) => ({ method: 'GET', url: `/media/${(await w.photo()).id}/url` }) },
  createMediaAttachment: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: '/media-attachments', payload: { mediaId: (await w.photo()).id, target: { kind: 'RESULT_ENTRY', id: (await w.session()).entryId }, purpose: 'JOURNAL' } }) },
  deleteMediaAttachment: { as: 'alice', protected: true, request: async (w) => ({ method: 'DELETE', url: `/media-attachments/${(await w.attachment()).id}` }) },
  createMediaPublication: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: '/media-publications', payload: { mediaId: (await w.photo()).id, audience: 'GROUP', groupId: (await w.group()).id } }) },
  revokeMediaPublication: { as: 'alice', protected: true, request: async (w) => ({ method: 'DELETE', url: `/media-publications/${(await w.groupPublication()).id}` }) },
  // ── social
  getMediaPublication: { as: 'anon', request: async (w) => ({ method: 'GET', url: `/media-publications/${(await w.publicPublication()).id}` }) },
  discover: { as: 'anon', request: async (w) => (await w.program(), { method: 'GET', url: '/discover?kind=PROGRAM' }) },
  listUserPrograms: { as: 'anon', request: async (w) => (await w.program(), { method: 'GET', url: '/users/alice/programs' }) },
  listUserActivities: { as: 'anon', request: async (w) => (await w.ok('alice', 'POST', `/activities/${(await w.ok('alice', 'POST', '/activities', { title: 'Public one', categoryId: (await w.cat()).fitness.id })).id}/publish`, { visibility: 'PUBLIC', expectedRevision: 0 }), { method: 'GET', url: '/users/alice/activities' }) },
  listUserPublications: { as: 'anon', request: async (w) => (await w.publicPublication(), { method: 'GET', url: '/users/alice/publications' }) },
  likeMediaPublication: { as: 'bob', protected: true, request: async (w) => ({ method: 'POST', url: `/media-publications/${(await w.publicPublication()).id}/likes` }) },
  unlikeMediaPublication: { as: 'bob', protected: true, request: async (w) => ({ method: 'DELETE', url: `/media-publications/${(await w.publicPublication()).id}/likes` }) },
  recordMediaPublicationView: { as: 'anon', request: async (w) => ({ method: 'POST', url: `/media-publications/${(await w.publicPublication()).id}/views` }) },
  listMediaPublicationComments: { as: 'bob', protected: true, request: async (w) => (await w.comment(), { method: 'GET', url: `/media-publications/${(await w.groupPublication()).id}/comments` }) },
  addMediaPublicationComment: { as: 'bob', protected: true, request: async (w) => ({ method: 'POST', url: `/media-publications/${(await w.groupPublication()).id}/comments`, payload: { body: 'Great!', idempotencyKey: 'contract-comment' } }) },
  deleteMediaComment: { as: 'bob', protected: true, request: async (w) => ({ method: 'DELETE', url: `/media-comments/${(await w.comment()).id}` }) },
  // ── notifications
  listNotifications: { as: 'alice', protected: true, request: async (w) => (await w.notification(), { method: 'GET', url: '/notifications' }) },
  getUnreadNotificationCount: { as: 'alice', protected: true, request: async (w) => (await w.notification(), { method: 'GET', url: '/notifications/unread-count' }) },
  markNotificationsRead: { as: 'alice', protected: true, request: async (w) => ({ method: 'POST', url: '/notifications/read', payload: { ids: [(await w.notification()).id] } }) },
  unsubscribeDailyEmail: { as: 'anon', request: async (w) => (await w.cat(), { method: 'POST', url: '/email/unsubscribe', payload: { token: unsubscribeToken(testUserId) } }) },
  // ── moderation
  createReport: { as: 'bob', protected: true, request: async (w) => ({ method: 'POST', url: '/reports', payload: { target: { type: 'PROGRAM', id: (await w.program()).id }, reason: 'UNSAFE' } }) },
  listReports: { as: 'mod', protected: true, request: async (w) => (await w.report(), { method: 'GET', url: '/moderation/reports' }) },
  resolveReport: { as: 'mod', protected: true, request: async (w) => ({ method: 'POST', url: `/moderation/reports/${(await w.report()).id}/resolve`, payload: { status: 'DISMISSED', reason: 'Not a violation' } }) },
  listPendingPublications: { as: 'mod', protected: true, request: async (w) => (await w.pendingPublication(), { method: 'GET', url: '/moderation/publications' }) },
  moderateMediaPublication: { as: 'mod', protected: true, request: async (w) => ({ method: 'POST', url: `/moderation/publications/${(await w.pendingPublication()).id}`, payload: { decision: 'REJECT', note: 'Off topic' } }) },
  listAdminContent: { as: 'admin', protected: true, request: async (w) => (await w.draft(), { method: 'GET', url: '/admin/content' }) },
  importAdminContent: {
    as: 'admin',
    protected: true,
    request: async (w) => {
      const c = await w.cat()
      return { method: 'POST', url: '/admin/content/import', payload: { idempotencyKey: 'contract-import-1', programs: [{ title: 'Imported', programType: c.workout.slug, activities: [{ ref: 'squats' }, { title: 'Wall Sit', metrics: [{ metric: 'duration' }] }] }] } }
    },
  },
  moderateAdminContent: { as: 'admin', protected: true, request: async (w) => ({ method: 'POST', url: `/admin/content/PROGRAM/${(await w.draft()).id}/moderation`, payload: { action: 'HIDE', reason: 'Unsafe guidance' } }) },
  listAdminAudit: { as: 'admin', protected: true, request: async (w) => (await w.grant(), { method: 'GET', url: '/admin/audit' }) },
  listAdminUsers: { as: 'admin', protected: true, request: async () => ({ method: 'GET', url: '/admin/users?q=ali' }) },
  getAdminUser: { as: 'admin', protected: true, request: async () => ({ method: 'GET', url: `/admin/users/${testUserId}` }) },
  updateAdminUser: { as: 'admin', protected: true, request: async () => ({ method: 'PATCH', url: `/admin/users/${testUserId}`, payload: { role: 'MODERATOR', reason: 'Helps with reports' } }) },
  listAdminPrices: { as: 'admin', protected: true, request: async (w) => (await w.market(), { method: 'GET', url: '/admin/membership/prices' }) },
  listAdminPurchases: { as: 'admin', protected: true, request: async () => ({ method: 'GET', url: '/admin/membership/purchases' }) },
  listAdminSubscriptions: { as: 'admin', protected: true, request: async (w) => (await w.market(), { method: 'GET', url: `/admin/membership/subscriptions?userId=${testOtherUserId}` }) },
  listAdminGrants: { as: 'admin', protected: true, request: async (w) => (await w.grant(), { method: 'GET', url: '/admin/membership/grants?active=true' }) },
  grantProgramAccess: { as: 'mod', protected: true, request: async (w) => ({ method: 'POST', url: `/moderation/programs/${(await w.approvalProgram()).id}/grants`, payload: { userId: carolId, reason: 'Support' } }) },
  revokeProgramAccess: { as: 'mod', protected: true, request: async (w) => ({ method: 'DELETE', url: `/moderation/grants/${(await w.grant()).id}` }) },
}

/** Success status declared in the spec for an operation (the single 2xx response). */
async function declaredStatus(operationId: string) {
  const { load } = await import('js-yaml')
  const { readFileSync } = await import('fs')
  const { specPath } = await import('../../app')
  const spec = load(readFileSync(specPath, 'utf8')) as any
  for (const item of Object.values<any>(spec.paths)) {
    for (const op of Object.values<any>(item)) if (op.operationId === operationId) return Number(Object.keys(op.responses).find((s) => s.startsWith('2')))
  }
  throw new Error(`Unknown operation ${operationId}`)
}

export async function contractCase(app: App, operationId: string) {
  const c = cases[operationId]
  if (!c) throw new Error(`No contract case for ${operationId}`)
  const w = new World(app)
  try {
    if (c.as === 'admin') await w.admin()
    const r = await c.request(w)
    if (c.protected) {
      const anon = await app.inject({ method: r.method, url: r.url, payload: r.payload as any, headers: r.headers })
      expect(anon.statusCode, `${operationId} without credentials`).toBe(401)
    }
    const headers = { ...(c.as === 'anon' ? {} : asAuth(ids[c.as])), ...(r.headers ?? {}) }
    const res = await app.inject({ method: r.method, url: r.url, payload: r.payload as any, headers })
    if (c.check) return c.check(res)
    const status = c.status ?? (await declaredStatus(operationId))
    expect(res.statusCode, `${operationId}: ${res.body.slice(0, 400)}`).toBe(status)
    await validateResponse(operationId, status, res.json())
  } finally {
    delete process.env.MARKETPLACE_ENABLED
    setBillingGateway(null)
  }
}

