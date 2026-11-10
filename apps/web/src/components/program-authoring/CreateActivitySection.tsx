import { parseDurationMinutes } from '@/lib/durationMinutes'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  useAddProgramActivities,
  useCreateActivity,
} from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/Input'
import { Panel, Stack } from '@/components/ui/Layout'
import { MediaTray } from '@/components/MediaTray'
import { useDraftMedia } from '@/lib/useEntityMedia'
import { useOnline } from '@/lib/useOnline'
import {
  ActivityDurationField,
  ActivityFrequencyButtons,
  type Frequency,
} from './ScheduleControls'
import type { ActivityDetail, Workspace } from './types'

const DEFAULT_FREQ: Frequency = { kind: 'N_PER_WEEK', n: 3 }

export function CreateActivitySection({ ws }: { ws: Workspace }) {
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [duration, setDuration] = useState('')
  const [frequency, setFrequency] = useState<Frequency>(
    () => ws.frequency ?? DEFAULT_FREQ,
  )
  // Kept across a failed step so a retry never creates a second Activity.
  const [created, setCreated] = useState<ActivityDetail | null>(null)
  const [mediaError, setMediaError] = useState<unknown>(null)
  const create = useCreateActivity()
  const add = useAddProgramActivities(ws.id)
  const online = useOnline()
  const media = useDraftMedia()
  const programCategoryId = ws.type.categoryId || ws.focus?.categoryId || ''
  const busy = create.isPending || add.isPending

  async function handleAdd() {
    setMediaError(null)
    try {
      const activity =
        created ??
        (await create.mutateAsync({
          title: title.trim(),
          categoryId: programCategoryId,
          focusIds: ws.focus ? [ws.focus.id] : [],
          summary: summary.trim() || null,
          durationMinutes: parseDurationMinutes(duration),
          frequency,
        }))
      setCreated(activity)
      if (media.files.length && activity.revisionId) {
        try {
          await media.commit({
            target: { kind: 'ACTIVITY_REVISION', id: activity.revisionId },
            purpose: 'DEMONSTRATION',
          })
        } catch (error) {
          setMediaError(error)
          return
        }
      }
      await add.mutateAsync({
        activityIds: [activity.id],
        frequencies: { [activity.id]: frequency },
        expectedRevision: ws.draftRevision,
      })
      toast.success('Activity added to Program')
      setCreated(null)
      setTitle('')
      setSummary('')
      setDuration('')
      setFrequency(ws.frequency ?? DEFAULT_FREQ)
    } catch {
      /* Mutation errors stay visible; keep the form for retry. */
    }
  }

  return (
    <Panel className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-4">
      <h3 className="text-base font-bold text-foreground">New Activity</h3>
      <Stack className="gap-4">
        <ErrorMessage error={create.error || add.error || mediaError} />
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Activity title
          </span>
          <Input
            aria-label="Activity title"
            maxLength={140}
            placeholder="e.g. Morning Run, Upper Body Strength"
            value={title}
            disabled={!!created || busy}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Description (optional)
          </span>
          <textarea
            aria-label="Description (optional)"
            className="textarea min-h-20 text-sm"
            maxLength={500}
            placeholder="Short description of this activity..."
            value={summary}
            disabled={!!created || busy}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Frequency
          </span>
          <ActivityFrequencyButtons
            value={frequency}
            onChange={setFrequency}
            disabled={busy}
            ariaLabel="New activity frequency"
          />
        </div>
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Duration (optional)
          </span>
          <ActivityDurationField
            value={duration}
            onChange={setDuration}
            disabled={!!created || busy}
            inputAriaLabel="Activity duration (optional)"
          />
        </div>
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Media (optional)
          </span>
          <MediaTray
            label="Activity media"
            items={media.items}
            onAdd={media.add}
            disabled={busy || !online}
          />
        </div>
        <Button
          size="lg"
          className="h-11 px-6 font-semibold self-start"
          disabled={!title.trim() || !online || busy}
          loading={busy}
          onClick={() => void handleAdd()}
        >
          Add to Program
        </Button>
      </Stack>
    </Panel>
  )
}

