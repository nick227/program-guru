import type {
  AssistantTurn,
  DiscoveryState,
  FlowNodeId,
  HomeSignals,
} from './types'
import {
  mapActivityToCard,
  mapCalendarItemToCard,
  mapCreatorToCard,
  mapProgramToCard,
  mapSessionToCard,
} from './cardMappers'
import { rankHomeSignals } from './rankHomeSignals'
import {
  phraseActivityTurn,
  phraseCreatorTurn,
  phraseLiveSessionTurn,
  phraseProgramTurn,
} from './responseVoice'

function categoryNameFor(
  signals: HomeSignals,
  categoryId?: string,
): string | undefined {
  if (!categoryId) return undefined
  return signals.categories.find((c) => c.id === categoryId)?.name
}

function pickActivity(state: DiscoveryState, signals: HomeSignals) {
  const excluded = new Set(state.excludedIds)
  const candidates = signals.activities
    .map((i) => i.activity)
    .filter((a): a is NonNullable<typeof a> => Boolean(a && !excluded.has(a.id)))

  const exact = candidates.filter((a) => {
    const fitsTime =
      !state.maxMinutes ||
      state.maxMinutes >= 999 ||
      !a.durationMinutes ||
      a.durationMinutes <= state.maxMinutes
    const fitsCategory = !state.categoryId || a.categoryId === state.categoryId
    return fitsTime && fitsCategory
  })

  if (exact.length > 0) return exact[0]

  // If the user explicitly picked a category, never silently switch to another category.
  if (state.categoryId) {
    const byCategory = candidates.filter((a) => a.categoryId === state.categoryId)
    return byCategory[0] ?? null
  }

  const byTime = candidates.filter(
    (a) =>
      !state.maxMinutes ||
      state.maxMinutes >= 999 ||
      !a.durationMinutes ||
      a.durationMinutes <= state.maxMinutes,
  )
  if (byTime.length > 0) return byTime[0]

  return candidates[0] ?? null
}

function pickProgram(state: DiscoveryState, signals: HomeSignals) {
  const excluded = new Set(state.excludedIds)
  const pool = [...signals.popularPrograms, ...signals.newPrograms]
  const seen = new Set<string>()
  const candidates = pool
    .map((i) => ({
      program: i.program,
      count: i.participantCount,
      featuredGroup: i.featuredGroup,
    }))
    .filter(
      (
        entry,
      ): entry is {
        program: NonNullable<typeof entry.program>
        count: number | null | undefined
        featuredGroup: typeof entry.featuredGroup
      } => {
        if (
          !entry.program ||
          excluded.has(entry.program.id) ||
          seen.has(entry.program.id)
        ) {
          return false
        }
        seen.add(entry.program.id)
        return true
      },
    )

  const filtered = candidates.filter(({ program }) => {
    const fitsLevel =
      !state.level ||
      state.level === 'ALL_LEVELS' ||
      program.level === state.level ||
      program.level === 'ALL_LEVELS'
    const fitsTime =
      !state.maxMinutes ||
      state.maxMinutes >= 999 ||
      !program.sessionMinutes ||
      program.sessionMinutes <= state.maxMinutes
    return fitsLevel && fitsTime
  })

  return filtered[0] ?? candidates[0] ?? null
}

function resolveIntentMenu(signals: HomeSignals): AssistantTurn {
  const hasContinue =
    signals.isSignedIn &&
    (signals.todayItems.some((i) => i.status === 'PLANNED') ||
      signals.activeEnrollments.some((e) => e.status === 'ACTIVE'))

  const choices: AssistantTurn['choices'] = [
    {
      id: 'intent-now',
      label: 'Do something now',
      variant: 'primary',
      effect: { type: 'transition', nodeId: 'now_time' },
    },
    {
      id: 'intent-program',
      label: 'Start a Program',
      variant: 'secondary',
      effect: { type: 'transition', nodeId: 'program_goal' },
    },
    {
      id: 'intent-together',
      label: 'Do something together',
      variant: 'secondary',
      effect: { type: 'transition', nodeId: 'together_result' },
    },
    hasContinue
      ? {
          id: 'intent-continue',
          label: 'Continue where I left off',
          variant: 'secondary',
          effect: { type: 'transition', nodeId: 'continue_result' },
        }
      : {
          id: 'intent-new',
          label: 'Find something new',
          variant: 'secondary',
          effect: { type: 'transition', nodeId: 'explore_interest' },
        },
  ]

  return {
    nodeId: 'intent_menu',
    question: 'What would you like to do?',
    contextLine: 'Pick a direction and I will narrow it down.',
    choices,
  }
}

