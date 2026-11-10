// Platform Program editor: generated details and publish forms, the existing cover tray, nested
// Activities, and history. Every save is an ordinary authoring operation (07 §6, 12 §7a).
import { useCreateProgram, useDeleteProgram, useFocuses, useProgramTypes, useProgramWorkspace, usePublishCheck, usePublishProgram, useUpdateProgram, useAdminArchive, type components } from '@project/sdk'
import { useNavigate } from 'react-router-dom'
import { ProgramMediaTray } from '@/components/EntityMediaTray'
import { ResourceForm } from '../components/ResourceForm'
import { ResourceTable } from '../components/ResourceTable'
import { NestedActivities } from '../sections/NestedActivities'
import { defineResource, type Field, type Option } from '../types'
import { audit } from './audit'
import { statusBadges } from './content'
import { label } from './shared'

type Workspace = components['schemas']['ProgramWorkspace']
type Details = Pick<Workspace, 'title' | 'description' | 'durationDays' | 'frequency' | 'generationMode'> & { programTypeId: string; focusId: string | null }
type Publish = { visibility: Workspace['visibility']; accessMode: Workspace['accessMode'] }
type Create = { programTypeId: string; focusId: string | null }

const useTypeOptions = (): Option[] => (useProgramTypes().data ?? []).map((t) => ({ value: t.id, label: t.label }))
const useFocusOptions = (v: { programTypeId: string }): Option[] => (useFocuses(v.programTypeId).data ?? []).map((f) => ({ value: f.id, label: f.label }))

const detailFields: Field<Details>[] = [
  { kind: 'text', name: 'title', label: 'Title', required: true, maxLength: 140, assist: true },
  { kind: 'textarea', name: 'description', label: 'Description', maxLength: 20000, rows: 5, assist: true },
  { kind: 'select', name: 'programTypeId', label: 'Type', required: true, options: useTypeOptions },
  { kind: 'select', name: 'focusId', label: 'Focus', options: useFocusOptions },
  { kind: 'duration', name: 'durationDays', label: 'Duration' },
  { kind: 'frequency', name: 'frequency', label: 'Frequency' },
  { kind: 'select', name: 'generationMode', label: 'Schedule', options: [{ value: 'ALL_EACH_DAY', label: 'Every Activity each scheduled day' }, { value: 'ROTATE', label: 'Rotate Activities' }], help: 'Changing duration, frequency or schedule regenerates automatic placements.' },
]
const publishFields: Field<Publish>[] = [
  { kind: 'visibility', name: 'visibility', label: 'Privacy' },
  { kind: 'select', name: 'accessMode', label: 'Access', options: [{ value: 'OPEN', label: 'Open: anyone can join' }, { value: 'APPROVAL', label: 'Approval: you approve each request' }], visible: (v) => v.visibility !== 'PRIVATE' },
]

function DetailsForm({ ws }: { ws: Workspace }) {
  const update = useUpdateProgram(ws.id)
  const initial: Details = { title: ws.title, description: ws.description ?? '', programTypeId: ws.type.id, focusId: ws.focus?.id ?? null, durationDays: ws.durationDays, frequency: ws.frequency, generationMode: ws.generationMode }
  return (
    <ResourceForm
      fields={detailFields}
      initial={initial}
      onSubmit={(_, changes) =>
        update.mutateAsync({ ...changes, frequency: changes.frequency ?? undefined, ...(changes.description !== undefined ? { description: changes.description?.trim() || null } : {}), ...(changes.programTypeId ? { focusId: changes.focusId ?? null } : {}), expectedRevision: ws.draftRevision })
      }
    />
  )
}

