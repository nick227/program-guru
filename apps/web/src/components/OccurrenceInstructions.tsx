import { useState } from 'react'
import type { components } from '@project/sdk'
import { Row } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'

type Instruction = components['schemas']['Instruction']

export function OccurrenceInstructions({
  instructions,
  locked,
}: {
  instructions: Instruction[]
  locked: boolean
}) {
  const [index, setIndex] = useState(0)
  if (locked)
    return (
      <p className="text-sm text-muted">
        Access required for instructional content.
      </p>
    )
  if (!instructions.length) return null
  const current = instructions[Math.min(index, instructions.length - 1)]!
  return (
    <div className="activity-instructions">
      <Row className="justify-between gap-3">
        <h3>
          {instructions.length > 1 && (
            <span className="activity-instructions__step">
              {' '}Step {index + 1} of {instructions.length}
            </span>
          )}
        </h3>
        {instructions.length > 1 && (
          <Row className="gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={index >= instructions.length - 1}
              onClick={() => setIndex((i) => i + 1)}
            >
              Next
            </Button>
          </Row>
        )}
      </Row>
      {current.title && <p className="activity-instructions__title">{current.title}</p>}
      {current.body && <p className="activity-instructions__body">{current.body}</p>}

    </div>
  )
}
