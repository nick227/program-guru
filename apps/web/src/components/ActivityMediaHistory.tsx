import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  queryKeys,
  useActivityMyAttempts,
  useAttachMedia,
  useAttachSessionMedia,
  useCurrentUser,
  useDetachMedia,
  useMediaAttachments,
  type components,
} from '@project/sdk'
import {
  attemptDate,
  type Attempt,
  type AttemptEntry,
} from '@/lib/activityMediaHistory'
import { useOnline } from '@/lib/useOnline'
import { MediaItem } from './MediaGrid'
import { MediaPicker } from './MediaPicker'
import { MediaViewer } from './MediaViewer'
import { Button } from './ui/Button'
import { ErrorMessage, Loading } from './ui/Feedback'
import { Grid, Row, Stack } from './ui/Layout'

type Attachment = components['schemas']['MediaAttachment']

/** One persisted result target; even an empty list still offers attachment to that exact ID. */
function ResultMedia({
  entry,
  label,
  multiple,
}: {
  entry: AttemptEntry
  label: string
  multiple: boolean
}) {
  const context = {
    kind: 'Activity' as const,
    resultEntryId: entry.resultEntryId,
  }
  const links = useMediaAttachments(context)
  const detach = useDetachMedia()
  const attach = useAttachMedia()
  const online = useOnline()
  const [viewing, setViewing] = useState<Attachment | null>(null)
  const [picking, setPicking] = useState(false)
  const [removed, setRemoved] = useState<Attachment[]>([])
  const rows = links.data?.pages.flatMap((page) => page.data) ?? []
  const busy = detach.isPending || attach.isPending
  return (
    <Stack
      aria-label={
        entry.instructionId
          ? 'Instruction result media'
          : 'Activity result media'
      }
    >
      {(multiple || entry.instructionId) && (
        <p className="text-xs text-muted">
          {entry.instructionId ? 'Instruction result' : 'Activity result'} ·{' '}
          {new Date(entry.recordedAt).toLocaleString()}
        </p>
      )}
      <ErrorMessage error={links.error} retry={() => void links.refetch()} />
      <ErrorMessage error={detach.error || attach.error} />
      {links.isPending && <Loading />}
      {!links.error && !links.isPending && (
        <>
          {rows.length === 0 && (
            <p className="text-sm text-muted">
              No media attached to this result.
            </p>
          )}
          {rows.map((link) => (
            <Row
              key={link.id}
              aria-label={`Historical attachment ${link.media.alt || link.media.type}`}
            >
              <Grid className="w-16 shrink-0 grid-cols-1 gap-0">
                <MediaItem
                  asset={{ ...link.media, state: link.mediaState }}
                  disabled={link.mediaDeleted || link.mediaState !== 'READY'}
                  onSelect={() => setViewing(link)}
                />
              </Grid>
              <span className="min-w-0 flex-1 text-sm">
                {link.media.alt || link.media.type}
                {link.mediaDeleted
                  ? ' · deleted'
                  : link.mediaState !== 'READY'
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
                      setRemoved((previous) => [...previous, link])
                  } catch {
                    /* Keep the server row on failure. */
                  }
                }}
              >
                Detach
              </Button>
            </Row>
          ))}
          {removed.map((link) => (
            <Row key={link.id}>
              <span className="text-sm">
                Detached {link.media.alt || 'media'}
              </span>
              <Button
                variant="outline"
                disabled={!online || busy || link.mediaState !== 'READY'}
                onClick={async () => {
                  try {
                    await attach.mutateAsync({
                      mediaId: link.mediaId,
                      target: { kind: 'RESULT_ENTRY', id: entry.resultEntryId },
                      purpose: link.purpose,
                      position: link.position,
                    })
                    setRemoved((items) =>
                      items.filter((item) => item.id !== link.id),
                    )
                  } catch {
                    /* Mutation error stays visible; retry explicitly. */
                  }
                }}
              >
                Undo detach
              </Button>
            </Row>
          ))}
          {links.hasNextPage && (
            <Button
              variant="outline"
              disabled={!online || links.isFetchingNextPage}
              onClick={() => void links.fetchNextPage()}
            >
              More attachments
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={!online || busy}
            onClick={() => setPicking(true)}
          >
            {multiple || entry.instructionId
              ? 'Attach to this result'
              : 'Attach to this attempt'}
          </Button>
        </>
      )}
      {!links.error && viewing && (
        <MediaViewer
          items={[viewing.media]}
          index={0}
          onIndex={() => {}}
          onClose={() => setViewing(null)}
        />
      )}
      {!links.error && picking && (
        <MediaPicker
          title={`Attach to attempt · ${label}`}
          context={context}
          onClose={() => setPicking(false)}
          onSelect={async (asset) => {
            await attach.mutateAsync({
              mediaId: asset.id,
              target: { kind: 'RESULT_ENTRY', id: entry.resultEntryId },
              purpose: 'JOURNAL',
            })
            setRemoved((items) =>
              items.filter((item) => item.mediaId !== asset.id),
            )
          }}
        />
      )}
    </Stack>
  )
}

