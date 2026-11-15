import { useProgramLibrary } from '@project/sdk'
import { calendarUrl } from './dates'

/**
 * The Calendar day of a Program's next scheduled Activity in the current run, for "View Calendar"
 * right after starting it. The day view selects that day's first item. Null until the library has it.
 */
export function useFirstScheduledDayUrl(programId: string, enabled = true): string | null {
  const library = useProgramLibrary(enabled)
  const run = library.data?.find((entry) => entry.program.id === programId)?.current
  const day = run?.upcoming[0]?.date ?? run?.startDate ?? null
  return day ? calendarUrl(day) : null
}
