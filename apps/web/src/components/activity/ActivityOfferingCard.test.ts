import { createElement } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { ActivityOfferingCard } from './ActivityOfferingCard'
import type { components } from '@project/sdk'

vi.mock('@project/sdk', () => ({
  useActivityParticipation: (id: string) => ({
    data: id
      ? {
          activityId: id,
          participants: { band: 'COUNT' as const, count: 18 },
          avatars: [
            {
              id: 'u-1',
              handle: 'sarah',
              displayName: 'Sarah Connor',
              avatarUrl: null,
            },
          ],
          shared: {
            activeNow: 2,
            going: 14,
            nextGathering: {
              id: 'g-1',
              localDate: '2026-11-20',
              localTime: '19:00',
              lookingFor: 'Casual games',
            } as any,
          },
          viewer: null,
        }
      : null,
    isPending: false,
    isError: false,
  }),
}))

describe('ActivityOfferingCard', () => {
  const baseHero = {
    src: 'https://example.com/chess.jpg',
    alt: 'Chess',
    category: 'custom' as const,
    media: null,
  }

  const sampleActivity: components['schemas']['ActivitySummary'] = {
    id: 'act-1',
    revisionId: 'rev-1',
    title: 'Friday Night Chess Meetup',
    summary: 'Casual blitz and classical games over coffee.',
    durationMinutes: 120,
    targetTime: '19:00',
    frequency: { kind: 'N_PER_WEEK', n: 1 },
    creator: null,
    categoryId: 'cat-1',
    focusIds: [],
    place: {
      id: 'pl-1',
      slug: 'houndstooth-coffee',
      name: 'Houndstooth Coffee',
      kind: 'COMMERCIAL',
      locality: 'Austin',
      addressLine: '401 Congress Ave',
      region: 'TX',
      postalCode: '78701',
      countryCode: 'US',
      sourceUrl: null,
      accessNote: null,
      isActive: true,
    },
    thumbnailUrl: null,
    instructionCount: 0,
    mediaCount: 3,
    metricLabels: [],
    visibility: 'PUBLIC',
    status: 'PUBLISHED',
    isCopy: false,
    isPlatform: false,
  }

  function renderCard(props: Parameters<typeof ActivityOfferingCard>[0]) {
    return renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: '/users/@houndstooth' },
        createElement(ActivityOfferingCard, props),
      ),
    )
  }

  it('renders title, location, duration, and summary', () => {
    const html = renderCard({
      activity: sampleActivity,
      hero: baseHero,
      href: '/activities/act-1',
    })

    expect(html).toContain('Friday Night Chess Meetup')
    expect(html).toContain('Houndstooth Coffee')
    expect(html).toContain('Austin')
    expect(html).toContain('120m')
    expect(html).toContain('Casual blitz and classical games over coffee.')
    expect(html).toContain('Recurring')
  })

  it('renders next scheduled occurrence date and time', () => {
    const html = renderCard({
      activity: sampleActivity,
      hero: baseHero,
    })

    expect(html).toContain('Next:')
    expect(html).toContain('at 19:00')
  })

  it('renders attendee counts and active participants badge', () => {
    const html = renderCard({
      activity: sampleActivity,
      hero: baseHero,
    })

    expect(html).toContain('14 participants')
    expect(html).toContain('2 active now')
    expect(html).toContain('href="/@sarah"')
  })
})
