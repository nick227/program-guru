import { useState } from 'react'
import {
  useMediaAttachments,
  useDetachMedia,
  type MediaContext,
  type components,
} from '@project/sdk'
import { MediaViewer } from './MediaViewer'
import { Button } from './ui/Button'
import { ErrorMessage, Loading } from './ui/Feedback'
import { Row, Stack } from './ui/Layout'
import { useOnline } from '@/lib/useOnline'

/** Reusable management projection for any existing target. Detach removes only the link. */
export function MediaAttachments({
  context,
  readOnly = false,
}: {
  context: MediaContext
  readOnly?: boolean
}) {
  const links = useMediaAttachments(context)
  const detach = useDetachMedia()
  const online = useOnline()
  const [viewing, setViewing] = useState<
    components['schemas']['MediaAttachment'] | null
  >(null)
  const rows = links.data?.pages.flatMap((page) => page.data) ?? []
  return (
    <Stack>
      <ErrorMessage error={links.error} retry={() => void links.refetch()} />
      <ErrorMessage error={detach.error} />
      {links.isPending ? (
        <Loading />
      ) : !links.error && !rows.length ? (
        <p>No attachments for this result.</p>
      ) : null}
      {!links.error &&
        rows.map((link) => (
          <Row
            key={link.id}
            className="justify-between"
            aria-label={`Attachment ${link.media.alt || link.media.type}`}
          >
            <span className="min-w-0 flex-1">
              {link.media.alt || link.media.type}
              {link.mediaDeleted
                ? ' · deleted'
                : link.mediaState !== 'READY'
                  ? ` · ${link.mediaState.toLowerCase()}`
                  : ''}
            </span>
            <Button
              variant="outline"
              disabled={link.mediaDeleted || link.mediaState !== 'READY'}
              onClick={() => setViewing(link)}
            >
              View
            </Button>
            {!readOnly && (
              <Button
                variant="outline"
                disabled={!online || detach.isPending}
                onClick={() => detach.mutate(link.id)}
              >
                Detach
              </Button>
            )}
          </Row>
        ))}
      {links.hasNextPage && (
        <Button
          disabled={links.isFetchingNextPage}
          variant="outline"
          onClick={() => void links.fetchNextPage()}
        >
          More attachments
        </Button>
      )}
      {viewing && (
        <MediaViewer
          items={[viewing.media]}
          index={0}
          onIndex={() => {}}
          onClose={() => setViewing(null)}
        />
      )}
    </Stack>
  )
}
