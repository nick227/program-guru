import type { components } from './generated/types'
type S = components['schemas']
/** Activity recordings belong to an existing result entry; demonstrations to a draft revision. */
export type MediaContext =
  | { kind: 'Profile'; userId: string }
  | { kind: 'Program'; programId: string }
  | { kind: 'Activity'; revisionId: string }
  | { kind: 'Activity'; resultEntryId: string }
  | { kind: 'Instruction'; instructionId: string }
export type MediaVisibility = 'Private' | 'Group' | 'Community'
export function mediaTarget(
  context: MediaContext,
): S['AttachMediaInput']['target'] {
  switch (context.kind) {
    case 'Profile':
      return { kind: 'PROFILE', id: context.userId }
    case 'Program':
      return { kind: 'PROGRAM', id: context.programId }
    case 'Instruction':
      return { kind: 'INSTRUCTION', id: context.instructionId }
    case 'Activity':
      return 'resultEntryId' in context
        ? { kind: 'RESULT_ENTRY', id: context.resultEntryId }
        : { kind: 'ACTIVITY_REVISION', id: context.revisionId }
  }
}
export type MediaLibraryFilters = {
  source?: 'mine' | 'platform'
  q?: string
  type?: S['MediaType']
}
