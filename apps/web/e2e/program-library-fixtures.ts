export function libraryRows() {
  const program = {
    id: '00000000-0000-4000-8000-000000000010',
    title: 'Strength, with intention',
    type: {
      id: '00000000-0000-4000-8000-000000000002',
      categoryId: '00000000-0000-4000-8000-000000000003',
      label: 'Workout',
    },
    creator: null,
    coverUrl: null,
    durationDays: 28,
    frequencyLabel: '3 days/week',
    visibility: 'PRIVATE',
  }
  const run = {
    id: 'run',
    status: 'ACTIVE',
    versionId: 'version-one',
    versionNumber: 1,
    pendingVersionId: 'version-two',
    startDate: '2026-11-01',
    createdAt: '2026-11-01T10:00:00Z',
    durationDays: 28,
    week: 2,
    planned: 24,
    completed: 6,
    due: 8,
    dueCompleted: 6,
    activeSeconds: 4800,
    lastParticipation: '2026-11-08T10:00:00Z',
    upcoming: [
      {
        id: 'next',
        title: 'Full body strength',
        date: '2026-11-09',
        time: '07:30',
        status: 'PLANNED',
      },
    ],
    history: [],
    customizedCount: 2,
    nextByActivity: [],
  }
  const rows = [
    {
      program,
      owned: true,
      publicationStatus: 'PUBLISHED',
      sourceVersionId: null,
      status: 'Active',
      current: run,
      runs: [run],
    },
    {
      program: {
        ...program,
        id: 'second',
        title: 'A quieter morning',
        type: { ...program.type, label: 'Meditation' },
      },
      owned: false,
      publicationStatus: 'PUBLISHED',
      sourceVersionId: null,
      status: 'Not Started',
      current: null,
      runs: [],
    },
    {
      program: { ...program, id: 'third', title: 'Evening mobility' },
      owned: true,
      publicationStatus: 'PUBLISHED',
      sourceVersionId: 'source',
      status: 'Paused',
      current: {
        ...run,
        status: 'PAUSED',
        completed: 0,
        activeSeconds: null,
        upcoming: [],
      },
      runs: [],
    },
  ]
  return rows
}
