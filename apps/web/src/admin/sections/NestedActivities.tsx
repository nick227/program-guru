// Nested Activities on the admin Program page: the workspace's own Activity rows (inline edit of
// title, description and media; remove), plus add-existing by search and create-new, both landing
// in the draft through the ordinary addProgramActivities operation.
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAddProgramActivities, useAdminList, useCreateActivity, type components } from '@project/sdk'
import { WorkspaceActivityRow } from '@/components/program-authoring/WorkspaceActivityRow'
import { ResourceForm } from '../components/ResourceForm'
import { FieldControl, FieldFrame } from '../components/fields'
import type { Field } from '../types'

type Workspace = components['schemas']['ProgramWorkspace']
type NewActivity = { title: string; summary: string; durationMinutes: number | null; targetTime: string | null }

const newFields: Field<NewActivity>[] = [
  { kind: 'text', name: 'title', label: 'New Activity', required: true, maxLength: 140, placeholder: 'e.g. Hollow Hold', assist: true },
  { kind: 'textarea', name: 'summary', label: 'Description', maxLength: 500, rows: 2, assist: true },
  { kind: 'number', name: 'durationMinutes', label: 'Duration', min: 1, max: 1440, suffix: 'minutes' },
  { kind: 'time', name: 'targetTime', label: 'Target time' },
]

/** Activities a platform Program may use: platform ones, or anyone's openly published ones. */
function useActivitySearch(q: string, exclude: string[]) {
  const r = useAdminList('/admin/content', { kind: 'ACTIVITY', q, limit: 10 }, { enabled: !!q })
  const usable = (r.data?.data ?? []).filter((a) => !exclude.includes(a.id) && a.status !== 'ARCHIVED' && !a.moderated && (a.isPlatform || (a.status === 'PUBLISHED' && a.visibility !== 'PRIVATE')))
  return { isLoading: r.isFetching, options: usable.map((a) => ({ value: a.id, label: `${a.title}${a.isPlatform ? '' : ` · @${a.creator?.handle}`}${a.status === 'DRAFT' ? ' (draft)' : ''}` })) }
}

export function NestedActivities({ ws }: { ws: Workspace }) {
  const add = useAddProgramActivities(ws.id)
  const create = useCreateActivity()
  const [formKey, setFormKey] = useState(0)
  const [picker, setPicker] = useState(0)
  // A created Activity survives a failed add, so Retry never creates a second one.
  const created = useRef<{ title: string; id: string } | null>(null)
  const exclude = ws.activities.map((a) => a.activityId)
  const search: Field<{ activityId: string }> = { kind: 'reference', name: 'activityId', label: 'Add an existing Activity', search: (q) => useActivitySearch(q, exclude), placeholder: 'Search the library…' }

  async function addExisting(activityId: string) {
    try {
      await add.mutateAsync({ activityIds: [activityId], expectedRevision: ws.draftRevision })
      toast.success('Activity added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the Activity')
    } finally {
      setPicker((n) => n + 1)
    }
  }

  return (
    <div className="space-y-4">
      {ws.activities.length === 0 && <p className="text-sm text-muted">No Activities yet. Add one from the library or create a new one.</p>}
      <div className="space-y-3">
        {ws.activities.map((a) => (
          <WorkspaceActivityRow key={a.activityId} activity={a} ws={ws} returnTo={`/admin/programs/${ws.id}`} />
        ))}
      </div>
      <div className="grid gap-6 border-t border-border pt-4 md:grid-cols-2">
        <FieldFrame id="admin-add-activity" label={search.label}>
          <FieldControl key={picker} field={search} id="admin-add-activity" value={null} values={{ activityId: '' }} onChange={(v) => v && void addExisting(String(v))} invalid={false} disabled={add.isPending} />
        </FieldFrame>
        <ResourceForm
          key={formKey}
          fields={newFields}
          initial={{ title: '', summary: '', durationMinutes: null, targetTime: null }}
          submitLabel="Create and add"
          onSubmit={async (v) => {
            const title = v.title.trim()
            if (created.current?.title !== title) {
              const activity = await create.mutateAsync({ title, summary: v.summary.trim() || null, durationMinutes: v.durationMinutes, targetTime: v.targetTime, categoryId: ws.type.categoryId, focusIds: ws.focus ? [ws.focus.id] : [], owner: 'PLATFORM' })
              created.current = { title, id: activity.id }
            }
            await add.mutateAsync({ activityIds: [created.current!.id], expectedRevision: ws.draftRevision })
            created.current = null
            toast.success('Activity created and added')
            setFormKey((k) => k + 1)
          }}
        />
      </div>
    </div>
  )
}
