import { describe, expect, it } from 'vitest'
import { resolveActivityCategory, CATEGORY_DEFINITIONS } from './activityCategory'

describe('activityCategory resolution', () => {
  it('correctly maps explicit categories', () => {
    expect(resolveActivityCategory('Random Title', '', 'fitness')).toBe('fitness')
    expect(resolveActivityCategory('Random Title', '', 'wellness')).toBe('wellness')
    expect(resolveActivityCategory('Random Title', '', 'education')).toBe('education')
    expect(resolveActivityCategory('Random Title', '', 'finance')).toBe('finance')
    expect(resolveActivityCategory('Random Title', '', 'relationships')).toBe('relationships')
  })

  it('infers category from activity and program title keywords', () => {
    // Fitness
    expect(resolveActivityCategory('Heavy Squat 5x5', 'Iron Program')).toBe('fitness')
    expect(resolveActivityCategory('Trail Run & Cardio', '')).toBe('fitness')
    expect(resolveActivityCategory('Mobility & Stretching', '')).toBe('fitness')

    // Wellness
    expect(resolveActivityCategory('Morning Meditation', 'Zen Routine')).toBe('wellness')
    expect(resolveActivityCategory('Box Breathwork', '')).toBe('wellness')
    expect(resolveActivityCategory('Yoga Flow', '')).toBe('wellness')

    // Education
    expect(resolveActivityCategory('Spanish Lesson 7', 'Language Journey')).toBe('education')
    expect(resolveActivityCategory('Read Ch. 4', 'Book Club')).toBe('education')
    expect(resolveActivityCategory('Guitar Practice', 'Music Theory')).toBe('education')

    // Finance
    expect(resolveActivityCategory('Budget Check', 'Financial Health')).toBe('finance')
    expect(resolveActivityCategory('Spending Review', '')).toBe('finance')

    // Relationships
    expect(resolveActivityCategory('Team Sync', 'Company')).toBe('relationships')
    expect(resolveActivityCategory('Group Coffee', '')).toBe('relationships')

    // Fallback
    expect(resolveActivityCategory('Walk the dog', '')).toBe('custom')
  })

  it('defines all 6 canonical categories', () => {
    expect(Object.keys(CATEGORY_DEFINITIONS)).toEqual([
      'fitness',
      'wellness',
      'education',
      'finance',
      'relationships',
      'custom',
    ])
  })

  it('maps new Domains to an existing visual family and unknown slugs to keyword/custom fallback', () => {
    expect(resolveActivityCategory('Random Title', '', 'music')).toBe('custom')
    expect(resolveActivityCategory('Random Title', '', 'outdoors-nature')).toBe('wellness')
    expect(resolveActivityCategory('Random Title', '', 'home-community')).toBe('relationships')
    expect(resolveActivityCategory('Random Title', '', 'not-a-domain')).toBe('custom')
  })
})

