import type { PersonalProgram } from './programLibrary'
import { buildOccurrenceUrl, buildWorkspaceUrl } from './urls'

export function libraryProgramUrl(id: string, search = '') {
  const params = new URLSearchParams(search)
  for (const key of [...params.keys()])
    if (key.startsWith('b')) params.delete(key)
  params.set('program', id)
  return `/library?${params}`
}

/** A scheduled future run is already started; never offer a second enrollment. */
export function programPrimaryAction(
  entry: PersonalProgram,
  search = '',
): { label: 'Start' | 'Continue' | 'Resume' | 'View'; href?: string } {
  const detail = libraryProgramUrl(entry.program.id, search)
  if (entry.status === 'Archived' || entry.status === 'Completed')
    return { label: 'View', href: detail }
  if (entry.status === 'Paused' && entry.current?.status === 'PAUSED')
    return { label: 'Resume' }
  if (entry.status === 'Active')
    return {
      label: 'Continue',
      href: entry.current?.upcoming[0]
        ? buildOccurrenceUrl(entry.current.upcoming[0].id, { returnTo: detail })
        : detail,
    }
  if (
    entry.current?.status === 'ACTIVE' ||
    entry.current?.status === 'PENDING_ACCESS'
  )
    return { label: 'View', href: detail }
  return {
    label: 'Start',
    href: entry.owned && entry.publicationStatus !== 'PUBLISHED'
      ? buildWorkspaceUrl(entry.program.id, { step: 'publish' })
      : `/programs/${entry.program.id}?start=1&returnTo=${encodeURIComponent(detail)}`,
  }
}
