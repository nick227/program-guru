import { useState } from 'react'
import {
  useActivityMyMedia,
  useAttachMedia,
  useDetachMedia,
} from '@project/sdk'
import {
  groupActivityMedia,
  historyDate,
  type HistoryItem,
} from '@/lib/activityMediaHistory'
import { useOnline } from '@/lib/useOnline'
import { MediaItem } from './MediaGrid'
import { MediaPicker } from './MediaPicker'
import { MediaViewer } from './MediaViewer'
import { Button } from './ui/Button'
import { ErrorMessage, Loading } from './ui/Feedback'
import { Grid, Row, Stack } from './ui/Layout'

/** History stays inside My Media; no navigation or changes to current results. */
export function ActivityMediaHistory({
  activityId,
  currentSessionId,
}: {
  activityId: string
  currentSessionId?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const history = useActivityMyMedia(activityId, {}, expanded)
  const detach = useDetachMedia()
  const attach = useAttachMedia()
  const online = useOnline()
  const [viewing, setViewing] = useState<HistoryItem | null>(null)
  const [picking, setPicking] = useState<HistoryItem | null>(null)
  const [removed, setRemoved] = useState<HistoryItem[]>([])
  const groups = groupActivityMedia(
    history.data?.pages.flatMap((page) => page.data) ?? [],
  )
  const busy = detach.isPending || attach.isPending
  async function restore(item: HistoryItem) {
    await attach.mutateAsync({
      mediaId: item.attachment.mediaId,
      target: { kind: 'RESULT_ENTRY', id: item.resultEntryId },
      purpose: item.attachment.purpose,
      position: item.attachment.position,
    })
    setRemoved((items) =>
      items.filter((row) => row.attachment.id !== item.attachment.id),
    )
  }
  return (
    <Stack>
      <Button
        variant="outline"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? 'Hide media history' : 'Media from all attempts'}
      </Button>
      {expanded && (
        <section aria-label="Activity media history" className="space-y-4">
          <Row className="justify-between">
            <p className="text-sm text-muted">
              Your private recordings · all attempts
            </p>
            <Button
              variant="ghost"
              disabled={history.isFetching || !online || busy}
              onClick={() => void history.refetch()}
            >
              Refresh history
            </Button>
          </Row>
          <ErrorMessage
            error={history.error}
            retry={() => void history.refetch()}
          />
          <ErrorMessage error={detach.error || attach.error} />
          {history.isPending && <Loading />}
          {!history.error && !history.isPending && (
            <>
              {!groups.length && (
                <p>No media attached to your attempts yet.</p>
              )}
              {groups.map(({ sessionId, items }) => (
                <Stack key={sessionId} className="border-t pt-4">
                  <h3>
                    {historyDate(items[0]!)} ·{' '}
                    {sessionId === currentSessionId
                      ? 'Current attempt'
                      : 'Earlier attempt'}{' '}
                    · {items[0]!.sessionStatus.toLowerCase()}
                  </h3>
                  <p className="text-xs text-muted">
                    Session {sessionId.slice(-8)} · Recorded{' '}
                    {new Date(items[0]!.recordedAt).toLocaleString()}
                  </p>
                  {items.map((item) => {
                    const link = item.attachment
                    const available =
                      !link.mediaDeleted && link.mediaState === 'READY'
                    return (
                      <Row
                        key={link.id}
                        aria-label={`Historical attachment ${link.media.alt || link.media.type}`}
                      >
                        <Grid className="w-16 shrink-0 grid-cols-1 gap-0">
                          <MediaItem
                            asset={{ ...link.media, state: link.mediaState }}
                            disabled={!available}
                            onSelect={() => setViewing(item)}
                          />
                        </Grid>
                        <span className="min-w-0 flex-1 text-sm">
                          {link.media.alt || link.media.type}
                          {item.instructionId ? ' · Instruction' : ''}
                          {link.mediaDeleted
                            ? ' · deleted'
                            : !available
                              ? ` · ${link.mediaState.toLowerCase()}`
                              : ''}
                        </span>
                        <Button
                          variant="outline"
                          disabled={!online || busy}
                          onClick={async () => {
                            try {
                              await detach.mutateAsync(link.id)
                              if (!link.mediaDeleted)
                                setRemoved((previous) => [...previous, item])
                            } catch {
                              /* The persisted row stays visible on failure. */
                            }
                          }}
                        >
                          Detach
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={!online || busy}
                          onClick={() => setPicking(item)}
                        >
                          Attach to this attempt
                        </Button>
                      </Row>
                    )
                  })}
                </Stack>
              ))}
              {removed.map((item) => (
                <Row key={item.attachment.id}>
                  <span className="text-sm">
                    Detached {item.attachment.media.alt || 'media'} ·{' '}
                    {historyDate(item)}
                  </span>
                  <Button
                    variant="outline"
                    disabled={
                      !online ||
                      busy ||
                      item.attachment.mediaState !== 'READY'
                    }
                    onClick={() => void restore(item).catch(() => {})}
                  >
                    Undo detach
                  </Button>
                </Row>
              ))}
              {history.hasNextPage && (
                <Button
                  variant="outline"
                  disabled={history.isFetchingNextPage || !online}
                  onClick={() => void history.fetchNextPage()}
                >
                  Load older media
                </Button>
              )}
            </>
          )}
          {!history.error && viewing && (
            <MediaViewer
              items={[viewing.attachment.media]}
              index={0}
              onIndex={() => {}}
              onClose={() => setViewing(null)}
            />
          )}
          {!history.error && picking && (
            <MediaPicker
              title={`Attach to attempt · ${historyDate(picking)}`}
              context={{
                kind: 'Activity',
                resultEntryId: picking.resultEntryId,
              }}
              onClose={() => setPicking(null)}
              onSelect={async (asset) => {
                await attach.mutateAsync({
                  mediaId: asset.id,
                  target: { kind: 'RESULT_ENTRY', id: picking.resultEntryId },
                  purpose: 'JOURNAL',
                })
                setRemoved((items) =>
                  items.filter(
                    (item) =>
                      item.resultEntryId !== picking.resultEntryId ||
                      item.attachment.mediaId !== asset.id,
                  ),
                )
              }}
            />
          )}
        </section>
      )}
    </Stack>
  )
}
