import { useState } from 'react'
import { useCreateGroupInvitation, useGroup, useUpdateGroup } from '@project/sdk'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/Feedback'
import { Row, Stack } from '@/components/ui/Layout'
import { useOnline } from '@/lib/useOnline'

/** Tokens exist only in this mounted control; lists and notifications never store them. */
export function GroupInviteLink({
  groupId,
  variant = 'outline',
  size = 'md',
}: {
  groupId: string
  variant?: 'default' | 'outline'
  size?: 'sm' | 'md'
}) {
  const group = useGroup(groupId)
  const create = useCreateGroupInvitation(groupId)
  const update = useUpdateGroup(groupId)
  const online = useOnline()
  const [expanded, setExpanded] = useState(false)
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null)
  const [shareError, setShareError] = useState<unknown>(null)
  const g = group.data
  const owner = g?.myRole === 'OWNER'
  const allowed = owner || (g?.joinLinkEnabled && g.memberLinkSharingEnabled)
  const busy = create.isPending || update.isPending
  const visibleLink = allowed && g?.joinLinkEnabled ? link : null

  async function generate(rotate = false) {
    setShareError(null)
    try {
      const invitation = await create.mutateAsync({ kind: 'LINK', ...(rotate ? { rotate: true } : {}) })
      if (invitation.joinUrl) setLink({ url: invitation.joinUrl, expiresAt: invitation.expiresAt })
    } catch { /* mutation error below */ }
  }

  async function share(native = false) {
    if (!visibleLink) return
    try {
      if (native && navigator.share) await navigator.share({ title: 'Do this together', url: visibleLink.url })
      else {
        await navigator.clipboard.writeText(visibleLink.url)
        toast.success('Invite link copied')
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setShareError(error)
    }
  }

  return (
    <Stack className="gap-2">
      <Button variant={variant} size={size} disabled={!g} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        Invite people
      </Button>
      <ErrorMessage error={group.error} retry={() => void group.refetch()} />
      {expanded && g && (
        <Stack className="gap-2">
          <p className="text-xs text-muted">People with an invite link can sign in and join this Program with you. Everyone keeps their own Calendar and private results.</p>
          {allowed ? (
            <>
              <Row>
                <Button disabled={!online || busy} loading={create.isPending} onClick={() => void generate()}>
                  {visibleLink ? 'Create another invite link' : 'Create invite link'}
                </Button>
                {owner && g.joinLinkEnabled && (
                  <Button variant="outline" disabled={!online || busy} onClick={() => void generate(true)}>Replace all invite links</Button>
                )}
              </Row>
              {visibleLink && (
                <Stack className="gap-2">
                  <input aria-label="Invite link" readOnly value={visibleLink.url} className="min-h-11 w-full rounded-lg border bg-surface px-3 text-sm" onFocus={(event) => event.target.select()} />
                  <Row>
                    <Button disabled={!online || busy} onClick={() => void share()}>Copy invite link</Button>
                    {typeof navigator.share === 'function' && <Button variant="outline" disabled={!online || busy} onClick={() => void share(true)}>Share invite link</Button>}
                  </Row>
                  <p className="text-xs text-muted">Expires {new Date(visibleLink.expiresAt).toLocaleDateString()}. Copy it now; it won’t be shown again after leaving this page.</p>
                </Stack>
              )}
            </>
          ) : <p className="text-sm text-muted">The group owner has not enabled member link sharing. Ask them for an invitation.</p>}
          {owner && (
            <>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={g.memberLinkSharingEnabled ?? false} disabled={!online || busy} onChange={(event) => update.mutate({ memberLinkSharingEnabled: event.target.checked })} />
                Allow members to create invite links
              </label>
              {g.joinLinkEnabled && <Button variant="outline" disabled={!online || busy} onClick={async () => {
                try {
                  await update.mutateAsync({ joinLinkEnabled: false })
                  setLink(null)
                  toast.success('All invite links revoked')
                } catch { /* mutation error below */ }
              }}>Revoke all invite links</Button>}
              <p className="text-xs text-muted">Replacing or revoking links stops future joins through those links. Turning off member sharing revokes member-created links. Existing participants stay enrolled.</p>
            </>
          )}
          <ErrorMessage error={create.error || update.error || shareError} />
        </Stack>
      )}
    </Stack>
  )
}
