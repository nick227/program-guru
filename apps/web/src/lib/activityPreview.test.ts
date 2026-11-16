import { describe, expect, it } from 'vitest'
import { distinctSteps, previewHero } from './activityPreview'

const step = (title: string | null, body: string | null) =>
  ({ id: `${title}-${body}`, instructionKey: 'k', position: 0, title, body, media: [], metrics: [], tools: [] }) as never

describe('shared Activity preview rules (MR 3)', () => {
  it('lists steps with text that do not just repeat the summary', () => {
    const steps = [step('Warm up', null), step(null, null), step('Breathe slowly', null), step('Hold', 'for 30s')]
    expect(distinctSteps(steps, 'breathe slowly').map((s) => s.title)).toEqual(['Warm up', 'Hold'])
    expect(distinctSteps(steps, null)).toHaveLength(3)
  })

  it("the Activity's own image wins; a surface image only fills a gap", () => {
    const base = { src: null, category: 'fitness' as const, alt: 'x' }
    expect(previewHero({ ...base, src: '/cover.jpg' }, '/entry.jpg').src).toBe('/cover.jpg')
    expect(previewHero(base, '/entry.jpg').src).toBe('/entry.jpg')
    expect(previewHero(base, null).src).toBeNull()
  })
})
