import type { ActivityContent, ProgramContent } from '@project/shared'

export const WELLNESS_ACTIVITIES: ActivityContent[] = [
  {
    slug: 'morning-routine',
    title: 'Morning Routine',
    summary: 'Grounded 5-minute start to the day with hydration, daylight, and one clear priority.',
    categorySlug: 'wellness',
    focusSlugs: ['mindfulness', 'daily-reflection'],
    durationMinutes: 5,
    targetTime: '08:00',
    frequency: { kind: 'DAILY' },
    instructions: [
      { title: 'Hydrate and get natural light', body: 'Drink a full glass of water and spend two minutes near a window or outdoors before checking messages.' },
      { title: 'Name today’s single priority', body: 'Write down the one meaningful task or intention that would make today feel complete.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'CHECKLIST' }, { key: 'NOTES' }],
  },
  {
    slug: 'guided-meditation',
    title: 'Guided Meditation',
    summary: 'Ten-minute seated awareness practice anchoring attention on breath and posture.',
    categorySlug: 'wellness',
    focusSlugs: ['mindfulness', 'relaxation'],
    durationMinutes: 10,
    targetTime: '12:30',
    frequency: { kind: 'DAILY' },
    instructions: [
      { title: 'Settle your posture', body: 'Sit upright with feet grounded, shoulders relaxed, and hands resting comfortably on your lap.' },
      { title: 'Anchor on the breath', body: 'Follow the natural sensation of each inhale and exhale; when your mind wanders, note it calmly and return.' },
      { title: 'Close smoothly', body: 'Before standing, take one deeper breath and notice how your energy feels.' },
    ],
    metrics: [
      { key: 'duration', target: 600, required: true },
      { key: 'rating' },
    ],
    tools: [{ key: 'TIMER', config: { seconds: 600 } }],
  },
  {
    slug: 'breathing-exercise',
    title: 'Breathing Exercise',
    summary: 'Five-minute paced breathing reset (4s inhale, 4s hold, 6s exhale) to lower stress.',
    categorySlug: 'wellness',
    focusSlugs: ['relaxation', 'mindfulness'],
    durationMinutes: 5,
    frequency: { kind: 'DAILY' },
    instructions: [
      { title: 'Inhale and soften', body: 'Inhale quietly through your nose for 4 seconds without lifting your shoulders, then pause gently for 4 seconds.' },
      { title: 'Lengthen the exhale', body: 'Exhale smoothly for 6 seconds and pause briefly before starting the next cycle.' },
    ],
    metrics: [{ key: 'duration', target: 300, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 300 } }],
  },
  {
    slug: 'gratitude-journal',
    title: 'Gratitude Journal',
    summary: 'Short evening reflection recording three specific people or moments you appreciated.',
    categorySlug: 'wellness',
    focusSlugs: ['daily-reflection', 'mindfulness'],
    durationMinutes: 5,
    targetTime: '20:30',
    frequency: { kind: 'DAILY' },
    instructions: [
      { title: 'Write three specific details', body: 'Name three concrete moments, conversations, or small comforts from today rather than broad generalizations.' },
      { title: 'Note why one mattered', body: 'Add one sentence about why one of those moments stood out to you.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },
  {
    slug: 'evening-wind-down',
    title: 'Evening Wind-down',
    summary: 'Fifteen-minute screen-free transition to clear tomorrow’s loops and prepare for rest.',
    categorySlug: 'wellness',
    focusSlugs: ['rest', 'relaxation'],
    durationMinutes: 15,
    targetTime: '21:15',
    frequency: { kind: 'DAILY' },
    instructions: [
      { title: 'Park tomorrow’s open loops', body: 'Jot down any lingering tasks for tomorrow so you do not carry them into bed.' },
      { title: 'Step away from bright screens', body: 'Dim room lighting and spend 10 calm minutes reading, stretching lightly, or preparing tea.' },
    ],
    metrics: [{ key: 'duration', target: 900, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 900 } }, { key: 'NOTES' }],
  },
]

export const WELLNESS_PROGRAMS: ProgramContent[] = [
  {
    slug: 'starter-daily-mindfulness-reflection',
    title: 'Daily Mindfulness & Reflection',
    description: 'Two calm weeks pairing a grounded morning intention, midday meditation, and evening gratitude reflection.',
    categorySlug: 'wellness',
    programTypeSlug: 'wellness-routine',
    focusSlug: 'mindfulness',
    level: 'ALL_LEVELS',
    sessionMinutes: 20,
    tagSlugs: ['no-equipment', 'at-home', 'daily-habit', 'low-impact'],
    durationDays: 14,
    frequency: { kind: 'DAILY' },
    generationMode: 'ALL_EACH_DAY',
    visibility: 'PUBLIC',
    activitySlugs: ['morning-routine', 'guided-meditation', 'gratitude-journal'],
    placements: Array.from({ length: 14 }, (_, i) => i + 1).flatMap((day) => [
      { relativeDay: day, activitySlug: 'morning-routine', position: 0, localTime: '08:00' },
      { relativeDay: day, activitySlug: 'guided-meditation', position: 1, localTime: '12:30' },
      { relativeDay: day, activitySlug: 'gratitude-journal', position: 2, localTime: '20:30' },
    ]),
  },
]

