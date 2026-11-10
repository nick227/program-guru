// The admin resource registry: the one list of resources, and the routes generated from it.
// Adding a resource = define it in resources/ and add it here. See docs/admin-resources.md.
import { Route, Routes, useParams } from 'react-router-dom'
import { EmptyState } from '@/components/ui/Feedback'
import { useDocumentTitle } from '@/lib/title'
import { AdminLayout } from './components/AdminLayout'
import { ResourceCreate, ResourceEditor } from './components/ResourceEditor'
import { ResourceImport } from './components/ResourceImport'
import { ResourceTable } from './components/ResourceTable'
import { activities } from './resources/activities'
import { audit } from './resources/audit'
import { content } from './resources/content'
import { grants, prices, purchases, subscriptions } from './resources/membership'
import { contributions, reports } from './resources/moderation'
import { programs } from './resources/programs'
import { users } from './resources/users'
import type { Resource } from './types'

/** Order is navigation order within each section; the first listed resource is the section's home. */
export const resources: Resource[] = [content, programs, activities, users, audit, reports, contributions, grants, subscriptions, purchases, prices]

function ListPage({ resource }: { resource: Resource }) {
  useDocumentTitle(`Admin · ${resource.label}`)
  return (
    <div className="space-y-4">
      <h1 className="sr-only">{resource.label}</h1>
      <ResourceTable resource={resource} urlState />
    </div>
  )
}

/**
 * Every page is keyed by its resource (and record): resources declare different numbers of
 * hook-backed actions, so React must never reuse one resource's component instance for another.
 */
function EditorPage({ resource }: { resource: Resource }) {
  const { id } = useParams()
  return <ResourceEditor key={`${resource.path}:${id}`} resource={resource} all={resources} />
}

export function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout resources={resources} />}>
        <Route index element={<ListPage key={content.path} resource={content} />} />
        {resources.flatMap((r) => [
          r.list && r.nav !== false && <Route key={r.path} path={r.path} element={<ListPage key={r.path} resource={r} />} />,
          r.create && <Route key={`${r.path}/new`} path={`${r.path}/new`} element={<ResourceCreate key={r.path} resource={r} all={resources} />} />,
          r.import && <Route key={`${r.path}/import`} path={`${r.path}/import`} element={<ResourceImport key={r.path} resource={r} all={resources} />} />,
          r.editor && <Route key={`${r.path}/:id`} path={`${r.path}/:id`} element={<EditorPage resource={r} />} />,
        ])}
        <Route path="*" element={<EmptyState title="Not found" description="There is no admin page here." />} />
      </Route>
    </Routes>
  )
}
