import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  putUploadContent,
  useCompleteMediaUpload,
  useCreateMediaUpload,
  useMyMedia,
  usePlatformMedia,
} from '@project/sdk'
import { toast } from 'sonner'
import { Page, Stage, Stack, Row, Panel } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { ThumbnailGrid } from '@/components/ThumbnailGrid'
import { MediaViewer, type ViewerItem } from '@/components/MediaViewer'
import { Back } from '@/components/Navigation'
import { safeReturn } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'

type Tab = 'library' | 'platform' | 'upload'

export function MediaStudioPage() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>('library')
  const [q, setQ] = useState('')
  const mine = useMyMedia(q)
  const platform = usePlatformMedia(q)
  const createUpload = useCreateMediaUpload()
  const completeUpload = useCompleteMediaUpload()
  const fileRef = useRef<HTMLInputElement>(null)
  const online = useOnline()
  const [viewer, setViewer] = useState<{
    items: ViewerItem[]
    index: number
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const rows =
    tab === 'platform'
      ? (platform.data?.pages.flatMap((p) => p.data) ?? [])
      : (mine.data?.pages.flatMap((p) => p.data) ?? [])
  const loading = tab === 'platform' ? platform.isPending : mine.isPending
  const error = tab === 'platform' ? platform.error : mine.error
  async function onFile(file: File) {
    setBusy(true)
    try {
      const ticket = await createUpload.mutateAsync({
        filename: file.name || 'upload.bin',
        mime: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      })
      await putUploadContent(ticket, file)
      await completeUpload.mutateAsync(ticket.uploadId)
      toast.success('Upload complete')
      setTab('library')
      await mine.refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  return (
    <Page>
      <Stage>
        <Back to={safeReturn(params.get('returnTo'))}>Back</Back>
        <h1>Media Studio</h1>
        <p className="text-muted">
          Choose from your library, platform assets, or upload new media.
        </p>
        <Row>
          {(
            [
              ['library', 'Library'],
              ['platform', 'Platform'],
              ['upload', 'Upload'],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              variant={tab === id ? 'default' : 'outline'}
              onClick={() => setTab(id)}
            >
              {label}
            </Button>
          ))}
        </Row>
        {tab !== 'upload' && (
          <label className="space-y-2">
            Search
            <Input value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        )}
        <ErrorMessage
          error={error || createUpload.error || completeUpload.error}
          retry={() =>
            void (tab === 'platform' ? platform.refetch() : mine.refetch())
          }
        />
        {tab === 'upload' ? (
          <Panel>
            <Stack>
              <p>Uploads stay private until you attach or publish them.</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*,audio/*"
                className="block w-full text-sm"
                disabled={!online || busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void onFile(file)
                }}
              />
              {busy && <p role="status">Uploading…</p>}
              <Button
                variant="outline"
                disabled={!online || busy}
                onClick={() => fileRef.current?.click()}
              >
                Choose file
              </Button>
              <p className="text-xs text-muted">
                Record from the camera will use the same private upload path
                when capture presets land.
              </p>
            </Stack>
          </Panel>
        ) : loading ? (
          <Loading />
        ) : (
          <ThumbnailGrid
            columns={4}
            items={rows.map((m) => ({
              id: m.id,
              thumbnailUrl: m.thumbnailUrl,
              type: m.type,
              alt: m.alt,
            }))}
            empty={
              tab === 'platform'
                ? 'No platform media matched.'
                : 'No media in your library yet.'
            }
            onAdd={tab === 'library' ? () => setTab('upload') : undefined}
            onSelect={(id) =>
              setViewer({
                items: rows.map((m) => ({
                  id: m.id,
                  thumbnailUrl: m.thumbnailUrl,
                  type: m.type,
                  alt: m.alt,
                })),
                index: rows.findIndex((m) => m.id === id),
              })
            }
          />
        )}
        {tab !== 'upload' &&
          (tab === 'platform' ? platform : mine).hasNextPage && (
            <Button
              variant="outline"
              onClick={() =>
                void (tab === 'platform'
                  ? platform.fetchNextPage()
                  : mine.fetchNextPage())
              }
            >
              Load more
            </Button>
          )}
        {viewer && viewer.index >= 0 && (
          <MediaViewer
            items={viewer.items}
            index={viewer.index}
            onClose={() => setViewer(null)}
            onIndex={(i) => setViewer({ ...viewer, index: i })}
          />
        )}
      </Stage>
    </Page>
  )
}
