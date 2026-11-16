import { createElement } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { ProgramCard } from './ProgramCard'

vi.mock('@project/sdk', () => ({
  useProgramPreview: (programId: string) => ({
    data: programId
      ? {
          id: programId,
          title: 'Full Body Foundations',
          description: 'A 4-week structured progression.',
          durationDays: 28,
          frequencyLabel: '3x / week',
          sessionMinutes: 30,
          level: 'BEGINNER',
          enrollmentCount: 42,
          completionRate: 0.85,
          safeActivityOutline: [
            { title: 'Core & Mobility', durationMinutes: 20, dayIndex: 0 },
            { title: 'Lower Body Strength', durationMinutes: 35, dayIndex: 2 },
            { title: 'Upper Body & Conditioning', durationMinutes: 30, dayIndex: 4 },
            { title: 'Active Recovery', durationMinutes: 15, dayIndex: 6 },
          ],
        }
      : null,
    isPending: false,
    isError: false,
  }),
  useProgramVersion: () => ({
    data: { activities: [] },
    isFetching: false,
    isError: false,
  }),
  useActivityPublicMedia: () => ({
    data: { pages: [{ data: [] }] },
    isFetching: false,
    isError: false,
  }),
}))

describe('ProgramCard', () => {
  const baseHero = {
    src: 'https://example.com/cover.jpg',
    alt: 'Cover',
    category: 'custom' as const,
    media: null,
  }

  function renderCard(props: Parameters<typeof ProgramCard>[0]) {
    return renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: '/users/@coach' },
        createElement(ProgramCard, props),
      ),
    )
  }

  it('renders title, hero, meta and description', () => {
    const html = renderCard({
      programId: 'prog-1',
      title: 'Full Body Foundations',
      hero: baseHero,
      meta: 'Approval required',
      href: '/programs/prog-1',
      deferLoading: false,
    })

    expect(html).toContain('Full Body Foundations')
    expect(html).toContain('Approval required')
    expect(html).toContain('href="/programs/prog-1"')
    expect(html).toContain('A 4-week structured progression.')
  })

  it('renders aggregate social metrics (enrolled, active weekly, completion rate)', () => {
    const html = renderCard({
      programId: 'prog-1',
      title: 'Full Body Foundations',
      hero: baseHero,
      deferLoading: false,
      participation: {
        participantCount: 150,
        activeMemberCount: 38,
        friends: [],
        friendCount: 0,
      },
    })

    expect(html).toContain('150')
    expect(html).toContain('Enrolled')
    expect(html).toContain('38')
    expect(html).toContain('Active / wk')
    expect(html).toContain('85%')
    expect(html).toContain('Completed')
  })

  it('renders structured use data (duration, frequency, session minutes, level, activities)', () => {
    const html = renderCard({
      programId: 'prog-1',
      title: 'Full Body Foundations',
      hero: baseHero,
      deferLoading: false,
    })

    expect(html).toContain('4 weeks')
    expect(html).toContain('3x / week')
    expect(html).toContain('30m/session')
    expect(html).toContain('Beginner')
    expect(html).toContain('4 activities')
  })

  it('renders participating connections when present', () => {
    const html = renderCard({
      programId: 'prog-1',
      title: 'Full Body Foundations',
      hero: baseHero,
      deferLoading: false,
      participation: {
        participantCount: 50,
        activeMemberCount: 12,
        friends: [
          {
            id: 'u-1',
            handle: 'alex',
            displayName: 'Alex Rider',
            avatarUrl: null,
            viewerFollows: true,
          },
        ],
        friendCount: 1,
      },
    })

    expect(html).toContain('Alex')
    expect(html).toContain('href="/@alex"')
  })

  it('displays personal enrollment status if libraryEntry is provided', () => {
    const html = renderCard({
      programId: 'prog-1',
      title: 'Full Body Foundations',
      hero: baseHero,
      deferLoading: false,
      libraryEntry: {
        status: 'Active' as const,
      } as any,
    })

    expect(html).toContain('Active')
  })
})
