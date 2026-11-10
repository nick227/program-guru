import type { components } from '@project/sdk'

type Instruction = components['schemas']['Instruction']

/** Numbered instruction steps, shared by the Activity definition and the Occurrence. */
export function ActivityInstructions({
  instructions,
  locked = false,
  empty,
}: {
  instructions: Instruction[]
  locked?: boolean
  /** Shown when there are no steps; omit to render nothing. */
  empty?: string
}) {
  if (locked)
    return <p className="text-sm text-muted">Access required for instructional content.</p>
  if (!instructions.length) return empty ? <p className="text-sm text-muted">{empty}</p> : null
  return (
    <ol className="activity-steps" aria-label="Instructions">
      {instructions.map((step, index) => (
        <li key={step.id} className="activity-step">
          <span className="activity-step__index" aria-hidden>
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="min-w-0">
            {step.title && <h3 className="activity-step__title">{step.title}</h3>}
            {step.body && <p className="activity-step__body">{step.body}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