function PublishForm({ ws }: { ws: Workspace }) {
  const check = usePublishCheck(ws.id)
  const publish = usePublishProgram(ws.id)
  const ready = check.data?.canPublish
  return (
    <div className="space-y-4">
      {check.data && !ready && (
        <ul className="space-y-1 text-sm">
          {check.data.issues.map((i) => (
            <li key={i.code} className="text-danger">
              {i.message}
            </li>
          ))}
        </ul>
      )}
      {ready && <p className="text-sm text-muted">{ws.status === 'ARCHIVED' ? 'Publishing restores this Program.' : ws.status === 'PUBLISHED' ? 'Publishes the pending changes. Participants are offered the update.' : 'Ready to publish.'}</p>}
      <ResourceForm
        fields={publishFields}
        initial={{ visibility: ws.visibility, accessMode: ws.accessMode === 'PAID' ? 'OPEN' : ws.accessMode }}
        submitAlways={!!ready}
        submitLabel={ws.status === 'ARCHIVED' ? 'Restore' : 'Publish'}
        onSubmit={(v) => publish.mutateAsync({ visibility: v.visibility, accessMode: v.visibility === 'PRIVATE' ? 'OPEN' : v.accessMode, expectedRevision: ws.draftRevision })}
      />
    </div>
  )
}

export const programs = defineResource<unknown, Workspace>({
  path: 'programs',
  section: 'content',
  label: 'Programs',
  singular: 'Program',
  nav: false,
  editor: {
    useRecord: useProgramWorkspace,
    title: (ws) => ws.title,
    subtitle: (ws) => `${ws.type.label}${ws.focus ? ` · ${ws.focus.label}` : ''} · ${ws.durationDays ? `${Math.round(ws.durationDays / 7)} weeks` : 'Ongoing'} · ${ws.frequencyLabel}`,
    badges: (ws) => [...statusBadges(ws), { label: label(ws.visibility), tone: 'muted' }, { label: 'Program Guru', tone: 'muted' }],
    actions: [
      { label: 'View page', href: (ws) => `/programs/${ws.id}`, when: (ws) => !!ws.latestPublishedVersionId },
      {
        label: 'Archive',
        when: (ws) => ws.status === 'PUBLISHED',
        confirm: 'Removes it from discovery and new joins. Participants keep everything.',
        useRun: () => {
          const m = useAdminArchive()
          return (ws) => m.mutateAsync({ kind: 'PROGRAM', id: ws.id })
        },
      },
      {
        label: 'Delete',
        tone: 'danger',
        confirm: 'Deletes the Program. If anyone joined, bought or copied it, it is kept for them and only hidden.',
        useRun: () => {
          const m = useDeleteProgram()
          const navigate = useNavigate()
          return async (ws) => {
            await m.mutateAsync(ws.id)
            navigate('/admin?owner=PLATFORM', { replace: true })
          }
        },
      },
    ],
    sections: [
      { key: 'details', title: 'Details', render: (ws) => <DetailsForm ws={ws} /> },
      { key: 'cover', title: 'Cover', render: (ws) => <ProgramMediaTray program={ws} disabled={ws.status === 'ARCHIVED'} /> },
      { key: 'activities', title: 'Activities', description: 'Placed automatically from the schedule settings above.', render: (ws) => <NestedActivities ws={ws} /> },
      { key: 'publish', title: 'Publish', render: (ws) => <PublishForm ws={ws} /> },
      { key: 'history', title: 'History', render: (ws) => <ResourceTable resource={audit} fixed={{ targetId: ws.id }} /> },
    ],
  },
  create: {
    title: 'New platform Program',
    submitLabel: 'Create draft',
    initial: { programTypeId: '', focusId: null } satisfies Create,
    fields: [
      { kind: 'select', name: 'programTypeId', label: 'Type', required: true, options: useTypeOptions },
      { kind: 'select', name: 'focusId', label: 'Focus', options: useFocusOptions, visible: (v: Create) => !!v.programTypeId },
    ] satisfies Field<Create>[],
    useCreate: () => {
      const m = useCreateProgram()
      return async (v: Create) => (await m.mutateAsync({ programTypeId: v.programTypeId, focusId: v.focusId || null, owner: 'PLATFORM' })).id
    },
  },
})
