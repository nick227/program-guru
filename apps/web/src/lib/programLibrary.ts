import type { components } from '@project/sdk'
export type PersonalProgram = components['schemas']['PersonalProgram']
export const statuses = [
  'All',
  'Active',
  'Not Started',
  'Paused',
  'Completed',
  'Archived',
] as const
export function selectPrograms(
  rows: PersonalProgram[],
  query: string,
  status: string,
  owned: boolean,
  sort: string,
) {
  return rows
    .filter(
      (r) =>
        (status === 'All' || r.status === status) &&
        (!owned || (r.owned && !r.sourceVersionId)) &&
        `${r.program.title} ${r.program.type.label} ${r.program.creator?.displayName ?? ''}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => {
      if (sort === 'name') return a.program.title.localeCompare(b.program.title)
      if (sort === 'progress')
        return (
          (b.current?.planned ? b.current.completed / b.current.planned : -1) -
            (a.current?.planned
              ? a.current.completed / a.current.planned
              : -1) || a.program.title.localeCompare(b.program.title)
        )
      return (
        (b.current?.lastParticipation ?? '').localeCompare(
          a.current?.lastParticipation ?? '',
        ) ||
        (b.current?.createdAt ?? '').localeCompare(
          a.current?.createdAt ?? '',
        ) ||
        a.program.title.localeCompare(b.program.title)
      )
    })
}