function resolveNowTime(): AssistantTurn {
  return {
    nodeId: 'now_time',
    question: 'How much time do you have?',
    contextLine: 'I will match an Activity to your window.',
    choices: [
      {
        id: 'time-10',
        label: '10 minutes',
        variant: 'primary',
        effect: {
          type: 'transition',
          nodeId: 'now_interest',
          patch: { maxMinutes: 10 },
        },
      },
      {
        id: 'time-20',
        label: '20 minutes',
        variant: 'secondary',
        effect: {
          type: 'transition',
          nodeId: 'now_interest',
          patch: { maxMinutes: 20 },
        },
      },
      {
        id: 'time-30',
        label: '30+ minutes',
        variant: 'secondary',
        effect: {
          type: 'transition',
          nodeId: 'now_interest',
          patch: { maxMinutes: 999 },
        },
      },
    ],
  }
}

function resolveNowInterest(
  state: DiscoveryState,
  signals: HomeSignals,
): AssistantTurn {
  const topCategories = signals.categories.slice(0, 3)
  if (topCategories.length === 0) {
    return resolveNowResult(state, signals)
  }

  return {
    nodeId: 'now_interest',
    question: 'What kind of Activity sounds good?',
    contextLine:
      state.maxMinutes && state.maxMinutes < 999
        ? `Fitting into ${state.maxMinutes} minutes or less.`
        : 'Pick a domain or let me choose.',
    choices: [
      ...topCategories.map((cat, idx) => ({
        id: `cat-${cat.id}`,
        label: cat.name,
        variant: (idx === 0 ? 'primary' : 'secondary') as 'primary' | 'secondary',
        effect: {
          type: 'transition' as const,
          nodeId: 'now_result' as const,
          patch: { categoryId: cat.id, categoryName: cat.name },
        },
      })),
      {
        id: 'cat-any',
        label: 'Surprise me',
        variant: 'secondary',
        effect: {
          type: 'transition',
          nodeId: 'now_result',
          patch: { categoryId: undefined, categoryName: undefined },
        },
      },
    ],
  }
}

