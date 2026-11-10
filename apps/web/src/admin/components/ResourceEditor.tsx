// The shared detail/edit surface: one header (back, title, badges, contextual actions) and a stack
// of sections. Sections are generated forms, embedded ResourceTables, or a resource's unique parts.
import { useNavigate, useParams } from 'react-router-dom'
import { Back } from '@/components/shared/Navigation'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { useDocumentTitle } from '@/lib/title'
import { cn } from '@/lib/utils'
import { ActionButtons, useActionRunner } from './actions'
import { ResourceForm } from './ResourceForm'
import type { Badge, CreateDef, Resource } from '../types'

export function BadgeList({ badges }: { badges: Badge[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <span key={b.label} className={cn('admin-badge', b.tone && `admin-badge--${b.tone}`)}>
          {b.label}
        </span>
      ))}
    </span>
  )
}

/** Where "back" goes: the first listed resource in the same section. */
export const backTo = (resource: Resource, all: Resource[]) => {
  const home = all.find((r) => r.section === resource.section && r.list && r.nav !== false)
  return { href: home ? `/admin/${home.path}` : '/admin', label: home?.label ?? 'Admin' }
}

export function ResourceEditor({ resource, all }: { resource: Resource; all: Resource[] }) {
  const { id = '' } = useParams()
  const editor = resource.editor!
  const record = editor.useRecord(id)
  const runner = useActionRunner(editor.actions ?? [])
  const back = backTo(resource, all)
  useDocumentTitle(record.data ? `Admin · ${editor.title(record.data)}` : `Admin · ${resource.singular}`)

  if (!record.data)
    return (
      <div className="space-y-4">
        <Back to={back.href}>{back.label}</Back>
        <ErrorMessage error={record.error} retry={() => void record.refetch()} />
        {record.isPending && <Loading />}
      </div>
    )

  const r = record.data
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <Back to={back.href}>{back.label}</Back>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-bold tracking-tight break-words">{editor.title(r)}</h1>
            {editor.subtitle && <p className="text-sm text-muted">{editor.subtitle(r)}</p>}
            {editor.badges && <BadgeList badges={editor.badges(r)} />}
          </div>
          {editor.actions && <ActionButtons actions={editor.actions} row={r} runner={runner} size="md" />}
        </div>
      </header>
      {editor.sections
        .filter((s) => s.when?.(r) ?? true)
        .map((s) => (
          <section key={s.key} className="admin-section" aria-labelledby={`admin-section-${s.key}`}>
            <SectionHeader id={`admin-section-${s.key}`} title={s.title} description={s.description} />
            {s.render(r)}
          </section>
        ))}
      {runner.dialog}
    </article>
  )
}

/** A create page: the same frame with one generated form. */
export function ResourceCreate({ resource, all }: { resource: Resource; all: Resource[] }) {
  const create = resource.create as CreateDef<Record<string, unknown>>
  const submit = create.useCreate()
  const navigate = useNavigate()
  const back = backTo(resource, all)
  useDocumentTitle(`Admin · ${create.title}`)
  return (
    <article className="space-y-6">
      <header className="space-y-3">
        <Back to={back.href}>{back.label}</Back>
        <h1 className="text-2xl font-bold tracking-tight">{create.title}</h1>
      </header>
      <section className="admin-section">
        <ResourceForm
          fields={create.fields}
          initial={create.initial}
          submitLabel={create.submitLabel}
          submitAlways
          onSubmit={async (values) => {
            const id = await submit(values)
            navigate(create.next?.(id) ?? `/admin/${resource.path}/${id}`, { replace: true })
          }}
        />
      </section>
    </article>
  )
}
