import { compileTaxonomy, defineCategory, validateTaxonomy, type CategoryDefinition, type TagDefinition } from '@project/shared'

/**
 * Rapid Category Registry: add a Category, its Focuses, ProgramTypes, and illustration palette
 * in one declarative block. Kept independent of starter Programs so any category can grow freely.
 */
export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  defineCategory({
    slug: 'fitness',
    label: 'Fitness',
    icon: 'dumbbell',
    position: 1,
    palette: { from: '#0D5960', to: '#1C8C8C', glow: '#F2B84B', ink: '#F4FBF9', soft: '#7FD6C9' },
    defaultGlyph: 'weights',
    focuses: [
      { slug: 'strength', label: 'Strength' },
      { slug: 'cardio', label: 'Cardio' },
      { slug: 'flexibility', label: 'Flexibility' },
      { slug: 'endurance', label: 'Endurance' },
      { slug: 'general-fitness', label: 'General Fitness' },
    ],
    programTypes: [
      {
        slug: 'workout',
        label: 'Workout',
        description: 'Structured bodyweight, strength, or conditioning sessions.',
        isFeatured: true,
        position: 1,
        focuses: ['strength', 'cardio', 'flexibility', 'endurance', 'general-fitness'],
      },
      {
        slug: 'mobility-routine',
        label: 'Mobility Routine',
        description: 'Joint mobility, gentle stretching, and posture restoration.',
        isFeatured: false,
        position: 6,
        focuses: ['flexibility', 'general-fitness'],
      },
      {
        slug: 'walking-plan',
        label: 'Walking Plan',
        description: 'Progressive outdoor or indoor walking sessions.',
        isFeatured: false,
        position: 7,
        focuses: ['cardio', 'endurance', 'general-fitness'],
      },
    ],
  }),
  defineCategory({
    slug: 'wellness',
    label: 'Wellness',
    icon: 'sparkles',
    position: 2,
    palette: { from: '#3A2F7A', to: '#6B5BA8', glow: '#F5B8CF', ink: '#F7F4FE', soft: '#B7A8F0' },
    defaultGlyph: 'ripples',
    focuses: [
      { slug: 'mindfulness', label: 'Mindfulness' },
      { slug: 'relaxation', label: 'Relaxation' },
      { slug: 'rest', label: 'Rest' },
      { slug: 'daily-reflection', label: 'Daily Reflection' },
    ],
    programTypes: [
      {
        slug: 'wellness-routine',
        label: 'Wellness Routine',
        description: 'Calm daily habits for mindfulness, rest, and steady recovery.',
        isFeatured: true,
        position: 2,
        focuses: ['mindfulness', 'relaxation', 'rest', 'daily-reflection'],
      },
      {
        slug: 'meditation-routine',
        label: 'Meditation Routine',
        description: 'Focused breathing and stillness practices.',
        isFeatured: false,
        position: 8,
        focuses: ['mindfulness', 'relaxation'],
      },
      {
        slug: 'sleep-routine',
        label: 'Sleep Routine',
        description: 'Consistent evening wind-down and restful sleep preparation.',
        isFeatured: false,
        position: 9,
        focuses: ['rest', 'relaxation'],
      },
      {
        slug: 'reflection-plan',
        label: 'Reflection Plan',
        description: 'Journaling and gratitude prompts to close the day or week.',
        isFeatured: false,
        position: 10,
        focuses: ['daily-reflection', 'mindfulness'],
      },
    ],
  }),
  defineCategory({
    slug: 'finance',
    label: 'Finance',
    icon: 'piggy-bank',
    position: 3,
    palette: { from: '#1B5234', to: '#2F7D4F', glow: '#F4D35E', ink: '#F3FAF5', soft: '#9ED8B0' },
    defaultGlyph: 'coins',
    focuses: [
      { slug: 'emergency-fund', label: 'Emergency Fund' },
      { slug: 'spending-review', label: 'Spending Review' },
      { slug: 'fundamentals', label: 'Fundamentals' },
    ],
    programTypes: [
      {
        slug: 'savings-plan',
        label: 'Savings Plan',
        description: 'Practical, repeatable steps to build savings and review spending.',
        isFeatured: true,
        position: 3,
        focuses: ['emergency-fund', 'spending-review', 'fundamentals'],
      },
      {
        slug: 'budget-routine',
        label: 'Budget Routine',
        description: 'Regular check-ins on bills, categories, and spending targets.',
        isFeatured: false,
        position: 11,
        focuses: ['spending-review', 'fundamentals'],
      },
      {
        slug: 'financial-learning',
        label: 'Financial Learning',
        description: 'Bite-sized financial literacy and goal-planning habits.',
        isFeatured: false,
        position: 12,
        focuses: ['fundamentals', 'emergency-fund'],
      },
    ],
  }),
  defineCategory({
    slug: 'relationships',
    label: 'Relationships',
    icon: 'heart-handshake',
    position: 4,
    palette: { from: '#7E3029', to: '#C2625A', glow: '#FFD3A8', ink: '#FFF6F2', soft: '#F4A79B' },
    defaultGlyph: 'voices',
    focuses: [
      { slug: 'friends', label: 'Friends' },
      { slug: 'family', label: 'Family' },
      { slug: 'communication', label: 'Communication' },
      { slug: 'quality-time', label: 'Quality Time' },
    ],
    programTypes: [
      {
        slug: 'relationship-plan',
        label: 'Relationship Plan',
        description: 'Intentional check-ins and shared moments with friends and family.',
        isFeatured: true,
        position: 5,
        focuses: ['friends', 'family', 'communication', 'quality-time'],
      },
      {
        slug: 'connection-plan',
        label: 'Connection Plan',
        description: 'Simple weekly habits to reach out and stay close.',
        isFeatured: false,
        position: 13,
        focuses: ['friends', 'communication'],
      },
      {
        slug: 'shared-activity-plan',
        label: 'Shared Activity Plan',
        description: 'Meals, outings, and quality moments together.',
        isFeatured: false,
        position: 14,
        focuses: ['family', 'quality-time', 'friends'],
      },
    ],
  }),
  defineCategory({
    slug: 'education',
    label: 'Education',
    icon: 'book-open',
    position: 5,
    palette: { from: '#1A3D6E', to: '#2E5E9E', glow: '#F6C85F', ink: '#F3F7FD', soft: '#9CBDEB' },
    defaultGlyph: 'book',
    focuses: [
      { slug: 'languages', label: 'Languages' },
      { slug: 'music', label: 'Music' },
      { slug: 'exam-prep', label: 'Exam Prep' },
      { slug: 'professional-skills', label: 'Professional Skills' },
    ],
    programTypes: [
      {
        slug: 'study-program',
        label: 'Study Program',
        description: 'Consistent practice for languages, music, exams, and new skills.',
        isFeatured: true,
        position: 4,
        focuses: ['languages', 'music', 'exam-prep', 'professional-skills'],
      },
      {
        slug: 'practice-routine',
        label: 'Practice Routine',
        description: 'Deliberate practice sessions for instruments, speaking, or problem solving.',
        isFeatured: false,
        position: 15,
        focuses: ['music', 'languages', 'professional-skills'],
      },
      {
        slug: 'reading-plan',
        label: 'Reading Plan',
        description: 'Daily reading chapters, notes, and summaries.',
        isFeatured: false,
        position: 16,
        focuses: ['exam-prep', 'professional-skills', 'languages'],
      },
    ],
  }),
  defineCategory({
    slug: 'custom',
    label: 'Custom',
    icon: 'sliders',
    position: 6,
    palette: { from: '#353D48', to: '#5A6472', glow: '#7FD1C7', ink: '#F4F6F8', soft: '#AEB8C4' },
    defaultGlyph: 'spark',
    focuses: [],
    programTypes: [
      {
        slug: 'custom-program',
        label: 'Custom Program',
        description: 'Build your own schedule from any combination of activities.',
        isFeatured: false,
        position: 17,
        focuses: [],
      },
    ],
  }),
]

