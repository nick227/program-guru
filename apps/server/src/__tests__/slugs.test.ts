import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse, testUserId, testOtherUserId } from './helpers'
import { seedCatalog } from './helpers/fixtures'

const app = buildTestApp()
let cat: Awaited<ReturnType<typeof seedCatalog>>

beforeEach(async () => {
  cat = await seedCatalog()
})

const as = (userId?: string) => ({
  get: (url: string) =>
    app.inject({
      method: 'GET',
      url,
      ...(userId ? { headers: asAuth(userId) } : {}),
    }),
  post: (url: string, payload?: unknown) =>
    app.inject({
      method: 'POST',
      url,
      ...(userId ? { headers: asAuth(userId) } : {}),
      payload: (payload ?? {}) as any,
    }),
  patch: (url: string, payload: unknown) =>
    app.inject({
      method: 'PATCH',
      url,
      ...(userId ? { headers: asAuth(userId) } : {}),
      payload: payload as any,
    }),
})

const alice = as(testUserId)
const bob = as(testOtherUserId)
const anon = as()

async function createAndPublishProgram(
  user: typeof alice,
  title: string,
  visibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC',
) {
  const created = (
    await user.post('/programs', {
      programTypeId: cat.workout.id,
      focusId: cat.strength.id,
    })
  ).json().data

  const updated = (
    await user.patch(`/programs/${created.id}/draft`, {
      title,
      expectedRevision: created.draftRevision,
    })
  ).json().data

  await user.post(`/programs/${created.id}/draft/activities`, {
    activityIds: [cat.squats.activity.id],
    expectedRevision: updated.draftRevision,
  })

  const ws = (await user.get(`/programs/${created.id}/workspace`)).json().data
  const pub = await user.post(`/programs/${created.id}/publish`, {
    visibility,
    accessMode: 'OPEN',
    expectedRevision: ws.draftRevision,
  })
  expect(pub.statusCode).toBe(200)

  return (await user.get(`/programs/${created.id}/workspace`)).json().data
}

