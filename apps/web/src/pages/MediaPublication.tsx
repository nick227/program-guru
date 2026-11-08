import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  useAddMediaComment,
  useMediaComments,
  useMediaPublicationDetail,
} from '@project/sdk'
import { Page, Stage, Stack, Panel, Row } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/Navigation'
import { dateLabel } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { buildGroupUrl, buildProfileUrl } from '@/lib/urls'

export function MediaPublicationPage() {
  const { id = '' } = useParams()
  const pub = useMediaPublicationDetail(id)
  useDocumentTitle(pub.data?.media.alt || 'Media')
  const comments = useMediaComments(id)
  const addComment = useAddMediaComment(id)
  const online = useOnline()
  const [body, setBody] = useState('')

  const data = pub.data
  const commentRows =
    comments.data?.pages.flatMap((page) => page.data) ?? []

  return (
    <Page>
      <Stage>
        <Row className="justify-between">
          <Back to="/notifications">Notifications</Back>
          <Link to="/" className={linkButton}>
            Calendar
          </Link>
        </Row>

        <ErrorMessage
          error={pub.error || comments.error || addComment.error}
          retry={() => void pub.refetch()}
        />

        {pub.isPending ? (
          <Loading />
        ) : !data ? (
          <Panel>
            <p className="text-muted">Media publication not found.</p>
          </Panel>
        ) : (
          <Stack className="gap-4">
            <Panel>
              <Stack className="gap-3">
                <Row className="justify-between">
                  {data.creator ? (
                    <Link
                      to={buildProfileUrl(data.creator.handle)}
                      className="flex items-center gap-2 hover:underline"
                    >
                      <Avatar
                        src={data.creator.avatarUrl}
                        name={data.creator.displayName}
                        size="sm"
                      />
                      <span>{data.creator.displayName}</span>
                    </Link>
                  ) : (
                    <span className="text-sm text-muted">Shared media</span>
                  )}
                  <span className="text-xs text-muted">
                    {data.audience === 'GROUP' ? 'Group media' : 'Public media'}{' '}
                    · {data.status}
                  </span>
                </Row>

                {data.media.thumbnailUrl && (
                  <img
                    src={data.media.thumbnailUrl}
                    alt={data.media.alt}
                    className="max-h-96 w-full rounded-lg object-cover"
                  />
                )}

                {data.caption && <p>{data.caption}</p>}

                <Row className="gap-3 text-xs text-muted">
                  <span>{data.likes} likes</span>
                  <span>{data.commentCount} comments</span>
                  {data.groupId && (
                    <Link
                      to={buildGroupUrl(data.groupId)}
                      className="text-accent underline"
                    >
                      Open Group
                    </Link>
                  )}
                  {data.activityId && (
                    <Link
                      to={`/activities/${data.activityId}`}
                      className="text-accent underline"
                    >
                      Open Activity
                    </Link>
                  )}
                </Row>
              </Stack>
            </Panel>

            {data.audience === 'GROUP' && (
              <Panel>
                <Stack className="gap-3">
                  <h2>Group Discussion</h2>
                  {commentRows.length === 0 ? (
                    <p className="text-sm text-muted">No comments yet.</p>
                  ) : (
                    <Stack className="gap-2">
                      {commentRows.map((c) => (
                        <div key={c.id} className="rounded-lg border p-3">
                          <Row className="justify-between text-xs text-muted">
                            <span className="font-medium text-text">
                              {c.author.displayName} (@{c.author.handle})
                            </span>
                            <span>{dateLabel(c.createdAt.slice(0, 10))}</span>
                          </Row>
                          <p className="mt-1 text-sm">{c.body}</p>
                        </div>
                      ))}
                    </Stack>
                  )}

                  <Row className="items-end gap-2">
                    <label className="min-w-0 flex-1 space-y-1 text-sm">
                      <span>Add a comment</span>
                      <Input
                        value={body}
                        placeholder="Write a comment…"
                        disabled={!online || addComment.isPending}
                        onChange={(e) => setBody(e.target.value)}
                      />
                    </label>
                    <Button
                      disabled={!online || !body.trim()}
                      loading={addComment.isPending}
                      onClick={async () => {
                        try {
                          await addComment.mutateAsync({
                            body: body.trim(),
                            idempotencyKey: crypto.randomUUID(),
                          })
                          setBody('')
                        } catch {
                          /* shown above */
                        }
                      }}
                    >
                      Post comment
                    </Button>
                  </Row>
                </Stack>
              </Panel>
            )}
          </Stack>
        )}
      </Stage>
    </Page>
  )
}
