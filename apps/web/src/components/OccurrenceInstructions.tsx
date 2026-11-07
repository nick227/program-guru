import { useState } from 'react'
import type { components } from '@project/sdk'
import { Stack, Row } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { ThumbnailGrid } from '@/components/ThumbnailGrid'
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
  return (
    <Stack className="gap-2">
      <Row className="justify-between">
        <h3>
          Guidance
          {instructions.length > 1
            ? ` · ${index + 1}/${instructions.length}`
            : ''}
        </h3>
        {instructions.length > 1 && (
          <Row>
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
      {current.title && <p className="font-semibold">{current.title}</p>}
      {current.body && <p className="text-muted">{current.body}</p>}
      {media.length > 0 && (
        <ThumbnailGrid
          columns={5}
          items={media.map((m) => ({
            id: m.id,
            thumbnailUrl: m.thumbnailUrl,
            type: m.type,
            alt: m.alt,
          }))}
          onSelect={(id) => {
            const items = media.map((m) => ({
              id: m.id,
              thumbnailUrl: m.thumbnailUrl,
              type: m.type,
              alt: m.alt,
            }))
            setViewer(items)
            setViewerIndex(items.findIndex((m) => m.id === id))
          }}
        />
      )}
      {viewer && (
        <MediaViewer
          items={viewer}
          index={viewerIndex}
          onClose={() => setViewer(null)}
          onIndex={setViewerIndex}
        />
      )}
    </Stack>
  )
}
