// Canonical declarative content & taxonomy contract shared by platform seeds,
// admin content imports, and future AI-assisted authoring.

export const PROGRAM_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS'] as const
export type ProgramLevel = (typeof PROGRAM_LEVELS)[number]

export const SESSION_PRESENTATIONS = ['SEPARATE', 'GROUPED'] as const
export type SessionPresentation = (typeof SESSION_PRESENTATIONS)[number]

export const TOOL_KEYS = ['TIMER', 'COUNTER', 'CHECKLIST', 'NOTES', 'CALCULATOR', 'MEDIA_CAPTURE'] as const
export type ToolKey = (typeof TOOL_KEYS)[number]

export const GENERATION_MODES = ['ALL_EACH_DAY', 'ROTATE'] as const
export type GenerationMode = (typeof GENERATION_MODES)[number]

export const CONTENT_VISIBILITIES = ['PRIVATE', 'UNLISTED', 'PUBLIC'] as const
export type ContentVisibility = (typeof CONTENT_VISIBILITIES)[number]

export type FrequencyRule =
  | { kind: 'DAILY' }
  | { kind: 'WEEKDAYS' }
  | { kind: 'N_PER_WEEK'; n: number }
  | { kind: 'FLEXIBLE' }
  | { kind: 'CUSTOM'; offsets?: number[] }

export type CategoryPalette = {
  from: string
  to: string
  glow: string
  ink: string
  soft: string
}

export type FocusDefinition = {
  slug: string
  label: string
  position?: number
}

export type ProgramTypeDefinition = {
  slug: string
  label: string
  description?: string
  icon?: string
  isFeatured?: boolean
  position?: number
  focuses: string[]
}

export type CategoryDefinition = {
  slug: string
  label: string
  icon: string
  position: number
  palette?: CategoryPalette
  defaultGlyph?: string
  focuses: FocusDefinition[]
  programTypes: ProgramTypeDefinition[]
}

export type TagDefinition = {
  slug: string
  label: string
  group?: string
  position?: number
}

export type CompiledCategory = {
  slug: string
  label: string
  icon: string
  position: number
  palette?: CategoryPalette
  defaultGlyph?: string
}

export type CompiledFocus = {
  categorySlug: string
  slug: string
  label: string
  position: number
}

export type CompiledProgramType = {
  categorySlug: string
  slug: string
  label: string
  description?: string
  icon?: string
  isFeatured: boolean
  position: number
  focusSlugs: string[]
}

export type CompiledTag = {
  slug: string
  label: string
  group: string | null
  position: number
}

export type CompiledTaxonomy = {
  categories: CompiledCategory[]
  focuses: CompiledFocus[]
  programTypes: CompiledProgramType[]
  tags: CompiledTag[]
  palettes: Record<string, CategoryPalette>
  defaultGlyphs: Record<string, string>
}

export type InstructionSpec = {
  title?: string | null
  body: string
}

export type MetricBinding = {
  key: string
  target?: number | string | boolean
  required?: boolean
}

export type ToolBinding = {
  key: ToolKey
  config?: Record<string, unknown>
}

export type ActivityContent = {
  slug: string
  title: string
  summary: string
  categorySlug: string
  focusSlugs: string[]
  durationMinutes?: number | null
  targetTime?: string | null
  frequency?: FrequencyRule | null
  instructions: InstructionSpec[]
  metrics: MetricBinding[]
  tools: ToolBinding[]
  hasVideo?: boolean
  /** Intentional text-only outlier so the UI never assumes every Activity has media (08 §9). */
  textOnly?: boolean
}

export type ProgramPlacement = {
  relativeDay: number
  activitySlug: string
  position: number
  localTime?: string | null
  frequency?: FrequencyRule | null
  targetOverrides?: Record<string, number | string | boolean> | null
}

