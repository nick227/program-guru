import { useEffect, useRef } from 'react'
import { useDeleteProgram } from '@project/sdk'
import { toast } from 'sonner'
import { Button } from './ui/Button'

/** Owner-only permanent delete with an explicit destructive confirmation (07-PROGRAMS.md §6). */
export function DeleteProgramDialog({
  program,
  onClose,
  onDeleted,
}: {
  program: { id: string; title: string }
  onClose: () => void
  onDeleted?: () => void
}) {
  const remove = useDeleteProgram()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  async function confirm() {
    try {
      const result = await remove.mutateAsync(program.id)
      toast.success(
        result.retainedForParticipants
          ? 'Program deleted. People already following it keep their own history.'
          : 'Program permanently deleted.',
      )
      onDeleted?.()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete Program')
    }
  }
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      className="library-confirm"
      aria-label="Delete Program"
    >
      <div>
        <h2>Delete “{program.title}” permanently?</h2>
        <p>
          This deletes the Program and your own schedule, sessions and results
          for it, and removes it from Creator Studio, My Programs, your Calendar
          and discovery. Nobody can join it again. People already following it
          keep their own history. This cannot be undone.
        </p>
        <Button
          variant="destructive"
          disabled={remove.isPending}
          onClick={() => void confirm()}
        >
          Delete permanently
        </Button>
        <Button variant="outline" disabled={remove.isPending} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </dialog>
  )
}
