// Media delivery URLs (11-MEDIA.md §6). Every URL handed to a client goes through here so the
// storage provider and signing policy can change in one place.
//
// Until the media slice lands, assets resolve to the API's own authorizing endpoint, which never
// exposes storage keys. Platform and public media can later move to CDN URLs without API changes.

const apiBase = () => (process.env.PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

export type MediaVariantName = 'thumb' | 'poster' | 'stream' | 'original'

/** URL a client can use for an image tile. Returns null when there is no asset. */
export function mediaUrl(mediaId: string | null | undefined, variant: MediaVariantName = 'thumb'): string | null {
  if (!mediaId) return null
  return `${apiBase()}/media/${mediaId}/file?variant=${variant}`
}