function resolveNowResult(
  state: DiscoveryState,
  signals: HomeSignals,
): AssistantTurn {
  const activity = pickActivity(state, signals)
  if (!activity) {
    return {
      nodeId: 'now_result',
      question: state.categoryName
        ? `No ${state.categoryName} Activities matched right now.`
        : 'No more Activities matched that filter.',
      contextLine: 'Try another category, browse the library, or start over.',
      choices: [
        {
          id: 'pick-another-cat',
          label: 'Other domains',
          variant: 'primary',
          effect: {
            type: 'transition',
            nodeId: 'now_interest',
            patch: { categoryId: undefined, categoryName: undefined },
          },
        },
        {
          id: 'browse',
          label: 'Browse Activities',
          variant: 'secondary',
          effect: { type: 'execute', action: { type: 'open_browse' } },
        },
        {
          id: 'reset',
          label: 'Start over',
          variant: 'secondary',
          effect: { type: 'reset' },
        },
      ],
    }
  }

  const categoryName = categoryNameFor(signals, activity.categoryId)
  const voice = phraseActivityTurn(activity, categoryName, state)

  const matchingExtras = signals.activities
    .map((i) => i.activity)
    .filter(
      (a): a is NonNullable<typeof a> =>
        Boolean(
          a &&
            a.id !== activity.id &&
            (!state.categoryId || a.categoryId === state.categoryId) &&
            (!state.maxMinutes ||
              state.maxMinutes >= 999 ||
              !a.durationMinutes ||
              a.durationMinutes <= state.maxMinutes),
        ),
    )
    .slice(0, 3)
    .map((a) => mapActivityToCard(a, categoryNameFor(signals, a.categoryId)))

  return {
    nodeId: 'now_result',
    question: voice.question,
    contextLine: voice.contextLine,
    whyReason: voice.whyReason,
    card: mapActivityToCard(activity, categoryName),
    presentationHint:
      matchingExtras.length > 0
        ? { label: 'Results', items: matchingExtras }
        : undefined,
    choices: [
      {
        id: 'start-activity',
        label: 'Start',
        variant: 'primary',
        effect: {
          type: 'execute',
          action: { type: 'open_activity', activityId: activity.id },
        },
      },
      {
        id: 'shorter',
        label: 'Shorter',
        variant: 'secondary',
        effect: { type: 'refine', kind: 'shorter' },
      },
      {
        id: 'different',
        label: 'Different idea',
        variant: 'secondary',
        effect: { type: 'refine', kind: 'different' },
      },
      {
        id: 'with-others',
        label: 'With others',
        variant: 'secondary',
        effect: { type: 'refine', kind: 'with_others' },
      },
    ],
  }
}

function resolveProgramGoal(signals: HomeSignals): AssistantTurn {
  const topCategories = signals.categories.slice(0, 3)
  if (topCategories.length === 0) {
    return resolveProgramExperience()
  }

  return {
    nodeId: 'program_goal',
    question: 'What is your focus for a new Program?',
    contextLine: 'I will narrow down Programs that match.',
    choices: [
      ...topCategories.map((cat, idx) => ({
        id: `prog-cat-${cat.id}`,
        label: cat.name,
        variant: (idx === 0 ? 'primary' : 'secondary') as 'primary' | 'secondary',
        effect: {
          type: 'transition' as const,
          nodeId: 'program_experience' as const,
          patch: { categoryId: cat.id, categoryName: cat.name },
        },
      })),
      {
        id: 'prog-any',
        label: 'Show top picks',
        variant: 'secondary',
        effect: {
          type: 'transition',
          nodeId: 'program_experience',
          patch: { categoryId: undefined, categoryName: undefined },
        },
      },
    ],
  }
}

function resolveProgramExperience(): AssistantTurn {
  return {
    nodeId: 'program_experience',
    question: 'What experience level feels right?',
    contextLine: 'We will match the pacing to you.',
    choices: [
      {
        id: 'lvl-beginner',
        label: 'Beginner',
        variant: 'primary',
        effect: {
          type: 'transition',
          nodeId: 'program_commitment',
          patch: { level: 'BEGINNER' },
        },
      },
      {
        id: 'lvl-intermediate',
        label: 'Intermediate',
        variant: 'secondary',
        effect: {
          type: 'transition',
          nodeId: 'program_commitment',
          patch: { level: 'INTERMEDIATE' },
        },
      },
      {
        id: 'lvl-all',
        label: 'All levels',
        variant: 'secondary',
        effect: {
          type: 'transition',
          nodeId: 'program_commitment',
          patch: { level: 'ALL_LEVELS' },
        },
      },
    ],
  }
}

function resolveProgramCommitment(): AssistantTurn {
  return {
    nodeId: 'program_commitment',
    question: 'How long per session works best?',
    contextLine: 'Pick a realistic daily commitment.',
    choices: [
      {
        id: 'comm-15',
        label: '15 min or less',
        variant: 'primary',
        effect: {
          type: 'transition',
          nodeId: 'program_result',
          patch: { maxMinutes: 15 },
        },
      },
      {
        id: 'comm-30',
        label: '20–30 min',
        variant: 'secondary',
        effect: {
          type: 'transition',
          nodeId: 'program_result',
          patch: { maxMinutes: 30 },
        },
      },
      {
        id: 'comm-any',
        label: 'Any length',
        variant: 'secondary',
        effect: {
          type: 'transition',
          nodeId: 'program_result',
          patch: { maxMinutes: 999 },
        },
      },
    ],
  }
}

