// Shared Program field rules for every place a Program is edited: the Workspace, the inline editor
// on Program detail, Add Program and Admin Content. Limits mirror UpdateProgramDraftInput.
import type { Workspace } from './types'

export const PROGRAM_TITLE_MAX = 140
export const PROGRAM_DESCRIPTION_MAX = 20000
export const PROGRAM_DESCRIPTION_PLACEHOLDER = 'Program goals, requirements, target audience...'

/** Preset Program lengths in days. `null` (Ongoing) is offered next to them. */
export const PROGRAM_DURATION_PRESETS = [7, 14, 28, 56]

/** 7 → "1 week", 28 → "4 weeks", 30 → "30 days", null → "Ongoing". */
export function formatProgramDuration(days: number | null | undefined) {
  if (days === null || days === undefined) return 'Ongoing'
  if (days % 7 !== 0) return `${days} ${days === 1 ? 'day' : 'days'}`
  return `${days / 7} ${days === 7 ? 'week' : 'weeks'}`
}

export type ProgramVisibility = Workspace['visibility']

export const PROGRAM_VISIBILITIES: ProgramVisibility[] = ['PUBLIC', 'UNLISTED', 'PRIVATE']

export function programVisibilityLabel(visibility: ProgramVisibility) {
  return visibility === 'PUBLIC' ? 'Public' : visibility === 'UNLISTED' ? 'Link only' : 'Private'
}

/** Description as the API expects it: trimmed, or null when empty. */
export function programDescriptionInput(description: string) {
  return description.trim() || null
}

/**
 * Body for publishing the draft from the Workspace or the inline editor. The access mode is kept
 * as set (Studio → Publishing owns it), so publishing an update never reopens an Approval or
 * Paid Program.
 */
export function programPublishInput(
  ws: Pick<Workspace, 'accessMode' | 'draftRevision'>,
  visibility: ProgramVisibility,
  expectedRevision = ws.draftRevision,
) {
  return { visibility, accessMode: ws.accessMode, expectedRevision }
}
