import { useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateCheckIns, useMyGroups, type components } from '@project/sdk'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorMessage } from '@/components/ui/Feedback'
import { useMediaUploads } from '@/lib/useMediaUploads'
import { cn } from '@/lib/utils'

type S = components['schemas']

export interface CheckInActivityOption {
  id: string
  title: string
}

export function GroupCheckInModal({
  open,
  onClose,
  defaultGroupId,
  activityId,
  activityTitle,
  activityOptions,
  calendarItemId,
  onCheckedIn,
}: {
  open: boolean
  onClose: () => void
  defaultGroupId?: string
  activityId?: string
  activityTitle?: string
  activityOptions?: CheckInActivityOption[]
  calendarItemId?: string | null
  onCheckedIn?: (shares: S['CompletionShare'][]) => void
}) {
  const groups = useMyGroups(open)
  const checkIn = useCreateCheckIns()
  const [selectedActivityId, setSelectedActivityId] = useState(
    activityId ?? activityOptions?.[0]?.id ?? '',
  )
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    defaultGroupId ? [defaultGroupId] : [],
  )
  const [note, setNote] = useState('')
  const [attachedMedia, setAttachedMedia] = useState<S['MediaAsset'] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { uploads, send } = useMediaUploads({
    onReady: (asset) => {
      setAttachedMedia(asset)
    },
  })

  const allGroups = groups.data?.pages.flatMap((page) => page.data) ?? []
  const uploading = uploads.some((u) => u.stage === 'uploading' || u.stage === 'processing')

  useEffect(() => {
    if (!open) return
    setSelectedActivityId(activityId ?? activityOptions?.[0]?.id ?? '')
    setSelectedGroupIds(defaultGroupId ? [defaultGroupId] : [])
    setNote('')
    setAttachedMedia(null)
  }, [open, activityId, activityOptions, defaultGroupId])

  useEffect(() => {
    if (open && !selectedGroupIds.length && allGroups.length === 1) {
      setSelectedGroupIds([allGroups[0]!.id])
    }
  }, [open, selectedGroupIds.length, allGroups])

  if (!open) return null

  const toggleGroup = (id: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedActivityId || !selectedGroupIds.length || checkIn.isPending || uploading) return
    try {
      const shares = await checkIn.mutateAsync({
        activityId: selectedActivityId,
        groupIds: selectedGroupIds,
        calendarItemId: calendarItemId ?? null,
        note: note.trim() || null,
        mediaId: attachedMedia?.id ?? null,
        idempotencyKey: crypto.randomUUID(),
      })
      toast.success(
        selectedGroupIds.length === 1
          ? 'Checked in with group'
          : `Checked in with ${selectedGroupIds.length} groups`,
      )
      onCheckedIn?.(shares)
      onClose()
    } catch {
      /* shown below */
    }
  }

  return (
    <Dialog aria-label="Share Check-in" onClose={onClose} className="max-w-md p-6">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Share Check-in</h2>
            <p className="text-xs text-muted">
              Let your groups know you completed this Activity. Metric details stay private.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close check-in dialog"
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {activityTitle && !activityOptions?.length ? (
          <div className="rounded-xl border border-border/70 bg-surface-muted/50 px-3.5 py-2.5 text-sm font-medium text-foreground">
            {activityTitle}
          </div>
        ) : activityOptions && activityOptions.length > 0 ? (
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Completed Activity</span>
            <Select
              aria-label="Completed Activity"
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
            >
              {activityOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.title}
                </option>
              ))}
            </Select>
          </label>
        ) : (
          <p className="text-xs text-muted">
            Complete an Activity in your Calendar first to share a check-in.
          </p>
        )}

        <div className="space-y-2">
          <span className="block text-sm font-medium text-foreground">
            Share to Groups
          </span>
          {allGroups.length === 0 ? (
            <p className="text-xs text-muted">Join or create a group first.</p>
          ) : (
            <ul className="space-y-1.5">
              {allGroups.map((g) => {
                const checked = selectedGroupIds.includes(g.id)
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      aria-pressed={checked}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                        checked
                          ? 'border-accent bg-accent/10 text-foreground'
                          : 'border-border/70 bg-surface text-muted hover:border-border hover:text-foreground',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Users size={14} aria-hidden className="shrink-0" />
                        <span className="truncate font-medium">
                          {g.name || g.programTitle}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                          checked
                            ? 'border-accent bg-accent text-accent-foreground'
                            : 'border-border',
                        )}
                      >
                        {checked && <Check size={12} strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-foreground">Check-in note (optional)</span>
          <Textarea
            rows={2}
            maxLength={500}
            value={note}
            placeholder="Share a quick thought with the group…"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                void send(file, { purpose: 'JOURNAL' })
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              loading={uploading}
              onClick={() => fileRef.current?.click()}
              className="gap-1.5"
            >
              <ImagePlus size={14} aria-hidden />
              <span>
                {attachedMedia ? 'Replace photo/video' : 'Attach photo or video'}
              </span>
            </Button>
            {attachedMedia && (
              <span className="text-xs font-medium text-status-completed">
                Media ready
              </span>
            )}
          </div>
        </div>

        <ErrorMessage error={checkIn.error} />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={checkIn.isPending}
            disabled={
              !selectedActivityId ||
              selectedGroupIds.length === 0 ||
              uploading ||
              checkIn.isPending
            }
          >
            Share Check-in
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