function resolveProgramResult(
  state: DiscoveryState,
  signals: HomeSignals,
): AssistantTurn {
  const match = pickProgram(state, signals)
  if (!match) {
    return {
      nodeId: 'program_result',
      question: 'No more Programs matched those filters.',
      contextLine: 'Want to explore the full catalog instead?',
      choices: [
        {
          id: 'browse-programs',
          label: 'Browse Programs',
          variant: 'primary',
          effect: { type: 'execute', action: { type: 'open_browse' } },
        },
        {
          id: 'reset',
          label: 'Start over',
          variant: 'secondary',
          effect: { type: 'reset' },
        },
      ],
    }
  }

  const voice = phraseProgramTurn(match.program, match.count, state)

  return {
    nodeId: 'program_result',
    question: voice.question,
    contextLine: voice.contextLine,
    whyReason: voice.whyReason,
    showMeSubject: {
      kind: 'program',
      id: match.program.id,
      title: match.program.title,
    },
    card: mapProgramToCard(match.program, match.count, match.featuredGroup),
    presentationHint: state.preferPopular
      ? { mode: 'popular', label: 'Popular' }
      : undefined,
    choices: [
      {
        id: 'open-program',
        label: 'Preview Program',
        variant: 'primary',
        effect: {
          type: 'execute',
          action: {
            type: 'preview',
            target: { kind: 'program', id: match.program.id },
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
        id: 'with-others',
        label: 'Find people doing this',
        variant: 'secondary',
        effect: { type: 'refine', kind: 'with_others' },
      },
    ],
  }
}

function resolveTogetherResult(
  state: DiscoveryState,
  signals: HomeSignals,
): AssistantTurn {
  const excluded = new Set(state.excludedIds)
  const sessionItem = signals.liveSessions.find((item) => {
    const id = item.featuredGroup?.id ?? item.program?.id
    return id && !excluded.has(id)
  })
  const card = sessionItem ? mapSessionToCard(sessionItem) : null

  if (!card) {
    const fallbackProgram = pickProgram(state, signals)
    if (fallbackProgram) {
      return {
        nodeId: 'together_result',
        question: 'No live sessions are open right now.',
        contextLine: 'You can start a popular Program and invite others.',
        card: mapProgramToCard(
          fallbackProgram.program,
          fallbackProgram.count,
          fallbackProgram.featuredGroup,
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
                target: { kind: 'program', id: fallbackProgram.program.id },
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
  }

  if (!card) {
    return {
      nodeId: 'together_result',
      question: 'No public sessions are available right now.',
      contextLine: 'Want to try an individual Activity instead?',
      choices: [
        {
          id: 'do-now',
          label: 'Do something now',
          variant: 'primary',
          effect: { type: 'transition', nodeId: 'now_time' },
        },
        {
          id: 'browse',
          label: 'Browse Community',
          variant: 'secondary',
          effect: { type: 'execute', action: { type: 'open_browse' } },
        },
      ],
    }
  }

  const voice = phraseLiveSessionTurn(
    card.title,
    sessionItem?.participantCount,
    sessionItem?.featuredGroup?.memberAvatars?.length ?? 0,
    state.excludedIds.length,
  )

  return {
    nodeId: 'together_result',
    question: voice.question,
    contextLine: voice.contextLine,
    showMeSubject: sessionItem?.featuredGroup
      ? {
          kind: 'session',
          id: sessionItem.featuredGroup.id,
          title: card.title,
          users: sessionItem.featuredGroup.memberAvatars ?? [],
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
      {
        id: 'different',
        label: 'See another',
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

function resolveContinueResult(
  state: DiscoveryState,
  signals: HomeSignals,
): AssistantTurn {
  const excluded = new Set(state.excludedIds)
  const nextToday = signals.todayItems.find(
    (i) => i.status === 'PLANNED' && !excluded.has(i.id),
  )

  if (nextToday) {
    return {
      nodeId: 'continue_result',
      question: 'Pick up where you left off?',
      contextLine: 'Scheduled on your calendar for today.',
      card: mapCalendarItemToCard(nextToday),
      choices: [
        {
          id: 'start-next',
          label: 'Start now',
          variant: 'primary',
          effect: {
            type: 'execute',
            action: { type: 'open_occurrence', itemId: nextToday.id },
          },
        },
        {
          id: 'show-day',
          label: 'Show my day',
          variant: 'secondary',
          effect: { type: 'transition', nodeId: 'day_schedule' },
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

  const active = signals.activeEnrollments.find(
    (e) => e.status === 'ACTIVE' && !excluded.has(e.programId),
  )
  if (active) {
    return {
      nodeId: 'continue_result',
      question: `Ready to continue ${active.programTitle}?`,
      contextLine: 'Your active Program is waiting.',
      choices: [
        {
          id: 'open-active',
          label: 'Preview Program',
          variant: 'primary',
          effect: {
            type: 'execute',
            action: {
              type: 'preview',
              target: { kind: 'program', id: active.programId },
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

  return resolveProgramGoal(signals)
}

function resolveExploreInterest(): AssistantTurn {
  return {
    nodeId: 'explore_interest',
    question: 'What would you like to discover?',
    contextLine: 'Explore something new across Program.Guru.',
    choices: [
      {
        id: 'exp-creators',
        label: 'Creators',
        variant: 'primary',
        effect: {
          type: 'transition',
          nodeId: 'explore_result',
          patch: { exploreKind: 'CREATOR' },
        },
      },
      {
        id: 'exp-programs',
        label: 'Programs',
        variant: 'secondary',
        effect: {
          type: 'transition',
          nodeId: 'explore_result',
          patch: { exploreKind: 'PROGRAM' },
        },
      },
      {
        id: 'exp-activities',
        label: 'Activities',
        variant: 'secondary',
        effect: {
          type: 'transition',
          nodeId: 'explore_result',
          patch: { exploreKind: 'ACTIVITY' },
        },
      },
    ],
  }
}

function resolveExploreResult(
  state: DiscoveryState,
  signals: HomeSignals,
): AssistantTurn {
  const excluded = new Set(state.excludedIds)
  const kind = state.exploreKind ?? 'CREATOR'

  if (kind === 'CREATOR') {
    const creator = signals.creators.find(
      (i) => i.creator && !excluded.has(i.creator.id),
    )?.creator
    if (creator) {
      const voice = phraseCreatorTurn(creator, state.excludedIds.length)
      return {
        nodeId: 'explore_result',
        question: voice.question,
        contextLine: voice.contextLine,
        showMeSubject: {
          kind: 'creator',
          handle: creator.handle,
          displayName: creator.displayName,
        },
        card: mapCreatorToCard(creator),
        choices: [
          {
            id: 'follow-creator',
            label: 'Follow',
            variant: 'primary',
            effect: {
              type: 'execute',
              action: {
                type: 'follow_creator',
                userId: creator.id,
                handle: creator.handle,
              },
            },
          },
          {
            id: 'view-creator',
            label: 'Preview profile',
            variant: 'secondary',
            effect: {
              type: 'execute',
              action: {
                type: 'preview',
                target: { kind: 'creator', handle: creator.handle },
              },
            },
          },
          {
            id: 'different',
            label: 'Next creator',
            variant: 'secondary',
            effect: { type: 'refine', kind: 'different' },
          },
        ],
      }
    }
  }

  if (kind === 'ACTIVITY') {
    const activity = pickActivity(state, signals)
    if (activity) {
      const categoryName = categoryNameFor(signals, activity.categoryId)
      const voice = phraseActivityTurn(activity, categoryName, state)
      return {
        nodeId: 'explore_result',
        question: voice.question,
        contextLine: voice.contextLine,
        whyReason: voice.whyReason,
        card: mapActivityToCard(activity, categoryName),
        choices: [
          {
            id: 'open-act',
            label: 'Start now',
            variant: 'primary',
            effect: {
              type: 'execute',
              action: { type: 'open_activity', activityId: activity.id },
            },
          },
          {
            id: 'different',
            label: 'Next Activity',
            variant: 'secondary',
            effect: { type: 'refine', kind: 'different' },
          },
        ],
      }
    }
  }

  const program = pickProgram(state, signals)
  if (program) {
    const voice = phraseProgramTurn(program.program, program.count, state)
    return {
      nodeId: 'explore_result',
      question: voice.question,
      contextLine: voice.contextLine,
      whyReason: voice.whyReason,
      card: mapProgramToCard(
        program.program,
        program.count,
        program.featuredGroup,
      ),
      choices: [
        {
          id: 'open-prog',
          label: 'Preview Program',
          variant: 'primary',
          effect: {
            type: 'execute',
            action: {
              type: 'preview',
              target: { kind: 'program', id: program.program.id },
            },
          },
        },
        {
          id: 'different',
          label: 'Next Program',
          variant: 'secondary',
          effect: { type: 'refine', kind: 'different' },
        },
      ],
    }
  }

  return {
    nodeId: 'explore_result',
    question: 'Want to browse everything?',
    contextLine: 'You have seen our top picks for this domain.',
    choices: [
      {
        id: 'browse',
        label: 'Open Community',
        variant: 'primary',
        effect: { type: 'execute', action: { type: 'open_browse' } },
      },
      {
        id: 'reset',
        label: 'Start over',
        variant: 'secondary',
        effect: { type: 'reset' },
      },
    ],
  }
}

function resolveDaySchedule(signals: HomeSignals): AssistantTurn {
  const activeToday = signals.todayItems
    .filter((i) => i.status !== 'CANCELLED')
    .slice()
    .sort((a, b) => {
      if (a.localTime && b.localTime) return a.localTime.localeCompare(b.localTime)
      if (a.localTime) return -1
      if (b.localTime) return 1
      return a.title.localeCompare(b.title)
    })

  if (activeToday.length === 0) {
    return {
      nodeId: 'day_schedule',
      question: 'Your day is open.',
      contextLine: 'Nothing is scheduled for today yet.',
      choices: [
        {
          id: 'do-now',
          label: 'Do something now',
          variant: 'primary',
          effect: { type: 'transition', nodeId: 'now_time' },
        },
        {
          id: 'start-prog',
          label: 'Start a Program',
          variant: 'secondary',
          effect: { type: 'transition', nodeId: 'program_goal' },
        },
        {
          id: 'open-cal',
          label: 'Open Calendar',
          variant: 'secondary',
          effect: { type: 'execute', action: { type: 'open_calendar' } },
        },
      ],
    }
  }

  const nextPending = activeToday.find((i) => i.status === 'PLANNED')
  const doneCount = activeToday.filter((i) => i.status === 'DONE').length
  const remainingCount = activeToday.filter((i) => i.status === 'PLANNED').length
  const cards = activeToday.map(mapCalendarItemToCard)

  const contextLine =
    doneCount > 0 && remainingCount > 0
      ? `${doneCount} of ${activeToday.length} done · ${remainingCount} left today.`
      : doneCount === activeToday.length
        ? `All ${activeToday.length} ${activeToday.length === 1 ? 'Activity' : 'Activities'} done today.`
        : `${activeToday.length} ${activeToday.length === 1 ? 'Activity' : 'Activities'} on your day.`

  return {
    nodeId: 'day_schedule',
    question: "Here is today's schedule.",
    contextLine,
    cards,
    choices: [
      ...(nextPending
        ? [
            {
              id: 'start-next',
              label: 'Do next',
              variant: 'primary' as const,
              effect: {
                type: 'execute' as const,
                action: { type: 'open_occurrence' as const, itemId: nextPending.id },
              },
            },
          ]
        : []),
      {
        id: 'something-else',
        label: 'Something else',
        variant: 'secondary',
        effect: { type: 'transition', nodeId: 'intent_menu' },
      },
      {
        id: 'open-cal',
        label: 'Open Calendar',
        variant: 'secondary',
        effect: { type: 'execute', action: { type: 'open_calendar' } },
      },
    ],
  }
}

function resolvePostCompletion(
  state: DiscoveryState,
  signals: HomeSignals,
): AssistantTurn {
  const title = state.lastCompletedTitle ?? 'Activity'
  const remainingToday = signals.todayItems.filter(
    (item) => item.status === 'PLANNED',
  )
  const nextUp = remainingToday[0]

  if (nextUp) {
    return {
      nodeId: 'post_completion',
      question: `${title} completed.`,
      contextLine:
        remainingToday.length === 1
          ? 'You have one more Activity scheduled today.'
          : `You have ${remainingToday.length} more Activities scheduled today.`,
      card: mapCalendarItemToCard(nextUp),
      choices: [
        {
          id: 'do-next',
          label: 'Do next',
          variant: 'primary',
          effect: {
            type: 'execute',
            action: { type: 'open_occurrence', itemId: nextUp.id },
          },
        },
        {
          id: 'show-day',
          label: 'Show my day',
          variant: 'secondary',
          effect: { type: 'transition', nodeId: 'day_schedule' },
        },
        {
          id: 'done-now',
          label: "I'm done",
          variant: 'secondary',
          effect: { type: 'transition', nodeId: 'done_for_now' },
        },
      ],
    }
  }

  return {
    nodeId: 'post_completion',
    question: `${title} completed.`,
    contextLine: 'Nice work. Want to keep going or wrap up?',
    choices: [
      {
        id: 'find-else',
        label: 'Find something else',
        variant: 'primary',
        effect: { type: 'transition', nodeId: 'intent_menu' },
      },
      {
        id: 'show-day',
        label: 'Show my day',
        variant: 'secondary',
        effect: { type: 'transition', nodeId: 'day_schedule' },
      },
      {
        id: 'done-now',
        label: "I'm done",
        variant: 'secondary',
        effect: { type: 'transition', nodeId: 'done_for_now' },
      },
    ],
  }
}

function resolveDoneForNow(): AssistantTurn {
  return {
    nodeId: 'done_for_now',
    question: "You're all set for now.",
    contextLine: 'Come back whenever you are ready for the next session.',
    choices: [
      {
        id: 'start-over',
        label: 'Start over',
        variant: 'primary',
        effect: { type: 'reset' },
      },
      {
        id: 'show-day',
        label: 'Show my day',
        variant: 'secondary',
        effect: { type: 'transition', nodeId: 'day_schedule' },
      },
    ],
  }
}

/**
 * Deterministic state machine resolving the current conversational turn
 * from (nodeId, state, signals).
 */
export function resolveTurn(
  nodeId: FlowNodeId,
  state: DiscoveryState,
  signals: HomeSignals,
): AssistantTurn {
  switch (nodeId) {
    case 'opening':
      return rankHomeSignals(signals, state.excludedIds)
    case 'day_schedule':
      return resolveDaySchedule(signals)
    case 'post_completion':
      return resolvePostCompletion(state, signals)
    case 'done_for_now':
      return resolveDoneForNow()
    case 'intent_menu':
      return resolveIntentMenu(signals)
    case 'now_time':
      return resolveNowTime()
    case 'now_interest':
      return resolveNowInterest(state, signals)
    case 'now_result':
      return resolveNowResult(state, signals)
    case 'program_goal':
      return resolveProgramGoal(signals)
    case 'program_experience':
      return resolveProgramExperience()
    case 'program_commitment':
      return resolveProgramCommitment()
    case 'program_result':
      return resolveProgramResult(state, signals)
    case 'together_result':
      return resolveTogetherResult(state, signals)
    case 'continue_result':
      return resolveContinueResult(state, signals)
    case 'explore_interest':
      return resolveExploreInterest()
    case 'explore_result':
      return resolveExploreResult(state, signals)
  }
}
