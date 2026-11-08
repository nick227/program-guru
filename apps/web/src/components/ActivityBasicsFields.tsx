import { Input } from '@/components/ui/Input'

export function ActivityBasicsFields({
  title,
  summary,
  instruction,
  onTitleChange,
  onSummaryChange,
  onInstructionChange,
}: {
  title: string
  summary: string
  instruction: string
  onTitleChange: (value: string) => void
  onSummaryChange: (value: string) => void
  onInstructionChange: (value: string) => void
}) {
  return (
    <div className="form">
      <label className="field">
        <span className="label">Activity title</span>
        <Input
          maxLength={140}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="label">Description (optional)</span>
        <textarea
          className="textarea"
          maxLength={500}
          value={summary}
          onChange={(event) => onSummaryChange(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="label">Instructions (optional)</span>
        <textarea
          className="textarea"
          maxLength={2000}
          value={instruction}
          onChange={(event) => onInstructionChange(event.target.value)}
        />
      </label>
    </div>
  )
}