/** Creating a first result is explicit and uses the existing session, never a new attempt. */
function EmptyAttempt({ attempt, label }: { attempt: Attempt; label: string }) {
  const [picking, setPicking] = useState(false)
  const attach = useAttachSessionMedia()
  const online = useOnline()
  return (
    <Stack>
      <p className="text-sm text-muted">
        No results recorded for this attempt.
      </p>
      {attempt.status !== 'ABANDONED' && (
        <Button
          variant="ghost"
          disabled={!online || attach.isPending}
          onClick={() => setPicking(true)}
        >
          Attach to this attempt
        </Button>
      )}
      {picking && (
        <MediaPicker
          title={`Attach to attempt · ${label}`}
          onClose={() => setPicking(false)}
          onSelect={async (asset) => {
            await attach.mutateAsync({
              sessionId: attempt.sessionId,
              mediaId: asset.id,
            })
          }}
        />
      )}
    </Stack>
  )
}

/** Keep attachment fetching bounded to attempts the viewer chooses to manage. */
function AttemptMedia({
  attempt,
  current,
  timezone,
}: {
  attempt: Attempt
  current: boolean
  timezone: string
}) {
  const [open, setOpen] = useState(current)
  const label = attemptDate(attempt, timezone)
  return (
    <Stack
      className="border-t pt-4"
      aria-label={`Attempt ${attempt.sessionId}`}
    >
      <h3>
        {label} · {current ? 'Current attempt' : 'Earlier attempt'} ·{' '}
        {attempt.status.toLowerCase()}
      </h3>
      <p className="text-xs text-muted">
        Session {attempt.sessionId.slice(-8)} ·{' '}
        {new Date(attempt.startedAt ?? attempt.createdAt).toLocaleString(
          undefined,
          { timeZone: timezone },
        )}
      </p>
      <Button
        variant="outline"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Hide media' : 'Manage media'}
      </Button>
      {open && (
        <>
          {attempt.entries.map((entry) => (
            <ResultMedia
              key={entry.resultEntryId}
              entry={entry}
              label={label}
              multiple={attempt.entries.length > 1}
            />
          ))}
          {!attempt.entries.length && (
            <EmptyAttempt attempt={attempt} label={label} />
          )}
        </>
      )}
    </Stack>
  )
}

/** History stays inside My Media. Sessions and result targets never depend on attachment existence. */
export function ActivityMediaHistory({
  activityId,
  currentSessionId,
}: {
  activityId: string
  currentSessionId?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const history = useActivityMyAttempts(activityId, undefined, expanded)
  const cache = useQueryClient()
  const me = useCurrentUser()
  const timezone = me.data?.data.preferences.timezone ?? 'UTC'
  const online = useOnline()
  const attempts = history.data?.pages.flatMap((page) => page.data) ?? []
  return (
    <Stack>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
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
              disabled={history.isFetching || !online}
              onClick={() =>
                void cache.invalidateQueries({ queryKey: queryKeys.media })
              }
            >
              Refresh history
            </Button>
          </Row>
          <ErrorMessage
            error={history.error}
            retry={() => void history.refetch()}
          />
          {history.isPending && <Loading />}
          {!history.error && !history.isPending && (
            <>
              {!attempts.length && <p>No attempts yet.</p>}
              {attempts.map((attempt) => (
                <AttemptMedia
                  key={attempt.sessionId}
                  attempt={attempt}
                  current={attempt.sessionId === currentSessionId}
                  timezone={timezone}
                />
              ))}
              {history.hasNextPage && (
                <Button
                  variant="outline"
                  disabled={!online || history.isFetchingNextPage}
                  onClick={() => void history.fetchNextPage()}
                >
                  Load older attempts
                </Button>
              )}
            </>
          )}
        </section>
      )}
    </Stack>
  )
}
