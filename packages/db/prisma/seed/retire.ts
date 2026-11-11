import type { PrismaClient } from '../../src/client'
import { deterministicUuid } from './utils'

/**
 * Explicitly enumerated legacy platform seed slugs that were retired during the seed quality reset.
 * Only platform-owned rows (`creatorId: null`) matching these slugs are archived; user-owned rows
 * and existing enrollments, calendar items, sessions, and results remain untouched.
 */
export const RETIRED_STARTER_PROGRAM_SLUGS = [
  'starter-beginner-core-strength',
  'starter-daily-mindfulness-reflection',
  'starter-weekly-savings-budget',
  'starter-daily-language-study',
  'starter-staying-in-touch',
  'starter-hiit-aerobic-conditioning',
  'starter-full-body-calisthenics',
  'starter-joint-mobility-flow',
  'starter-functional-daily-fitness',
  'starter-deep-sleep-evening-reset',
  'starter-stress-relief-breathwork',
  'starter-mindful-walking-nature',
  'starter-weekly-intentional-habits',
  'starter-emergency-fund-kickstart',
  'starter-spending-audit-cleanup',
  'starter-personal-finance-fundamentals',
  'starter-exam-prep-retention',
  'starter-professional-skills-deep-work',
  'starter-daily-musical-practice',
  'starter-active-reading-habit',
  'starter-family-connection-rituals',
  'starter-intentional-quality-time',
  'starter-gratitude-communication',
] as const

export const RETIRED_ACTIVITY_SLUGS = [
  'warm-up',
  'squats',
  'morning-routine',
  'guided-meditation',
  'breathing-exercise',
  'gratitude-journal',
  'evening-wind-down',
  'savings-contribution',
  'weekly-budget-review',
  'categorize-expenses',
  'review-subscriptions',
  'vocabulary-review',
  'read-for-20-minutes',
  'practice-speaking',
  'listening-practice',
  'write-a-summary',
  'send-a-check-in-message',
  'call-a-friend',
  'plan-quality-time',
  'write-a-thank-you-note',
  'side-plank',
  'bird-dog',
  'dead-bug',
  'lunges',
  'wall-sit',
  'calf-raises',
  'step-ups',
  'chair-squats',
  'resistance-band-row',
  'standing-row',
  'brisk-walk',
  'easy-walk',
  'jog-intervals',
  'bike-ride',
  'stair-walking',
  'neck-mobility',
  'shoulder-circles',
  'hip-mobility',
  'calf-stretch',
  'hamstring-stretch',
  'gentle-yoga',
  'balance-practice',
  'breathing-break',
  'flashcard-practice',
  'read-a-chapter',
  'solve-practice-problems',
  'review-notes',
  'complete-a-lesson',
  'self-quiz',
  'research-a-topic',
  'practice-an-instrument',
  'review-mistakes',
  'teach-back-a-concept',
  'daily-reflection',
  'set-bedtime-reminder',
  'outdoor-break',
  'mindful-walk',
  'stretch-break',
  'screen-free-break',
  'weekly-reflection',
  'check-monthly-bills',
  'update-savings-goal',
  'review-spending-plan',
  'learn-a-finance-concept',
  'set-a-spending-reminder',
  'organize-receipts',
  'plan-a-purchase',
  'review-financial-goals',
  'family-activity',
  'shared-meal',
  'schedule-a-visit',
  'listen-and-reflect',
  'plan-a-group-outing',
  'reconnect-with-someone',
  'weekly-relationship-check-in',
  'celebrate-a-milestone',
] as const

/** Safely archives obsolete platform seed Programs and Activities without deleting user-referenced data. */
export async function retireObsoletePlatformSeeds(prisma: PrismaClient) {
  const retiredProgramIds = RETIRED_STARTER_PROGRAM_SLUGS.map((slug) => deterministicUuid(`program:${slug}`))
  const retiredCanonicalSlugs = RETIRED_STARTER_PROGRAM_SLUGS.map((slug) => slug.replace(/^starter-/, ''))
  const retiredActivityIds = RETIRED_ACTIVITY_SLUGS.map((slug) => deterministicUuid(`activity:${slug}`))

  const [programResult, activityResult] = await Promise.all([
    prisma.program.updateMany({
      where: {
        creatorId: null,
        status: { not: 'ARCHIVED' },
        OR: [{ id: { in: retiredProgramIds } }, { slug: { in: retiredCanonicalSlugs } }],
      },
      data: { status: 'ARCHIVED' },
    }),
    prisma.activity.updateMany({
      where: {
        creatorId: null,
        status: { not: 'ARCHIVED' },
        OR: [{ id: { in: retiredActivityIds } }, { slug: { in: [...RETIRED_ACTIVITY_SLUGS] } }],
      },
      data: { status: 'ARCHIVED' },
    }),
  ])

  return {
    retiredPrograms: programResult.count,
    retiredActivities: activityResult.count,
  }
}
