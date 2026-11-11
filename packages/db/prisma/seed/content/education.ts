import type { ActivityContent, ProgramContent } from '@project/shared'

export const EDUCATION_ACTIVITIES: ActivityContent[] = [
  {
    slug: 'vocabulary-review',
    title: 'Vocabulary Review',
    summary: 'Focused 10-minute active-recall drill on target words and natural phrases.',
    categorySlug: 'education',
    focusSlugs: ['languages', 'exam-prep'],
    durationMinutes: 10,
    targetTime: '18:00',
    frequency: { kind: 'N_PER_WEEK', n: 5 },
    instructions: [
      { title: 'Recall before checking', body: 'Say or write the meaning of each word from memory before revealing the answer.' },
      { title: 'Put new words into context', body: 'Speak or write one original sentence for every word that felt rusty.' },
    ],
    metrics: [
      { key: 'duration', target: 600, required: true },
      { key: 'lesson_count', target: 1 },
    ],
    tools: [{ key: 'TIMER', config: { seconds: 600 } }, { key: 'NOTES' }],
  },
  {
    slug: 'read-for-20-minutes',
    title: 'Read for 20 Minutes',
    summary: 'Distraction-free timed reading block in your target language or study subject.',
    categorySlug: 'education',
    focusSlugs: ['languages', 'professional-skills', 'exam-prep'],
    durationMinutes: 20,
    targetTime: '18:15',
    frequency: { kind: 'N_PER_WEEK', n: 5 },
    instructions: [
      { title: 'Remove distractions', body: 'Start your 20-minute timer and read steadily without stopping to look up every unfamiliar word.' },
      { title: 'Capture key takeaways', body: 'Log the pages read and jot down two phrases or ideas worth revisiting.' },
    ],
    metrics: [
      { key: 'duration', target: 1200, required: true },
      { key: 'pages', target: 12 },
    ],
    tools: [{ key: 'TIMER', config: { seconds: 1200 } }, { key: 'NOTES' }],
  },
  {
    slug: 'practice-speaking',
    title: 'Practice Speaking',
    summary: 'Ten-minute aloud speaking drill for pronunciation, flow, and spoken confidence.',
    categorySlug: 'education',
    focusSlugs: ['languages', 'professional-skills'],
    durationMinutes: 10,
    targetTime: '18:40',
    frequency: { kind: 'N_PER_WEEK', n: 5 },
    instructions: [
      { title: 'Speak on one prompt', body: 'Describe your day or summarize what you read out loud for 3–5 minutes without pausing to edit.' },
      { title: 'Smooth out rough spots', body: 'Replay or repeat one tricky phrase three times cleanly at a comfortable pace.' },
    ],
    metrics: [{ key: 'duration', target: 600, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 600 } }, { key: 'MEDIA_CAPTURE' }],
  },
  {
    slug: 'listening-practice',
    title: 'Listening Practice',
    summary: 'Active comprehension session with native audio, lectures, or podcasts.',
    categorySlug: 'education',
    focusSlugs: ['languages', 'music', 'exam-prep'],
    durationMinutes: 15,
    frequency: { kind: 'N_PER_WEEK', n: 3 },
    instructions: [
      { title: 'First pass for the gist', body: 'Listen to a 3–5 minute clip without subtitles or transcript to catch the main thread.' },
      { title: 'Second pass for detail', body: 'Replay with transcript or slower speed and note three natural expressions.' },
    ],
    metrics: [{ key: 'duration', target: 900, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 900 } }, { key: 'NOTES' }],
  },
  {
    slug: 'write-a-summary',
    title: 'Write a Summary',
    summary: 'Synthesize today’s study material in five crisp sentences from memory.',
    categorySlug: 'education',
    focusSlugs: ['exam-prep', 'professional-skills'],
    durationMinutes: 10,
    frequency: { kind: 'N_PER_WEEK', n: 3 },
    // 08 §9 outlier: intentional text-only activity without visual media attachment
    textOnly: true,
    instructions: [
      { title: 'Close your reference', body: 'Write a 5-sentence summary in your own words without looking back at your book or notes.' },
      { title: 'Verify and fill gaps', body: 'Check your source and add any crucial link or definition you missed.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },
]

export const EDUCATION_PROGRAMS: ProgramContent[] = [
  {
    slug: 'starter-daily-language-study',
    title: 'Daily Language & Study Habit',
    description: 'A focused 3-week study loop pairing active vocabulary recall, 20-minute reading immersion, and speaking aloud five days a week.',
    categorySlug: 'education',
    programTypeSlug: 'study-program',
    focusSlug: 'languages',
    level: 'ALL_LEVELS',
    sessionMinutes: 40,
    tagSlugs: ['at-home', 'audio-optional', 'pen-and-paper'],
    durationDays: 21,
    frequency: { kind: 'N_PER_WEEK', n: 5 },
    generationMode: 'ALL_EACH_DAY',
    visibility: 'PUBLIC',
    activitySlugs: ['vocabulary-review', 'read-for-20-minutes', 'practice-speaking'],
    placements: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 15, 16, 17, 18, 19].flatMap((day) => [
      { relativeDay: day, activitySlug: 'vocabulary-review', position: 0, localTime: '18:00' },
      { relativeDay: day, activitySlug: 'read-for-20-minutes', position: 1, localTime: '18:15' },
      { relativeDay: day, activitySlug: 'practice-speaking', position: 2, localTime: '18:40' },
    ]),
  },
]

