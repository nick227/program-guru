import { ApiError, useUpdateProgram } from '@project/sdk'
import { ProgramHeader } from '@/components/ProgramHeader'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/Feedback'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { useAutosave } from '@/lib/useAutosave'
import { useOnline } from '@/lib/useOnline'
import type { Workspace } from '../../types'

export function TitleEditor({ ws }: { ws: Workspace }) {
  const update = useUpdateProgram(ws.id)
  const online = useOnline()
  const draft = useAutosave(
    ws.title,
    ws.draftRevision,
    (title, expectedRevision) =>
      update.mutateAsync({ title, expectedRevision }),
    online,
  )
  const conflict =
    draft.error instanceof ApiError && draft.error.code === 'VERSION_CONFLICT'

  return (
    <Stack className="gap-2">
      <ProgramHeader
        title={draft.value}
        onTitleChange={draft.setValue}
      />
      <p role="status" className="text-xs text-muted">
        {draft.pending
          ? 'Saving…'
          : !online && draft.dirty
            ? 'Offline · changes have not been saved'
            : draft.error
              ? 'Not saved'
              : !draft.value.trim()
                ? 'Enter a title to save'
                : draft.dirty
                  ? online
                    ? 'Unsaved changes'
                    : 'Offline · changes have not been saved'
                  : 'Saved'}
      </p>
      <ErrorMessage
        error={draft.error}
        retry={conflict ? undefined : draft.retry}
      />
      {conflict && (
        <Panel className="rounded-xl border border-border p-4">
          <Stack className="gap-3">
            <p className="font-semibold text-sm">Version Conflict</p>
            <p className="text-xs text-muted">Server title: {ws.title}</p>
            <Row className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => draft.reload(ws.title, ws.draftRevision)}
              >
                Discard My Edit
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const value = draft.value
                  draft.reload(ws.title, ws.draftRevision)
                  draft.setValue(value)
                }}
              >
                Overwrite Version
              </Button>
            </Row>
          </Stack>
        </Panel>
      )}
      {draft.blocker.state === 'blocked' && (
        <Panel aria-label="Unsaved changes" className="rounded-xl border border-border p-4">
          <Stack className="gap-3">
            <p className="font-semibold text-sm">Unsaved Changes</p>
            <p className="text-xs text-muted">You have unsaved edits in progress.</p>
            <Row className="gap-2">
              <Button size="sm" autoFocus onClick={() => draft.blocker.reset?.()}>
                Keep Editing
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={draft.pending}
                onClick={() => draft.blocker.proceed?.()}
              >
                Discard and Leave
              </Button>
            </Row>
          </Stack>
        </Panel>
      )}
    </Stack>
  )
}

