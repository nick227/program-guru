import { useState, type ReactNode } from 'react'
import { MediaTray, type MediaTrayItem } from './MediaTray'
import { MediaViewer, type ViewerItem } from './MediaViewer'

export type RelatedMediaItem = ViewerItem & { menu?: ReactNode }

/** Shared, uncollapsed media surface for Programs and Activities. */
export function RelatedMedia({ items, onAdd, pending = [], children, className, disabled = false }: {
  items: RelatedMediaItem[]
  onAdd?: (files: File[]) => unknown
  pending?: MediaTrayItem[]
  children?: (item: RelatedMediaItem) => ReactNode
  disabled?: boolean
  className?: string
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const unique = Array.from(new Map(items.map(item => [item.id, item])).values())
  const index = unique.findIndex(item => item.id === selected)
  return <section aria-label="Related Media" className={className}>
    <MediaTray className="related-media-tray" disabled={disabled} label="Related Media" onAdd={onAdd} items={[
      ...unique.map((item): MediaTrayItem => ({
        key: item.id, src: item.thumbnailUrl, alt: item.alt ?? undefined,
        type: item.type as MediaTrayItem['type'], status: 'ready', menu: item.menu, credit: item.credit ?? item.attribution ?? undefined,
        onSelect: () => setSelected(item.id),
      })), ...pending,
    ]} />
    {index >= 0 && <MediaViewer items={unique} index={index} onIndex={i => setSelected(unique[i]?.id ?? null)} onClose={() => setSelected(null)}>{unique[index] && children?.(unique[index])}</MediaViewer>}
  </section>
}
