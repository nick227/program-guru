// Standalone platform Activity editor: details, media (the existing tray), instructions, publish.
import { useActivity, useAdminArchive, useCategories, useCreateActivity, usePublishActivity, useUpdateActivityDraft, type components } from '@project/sdk'
import { ActivityMediaTray } from '@/components/EntityMediaTray'
import { ResourceForm } from '../components/ResourceForm'
import { ResourceTable } from '../components/ResourceTable'
import { InstructionsEditor } from '../sections/InstructionsEditor'
import { defineResource, type Field, type Option } from '../types'
import { audit } from './audit'
import { statusBadges } from './content'
import { label } from './shared'

type Detail = components['schemas']['ActivityDetail']
type Details = { title: string; summary: string; categoryId: string }
type Publish = { visibility: Detail['visibility'] }

const useCategoryOptions = (): Option[] => (useCategories().data ?? []).map((c) => ({ value: c.id, label: c.label }))

const detailFields: Field<Details>[] = [
  { kind: 'text', name: 'title', label: 'Title', required: true, maxLength: 140, assist: true },
  { kind: 'textarea', name: 'summary', label: 'Description', maxLength: 500, rows: 3, assist: true },
  { kind: 'select', name: 'categoryId', label: 'Category', required: true, options: useCategoryOptions },
]

function DetailsForm({ activity }: { activity: Detail }) {
  const update = useUpdateActivityDraft(activity.id)
  return (
    <ResourceForm
      fields={detailFields}
      initial={{ title: activity.title, summary: activity.summary ?? '', categoryId: activity.categoryId }}
      onSubmit={(_, c) => update.mutateAsync({ ...c, ...(c.summary !== undefined ? { summary: c.summary.trim() || null } : {}), expectedRevision: activity.draftRevision })}
    />
  )
}

function PublishForm({ activity }: { activity: Detail }) {
  const publish = usePublishActivity(activity.id)
  return (
    <ResourceForm<Publish>
      fields={[{ kind: 'visibility', name: 'visibility', label: 'Privacy', help: 'Public platform Activities appear in everyone’s library.' }]}
      initial={{ visibility: activity.visibility }}
      submitAlways
      submitLabel="Publish"
      onSubmit={(v) => publish.mutateAsync({ visibility: v.visibility, expectedRevision: activity.draftRevision })}
    />
  )
}

export const activities = defineResource<unknown, Detail>({
  path: 'activities',
  section: 'content',
  label: 'Activities',
  singular: 'Activity',
  nav: false,
  editor: {
    useRecord: (id) => useActivity(id),
    title: (a) => a.title,
    subtitle: (a) => `${a.instructions.length} steps · ${a.metrics.length} metrics · ${a.media.length} media`,
    badges: (a) => [...statusBadges(a), { label: label(a.visibility), tone: 'muted' }, ...(a.isPlatform ? [{ label: 'Program Guru', tone: 'muted' as const }] : [])],
    actions: [
      { label: 'View page', href: (a) => `/activities/${a.id}`, when: (a) => a.status === 'PUBLISHED' },
      {
        label: 'Archive',
        when: (a) => a.canEdit && a.status !== 'ARCHIVED',
        confirm: 'Removes it from the library and new Programs. Programs that already use it keep their copy.',
        useRun: () => {
          const m = useAdminArchive()
          return (a) => m.mutateAsync({ kind: 'ACTIVITY', id: a.id })
        },
      },
    ],
    sections: [
      { key: 'details', title: 'Details', when: (a) => a.canEdit, render: (a) => <DetailsForm activity={a} /> },
      { key: 'media', title: 'Media', when: (a) => a.canEdit && !!a.revisionId, render: (a) => <ActivityMediaTray revisionId={a.revisionId!} /> },
      { key: 'instructions', title: 'Instructions', render: (a) => <InstructionsEditor activity={a} /> },
      { key: 'publish', title: 'Publish', when: (a) => a.canEdit, render: (a) => <PublishForm activity={a} /> },
      { key: 'history', title: 'History', render: (a) => <ResourceTable resource={audit} fixed={{ targetId: a.id }} /> },
    ],
  },
  create: {
    title: 'New platform Activity',
    submitLabel: 'Create draft',
    initial: { title: '', summary: '', categoryId: '' } satisfies Details,
    fields: detailFields,
    useCreate: () => {
      const m = useCreateActivity()
      return async (v: Details) => (await m.mutateAsync({ title: v.title.trim(), summary: v.summary.trim() || null, categoryId: v.categoryId, owner: 'PLATFORM' })).id
    },
  },
})
