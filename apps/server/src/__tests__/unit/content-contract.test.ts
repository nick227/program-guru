import { describe, expect, it } from 'vitest'
import { compileTaxonomy, defineCategory, validateContentPack, validateTaxonomy } from '@project/shared'
import { CATEGORY_DEFINITIONS, METRIC_DEFINITIONS, SEED_CONTENT_PACK, TAG_DEFINITIONS, TAXONOMY, TOOL_DEFINITIONS } from '@project/db/prisma/seed'
import { changed } from '@project/db/prisma/seed/utils'

describe('declarative content contract & taxonomy', () => {
  it('validates the platform taxonomy and curated 5-program seed pack without issues', () => {
    expect(validateTaxonomy(CATEGORY_DEFINITIONS, TAG_DEFINITIONS)).toEqual([])
    const issues = validateContentPack(SEED_CONTENT_PACK, TAXONOMY, {
      knownMetricKeys: METRIC_DEFINITIONS.map((m) => m.key),
      knownToolKeys: TOOL_DEFINITIONS.map((t) => t.key),
    })
    expect(issues).toEqual([])
    expect(SEED_CONTENT_PACK.programs).toHaveLength(15)
    expect(SEED_CONTENT_PACK.activities).toHaveLength(19)
  })

  it('supports rapid category registration with scoped focuses and reports cross-category errors', () => {
    const creativity = defineCategory({
      slug: 'creativity',
      label: 'Creativity',
      icon: 'palette',
      position: 10,
      focuses: [{ slug: 'fundamentals', label: 'Fundamentals' }],
      programTypes: [{ slug: 'creative-practice', label: 'Creative Practice', focuses: ['fundamentals', 'missing-focus'] }],
    })
    const taxIssues = validateTaxonomy([creativity], [{ slug: 'quick-win', label: 'Quick Win', group: 'style' }])
    expect(taxIssues).toEqual([
      { path: 'categories.0.programTypes.0.focuses.1', message: 'Focus "missing-focus" is not defined on category "creativity"' },
    ])

    const compiled = compileTaxonomy(
      [
        defineCategory({
          slug: 'creativity',
          label: 'Creativity',
          icon: 'palette',
          position: 1,
          focuses: [{ slug: 'writing', label: 'Writing' }],
          programTypes: [{ slug: 'writing-habit', label: 'Writing Habit', focuses: ['writing'] }],
        }),
      ],
      [{ slug: 'quick-win', label: 'Quick Win', group: 'style' }],
    )

    const packIssues = validateContentPack(
      {
        activities: [
          {
            slug: 'freewrite',
            title: 'Freewrite',
            summary: 'Ten minutes of continuous writing.',
            categorySlug: 'creativity',
            focusSlugs: ['writing'],
            durationMinutes: 10,
            targetTime: '25:00',
            instructions: [{ body: 'Write without editing.' }],
            metrics: [{ key: 'duration', target: 600, required: true }],
            tools: [{ key: 'TIMER' }],
          },
        ],
        programs: [
          {
            slug: 'daily-writing',
            title: 'Daily Writing',
            description: 'Build a daily writing habit.',
            categorySlug: 'creativity',
            programTypeSlug: 'writing-habit',
            focusSlug: 'writing',
            tagSlugs: ['unknown-tag'],
            sessionPresentation: 'GROUPED',
            durationDays: 7,
            frequency: { kind: 'DAILY' },
            generationMode: 'ALL_EACH_DAY',
            activitySlugs: ['freewrite'],
            placements: [{ relativeDay: 10, activitySlug: 'freewrite', position: 0, targetOverrides: { missingMetric: 10 } }],
          },
        ],
      },
      compiled,
      { knownMetricKeys: ['duration'], knownToolKeys: ['TIMER'] },
    )
    expect(packIssues).toEqual([
      { path: 'activities.0.targetTime', message: 'targetTime must be HH:MM (24-hour)' },
      { path: 'programs.0.tagSlugs.0', message: 'Unknown tag "unknown-tag"' },
      { path: 'programs.0.placements.0.relativeDay', message: 'relativeDay 10 exceeds durationDays 7' },
      { path: 'programs.0.placements.0.targetOverrides.missingMetric', message: 'Unknown metric "missingMetric" in targetOverrides' },
    ])
  })

  it('detects structural changes cleanly including nested JSON frequency rules', () => {
    expect(changed({ title: 'Squats', frequency: { kind: 'N_PER_WEEK', n: 3 } }, { title: 'Squats', frequency: { n: 3, kind: 'N_PER_WEEK' } })).toBe(false)
    expect(changed({ title: 'Squats', frequency: { kind: 'N_PER_WEEK', n: 3 } }, { title: 'Squats', frequency: { kind: 'N_PER_WEEK', n: 4 } })).toBe(true)
  })
})

