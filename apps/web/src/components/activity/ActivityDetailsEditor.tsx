import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useUpdateActivityDraft, type components } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/Feedback'
import { durationInput, parseDurationMinutes } from '@/lib/durationMinutes'
import { parseTargetTime, targetTimeInput } from '@/lib/targetTime'
import { useOnline } from '@/lib/useOnline'
import { ActivityBasicsFields } from './ActivityBasicsFields'
import { ActivitySection } from './ActivitySection'

type Activity = components['schemas']['ActivityDetail']

/**
 * Owner editing on the Activity page. Reuses the authoring fields from Add
 * Activity and the same draft update the Program Workspace rows use; media is
 * edited in the page's Related Media section.
 */
export function ActivityDetailsEditor({
  activity: a,
  onDone,
}: {
  activity: Activity
  onDone: () => void
}) {
  const update = useUpdateActivityDraft(a.id)
  const online = useOnline()
  const [title, setTitle] = useState(a.title)
  const [summary, setSummary] = useState(a.summary ?? '')
  const [duration, setDuration] = useState(durationInput(a.durationMinutes))
  const [targetTime, setTargetTime] = useState(targetTimeInput(a.targetTime))

  useEffect(() => {
    setTitle(a.title)
    setSummary(a.summary ?? '')
    setDuration(durationInput(a.durationMinutes))
    setTargetTime(targetTimeInput(a.targetTime))
  }, [a.id, a.draftRevision])

  const next = {
    title: title.trim(),
    summary: summary.trim() || null,
    durationMinutes: parseDurationMinutes(duration),
    targetTime: parseTargetTime(targetTime),
  }
  const changes = {
    ...(next.title !== a.title ? { title: next.title } : {}),
    ...(next.summary !== (a.summary ?? null) ? { summary: next.summary } : {}),
    ...(next.durationMinutes !== (a.durationMinutes ?? null)
      ? { durationMinutes: next.durationMinutes }
      : {}),
    ...(next.targetTime !== (a.targetTime ?? null) ? { targetTime: next.targetTime } : {}),
  }
  const dirty = Object.keys(changes).length > 0

  return (
    <ActivitySection
      icon={Pencil}
      title="Edit Activity"
      description="Changes apply to this Activity everywhere it is used."
    >
      <ActivityBasicsFields
        title={title}
        summary={summary}
        duration={duration}
        targetTime={targetTime}
        onTitleChange={setTitle}
        onSummaryChange={setSummary}
        onDurationChange={setDuration}
        onTargetTimeChange={setTargetTime}
        hideInstructions
      />
      <ErrorMessage error={update.error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!dirty || !next.title || !online || update.isPending}
          loading={update.isPending}
          onClick={async () => {
            try {
              await update.mutateAsync({ expectedRevision: a.draftRevision, ...changes })
              toast.success('Activity updated')
            } catch {
              // Shown inline; edits stay for a retry.
            }
          }}
        >
          Save changes
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </ActivitySection>
  )
}
