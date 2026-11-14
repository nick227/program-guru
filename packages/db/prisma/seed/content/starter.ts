// Maps the raw editorial starter catalog (seed/starter/*.json, 08-ACTIVITIES §9a) onto the declarative
// content contract. Only fields the schema already holds are mapped; dependencies become relative-day
// order, and participation, scheduleMode, policy and editorial notes stay in the raw files.
import type { ActivityContent, FrequencyRule, ProgramContent, ProgramPlacement } from '@project/shared'
import catalog from '../starter/catalog.json'
import examples from '../starter/examples.json'

/** Editorial Domain slug → stored `Category.slug` (02-DOMAIN §2). Unlisted slugs are stored as-is. */
export const DOMAIN_SLUG_ALIASES: Record<string, string> = {
  'fitness-sports': 'fitness',
  'health-wellness': 'wellness',
  'work-finance': 'finance',
  social: 'relationships',
  learning: 'education',
}
export const storedDomainSlug = (editorial: string) => DOMAIN_SLUG_ALIASES[editorial] ?? editorial

/**
 * Program Type for a starter Program: the generated general type of a new Domain, or an existing broad
 * type for the five original Domains (whose types offer the starter Categories).
 */
const EXISTING_DOMAIN_PROGRAM_TYPES: Record<string, string> = {
  fitness: 'workout',
  wellness: 'wellness-routine',
  finance: 'budget-routine',
  relationships: 'shared-activity-plan',
  education: 'reading-plan',
}
const programTypeFor = (categorySlug: string) => EXISTING_DOMAIN_PROGRAM_TYPES[categorySlug] ?? `${categorySlug}-program`

type RawInstruction = { order: number; title: string; body: string }
type RawActivity = {
  id: string
  slug: string
  title: string
  description: string
  domain: string
  category: string
  recurrence?: { mode: string; suggestedRule: string | null }
  instructions: RawInstruction[]
}
type RawProgram = {
  id: string
  title: string
  description: string
  domain: string
  category: string
  activityIds: string[]
  dependencies: { before: string; after: string }[]
}

export const STARTER_CATALOG = catalog as { domains: { slug: string; label: string; categories: { slug: string; label: string }[] }[] }
const RAW_ACTIVITIES = examples.activities as RawActivity[]
const RAW_PROGRAMS = examples.programs as RawProgram[]

/** Only recurrence wording that is a real FrequencyDto becomes `frequency`; the rest stays editorial. */
function suggestedFrequency(r: RawActivity['recurrence']): FrequencyRule | null {
  if (r?.mode !== 'suggested') return null
  if (r.suggestedRule === 'daily') return { kind: 'DAILY' }
  if (r.suggestedRule === 'weekly') return { kind: 'N_PER_WEEK', n: 1 }
  return null
}

const slugById = new Map(RAW_ACTIVITIES.map((a) => [a.id, a.slug]))

export const STARTER_ACTIVITIES: ActivityContent[] = RAW_ACTIVITIES.map((a) => ({
  slug: a.slug,
  title: a.title,
  summary: a.description,
  categorySlug: storedDomainSlug(a.domain),
  focusSlugs: [a.category],
  frequency: suggestedFrequency(a.recurrence),
  instructions: [...a.instructions].sort((x, y) => x.order - y.order).map((i) => ({ title: i.title, body: i.body })),
  metrics: [{ key: 'completion', target: true, required: true }],
  tools: [],
}))

/**
 * Relative day for each Activity from the Program's listed order and its editorial dependencies: an
 * Activity runs the day after the latest Activity it depends on, and never before the Activity listed
 * ahead of it; otherwise it shares that day. Order within a day follows the listed order. No dependency
 * data is stored.
 */
export function dependencyPlacements(program: Pick<RawProgram, 'id' | 'activityIds' | 'dependencies'>): ProgramPlacement[] {
  const index = new Map(program.activityIds.map((id, i) => [id, i]))
  for (const d of program.dependencies) {
    if (index.get(d.before)! >= index.get(d.after)!) {
      throw new Error(`Starter Program ${program.id} lists ${d.after} before its dependency ${d.before}`)
    }
  }
  const day = new Map<string, number>()
  let previous = 1
  const perDay = new Map<number, number>()
  return program.activityIds.map((id) => {
    const befores = program.dependencies.filter((d) => d.after === id).map((d) => day.get(d.before)! + 1)
    const relativeDay = Math.max(previous, ...befores)
    day.set(id, relativeDay)
    previous = relativeDay
    const position = perDay.get(relativeDay) ?? 0
    perDay.set(relativeDay, position + 1)
    return { relativeDay, activitySlug: slugById.get(id)!, position }
  })
}

export const STARTER_CATALOG_PROGRAMS: ProgramContent[] = RAW_PROGRAMS.map((p) => {
  const categorySlug = storedDomainSlug(p.domain)
  const placements = dependencyPlacements(p)
  return {
    slug: `starter-${p.id.replace(/^seed-program-/, '')}`,
    title: p.title,
    description: p.description,
    categorySlug,
    programTypeSlug: programTypeFor(categorySlug),
    focusSlug: p.category,
    durationDays: Math.max(...placements.map((pl) => pl.relativeDay)),
    frequency: { kind: 'FLEXIBLE' },
    generationMode: 'ALL_EACH_DAY',
    visibility: 'PUBLIC',
    activitySlugs: p.activityIds.map((id) => slugById.get(id)!),
    placements,
  }
})
