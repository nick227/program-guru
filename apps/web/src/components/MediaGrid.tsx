import { useState } from 'react'
import type { components } from '@project/sdk'
import { Button } from './ui/Button'
import { Grid } from './ui/Layout'
type Asset = components['schemas']['MediaAsset']
export type MediaVisual = {
  id: string
  thumbnailUrl?: string | null
  alt?: string | null
  type?: string
  state?: Asset['state']
}
export function MediaItem({
  asset,
  selected,
  disabled,
  onSelect,
}: {
  asset: MediaVisual
  selected?: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const label = asset.alt || asset.type || 'Open media'
  return (
    <Button
      variant="outline"
      className="relative h-auto min-w-0 flex-col overflow-hidden p-1"
      disabled={disabled}
      aria-pressed={selected}
      aria-label={asset.state ? `${label} · ${asset.state}` : label}
      onClick={(event) => {
        event.currentTarget.focus()
        onSelect()
      }}
    >
      {asset.type !== 'AUDIO' &&
      asset.thumbnailUrl &&
      failedUrl !== asset.thumbnailUrl ? (
        <img
          loading="lazy"
          onError={() => setFailedUrl(asset.thumbnailUrl ?? null)}
          src={asset.thumbnailUrl}
          alt=""
          className="aspect-square w-full rounded object-cover"
        />
      ) : (
        <span className="flex aspect-square w-full items-center justify-center text-xs">
          {asset.type || 'Media'}
        </span>
      )}
      {(selected || (asset.state && asset.state !== 'READY')) && (
        <span className="w-full truncate text-xs" title={asset.state}>
          {selected ? 'Selected' : asset.state?.toLowerCase()}
        </span>
      )}
    </Button>
  )
}
export function MediaGrid({
  assets,
  selected = [],
  onSelect,
  selecting = false,
}: {
  assets: Asset[]
  selected?: string[]
  onSelect: (asset: Asset) => void
  selecting?: boolean
}) {
  return (
    <Grid className="grid-cols-5 gap-2 sm:grid-cols-6">
      {assets.map((asset) => (
        <MediaItem
          key={asset.id}
          asset={asset}
          selected={selecting ? selected.includes(asset.id) : undefined}
          disabled={
            selecting &&
            (asset.state !== 'READY' || selected.includes(asset.id))
          }
          onSelect={() => onSelect(asset)}
        />
      ))}
    </Grid>
  )
}
