// Ordered Instructions for an Activity draft: add, edit, remove, reorder, then save the whole list
// through putActivityInstructions (instructionKey keeps each step's identity across revisions).
import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { usePutActivityInstructions, type components } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { usePwaReloadBlocker } from '@/lib/pwaSafety'

type Detail = components['schemas']['ActivityDetail']
type Step = { instructionKey?: string; title: string; body: string; local: string }

const fromDetail = (a: Detail): Step[] => a.instructions.map((i) => ({ instructionKey: i.instructionKey, title: i.title ?? '', body: i.body ?? '', local: i.instructionKey }))

export function InstructionsEditor({ activity }: { activity: Detail }) {
  const put = usePutActivityInstructions()
  const [steps, setSteps] = useState<Step[]>(() => fromDetail(activity))
  const saved = JSON.stringify(fromDetail(activity).map(({ local: _l, ...s }) => s))
  const dirty = JSON.stringify(steps.map(({ local: _l, ...s }) => s)) !== saved
  usePwaReloadBlocker(dirty || put.isPending)
  useEffect(() => {
    if (!dirty) setSteps(fromDetail(activity))
  }, [saved]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (i: number, patch: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const move = (i: number, by: number) =>
    setSteps((s) => {
      const next = [...s]
      const [x] = next.splice(i, 1)
      next.splice(i + by, 0, x!)
      return next
    })

  if (!activity.canEdit) return <p className="text-sm text-muted">{activity.instructions.length} steps. Only platform content is edited here.</p>
  return (
    <div className="space-y-3">
      {steps.length === 0 && <p className="text-sm text-muted">No instructions yet.</p>}
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.local} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <span className="w-6 text-sm font-semibold text-muted">{i + 1}</span>
              <Input aria-label={`Step ${i + 1} title`} placeholder="Step title" maxLength={120} value={s.title} onChange={(e) => update(i, { title: e.target.value })} />
              <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp size={16} />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown size={16} />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Remove step" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}>
                <Trash2 size={16} />
              </Button>
            </div>
            <Textarea aria-label={`Step ${i + 1} details`} rows={3} maxLength={20000} value={s.body} onChange={(e) => update(i, { body: e.target.value })} />
          </li>
        ))}
      </ol>
      <ErrorMessage error={put.error} />
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => setSteps((x) => [...x, { title: '', body: '', local: crypto.randomUUID() }])}>
          Add step
        </Button>
        <Button
          disabled={!dirty}
          loading={put.isPending}
          onClick={async () => {
            try {
              await put.mutateAsync({
                activityId: activity.id,
                expectedRevision: activity.draftRevision,
                instructions: steps.map((s) => ({ ...(s.instructionKey ? { instructionKey: s.instructionKey } : {}), title: s.title.trim() || null, body: s.body || null })),
              })
              toast.success('Instructions saved')
            } catch {
              /* shown above; edits are kept */
            }
          }}
        >
          Save instructions
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setSteps(fromDetail(activity))}>
            Discard
          </Button>
        )}
      </div>
    </div>
  )
}
