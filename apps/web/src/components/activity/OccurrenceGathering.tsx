import { useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  useCreateGatheringLink,
  useGathering,
  useLeaveGathering,
  useUpdateGathering,
  type components,
} from '@project/sdk'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ShareLinkField } from '@/components/social/ShareLink'
import { DoItAgain, GatheringSuggestion } from './GatheringSuggestion'
import { GatheringCategoriesPicker } from './GatheringCategoriesPicker'

type S = components['schemas']
export type HeroPhase = 'before' | 'during' | 'after'

/**
 * Gathering presence inside the existing occurrence Hero (10 §9, §9.11). The emphasis follows the
 * phase: before, who is coming; during, nothing that competes with session controls; after, the
 * completion and shared memories. The locked row order below the Hero never changes (03 §6).
 */
export function OccurrenceGathering({
  item,
  activity,
  phase,
  sharedCount,
  gathering: suppliedGathering,
}: {
  item: S['CalendarItem']
  activity?: S['ActivityDetail']
  phase: HeroPhase
  sharedCount: number
  gathering?: S['Gathering']
}) {
  const gathering = useGathering(suppliedGathering ? null : item.gatheringId)
  const link = useCreateGatheringLink()
  const leave = useLeaveGathering()
  const update = useUpdateGathering()
  const [url, setUrl] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  if (item.gatheringId) {
    const g = suppliedGathering ?? gathering.data
    if (!g) return null
    if (phase === 'during') return null
    if (phase === 'after') {
      return (
        <div className="activity-hero__gathering">
          <a href="#related-media" className="activity-hero__memories">
            <ImageIcon size={14} aria-hidden />
            {sharedCount > 0 ? `${sharedCount} shared ${sharedCount === 1 ? 'photo or video' : 'photos and videos'} · View` : 'Share a photo or video from this time'}
          </a>
          {g.viewerIsMember && <DoItAgain gathering={g} />}
        </div>
      )
    }
    const onLeave = async () => {
      if (!window.confirm('Leave this gathering? It stays on your Calendar as your own Activity.')) return
      try {
        await leave.mutateAsync({ gatheringId: g.id })
        toast.success('You left the gathering. It is still on your Calendar.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not leave')
      }
    }
    const onLink = async () => {
      try {
        setUrl((await link.mutateAsync({ gatheringId: g.id })).url)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not create a link')
      }
    }
    const onListing = async (listPublicly: boolean) => {
      try {
        await update.mutateAsync({ gatheringId: g.id, listPublicly })
        toast.success(listPublicly ? 'Listed publicly' : 'Only people with the link can join now')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update')
      }
    }
    return (
      <div className="activity-hero__gathering">
        <div className="activity-hero__gathering-actions">
          {g.status === 'ACTIVE' && !g.isPast && !url && (
            <Button size="sm" variant="outline" loading={link.isPending} onClick={() => void onLink()}>
              Share link
            </Button>
          )}
          {g.viewerIsOwner && g.status === 'ACTIVE' && activity?.visibility === 'PUBLIC' && (
            <Button size="sm" variant="ghost" loading={update.isPending} onClick={() => void onListing(g.visibility !== 'PUBLIC')}>
              {g.visibility === 'PUBLIC' ? 'Stop listing publicly' : 'List publicly'}
            </Button>
          )}
          {g.viewerIsOwner && g.status === 'ACTIVE' && !editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit details
            </Button>
          )}
          <Button size="sm" variant="ghost" loading={leave.isPending} onClick={() => void onLeave()}>
            Leave gathering
          </Button>
        </div>
        {editing && (
          <GatheringDetailsEditor
            gathering={g}
            onDone={() => setEditing(false)}
            save={(body) => update.mutateAsync({ gatheringId: g.id, ...body })}
          />
        )}
        {url && <ShareLinkField url={url} shareTitle={activity?.title ?? 'Join me'} copiedMessage="Link copied" inputLabel="Gathering link" />}
      </div>
    )
  }

  if (phase !== 'before') return null
  return <GatheringSuggestion item={item} />
}

/** Owner-only: the Looking for note and up to 3 additional Categories (10 §9.12). */
function GatheringDetailsEditor({
  gathering,
  onDone,
  save,
}: {
  gathering: S['Gathering']
  onDone: () => void
  save: (body: { lookingFor: string | null; focusIds: string[] }) => Promise<unknown>
}) {
  const [lookingFor, setLookingFor] = useState(gathering.lookingFor ?? '')
  const [focusIds, setFocusIds] = useState(gathering.categories.filter((c) => !c.inherited).map((c) => c.id))
  const [saving, setSaving] = useState(false)
  const inherited = gathering.categories.filter((c) => c.inherited).map((c) => c.id)
  const onSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await save({ lookingFor: lookingFor.trim() || null, focusIds })
      toast.success('Saved')
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }
  return (
    <form onSubmit={(e) => void onSave(e)} className="activity-gatherings__form" aria-label="Gathering details">
      <label className="activity-gatherings__field">
        <span className="label">Looking for (optional)</span>
        <Input value={lookingFor} maxLength={140} onChange={(e) => setLookingFor(e.target.value)} placeholder="e.g. Looking for actors and lighting help" />
      </label>
      <GatheringCategoriesPicker value={focusIds} onChange={setFocusIds} inherited={inherited} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={saving}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
