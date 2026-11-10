import { Input } from '@/components/ui/Input'

export function ActivityBasicsFields({
  title,
  summary,
  duration,
  instruction,
  onTitleChange,
  onSummaryChange,
  onDurationChange,
  onInstructionChange,
  hideInstructions = false,
}: {
  title: string
  summary: string
  duration?: string
  instruction?: string
  onTitleChange: (value: string) => void
  onSummaryChange: (value: string) => void
  onDurationChange?: (value: string) => void
  onInstructionChange?: (value: string) => void
  hideInstructions?: boolean
}) {
  return (
    <div className="form space-y-3">
      <label className="field space-y-1">
        <span className="label font-semibold text-xs">Activity title</span>
        <Input
          maxLength={140}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>
      <label className="field space-y-1">
        <span className="label font-semibold text-xs">Description (optional)</span>
        <textarea
          className="textarea min-h-20"
          maxLength={500}
          value={summary}
          onChange={(event) => onSummaryChange(event.target.value)}
        />
      </label>
      {onDurationChange && (
        <label className="field space-y-1">
          <span className="label font-semibold text-xs">Duration in minutes (optional)</span>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={1440}
            step={1}
            placeholder="Minutes"
            value={duration ?? ''}
            onChange={(event) => onDurationChange(event.target.value)}
          />
        </label>
      )}
      {!hideInstructions && onInstructionChange && (
        <label className="field space-y-1">
          <span className="label font-semibold text-xs">Instructions (optional)</span>
          <textarea
            className="textarea min-h-24"
            maxLength={2000}
            value={instruction ?? ''}
            onChange={(event) => onInstructionChange(event.target.value)}
          />
        </label>
      )}
    </div>
  )
}
