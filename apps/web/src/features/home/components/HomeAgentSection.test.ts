import { createElement } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { HomeAgentSection, type HomeAgentSectionProps } from './HomeAgentSection'
import type { AssistantTurn, DiscoveryState } from '../engine/types'
import { groupAction } from '@/lib/joinEligibility'
import { canSuggestNewProgram } from '../engine/programEligibility'

vi.mock('@project/sdk', () => ({
  useActivityParticipation: () => ({
    data: null,
    isPending: false,
  }),
  useCategories: () => ({
    data: [],
  }),
}))

describe('HomeAgentSection', () => {
  const dummyTurn: AssistantTurn = {
    nodeId: 'opening',
    question: 'Find something worth doing today.',
    contextLine: 'Choose a direction to explore.',
    choices: [
      {
        id: 'start-now',
        label: 'Start now',
        variant: 'primary',
        effect: { type: 'execute', action: { type: 'open_activity', activityId: 'act-1' } },
      },
      {
        id: 'explore',
        label: 'Explore more',
        variant: 'secondary',
        effect: { type: 'transition', nodeId: 'now_time' },
      },
    ],
  }

  const dummyState: DiscoveryState = {
    excludedIds: [],
  }

  const baseProps: HomeAgentSectionProps = {
    turn: dummyTurn,
    discoveryState: dummyState,
    previewTarget: null,
    executionItemId: null,
    isSignedIn: true,
    todayIso: '2026-11-16',
    expanded: false,
    onToggleExpanded: vi.fn(),
    onSelectStartingAction: vi.fn(),
    canGoBack: false,
    loading: false,
    actionPending: false,
    onChoice: vi.fn(),
    onClearFilter: vi.fn(),
    onPreview: vi.fn(),
    onClosePreview: vi.fn(),
    onCloseExecution: vi.fn(),
    onExecutionCompleted: vi.fn(),
    onNextAfterExecution: vi.fn(),
    onOpenOccurrencePage: vi.fn(),
    onCardAction: vi.fn(),
    onBack: vi.fn(),
    onReset: vi.fn(),
    showReset: false,
  }

  it('renders the compact state with 3 starting actions and Try it button', () => {
    const html = renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: '/' },
        createElement(HomeAgentSection, { ...baseProps, expanded: false }),
      ),
    )

    expect(html).toContain('Home Agent')
    expect(html).toContain('What sounds good right now?')
    expect(html).toContain('Try it')
    expect(html).toContain('Do something now')
    expect(html).toContain('Find something new')
    expect(html).toContain('Continue what I&#x27;ve started')
    // Active turn question should NOT appear while compact
    expect(html).not.toContain('Find something worth doing today.')
  })

  it('renders the expanded state with turn question, context, choices, and Minimize button', () => {
    const html = renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: '/' },
        createElement(HomeAgentSection, { ...baseProps, expanded: true }),
      ),
    )

    expect(html).toContain('Home Agent')
    expect(html).toContain('Minimize')
    expect(html).toContain('Find something worth doing today.')
    expect(html).toContain('Choose a direction to explore.')
    expect(html).toContain('Start now')
    expect(html).toContain('Explore more')
  })

  it('renders Start over reset button when showReset is true in expanded state', () => {
    const html = renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: '/' },
        createElement(HomeAgentSection, { ...baseProps, expanded: true, showReset: true }),
      ),
    )

    expect(html).toContain('Start over')
  })

  it('renders filter chips when memory filters are active in expanded state', () => {
    const html = renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: '/' },
        createElement(HomeAgentSection, {
          ...baseProps,
          expanded: true,
          turn: { ...dummyTurn, nodeId: 'now_result' },
          discoveryState: {
            ...dummyState,
            categoryName: 'Fitness',
            maxMinutes: 30,
          },
        }),
      ),
    )

    expect(html).toContain('Fitness')
    expect(html).toContain('30 min')
  })

  describe('Eligibility and state rules', () => {
    it('never suggests joining a program the viewer already owns', () => {
      const ownedProgram = {
        id: 'prog-1',
        title: 'Owned Program',
        viewerAccess: 'OWNER' as const,
      } as any

      const signals = {
        isSignedIn: true,
        knownProgramIds: [],
      }

      expect(canSuggestNewProgram(ownedProgram, signals)).toBe(false)
    })

    it('never suggests joining a program already in the viewer library', () => {
      const enrolledProgram = {
        id: 'prog-2',
        title: 'Enrolled Program',
        viewerAccess: 'GRANTED' as const,
      } as any

      const signals = {
        isSignedIn: true,
        knownProgramIds: ['prog-2'],
      }

      expect(canSuggestNewProgram(enrolledProgram, signals)).toBe(false)
    })

    it('allows suggesting a program the viewer does not own and has not joined', () => {
      const freshProgram = {
        id: 'prog-3',
        title: 'New Program',
        viewerAccess: 'PREVIEW' as const,
      } as any

      const signals = {
        isSignedIn: true,
        knownProgramIds: ['prog-1'],
      }

      expect(canSuggestNewProgram(freshProgram, signals)).toBe(true)
    })

    it('correctly distinguishes group action: join vs open (already a member)', () => {
      const openGroup = {
        viewerIsMember: false,
        joinPolicy: 'OPEN',
      }
      expect(groupAction(openGroup)).toBe('join')

      const memberGroup = {
        viewerIsMember: true,
        joinPolicy: 'OPEN',
      }
      expect(groupAction(memberGroup)).toBe('open')
    })
  })
})

