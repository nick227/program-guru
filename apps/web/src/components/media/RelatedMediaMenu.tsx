import { useState } from 'react'
import { Menu } from 'lucide-react'
import { useMediaAsset, useDeleteMedia, useMediaPublication, useRevokeMediaPublication } from '@project/sdk'
import { ErrorMessage } from '@/components/ui/Feedback'
import { useOnline } from '@/lib/useOnline'

export function RelatedMediaMenu({ mediaId, activityId, group, publications = [], onChanged }: {
  mediaId: string
  activityId: string
  group?: { groupId: string; occurrenceKey: string } | null
  publications?: { id: string; audience: 'GROUP' | 'PUBLIC' }[]
  onChanged?: () => void
}) {
  const asset = useMediaAsset(mediaId)
  const [license, setLicense] = useState('')
  const [added, setAdded] = useState<typeof publications>([])
  const [revoked, setRevoked] = useState<string[]>([])
  const sharing = Array.from(new Map([...publications, ...added].filter(p => !revoked.includes(p.id)).map(p => [p.id, p])).values())
  const remove = useDeleteMedia()
  const publish = useMediaPublication()
  const revoke = useRevokeMediaPublication()
  const online = useOnline()
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await action(); onChanged?.(); setConfirm(false) } catch (err) { setError(err) }
    finally { setBusy(false) }
  }
  if (!asset.data?.isOwner) return null
  return <details className="group/media-menu" onKeyDown={event => { if (event.key === 'Escape') event.currentTarget.open = false }}>
    <summary aria-label="Media options" className="absolute right-1 top-1 z-20 flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full bg-black/70 text-white [&::-webkit-details-marker]:hidden"><Menu size={16} /></summary>
    <div className="absolute left-0 top-12 z-30 w-40 rounded-lg border border-border bg-surface p-2 shadow-lg">
      <fieldset disabled={busy || !online} className="flex flex-col gap-2 text-left text-sm [&>button]:min-h-11 [&>button]:rounded [&>button]:text-left [&>button]:hover:bg-surface-muted">
        {group && !sharing.some(p => p.audience === 'GROUP') && <button type="button" onClick={() => void run(async () => { const p = await publish.mutateAsync({ mediaId, audience: 'GROUP', ...group }); setAdded(list => [...list, p]) })}>Share with group</button>}
        {!sharing.some(p => p.audience === 'PUBLIC') && <><label>Public sharing licence<select className="mt-1 min-h-11 w-full rounded border bg-surface px-1" aria-label="Public sharing licence" value={license} onChange={event => setLicense(event.target.value)}><option value="">Choose licence</option><option value="All rights reserved">All rights reserved</option><option value="CC BY 4.0">CC BY 4.0</option><option value="CC0">CC0</option></select></label><button disabled={!license} type="button" onClick={() => void run(async () => { const p = await publish.mutateAsync({ mediaId, activityId, audience: 'PUBLIC', license }); setAdded(list => [...list, p]) })}>Share publicly</button></>}
        {sharing.map(p => <button key={p.id} type="button" onClick={() => void run(async () => { await revoke.mutateAsync(p.id); setRevoked(list => [...list, p.id]) })}>{p.audience === 'GROUP' ? 'Stop sharing with group' : 'Stop sharing publicly'}</button>)}
        {confirm ? <><p>Delete this media everywhere?</p><button type="button" onClick={() => void run(() => remove.mutateAsync(mediaId))}>Confirm delete</button><button type="button" onClick={() => setConfirm(false)}>Cancel</button></> : <button type="button" onClick={() => setConfirm(true)}>Delete media</button>}
      </fieldset>
      <ErrorMessage error={error} />
    </div>
  </details>
}
