import type { useSessionLeaveGuard } from '@/lib/useSessionLeaveGuard'
import { Button } from '@/components/ui/Button'

export function SessionLeavePrompt({ guard }: { guard: ReturnType<typeof useSessionLeaveGuard> }) {
  if (!guard.open) return null
  return <div className="activity-exec__confirm" role="alertdialog" aria-label="Unsaved results">
    <p className="text-sm font-semibold">{guard.busy ? 'Wait for the current save to finish.' : 'You have results that are not saved yet.'}</p>
    <div className="flex flex-wrap gap-2">
      <Button disabled={guard.busy} onClick={() => void guard.saveAndLeave()}>Save and close</Button>
      <Button variant="outline" disabled={guard.busy} onClick={guard.discardAndLeave}>Discard</Button>
      <Button variant="outline" autoFocus onClick={guard.keep}>Keep editing</Button>
    </div>
  </div>
}
