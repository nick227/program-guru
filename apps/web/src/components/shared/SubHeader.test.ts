import { createElement } from 'react'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { SubHeader, resolveSubHeaderNav } from './SubHeader'
import { HeaderNavMenu } from './HeaderNavMenu'

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

function renderHeaderNav(location: string) {
  return renderToStaticMarkup(
    createElement(
      StaticRouter,
      { location },
      createElement(HeaderNavMenu),
    ),
  )
}

describe('SubHeader & HeaderNavMenu', () => {
  it('resolves active navigation keys from routes', () => {
    expect(resolveSubHeaderNav('/')).toBe('home')
    expect(resolveSubHeaderNav('/calendar')).toBe('calendar')
    expect(resolveSubHeaderNav('/browse')).toBe('community')
    expect(resolveSubHeaderNav('/library')).toBe('programs')
    expect(resolveSubHeaderNav('/programs/new')).toBe('add-program')
    expect(resolveSubHeaderNav('/discover')).toBe('community')
    expect(resolveSubHeaderNav('/settings')).toBeUndefined()
  })

  it.each([
    { route: '/', activeLabel: 'Home' },
    { route: '/calendar', activeLabel: 'Calendar' },
    { route: '/browse', activeLabel: 'Community' },
    { route: '/library', activeLabel: 'Programs' },
  ])(
    'HeaderNavMenu reflects $activeLabel clearly on $route',
    ({ route, activeLabel }) => {
      const html = renderHeaderNav(route)
      expect(html).toContain(`aria-label="Pages menu, current page ${activeLabel}"`)
      expect(html).toContain(`>${activeLabel}</span>`)
    },
  )

  it('omits the visible SubHeader row on top-level pages without breadcrumbs or backTo', () => {
    const html = renderSubHeader('/browse', { title: 'Community', active: 'community' })
    expect(html).toBe('<h1 class="sr-only">Community</h1>')
    expect(html).not.toContain('class="sub-header"')
  })

  it('renders a Back link when backTo is provided', () => {
    const html = renderSubHeader('/browse?pick=program&returnTo=%2Fprograms%2Fnew', {
      title: 'Program Library',
      backTo: '/programs/new',
    })
    expect(html).toContain('Back')
    expect(html).toContain('href="/programs/new"')
    expect(html).toContain('class="sub-header"')
  })

  it('renders breadcrumbs cleanly without repeating workspace navigation on entity pages', () => {
    const html = renderSubHeader('/programs/beginner-strength', {
      breadcrumbs: [
        { label: 'Community', href: '/browse' },
        { label: 'Training', href: '/browse?type=type-1' },
        { label: 'Beginner Strength' },
      ],
      active: 'community',
      returnTo: '/programs/beginner-strength',
    })
    expect(html).toContain('aria-label="Breadcrumb"')
    expect(html).toContain('href="/browse"')
    expect(html).toContain('href="/browse?type=type-1"')
    expect(html).toContain('Beginner Strength')
    expect(html).not.toContain('aria-label="Workspace navigation"')
  })
})
