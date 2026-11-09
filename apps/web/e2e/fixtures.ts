import type { Page } from '@playwright/test'
import type { components } from '@project/sdk'
type S = components['schemas']
const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const programId = uid(10),
  activityId = uid(20),
  itemId = uid(30),
  groupId = uid(70)
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
    calendarItem?: boolean
    calendarDate?: string
    recurring?: boolean
    groupItem?: boolean
    added?: boolean
  } = {},
) {
  let user: 'author' | 'participant' | null = null,
    title = 'My Strength Workout',
    revision = 1,
    added = options.added ?? false,
    published = false,
    programVisibility: S['Visibility'] = 'PRIVATE',
    joined = false,
    groupCreated = false,
    createdGroupName: string | null = null,
    done = false,
    start = options.calendarDate ?? '2026-11-09',
    cancelled = false
  let groupMode: S['GroupMode'] = 'ASYNC'
  let joinLinkEnabled = false
  let memberLinkSharingEnabled = false
  let linkSequence = 0
  let activeActivityId = activityId
  let activeActivityTitle = 'Squats'
  let activeActivityRevisionId = uid(21)
  let activityRevision = 1
  let copied = false
  let activeActivitySummary = activity.summary
  let activityInstructions: S['Instruction'][] = []
  let placementExists = true
  let placementDay = 0
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
    visibility: seed ? 'PUBLIC' : programVisibility,
    accessMode: 'OPEN',
    prices: [],
    viewerAccess: user === 'author' ? 'OWNER' : 'PREVIEW',
    isPlatform: seed,
  })
  const workspace = (): S['ProgramWorkspace'] => ({
    ...summary(),
    visibility: published ? programVisibility : 'PRIVATE',
    accessMode: 'OPEN',
    status: published ? 'PUBLISHED' : 'DRAFT',
    frequency: { kind: 'N_PER_WEEK', n: 3 },
    generationMode: 'ALL_EACH_DAY',
    description: null,
    activityCount: added ? 1 : 0,
    instructionCount: added ? activityInstructions.length : 0,
    activities: added
      ? [
          {
            activityId: activeActivityId,
            revisionId: activeActivityRevisionId,
            title: activeActivityTitle,
            instructionCount: activityInstructions.length,
            mediaCount: 0,
            metrics: ['Reps'],
            placementCount: 12,
            canEdit: copied,
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
    status: cancelled ? 'CANCELLED' : done ? 'DONE' : 'PLANNED',
    title: activeActivityTitle,
    activityId: activeActivityId,
    activityRevisionId: activeActivityRevisionId,
    programTitle: title,
    enrollmentId: uid(40),
    programDayIndex: 0,
    recurrenceId: options.recurring ? uid(41) : null,
    conflict: false,
    locked: false,
    thumbnailUrl: options.calendarItem
      ? 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
      : null,
    participantAvatars: options.groupItem
      ? ['data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=']
      : [],
    unreadCount: 0,
    updatedAt: '2026-11-07T12:00:00Z',
  })
  const activityDetail = (): S['ActivityDetail'] => ({
    ...activity,
    id: activeActivityId,
    revisionId: activeActivityRevisionId,
    title: activeActivityTitle,
    summary: activeActivitySummary,
    instructionCount: activityInstructions.length,
    isCopy: copied,
    isPlatform: !copied,
    instructions: activityInstructions,
    media: [],
    metrics: [],
    tools: [],
    sourceActivity: copied ? activity : null,
    draftRevision: activityRevision,
    canEdit: copied,
    canCopy: true,
  })
  const placement = (): S['ProgramPlacement'] => ({
    id: uid(15),
    activityId: activeActivityId,
    revisionId: activeActivityRevisionId,
    title: activeActivityTitle,
    relativeDay: placementDay,
    localTime: null,
    position: 0,
    targetOverrides: null,
    isManual: false,
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
    let body: any = {}
    try {
      body = req.postDataJSON() ?? {}
    } catch {
      body = {}
    }
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
        emailVerified: true, emailVerificationRequired: true,
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
    if (path === '/catalog/categories')
      return send([
        {
          id: uid(3),
          slug: 'fitness',
          label: 'Fitness',
          icon: null,
        },
      ])
    if (path === '/discover' && url.searchParams.get('kind') === 'ACTIVITY') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      return send(
        activity.title.toLowerCase().includes(q)
          ? [{ kind: 'ACTIVITY', program: null, activity, creator: null }]
          : [],
        200,
        true,
      )
    }
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
    if (path === '/activities' && method === 'POST') {
      activeActivityId = uid(22)
      activeActivityRevisionId = uid(23)
      activeActivityTitle = String(body.title)
      activeActivitySummary =
        typeof body.summary === 'string' ? body.summary : null
      activityInstructions = []
      activityRevision = 1
      copied = true
      return send(activityDetail(), 201)
    }
    if (path === '/activities') return send([activity], 200, true)
    if (path === `/activities/${activityId}/copy` && method === 'POST') {
      activeActivityId = uid(26)
      activeActivityRevisionId = uid(21)
      activeActivityTitle = activity.title
      activeActivitySummary = activity.summary
      activityInstructions = [instruction]
      activityRevision = 1
      copied = true
      return send(activityDetail(), 201)
    }
    if (path === `/activities/${activeActivityId}` && method === 'GET')
      return send(activityDetail())
    if (
      path === `/activities/${activeActivityId}/draft/instructions` &&
      method === 'PUT'
    ) {
      activityInstructions = (
        (body.instructions as { title?: string | null; body?: string | null }[]) ??
        []
      ).map((entry, index) => ({
        ...instruction,
        id: uid(24 + index),
        instructionKey: uid(25 + index),
        position: index,
        title: entry.title ?? null,
        body: entry.body ?? null,
      }))
      activityRevision++
      return send(activityDetail())
    }
    if (
      path === `/activities/${activeActivityId}/draft` &&
      method === 'PATCH'
    ) {
      if (typeof body.title === 'string') activeActivityTitle = body.title
      if (typeof body.summary === 'string' || body.summary === null)
        activeActivitySummary = body.summary
      activityRevision++
      return send(activityDetail())
    }
    if (path === '/media/mine' && method === 'GET')
      return send([], 200, true)
    if (path === '/media/uploads' && method === 'POST')
      return send({
        uploadId: 'upload-one',
        mediaId: 'media:user:uploaded',
        method: 'PUT',
        uploadUrl: 'http://localhost:3001/media/upload-content',
        expiresAt: '2099-01-01T00:00:00Z',
        headers: { 'content-type': 'application/octet-stream' },
        maxBytes: 10_000_000,
      })
    if (path === '/media/upload-content')
      return route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
        },
      })
    if (path.startsWith('/media/uploads/') && path.endsWith('/complete') && method === 'POST')
      return send({
        id: 'media:user:uploaded',
        type: 'PHOTO',
        state: 'READY',
        originalUrl: '/uploaded.jpg',
        variants: [],
        alt: null,
        aspectRatio: 1.5,
        isOwner: true,
        createdAt: '2026-11-08T00:00:00Z',
      })
    if (path === '/media/media:user:uploaded' && method === 'GET')
      return send({
        id: 'media:user:uploaded',
        type: 'PHOTO',
        state: 'READY',
        originalUrl: '/uploaded.jpg',
        variants: [],
        alt: null,
        aspectRatio: 1.5,
        isOwner: true,
        createdAt: '2026-11-08T00:00:00Z',
      })
    if (path === '/media-attachments' && method === 'GET')
      return send([], 200, true)
    if (path === '/media-attachments' && method === 'POST')
      return send({ id: uid(90) }, 201)
    if (path === '/programs' && method === 'POST') return send(workspace(), 201)
    if (path === `/programs/${uid(11)}/copy` && method === 'POST') {
      title = 'Beginner Strength'
      added = true
      return send(workspace(), 201)
    }
    if (path === '/programs') return send([summary()], 200, true)
    if (path === '/groups' && method === 'GET')
      return send(
        groupCreated
          ? [
              {
                id: groupId,
                programId,
                programVersionId: uid(12),
                programTitle: title,
                name: createdGroupName,
                mode: groupMode,
                memberCount: 1,
                myRole: 'OWNER',
              } satisfies S['GroupSummary'],
            ]
          : [],
        200,
        true,
      )
    if (path === '/groups' && method === 'POST') {
      groupCreated = true
      groupMode = body.mode
      createdGroupName = typeof body.name === 'string' ? body.name : null
      // Like the server: a same-start group keeps the start date it was created with.
      if (typeof body.startLocalDate === 'string') start = body.startLocalDate
      return send({ id: groupId }, 201)
    }
    if (path === `/groups/${groupId}` && method === 'PATCH') {
      if (body.joinLinkEnabled !== undefined) joinLinkEnabled = body.joinLinkEnabled
      if (body.memberLinkSharingEnabled !== undefined) memberLinkSharingEnabled = body.memberLinkSharingEnabled
    }
    if (path === `/groups/${groupId}` && ['GET', 'PATCH'].includes(method))
      return send({
        id: groupId,
        programVersionId: uid(12),
        programTitle: title,
        name: createdGroupName,
        mode: groupMode,
        memberCount: 1,
        myRole: 'OWNER',
        startLocalDate: groupMode === 'SYNC' ? start : null,
        timezone: 'America/Chicago',
        joinLinkEnabled,
        memberLinkSharingEnabled,
        members: [
          {
            user: {
              id: uid(1),
              handle: 'author',
              displayName: 'Author',
              avatarUrl: null,
            },
            role: 'OWNER',
            status: 'ACTIVE',
            sharedCompletion: false,
          },
        ],
        mySharedCompletion: false,
        myEnrollment: joined
          ? {
              enrollmentId: uid(40),
              startLocalDate: start,
              startDateDiffers: false,
            }
          : null,
      } satisfies S['GroupDetail'])
    if (
      method === 'GET' &&
      [
        `/groups/${groupId}/invitations`,
        `/groups/${groupId}/completions`,
        `/groups/${groupId}/media`,
      ].includes(path)
    ) {
      return send([], 200, path.endsWith('/completions') || path.endsWith('/media'))
    }
    if (path === `/groups/${groupId}/invitations` && method === 'POST') {
      if (body.kind === 'LINK') { joinLinkEnabled = true; linkSequence += 1 }
      return send(
        {
          id: uid(71),
          kind: body.kind ?? 'USER',
          status: 'PENDING',
          expiresAt: '2099-11-14T00:00:00Z',
          joinUrl: body.kind === 'LINK' ? `http://localhost/join/link-${linkSequence}` : null,
          invitedUser: {
            id: uid(5),
            handle: String(body.handle ?? 'participant'),
            displayName: 'Participant',
            avatarUrl: null,
          },
        } satisfies S['GroupInvitation'],
        201,
      )
    }
    if (path.endsWith('/workspace')) return send(workspace())
    if (path.endsWith('/draft/activities')) {
      added = true
      revision++
      return send(workspace())
    }
    if (path.includes('/draft/activities/') && method === 'DELETE') {
      added = false
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
    if (path.endsWith('/draft/placements') && method === 'GET')
      return send(placementExists ? [placement()] : [])
    if (path.endsWith('/draft/placements') && method === 'POST') {
      placementExists = true
      placementDay = Number(body.relativeDay ?? 0)
      revision++
      return send(placement(), 201)
    }
    if (path.includes('/draft/placements/') && method === 'PATCH') {
      placementDay = Number(body.relativeDay ?? placementDay)
      revision++
      return send(placement())
    }
    if (path.includes('/draft/placements/') && method === 'DELETE') {
      placementExists = false
      revision++
      return send({ ok: true })
    }
    if (path.endsWith('/publish-check'))
      return send({
        canPublish: added,
        issues: [],
        marketplaceEnabled: false,
        payoutAccountActive: false,
      })
    if (path.endsWith('/publish')) {
      published = true
      programVisibility =
        body.visibility === 'PUBLIC' ||
        body.visibility === 'UNLISTED' ||
        body.visibility === 'PRIVATE'
          ? body.visibility
          : 'PRIVATE'
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
    if (path.endsWith('/enrollments') && method === 'POST') {
      joined = true
      start = body.startLocalDate
      return send({ id: uid(40) }, 201)
    }
    if (path === '/enrollments' && method === 'GET')
      return send(
        joined
          ? [
              {
                id: uid(40),
                program: summary(),
                programVersionId: uid(12),
                pendingVersionId: null,
                groupId: null,
                startLocalDate: start,
                timezone: 'America/Chicago',
                status: 'ACTIVE',
                calendarItemCount: 12,
                participationStartDate: start,
              } satisfies S['Enrollment'],
            ]
          : [],
        200,
        true,
      )
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
        participationStartDate: start,
      })
    if (path === '/resolve-slug') {
      const kind = url.searchParams.get('kind')
      return send({
        id: kind === 'ACTIVITY' ? activityId : programId,
        kind: kind === 'ACTIVITY' ? 'ACTIVITY' : 'PROGRAM',
        canonicalSlug: null,
        creatorHandle: null,
        isAlias: false,
        canonicalUrl:
          kind === 'ACTIVITY'
            ? `/activities/${activityId}`
            : `/programs/${programId}`,
      } satisfies S['SlugResolution'])
    }
    if (/^\/programs\/[^/]+$/.test(path))
      return send({
        ...summary(path.endsWith(uid(11))),
        description: 'A simple strength practice.',
        latestVersionId: uid(12),
        safeActivityOutline: [
          { title: 'Squats', dayIndex: 0, mediaPreviewUrl: null },
        ],
        enrollmentCount: 12,
        completionRate: 0.4,
        canJoin: !!user,
        canRequestAccess: false,
        canPurchase: false,
        myEnrollmentId: joined ? uid(40) : null,
      })
    if (path === '/calendar/items' && method === 'POST')
      return send(
        { item: item(), recurrence: null, createdCount: 1 },
        201,
      )
    if (path === '/calendar/items' && method === 'GET')
      return send(
        (joined || options.calendarItem) &&
          !cancelled &&
          start >= url.searchParams.get('start')! &&
          start <= url.searchParams.get('end')!
          ? [item()]
          : [],
      )
    if (path === `/calendar-items/${itemId}` && method === 'DELETE') {
      cancelled = true
      return send(item())
    }
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
