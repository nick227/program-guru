import type { DiscoveryState, HomeSignals } from './types'

type ProgramEntry = NonNullable<HomeSignals['popularPrograms'][number]['program']>
type ActivityEntry = NonNullable<HomeSignals['activities'][number]['activity']>
type CreatorEntry = NonNullable<HomeSignals['creators'][number]['creator']>

function pickVariant<T>(seed: number, options: readonly T[]): T {
  const index = Math.abs(seed) % options.length
  return options[index]!
}

function formatLevel(level?: string | null): string | null {
  if (!level) return null
  const normalized = level.replace('_', ' ').toLowerCase()
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function phraseProgramTurn(
  program: ProgramEntry,
  participantCount: number | null | undefined,
  state: Pick<DiscoveryState, 'excludedIds' | 'maxMinutes' | 'level' | 'categoryName' | 'preferPopular'>,
): { question: string; contextLine: string; whyReason: string } {
  const step = state.excludedIds.length
  const title = program.title

  let question: string
  if (step === 0) {
    if (state.preferPopular && participantCount && participantCount >= 5) {
      question = `${participantCount} people are doing ${title}.`
    } else if (program.sessionMinutes && program.sessionMinutes <= 10) {
      question = `Start light with ${title}?`
    } else {
      question = `Start with ${title}?`
    }
  } else {
    question = pickVariant(step, [
      `How about ${title} instead?`,
      `Try ${title}?`,
      `Another option: ${title}.`,
    ])
  }

  const parts: string[] = []
  if (state.maxMinutes && state.maxMinutes < 999 && program.sessionMinutes) {
    parts.push(`${program.sessionMinutes} min/session fits your ${state.maxMinutes}-min window`)
  } else if (program.sessionMinutes) {
    parts.push(`${program.sessionMinutes} min per session`)
  }
  if (program.frequencyLabel) {
    parts.push(program.frequencyLabel)
  } else if (program.durationDays) {
    parts.push(`${program.durationDays}-day ${program.type.label}`)
  } else {
    parts.push(program.type.label)
  }
  if (participantCount && participantCount > 0) {
    parts.push(`${participantCount} active`)
  }

  const whyParts = [
    program.sessionMinutes ? `${program.sessionMinutes} min per session` : null,
    formatLevel(program.level),
    program.durationDays ? `${program.durationDays}-day ${program.type.label}` : program.type.label,
    participantCount && participantCount > 0 ? `${participantCount} active` : null,
  ].filter(Boolean)

  return {
    question,
    contextLine:
      parts.length > 0
        ? `${parts.join(' · ')}.`
        : state.categoryName
          ? `Filtered for ${state.categoryName}.`
          : 'Structured Program ready to start.',
    whyReason:
      whyParts.length > 0
        ? `Selected because ${whyParts.join(', ')}.`
        : 'Selected from active Programs.',
  }
}

export function phraseActivityTurn(
  activity: ActivityEntry,
  categoryName: string | undefined,
  state: Pick<DiscoveryState, 'excludedIds' | 'maxMinutes' | 'categoryName'>,
): { question: string; contextLine: string; whyReason: string } {
  const step = state.excludedIds.length
  const title = activity.title
  const mins = activity.durationMinutes

  let question: string
  if (step === 0) {
    if (mins && mins <= 5) {
      question = `Got ${mins} minutes for ${title}?`
    } else if (mins && mins <= 15) {
      question = `Try ${title}?`
    } else {
      question = `Ready for ${title}?`
    }
  } else {
    question = pickVariant(step, [
      `How about ${title}?`,
      `Try ${title} instead?`,
      `What about ${title}?`,
    ])
  }

  const focus = state.categoryName ?? categoryName
  const details: string[] = []
  if (mins) {
    details.push(`${mins} min`)
  }
  if (focus) {
    details.push(focus)
  }
  if (activity.instructionCount && activity.instructionCount > 0) {
    details.push(
      `${activity.instructionCount} guided ${activity.instructionCount === 1 ? 'step' : 'steps'}`,
    )
  }

  let contextLine: string
  if (state.maxMinutes && state.maxMinutes < 999) {
    const tail = details.length > 0 ? ` — ${details.join(' · ')}.` : '.'
    contextLine = `Fits your ${state.maxMinutes} minutes window${tail}`
  } else if (details.length > 0) {
    contextLine = `${details.join(' · ')}.`
  } else {
    contextLine = 'Ready whenever you are.'
  }

  return {
    question,
    contextLine,
    whyReason:
      details.length > 0
        ? details.join(' · ')
        : 'Ready to start right now with no setup.',
  }
}

export function phraseCreatorTurn(
  creator: CreatorEntry,
  excludedCount: number,
): { question: string; contextLine: string } {
  const question =
    excludedCount === 0
      ? `Follow ${creator.displayName}?`
      : pickVariant(excludedCount, [
          `Have you seen ${creator.displayName}'s work?`,
          `Check out ${creator.displayName}?`,
          `Meet ${creator.displayName}.`,
        ])

  return {
    question,
    contextLine: `@${creator.handle} · Follow to see their Programs and Activities.`,
  }
}

export function phraseLiveSessionTurn(
  title: string,
  participantCount: number | null | undefined,
  memberAvatarCount: number,
  excludedCount: number,
): { question: string; contextLine: string } {
  const count = participantCount ?? memberAvatarCount
  const question =
    excludedCount > 0
      ? `Join ${title} instead?`
      : count > 1
        ? `${count} people in ${title}.`
        : `Join ${title}?`

  const contextLine =
    count > 0
      ? 'Public group you can join or preview.'
      : 'Open group you can jump into.'

  return { question, contextLine }
}

