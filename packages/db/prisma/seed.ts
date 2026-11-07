// Deterministic, idempotent platform seed (02-DOMAIN.md §2, 07-PROGRAMS.md §8, 08-ACTIVITIES.md §12, 09-CALENDARS.md §9a).
// All media references are original platform-owned CC0-1.0 assets — never scraped, copyrighted, or unlicensed.
import { createHash } from 'crypto'
import { db, type PrismaClient } from '../src/client'

const SEEDED_AT = new Date('2026-01-01T00:00:00.000Z')
const PLATFORM_LICENSE = 'CC0-1.0'
const PLATFORM_ATTRIBUTION = 'Programs App Platform Studio (CC0 1.0 Public Domain Dedication)'

/** Deterministic UUID v4-shaped identifier derived from a stable namespace key. */
export function deterministicUuid(key: string): string {
  const hex = createHash('sha256').update(`programs-app-seed:${key}`).digest('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}

type CategorySeed = { slug: string; label: string; icon: string; position: number }

const CATEGORIES: CategorySeed[] = [
  { slug: 'fitness', label: 'Fitness', icon: 'dumbbell', position: 1 },
  { slug: 'wellness', label: 'Wellness', icon: 'sparkles', position: 2 },
  { slug: 'finance', label: 'Finance', icon: 'piggy-bank', position: 3 },
  { slug: 'relationships', label: 'Relationships', icon: 'heart-handshake', position: 4 },
  { slug: 'education', label: 'Education', icon: 'book-open', position: 5 },
  { slug: 'custom', label: 'Custom', icon: 'sliders', position: 6 },
]

type FocusSeed = { categorySlug: string; slug: string; label: string }

const FOCUSES: FocusSeed[] = [
  // Fitness
  { categorySlug: 'fitness', slug: 'strength', label: 'Strength' },
  { categorySlug: 'fitness', slug: 'cardio', label: 'Cardio' },
  { categorySlug: 'fitness', slug: 'flexibility', label: 'Flexibility' },
  { categorySlug: 'fitness', slug: 'endurance', label: 'Endurance' },
  { categorySlug: 'fitness', slug: 'general-fitness', label: 'General Fitness' },
  // Wellness
  { categorySlug: 'wellness', slug: 'mindfulness', label: 'Mindfulness' },
  { categorySlug: 'wellness', slug: 'relaxation', label: 'Relaxation' },
  { categorySlug: 'wellness', slug: 'rest', label: 'Rest' },
  { categorySlug: 'wellness', slug: 'daily-reflection', label: 'Daily Reflection' },
  // Finance
  { categorySlug: 'finance', slug: 'emergency-fund', label: 'Emergency Fund' },
  { categorySlug: 'finance', slug: 'spending-review', label: 'Spending Review' },
  { categorySlug: 'finance', slug: 'fundamentals', label: 'Fundamentals' },
  // Relationships
  { categorySlug: 'relationships', slug: 'friends', label: 'Friends' },
  { categorySlug: 'relationships', slug: 'family', label: 'Family' },
  { categorySlug: 'relationships', slug: 'communication', label: 'Communication' },
  { categorySlug: 'relationships', slug: 'quality-time', label: 'Quality Time' },
  // Education
  { categorySlug: 'education', slug: 'languages', label: 'Languages' },
  { categorySlug: 'education', slug: 'music', label: 'Music' },
  { categorySlug: 'education', slug: 'exam-prep', label: 'Exam Prep' },
  { categorySlug: 'education', slug: 'professional-skills', label: 'Professional Skills' },
]

type ProgramTypeSeed = {
  categorySlug: string
  slug: string
  label: string
  description: string
  isFeatured: boolean
  position: number
  focusSlugs: string[]
}

const PROGRAM_TYPES: ProgramTypeSeed[] = [
  // 5 Featured start-screen ProgramTypes (02 §2, 03 §7.1)
  {
    categorySlug: 'fitness',
    slug: 'workout',
    label: 'Workout',
    description: 'Structured bodyweight, strength, or conditioning sessions.',
    isFeatured: true,
    position: 1,
    focusSlugs: ['strength', 'cardio', 'flexibility', 'endurance', 'general-fitness'],
  },
  {
    categorySlug: 'wellness',
    slug: 'wellness-routine',
    label: 'Wellness Routine',
    description: 'Calm daily habits for mindfulness, rest, and steady recovery.',
    isFeatured: true,
    position: 2,
    focusSlugs: ['mindfulness', 'relaxation', 'rest', 'daily-reflection'],
  },
  {
    categorySlug: 'finance',
    slug: 'savings-plan',
    label: 'Savings Plan',
    description: 'Practical, repeatable steps to build savings and review spending.',
    isFeatured: true,
    position: 3,
    focusSlugs: ['emergency-fund', 'spending-review', 'fundamentals'],
  },
  {
    categorySlug: 'education',
    slug: 'study-program',
    label: 'Study Program',
    description: 'Consistent practice for languages, music, exams, and new skills.',
    isFeatured: true,
    position: 4,
    focusSlugs: ['languages', 'music', 'exam-prep', 'professional-skills'],
  },
  {
    categorySlug: 'relationships',
    slug: 'relationship-plan',
    label: 'Relationship Plan',
    description: 'Intentional check-ins and shared moments with friends and family.',
    isFeatured: true,
    position: 5,
    focusSlugs: ['friends', 'family', 'communication', 'quality-time'],
  },
  // Additional ProgramTypes under More (02 §2)
  {
    categorySlug: 'fitness',
    slug: 'mobility-routine',
    label: 'Mobility Routine',
    description: 'Joint mobility, gentle stretching, and posture restoration.',
    isFeatured: false,
    position: 6,
    focusSlugs: ['flexibility', 'general-fitness'],
  },
  {
    categorySlug: 'fitness',
    slug: 'walking-plan',
    label: 'Walking Plan',
    description: 'Progressive outdoor or indoor walking sessions.',
    isFeatured: false,
    position: 7,
    focusSlugs: ['cardio', 'endurance', 'general-fitness'],
  },
  {
    categorySlug: 'wellness',
    slug: 'meditation-routine',
    label: 'Meditation Routine',
    description: 'Focused breathing and stillness practices.',
    isFeatured: false,
    position: 8,
    focusSlugs: ['mindfulness', 'relaxation'],
  },
  {
    categorySlug: 'wellness',
    slug: 'sleep-routine',
    label: 'Sleep Routine',
    description: 'Consistent evening wind-down and restful sleep preparation.',
    isFeatured: false,
    position: 9,
    focusSlugs: ['rest', 'relaxation'],
  },
  {
    categorySlug: 'wellness',
    slug: 'reflection-plan',
    label: 'Reflection Plan',
    description: 'Journaling and gratitude prompts to close the day or week.',
    isFeatured: false,
    position: 10,
    focusSlugs: ['daily-reflection', 'mindfulness'],
  },
  {
    categorySlug: 'finance',
    slug: 'budget-routine',
    label: 'Budget Routine',
    description: 'Regular check-ins on bills, categories, and spending targets.',
    isFeatured: false,
    position: 11,
    focusSlugs: ['spending-review', 'fundamentals'],
  },
  {
    categorySlug: 'finance',
    slug: 'financial-learning',
    label: 'Financial Learning',
    description: 'Bite-sized financial literacy and goal-planning habits.',
    isFeatured: false,
    position: 12,
    focusSlugs: ['fundamentals', 'emergency-fund'],
  },
  {
    categorySlug: 'relationships',
    slug: 'connection-plan',
    label: 'Connection Plan',
    description: 'Simple weekly habits to reach out and stay close.',
    isFeatured: false,
    position: 13,
    focusSlugs: ['friends', 'communication'],
  },
  {
    categorySlug: 'relationships',
    slug: 'shared-activity-plan',
    label: 'Shared Activity Plan',
    description: 'Meals, outings, and quality moments together.',
    isFeatured: false,
    position: 14,
    focusSlugs: ['family', 'quality-time', 'friends'],
  },
  {
    categorySlug: 'education',
    slug: 'practice-routine',
    label: 'Practice Routine',
    description: 'Deliberate practice sessions for instruments, speaking, or problem solving.',
    isFeatured: false,
    position: 15,
    focusSlugs: ['music', 'languages', 'professional-skills'],
  },
  {
    categorySlug: 'education',
    slug: 'reading-plan',
    label: 'Reading Plan',
    description: 'Daily reading chapters, notes, and summaries.',
    isFeatured: false,
    position: 16,
    focusSlugs: ['exam-prep', 'professional-skills', 'languages'],
  },
  {
    categorySlug: 'custom',
    slug: 'custom-program',
    label: 'Custom Program',
    description: 'Build your own schedule from any combination of activities.',
    isFeatured: false,
    position: 17,
    focusSlugs: [],
  },
]

const METRIC_DEFINITIONS = [
  { key: 'completion', label: 'Completed', valueType: 'BOOLEAN' as const, unit: null, precision: null, aggregation: 'COUNT' as const, betterDirection: 'HIGHER' as const, validation: null },
  { key: 'repetitions', label: 'Reps', valueType: 'INTEGER' as const, unit: 'reps', precision: null, aggregation: 'SUM' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'sets', label: 'Sets', valueType: 'INTEGER' as const, unit: 'sets', precision: null, aggregation: 'SUM' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'duration', label: 'Duration', valueType: 'DURATION' as const, unit: 's', precision: null, aggregation: 'SUM' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'distance', label: 'Distance', valueType: 'DECIMAL' as const, unit: 'km', precision: 2, aggregation: 'SUM' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'weight', label: 'Weight', valueType: 'DECIMAL' as const, unit: 'kg', precision: 1, aggregation: 'MAX' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'contribution_amount', label: 'Amount', valueType: 'DECIMAL' as const, unit: 'USD', precision: 2, aggregation: 'SUM' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'lesson_count', label: 'Lessons', valueType: 'INTEGER' as const, unit: 'lessons', precision: null, aggregation: 'SUM' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'pages', label: 'Pages', valueType: 'INTEGER' as const, unit: 'pages', precision: null, aggregation: 'SUM' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'rating', label: 'Rating', valueType: 'INTEGER' as const, unit: null, precision: null, aggregation: 'AVERAGE' as const, betterDirection: 'NONE' as const, validation: { min: 1, max: 5 } },
  { key: 'notes', label: 'Notes', valueType: 'TEXT' as const, unit: null, precision: null, aggregation: 'LAST' as const, betterDirection: 'NONE' as const, validation: null },
]

const TOOL_DEFINITIONS = [
  { key: 'TIMER' as const, label: 'Timer', componentKey: 'timer', defaultConfig: { seconds: 60 } },
  { key: 'COUNTER' as const, label: 'Counter', componentKey: 'counter', defaultConfig: { step: 1 } },
  { key: 'CHECKLIST' as const, label: 'Checklist', componentKey: 'checklist', defaultConfig: {} },
  { key: 'NOTES' as const, label: 'Notes', componentKey: 'notes', defaultConfig: {} },
  { key: 'CALCULATOR' as const, label: 'Calculator', componentKey: 'calculator', defaultConfig: {} },
  { key: 'MEDIA_CAPTURE' as const, label: 'Media Capture', componentKey: 'media-capture', defaultConfig: {} },
]

const ACHIEVEMENT_DEFINITIONS = [
  { key: 'first-completion', label: 'First step', description: 'Completed your first activity', icon: 'sparkles', ruleKind: 'TOTAL_COMPLETIONS' as const, threshold: 1, position: 0 },
  { key: 'ten-completions', label: 'Ten done', description: 'Completed 10 activities', icon: 'medal', ruleKind: 'TOTAL_COMPLETIONS' as const, threshold: 10, position: 1 },
  { key: 'fifty-completions', label: 'Fifty strong', description: 'Completed 50 activities', icon: 'flame', ruleKind: 'TOTAL_COMPLETIONS' as const, threshold: 50, position: 2 },
  { key: 'hundred-completions', label: 'Century club', description: 'Completed 100 activities', icon: 'crown', ruleKind: 'TOTAL_COMPLETIONS' as const, threshold: 100, position: 3 },
  { key: 'program-first-week', label: 'First week done', description: 'Completed the first week of a program', icon: 'calendar-check', ruleKind: 'PROGRAM_FIRST_WEEK' as const, threshold: null, position: 4 },
  { key: 'program-halfway', label: 'Halfway there', description: 'Reached the halfway mark in a program', icon: 'compass', ruleKind: 'PROGRAM_HALFWAY' as const, threshold: null, position: 5 },
  { key: 'program-completed', label: 'Program complete', description: 'Finished every scheduled activity in a program', icon: 'trophy', ruleKind: 'PROGRAM_COMPLETED' as const, threshold: null, position: 6 },
]

type MetricBindingSeed = { key: string; target?: number | string | boolean; required?: boolean }
type ToolBindingSeed = { key: 'TIMER' | 'COUNTER' | 'CHECKLIST' | 'NOTES' | 'CALCULATOR' | 'MEDIA_CAPTURE'; config?: Record<string, unknown> }

type ActivitySeed = {
  slug: string
  title: string
  summary: string
  categorySlug: string
  focusSlugs: string[]
  instructions: { title?: string; body: string }[]
  metrics: MetricBindingSeed[]
  tools: ToolBindingSeed[]
  hasVideo?: boolean
  textOnly?: boolean // 08 §9: intentional text-only outlier so the UI never assumes every Activity has media
}

export const SEEDED_ACTIVITIES: ActivitySeed[] = [
  // ── 1. Fitness — Strength (15) ─────────────────────────────────────────────
  {
    slug: 'squats',
    title: 'Squats',
    summary: 'Fundamental lower-body strength movement targeting quads, hips, and core.',
    categorySlug: 'fitness',
    focusSlugs: ['strength', 'general-fitness'],
    instructions: [
      { title: 'Set your stance', body: 'Stand tall with feet shoulder-width apart and chest lifted.' },
      { title: 'Lower with control', body: 'Send your hips back and down as if sitting into a chair, keeping heels grounded.' },
      { title: 'Drive up', body: 'Press evenly through both feet to return to standing.' },
    ],
    metrics: [
      { key: 'repetitions', target: 12, required: true },
      { key: 'sets', target: 3 },
    ],
    tools: [{ key: 'COUNTER', config: { step: 1 } }],
    hasVideo: true,
  },
  {
    slug: 'leg-raises',
    title: 'Leg Raises',
    summary: 'Controlled supine core exercise for lower-abdominal stability.',
    categorySlug: 'fitness',
    focusSlugs: ['strength', 'general-fitness'],
    instructions: [
      { title: 'Lie flat', body: 'Lie on your back with legs extended and lower back gently pressed to the floor.' },
      { title: 'Lift and lower', body: 'Raise both legs until vertical, then lower slowly without arching your back.' },
    ],
    metrics: [
      { key: 'repetitions', target: 10, required: true },
      { key: 'sets', target: 3 },
    ],
    tools: [{ key: 'COUNTER', config: { step: 1 } }],
    hasVideo: true,
  },
  {
    slug: 'push-ups',
    title: 'Push-ups',
    summary: 'Upper-body and core pressing exercise from floor or elevated surface.',
    categorySlug: 'fitness',
    focusSlugs: ['strength', 'endurance'],
    instructions: [
      { title: 'Plank setup', body: 'Place hands slightly wider than shoulders with a straight line from head to heels.' },
      { title: 'Lower chest', body: 'Bend elbows at a comfortable angle to lower your chest toward the floor.' },
      { title: 'Press back', body: 'Push the floor away to return to the top position.' },
    ],
    metrics: [
      { key: 'repetitions', target: 10, required: true },
      { key: 'sets', target: 3 },
    ],
    tools: [{ key: 'COUNTER', config: { step: 1 } }],
    hasVideo: true,
  },
  {
    slug: 'plank',
    title: 'Plank',
    summary: 'Isometric full-body hold building trunk endurance and posture.',
    categorySlug: 'fitness',
    focusSlugs: ['strength', 'endurance'],
    // 08 §9 outlier: simple 1-instruction video activity
    instructions: [
      { title: 'Brace and hold', body: 'Rest on forearms and toes with ribs stacked over hips; breathe steadily while holding a straight line.' },
    ],
    metrics: [{ key: 'duration', target: 45, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 45 } }],
    hasVideo: true,
  },
  {
    slug: 'side-plank',
    title: 'Side Plank',
    summary: 'Lateral core hold for oblique strength and hip stability.',
    categorySlug: 'fitness',
    focusSlugs: ['strength', 'endurance'],
    instructions: [
      { title: 'Stack elbow under shoulder', body: 'Lie on one side with your forearm flat and feet stacked or staggered.' },
      { title: 'Lift hips', body: 'Raise your hips into a straight diagonal line and hold equally on each side.' },
    ],
    metrics: [{ key: 'duration', target: 30, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 30 } }],
  },
  {
    slug: 'bird-dog',
    title: 'Bird Dog',
    summary: 'Cross-body quadruped reach for spinal stability and balance.',
    categorySlug: 'fitness',
    focusSlugs: ['strength', 'flexibility'],
    instructions: [
      { title: 'Hands and knees', body: 'Start on all fours with wrists under shoulders and knees under hips.' },
      { title: 'Extend opposite limbs', body: 'Reach one arm forward and the opposite leg back without tilting your pelvis.' },
      { title: 'Switch sides', body: 'Pause briefly, return to center, and alternate sides.' },
    ],
    metrics: [{ key: 'repetitions', target: 10, required: true }],
    tools: [{ key: 'COUNTER', config: { step: 1 } }],
  },
  {
    slug: 'dead-bug',
    title: 'Dead Bug',
    summary: 'Supine contralateral reach that trains deep core control.',
    categorySlug: 'fitness',
    focusSlugs: ['strength', 'general-fitness'],
    instructions: [
      { title: 'Tabletop position', body: 'Lie on your back with arms reaching up and knees bent at 90 degrees.' },
      { title: 'Lower opposite arm and leg', body: 'Exhale as you slowly extend one arm overhead and the opposite heel toward the floor.' },
      { title: 'Return and alternate', body: 'Bring both back to center while keeping your lower back anchored.' },
    ],
    metrics: [{ key: 'repetitions', target: 10, required: true }],
    tools: [{ key: 'COUNTER', config: { step: 1 } }],
  },
  {
    slug: 'glute-bridge',
    title: 'Glute Bridge',
    summary: 'Hip extension movement strengthening glutes and posterior chain.',
    categorySlug: 'fitness',
    focusSlugs: ['strength', 'general-fitness'],
    instructions: [
      { title: 'Feet flat', body: 'Lie on your back with knees bent and heels a comfortable distance from your hips.' },
      { title: 'Drive hips up', body: 'Press through your heels to lift hips until knees, hips, and shoulders align.' },
      { title: 'Lower smoothly', body: 'Pause at the top, then lower down with control.' },
    ],
    metrics: [
      { key: 'repetitions', target: 12, required: true },
      { key: 'sets', target: 3 },
    ],
    tools: [{ key: 'COUNTER', config: { step: 1 } }],
  },
  {
    slug: 'lunges',
    title: 'Lunges',
    summary: 'Single-leg stepping exercise for leg strength and balance.',
    categorySlug: 'fitness',
    focusSlugs: ['strength', 'endurance'],
    // 08 §9 outlier: 4-instruction activity
    instructions: [
      { title: 'Stand tall', body: 'Begin with feet hip-width apart and hands on hips or clasped in front.' },
      { title: 'Step forward', body: 'Take a controlled step forward and lower until both knees bend comfortably.' },
      { title: 'Keep front knee tracked', body: 'Ensure your front knee stays aligned over the middle of your foot.' },
      { title: 'Push back to start', body: 'Press through the front foot to return to standing and alternate legs.' },
    ],
    metrics: [
      { key: 'repetitions', target: 10, required: true },
      { key: 'sets', target: 3 },
    ],
    tools: [{ key: 'COUNTER', config: { step: 1 } }],
    hasVideo: true,
  },
  {
    slug: 'wall-sit',
    title: 'Wall Sit',
    summary: 'Timed isometric lower-body hold against a wall.',
    categorySlug: 'fitness',
    focusSlugs: ['strength', 'endurance'],
    instructions: [
      { title: 'Slide down the wall', body: 'Lean your back flat against a sturdy wall and walk feet out until knees are bent.' },
      { title: 'Hold steady', body: 'Keep weight evenly in your feet and breathe calmly until the timer finishes.' },
    ],
    metrics: [{ key: 'duration', target: 45, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 45 } }],
  },
  {
    slug: 'calf-raises',
    title: 'Calf Raises',
    summary: 'Ankle plantarflexion exercise for lower-leg strength and stability.',
    categorySlug: 'fitness',
    focusSlugs: ['strength', 'general-fitness'],
    instructions: [
      { title: 'Stand near support', body: 'Stand with feet hip-width apart, lightly touching a wall or chair for balance.' },
      { title: 'Rise onto toes', body: 'Lift your heels as high as comfortable, pause briefly, and lower slowly.' },
    ],
    metrics: [
      { key: 'repetitions', target: 15, required: true },
      { key: 'sets', target: 2 },
    ],
    tools: [{ key: 'COUNTER', config: { step: 1 } }],
  },
  {
    slug: 'step-ups',
    title: 'Step-ups',
    summary: 'Functional single-leg climb onto a stable step or bench.',
    categorySlug: 'fitness',
    focusSlugs: ['strength', 'cardio'],
    instructions: [
      { title: 'Place whole foot on step', body: 'Set one foot firmly on a sturdy low step or stair.' },
      { title: 'Press to stand', body: 'Drive through the lead heel to stand tall on the step, then step down with control.' },
    ],
    metrics: [
      { key: 'repetitions', target: 12, required: true },
      { key: 'sets', target: 2 },
    ],
    tools: [{ key: 'COUNTER', config: { step: 1 } }],
  },
  {
    slug: 'chair-squats',
    title: 'Chair Squats',
    summary: 'Accessible box-squat variation using a chair for consistent depth.',
    categorySlug: 'fitness',
    focusSlugs: ['strength', 'general-fitness'],
    instructions: [
      { title: 'Stand in front of a chair', body: 'Place feet shoulder-width apart a few inches in front of a stable chair.' },
      { title: 'Tap and stand', body: 'Lower hips until you lightly touch the seat, then press through your feet to stand.' },
    ],
    metrics: [{ key: 'repetitions', target: 10, required: true }],
    tools: [{ key: 'COUNTER', config: { step: 1 } }],
  },
  {
    slug: 'resistance-band-row',
    title: 'Resistance Band Row',
    summary: 'Seated or standing upper-back pull using an anchored resistance band.',
    categorySlug: 'fitness',
    focusSlugs: ['strength', 'general-fitness'],
    instructions: [
      { title: 'Anchor the band', body: 'Loop a resistance band around your feet or a secure anchor at chest height.' },
      { title: 'Draw elbows back', body: 'Pull the band toward your ribs while squeezing shoulder blades together, then return slowly.' },
    ],
    metrics: [
      { key: 'repetitions', target: 12, required: true },
      { key: 'sets', target: 3 },
    ],
    tools: [{ key: 'COUNTER', config: { step: 1 } }],
  },
  {
    slug: 'standing-row',
    title: 'Standing Row',
    summary: 'Postural upper-back retraction drill with light weights or bodyweight tension.',
    categorySlug: 'fitness',
    focusSlugs: ['strength', 'general-fitness'],
    instructions: [
      { title: 'Hinge slightly', body: 'Stand tall with knees soft and hinge slightly forward from the hips.' },
      { title: 'Pull and pause', body: 'Draw elbows back past your torso, pause for a beat, and extend arms forward.' },
    ],
    metrics: [{ key: 'repetitions', target: 12, required: true }],
    tools: [{ key: 'COUNTER', config: { step: 1 } }],
  },

  // ── 2. Fitness — Cardio & Mobility (15) ────────────────────────────────────
  {
    slug: 'brisk-walk',
    title: 'Brisk Walk',
    summary: 'Purposeful steady-pace walk to elevate heart rate and energy.',
    categorySlug: 'fitness',
    focusSlugs: ['cardio', 'endurance', 'general-fitness'],
    instructions: [
      { title: 'Start at an easy pace', body: 'Walk comfortably for the first two minutes to warm up your joints.' },
      { title: 'Settle into a brisk rhythm', body: 'Swing arms naturally and maintain a pace where conversation is still possible.' },
    ],
    metrics: [
      { key: 'duration', target: 1200, required: true },
      { key: 'distance', target: 1.5 },
    ],
    tools: [{ key: 'TIMER', config: { seconds: 1200 } }],
  },
  {
    slug: 'easy-walk',
    title: 'Easy Walk',
    summary: 'Gentle low-impact walk for active recovery and circulation.',
    categorySlug: 'fitness',
    focusSlugs: ['cardio', 'general-fitness'],
    instructions: [
      { title: 'Walk at a relaxed pace', body: 'Move at an unhurried, comfortable stride with relaxed shoulders.' },
      { title: 'Breathe evenly', body: 'Notice your surroundings and keep your breathing smooth.' },
    ],
    metrics: [{ key: 'duration', target: 900, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 900 } }],
  },
  {
    slug: 'jog-intervals',
    title: 'Jog Intervals',
    summary: 'Alternating light jog and brisk walk intervals to build aerobic capacity.',
    categorySlug: 'fitness',
    focusSlugs: ['cardio', 'endurance'],
    instructions: [
      { title: 'Warm up with a walk', body: 'Spend three minutes walking briskly before your first jog interval.' },
      { title: 'Alternate jog and walk', body: 'Jog lightly for 60 seconds, then walk for 60–90 seconds; repeat for the session.' },
      { title: 'Cool down', body: 'Finish with two minutes of easy walking.' },
    ],
    metrics: [
      { key: 'duration', target: 1200, required: true },
      { key: 'distance', target: 2.0 },
    ],
    tools: [{ key: 'TIMER', config: { seconds: 1200 } }],
  },
  {
    slug: 'bike-ride',
    title: 'Bike Ride',
    summary: 'Outdoor or stationary cycling session for low-impact cardio endurance.',
    categorySlug: 'fitness',
    focusSlugs: ['cardio', 'endurance'],
    instructions: [
      { title: 'Check seat and posture', body: 'Adjust saddle height so your knee has a slight bend at the bottom of each pedal stroke.' },
      { title: 'Pedal at a steady cadence', body: 'Keep a smooth, moderate spin throughout the ride.' },
    ],
    metrics: [
      { key: 'duration', target: 1500, required: true },
      { key: 'distance', target: 6.0 },
    ],
    tools: [{ key: 'TIMER', config: { seconds: 1500 } }],
  },
  {
    slug: 'stair-walking',
    title: 'Stair Walking',
    summary: 'Short bouts of stair climbing for leg endurance and heart health.',
    categorySlug: 'fitness',
    focusSlugs: ['cardio', 'endurance'],
    instructions: [
      { title: 'Use the handrail lightly', body: 'Place your whole foot on each step and keep an upright posture.' },
      { title: 'Pace your climbs', body: 'Walk up and down at a steady rhythm, resting briefly at the landing as needed.' },
    ],
    metrics: [{ key: 'duration', target: 600, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 600 } }],
  },
  {
    slug: 'warm-up',
    title: 'Warm-up',
    summary: 'Dynamic full-body preparation to raise temperature and loosen joints.',
    categorySlug: 'fitness',
    focusSlugs: ['flexibility', 'general-fitness'],
    instructions: [
      { title: 'March and roll shoulders', body: 'March in place lightly while rolling your shoulders forward and back.' },
      { title: 'Open hips and chest', body: 'Perform gentle arm swings and shallow bodyweight squats.' },
    ],
    metrics: [{ key: 'duration', target: 300, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 300 } }],
  },
  {
    slug: 'cool-down',
    title: 'Cool-down',
    summary: 'Easy movement and slow breathing to transition out of exercise.',
    categorySlug: 'fitness',
    focusSlugs: ['flexibility', 'general-fitness'],
    instructions: [
      { title: 'Slow your pace', body: 'Walk or sway gently for two minutes to let your heart rate settle.' },
      { title: 'Stretch major muscles', body: 'Hold gentle, pain-free stretches for calves, quads, and chest.' },
    ],
    metrics: [{ key: 'duration', target: 300, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 300 } }],
  },
  {
    slug: 'neck-mobility',
    title: 'Neck Mobility',
    summary: 'Gentle cervical rotations and tilts to release desk tension.',
    categorySlug: 'fitness',
    focusSlugs: ['flexibility', 'general-fitness'],
    instructions: [
      { title: 'Sit or stand tall', body: 'Drop your shoulders away from your ears and look straight ahead.' },
      { title: 'Slow turns and tilts', body: 'Slowly look left and right, then gently tilt ear toward shoulder on each side.' },
    ],
    metrics: [{ key: 'duration', target: 180, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 180 } }],
  },
  {
    slug: 'shoulder-circles',
    title: 'Shoulder Circles',
    summary: 'Controlled scapular circles to open the chest and upper back.',
    categorySlug: 'fitness',
    focusSlugs: ['flexibility', 'general-fitness'],
    instructions: [
      { title: 'Roll backward', body: 'Draw shoulders up, back, and down in smooth circles for 10 repetitions.' },
      { title: 'Reverse direction', body: 'Repeat smooth circles forward while keeping your neck relaxed.' },
    ],
    metrics: [{ key: 'repetitions', target: 20, required: true }],
    tools: [{ key: 'COUNTER', config: { step: 1 } }],
  },
  {
    slug: 'hip-mobility',
    title: 'Hip Mobility',
    summary: 'Controlled hip circles and lunging openers for lower-body freedom.',
    categorySlug: 'fitness',
    focusSlugs: ['flexibility', 'general-fitness'],
    instructions: [
      { title: '90/90 or kneeling lunge', body: 'Step into a gentle half-kneeling or seated hip position.' },
      { title: 'Shift and breathe', body: 'Gently rock forward and back through the hips, switching sides halfway.' },
    ],
    metrics: [{ key: 'duration', target: 300, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 300 } }],
  },
  {
    slug: 'calf-stretch',
    title: 'Calf Stretch',
    summary: 'Wall-supported lower-leg stretch for ankle mobility.',
    categorySlug: 'fitness',
    focusSlugs: ['flexibility'],
    instructions: [
      { title: 'Step one foot back', body: 'Place hands on a wall and step one foot back with heel pressed toward the floor.' },
      { title: 'Hold both sides', body: 'Hold for 30 seconds with a straight back knee, then switch legs.' },
    ],
    metrics: [{ key: 'duration', target: 120, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 120 } }],
  },
  {
    slug: 'hamstring-stretch',
    title: 'Hamstring Stretch',
    summary: 'Seated or standing posterior-thigh stretch with a neutral spine.',
    categorySlug: 'fitness',
    focusSlugs: ['flexibility'],
    instructions: [
      { title: 'Extend one heel forward', body: 'Rest one heel on the floor or a low step with toes pointing up.' },
      { title: 'Hinge from the hips', body: 'Keep your back long and hinge forward slightly until a mild stretch is felt.' },
    ],
    metrics: [{ key: 'duration', target: 180, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 180 } }],
  },
  {
    slug: 'gentle-yoga',
    title: 'Gentle Yoga',
    summary: 'Unhurried sequence of breath-linked postures for mobility and calm.',
    categorySlug: 'fitness',
    focusSlugs: ['flexibility', 'general-fitness'],
    instructions: [
      { title: 'Cat-cow breath', body: 'Begin on hands and knees, arching and rounding your spine with each breath.' },
      { title: 'Low lunge and fold', body: 'Flow gently between a supported low lunge and a relaxed forward fold.' },
      { title: 'Rest in stillness', body: 'Close with one minute of quiet breathing.' },
    ],
    metrics: [{ key: 'duration', target: 600, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 600 } }],
  },
  {
    slug: 'balance-practice',
    title: 'Balance Practice',
    summary: 'Single-leg stability holds to sharpen proprioception and ankle control.',
    categorySlug: 'fitness',
    focusSlugs: ['flexibility', 'general-fitness'],
    instructions: [
      { title: 'Stand near a wall', body: 'Fix your gaze on a steady point ahead and lift one foot slightly off the floor.' },
      { title: 'Hold and switch', body: 'Balance for 30 seconds on the left foot, then 30 seconds on the right.' },
    ],
    metrics: [{ key: 'duration', target: 180, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 180 } }],
  },
  {
    slug: 'breathing-break',
    title: 'Breathing Break',
    summary: 'Two-minute nasal breathing reset between physical or workday tasks.',
    categorySlug: 'fitness',
    focusSlugs: ['general-fitness', 'flexibility'],
    instructions: [
      { title: 'Relax your jaw and shoulders', body: 'Sit or stand comfortably and inhale slowly through your nose for four counts.' },
      { title: 'Long exhale', body: 'Exhale smoothly for six counts and repeat.' },
    ],
    metrics: [{ key: 'duration', target: 120, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 120 } }],
  },

  // ── 3. Education — Study (15) ──────────────────────────────────────────────
  {
    slug: 'vocabulary-review',
    title: 'Vocabulary Review',
    summary: 'Active recall session reviewing target words and example phrases.',
    categorySlug: 'education',
    focusSlugs: ['languages', 'exam-prep'],
    instructions: [
      { title: 'Recall before flipping', body: 'Say or write the meaning of each word from memory before checking the answer.' },
      { title: 'Use in a sentence', body: 'Create one short sentence out loud for any word that felt unfamiliar.' },
    ],
    metrics: [
      { key: 'duration', target: 600, required: true },
      { key: 'lesson_count', target: 1 },
    ],
    tools: [{ key: 'TIMER', config: { seconds: 600 } }, { key: 'NOTES' }],
  },
  {
    slug: 'flashcard-practice',
    title: 'Flashcard Practice',
    summary: 'Spaced-repetition card deck drill for rapid concept retention.',
    categorySlug: 'education',
    focusSlugs: ['languages', 'exam-prep'],
    instructions: [
      { title: 'Work through today’s deck', body: 'Answer each prompt honestly and separate cards that need another pass.' },
      { title: 'Repeat missed cards', body: 'Review the missed pile once more before finishing.' },
    ],
    metrics: [
      { key: 'repetitions', target: 25, required: true },
      { key: 'duration', target: 600 },
    ],
    tools: [{ key: 'COUNTER', config: { step: 1 } }, { key: 'TIMER', config: { seconds: 600 } }],
  },
  {
    slug: 'read-a-chapter',
    title: 'Read a Chapter',
    summary: 'Focused reading of one chapter from a textbook, course reader, or book.',
    categorySlug: 'education',
    focusSlugs: ['exam-prep', 'professional-skills', 'languages'],
    instructions: [
      { title: 'Preview headings', body: 'Skim the chapter headings and summary questions for 60 seconds.' },
      { title: 'Read without distractions', body: 'Read through the chapter and jot down two key takeaways at the end.' },
    ],
    metrics: [
      { key: 'pages', target: 15, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },
  {
    slug: 'read-for-20-minutes',
    title: 'Read for 20 Minutes',
    summary: 'Timed distraction-free reading block to build a steady daily habit.',
    categorySlug: 'education',
    focusSlugs: ['professional-skills', 'languages', 'exam-prep'],
    instructions: [
      { title: 'Silence notifications', body: 'Start the 20-minute timer and put your phone out of reach.' },
      { title: 'Log pages read', body: 'Mark your bookmark and record how many pages you covered.' },
    ],
    metrics: [
      { key: 'duration', target: 1200, required: true },
      { key: 'pages', target: 12 },
    ],
    tools: [{ key: 'TIMER', config: { seconds: 1200 } }],
  },
  {
    slug: 'practice-speaking',
    title: 'Practice Speaking',
    summary: 'Aloud speaking practice for pronunciation, fluency, or presentation clarity.',
    categorySlug: 'education',
    focusSlugs: ['languages', 'professional-skills'],
    instructions: [
      { title: 'Pick a prompt', body: 'Choose one topic or dialogue and speak out loud without stopping to self-correct.' },
      { title: 'Review phrasing', body: 'Note one expression or transition you want to smooth out next time.' },
    ],
    metrics: [{ key: 'duration', target: 600, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 600 } }, { key: 'MEDIA_CAPTURE' }],
  },
  {
    slug: 'listening-practice',
    title: 'Listening Practice',
    summary: 'Active comprehension practice with audio lessons, lectures, or podcasts.',
    categorySlug: 'education',
    focusSlugs: ['languages', 'music', 'exam-prep'],
    instructions: [
      { title: 'First listen without transcript', body: 'Listen to a short segment and focus on the main idea.' },
      { title: 'Second listen for detail', body: 'Replay key phrases and write down new expressions.' },
    ],
    metrics: [{ key: 'duration', target: 900, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 900 } }, { key: 'NOTES' }],
  },
  {
    slug: 'write-a-summary',
    title: 'Write a Summary',
    summary: 'Synthesize what you learned today in five clear sentences.',
    categorySlug: 'education',
    focusSlugs: ['exam-prep', 'professional-skills'],
    // 08 §9 outlier: text-only activity without visual media attachment
    textOnly: true,
    instructions: [
      { title: 'Close your reference material', body: 'Draft a short summary in your own words without looking at the source.' },
      { title: 'Check for gaps', body: 'Reopen your notes and fill in any missing link.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },
  {
    slug: 'solve-practice-problems',
    title: 'Solve Practice Problems',
    summary: 'Hands-on problem-set session to test understanding under realistic conditions.',
    categorySlug: 'education',
    focusSlugs: ['exam-prep', 'professional-skills'],
    instructions: [
      { title: 'Attempt before checking solutions', body: 'Work through each problem on paper or in your workspace before viewing hints.' },
      { title: 'Log completed problems', body: 'Record how many problems you solved and flag any to revisit.' },
    ],
    metrics: [
      { key: 'repetitions', target: 5, required: true },
      { key: 'duration', target: 1200 },
    ],
    tools: [{ key: 'COUNTER', config: { step: 1 } }, { key: 'CALCULATOR' }],
  },
  {
    slug: 'review-notes',
    title: 'Review Notes',
    summary: 'Ten-minute review of recent class or meeting notes to reinforce memory.',
    categorySlug: 'education',
    focusSlugs: ['exam-prep', 'professional-skills'],
    instructions: [
      { title: 'Highlight core concepts', body: 'Scan your recent notes and turn key points into self-test questions.' },
      { title: 'Summarize action items', body: 'Write one line capturing what to study next.' },
    ],
    metrics: [{ key: 'duration', target: 600, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 600 } }, { key: 'NOTES' }],
  },
  {
    slug: 'complete-a-lesson',
    title: 'Complete a Lesson',
    summary: 'Finish one structured module or unit in your current course.',
    categorySlug: 'education',
    focusSlugs: ['languages', 'professional-skills', 'exam-prep'],
    instructions: [
      { title: 'Complete the lesson exercises', body: 'Move through one full lesson and complete its practice checks.' },
      { title: 'Record one takeaway', body: 'Capture the single most useful concept from the lesson.' },
    ],
    metrics: [
      { key: 'lesson_count', target: 1, required: true },
      { key: 'duration', target: 900 },
    ],
    tools: [{ key: 'CHECKLIST' }, { key: 'NOTES' }],
  },
  {
    slug: 'self-quiz',
    title: 'Self-Quiz',
    summary: 'Short closed-book recall test to verify mastery.',
    categorySlug: 'education',
    focusSlugs: ['exam-prep', 'languages'],
    instructions: [
      { title: 'Answer from memory', body: 'Complete 5–10 quiz questions without consulting your study guide.' },
      { title: 'Score and note weak spots', body: 'Check your answers and list any topic that needs a follow-up review.' },
    ],
    metrics: [
      { key: 'repetitions', target: 10, required: true },
      { key: 'rating' },
    ],
    tools: [{ key: 'COUNTER', config: { step: 1 } }, { key: 'NOTES' }],
  },
  {
    slug: 'research-a-topic',
    title: 'Research a Topic',
    summary: 'Focused exploration of a single question using reliable sources.',
    categorySlug: 'education',
    focusSlugs: ['professional-skills', 'exam-prep'],
    instructions: [
      { title: 'Define one clear question', body: 'Write the specific question you want to answer before opening tabs.' },
      { title: 'Capture three findings', body: 'Record three concise facts or citations that answer your question.' },
    ],
    metrics: [
      { key: 'duration', target: 1200, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'TIMER', config: { seconds: 1200 } }, { key: 'NOTES' }],
  },
  {
    slug: 'practice-an-instrument',
    title: 'Practice an Instrument',
    summary: 'Deliberate musical practice combining warm-up scales and repertoire.',
    categorySlug: 'education',
    focusSlugs: ['music'],
    instructions: [
      { title: 'Warm up slowly', body: 'Spend five minutes on scales, rhythm, or tone at a relaxed tempo.' },
      { title: 'Loop a tricky measure', body: 'Isolate one short passage and play it cleanly three times in a row.' },
      { title: 'Play through with musicality', body: 'Finish by playing a full piece or section without stopping.' },
    ],
    metrics: [{ key: 'duration', target: 1200, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 1200 } }, { key: 'MEDIA_CAPTURE' }],
  },
  {
    slug: 'review-mistakes',
    title: 'Review Mistakes',
    summary: 'Turn recent errors from quizzes, code, or exercises into clear lessons.',
    categorySlug: 'education',
    focusSlugs: ['exam-prep', 'professional-skills', 'music'],
    instructions: [
      { title: 'Pick three recent errors', body: 'Look at missed questions or bugs and identify why the mistake happened.' },
      { title: 'Redo each correctly', body: 'Work through each item again from scratch until the solution feels natural.' },
    ],
    metrics: [
      { key: 'repetitions', target: 3, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },
  {
    slug: 'teach-back-a-concept',
    title: 'Teach Back a Concept',
    summary: 'Explain a concept simply in plain language as if teaching a beginner.',
    categorySlug: 'education',
    focusSlugs: ['professional-skills', 'exam-prep', 'languages'],
    instructions: [
      { title: 'Explain without jargon', body: 'Speak or write a two-minute explanation of one concept in plain terms.' },
      { title: 'Refine where you hesitated', body: 'Notice where your explanation slowed down and clarify that step.' },
    ],
    metrics: [
      { key: 'duration', target: 300, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'TIMER', config: { seconds: 300 } }, { key: 'NOTES' }],
  },

  // ── 4. Wellness (12) ───────────────────────────────────────────────────────
  {
    slug: 'guided-meditation',
    title: 'Guided Meditation',
    summary: 'Quiet seated meditation anchoring attention on breath and body sensations.',
    categorySlug: 'wellness',
    focusSlugs: ['mindfulness', 'relaxation'],
    instructions: [
      { title: 'Find a comfortable seat', body: 'Sit upright with hands resting on your lap and eyes softly closed.' },
      { title: 'Return to the breath', body: 'When thoughts arise, notice them kindly and bring attention back to each breath.' },
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
    summary: 'Structured box or 4-7-8 breathing to calm the nervous system.',
    categorySlug: 'wellness',
    focusSlugs: ['relaxation', 'mindfulness'],
    instructions: [
      { title: 'Inhale and hold', body: 'Inhale gently through your nose for 4 seconds and hold softly for 4 seconds.' },
      { title: 'Slow exhale', body: 'Exhale smoothly for 6 seconds and pause before the next cycle.' },
    ],
    metrics: [{ key: 'duration', target: 300, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 300 } }],
  },
  {
    slug: 'daily-reflection',
    title: 'Daily Reflection',
    summary: 'Short evening or midday check-in on energy, progress, and mindset.',
    categorySlug: 'wellness',
    focusSlugs: ['daily-reflection', 'mindfulness'],
    instructions: [
      { title: 'Notice what went well', body: 'Write down one moment from today that gave you energy or clarity.' },
      { title: 'Set tomorrow’s intention', body: 'Note one small focus for tomorrow.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'rating' },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },
  {
    slug: 'gratitude-journal',
    title: 'Gratitude Journal',
    summary: 'Record three specific people, moments, or details you appreciate today.',
    categorySlug: 'wellness',
    focusSlugs: ['daily-reflection', 'mindfulness'],
    instructions: [
      { title: 'List three specific things', body: 'Write three concrete moments or small comforts from today.' },
      { title: 'Reflect on why', body: 'Pause for a breath to appreciate why each one mattered.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },
  {
    slug: 'set-bedtime-reminder',
    title: 'Set Bedtime Reminder',
    summary: 'Prepare your environment and alarm for a consistent sleep window.',
    categorySlug: 'wellness',
    focusSlugs: ['rest'],
    instructions: [
      { title: 'Confirm your sleep target', body: 'Check tomorrow’s wake time and set your wind-down cue 30 minutes before bed.' },
      { title: 'Dim bright screens', body: 'Set devices to night mode and place your charger away from the pillow.' },
    ],
    metrics: [{ key: 'completion', target: true, required: true }],
    tools: [{ key: 'CHECKLIST' }],
  },
  {
    slug: 'evening-wind-down',
    title: 'Evening Wind-down',
    summary: 'Unhurried 15-minute transition away from work and bright screens.',
    categorySlug: 'wellness',
    focusSlugs: ['rest', 'relaxation'],
    instructions: [
      { title: 'Close open loops', body: 'Write down any lingering tasks for tomorrow so your mind can rest.' },
      { title: 'Relax in low light', body: 'Spend 10 minutes reading, stretching lightly, or sipping herbal tea.' },
    ],
    metrics: [{ key: 'duration', target: 900, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 900 } }, { key: 'NOTES' }],
  },
  {
    slug: 'morning-routine',
    title: 'Morning Routine',
    summary: 'Calm start to the day with hydration, natural light, and intention.',
    categorySlug: 'wellness',
    focusSlugs: ['mindfulness', 'daily-reflection'],
    instructions: [
      { title: 'Hydrate and get light', body: 'Drink a glass of water and step near a window or outside for fresh light.' },
      { title: 'Name today’s priority', body: 'Choose the single most meaningful thing to accomplish today.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'CHECKLIST' }, { key: 'NOTES' }],
  },
  {
    slug: 'outdoor-break',
    title: 'Outdoor Break',
    summary: 'Step outside for fresh air, natural light, and a mental reset.',
    categorySlug: 'wellness',
    focusSlugs: ['relaxation', 'rest'],
    instructions: [
      { title: 'Step outdoors', body: 'Leave your desk and spend 10 minutes outside without checking messages.' },
      { title: 'Look at the horizon', body: 'Let your eyes relax on distant trees or sky to relieve eye strain.' },
    ],
    metrics: [{ key: 'duration', target: 600, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 600 } }],
  },
  {
    slug: 'mindful-walk',
    title: 'Mindful Walk',
    summary: 'Slow, attentive walk focusing on footsteps, breath, and senses.',
    categorySlug: 'wellness',
    focusSlugs: ['mindfulness', 'relaxation'],
    instructions: [
      { title: 'Walk without headphones', body: 'Move at a gentle pace and notice the sensation of each step.' },
      { title: 'Notice three details', body: 'Observe three sounds, colors, or textures along your path.' },
    ],
    metrics: [{ key: 'duration', target: 900, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 900 } }],
  },
  {
    slug: 'stretch-break',
    title: 'Stretch Break',
    summary: 'Five-minute posture and tension release during the day.',
    categorySlug: 'wellness',
    focusSlugs: ['relaxation', 'rest'],
    instructions: [
      { title: 'Stand and reach overhead', body: 'Interlace fingers, reach tall, and take three deep breaths.' },
      { title: 'Release shoulders and hips', body: 'Gently roll shoulders and fold forward to relax your back.' },
    ],
    metrics: [{ key: 'duration', target: 300, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 300 } }],
  },
  {
    slug: 'screen-free-break',
    title: 'Screen-free Break',
    summary: 'Intentional pause from phones, monitors, and feeds.',
    categorySlug: 'wellness',
    focusSlugs: ['rest', 'mindfulness'],
    instructions: [
      { title: 'Set screens aside', body: 'Turn monitors off or step into another room for 15 minutes.' },
      { title: 'Rest your attention', body: 'Look out a window, rest your eyes, or jot thoughts on paper.' },
    ],
    metrics: [{ key: 'duration', target: 900, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 900 } }],
  },
  {
    slug: 'weekly-reflection',
    title: 'Weekly Reflection',
    summary: 'Look back on the week’s wins, lessons, and energy balance.',
    categorySlug: 'wellness',
    focusSlugs: ['daily-reflection', 'mindfulness'],
    instructions: [
      { title: 'Review the past seven days', body: 'Note what gave you energy this week and what felt draining.' },
      { title: 'Choose one adjustment', body: 'Pick one small habit adjustment for the coming week.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'rating' },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },

  // ── 5. Finance (12) ────────────────────────────────────────────────────────
  {
    slug: 'savings-contribution',
    title: 'Savings Contribution',
    summary: 'Transfer a planned amount into your emergency fund or savings goal.',
    categorySlug: 'finance',
    focusSlugs: ['emergency-fund', 'fundamentals'],
    instructions: [
      { title: 'Make your transfer', body: 'Move your planned contribution into your dedicated savings account.' },
      { title: 'Record the amount', body: 'Log the contribution amount to track your progress over time.' },
    ],
    metrics: [
      { key: 'contribution_amount', target: 50, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'CALCULATOR' }, { key: 'NOTES' }],
  },
  {
    slug: 'weekly-budget-review',
    title: 'Weekly Budget Review',
    summary: 'Ten-minute check-in on weekly spending versus your plan.',
    categorySlug: 'finance',
    focusSlugs: ['spending-review', 'fundamentals'],
    instructions: [
      { title: 'Check recent transactions', body: 'Review your transactions from the past seven days for accuracy.' },
      { title: 'Compare with category targets', body: 'Note any category running warm and adjust your plan for next week.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'duration', target: 600 },
      { key: 'notes' },
    ],
    tools: [{ key: 'CALCULATOR' }, { key: 'CHECKLIST' }, { key: 'NOTES' }],
  },
  {
    slug: 'categorize-expenses',
    title: 'Categorize Expenses',
    summary: 'Sort recent purchases into clear essential and discretionary buckets.',
    categorySlug: 'finance',
    focusSlugs: ['spending-review', 'fundamentals'],
    instructions: [
      { title: 'Tag uncategorized items', body: 'Assign each recent expense to housing, groceries, transport, or discretionary.' },
      { title: 'Spot one pattern', body: 'Note any recurring impulse spend you can simplify.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'CALCULATOR' }, { key: 'NOTES' }],
  },
  {
    slug: 'review-subscriptions',
    title: 'Review Subscriptions',
    summary: 'Audit recurring monthly and annual charges and cancel unused services.',
    categorySlug: 'finance',
    focusSlugs: ['spending-review'],
    instructions: [
      { title: 'List active recurring charges', body: 'Scan your statement for memberships, apps, and streaming services.' },
      { title: 'Keep or cancel', body: 'Cancel or downgrade any subscription you have not used in the past 30 days.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'CHECKLIST' }, { key: 'NOTES' }],
  },
  {
    slug: 'check-monthly-bills',
    title: 'Check Monthly Bills',
    summary: 'Verify upcoming bill due dates and confirm scheduled payments.',
    categorySlug: 'finance',
    focusSlugs: ['fundamentals', 'spending-review'],
    instructions: [
      { title: 'Verify due dates', body: 'Check utilities, rent/mortgage, and statement balances due in the next two weeks.' },
      { title: 'Confirm payment coverage', body: 'Ensure your checking balance covers all scheduled autopays.' },
    ],
    metrics: [{ key: 'completion', target: true, required: true }],
    tools: [{ key: 'CHECKLIST' }],
  },
  {
    slug: 'update-savings-goal',
    title: 'Update Savings Goal',
    summary: 'Review your current savings balance and milestone target.',
    categorySlug: 'finance',
    focusSlugs: ['emergency-fund', 'fundamentals'],
    instructions: [
      { title: 'Calculate current progress', body: 'Compare your current savings balance against your target milestone.' },
      { title: 'Adjust your next step', body: 'Set or confirm your next weekly contribution target.' },
    ],
    metrics: [
      { key: 'contribution_amount', target: 100 },
      { key: 'completion', target: true, required: true },
    ],
    tools: [{ key: 'CALCULATOR' }, { key: 'NOTES' }],
  },
  {
    slug: 'review-spending-plan',
    title: 'Review Spending Plan',
    summary: 'Align your upcoming week’s planned expenses with your priorities.',
    categorySlug: 'finance',
    focusSlugs: ['spending-review', 'fundamentals'],
    instructions: [
      { title: 'Look ahead at the calendar', body: 'Identify any irregular expenses, gifts, or travel coming up this week.' },
      { title: 'Set a clear spending cap', body: 'Decide your discretionary allowance for the week ahead.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'CALCULATOR' }, { key: 'NOTES' }],
  },
  {
    slug: 'learn-a-finance-concept',
    title: 'Learn a Finance Concept',
    summary: 'Spend 10 minutes understanding one practical personal finance principle.',
    categorySlug: 'finance',
    focusSlugs: ['fundamentals'],
    instructions: [
      { title: 'Read one focused explainer', body: 'Study one concept such as compound interest, index funds, or tax-advantaged accounts.' },
      { title: 'Write how it applies to you', body: 'Jot down one sentence on how this concept affects your own plan.' },
    ],
    metrics: [
      { key: 'duration', target: 600, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'TIMER', config: { seconds: 600 } }, { key: 'NOTES' }],
  },
  {
    slug: 'set-a-spending-reminder',
    title: 'Set a Spending Reminder',
    summary: 'Create a 24-hour pause rule or alert before non-essential purchases.',
    categorySlug: 'finance',
    focusSlugs: ['spending-review'],
    instructions: [
      { title: 'Log wishlist items', body: 'Write down any non-essential item you are tempted to buy today.' },
      { title: 'Wait 24 hours', body: 'Commit to revisiting the list tomorrow before checking out.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },
  {
    slug: 'organize-receipts',
    title: 'Organize Receipts',
    summary: 'File digital or paper receipts for warranties, taxes, or reimbursements.',
    categorySlug: 'finance',
    focusSlugs: ['fundamentals', 'spending-review'],
    instructions: [
      { title: 'Gather loose receipts', body: 'Collect paper receipts and email confirmations from the week.' },
      { title: 'Archive important records', body: 'Snap a photo or file any deductible or warranty-related receipt.' },
    ],
    metrics: [{ key: 'completion', target: true, required: true }],
    tools: [{ key: 'CHECKLIST' }, { key: 'MEDIA_CAPTURE' }],
  },
  {
    slug: 'plan-a-purchase',
    title: 'Plan a Purchase',
    summary: 'Compare options, total cost, and savings timeline for a major purchase.',
    categorySlug: 'finance',
    focusSlugs: ['spending-review', 'emergency-fund'],
    instructions: [
      { title: 'Compare at least two options', body: 'Write down total cost, durability, and alternatives for the item.' },
      { title: 'Set a sinking-fund target', body: 'Divide the cost by the number of weeks until you need it.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'CALCULATOR' }, { key: 'NOTES' }],
  },
  {
    slug: 'review-financial-goals',
    title: 'Review Financial Goals',
    summary: 'Monthly or quarterly review of short-term and long-term money goals.',
    categorySlug: 'finance',
    focusSlugs: ['emergency-fund', 'fundamentals'],
    instructions: [
      { title: 'Check each goal milestone', body: 'Review your emergency fund, debt payoff, or savings milestones.' },
      { title: 'Celebrate consistency', body: 'Record one financial win from the past month and your next priority.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },

  // ── 6. Relationships (12) ──────────────────────────────────────────────────
  {
    slug: 'call-a-friend',
    title: 'Call a Friend',
    summary: 'Have an unhurried voice or video catch-up with a friend.',
    categorySlug: 'relationships',
    focusSlugs: ['friends', 'communication'],
    instructions: [
      { title: 'Reach out warmly', body: 'Call a friend you have been thinking about or schedule a quick time to talk.' },
      { title: 'Listen fully', body: 'Ask how their week is really going and give them your undivided attention.' },
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
    summary: 'Put a dedicated, distraction-free activity on the calendar with someone close.',
    categorySlug: 'relationships',
    focusSlugs: ['quality-time', 'family', 'friends'],
    instructions: [
      { title: 'Pick a simple activity', body: 'Choose a walk, coffee, or game night and propose a specific day and time.' },
      { title: 'Confirm the plan', body: 'Lock it onto your calendar so busyness does not crowd it out.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },
  {
    slug: 'send-a-check-in-message',
    title: 'Send a Check-in Message',
    summary: 'Send a thoughtful, no-pressure note to let someone know you care.',
    categorySlug: 'relationships',
    focusSlugs: ['friends', 'communication'],
    instructions: [
      { title: 'Think of one person', body: 'Choose a friend or family member you have not spoken with recently.' },
      { title: 'Send a specific note', body: 'Share a warm thought or ask about something meaningful in their life.' },
    ],
    metrics: [{ key: 'completion', target: true, required: true }],
    tools: [{ key: 'NOTES' }],
  },
  {
    slug: 'family-activity',
    title: 'Family Activity',
    summary: 'Spend intentional time together on a shared hobby, walk, or game.',
    categorySlug: 'relationships',
    focusSlugs: ['family', 'quality-time'],
    instructions: [
      { title: 'Put phones away', body: 'Agree to set devices aside so everyone is present.' },
      { title: 'Enjoy the shared activity', body: 'Focus on connection and shared laughter rather than perfection.' },
    ],
    metrics: [{ key: 'duration', target: 1800, required: true }],
    tools: [{ key: 'TIMER', config: { seconds: 1800 } }],
  },
  {
    slug: 'shared-meal',
    title: 'Shared Meal',
    summary: 'Sit down together for a screen-free breakfast, lunch, or dinner.',
    categorySlug: 'relationships',
    focusSlugs: ['family', 'quality-time', 'friends'],
    instructions: [
      { title: 'Set the table without screens', body: 'Clear away phones and turn off background television.' },
      { title: 'Share highlights of the day', body: 'Ask everyone at the table about the best part of their day.' },
    ],
    metrics: [{ key: 'completion', target: true, required: true }],
    tools: [{ key: 'NOTES' }],
  },
  {
    slug: 'schedule-a-visit',
    title: 'Schedule a Visit',
    summary: 'Coordinate dates and details to visit family or friends in person.',
    categorySlug: 'relationships',
    focusSlugs: ['family', 'friends', 'quality-time'],
    instructions: [
      { title: 'Propose two dates', body: 'Message the person you want to visit with two concrete date options.' },
      { title: 'Note the next step', body: 'Record the confirmed date or any travel details to arrange.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'CHECKLIST' }, { key: 'NOTES' }],
  },
  {
    slug: 'write-a-thank-you-note',
    title: 'Write a Thank-you Note',
    summary: 'Express genuine appreciation to someone who helped or encouraged you.',
    categorySlug: 'relationships',
    focusSlugs: ['communication', 'friends', 'family'],
    instructions: [
      { title: 'Name the specific gesture', body: 'Write down what the person did and how it made a difference to you.' },
      { title: 'Send or deliver it', body: 'Send the message or card today while the gratitude is fresh.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },
  {
    slug: 'listen-and-reflect',
    title: 'Listen and Reflect',
    summary: 'Practice active listening in a conversation without rushing to fix or interrupt.',
    categorySlug: 'relationships',
    focusSlugs: ['communication', 'quality-time'],
    instructions: [
      { title: 'Ask an open question', body: 'Invite the other person to share what is on their mind.' },
      { title: 'Reflect back what you heard', body: 'Summarize their feeling or perspective before offering your own view.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },
  {
    slug: 'plan-a-group-outing',
    title: 'Plan a Group Outing',
    summary: 'Organize a simple gathering, walk, or meal for a small group of friends.',
    categorySlug: 'relationships',
    focusSlugs: ['friends', 'quality-time'],
    instructions: [
      { title: 'Keep the plan simple', body: 'Pick a low-friction spot such as a park walk, picnic, or casual dinner.' },
      { title: 'Send the invite', body: 'Share the time and location with the group.' },
    ],
    metrics: [{ key: 'completion', target: true, required: true }],
    tools: [{ key: 'CHECKLIST' }],
  },
  {
    slug: 'reconnect-with-someone',
    title: 'Reconnect with Someone',
    summary: 'Warmly re-establish contact with an old friend, mentor, or relative.',
    categorySlug: 'relationships',
    focusSlugs: ['friends', 'communication'],
    instructions: [
      { title: 'Let go of awkwardness', body: 'Remember that people are almost always glad to hear from an old friend.' },
      { title: 'Share a fond memory', body: 'Mention something that reminded you of them and wish them well.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'NOTES' }],
  },
  {
    slug: 'weekly-relationship-check-in',
    title: 'Weekly Relationship Check-in',
    summary: 'Gentle weekly conversation on appreciation, schedules, and support.',
    categorySlug: 'relationships',
    focusSlugs: ['communication', 'family', 'quality-time'],
    instructions: [
      { title: 'Start with appreciation', body: 'Share one thing you appreciated about each other this week.' },
      { title: 'Ask how to support this week', body: 'Ask: "What is one way I can make your week easier or brighter?"' },
    ],
    metrics: [
      { key: 'duration', target: 900, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'TIMER', config: { seconds: 900 } }, { key: 'NOTES' }],
  },
  {
    slug: 'celebrate-a-milestone',
    title: 'Celebrate a Milestone',
    summary: 'Acknowledge a birthday, anniversary, or personal win for someone you care about.',
    categorySlug: 'relationships',
    focusSlugs: ['family', 'friends', 'quality-time'],
    instructions: [
      { title: 'Mark or honor the occasion', body: 'Send a personal message, call, or prepare a small gesture to celebrate their win.' },
      { title: 'Note upcoming milestones', body: 'Check the next two weeks for any birthdays or anniversaries to remember.' },
    ],
    metrics: [{ key: 'completion', target: true, required: true }],
    tools: [{ key: 'CHECKLIST' }, { key: 'NOTES' }],
  },
]

type StarterProgramSeed = {
  slug: string
  title: string
  description: string
  categorySlug: string
  programTypeSlug: string
  focusSlug: string
  durationDays: number
  frequency: { kind: 'DAILY' } | { kind: 'N_PER_WEEK'; n: number }
  generationMode: 'ALL_EACH_DAY' | 'ROTATE'
  activitySlugs: string[]
  placements: { relativeDay: number; activitySlug: string; position: number; localTime: string }[]
}

export const STARTER_PROGRAMS: StarterProgramSeed[] = [
  {
    slug: 'starter-beginner-core-strength',
    title: 'Beginner Core & Strength',
    description: 'A balanced 4-week bodyweight workout building core stability and lower-body strength three days a week.',
    categorySlug: 'fitness',
    programTypeSlug: 'workout',
    focusSlug: 'strength',
    durationDays: 28,
    frequency: { kind: 'N_PER_WEEK', n: 3 },
    generationMode: 'ALL_EACH_DAY',
    activitySlugs: ['warm-up', 'squats', 'push-ups', 'plank', 'glute-bridge', 'cool-down'],
    placements: [1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 24, 26].flatMap((day) => [
      { relativeDay: day, activitySlug: 'warm-up', position: 0, localTime: '07:30' },
      { relativeDay: day, activitySlug: 'squats', position: 1, localTime: '07:35' },
      { relativeDay: day, activitySlug: 'push-ups', position: 2, localTime: '07:45' },
      { relativeDay: day, activitySlug: 'plank', position: 3, localTime: '07:55' },
      { relativeDay: day, activitySlug: 'glute-bridge', position: 4, localTime: '08:00' },
      { relativeDay: day, activitySlug: 'cool-down', position: 5, localTime: '08:10' },
    ]),
  },
  {
    slug: 'starter-daily-mindfulness-reflection',
    title: 'Daily Mindfulness & Reflection',
    description: 'Two calm weeks of morning intention, midday breathing, and evening gratitude.',
    categorySlug: 'wellness',
    programTypeSlug: 'wellness-routine',
    focusSlug: 'mindfulness',
    durationDays: 14,
    frequency: { kind: 'DAILY' },
    generationMode: 'ALL_EACH_DAY',
    activitySlugs: ['morning-routine', 'guided-meditation', 'gratitude-journal'],
    placements: Array.from({ length: 14 }, (_, i) => i + 1).flatMap((day) => [
      { relativeDay: day, activitySlug: 'morning-routine', position: 0, localTime: '08:00' },
      { relativeDay: day, activitySlug: 'guided-meditation', position: 1, localTime: '12:30' },
      { relativeDay: day, activitySlug: 'gratitude-journal', position: 2, localTime: '20:30' },
    ]),
  },
  {
    slug: 'starter-daily-language-study',
    title: 'Daily Language & Study Habit',
    description: 'A 3-week structured study routine pairing active recall flashcards, reading, and speaking practice.',
    categorySlug: 'education',
    programTypeSlug: 'study-program',
    focusSlug: 'languages',
    durationDays: 21,
    frequency: { kind: 'N_PER_WEEK', n: 5 },
    generationMode: 'ALL_EACH_DAY',
    activitySlugs: ['vocabulary-review', 'read-for-20-minutes', 'practice-speaking'],
    placements: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 15, 16, 17, 18, 19].flatMap((day) => [
      { relativeDay: day, activitySlug: 'vocabulary-review', position: 0, localTime: '18:00' },
      { relativeDay: day, activitySlug: 'read-for-20-minutes', position: 1, localTime: '18:15' },
      { relativeDay: day, activitySlug: 'practice-speaking', position: 2, localTime: '18:40' },
    ]),
  },
  {
    slug: 'starter-weekly-savings-budget',
    title: 'Weekly Savings & Budget Routine',
    description: 'A practical 4-week rhythm to build your emergency fund and review spending without stress.',
    categorySlug: 'finance',
    programTypeSlug: 'savings-plan',
    focusSlug: 'emergency-fund',
    durationDays: 28,
    frequency: { kind: 'N_PER_WEEK', n: 2 },
    generationMode: 'ROTATE',
    activitySlugs: ['savings-contribution', 'weekly-budget-review', 'categorize-expenses', 'review-subscriptions'],
    placements: [1, 4, 8, 11, 15, 18, 22, 25].map((day, idx) => ({
      relativeDay: day,
      activitySlug: ['savings-contribution', 'weekly-budget-review', 'categorize-expenses', 'review-subscriptions'][idx % 4]!,
      position: 0,
      localTime: '19:00',
    })),
  },
  {
    slug: 'starter-staying-in-touch',
    title: 'Staying in Touch',
    description: 'Simple, warm weekly habits to call friends, send thoughtful check-ins, and share quality time.',
    categorySlug: 'relationships',
    programTypeSlug: 'relationship-plan',
    focusSlug: 'friends',
    durationDays: 28,
    frequency: { kind: 'N_PER_WEEK', n: 2 },
    generationMode: 'ROTATE',
    activitySlugs: ['send-a-check-in-message', 'call-a-friend', 'plan-quality-time', 'write-a-thank-you-note'],
    placements: [2, 6, 9, 13, 16, 20, 23, 27].map((day, idx) => ({
      relativeDay: day,
      activitySlug: ['send-a-check-in-message', 'call-a-friend', 'plan-quality-time', 'write-a-thank-you-note'][idx % 4]!,
      position: 0,
      localTime: '17:30',
    })),
  },
]

export async function seedDatabase(prisma: PrismaClient = db) {
  // 1. Categories
  const categoryBySlug = new Map<string, string>()
  for (const c of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      create: { id: deterministicUuid(`category:${c.slug}`), slug: c.slug, label: c.label, icon: c.icon, position: c.position },
      update: { label: c.label, icon: c.icon, position: c.position },
    })
    categoryBySlug.set(c.slug, row.id)
  }

  // 2. Focuses (platform-seeded have createdById = null)
  const focusByKey = new Map<string, string>()
  for (const f of FOCUSES) {
    const categoryId = categoryBySlug.get(f.categorySlug)!
    const existing = await prisma.focus.findFirst({ where: { categoryId, slug: f.slug, createdById: null } })
    const row = existing
      ? await prisma.focus.update({ where: { id: existing.id }, data: { label: f.label } })
      : await prisma.focus.create({
          data: { id: deterministicUuid(`focus:${f.categorySlug}:${f.slug}`), categoryId, slug: f.slug, label: f.label, createdById: null },
        })
    focusByKey.set(f.slug, row.id)
  }

  // 3. ProgramTypes & ProgramTypeFocus links
  const programTypeBySlug = new Map<string, string>()
  for (const pt of PROGRAM_TYPES) {
    const categoryId = categoryBySlug.get(pt.categorySlug)!
    const row = await prisma.programType.upsert({
      where: { categoryId_slug: { categoryId, slug: pt.slug } },
      create: {
        id: deterministicUuid(`program-type:${pt.slug}`),
        categoryId,
        slug: pt.slug,
        label: pt.label,
        isFeatured: pt.isFeatured,
        position: pt.position,
      },
      update: {
        label: pt.label,
        isFeatured: pt.isFeatured,
        position: pt.position,
      },
    })
    programTypeBySlug.set(pt.slug, row.id)
    for (const [idx, focusSlug] of pt.focusSlugs.entries()) {
      const focusId = focusByKey.get(focusSlug)!
      await prisma.programTypeFocus.upsert({
        where: { programTypeId_focusId: { programTypeId: row.id, focusId } },
        create: { programTypeId: row.id, focusId, position: idx },
        update: { position: idx },
      })
    }
  }

  // 4. MetricDefinitions
  const metricByKey = new Map<string, string>()
  for (const m of METRIC_DEFINITIONS) {
    const row = await prisma.metricDefinition.upsert({
      where: { key: m.key },
      create: {
        id: deterministicUuid(`metric:${m.key}`),
        key: m.key,
        label: m.label,
        valueType: m.valueType,
        unit: m.unit,
        precision: m.precision,
        aggregation: m.aggregation,
        betterDirection: m.betterDirection,
        validation: m.validation ?? undefined,
      },
      update: {
        label: m.label,
        valueType: m.valueType,
        unit: m.unit,
        precision: m.precision,
        aggregation: m.aggregation,
        betterDirection: m.betterDirection,
        validation: m.validation ?? undefined,
      },
    })
    metricByKey.set(m.key, row.id)
  }

  // 5. ToolDefinitions
  const toolByKey = new Map<string, string>()
  for (const t of TOOL_DEFINITIONS) {
    const row = await prisma.toolDefinition.upsert({
      where: { key: t.key },
      create: {
        id: deterministicUuid(`tool:${t.key}`),
        key: t.key,
        label: t.label,
        componentKey: t.componentKey,
        defaultConfig: t.defaultConfig,
      },
      update: {
        label: t.label,
        componentKey: t.componentKey,
        defaultConfig: t.defaultConfig,
      },
    })
    toolByKey.set(t.key, row.id)
  }

  // 6. AchievementDefinitions
  for (const a of ACHIEVEMENT_DEFINITIONS) {
    await prisma.achievementDefinition.upsert({
      where: { key: a.key },
      create: {
        id: deterministicUuid(`achievement:${a.key}`),
        key: a.key,
        label: a.label,
        description: a.description,
        icon: a.icon,
        ruleKind: a.ruleKind,
        threshold: a.threshold,
        position: a.position,
      },
      update: {
        label: a.label,
        description: a.description,
        icon: a.icon,
        ruleKind: a.ruleKind,
        threshold: a.threshold,
        position: a.position,
      },
    })
  }

  // 7. 81 Seeded Activities with rights-cleared platform MediaAssets, Revisions, Instructions, Metrics, and Tools
  const activityBySlug = new Map<string, { activityId: string; revisionId: string }>()
  for (const act of SEEDED_ACTIVITIES) {
    const categoryId = categoryBySlug.get(act.categorySlug)!
    const activityId = deterministicUuid(`activity:${act.slug}`)
    const revisionId = deterministicUuid(`activity-revision:${act.slug}:1`)

    // Upsert the Activity row first
    const existingAct = await prisma.activity.findUnique({ where: { slug: act.slug } })
    const savedAct = existingAct
      ? await prisma.activity.update({
          where: { id: existingAct.id },
          data: {
            categoryId,
            title: act.title,
            summary: act.summary,
            status: 'PUBLISHED',
            visibility: 'PUBLIC',
          },
        })
      : await prisma.activity.create({
          data: {
            id: activityId,
            slug: act.slug,
            creatorId: null,
            categoryId,
            title: act.title,
            summary: act.summary,
            status: 'PUBLISHED',
            visibility: 'PUBLIC',
          },
        })

    // Sync ActivityFocus join rows
    for (const focusSlug of act.focusSlugs) {
      const focusId = focusByKey.get(focusSlug)!
      await prisma.activityFocus.upsert({
        where: { activityId_focusId: { activityId: savedAct.id, focusId } },
        create: { activityId: savedAct.id, focusId },
        update: {},
      })
    }

    // Upsert Revision 1
    const rev = await prisma.activityRevision.upsert({
      where: { activityId_revisionNumber: { activityId: savedAct.id, revisionNumber: 1 } },
      create: {
        id: revisionId,
        activityId: savedAct.id,
        revisionNumber: 1,
        titleSnapshot: act.title,
        summarySnapshot: act.summary,
        publishedAt: SEEDED_AT,
      },
      update: {
        titleSnapshot: act.title,
        summarySnapshot: act.summary,
        publishedAt: SEEDED_AT,
      },
    })

    // Ensure latestPublishedRevisionId points to rev.id
    if (savedAct.latestPublishedRevisionId !== rev.id) {
      await prisma.activity.update({ where: { id: savedAct.id }, data: { latestPublishedRevisionId: rev.id } })
    }

    // Upsert concise Instructions (with deterministic instructionKey)
    await prisma.instruction.deleteMany({
      where: { activityRevisionId: rev.id, position: { gte: act.instructions.length } },
    })
    for (const [pos, ins] of act.instructions.entries()) {
      const instructionKey = deterministicUuid(`instruction-key:${act.slug}:${pos}`)
      await prisma.instruction.upsert({
        where: { activityRevisionId_position: { activityRevisionId: rev.id, position: pos } },
        create: {
          id: deterministicUuid(`instruction:${act.slug}:${pos}`),
          activityRevisionId: rev.id,
          instructionKey,
          position: pos,
          title: ins.title ?? null,
          body: ins.body,
        },
        update: {
          instructionKey,
          title: ins.title ?? null,
          body: ins.body,
        },
      })
    }

    // Replace Activity-level Metric bindings deterministically
    await prisma.activityMetric.deleteMany({ where: { activityRevisionId: rev.id, instructionId: null } })
    for (const [pos, mb] of act.metrics.entries()) {
      const metricDefinitionId = metricByKey.get(mb.key)!
      await prisma.activityMetric.create({
        data: {
          id: deterministicUuid(`activity-metric:${act.slug}:${mb.key}:${pos}`),
          activityRevisionId: rev.id,
          instructionId: null,
          metricDefinitionId,
          position: pos,
          required: mb.required ?? false,
          defaults: mb.target !== undefined ? { target: mb.target } : undefined,
        },
      })
    }

    // Replace Activity-level Tool bindings deterministically
    await prisma.activityTool.deleteMany({ where: { activityRevisionId: rev.id, instructionId: null } })
    for (const [pos, tb] of act.tools.entries()) {
      const toolDefinitionId = toolByKey.get(tb.key)!
      await prisma.activityTool.create({
        data: {
          id: deterministicUuid(`activity-tool:${act.slug}:${tb.key}:${pos}`),
          activityRevisionId: rev.id,
          instructionId: null,
          toolDefinitionId,
          position: pos,
          config: (tb.config ?? undefined) as any,
        },
      })
    }

    // Rights-cleared platform MediaAsset & attachments (unless textOnly outlier)
    await prisma.mediaAttachment.deleteMany({ where: { activityRevisionId: rev.id } })
    if (!act.textOnly) {
      const photoId = deterministicUuid(`media:photo:${act.slug}`)
      const storageKey = `platform/illustrations/${act.slug}.png`
      await prisma.mediaAsset.upsert({
        where: { id: photoId },
        create: {
          id: photoId,
          ownerId: null,
          type: 'PHOTO',
          originalStorageKey: storageKey,
          mime: 'image/png',
          byteSize: BigInt(24576),
          width: 1200,
          height: 900,
          state: 'READY',
          alt: `${act.title} illustration`,
          license: PLATFORM_LICENSE,
          attribution: PLATFORM_ATTRIBUTION,
          sourceUrl: `https://programs.app/media/platform/illustrations/${act.slug}.png`,
          uploadedAt: SEEDED_AT,
        },
        update: {
          alt: `${act.title} illustration`,
          license: PLATFORM_LICENSE,
          attribution: PLATFORM_ATTRIBUTION,
          state: 'READY',
        },
      })
      await prisma.mediaVariant.upsert({
        where: { mediaId_kind: { mediaId: photoId, kind: 'THUMB' } },
        create: {
          id: deterministicUuid(`media-variant:thumb:${act.slug}`),
          mediaId: photoId,
          kind: 'THUMB',
          storageKey: `platform/illustrations/${act.slug}-thumb.webp`,
          mime: 'image/webp',
          byteSize: BigInt(8192),
          width: 400,
          height: 300,
        },
        update: {},
      })
      await prisma.mediaAttachment.create({
        data: {
          id: deterministicUuid(`attachment:photo:${act.slug}`),
          mediaId: photoId,
          activityRevisionId: rev.id,
          purpose: 'ILLUSTRATION',
          position: 0,
        },
      })

      if (act.hasVideo) {
        const videoId = deterministicUuid(`media:video:${act.slug}`)
        await prisma.mediaAsset.upsert({
          where: { id: videoId },
          create: {
            id: videoId,
            ownerId: null,
            type: 'VIDEO',
            originalStorageKey: `platform/demos/${act.slug}.mp4`,
            mime: 'video/mp4',
            byteSize: BigInt(1_048_576),
            width: 1280,
            height: 720,
            durationMs: 15000,
            state: 'READY',
            alt: `${act.title} demonstration clip`,
            license: PLATFORM_LICENSE,
            attribution: PLATFORM_ATTRIBUTION,
            sourceUrl: `https://programs.app/media/platform/demos/${act.slug}.mp4`,
            uploadedAt: SEEDED_AT,
          },
          update: {
            alt: `${act.title} demonstration clip`,
            license: PLATFORM_LICENSE,
            attribution: PLATFORM_ATTRIBUTION,
            state: 'READY',
          },
        })
        await prisma.mediaVariant.upsert({
          where: { mediaId_kind: { mediaId: videoId, kind: 'STREAM' } },
          create: {
            id: deterministicUuid(`media-variant:stream:${act.slug}`),
            mediaId: videoId,
            kind: 'STREAM',
            storageKey: `platform/demos/${act.slug}-stream.mp4`,
            mime: 'video/mp4',
            byteSize: BigInt(786_432),
            width: 1280,
            height: 720,
          },
          update: {},
        })
        await prisma.mediaVariant.upsert({
          where: { mediaId_kind: { mediaId: videoId, kind: 'POSTER' } },
          create: {
            id: deterministicUuid(`media-variant:poster:${act.slug}`),
            mediaId: videoId,
            kind: 'POSTER',
            storageKey: `platform/demos/${act.slug}-poster.webp`,
            mime: 'image/webp',
            byteSize: BigInt(16_384),
            width: 1280,
            height: 720,
          },
          update: {},
        })
        await prisma.mediaAttachment.create({
          data: {
            id: deterministicUuid(`attachment:video:${act.slug}`),
            mediaId: videoId,
            activityRevisionId: rev.id,
            purpose: 'DEMONSTRATION',
            position: 1,
          },
        })
      }
    }

    activityBySlug.set(act.slug, { activityId: savedAct.id, revisionId: rev.id })
  }

  // 8. 5 Starter Programs (07-PROGRAMS.md §8)
  for (const sp of STARTER_PROGRAMS) {
    const programId = deterministicUuid(`program:${sp.slug}`)
    const versionId = deterministicUuid(`program-version:${sp.slug}:1`)
    const categoryId = categoryBySlug.get(sp.categorySlug)!
    const programTypeId = programTypeBySlug.get(sp.programTypeSlug)!
    const focusId = focusByKey.get(sp.focusSlug)!
    const firstActivityMediaId = deterministicUuid(`media:photo:${sp.activitySlugs[0]!}`)
    const programDayCount = new Set(sp.placements.map((p) => p.relativeDay)).size
    const placementCount = sp.placements.length

    await prisma.program.upsert({
      where: { id: programId },
      create: {
        id: programId,
        creatorId: null,
        categoryId,
        programTypeId,
        focusId,
        title: sp.title,
        description: sp.description,
        coverMediaId: firstActivityMediaId,
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        draftRevision: 1,
      },
      update: {
        categoryId,
        programTypeId,
        focusId,
        title: sp.title,
        description: sp.description,
        coverMediaId: firstActivityMediaId,
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      },
    })

    await prisma.programAccessPolicy.upsert({
      where: { programId },
      create: { programId, accessMode: 'OPEN' },
      update: { accessMode: 'OPEN' },
    })

    await prisma.programStat.upsert({
      where: { programId },
      create: { programId, enrollmentCount: 0, completionRate: 0, rankScore: 10 },
      update: {},
    })

    await prisma.programVersion.upsert({
      where: { programId_versionNumber: { programId, versionNumber: 1 } },
      create: {
        id: versionId,
        programId,
        versionNumber: 1,
        title: sp.title,
        description: sp.description,
        programTypeId,
        focusId,
        durationDays: sp.durationDays,
        frequency: sp.frequency,
        generationMode: sp.generationMode,
        programDayCount,
        placementCount,
        publishedAt: SEEDED_AT,
      },
      update: {
        title: sp.title,
        description: sp.description,
        programTypeId,
        focusId,
        durationDays: sp.durationDays,
        frequency: sp.frequency,
        generationMode: sp.generationMode,
        programDayCount,
        placementCount,
        publishedAt: SEEDED_AT,
      },
    })

    await prisma.program.update({
      where: { id: programId },
      data: { latestPublishedVersionId: versionId },
    })

    for (const [idx, pl] of sp.placements.entries()) {
      const ref = activityBySlug.get(pl.activitySlug)!
      const scheduleItemId = deterministicUuid(`program-schedule-item:${sp.slug}:${idx}`)
      await prisma.programScheduleItem.upsert({
        where: { id: scheduleItemId },
        create: {
          id: scheduleItemId,
          programVersionId: versionId,
          activityId: ref.activityId,
          activityRevisionId: ref.revisionId,
          relativeDay: pl.relativeDay,
          position: pl.position,
          localTime: pl.localTime,
        },
        update: {
          activityId: ref.activityId,
          activityRevisionId: ref.revisionId,
          relativeDay: pl.relativeDay,
          position: pl.position,
          localTime: pl.localTime,
        },
      })
    }
  }

  return {
    categories: CATEGORIES.length,
    focuses: FOCUSES.length,
    programTypes: PROGRAM_TYPES.length,
    metrics: METRIC_DEFINITIONS.length,
    tools: TOOL_DEFINITIONS.length,
    achievements: ACHIEVEMENT_DEFINITIONS.length,
    activities: SEEDED_ACTIVITIES.length,
    starterPrograms: STARTER_PROGRAMS.length,
  }
}

const isMain = Boolean(process.argv[1]?.replace(/\\/g, '/').endsWith('prisma/seed.ts'))
if (isMain) {
  seedDatabase()
    .then((summary) => {
      console.log('Seeded platform catalog:', summary)
    })
    .catch((err) => {
      console.error('Failed to seed platform catalog:', err)
      process.exitCode = 1
    })
    .finally(async () => {
      await db.$disconnect()
    })
}