describe('Friendly Slug Resolution & Regression Suite', () => {
  it('enforces creator-scoped program slugs allowing different creators to share titles', async () => {
    const pAlice = await createAndPublishProgram(alice, 'Strength Camp')
    const pBob = await createAndPublishProgram(bob, 'Strength Camp')

    expect(pAlice.slug).toBe('strength-camp')
    expect(pBob.slug).toBe('strength-camp')

    // Resolving with Alice's handle returns Alice's program
    const resAlice = await anon.get(
      '/resolve-slug?kind=PROGRAM&slugOrId=strength-camp&creatorHandle=alice',
    )
    expect(resAlice.statusCode).toBe(200)
    await validateResponse('resolveSlug', 200, resAlice.json())
    expect(resAlice.json().data).toMatchObject({
      id: pAlice.id,
      kind: 'PROGRAM',
      canonicalSlug: 'strength-camp',
      creatorHandle: 'alice',
      isAlias: false,
      canonicalUrl: '/@alice/strength-camp',
    })

    // Resolving with Bob's handle returns Bob's program
    const resBob = await anon.get(
      '/resolve-slug?kind=PROGRAM&slugOrId=strength-camp&creatorHandle=bob',
    )
    expect(resBob.statusCode).toBe(200)
    expect(resBob.json().data).toMatchObject({
      id: pBob.id,
      kind: 'PROGRAM',
      canonicalSlug: 'strength-camp',
      creatorHandle: 'bob',
      isAlias: false,
      canonicalUrl: '/@bob/strength-camp',
    })
  })

  it('allocates numeric suffix for duplicate titles within the same creator namespace', async () => {
    const first = await createAndPublishProgram(alice, 'Strength Camp')
    const second = await createAndPublishProgram(alice, 'Strength Camp')

    expect(first.slug).toBe('strength-camp')
    expect(second.slug).toBe('strength-camp-2')

    const res = await anon.get(
      '/resolve-slug?kind=PROGRAM&slugOrId=strength-camp-2&creatorHandle=alice',
    )
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      id: second.id,
      canonicalSlug: 'strength-camp-2',
      isAlias: false,
      canonicalUrl: '/@alice/strength-camp-2',
    })
  })

  it('preserves old slugs as aliases when a program title changes and redirects old links', async () => {
    const prog = await createAndPublishProgram(alice, 'Strength Camp')
    expect(prog.slug).toBe('strength-camp')

    // Alice updates the title
    const nextDraft = (
      await alice.patch(`/programs/${prog.id}/draft`, {
        title: 'Strength Evolution',
        expectedRevision: prog.draftRevision,
      })
    ).json().data

    expect(nextDraft.slug).toBe('strength-evolution')

    // Querying the new canonical slug returns isAlias: false
    const resNew = await anon.get(
      '/resolve-slug?kind=PROGRAM&slugOrId=strength-evolution&creatorHandle=alice',
    )
    expect(resNew.statusCode).toBe(200)
    expect(resNew.json().data).toMatchObject({
      id: prog.id,
      canonicalSlug: 'strength-evolution',
      isAlias: false,
      canonicalUrl: '/@alice/strength-evolution',
    })

    // Querying the old alias slug returns isAlias: true with canonicalUrl pointing to new slug
    const resOld = await anon.get(
      '/resolve-slug?kind=PROGRAM&slugOrId=strength-camp&creatorHandle=alice',
    )
    expect(resOld.statusCode).toBe(200)
    expect(resOld.json().data).toMatchObject({
      id: prog.id,
      canonicalSlug: 'strength-evolution',
      isAlias: true,
      canonicalUrl: '/@alice/strength-evolution',
    })
  })

  it('redirects legacy UUID URLs to the friendly canonical URL', async () => {
    const prog = await createAndPublishProgram(alice, 'Core Mastery')

    const res = await anon.get(`/resolve-slug?kind=PROGRAM&slugOrId=${prog.id}`)
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      id: prog.id,
      canonicalSlug: 'core-mastery',
      creatorHandle: 'alice',
      isAlias: true,
      canonicalUrl: '/@alice/core-mastery',
    })
  })

  it('resolves direct links in a fresh unauthenticated browser without visiting Discover', async () => {
    const prog = await createAndPublishProgram(alice, 'Direct Link Test')

    const res = await anon.get(
      '/resolve-slug?kind=PROGRAM&slugOrId=direct-link-test&creatorHandle=alice',
    )
    expect(res.statusCode).toBe(200)
    expect(res.json().data.id).toBe(prog.id)
  })

  it('handles creator handle changes and points canonical URL to the new handle', async () => {
    const prog = await createAndPublishProgram(alice, 'Handle Change Test')

    // Alice renames her handle to 'alice_fit'
    await db.userProfile.update({
      where: { userId: testUserId },
      data: { handle: 'alice_fit' },
    })

    // Resolving with the new handle succeeds and builds canonical URL with the new handle
    const res = await anon.get(
      '/resolve-slug?kind=PROGRAM&slugOrId=handle-change-test&creatorHandle=alice_fit',
    )
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      id: prog.id,
      canonicalSlug: 'handle-change-test',
      creatorHandle: 'alice_fit',
      isAlias: false,
      canonicalUrl: '/@alice_fit/handle-change-test',
    })

    // Resolving via general /programs fallback also redirects to the new handle URL
    const fallbackRes = await anon.get(
      '/resolve-slug?kind=PROGRAM&slugOrId=handle-change-test',
    )
    expect(fallbackRes.statusCode).toBe(200)
    expect(fallbackRes.json().data).toMatchObject({
      id: prog.id,
      canonicalUrl: '/@alice_fit/handle-change-test',
      isAlias: true,
    })
  })

  it('prevents exposure of private, unpublished, archived, and moderated content through slug lookup', async () => {
    // 1. Unpublished draft
    const draft = (
      await alice.post('/programs', {
        programTypeId: cat.workout.id,
        focusId: cat.strength.id,
      })
    ).json().data

    const draftUpdated = (
      await alice.patch(`/programs/${draft.id}/draft`, {
        title: 'Secret Draft',
        expectedRevision: draft.draftRevision,
      })
    ).json().data
    expect(draftUpdated.slug).toBe('secret-draft')

    // Bob cannot resolve Alice's unpublished draft
    const bobDraftRes = await bob.get(
      '/resolve-slug?kind=PROGRAM&slugOrId=secret-draft&creatorHandle=alice',
    )
    expect(bobDraftRes.statusCode).toBe(404)

    // Anonymous cannot resolve Alice's unpublished draft
    const anonDraftRes = await anon.get(
      '/resolve-slug?kind=PROGRAM&slugOrId=secret-draft&creatorHandle=alice',
    )
    expect(anonDraftRes.statusCode).toBe(404)

    // Alice (owner) CAN resolve it
    const aliceDraftRes = await alice.get(
      '/resolve-slug?kind=PROGRAM&slugOrId=secret-draft&creatorHandle=alice',
    )
    expect(aliceDraftRes.statusCode).toBe(200)

    // 2. Private published program (without invitation/grant)
    await createAndPublishProgram(alice, 'Private Program', 'PRIVATE')
    const bobPrivRes = await bob.get(
      '/resolve-slug?kind=PROGRAM&slugOrId=private-program&creatorHandle=alice',
    )
    expect(bobPrivRes.statusCode).toBe(404)

    // 3. Archived program
    const pub = await createAndPublishProgram(alice, 'To Be Archived')
    await alice.post(`/programs/${pub.id}/archive`)
    const bobArchiveRes = await bob.get(
      '/resolve-slug?kind=PROGRAM&slugOrId=to-be-archived&creatorHandle=alice',
    )
    expect(bobArchiveRes.statusCode).toBe(404)

    // 4. Moderated program
    const toMod = await createAndPublishProgram(alice, 'To Be Moderated')
    await db.program.update({
      where: { id: toMod.id },
      data: { moderatedAt: new Date() },
    })
    const bobModRes = await bob.get(
      '/resolve-slug?kind=PROGRAM&slugOrId=to-be-moderated&creatorHandle=alice',
    )
    expect(bobModRes.statusCode).toBe(404)
  })

  it('allocates activity slugs, preserves aliases on rename, and redirects old activity URLs', async () => {
    // Alice creates an activity
    const created = (
      await alice.post('/activities', {
        title: 'Morning Mobility',
        categoryId: cat.fitness.id,
      })
    ).json().data
    expect(created.slug).toBe('morning-mobility')

    // Alice publishes it
    const pub = await alice.post(`/activities/${created.id}/publish`, {
      visibility: 'PUBLIC',
      expectedRevision: created.draftRevision,
    })
    expect(pub.statusCode).toBe(200)
    const pubData = pub.json().data

    // Resolving canonical activity slug
    const res1 = await anon.get(
      '/resolve-slug?kind=ACTIVITY&slugOrId=morning-mobility',
    )
    expect(res1.statusCode).toBe(200)
    expect(res1.json().data).toMatchObject({
      id: created.id,
      kind: 'ACTIVITY',
      canonicalSlug: 'morning-mobility',
      isAlias: false,
      canonicalUrl: '/activities/morning-mobility',
    })

    // Alice renames activity
    const renameRes = await alice.patch(`/activities/${created.id}/draft`, {
      title: 'Evening Mobility',
      expectedRevision: pubData.draftRevision,
    })
    expect(renameRes.statusCode).toBe(200)
    const renamed = renameRes.json().data
    expect(renamed.slug).toBe('evening-mobility')

    // Old slug resolves as alias to new canonical URL
    const resOld = await anon.get(
      '/resolve-slug?kind=ACTIVITY&slugOrId=morning-mobility',
    )
    expect(resOld.statusCode).toBe(200)
    expect(resOld.json().data).toMatchObject({
      id: created.id,
      kind: 'ACTIVITY',
      canonicalSlug: 'evening-mobility',
      isAlias: true,
      canonicalUrl: '/activities/evening-mobility',
    })

    // Legacy UUID resolves as alias to canonical URL
    const resUuid = await anon.get(
      `/resolve-slug?kind=ACTIVITY&slugOrId=${created.id}`,
    )
    expect(resUuid.statusCode).toBe(200)
    expect(resUuid.json().data).toMatchObject({
      id: created.id,
      kind: 'ACTIVITY',
      canonicalSlug: 'evening-mobility',
      isAlias: true,
      canonicalUrl: '/activities/evening-mobility',
    })
  })
})
