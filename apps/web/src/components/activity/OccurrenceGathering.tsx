import { useState } from 'react'
import { lookingForText } from '@/lib/lookingFor'
import { Image as ImageIcon, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  useCreateGathering,
  useCreateGatheringLink,
  useGathering,
  useLeaveGathering,
  useUpdateGathering,
  type components,
} from '@project/sdk'
import { Avatar } from '@/components/ui/Avatar'
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
}: {
  item: S['CalendarItem']
  activity?: S['ActivityDetail']
  phase: HeroPhase
  sharedCount: number
}) {
  const gathering = useGathering(item.gatheringId)
  const create = useCreateGathering()
  const link = useCreateGatheringLink()
  const leave = useLeaveGathering()
  const update = useUpdateGathering()
  const [url, setUrl] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  if (item.gatheringId) {
    const g = gathering.data
    if (!g) return null
    const line = (
      <p className="activity-hero__gathering-line">
        <Users size={14} aria-hidden />
        <span>
          {g.memberCount} {g.memberCount === 1 ? 'person' : 'people'}
          {g.capacity ? ` of ${g.capacity}` : ''}
          {phase === 'after' ? ` · ${g.completedCount} finished` : ` · ${g.visibility === 'PUBLIC' ? 'listed publicly' : 'invite only'}`}
        </span>
      </p>
    )
    if (phase === 'during') return <div className="activity-hero__gathering">{line}</div>
    if (phase === 'after') {
      return (
        <div className="activity-hero__gathering">
          <a href="#related-media" className="activity-hero__memories">
            <ImageIcon size={14} aria-hidden />
            {sharedCount > 0 ? `${sharedCount} shared ${sharedCount === 1 ? 'photo or video' : 'photos and videos'} · View` : 'Share a photo or video from this time'}
          </a>
          {line}
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
        {line}
        {g.lookingFor && <p className="activity-gatherings__looking">{lookingForText(g.lookingFor)}</p>}
        {g.members.length > 1 && (
          <span className="activity-hero__gathering-people" aria-label={g.members.map((m) => m.displayName).join(', ')}>
            {g.members.slice(0, 6).map((m) => (
              <Avatar key={m.id} src={m.avatarUrl} name={m.displayName} size="sm" className="h-7 w-7 ring-2 ring-surface" />
            ))}
          </span>
        )}
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
  // A personal or solo-Program item can join a real gathering that day, or be opened to others in place.
  const canOpen =
    item.status === 'PLANNED' && !item.groupName && !!activity && activity.status === 'PUBLISHED' && activity.visibility !== 'PRIVATE'
  const onOpen = async () => {
    try {
      await create.mutateAsync({
        activityId: item.activityId,
        localDate: item.localDate,
        localTime: item.localTime,
        placeId: item.place?.id ?? null,
        calendarItemId: item.id,
        idempotencyKey: crypto.randomUUID(),
      })
      toast.success('Open to others. Share the link to invite people.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open this to others')
    }
  }
  return (
    <div className="activity-hero__gathering">
      <GatheringSuggestion item={item} />
      {canOpen && (
        <Button size="sm" variant="outline" loading={create.isPending} onClick={() => void onOpen()} className="self-start">
          <Users size={14} aria-hidden />
          Open to others
        </Button>
      )}
    </div>
  )
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