export type ProgramContent = {
  slug: string
  title: string
  description: string
  categorySlug: string
  programTypeSlug: string
  focusSlug?: string | null
  level?: ProgramLevel
  sessionMinutes?: number | null
  sessionPresentation?: SessionPresentation
  tagSlugs?: string[]
  durationDays: number | null
  frequency: FrequencyRule
  generationMode: GenerationMode
  visibility?: ContentVisibility
  activitySlugs: string[]
  placements: ProgramPlacement[]
}

export type ContentPack = {
  activities: ActivityContent[]
  programs: ProgramContent[]
}

export type ContentIssue = {
  path: string
  message: string
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
export const MAX_MINUTES_PER_DAY = 1440

export function isValidTargetTime(value: string): boolean {
  return HHMM_RE.test(value)
}

export function isValidMinutes(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_MINUTES_PER_DAY
}

/** Ergonomic builder for registering a self-contained Category with its Focuses and ProgramTypes. */
export function defineCategory<T extends CategoryDefinition>(definition: T): T {
  return definition
}

/** Compiles hierarchical Category definitions and Tag definitions into flat lookup collections. */
export function compileTaxonomy(
  definitions: readonly CategoryDefinition[],
  tagDefinitions: readonly TagDefinition[] = [],
): CompiledTaxonomy {
  const categories: CompiledCategory[] = []
  const focuses: CompiledFocus[] = []
  const programTypes: CompiledProgramType[] = []
  const palettes: Record<string, CategoryPalette> = {}
  const defaultGlyphs: Record<string, string> = {}

  let nextTypePos = 1
  for (const cat of definitions) {
    categories.push({
      slug: cat.slug,
      label: cat.label,
      icon: cat.icon,
      position: cat.position,
      ...(cat.palette ? { palette: cat.palette } : {}),
      ...(cat.defaultGlyph ? { defaultGlyph: cat.defaultGlyph } : {}),
    })
    if (cat.palette) palettes[cat.slug] = cat.palette
    if (cat.defaultGlyph) defaultGlyphs[cat.slug] = cat.defaultGlyph

    cat.focuses.forEach((f, idx) => {
      focuses.push({
        categorySlug: cat.slug,
        slug: f.slug,
        label: f.label,
        position: f.position ?? idx + 1,
      })
    })

    for (const pt of cat.programTypes) {
      programTypes.push({
        categorySlug: cat.slug,
        slug: pt.slug,
        label: pt.label,
        ...(pt.description !== undefined ? { description: pt.description } : {}),
        ...(pt.icon !== undefined ? { icon: pt.icon } : {}),
        isFeatured: pt.isFeatured ?? false,
        position: pt.position ?? nextTypePos++,
        focusSlugs: [...pt.focuses],
      })
    }
  }

  const tags: CompiledTag[] = tagDefinitions.map((t, idx) => ({
    slug: t.slug,
    label: t.label,
    group: t.group ?? null,
    position: t.position ?? idx + 1,
  }))

  return { categories, focuses, programTypes, tags, palettes, defaultGlyphs }
}

/** Validates taxonomy definitions before compilation or persistence. */
export function validateTaxonomy(
  definitions: readonly CategoryDefinition[],
  tagDefinitions: readonly TagDefinition[] = [],
): ContentIssue[] {
  const issues: ContentIssue[] = []
  const seenCategories = new Set<string>()
  const seenTypes = new Set<string>()

  definitions.forEach((cat, ci) => {
    const cPath = `categories.${ci}`
    if (!SLUG_RE.test(cat.slug)) issues.push({ path: `${cPath}.slug`, message: `Invalid slug "${cat.slug}"` })
    if (!cat.label.trim()) issues.push({ path: `${cPath}.label`, message: 'Label is required' })
    if (seenCategories.has(cat.slug)) issues.push({ path: `${cPath}.slug`, message: `Duplicate category "${cat.slug}"` })
    seenCategories.add(cat.slug)

    const catFocuses = new Set<string>()
    cat.focuses.forEach((f, fi) => {
      const fPath = `${cPath}.focuses.${fi}`
      if (!SLUG_RE.test(f.slug)) issues.push({ path: `${fPath}.slug`, message: `Invalid focus slug "${f.slug}"` })
      if (!f.label.trim()) issues.push({ path: `${fPath}.label`, message: 'Focus label is required' })
      if (catFocuses.has(f.slug)) issues.push({ path: `${fPath}.slug`, message: `Duplicate focus "${f.slug}" in "${cat.slug}"` })
      catFocuses.add(f.slug)
    })

    cat.programTypes.forEach((pt, pi) => {
      const pPath = `${cPath}.programTypes.${pi}`
      if (!SLUG_RE.test(pt.slug)) issues.push({ path: `${pPath}.slug`, message: `Invalid programType slug "${pt.slug}"` })
      if (!pt.label.trim()) issues.push({ path: `${pPath}.label`, message: 'ProgramType label is required' })
      if (seenTypes.has(pt.slug)) issues.push({ path: `${pPath}.slug`, message: `Duplicate programType "${pt.slug}"` })
      seenTypes.add(pt.slug)

      pt.focuses.forEach((fSlug, fi) => {
        if (!catFocuses.has(fSlug)) {
          issues.push({
            path: `${pPath}.focuses.${fi}`,
            message: `Focus "${fSlug}" is not defined on category "${cat.slug}"`,
          })
        }
      })
    })
  })

  const seenTags = new Set<string>()
  tagDefinitions.forEach((tag, ti) => {
    const tPath = `tags.${ti}`
    if (!SLUG_RE.test(tag.slug)) issues.push({ path: `${tPath}.slug`, message: `Invalid tag slug "${tag.slug}"` })
    if (!tag.label.trim()) issues.push({ path: `${tPath}.label`, message: 'Tag label is required' })
    if (seenTags.has(tag.slug)) issues.push({ path: `${tPath}.slug`, message: `Duplicate tag "${tag.slug}"` })
    seenTags.add(tag.slug)
  })

  return issues
}

export function validateFrequencyRule(
  freq: { kind: string; n?: number | null; offsets?: number[] | null },
  path: string,
  issues: ContentIssue[],
) {
  if (freq.kind === 'N_PER_WEEK') {
    if (freq.n == null || !Number.isInteger(freq.n) || freq.n < 1 || freq.n > 7) {
      issues.push({ path: `${path}.n`, message: 'N_PER_WEEK requires an integer between 1 and 7' })
    }
  } else if (freq.kind === 'CUSTOM' && freq.offsets) {
    if (!freq.offsets.length || freq.offsets.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      issues.push({ path: `${path}.offsets`, message: 'CUSTOM offsets must be integers in 0..6' })
    }
  }
}

/** Validates a declarative ContentPack against a compiled taxonomy and optional metric/tool registries. */
export function validateContentPack(
  pack: ContentPack,
  taxonomy: CompiledTaxonomy,
  opts: { knownMetricKeys?: Iterable<string>; knownToolKeys?: Iterable<string> } = {},
): ContentIssue[] {
  const issues: ContentIssue[] = []
  const categorySet = new Set(taxonomy.categories.map((c) => c.slug))
  const focusKeySet = new Set(taxonomy.focuses.map((f) => `${f.categorySlug}:${f.slug}`))
  const typeBySlug = new Map(taxonomy.programTypes.map((pt) => [pt.slug, pt]))
  const tagSet = new Set(taxonomy.tags.map((t) => t.slug))
  const metricSet = opts.knownMetricKeys ? new Set(opts.knownMetricKeys) : null
  const toolSet = new Set(opts.knownToolKeys ?? TOOL_KEYS)

  const activityBySlug = new Map<string, ActivityContent>()

  pack.activities.forEach((act, ai) => {
    const path = `activities.${ai}`
    if (!SLUG_RE.test(act.slug)) issues.push({ path: `${path}.slug`, message: `Invalid slug "${act.slug}"` })
    if (activityBySlug.has(act.slug)) issues.push({ path: `${path}.slug`, message: `Duplicate activity slug "${act.slug}"` })
    activityBySlug.set(act.slug, act)

    if (!act.title.trim()) issues.push({ path: `${path}.title`, message: 'Title is required' })
    if (!act.summary.trim()) issues.push({ path: `${path}.summary`, message: 'Summary is required' })
    if (!categorySet.has(act.categorySlug)) {
      issues.push({ path: `${path}.categorySlug`, message: `Unknown category "${act.categorySlug}"` })
    }
    if (act.focusSlugs.length === 0 && act.categorySlug !== 'custom') {
      issues.push({ path: `${path}.focusSlugs`, message: 'At least one focus is required' })
    }
    act.focusSlugs.forEach((fSlug, fi) => {
      if (!focusKeySet.has(`${act.categorySlug}:${fSlug}`)) {
        issues.push({ path: `${path}.focusSlugs.${fi}`, message: `Focus "${fSlug}" does not exist in "${act.categorySlug}"` })
      }
    })
    if (act.durationMinutes != null && !isValidMinutes(act.durationMinutes)) {
      issues.push({ path: `${path}.durationMinutes`, message: `durationMinutes must be an integer between 1 and ${MAX_MINUTES_PER_DAY}` })
    }
    if (act.targetTime != null && !isValidTargetTime(act.targetTime)) {
      issues.push({ path: `${path}.targetTime`, message: 'targetTime must be HH:MM (24-hour)' })
    }
    if (act.frequency) validateFrequencyRule(act.frequency, `${path}.frequency`, issues)

    if (act.instructions.length === 0) {
      issues.push({ path: `${path}.instructions`, message: 'At least one instruction step is required' })
    }
    act.instructions.forEach((ins, ii) => {
      if (!ins.body.trim()) issues.push({ path: `${path}.instructions.${ii}.body`, message: 'Instruction body cannot be empty' })
    })

    const seenMetrics = new Set<string>()
    act.metrics.forEach((m, mi) => {
      if (seenMetrics.has(m.key)) issues.push({ path: `${path}.metrics.${mi}.key`, message: `Duplicate metric "${m.key}"` })
      seenMetrics.add(m.key)
      if (metricSet && !metricSet.has(m.key)) issues.push({ path: `${path}.metrics.${mi}.key`, message: `Unknown metric "${m.key}"` })
    })
    act.tools.forEach((t, ti) => {
      if (!toolSet.has(t.key)) issues.push({ path: `${path}.tools.${ti}.key`, message: `Unknown tool "${t.key}"` })
    })
  })

  const seenPrograms = new Set<string>()
  pack.programs.forEach((prog, pi) => {
    const path = `programs.${pi}`
    if (!SLUG_RE.test(prog.slug)) issues.push({ path: `${path}.slug`, message: `Invalid slug "${prog.slug}"` })
    if (seenPrograms.has(prog.slug)) issues.push({ path: `${path}.slug`, message: `Duplicate program slug "${prog.slug}"` })
    seenPrograms.add(prog.slug)

    if (!prog.title.trim()) issues.push({ path: `${path}.title`, message: 'Title is required' })
    if (!prog.description.trim()) issues.push({ path: `${path}.description`, message: 'Description is required' })
    if (!categorySet.has(prog.categorySlug)) {
      issues.push({ path: `${path}.categorySlug`, message: `Unknown category "${prog.categorySlug}"` })
    }
    const pt = typeBySlug.get(prog.programTypeSlug)
    if (!pt) {
      issues.push({ path: `${path}.programTypeSlug`, message: `Unknown programType "${prog.programTypeSlug}"` })
    } else if (pt.categorySlug !== prog.categorySlug) {
      issues.push({
        path: `${path}.programTypeSlug`,
        message: `ProgramType "${prog.programTypeSlug}" belongs to "${pt.categorySlug}", not "${prog.categorySlug}"`,
      })
    }
    if (prog.focusSlug) {
      if (!focusKeySet.has(`${prog.categorySlug}:${prog.focusSlug}`)) {
        issues.push({ path: `${path}.focusSlug`, message: `Focus "${prog.focusSlug}" does not exist in "${prog.categorySlug}"` })
      } else if (pt && pt.focusSlugs.length > 0 && !pt.focusSlugs.includes(prog.focusSlug)) {
        issues.push({ path: `${path}.focusSlug`, message: `Focus "${prog.focusSlug}" is not offered on "${prog.programTypeSlug}"` })
      }
    }
    if (prog.level && !PROGRAM_LEVELS.includes(prog.level)) {
      issues.push({ path: `${path}.level`, message: `Invalid program level "${prog.level}"` })
    }
    if (prog.sessionPresentation && !SESSION_PRESENTATIONS.includes(prog.sessionPresentation)) {
      issues.push({ path: `${path}.sessionPresentation`, message: `Invalid sessionPresentation "${prog.sessionPresentation}"` })
    }
    if (prog.sessionMinutes != null && !isValidMinutes(prog.sessionMinutes)) {
      issues.push({ path: `${path}.sessionMinutes`, message: `sessionMinutes must be an integer between 1 and ${MAX_MINUTES_PER_DAY}` })
    }
    (prog.tagSlugs ?? []).forEach((tagSlug, ti) => {
      if (!tagSet.has(tagSlug)) issues.push({ path: `${path}.tagSlugs.${ti}`, message: `Unknown tag "${tagSlug}"` })
    })
    if (prog.durationDays != null && (!Number.isInteger(prog.durationDays) || prog.durationDays <= 0)) {
      issues.push({ path: `${path}.durationDays`, message: 'durationDays must be null or a positive integer' })
    }
    validateFrequencyRule(prog.frequency, `${path}.frequency`, issues)

    const declaredSlugs = new Set(prog.activitySlugs)
    if (prog.activitySlugs.length === 0) {
      issues.push({ path: `${path}.activitySlugs`, message: 'Program must declare at least one activity' })
    }
    prog.activitySlugs.forEach((aSlug, ai) => {
      if (!activityBySlug.has(aSlug)) {
        issues.push({ path: `${path}.activitySlugs.${ai}`, message: `Referenced activity "${aSlug}" is missing from pack` })
      }
    })
    if (prog.placements.length === 0) {
      issues.push({ path: `${path}.placements`, message: 'Program must contain at least one placement' })
    }
    prog.placements.forEach((pl, pli) => {
      const plPath = `${path}.placements.${pli}`
      if (!declaredSlugs.has(pl.activitySlug)) {
        issues.push({ path: `${plPath}.activitySlug`, message: `Placement activity "${pl.activitySlug}" is not listed in activitySlugs` })
      }
      if (!Number.isInteger(pl.relativeDay) || pl.relativeDay < 1) {
        issues.push({ path: `${plPath}.relativeDay`, message: 'relativeDay must be >= 1' })
      } else if (prog.durationDays != null && pl.relativeDay > prog.durationDays) {
        issues.push({ path: `${plPath}.relativeDay`, message: `relativeDay ${pl.relativeDay} exceeds durationDays ${prog.durationDays}` })
      }
      if (pl.localTime != null && !isValidTargetTime(pl.localTime)) {
        issues.push({ path: `${plPath}.localTime`, message: 'localTime must be HH:MM (24-hour)' })
      }
      if (pl.frequency) validateFrequencyRule(pl.frequency, `${plPath}.frequency`, issues)
      if (pl.targetOverrides) {
        for (const [k, v] of Object.entries(pl.targetOverrides)) {
          if (metricSet && !metricSet.has(k)) {
            issues.push({ path: `${plPath}.targetOverrides.${k}`, message: `Unknown metric "${k}" in targetOverrides` })
          }
          if (typeof v === 'number' && !Number.isFinite(v)) {
            issues.push({ path: `${plPath}.targetOverrides.${k}`, message: 'targetOverrides value must be finite' })
          }
        }
      }
    })
  })

  return issues
}

