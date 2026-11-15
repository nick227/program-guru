import type { AssistantCard, HomeSignals, PresentationMode } from './types'
import { canSuggestNewProgram } from './programEligibility'
import {
  mapActivityToCard,
  mapCalendarItemToCard,
  leadProgramFor,
  mapCreatorToCard,
  mapProgramToCard,
  withReason,
  followedReason,
  mapSessionToCard,
} from './cardMappers'

function categoryNameFor(
  signals: HomeSignals,
  categoryId?: string | null,
): string | undefined {
  if (!categoryId) return undefined
  return signals.categories.find((c) => c.id === categoryId)?.name
}

/**
 * Builds 3-5 relevant entities for the Presentation surface beneath the conversation,
 * rotating between For You, Happening Now, Popular, and Following.
 */
export function buildPresentationItems(
  mode: PresentationMode,
  signals: HomeSignals,
  excludeCardId?: string,
): AssistantCard[] {
  const seen = new Set<string>(excludeCardId ? [excludeCardId] : [])
  const out: AssistantCard[] = []

  const push = (card: AssistantCard | null | undefined) => {
    if (!card || seen.has(card.id) || out.length >= 4) return
    seen.add(card.id)
    out.push(card)
  }

  if (mode === 'happening_now') {
    for (const item of signals.liveSessions) {
      if (item.featuredGroup || (item.program && canSuggestNewProgram(item.program, signals))) {
        push(mapSessionToCard(item))
      }
    }
    if (out.length < 3) {
      for (const item of signals.popularPrograms) {
        if (item.featuredGroup && item.program && canSuggestNewProgram(item.program, signals)) {
          push(
            mapProgramToCard(
              item.program,
              item.participantCount,
              item.featuredGroup,
            ),
          )
        }
      }
    }
    return out
  }

  if (mode === 'popular') {
    for (const item of signals.popularPrograms) {
      if (item.program && canSuggestNewProgram(item.program, signals)) {
        push(
          mapProgramToCard(
            item.program,
            item.participantCount,
            item.featuredGroup,
          ),
        )
      }
    }
    for (const item of signals.activities) {
      if (item.activity) {
        push(
          mapActivityToCard(
            item.activity,
            categoryNameFor(signals, item.activity.categoryId),
          ),
        )
      }
    }
    return out
  }

  // Following means actual follows (12 §5c): their newest Programs, then the creators themselves.
  if (mode === 'following') {
    for (const item of signals.followedPrograms ?? []) {
      if (item.program && canSuggestNewProgram(item.program, signals)) {
        push(withReason(mapProgramToCard(item.program, item.participantCount, item.featuredGroup), followedReason(item)))
      }
    }
    for (const item of signals.followedCreators ?? []) {
      if (item.creator) {
        push(mapCreatorToCard(item.creator, leadProgramFor(item.creator.id, [signals.forYouPrograms, signals.followedPrograms, signals.popularPrograms, signals.newPrograms])))
      }
    }
    return out
  }

  // 'for_you': prioritize personal schedule -> live -> popular -> activities
  if (signals.isSignedIn) {
    for (const cal of signals.todayItems) {
      if (cal.status === 'PLANNED') {
        push(mapCalendarItemToCard(cal))
      }
    }
  }
  for (const item of signals.liveSessions) {
    if (item.featuredGroup || (item.program && canSuggestNewProgram(item.program, signals))) {
      push(mapSessionToCard(item))
    }
  }
  // Personalized Programs with their reason, ahead of plain popularity (12 §5c).
  for (const item of signals.forYouPrograms ?? []) {
    if (item.program && canSuggestNewProgram(item.program, signals)) {
      push(withReason(mapProgramToCard(item.program, item.participantCount, item.featuredGroup), item.reason))
    }
  }
  for (const item of signals.popularPrograms) {
    if (item.program && canSuggestNewProgram(item.program, signals)) {
      push(
        mapProgramToCard(
          item.program,
          item.participantCount,
          item.featuredGroup,
        ),
      )
    }
  }
  for (const item of signals.activities) {
    if (item.activity) {
      push(
        mapActivityToCard(
          item.activity,
          categoryNameFor(signals, item.activity.categoryId),
        ),
      )
    }
  }
  return out
}

