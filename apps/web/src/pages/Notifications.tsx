import { Link } from 'react-router-dom'
import {
  useMarkNotificationsRead,
  useNotifications,
} from '@project/sdk'
import { Page, Stage, Stack, Panel, Row } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/Navigation'
import { dateLabel } from '@/lib/dates'

export function NotificationsPage() {
  const list = useNotifications()
  const mark = useMarkNotificationsRead()
  const rows = list.data?.pages.flatMap((p) => p.data) ?? []
  return (
    <Page>
      <Stage>
        <Back to="/">Calendar</Back>
        <Row className="justify-between">
          <h1>Notifications</h1>
          <Button
            variant="outline"
            disabled={!rows.some((n) => !n.readAt) || mark.isPending}
            loading={mark.isPending}
            onClick={() => mark.mutate({ all: true })}
          >
            Mark all read
          </Button>
        </Row>
        <ErrorMessage
          error={list.error || mark.error}
          retry={() => void list.refetch()}
        />
        {list.isPending ? (
          <Loading />
        ) : !rows.length ? (
          <Panel>
            <p className="text-muted">You are caught up.</p>
          </Panel>
        ) : (
          <Stack className="gap-2">
            {rows.map((n) => (
              <Panel
                key={n.id}
                className={n.readAt ? 'opacity-70' : 'border-accent'}
              >
                <p className="font-semibold">{n.title}</p>
                {n.actor && (
                  <p className="mt-2 text-muted">{n.actor.displayName}</p>
                )}
                <p className="mt-2 text-xs text-muted">
                  {dateLabel(n.createdAt.slice(0, 10))}
                </p>
                {n.deepLink && (
                  <Link to={n.deepLink} className={linkButton + ' mt-3'}>
                    Open
                  </Link>
                )}
              </Panel>
            ))}
          </Stack>
        )}
        {list.hasNextPage && (
          <Button variant="outline" onClick={() => void list.fetchNextPage()}>
            Load more
          </Button>
        )}
      </Stage>
    </Page>
  )
}
