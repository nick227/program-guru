import type { AssistantTurn, HomeSignals } from './types'
import { canSuggestNewProgram } from './programEligibility'
import {
  mapActivityToCard,
  mapCalendarItemToCard,
  mapCreatorToCard,
  mapProgramToCard,
  mapSessionToCard,
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
            id: 'move-tomorrow',
            label: 'Move to tomorrow',
            variant: 'secondary',
            effect: {
              type: 'execute',
              action: {
                type: 'move_to_tomorrow',
                itemId: nextItem.id,
                title: nextItem.title,
                updatedAt: nextItem.updatedAt,
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
        question: `You've been working on ${activeEnrollment.programTitle}.`,
        contextLine: 'Ready for the next session?',
        whyReason: 'You have this Program in progress.',
        showMeSubject: { kind: 'progress' },
        choices: [
          {
            id: 'continue-program',
            label: 'Preview Program',
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
            id: 'show-me',
            label: 'Show me',
            variant: 'secondary',
            effect: { type: 'show_me' },
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

  // Tier 2: People I follow / New Programs
  if (signals.isSignedIn) {
    const freshProgram = signals.newPrograms.find(
      (item) => item.program && !excluded.has(item.program.id) && canSuggestNewProgram(item.program, signals),
    )
    if (freshProgram?.program) {
      const voice = phraseProgramTurn(
        freshProgram.program,
        freshProgram.participantCount,
        { excludedIds },
      )
      return {
        nodeId: 'opening',
        question:
          excludedIds.length === 0
            ? `New: ${freshProgram.program.title}`
            : voice.question,
        contextLine: voice.contextLine,
        whyReason: voice.whyReason,
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
            label: 'Preview Program',
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
    return id && !excluded.has(id)
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
        presentationHint: { mode: 'happening_now', label: 'Happening now' },
        choices: [
          {
            id: 'join-session',
            label: 'Join session',
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
          label: 'Preview Program',
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
          id: 'show-me',
          label: 'Show me',
          variant: 'secondary',
          effect: { type: 'show_me' },
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
      card: mapCreatorToCard(creator.creator),
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
        label: 'Start a Program',
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

