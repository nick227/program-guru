import { expect, type Page } from '@playwright/test'
import type { components } from '@project/sdk'
import { mockApi, activityId, itemId, groupId } from './fixtures'
import { login } from './journey'
type S = components['schemas']
const photo = (id: string, alt: string): S['MediaThumb'] => ({ id, alt, type: 'PHOTO', thumbnailUrl: '/activity-test.png', durationMs: null, canSelect: true })
const person = (id: string, displayName: string): S['UserSummary'] => ({ id, displayName, avatarUrl: '/activity-test.png', handle: id })

export async function setup(page: Page, options: { simple?: boolean; timed?: boolean; social?: boolean; privateOnly?: boolean; locked?: boolean; failUpload?: boolean } = {}) {
  const base = await mockApi(page, { calendarItem: true })
  await page.route('**/my-attempts*', route => route.fulfill({ json: { data: [], meta: { nextCursor: null } } }))
  await page.route('**/activity-test.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') }))
  await login(page, 'participant@test.local', 'password')
  const response = page.waitForResponse(response => response.url().endsWith(`/calendar-items/${itemId}/occurrence`))
  await page.goto(`/occurrences/${itemId}`)
  const o: S['ActivityOccurrence'] = (await (await response).json()).data
  o.item.thumbnailUrl = '/activity-test.png'
  o.item.locked = options.locked ?? false
  if (options.simple) { o.resultInputs = []; o.personalStats = []; o.item.thumbnailUrl = null }
  if (options.timed) o.resultInputs.push({ ...o.resultInputs[0]!, metricDefinitionId: 'duration', key: 'duration', label: 'Duration', valueType: 'DURATION' })
  if (options.social) o.collaborators = {
    groupId, occurrenceKey: 'shared-occurrence-across-versions', totalCount: 3, finishedCount: options.privateOnly ? 0 : 1, unreadCount: 0,
    members: [
      { user: person('carol', 'Carol Chen'), status: options.privateOnly ? 'UNKNOWN' : 'DONE', completionShareId: options.privateOnly ? null : 'carol-share-v1', completedAt: options.privateOnly ? null : new Date().toISOString(), reactions: [] },
      { user: person('dave', 'Dave Okafor'), status: 'UNKNOWN', completionShareId: null, completedAt: null, reactions: [] },
      { user: person('bob', 'Bob Rivera'), status: 'NOT_PARTICIPATING', completionShareId: null, completedAt: null, reactions: [] },
    ],
  }
  o.myMedia = options.simple ? [] : [photo('mine', 'My recording')]
  o.sharedMedia = options.social ? [{ ...photo('group-photo', 'Group recording'), publicationId: 'group-publication', owner: person('carol', 'Carol Chen'), caption: null, commentCount: 0 }] : []
  o.communityMedia = options.simple ? [] : [{ ...photo('public-photo', 'Public demonstration'), publicationId: 'public-publication', creator: person('creator', 'Taylor'), attribution: 'Taylor Studio', license: 'CC BY 4.0', likes: 0, views: 0, likedByMe: false }]
  const calls: { path: string; method: string; body?: any }[] = []
  let uploadedReady = false
  let denyMedia = false
  let failUpload = options.failUpload ?? false
  let uploaded = false
  const asset = (id: string): S['MediaAsset'] => ({ ...photo(id, id === 'mine' ? 'My recording' : 'Uploaded photo'), state: id === 'uploaded' && !uploadedReady ? 'PROCESSING' : 'READY', mime: 'image/png', byteSize: 68, width: 1, height: 1, durationMs: null, license: null, attribution: null, attachmentCount: 1, isOwner: true, createdAt: new Date().toISOString() })
  await page.route('http://localhost:3001/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') return route.fallback()
    const body = req.postData() && req.headers()['content-type']?.includes('json') ? req.postDataJSON() : undefined
    calls.push({ path, method: req.method(), body })
    const send = (data: unknown, meta?: unknown) => route.fulfill({ json: { data, ...(meta ? { meta } : {}) } })
    if (path.endsWith('/occurrence')) return send(o)
    if (path.endsWith('/my-attempts')) return send(uploaded ? [{ sessionId: 'session-current-v2', entries: [{ resultEntryId: 'result-current' }] }] : [], { nextCursor: null })
    if (path === '/sessions' && req.method() === 'POST') {
      o.session = { id: 'session-current-v2', calendarItemId: itemId, activityRevisionId: 'revision-v2', status: 'READY', startedAt: null, endedAt: null, activeSeconds: 0, isManualCompletion: false, revision: 0 }
      return send(o.session)
    }
    if (path === '/sessions/session-current-v2') return send({ session: o.session, entries: [{ id: 'result-current', instructionId: null }] })
    if (path.endsWith('/actions')) {
      const session = o.session!
      expect(body.expectedRevision).toBe(session.revision)
      session.status = body.action === 'FINISH' ? 'FINISHED' : body.action === 'PAUSE' ? 'PAUSED' : 'ACTIVE'
      session.isManualCompletion = body.action === 'FINISH' && !session.startedAt
      if (body.action === 'START') session.startedAt = new Date().toISOString()
      session.revision++
      if (session.status === 'FINISHED') o.item.status = 'DONE'
      return send({ session, item: o.item, achievementsEarned: [] })
    }
    if (path.endsWith('/undo-completion')) { o.item.status = 'PLANNED'; return send(o.item) }
    if (path.startsWith('/completion-shares/')) {
      o.collaborators!.members[0]!.reactions = req.method() === 'DELETE' ? [] : [{ emoji: body.emoji, count: 1, reactedByMe: true }]
      return send({ ok: true })
    }
    if (path === '/media/mine' || path === '/media/uploaded') return send(asset(path.split('/').at(-1)!))
    if (path.endsWith('/url')) {
      if (denyMedia) return route.fulfill({ status: 403, json: { code: 'FORBIDDEN', message: 'You cannot view this media' } })
      return send({ url: '/activity-test.png', mime: 'image/png', expiresAt: null, posterUrl: null })
    }
    if (path === '/media-publications' && req.method() === 'POST') {
      if (body.audience === 'GROUP') o.sharedMedia.push({ ...photo(body.mediaId, 'My recording'), publicationId: 'own-share', owner: person('self', 'Me'), caption: null, commentCount: 0 })
      return send({ id: body.audience === 'PUBLIC' ? 'own-public' : 'own-share', ...body, status: body.audience === 'PUBLIC' ? 'PENDING' : 'APPROVED' })
    }
    if (path === '/media-publications/own-public' && req.method() === 'DELETE') return send({ ok: true })
    if (path === '/media-publications/own-share' && req.method() === 'DELETE') { o.sharedMedia = o.sharedMedia.filter(m => m.publicationId !== 'own-share'); return send({ ok: true }) }
    if (path === '/media/uploads') return send({ uploadId: 'uploaded', mediaId: 'uploaded', method: 'PUT', headers: {}, maxBytes: 100000, uploadUrl: 'http://localhost:3001/upload-bytes', expiresAt: new Date(Date.now() + 60000).toISOString() })
    if (path === '/upload-bytes') { if (failUpload) { failUpload = false; return route.fulfill({ status: 503, body: 'Unavailable' }) } return route.fulfill({ status: 200, body: '' }) }
    if (path === '/media/uploads/uploaded/complete') { uploaded = true; return send(asset('uploaded')) }
    if (path === '/media-attachments' && req.method() === 'POST') { o.myMedia.push(photo(body.mediaId, 'Uploaded photo')); return send({ id: 'attachment', ...body }) }
    if (path === '/media-attachments') return send(uploaded ? [{ id: 'upload-link', mediaId: 'uploaded', mediaDeleted: false, mediaState: uploadedReady ? 'READY' : 'PROCESSING', media: photo('uploaded', 'Uploaded photo') }] : [], { nextCursor: null })
    return route.fallback()
  })
  await page.reload()
  return { o, calls, base, ready: () => { uploadedReady = true; o.myMedia.push(photo('uploaded', 'Uploaded photo')) }, deny: () => { denyMedia = true } }
}
