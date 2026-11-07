// Signed media delivery URLs (11-MEDIA.md §6). Services only map media into a response after the
// viewer passed an authorization check; the signature then lets an <img>/<video> fetch it without
// cookies. Expiry is bucketed to the hour so URLs stay cacheable and stable across re-renders.
import { createHmac, timingSafeEqual } from 'crypto'

export type MediaVariantName = 'thumb' | 'poster' | 'stream' | 'original'

const apiBase = () => (process.env.PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')
const secret = () => process.env.MEDIA_URL_SECRET ?? process.env.SESSION_SECRET ?? 'dev-only-media-secret'

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url')

/** Expires at the end of the next whole hour: between one and two hours from now. */
function expiry(now = Date.now()) {
  return (Math.floor(now / 3_600_000) + 2) * 3600
}

export type DeliveryContext = { viewerId?: string; publicationId?: string }
const contextSuffix = (context: DeliveryContext) => context.viewerId || context.publicationId ? `:${context.viewerId ?? ''}:${context.publicationId ?? ''}` : ''

export function mediaUrl(mediaId: string | null | undefined, variant: MediaVariantName = 'thumb', context: DeliveryContext = {}): string | null {
  if (!mediaId) return null
  const exp = expiry()
  const query = new URLSearchParams({ exp: String(exp), sig: sign(`${mediaId}:${variant}:${exp}${contextSuffix(context)}`), ...context })
  return `${apiBase()}/media-files/${mediaId}/${variant}?${query}`
}

export function verifyMediaSignature(mediaId: string, variant: string, exp: number, sig: string, context: DeliveryContext = {}) {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false
  const expected = Buffer.from(sign(`${mediaId}:${variant}:${exp}${contextSuffix(context)}`))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export function uploadToken(assetId: string, expiresAt: Date) {
  const exp = Math.floor(expiresAt.getTime() / 1000)
  return `${exp}.${sign(`upload:${assetId}:${exp}`)}`
}

export function verifyUploadToken(assetId: string, token: string) {
  const [expStr, sig] = token.split('.')
  const exp = Number(expStr)
  if (!sig || !Number.isFinite(exp) || exp * 1000 < Date.now()) return false
  const expected = Buffer.from(sign(`upload:${assetId}:${exp}`))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export const localUploadUrl = (assetId: string, token: string) => `${apiBase()}/media/uploads/${assetId}/content?token=${encodeURIComponent(token)}`
