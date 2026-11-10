// One Report action for Programs, Activities, media and profiles (12-SOCIAL §7). Signed-in viewers
// only; the report enters the moderation queue (Admin → Moderation). Callers hide it from owners.
import { useState } from 'react'
import { Flag } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateReport, useCurrentUser, type components } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { ErrorMessage } from '@/components/ui/Feedback'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'

type Target = components['schemas']['ReportTarget']
type Reason = components['schemas']['ReportReason']

const REASONS: { value: Reason; label: string }[] = [
  { value: 'UNSAFE', label: 'Unsafe guidance' },
  { value: 'MISLEADING', label: 'Misleading' },
  { value: 'HARASSMENT', label: 'Harassment' },
  { value: 'PRIVACY', label: 'Privacy' },
  { value: 'COPYRIGHT', label: 'Copyright' },
  { value: 'OTHER', label: 'Something else' },
]

/** `ownerId`: the content's owner, who never sees Report on their own content. */
export function ReportButton({ target, ownerId, label = 'Report' }: { target: Target; ownerId?: string | null; label?: string }) {
  const me = useCurrentUser()
  const [open, setOpen] = useState(false)
  if (!me.data || (ownerId && ownerId === me.data.data.id)) return null
  return (
    <>
      <Button variant="ghost" size="sm" className="gap-1.5 text-muted" onClick={() => setOpen(true)}>
        <Flag size={14} aria-hidden />
        {label}
      </Button>
      {open && <ReportDialog target={target} onClose={() => setOpen(false)} />}
    </>
  )
}

function ReportDialog({ target, onClose }: { target: Target; onClose: () => void }) {
  const report = useCreateReport()
  const [reason, setReason] = useState<Reason | ''>('')
  const [details, setDetails] = useState('')
  return (
    <Dialog onClose={onClose} aria-labelledby="report-title" className="w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-5 text-text backdrop:bg-black/40">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!reason) return
          try {
            await report.mutateAsync({ target, reason, ...(details.trim() ? { details: details.trim() } : {}) })
            toast.success('Thanks. A moderator will review it.')
            onClose()
          } catch {
            /* shown below */
          }
        }}
      >
        <h2 id="report-title" className="text-lg font-semibold">
          Report this
        </h2>
        <label className="field">
          <span className="label">Why?</span>
          <Select required value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
            <option value="">Choose a reason</option>
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="field">
          <span className="label">Details (optional)</span>
          <Textarea rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} />
        </label>
        <ErrorMessage error={report.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={report.isPending} disabled={!reason}>
            Send report
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
