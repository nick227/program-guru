# Admin resources: developer guide

Requirements: `docs/specs/12-SOCIAL.md` §7a. Code: `apps/web/src/admin/`.

The admin is one pattern, not a set of pages. A **resource** is a plain TypeScript object. Five shared components render any resource:

| Component | Renders |
|---|---|
| `AdminLayout` | Header, section tabs (Content, Users, Moderation, Membership), a section's resource tabs, ADMIN-only guard |
| `ResourceTable` | `resource.list`: search, select filters, columns, row actions, bulk actions, paging, phone card layout |
| `ResourceForm` | Typed `Field[]`: local state, changed-fields-only submit, server `fieldErrors` inline, dirty guard |
| `ResourceEditor` | `resource.editor`: header (back, title, badges, actions) plus sections; also `ResourceCreate` for `resource.create` |
| `ResourceImport` | `resource.import`: JSON paste or upload, server dry run listing every issue, idempotent commit |

`registry.tsx` lists the resources and generates the routes:

- `/admin/<path>`: the table
- `/admin/<path>/new`: the create form
- `/admin/<path>/import`: the import page
- `/admin/<path>/:id`: the editor

Content is also served at `/admin` itself.

## Rules

- **The server owns validation and permissions.** Every admin operation is `adminOnlyAuth` and calls the ordinary domain services. Never add a generic CRUD endpoint. When an operation is missing, add a specific one to `openapi.yaml` (spec first), then a handler in `apps/server/src/handlers/admin.ts`.
- **Client checks are only `required`.** Server `fieldErrors` keyed by field name show beside that field.
- **Platform content** (`creatorId = null`) is authored through the normal Program and Activity operations, because `domains/admin/authors.ts` lets an active ADMIN author it. User-owned content is moderation-only.

## Add a resource

Say we want `/admin/reports` (this example now exists as `resources/moderation.tsx`, using the existing `/moderation/reports` operation).

**1. API.** Declare the list operation in `openapi.yaml`: a `GET` under `/admin/...` returning `{ data, meta }`. Run `pnpm --filter server handlers:sync` and implement the handler. Then regenerate the SDK (`pnpm --filter @project/sdk generate`). Add the path to `AdminListPath` in `packages/sdk/src/hooks/useAdmin.ts`, which makes it listable with full types:

```ts
export type AdminListPath = ... | '/admin/reports'
```

**2. Definition.** Create `apps/web/src/admin/resources/reports.tsx`:

```tsx
import { useAdminList, type AdminListQuery, type AdminListRow } from '@project/sdk'
import { defineResource } from '../types'
import { date, label, options } from './shared'

type Report = AdminListRow<'/admin/reports'>

export const reports = defineResource<Report, Report, AdminListQuery<'/admin/reports'>>({
  path: 'reports',
  section: 'users',
  label: 'Reports',
  singular: 'Report',
  list: {
    useList: (q) => useAdminList('/admin/reports', q),
    rowId: (r) => r.id,
    filters: [{ key: 'status', label: 'Status', options: options(['OPEN', 'RESOLVED', 'DISMISSED']) }],
    columns: [
      { key: 'reason', label: 'Reason', render: (r) => label(r.reason) },
      { key: 'target', label: 'Target', render: (r) => label(r.target.type) },
      { key: 'filed', label: 'Filed', render: (r) => date(r.createdAt), priority: 'low' },
    ],
  },
})
```

**3. Register** it in `registry.tsx` (`resources` array order is tab order). Done: the route, the tab, search, filters, paging and the phone layout all come from the definition. `src/admin/registry.test.ts` checks paths are unique and every section has a home.

**Pages are keyed by resource.** `registry.tsx` gives every route element `key={resource.path}`. Resources declare different numbers of hook-backed actions, and without the key React reuses one table for another and crashes ("Should have a queue"). `e2e/admin.spec.ts` guards this.

## Add a field

Fields are a discriminated union in `types.ts`:

| Kind | For |
|---|---|
| `text`, `textarea`, `number`, `boolean`, `date` | Plain values |
| `select` | Static options, or a function that may call hooks, e.g. `options: () => useCategories().data.map(...)` |
| `visibility` | PRIVATE / UNLISTED / PUBLIC |
| `duration` | Days; null means ongoing |
| `frequency` | Program frequency |
| `reference` | Pick a record by searching another list. `search: (q) => ({ options, isLoading })`; `useUserSearch` and `useProgramSearch` are in `resources/shared.tsx` |
| `custom` | `render(props)` for a genuinely unique input |

