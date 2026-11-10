import { createElement } from 'react'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { SubHeader, resolveSubHeaderNav } from './SubHeader'

function renderSubHeader(
  location: string,
  props: {
    title?: string
    breadcrumbs?: { label: string; href?: string }[]
    active?: 'calendar' | 'community' | 'programs' | 'add-program'
    returnTo?: string
    backTo?: string
  },
) {
  return renderToStaticMarkup(
    createElement(
      StaticRouter,
      { location },
      createElement(SubHeader, props),
    ),
  )
}

describe('SubHeader', () => {
  it('resolves active navigation keys from routes', () => {
    expect(resolveSubHeaderNav('/')).toBe('calendar')
    expect(resolveSubHeaderNav('/browse')).toBe('community')
    expect(resolveSubHeaderNav('/library')).toBe('programs')
    expect(resolveSubHeaderNav('/programs/new')).toBe('add-program')
    expect(resolveSubHeaderNav('/discover')).toBe('add-program')
    expect(resolveSubHeaderNav('/settings')).toBeUndefined()
  })

  it.each([
    { route: '/', title: 'Calendar', activeLabel: 'Calendar', href: '/' },
    { route: '/browse', title: 'Program Library', activeLabel: 'Community', href: '/browse' },
    { route: '/library', title: 'My Programs', activeLabel: 'Programs', href: '/library' },
  ])(
    'renders all four actions in consistent order and marks $activeLabel active on $route',
    ({ route, title, activeLabel, href }) => {
      const html = renderSubHeader(route, { title, returnTo: route })
      const labels = [...html.matchAll(/aria-label="(Calendar|Community|Programs|Add Program)"/g)].map(
        (m) => m[1],
      )
      expect(labels).toEqual(['Calendar', 'Community', 'Programs', 'Add Program'])

      const labelSpans = [...html.matchAll(/class="sub-header__label">([^<]+)</g)].map((m) => m[1])
      expect(labelSpans).toEqual(['Calendar', 'Community', 'Programs', 'Add Program'])

      const activeMatches = [...html.matchAll(/aria-current="page"/g)]
      expect(activeMatches).toHaveLength(1)
      expect(html).toContain(`aria-label="${activeLabel}" aria-current="page"`)
      expect(html).toContain(`aria-current="page" class="sub-header__btn sub-header__btn--nav sub-header__btn--active"`)
      expect(html).toContain(`href="${href}"`)
    },
  )

  it('renders a Back link instead of nav buttons when backTo is provided', () => {
    const html = renderSubHeader('/browse?pick=program&returnTo=%2Fprograms%2Fnew', {
      title: 'Program Library',
      backTo: '/programs/new',
    })
    expect(html).toContain('Back')
    expect(html).toContain('href="/programs/new"')
    expect(html).not.toContain('aria-label="Workspace navigation"')
  })

  it('renders breadcrumbs alongside the persistent 4-action SubHeader on entity pages', () => {
    const html = renderSubHeader('/programs/beginner-strength', {
      breadcrumbs: [
        { label: 'Browse', href: '/browse' },
        { label: 'Training', href: '/browse?type=t1' },
        { label: 'Beginner Strength' },
      ],
      active: 'community',
      returnTo: '/programs/beginner-strength',
    })
    expect(html).toContain('aria-label="Breadcrumb"')
    expect(html).toContain('href="/browse"')
    expect(html).toContain('href="/browse?type=t1"')
    expect(html).toContain('Beginner Strength')
    expect(html).toContain('aria-label="Community" aria-current="page"')
    expect(html).toContain('aria-label="Workspace navigation"')
  })
})
