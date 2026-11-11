import { validateContentPack, type ActivityContent, type ContentPack, type ProgramContent } from '@project/shared'
import { METRIC_DEFINITIONS, TOOL_DEFINITIONS } from '../definitions'
import { assertValidTaxonomy, TAXONOMY } from '../taxonomy'
import { EDUCATION_ACTIVITIES, EDUCATION_PROGRAMS } from './education'
import { FINANCE_ACTIVITIES, FINANCE_PROGRAMS } from './finance'
import { FITNESS_ACTIVITIES, FITNESS_PROGRAMS } from './fitness'
import { RELATIONSHIPS_ACTIVITIES, RELATIONSHIPS_PROGRAMS } from './relationships'
import { WELLNESS_ACTIVITIES, WELLNESS_PROGRAMS } from './wellness'

export const SEEDED_ACTIVITIES: ActivityContent[] = [
  ...FITNESS_ACTIVITIES,
  ...EDUCATION_ACTIVITIES,
  ...WELLNESS_ACTIVITIES,
  ...FINANCE_ACTIVITIES,
  ...RELATIONSHIPS_ACTIVITIES,
]

export const STARTER_PROGRAMS: ProgramContent[] = [
  ...FITNESS_PROGRAMS,
  ...WELLNESS_PROGRAMS,
  ...FINANCE_PROGRAMS,
  ...EDUCATION_PROGRAMS,
  ...RELATIONSHIPS_PROGRAMS,
]

export const SEED_CONTENT_PACK: ContentPack = {
  activities: SEEDED_ACTIVITIES,
  programs: STARTER_PROGRAMS,
}

export function assertValidSeedPack() {
  assertValidTaxonomy()
  const issues = validateContentPack(SEED_CONTENT_PACK, TAXONOMY, {
    knownMetricKeys: METRIC_DEFINITIONS.map((m) => m.key),
    knownToolKeys: TOOL_DEFINITIONS.map((t) => t.key),
  })
  if (issues.length) {
    throw new Error(`Invalid seed content pack:\n${issues.map((i) => `- ${i.path}: ${i.message}`).join('\n')}`)
  }
}

