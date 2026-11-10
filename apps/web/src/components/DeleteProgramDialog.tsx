import { useDeleteProgram } from '@project/sdk'
import { toast } from 'sonner'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'

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
    <Dialog
      onClose={onClose}
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
    </Dialog>
  )
}
