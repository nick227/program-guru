import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDeleteMedia, useUpdateMedia, type components } from '@project/sdk'
import { Page, Stage, Row, Stack } from '@/components/ui/Layout'
import { MediaLibrary } from '@/components/media/MediaLibrary'
import { MediaViewer } from '@/components/media/MediaViewer'
import { Back } from '@/components/shared/Navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage } from '@/components/ui/Feedback'
import { safeReturn } from '@/lib/dates'
import { useDocumentTitle } from '@/lib/title'
export function MediaStudioPage() {
  useDocumentTitle('Media Library')
  const [params] = useSearchParams()
  const [item, setItem] = useState<components['schemas']['MediaAsset'] | null>(
    null,
  )
  const [alt, setAlt] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const update = useUpdateMedia()
  const remove = useDeleteMedia()
  return (
    <Page>
      <Stage>
        <Back to={safeReturn(params.get('returnTo'))}>Back</Back>
        <h1>Media Library</h1>
        <MediaLibrary
          onSelect={(asset) => {
            setItem(asset)
            setAlt(asset.alt ?? '')
            setConfirmDelete(false)
            update.reset()
            remove.reset()
          }}
        />
        {item && (
          <MediaViewer
            items={[item]}
            index={0}
            onIndex={() => {}}
            onClose={() => setItem(null)}
          >
            {item.isOwner && (
              <Stack className="mx-auto w-full max-w-xl rounded-xl bg-surface p-4 text-text">
                <ErrorMessage error={update.error || remove.error} />
                <label>
                  Description
                  <Input
                    value={alt}
                    onChange={(event) => setAlt(event.target.value)}
                  />
                </label>
                <Row>
                  <Button
                    disabled={update.isPending || remove.isPending}
                    onClick={() => update.mutate({ mediaId: item.id, alt })}
                  >
                    Save description
                  </Button>
                  <Button
                    variant="outline"
                    disabled={remove.isPending}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete media
                  </Button>
                </Row>
                {update.isSuccess && <p role="status">Description saved.</p>}
                {confirmDelete && (
                  <Stack>
                    <p>
                      Delete this asset? It will become unavailable in{' '}
                      {item.attachmentCount} attachments and its publications.
                    </p>
                    <Row>
                      <Button
                        disabled={remove.isPending}
                        onClick={() =>
                          remove.mutate(item.id, {
                            onSuccess: () => setItem(null),
                          })
                        }
                      >
                        Confirm delete
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Cancel
                      </Button>
                    </Row>
                  </Stack>
                )}
              </Stack>
            )}
          </MediaViewer>
        )}
      </Stage>
    </Page>
  )
}