Common options: `required`, `help`, `visible(values)`, `disabled(values)`.

```ts
{ kind: 'select', name: 'categoryId', label: 'Category', required: true, options: useCategoryOptions }
{ kind: 'number', name: 'durationDays', label: 'Days', min: 1, max: 3650, visible: (v) => v.durationDays !== null }
```

To add a new field kind (one used by more than one resource), add a member to the `Field` union and a `case` in `FieldControl` (`components/fields.tsx`). TypeScript then flags any switch that misses it.

**Writing assistance (planned, not built).** Mark free-text fields `assist: true`. `fieldActions` in `components/fields.tsx` is an empty list of providers rendered beside every field label. The writing helper (generate, improve, shorten, rewrite the current field) will register one provider that renders for `assist` fields and calls `setValue`. No form changes.

## Actions

```ts
{
  label: 'Archive',
  when: (row) => row.status === 'PUBLISHED',     // shown only when true
  confirm: 'Removes it from discovery.',          // asks first
  reason: true,                                   // also collects the audit reason
  tone: 'danger',
  useRun: () => {                                 // a hook: SDK mutations are hooks
    const m = useAdminArchive()
    return (row, { reason }) => m.mutateAsync({ kind: row.kind, id: row.id })
  },
}
```

- Use `href: (row) => '/somewhere'` for links.
- `list.bulk` takes the same shape (`useRun` gets one row at a time) and reports done and failed counts.
- After any action, every `['admin']` query refetches.

## Customize an editor

```ts
editor: {
  useRecord: (id) => useSomething(id),     // any React Query hook
  title: (r) => r.title,
  subtitle: (r) => ...,
  badges: (r) => [{ label: 'Draft', tone: 'muted' }],
  actions: [...],                          // header actions, same Action type
  sections: [
    { key: 'details', title: 'Details', render: (r) => <DetailsForm record={r} /> },          // a ResourceForm
    { key: 'history', title: 'History', render: (r) => <ResourceTable resource={audit} fixed={{ targetId: r.id }} /> },
    { key: 'steps', title: 'Instructions', when: (r) => r.canEdit, render: (r) => <InstructionsEditor activity={r} /> },
  ],
}
```

- **Related records.** Embed another resource's table with `fixed` filters; fixed filters are hidden from its toolbar. The Users editor shows the person's Content, access, subscriptions, purchases and history this way.
- **Unique parts.** Put them in `admin/sections/` and render them from a section. Today these are `NestedActivities`, which reuses the workspace's `WorkspaceActivityRow`, and `InstructionsEditor`. Reuse existing components such as `ProgramMediaTray` and `ActivityMediaTray` rather than rebuilding them.
- **Form state.** A `ResourceForm`'s `initial` is the record's current values. After a save or refetch, untouched fields follow the server and edits in progress are kept.

## Connect API operations

- **Reads:** `useAdminList(path, query)` for collections; a dedicated hook in `useAdmin.ts` for a single record.
- **Writes:** a `useApiMutation` hook in `packages/sdk/src/hooks/useAdmin.ts` that invalidates `adminKey`. Prefer an existing operation; for example, the content table publishes through `useAdminPublish`, which calls the ordinary publish endpoints.
- **Server:** handler in `handlers/admin.ts`, service in `apps/server/src/domains/admin/`. Audit admin changes with `audit(tx, actorId, targetType, targetId, action, reason)` in the same transaction.
- **Tests:** add a contract case per operation to `apps/server/src/__tests__/helpers/contract.ts` (`as: 'admin'`), a `describe` block in `admin.test.ts`, and journey assertions for any business rule.

## Initial admins

Locally, `pnpm db:seed` creates `admin-dev@test.local` / `admin dev password` as an ADMIN (README). Everywhere else there is no UI or environment path to ADMIN; an operator promotes an existing account:

```bash
pnpm --filter server admin grant someone@example.com     # local (.env)
pnpm --filter server admin:prod grant someone@example.com # inside the Railway API service (railway ssh)
pnpm --filter server admin list
```

- `revoke` demotes. Both are idempotent and audited.
- The last active admin can never be demoted, suspended or deactivated, whether from the CLI, the admin UI, moderation, or self-deactivation.
