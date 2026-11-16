import { groupAction, sessionActionLabel } from '@/lib/joinEligibility'
import type { components } from '@project/sdk'
import type { AssistantTurn, HomeSignals } from './types'

type S = components['schemas']
import { canSuggestNewProgram } from './programEligibility'
import {
  mapActivityToCard,
  mapCalendarItemToCard,
  leadProgramFor,
  mapCreatorToCard,
  mapProgramToCard,
  mapSessionToCard,
  followedReason,
} from './cardMappers'
import {
  phraseActivityTurn,
  phraseCreatorTurn,
  phraseLiveSessionTurn,
  phraseProgramTurn,
} from './responseVoice'

function categoryNameFor(
  categories: Array<{ id: string; name: string }>,
  categoryId?: string | null,
): string | undefined {
  if (!categoryId) return undefined
  return categories.find((c) => c.id === categoryId)?.name
}

/**
 * Deterministic 6-tier signal ranker for the Home opening state:
 * personal relevance -> timeliness -> popularity -> exploration.
 */
export function rankHomeSignals(
  signals: HomeSignals,
  excludedIds: string[] = [],
): AssistantTurn {
  const excluded = new Set(excludedIds)

  // Tier 1: Relevant to me, right now (today's scheduled Activity)
  if (signals.isSignedIn) {
    const pendingToday = signals.todayItems.filter(
      (item) => item.status === 'PLANNED' && !excluded.has(item.id),
    )
    const nextItem = pendingToday[0]
    if (nextItem) {
      const reasonParts = [
        nextItem.localTime ? `Scheduled at ${nextItem.localTime} today` : 'Scheduled for today',
        nextItem.durationMinutes ? `${nextItem.durationMinutes} minutes` : null,
        nextItem.programTitle ? `Part of ${nextItem.programTitle}` : null,
      ].filter(Boolean)

      return {
        nodeId: 'opening',
        question:
          pendingToday.length === 1
            ? 'You have one Activity left today.'
            : `You have ${pendingToday.length} Activities left today.`,
        contextLine: 'Want to finish it right now?',
        whyReason: reasonParts.join(' · '),
        showMeSubject: { kind: 'schedule' },
        card: mapCalendarItemToCard(nextItem),
        choices: [
          {
            id: 'start-now',
            label: 'Start now',
            variant: 'primary',
            effect: {
              type: 'execute',
              action: { type: 'open_occurrence', itemId: nextItem.id },
            },
          },
          {
            id: 'show-day',
            label: 'Show my day',
            variant: 'secondary',
            effect: { type: 'transition', nodeId: 'day_schedule' },
          },
          {
            // Opens the shared dialog; a recurring item asks This one / This and future (03-UX §2a).
            id: 'reschedule',
            label: 'Reschedule',
            variant: 'secondary',
            effect: {
              type: 'execute',
              action: {
                type: 'reschedule_item',
                item: {
                  id: nextItem.id,
                  title: nextItem.title,
                  localDate: nextItem.localDate,
                  localTime: nextItem.localTime,
                  recurrenceId: nextItem.recurrenceId,
                  updatedAt: nextItem.updatedAt,
                  gatheringId: nextItem.gatheringId ?? null,
                },
              },
            },
          },
          {
            id: 'something-else',
            label: 'Something else',
            variant: 'secondary',
            effect: { type: 'transition', nodeId: 'intent_menu' },
          },
        ],
      }
    }

    // Tier 1b: Unfinished / active Program enrollment
    const activeEnrollment = signals.activeEnrollments.find(
      (e) => e.status === 'ACTIVE' && !excluded.has(e.programId),
    )
    if (activeEnrollment) {
      return {
        nodeId: 'opening',
        // Claim progress only after real participation; before that, name what comes first.
        ...(activeEnrollment.hasParticipated
          ? {
              question: `You've been working on ${activeEnrollment.programTitle}.`,
              contextLine: 'Ready for the next session?',
              whyReason: 'You have this Program in progress.',
            }
          : {
              question: `${activeEnrollment.programTitle} is on your Calendar.`,
              contextLine: activeEnrollment.nextActivity
                ? `First up: ${activeEnrollment.nextActivity.title}, ${firstDayLabel(activeEnrollment.nextActivity.date)}.`
                : 'Its Activities are on your Calendar.',
              whyReason: 'You started this Program and have not done an Activity from it yet.',
            }),
        showMeSubject: { kind: 'program', id: activeEnrollment.programId, title: activeEnrollment.programTitle },
        choices: [
          {
            id: 'continue-program',
            label: 'Show me',
            variant: 'primary',
            effect: {
              type: 'execute',
              action: {
                type: 'preview',
                target: { kind: 'program', id: activeEnrollment.programId },
              },
            },
          },
          {
            id: 'something-else',
            label: 'Try something else',
            variant: 'secondary',
            effect: { type: 'transition', nodeId: 'intent_menu' },
          },
        ],
      }
    }
  }

  // Tier 2 (12 §5c): the FOR_YOU order (Following, Your interests, then Explore across Domains) with
  // its truthful reason, so a new account's first suggestion is varied rather than whatever was
  // published last. "Another idea" excludes what was shown and continues down the same order.
  // Followed creators' newest, then the newest Program, only when FOR_YOU has nothing eligible.
  if (signals.isSignedIn) {
    const eligible = (item: S['DiscoverItem']) =>
      !!item.program && !excluded.has(item.program.id) && canSuggestNewProgram(item.program, signals)
    const forYou = (signals.forYouPrograms ?? []).find(eligible)
    const followed = forYou ? undefined : (signals.followedPrograms ?? []).find(eligible)
    const freshProgram = forYou ?? followed ?? signals.newPrograms.find(eligible)
    const reason = forYou ? forYou.reason ?? null : followed ? followedReason(followed) : null
    if (freshProgram?.program) {
      const voice = phraseProgramTurn(
        freshProgram.program,
        freshProgram.participantCount,
        { excludedIds },
      )
      return {
        nodeId: 'opening',
        question:
          reason || excludedIds.length > 0
            ? voice.question
            : `New: ${freshProgram.program.title}`,
        contextLine: reason?.label ?? voice.contextLine,
        whyReason: reason?.label ?? voice.whyReason,
        showMeSubject: {
          kind: 'program',
          id: freshProgram.program.id,
          title: freshProgram.program.title,
        },
        card: mapProgramToCard(
          freshProgram.program,
          freshProgram.participantCount,
          freshProgram.featuredGroup,
        ),
        choices: [
          {
            id: 'open-program',
            label: 'Show me',
            variant: 'primary',
            effect: {
              type: 'execute',
              action: {
                type: 'preview',
                target: { kind: 'program', id: freshProgram.program.id },
              },
            },
          },
          {
            id: 'different',
            label: 'Another idea',
            variant: 'secondary',
            effect: { type: 'refine', kind: 'different' },
          },
          {
            id: 'something-else',
            label: 'Something else',
            variant: 'secondary',
            effect: { type: 'transition', nodeId: 'intent_menu' },
          },
        ],
      }
    }
  }

  // Tier 3: Happening now (live / starting-soon public sessions)
  const liveSession = signals.liveSessions.find((item) => {
    const id = item.featuredGroup?.id ?? item.program?.id
    return id && !excluded.has(id) &&
      (Boolean(item.featuredGroup) || Boolean(item.program && canSuggestNewProgram(item.program, signals)))
  })
  if (liveSession) {
    const card = mapSessionToCard(liveSession)
    if (card) {
      const voice = phraseLiveSessionTurn(
        card.title,
        liveSession.participantCount,
        liveSession.featuredGroup?.memberAvatars?.length ?? 0,
        excludedIds.length,
      )
      return {
        nodeId: 'opening',
        question: voice.question,
        contextLine: voice.contextLine,
        whyReason: card.subtitle,
        showMeSubject: liveSession.featuredGroup
          ? {
              kind: 'session',
              id: liveSession.featuredGroup.id,
              title: card.title,
              users: liveSession.featuredGroup.memberAvatars ?? [],
            }
          : undefined,
        card,
        choices: [
          {
            id: 'join-session',
            // Never Join for a member or the owner (12 §5a).
            label: liveSession.featuredGroup ? sessionActionLabel(groupAction(liveSession.featuredGroup)) : 'View session',
            variant: 'primary',
            effect: { type: 'execute', action: card.primaryAction },
          },
          ...(liveSession.featuredGroup
            ? [
                {
                  id: 'show-me',
                  label: 'Show me',
                  variant: 'secondary' as const,
                  effect: { type: 'show_me' as const },
                },
              ]
            : []),
          {
            id: 'something-else',
            label: 'Something else',
            variant: 'secondary',
            effect: { type: 'transition', nodeId: 'intent_menu' },
          },
        ],
      }
    }
  }

  // Tier 4 & 5: Popular Programs
  const popular = signals.popularPrograms.find(
    (item) => item.program && !excluded.has(item.program.id) && canSuggestNewProgram(item.program, signals),
  )
  if (popular?.program) {
    const p = popular.program
    const voice = phraseProgramTurn(p, popular.participantCount, {
      excludedIds,
      preferPopular: true,
    })

    return {
      nodeId: 'opening',
      question: voice.question,
      contextLine: voice.contextLine,
      whyReason: voice.whyReason,
      showMeSubject: { kind: 'program', id: p.id, title: p.title },
      card: mapProgramToCard(
        popular.program,
        popular.participantCount,
        popular.featuredGroup,
      ),
      choices: [
        {
          id: 'start-program',
          label: 'Show me',
          variant: 'primary',
          effect: {
            type: 'execute',
            action: {
              type: 'preview',
              target: { kind: 'program', id: popular.program.id },
            },
          },
        },
        {
          id: 'why-this',
          label: 'Why this?',
          variant: 'secondary',
          effect: { type: 'explain_why' },
        },
        {
          id: 'something-else',
          label: 'Something else',
          variant: 'secondary',
          effect: { type: 'transition', nodeId: 'intent_menu' },
        },
      ],
    }
  }

  // Tier 6: Explore an Activity or Creator
  const activity = signals.activities.find(
    (item) => item.activity && !excluded.has(item.activity.id),
  )
  if (activity?.activity) {
    const categoryName = categoryNameFor(
      signals.categories,
      activity.activity.categoryId,
    )
    const voice = phraseActivityTurn(activity.activity, categoryName, {
      excludedIds,
    })
    return {
      nodeId: 'opening',
      question: voice.question,
      contextLine: voice.contextLine,
      whyReason: voice.whyReason,
      card: mapActivityToCard(activity.activity, categoryName),
      choices: [
        {
          id: 'start-activity',
          label: 'Start now',
          variant: 'primary',
          effect: {
            type: 'execute',
            action: { type: 'open_activity', activityId: activity.activity.id },
          },
        },
        {
          id: 'schedule-activity',
          label: 'Add to Schedule',
          variant: 'secondary',
          effect: {
            type: 'execute',
            action: { type: 'schedule_activity', activityId: activity.activity.id, title: activity.activity.title },
          },
        },
        {
          id: 'something-else',
          label: 'Something else',
          variant: 'secondary',
          effect: { type: 'transition', nodeId: 'intent_menu' },
        },
      ],
    }
  }

  const creator = signals.creators.find(
    (item) => item.creator && !excluded.has(item.creator.id),
  )
  if (creator?.creator) {
    const voice = phraseCreatorTurn(creator.creator, excludedIds.length)
    return {
      nodeId: 'opening',
      question: voice.question,
      contextLine: voice.contextLine,
      card: mapCreatorToCard(creator.creator, leadProgramFor(creator.creator.id, [signals.forYouPrograms, signals.followedPrograms, signals.popularPrograms, signals.newPrograms])),
      choices: [
        {
          id: 'open-creator',
          label: 'Preview creator',
          variant: 'primary',
          effect: {
            type: 'execute',
            action: {
              type: 'preview',
              target: { kind: 'creator', handle: creator.creator.handle },
            },
          },
        },
        {
          id: 'something-else',
          label: 'Something else',
          variant: 'secondary',
          effect: { type: 'transition', nodeId: 'intent_menu' },
        },
      ],
    }
  }

  // Final fallback when catalog is empty
  return {
    nodeId: 'opening',
    question: 'What would you like to do today?',
    contextLine: 'Choose a path to get started.',
    choices: [
      {
        id: 'now',
        label: 'Do something now',
        variant: 'primary',
        effect: { type: 'transition', nodeId: 'now_time' },
      },
      {
        id: 'program',
        label: 'Explore Programs',
        variant: 'secondary',
        effect: { type: 'transition', nodeId: 'program_goal' },
      },
      {
        id: 'browse',
        label: 'Browse all',
        variant: 'secondary',
        effect: { type: 'execute', action: { type: 'open_browse' } },
      },
    ],
  }
}

/** "today", "tomorrow", or "Mon, Nov 16" for a local YYYY-MM-DD date. */
function firstDayLabel(date: string, now = new Date()): string {
  const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (date === local(now)) return 'today'
  if (date === local(tomorrow)) return 'tomorrow'
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
