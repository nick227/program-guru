import type { ActivityContent, ProgramContent } from '@project/shared'

export const RELATIONSHIPS_ACTIVITIES: ActivityContent[] = [
  {
    slug: 'send-a-check-in-message',
    title: 'Send a Check-in Message',
    summary: 'Send a thoughtful, no-pressure note to let a friend or family member know you care.',
    categorySlug: 'relationships',
    focusSlugs: ['friends', 'communication'],
    durationMinutes: 5,
    targetTime: '17:30',
    frequency: { kind: 'N_PER_WEEK', n: 2 },
    instructions: [
      { title: 'Choose one person', body: 'Pick a friend or relative you have been meaning to check in on this week.' },
      { title: 'Make it personal', body: 'Reference a shared memory or ask about something specific happening in their week.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },
  {
    slug: 'call-a-friend',
    title: 'Call a Friend',
    summary: 'Unhurried 15-minute voice or video catch-up with someone close.',
    categorySlug: 'relationships',
    focusSlugs: ['friends', 'communication'],
    durationMinutes: 15,
    targetTime: '17:30',
    frequency: { kind: 'N_PER_WEEK', n: 1 },
    instructions: [
      { title: 'Reach out warmly', body: 'Call a friend or send a quick message asking if they have 15 minutes to catch up.' },
      { title: 'Listen without multitasking', body: 'Step away from other screens, ask open questions, and give them your full attention.' },
    ],
    metrics: [
      { key: 'duration', target: 900, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'TIMER', config: { seconds: 900 } }, { key: 'NOTES' }],
  },
  {
    slug: 'plan-quality-time',
    title: 'Plan Quality Time',
    summary: 'Put a dedicated, distraction-free outing or shared meal on the calendar.',
    categorySlug: 'relationships',
    focusSlugs: ['quality-time', 'family', 'friends'],
    durationMinutes: 10,
    targetTime: '17:30',
    frequency: { kind: 'N_PER_WEEK', n: 1 },
    instructions: [
      { title: 'Propose two concrete times', body: 'Pick a simple activity like coffee, a walk, or dinner and offer two specific days.' },
      { title: 'Lock it on the calendar', body: 'Confirm the plan right away so busyness does not crowd it out.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },
  {
    slug: 'write-a-thank-you-note',
    title: 'Write a Thank-you Note',
    summary: 'Share genuine, specific appreciation with someone who encouraged or helped you.',
    categorySlug: 'relationships',
    focusSlugs: ['communication', 'friends', 'family'],
    durationMinutes: 10,
    targetTime: '17:30',
    frequency: { kind: 'N_PER_WEEK', n: 1 },
    instructions: [
      { title: 'Name the specific gesture', body: 'Describe what they did and the real difference it made for you.' },
      { title: 'Send or deliver it today', body: 'Send the message or drop a handwritten card in the mail while the gratitude is fresh.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },
]

export const RELATIONSHIPS_PROGRAMS: ProgramContent[] = [
  {
    slug: 'starter-staying-in-touch',
    title: 'Staying in Touch',
    description: 'Simple, warm twice-weekly habits to check in on friends, have unhurried calls, and put real quality time on the calendar.',
    categorySlug: 'relationships',
    programTypeSlug: 'relationship-plan',
    focusSlug: 'friends',
    level: 'ALL_LEVELS',
    sessionMinutes: 15,
    tagSlugs: ['quick-win', 'partner-or-group', 'low-impact'],
    durationDays: 28,
    frequency: { kind: 'N_PER_WEEK', n: 2 },
    generationMode: 'ROTATE',
    visibility: 'PUBLIC',
    activitySlugs: ['send-a-check-in-message', 'call-a-friend', 'plan-quality-time', 'write-a-thank-you-note'],
    placements: [2, 6, 9, 13, 16, 20, 23, 27].map((day, idx) => ({
      relativeDay: day,
      activitySlug: ['send-a-check-in-message', 'call-a-friend', 'plan-quality-time', 'write-a-thank-you-note'][idx % 4]!,
      position: 0,
      localTime: '17:30',
    })),
  },
]

