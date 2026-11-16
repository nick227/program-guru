import type { components } from '@project/sdk'
import { dateLabel } from './dates'
import { formatTargetTime } from './targetTime'
type S = components['schemas']

/** The join confirmation; says when a Program day stayed on its own date (10 §9.11). */
export function joinedMessage(result: { otherProgramItemDate?: string | null }) {
  return result.otherProgramItemDate
    ? `Joined as its own Calendar item. Your Program still has this on ${dateLabel(result.otherProgramItemDate, { weekday: 'short', month: 'short', day: 'numeric' })}.`
    : 'Joined. It is on your Calendar.'
}

export function gatheringWhen(g: Pick<S['Gathering'], 'localDate' | 'localTime'>) {
  const day = dateLabel(g.localDate, { weekday: 'short', month: 'short', day: 'numeric' })
  return g.localTime ? `${day} · ${formatTargetTime(g.localTime)}` : day
}

