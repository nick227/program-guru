// The conversation that belongs to an Activity (10-COLLABORATION §1, §5): comments on media a
// member explicitly shared with the group, opened in the same viewer as Related Media. P1 has
// no free-standing chat; this is the lightweight thread attached to a shared moment.
import { useState } from 'react'
import {
  useAddMediaComment,
  useMediaComments,
  useMediaPublication,
} from '@project/sdk'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Row, Stack } from '@/components/ui/Layout'
import { useOnline } from '@/lib/useOnline'
import { timeAgo } from '@/lib/relativeTime'

export function GroupMediaThread({ publicationId }: { publicationId: string }) {
  const comments = useMediaComments(publicationId)
  const add = useAddMediaComment(publicationId)
  const online = useOnline()
  const [body, setBody] = useState('')
  const rows = comments.data?.pages.flatMap((page) => page.data) ?? []
  async function send() {
    const text = body.trim()
    if (!text) return
    try {
      await add.mutateAsync({ body: text, idempotencyKey: crypto.randomUUID() })
      setBody('')
    } catch {
      /* shown below */
    }
  }
  return (
    <section
      aria-label="Group comments"
      className="mx-auto w-full max-w-xl rounded-xl bg-white/5 p-3 text-sm"
    >
      <Stack className="gap-2">
        {comments.isPending ? (
          <Loading />
        ) : rows.length ? (
          <ul className="flex max-h-48 flex-col gap-2 overflow-auto">
            {rows.map((c) => (
              <li key={c.id} className="flex gap-2">
                <Avatar src={c.author.avatarUrl} name={c.author.displayName} size="sm" />
                <p>
                  <strong className="font-medium">{c.author.displayName}</strong>{' '}
                  <span className="text-white/60">{timeAgo(c.createdAt)}</span>
                  <br />
                  <span className="whitespace-pre-wrap break-words">{c.body}</span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-white/70">Say something to the group about this.</p>
        )}
        {comments.hasNextPage && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start text-white hover:bg-white/10"
            onClick={() => void comments.fetchNextPage()}
          >
            Earlier comments
          </Button>
        )}
        <ErrorMessage error={comments.error || add.error} />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <label className="sr-only" htmlFor={`comment-${publicationId}`}>
            Comment for the group
          </label>
          <input
            id={`comment-${publicationId}`}
            value={body}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Comment for the group"
            className="min-h-11 flex-1 rounded-lg border border-white/20 bg-transparent px-3 text-white placeholder:text-white/50"
          />
          <Button
            type="submit"
            disabled={!online || !body.trim() || add.isPending}
            loading={add.isPending}
          >
            Send
          </Button>
        </form>
      </Stack>
    </section>
  )
}

/** Explicit, per-item consent to show one of your own photos or videos to the group. */
export function ShareWithGroup({
  mediaId,
  groupId,
  occurrenceKey,
  onShared,
}: {
  mediaId: string
  groupId: string
  occurrenceKey: string
  onShared?: () => void
}) {
  const publish = useMediaPublication()
  const online = useOnline()
  const [done, setDone] = useState(false)
  return (
    <Row className="mx-auto w-full max-w-xl justify-between gap-2 rounded-xl bg-white/5 p-3 text-sm">
      <span className="text-white/80">
        {done ? 'Shared with your group.' : 'Private to you. Group members can see it only if you share it.'}
      </span>
      {!done && (
        <Button
          size="sm"
          disabled={!online || publish.isPending}
          loading={publish.isPending}
          onClick={async () => {
            try {
              await publish.mutateAsync({ mediaId, audience: 'GROUP', groupId, occurrenceKey })
              setDone(true)
              toast.success('Shared with your group')
              onShared?.()
            } catch {
              /* shown below */
            }
          }}
        >
          Share with group
        </Button>
      )}
      <ErrorMessage error={publish.error} />
    </Row>
  )
}