/** Cross-category tags for flexible organization and discovery filtering. */
export const TAG_DEFINITIONS: TagDefinition[] = [
  { slug: 'no-equipment', label: 'No Equipment', group: 'equipment' },
  { slug: 'at-home', label: 'At Home', group: 'setting' },
  { slug: 'outdoors', label: 'Outdoors', group: 'setting' },
  { slug: 'quick-win', label: 'Quick Win', group: 'style' },
  { slug: 'guided', label: 'Guided', group: 'style' },
  { slug: 'low-impact', label: 'Low Impact', group: 'intensity' },
  { slug: 'daily-habit', label: 'Daily Habit', group: 'style' },
  { slug: 'pen-and-paper', label: 'Pen & Paper', group: 'equipment' },
  { slug: 'audio-optional', label: 'Audio Optional', group: 'equipment' },
  { slug: 'partner-or-group', label: 'Partner or Group', group: 'setting' },
]

export const TAXONOMY = compileTaxonomy(CATEGORY_DEFINITIONS, TAG_DEFINITIONS)

export const CATEGORIES = TAXONOMY.categories
export const FOCUSES = TAXONOMY.focuses
export const PROGRAM_TYPES = TAXONOMY.programTypes
export const TAGS = TAXONOMY.tags

export function assertValidTaxonomy() {
  const issues = validateTaxonomy(CATEGORY_DEFINITIONS, TAG_DEFINITIONS)
  if (issues.length) {
    throw new Error(`Invalid seed taxonomy:\n${issues.map((i) => `- ${i.path}: ${i.message}`).join('\n')}`)
  }
}

