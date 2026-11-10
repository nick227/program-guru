import { usePwaReloadBlocker } from '@/lib/pwaSafety'
import { ApiError } from '@project/sdk'
import { MediaGrid } from '@/components/media/MediaGrid'
import { useState, useEffect } from 'react'
import { MediaCapture } from '@/components/media/MediaCapture'
import { useMediaLibrary, useMediaUpload, useMediaAsset, type components } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Row, Stack } from '@/components/ui/Layout'
import { useOnline } from '@/lib/useOnline'

type Asset = components['schemas']['MediaAsset']
/** Shared library controller: all network and upload behavior lives in SDK hooks. */
export function MediaLibrary({
  onSelect,
  selected,
  selecting = false,
  allowCapture = true,
}: {
  onSelect: (asset: Asset) => void
  selected?: string[]
  selecting?: boolean
  allowCapture?: boolean
}) {
  const [source, setSource] = useState<'mine' | 'platform'>('mine')
  const [q, setQ] = useState('')
  const [type, setType] = useState<Asset['type'] | undefined>()
  const [capture, setCapture] = useState(false)
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null)
  const library = useMediaLibrary({ source, q, type })
  const upload = useMediaUpload()
  usePwaReloadBlocker(upload.stage === 'uploading' || upload.stage === 'processing')
  const pendingAsset = useMediaAsset(pendingUploadId ?? '')
  const online = useOnline()

  useEffect(() => {
    if (selecting && onSelect && pendingUploadId && pendingAsset.data?.state === 'READY') {
      onSelect(pendingAsset.data)
      setPendingUploadId(null)
    }
  }, [selecting, onSelect, pendingUploadId, pendingAsset.data])
  const denied =
    library.error instanceof ApiError &&
    [401, 403, 404].includes(library.error.status)
  const assets = denied
    ? []
    : [
        ...new Map(
          library.data?.pages
            .flatMap((page) => page.data)
            .map((asset) => [asset.id, asset]) ?? [],
        ).values(),
      ]
  if (capture)
    return (
      <MediaCapture
        inDialog={selecting}
        onClose={() => setCapture(false)}
        onFile={(file) => {
          setCapture(false)
          void upload.upload(file)
        }}
      />
    )
  return (
    <Stack>
      <Row>
        {(['mine', 'platform'] as const).map((value) => (
          <Button
            key={value}
            variant={source === value ? 'default' : 'outline'}
            aria-pressed={source === value}
            onClick={() => setSource(value)}
          >
            {value === 'mine' ? 'My library' : 'Platform'}
          </Button>
        ))}
      </Row>
      <label>
        Search media
        <Input value={q} onChange={(event) => setQ(event.target.value)} />
      </label>
      <Row aria-label="Media type">
        {([undefined, 'PHOTO', 'VIDEO', 'AUDIO'] as const).map((value) => (
          <Button
            key={value ?? 'all'}
            variant={type === value ? 'default' : 'outline'}
            aria-pressed={type === value}
            onClick={() => setType(value)}
          >
            {value === 'PHOTO'
              ? 'Photos'
              : value === 'VIDEO'
                ? 'Videos'
                : value === 'AUDIO'
                  ? 'Audio'
                  : 'All'}
          </Button>
        ))}
      </Row>
      {source === 'mine' && (
        <Stack>
          <label className="text-sm">
            Upload private media
            <Input
              type="file"
              accept="image/*,video/*,audio/*"
              disabled={!online || upload.busy}
              onChange={async (event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                const asset = await upload.upload(file)
                if (asset) {
                  if (asset.state === 'READY' && selecting) {
                    onSelect(asset)
                  } else if (selecting) {
                    setPendingUploadId(asset.id)
                  }
                  void library.refetch()
                }
              }}
            />
          </label>
          {allowCapture && (
            <Button
              variant="outline"
              disabled={!online || upload.busy}
              onClick={() => setCapture(true)}
            >
              Capture
            </Button>
          )}
          <p className="text-xs text-muted">
            Uploads start private. Attached media follows the destination’s
            access rules.
          </p>
          {upload.stage !== 'idle' && (
            <p role="status">
              {upload.stage === 'uploading'
                ? 'Uploading…'
                : upload.stage === 'processing'
                  ? 'Processing. Ready items appear below.'
                  : upload.stage === 'ready'
                    ? 'Ready to attach.'
                    : upload.assetState === 'FAILED'
                      ? 'Couldn’t process this file. Choose a file to upload again.'
                      : upload.assetState === 'BLOCKED'
                        ? 'This file is unavailable.'
                        : 'Upload unavailable.'}
            </p>
          )}
          <ErrorMessage
            error={upload.error}
            retry={upload.canRetry ? () => void upload.retry() : undefined}
          />
        </Stack>
      )}
      <ErrorMessage
        error={library.error}
        retry={() => void library.refetch()}
      />
      {library.isPending ? (
        <Loading />
      ) : assets.length ? (
        <MediaGrid
          assets={assets}
          selected={selected}
          selecting={selecting}
          onSelect={onSelect}
        />
      ) : (
        !library.error && <p className="text-muted">No media found.</p>
      )}
      {library.hasNextPage && (
        <Button
          variant="outline"
          disabled={library.isFetchingNextPage}
          onClick={() => void library.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </Stack>
  )
}
