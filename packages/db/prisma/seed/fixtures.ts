import type { PrismaClient } from '../../src/client'
import { STARTER_PROGRAMS } from './content'
import { deterministicUuid, SEEDED_AT } from './utils'
import { seedDevAdmin } from './writer'

const DEMO_USERS = [
  {
    key: 'demo:user:alex',
    email: 'demo-alex@test.local',
    handle: 'alex',
    displayName: 'Alex Rivera',
    bio: 'Building a steady morning strength and mindfulness routine.',
  },
  {
    key: 'demo:user:sam',
    email: 'demo-sam@test.local',
    handle: 'sam',
    displayName: 'Sam Chen',
    bio: 'Consistency over intensity — tracking workouts, study blocks, and weekly habits.',
  },
] as const

// Precomputed bcrypt (cost 12) for 'demo password' so packages/db needs no bcrypt runtime dependency.
const DEMO_USER_HASH = '$2a$12$q.IgCIAGElCj1W/5tegXxeQs3TU8mrBlMaHrrusGT4o88ZDhzv3.C'

/**
 * Opt-in development/demo fixtures: local admin, two verified demo members, one shared ProgramGroup,
 * and deterministic sample enrollments + initial calendar items. Refused in NODE_ENV=production.
 */
export async function seedDemoFixtures(prisma: PrismaClient) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo fixtures cannot be seeded when NODE_ENV=production')
  }

  const adminEmail = await seedDevAdmin(prisma)

  const userIds: Record<string, string> = {}
  for (const u of DEMO_USERS) {
    const id = deterministicUuid(u.key)
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: { id, email: u.email, role: 'USER', status: 'ACTIVE', emailVerifiedAt: SEEDED_AT },
      update: { status: 'ACTIVE', deactivatedAt: null, emailVerifiedAt: SEEDED_AT },
    })
    await prisma.localCredential.upsert({
      where: { userId: user.id },
      create: { userId: user.id, passwordHash: DEMO_USER_HASH },
      update: {},
    })
    await prisma.userProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        handle: u.handle,
        displayName: u.displayName,
        bio: u.bio,
        visibility: 'PUBLIC',
      },
      update: { displayName: u.displayName, bio: u.bio, visibility: 'PUBLIC' },
    })
    await prisma.userPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, defaultVisibility: 'PUBLIC' },
      update: {},
    })
    userIds[u.handle] = user.id
  }

  const alexId = userIds.alex!
  const samId = userIds.sam!

  // Link Alex and Sam to the flagship Beginner Core & Strength Program in a sample SYNC group.
  const flagshipSlug = STARTER_PROGRAMS[0]!.slug
  const programId = deterministicUuid(`program:${flagshipSlug}`)
  const versionId = deterministicUuid(`program-version:${flagshipSlug}:1`)
  const groupId = deterministicUuid('demo:group:morning-core-crew')

  await prisma.programGroup.upsert({
    where: { id: groupId },
    create: {
      id: groupId,
      programVersionId: versionId,
      ownerId: alexId,
      name: 'Morning Core Crew',
      mode: 'SYNC',
      startLocalDate: SEEDED_AT,
      timezone: 'UTC',
      status: 'ACTIVE',
    },
    update: { name: 'Morning Core Crew', status: 'ACTIVE' },
  })

  for (const [userId, role] of [
    [alexId, 'OWNER'] as const,
    [samId, 'MEMBER'] as const,
  ]) {
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId, userId } },
      create: { groupId, userId, role, status: 'ACTIVE' },
      update: { role, status: 'ACTIVE' },
    })
  }

  const day1Items = await prisma.programScheduleItem.findMany({
    where: { programVersionId: versionId, relativeDay: 1 },
    orderBy: { position: 'asc' },
  })

  let enrollments = 0
  let calendarItems = 0
  for (const [handle, userId] of [
    ['alex', alexId] as const,
    ['sam', samId] as const,
  ]) {
    const enrollmentId = deterministicUuid(`demo:enrollment:${handle}:${flagshipSlug}`)
    await prisma.programEnrollment.upsert({
      where: { id: enrollmentId },
      create: {
        id: enrollmentId,
        userId,
        programId,
        programVersionId: versionId,
        groupId,
        startLocalDate: SEEDED_AT,
        participationStartDate: SEEDED_AT,
        timezone: 'UTC',
        status: 'ACTIVE',
        activeKey: `${userId}:${programId}`,
        generatedThroughDate: SEEDED_AT,
      },
      update: { groupId, status: 'ACTIVE' },
    })
    enrollments++

    await prisma.programAccessGrant.upsert({
      where: { source_sourceRef: { source: 'OPEN', sourceRef: `${userId}:${programId}` } },
      create: {
        id: deterministicUuid(`demo:grant:${handle}:${flagshipSlug}`),
        userId,
        programId,
        source: 'OPEN',
        sourceRef: `${userId}:${programId}`,
      },
      update: { revokedAt: null },
    })

    for (const item of day1Items) {
      const idempotencyKey = `${enrollmentId}:${item.id}:0`
      await prisma.calendarItem.upsert({
        where: { idempotencyKey },
        create: {
          id: deterministicUuid(`demo:calendar-item:${idempotencyKey}`),
          ownerId: userId,
          activityId: item.activityId,
          activityRevisionId: item.activityRevisionId,
          enrollmentId,
          sourceScheduleItemId: item.id,
          idempotencyKey,
          groupOccurrenceKey: `${groupId}:d1:${item.position}`,
          programDayIndex: 0,
          localDate: SEEDED_AT,
          localTime: item.localTime,
          status: 'PLANNED',
        },
        update: {},
      })
      calendarItems++
    }
  }

  return {
    adminEmail,
    demoUsers: DEMO_USERS.length,
    groups: 1,
    enrollments,
    calendarItems,
  }
}

