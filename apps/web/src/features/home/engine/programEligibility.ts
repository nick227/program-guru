import type { components } from '@project/sdk'
import type { HomeSignals } from './types'

type Program = components['schemas']['ProgramSummary']

/** New-Program discovery must not offer an owned or previously joined Program. */
export function canSuggestNewProgram(
  program: Program,
  signals: Pick<HomeSignals, 'isSignedIn' | 'knownProgramIds'>,
): boolean {
  if (program.viewerAccess === 'OWNER') return false
  if (!signals.isSignedIn) return true
  // Fail closed until the signed-in viewer's complete library is available.
  return Array.isArray(signals.knownProgramIds) &&
    !signals.knownProgramIds.includes(program.id)
}
