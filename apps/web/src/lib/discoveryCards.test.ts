import { describe, expect, it } from 'vitest'
import type { components } from '@project/sdk'
import { activityCard } from './discoveryCards'

type Summary = components['schemas']['ActivitySummary']
const base = {
  id: '00000000-0000-4000-8000-000000000001',
  revisionId: null,
  title: 'Swim at Barton Springs',
  summary: 'Swim in the spring-fed water.',
  durationMinutes: null,
  targetTime: null,
  creator: null,
  categoryId: '00000000-0000-4000-8000-000000000002',
  focusIds: [],
  place: null,
  thumbnailUrl: null,
  instructionCount: 0,
  mediaCount: 0,
  metricLabels: ['Completed'],
  visibility: 'PUBLIC',
  status: 'PUBLISHED',
  isCopy: false,
  isPlatform: true,
} satisfies Summary

describe('activityCard meta', () => {
  it('never shows the completion metric label, which would read as the viewer having finished it', () => {
    expect(activityCard(base, () => null).meta).toBe('Swim in the spring-fed water.')
  })

  it('leads with the suggested Place and city', () => {
    const place = { id: 'p', slug: 'barton-springs', name: 'Barton Springs Pool', kind: 'pool', addressLine: null, locality: 'Austin', region: 'TX', countryCode: 'US', sourceUrl: 'https://example.org', accessNote: null }
    expect(activityCard({ ...base, place, durationMinutes: 45 }, () => null).meta).toBe('Barton Springs Pool, Austin · 45 min')
  })
})
