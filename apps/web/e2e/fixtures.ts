import type { Page } from '@playwright/test'
import type { components } from '@project/sdk'
type S = components['schemas']
const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const programId = uid(10),
  activityId = uid(20),
  itemId = uid(30)
const type = {
  id: uid(2),
  categoryId: uid(3),
  slug: 'workout',
  label: 'Workout',
  icon: null,
  isFeatured: true,
  focusIds: [uid(4)],
}
const focus = {
  id: uid(4),
  categoryId: uid(3),
  slug: 'strength',
  label: 'Strength',
}
const activity: S['ActivitySummary'] = {
  id: activityId,
  revisionId: uid(21),
  title: 'Squats',
  summary: 'A controlled squat.',
  creator: null,
  categoryId: uid(3),
  focusIds: [uid(4)],
  thumbnailUrl: null,
  instructionCount: 1,
  mediaCount: 0,
  metricLabels: ['Reps'],
  visibility: 'PUBLIC',
  status: 'PUBLISHED',
  isCopy: false,
  isPlatform: true,
}
const instruction = {
  id: uid(24),
  instructionKey: uid(25),
  position: 0,
  title: null,
  body: 'Sit back and stand tall.',
  media: [],
  metrics: [],
  tools: [],
}
export async function mockApi(
  page: Page,
  options: {
    conflict?: boolean
    meFailure?: boolean
    finishFailure?: boolean
  } = {},
) {
  let user: 'author' | 'participant' | null = null,
    title = 'My Strength Workout',
    revision = 1,
    added = false,
    published = false,
    joined = false,
    done = false,
    start = '2026-11-09'
  let session: S['ActivitySession'] | null = null
  let recorded: number | null = null
  let conflict = options.conflict
  const requests: {
    path: string
    method: string
    body: Record<string, unknown>
  }[] = []
  const summary = (seed = false): S['ProgramSummary'] => ({
    id: seed ? uid(11) : programId,
    title: seed ? 'Beginner Strength' : title,
    type,
    focus,
    creator: null,
    coverUrl: null,
    durationDays: 28,
    programDays: 12,
    placements: 12,
    frequencyLabel: '3 days/week',
    visibility: 'PUBLIC',
    accessMode: 'OPEN',
    prices: [],
    viewerAccess: user === 'author' ? 'OWNER' : 'PREVIEW',
    isPlatform: seed,
  })
  const workspace = (): S['ProgramWorkspace'] => ({
    ...summary(),
    status: published ? 'PUBLISHED' : 'DRAFT',
    frequency: { kind: 'N_PER_WEEK', n: 3 },
    generationMode: 'ALL_EACH_DAY',
    description: null,
    activityCount: added ? 1 : 0,
    instructionCount: added ? 1 : 0,
    activities: added
      ? [
          {
            activityId,
            revisionId: uid(21),
            title: 'Squats',
            instructionCount: 1,
            mediaCount: 0,
            metrics: ['Reps'],
            placementCount: 12,
            canEdit: false,
          },
        ]
      : [],
    draftRevision: revision,
    draftVersionId: uid(12),
    latestPublishedVersionId: published ? uid(12) : null,
    hasUnpublishedChanges: !published,
  })
  const item = (): S['CalendarItem'] => ({
    id: itemId,
    localDate: start,
    localTime: null,
    status: done ? 'DONE' : 'PLANNED',
    title: 'Squats',
    activityId,
    activityRevisionId: uid(21),
    programTitle: title,
    enrollmentId: uid(40),
    programDayIndex: 0,
    recurrenceId: null,
    conflict: false,
    locked: false,
    thumbnailUrl: null,
    participantAvatars: [],
    unreadCount: 0,
    updatedAt: '2026-11-07T12:00:00Z',
  })
  await page.route('http://localhost:3001/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname,
      method = req.method()
    if (method === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': req.headers().origin ?? 'http://localhost:5173',
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods': '*',
          'access-control-allow-headers': '*',
        },
      })
    const body = req.postDataJSON() ?? {}
    requests.push({ path, method, body })
    const send = (data: unknown, status = 200, list = false) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          data,
          ...(list ? { meta: { hasMore: false, nextCursor: null } } : {}),
        }),
      })
    const error = (
      status: number,
      code: string,
      message: string,
      fieldErrors?: Record<string, string>,
    ) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          code,
          message,
          fieldErrors,
          requestId: 'browser-test-request',
        }),
      })
    if (path === '/auth/login') {
      if (body.password === 'wrong')
        return error(400, 'VALIDATION_ERROR', 'Check your details', {
          email: 'Email needs attention',
        })
      user = body.email.startsWith('author') ? 'author' : 'participant'
      return send({})
    }
    if (path === '/auth/logout') {
      user = null
      return send({ success: true })
    }
    if (path === '/auth/me') {
      if (options.meFailure)
        return error(503, 'UNAVAILABLE', 'Temporarily unavailable')
      if (!user) return error(401, 'UNAUTHORIZED', 'Not authenticated')
      return send({
        id: uid(user === 'author' ? 1 : 5),
        email: `${user}@test.local`,
        emailVerified: true,
        status: 'ACTIVE',
        role: 'USER',
        profile: {
          id: uid(user === 'author' ? 1 : 5),
          displayName: user === 'author' ? 'Author' : 'Participant',
          handle: user,
          avatarUrl: null,
          bio: null,
          coverUrl: null,
          visibility: 'PUBLIC',
          relationship: 'NONE',
          followerCount: 0,
          followingCount: 0,
          publicProgramCount: 1,
          focusChips: [],
        },
        preferences: {
          timezone: 'America/Chicago',
          locale: 'en-US',
          defaultVisibility: 'PRIVATE',
          notifications: {
            inAppReminders: true,
            dailyEmail: false,
            dailyReminderTime: '08:00',
            groupActivity: true,
            followRequests: true,
            mutedGroupIds: [],
          },
        },
      })
    }
    if (path === '/notifications/unread-count') return send({ count: 0 })
    if (path === '/notifications') return send([], 200, true)
    if (path === '/notifications/read') return send({ ok: true })
    if (path === '/users/me/preferences' && method === 'PATCH')
      return send({
        timezone: body.timezone ?? 'America/Chicago',
        locale: 'en-US',
        defaultVisibility: 'PRIVATE',
        notifications: {
          inAppReminders: true,
          dailyEmail: false,
          dailyReminderTime: '08:00',
          groupActivity: true,
          followRequests: true,
          mutedGroupIds: [],
          ...(body.notifications as Record<string, unknown>),
        },
      })
    if (path === '/catalog/program-types') return send([type])
    if (path === '/catalog/focuses') return send([focus])
    if (path === '/discover')
      return send(
        [
          {
            kind: 'PROGRAM',
            program: summary(true),
            activity: null,
            creator: null,
          },
          ...(published
            ? [
                {
                  kind: 'PROGRAM',
                  program: summary(),
                  activity: null,
                  creator: null,
                },
              ]
            : []),
        ],
        200,
        true,
      )
    if (path === '/activities') return send([activity], 200, true)
    if (path === `/activities/${activityId}`)
      return send({
        ...activity,
        instructions: [instruction],
        media: [],
        metrics: [],
        tools: [],
        sourceActivity: null,
        draftRevision: 1,
        canEdit: false,
        canCopy: true,
      })
    if (path === '/programs' && method === 'POST') return send(workspace(), 201)
    if (path === '/programs') return send([summary()], 200, true)
    if (path.endsWith('/workspace')) return send(workspace())
    if (path.endsWith('/draft/activities')) {
      added = true
      revision++
      return send(workspace())
    }
    if (path.endsWith('/draft')) {
      if (conflict) {
        conflict = false
        title = 'Title from another tab'
        revision++
        return error(
          409,
          'VERSION_CONFLICT',
          'This draft changed on another screen.',
        )
      }
      if (body.expectedRevision !== revision)
        return error(409, 'VERSION_CONFLICT', 'Stale draft')
      if (body.title) title = body.title
      revision++
      return send(workspace())
    }
    if (path.endsWith('/draft/placements'))
      return send([
        {
          id: uid(15),
          activityId,
          revisionId: uid(21),
          title: 'Squats',
          relativeDay: 0,
          localTime: null,
          position: 0,
          targetOverrides: null,
          isManual: false,
        },
      ])
    if (path.endsWith('/publish-check'))
      return send({
        canPublish: added,
        issues: [],
        marketplaceEnabled: false,
        payoutAccountActive: false,
      })
    if (path.endsWith('/publish')) {
      published = true
      return send(workspace())
    }
    if (path.endsWith('/enrollments/preview'))
      return send({
        suggestedStartDate: body.startLocalDate,
        itemCount: 12,
        items: [
          {
            localDate: body.startLocalDate,
            localTime: null,
            title: 'Squats',
            programDayIndex: 0,
            conflict: false,
          },
        ],
      })
    if (path.endsWith('/enrollments')) {
      joined = true
      start = body.startLocalDate
      return send({ id: uid(40) }, 201)
    }
    if (/^\/enrollments\/[^/]+$/.test(path) && method === 'GET')
      return send({
        id: uid(40),
        program: summary(),
        programVersionId: uid(12),
        pendingVersionId: null,
        groupId: null,
        startLocalDate: start,
        timezone: 'America/Chicago',
        status: 'ACTIVE',
        calendarItemCount: 12,
      })
    if (/^\/programs\/[^/]+$/.test(path))
      return send({
        ...summary(path.endsWith(uid(11))),
        description: 'A simple strength practice.',
        latestVersionId: uid(12),
        safeActivityOutline: [
          { title: 'Squats', dayIndex: 0, mediaPreviewUrl: null },
        ],
        enrollmentCount: 0,
        completionRate: null,
        canJoin: !!user,
        canRequestAccess: false,
        canPurchase: false,
        myEnrollmentId: joined ? uid(40) : null,
      })
    if (path === '/calendar/items')
      return send(
        joined &&
          start >= url.searchParams.get('start')! &&
          start <= url.searchParams.get('end')!
          ? [item()]
          : [],
      )
    if (path.endsWith('/occurrence'))
      return send({
        item: item(),
        session,
        resultInputs: [
          {
            metricDefinitionId: uid(23),
            key: 'reps',
            label: 'Reps',
            valueType: 'INTEGER',
            unit: 'reps',
            required: false,
            instructionId: null,
            target: 10,
            previous: null,
            recorded,
            isPrimary: true,
          },
        ],
        collaborators: null,
        personalStats: [
          {
            key: 'completed',
            label: 'Completed',
            value: done ? '1' : '0',
            computedAt: '2026-11-07T12:00:00Z',
          },
        ],
        instructions: [instruction],
        tools: [],
        myMedia: [],
        sharedMedia: [],
        communityMedia: [],
        communityStats: null,
      } satisfies S['ActivityOccurrence'])
    if (method === 'GET' && /^\/sessions\/[^/]+$/.test(path)) return send({ session, entries: [] })
    if (path === '/sessions') {
      session = {
        id: uid(50),
        calendarItemId: itemId,
        activityRevisionId: uid(21),
        status: 'READY',
        startedAt: null,
        endedAt: null,
        activeSeconds: 0,
        isManualCompletion: false,
        revision: 0,
      }
      return send(session, 201)
    }
    if (path.endsWith('/results')) {
      recorded = body.values[0].value
      return send({ id: uid(60) }, 201)
    }
    if (path.endsWith('/actions')) {
      if (options.finishFailure && body.action === 'FINISH')
        return error(503, 'UNAVAILABLE', 'Could not confirm completion')
      if (!session || body.expectedRevision !== session.revision)
        return error(409, 'VERSION_CONFLICT', 'Session changed')
      session = {
        ...session,
        status:
          body.action === 'FINISH'
            ? 'FINISHED'
            : body.action === 'PAUSE'
              ? 'PAUSED'
              : 'ACTIVE',
        revision: session.revision + 1,
      }
      if (session.status === 'FINISHED') done = true
      return send({ session, item: item(), achievementsEarned: [] })
    }
    if (path.endsWith('/undo-completion')) {
      done = false
      session = null
      return send(item())
    }
    return error(404, 'NOT_FOUND', `Unhandled mock: ${method} ${path}`)
  })
  return { requests }
}
