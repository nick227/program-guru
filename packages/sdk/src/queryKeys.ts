/** All viewer-dependent caches are cleared on login/logout; no persisted private cache. */
export const queryKeys = {
  me: ['me'] as const,
  programs: ['programs'] as const,
  mine: ['programs', 'mine'] as const,
  preview: (id: string) => ['programs', id, 'preview'] as const,
  workspace: (id: string) => ['programs', id, 'workspace'] as const,
  placements: (id: string) => ['programs', id, 'placements'] as const,
  publishCheck: (id: string) => ['programs', id, 'publish-check'] as const,
  discover: ['discover'] as const,
  discovery: (q: string) =>
    ['discover', 'list', { kind: 'PROGRAM', q }] as const,
  activities: (q: string, focusId = '') =>
    ['activities', 'list', { q, focusId }] as const,
  types: ['catalog', 'program-types'] as const,
  focuses: (id: string) => ['catalog', 'focuses', id] as const,
  calendar: ['calendar'] as const,
  week: (start: string, end: string) =>
    ['calendar', 'list', { start, end }] as const,
  occurrences: ['occurrences'] as const,
  occurrence: (id: string) => ['occurrences', id] as const,
}
