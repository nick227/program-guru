// The one admin frame: header, section tabs (Content, Users, Membership), resource tabs inside a
// section, and a focused content width. ADMIN only; the server enforces it on every call as well.
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useCurrentUser } from '@project/sdk'
import { Page } from '@/components/ui/Layout'
import { EmptyState } from '@/components/ui/Feedback'
import { cn } from '@/lib/utils'
import type { Resource, SectionKey } from '../types'
import '../admin.css'

export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'content', label: 'Content' },
  { key: 'users', label: 'Users' },
  { key: 'membership', label: 'Membership' },
]

const tab = ({ isActive }: { isActive: boolean }) => cn('admin-tab', isActive && 'admin-tab--active')

/** The section owning the current URL: the resource whose path is the longest prefix of it. */
function currentSection(pathname: string, resources: Resource[]): SectionKey {
  const rest = pathname.replace(/^\/admin\/?/, '')
  const match = [...resources].sort((a, b) => b.path.length - a.path.length).find((r) => rest === r.path || rest.startsWith(`${r.path}/`))
  return match?.section ?? 'content'
}

export function AdminLayout({ resources }: { resources: Resource[] }) {
  const me = useCurrentUser()
  const { pathname } = useLocation()
  const section = currentSection(pathname, resources)
  const tabs = resources.filter((r) => r.section === section && r.list && r.nav !== false)
  const home = (key: SectionKey) => resources.find((r) => r.section === key && r.list && r.nav !== false)!

  if (me.data?.data.role !== 'ADMIN')
    return (
      <Page className="page--focused">
        <EmptyState title="Admin is for administrators" description="Your account does not have access to this area." action={<Link to="/" className="btn btn--outline btn--md">Back to Calendar</Link>} />
      </Page>
    )

  return (
    <Page className="admin">
      <header className="admin-header">
        <div className="flex items-center justify-between gap-4">
          <Link to="/admin" className="admin-header__title">
            Admin
          </Link>
          <Link to="/" className="text-sm text-muted hover:text-text">
            Calendar
          </Link>
        </div>
        <nav aria-label="Admin sections" className="admin-tabs">
          {SECTIONS.map((s) => (
            <NavLink key={s.key} to={s.key === 'content' ? '/admin' : `/admin/${home(s.key).path}`} end={s.key === 'content'} className={() => tab({ isActive: s.key === section })}>
              {s.label}
            </NavLink>
          ))}
        </nav>
        {tabs.length > 1 && (
          <nav aria-label={`${section} views`} className="admin-subtabs">
            {tabs.map((r) => (
              <NavLink key={r.path} to={`/admin/${r.path}`} end className={({ isActive }) => cn('admin-subtab', isActive && 'admin-subtab--active')}>
                {r.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <div className="admin-main">
        <Outlet />
      </div>
    </Page>
  )
}
