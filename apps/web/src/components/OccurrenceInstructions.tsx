import { useState } from 'react'
import type { components } from '@project/sdk'
import { Row } from '@/components/ui/Layout'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { MediaViewer, type ViewerItem } from '@/components/MediaViewer'

type Instruction = components['schemas']['Instruction']

export function OccurrenceInstructions({
  instructions,
  locked,
}: {
  instructions: Instruction[]
  locked: boolean
}) {
  const [index, setIndex] = useState(0)
  const [viewer, setViewer] = useState<ViewerItem[] | null>(null)
  const [viewerIndex, setViewerIndex] = useState(0)
  if (locked)
    return (
      <p className="text-sm text-muted">
        Access required for instructional content.
      </p>
    )
  if (!instructions.length) return null
  const current = instructions[Math.min(index, instructions.length - 1)]!
  const media = current.media ?? []
  const items = media.map((m) => ({ id: m.id, thumbnailUrl: m.thumbnailUrl, type: m.type, alt: m.alt }))
  return (
    <div className="activity-instructions">
      <Row className="justify-between gap-3">
        <h3>
          How to do it
          {instructions.length > 1 && (
            <span className="activity-instructions__step">
              {' '}· Step {index + 1} of {instructions.length}
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
      {items.length > 0 && (
        <ul className="activity-instructions__media" aria-label="Instruction media">
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                aria-label={`Open ${item.alt || item.type || 'media'}`}
                onClick={() => {
                  setViewer(items)
                  setViewerIndex(i)
                }}
              >
                {item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                  <span>{item.type === 'VIDEO' ? 'Video' : 'Media'}</span>
                )}
                {item.type === 'VIDEO' && <Play size={18} aria-hidden className="activity-instructions__play" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {viewer && (
        <MediaViewer
          items={viewer}
          index={viewerIndex}
          onClose={() => setViewer(null)}
          onIndex={setViewerIndex}
        />
      )}
    </div>
  )
}
