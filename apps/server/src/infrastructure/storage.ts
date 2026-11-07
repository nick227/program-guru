// Object storage behind one interface (05-ARCHITECTURE.md §15). STORAGE_PROVIDER=local (default, a
// directory on disk) or r2 (Cloudflare R2 through the S3 API). Keys are never sent to clients.
import { createWriteStream } from 'fs'
import { mkdir, rm, stat, open } from 'fs/promises'
import { dirname, resolve, sep } from 'path'
import { pipeline } from 'stream/promises'
import type { Readable } from 'stream'
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/** Thrown when a key escapes the root or an object is missing. Callers map these to 404. */
export class StorageError extends Error {
  constructor(
    message: string,
    readonly code: 'ENOENT' | 'EINVAL_KEY',
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

export function isStorageMiss(err: unknown): boolean {
  if (err instanceof StorageError) return true
  const details = err as { code?: string; name?: string; $metadata?: { httpStatusCode?: number } } | null
  if (details?.$metadata?.httpStatusCode === 404) return true
  const code = details?.code ?? details?.name
  return code === 'ENOENT' || code === 'EINVAL_KEY' || code === 'NoSuchKey' || code === 'NotFound' || code === '404'
}

export interface StorageProvider {
  readonly kind: 'local' | 'r2'
  /** Where the browser PUTs bytes. Local returns null: the API's own upload route is used. */
  presignPut(key: string, mime: string, expiresSec: number): Promise<string | null>
  /** Short-lived URL to read an object directly, or null to stream through the API. */
  presignGet(key: string, expiresSec: number): Promise<string | null>
  write(key: string, body: Readable, maxBytes: number): Promise<number>
  read(key: string, range?: { start: number; end: number }): Promise<Readable>
  size(key: string): Promise<number | null>
  head(key: string, bytes: number): Promise<Buffer>
  remove(key: string): Promise<void>
}

class LocalStorage implements StorageProvider {
  readonly kind = 'local' as const
  constructor(private root: string) {}

  /** Resolve a relative key under the storage root; never follow `..` escapes. */
  private path(key: string) {
    if (!key || key.includes('\0') || key.startsWith('/') || key.split(/[/\\]/).includes('..')) {
      throw new StorageError('Invalid storage key', 'EINVAL_KEY')
    }
    const root = resolve(this.root)
    const p = resolve(root, key)
    if (p !== root && !p.startsWith(root + sep)) throw new StorageError('Invalid storage key', 'EINVAL_KEY')
    return p
  }

  async presignPut() {
    return null
  }
  async presignGet() {
    return null
  }

  async write(key: string, body: Readable, maxBytes: number) {
    const p = this.path(key)
    await mkdir(dirname(p), { recursive: true })
    let bytes = 0
    body.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > maxBytes) body.destroy(Object.assign(new Error('File is larger than allowed'), { code: 'TOO_LARGE' }))
    })
    try {
      await pipeline(body, createWriteStream(p))
    } catch (err) {
      await rm(p, { force: true })
      throw err
    }
    return bytes
  }

  /**
   * Open the file first so missing objects reject the promise instead of returning a ReadStream
   * that emits `error` later (unhandled → process crash). Mid-stream I/O errors still surface on
   * the returned stream; handlers must listen. An optional inclusive byte range serves HTTP Range.
   */
  async read(key: string, range?: { start: number; end: number }) {
    const p = this.path(key)
    let fh
    try {
      fh = await open(p, 'r')
    } catch (err) {
      if (isStorageMiss(err) || (err as { code?: string })?.code === 'ENOTDIR') {
        throw new StorageError('Object not found', 'ENOENT')
      }
      throw err
    }
    return fh.createReadStream({ autoClose: true, ...(range ? { start: range.start, end: range.end } : {}) })
  }

  async size(key: string) {
    try {
      return (await stat(this.path(key))).size
    } catch (err) {
      if (err instanceof StorageError && err.code === 'EINVAL_KEY') throw err
      return null
    }
  }

  async head(key: string, bytes: number) {
    let fh
    try {
      fh = await open(this.path(key), 'r')
    } catch (err) {
      if (isStorageMiss(err) || (err as { code?: string })?.code === 'ENOTDIR') {
        throw new StorageError('Object not found', 'ENOENT')
      }
      throw err
    }
    try {
      const buf = Buffer.alloc(bytes)
      const { bytesRead } = await fh.read(buf, 0, bytes, 0)
      return buf.subarray(0, bytesRead)
    } finally {
      await fh.close()
    }
  }

  async remove(key: string) {
    await rm(this.path(key), { force: true })
  }
}

class R2Storage implements StorageProvider {
  readonly kind = 'r2' as const
  private s3: S3Client
  constructor(private bucket: string) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    })
  }
  presignPut(key: string, mime: string, expiresSec: number) {
    return getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mime }), { expiresIn: expiresSec })
  }
  presignGet(key: string, expiresSec: number) {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresSec })
  }
  async write(key: string, body: Readable, maxBytes: number) {
    const chunks: Buffer[] = []
    let bytes = 0
    for await (const c of body) {
      bytes += (c as Buffer).length
      if (bytes > maxBytes) throw Object.assign(new Error('File is larger than allowed'), { code: 'TOO_LARGE' })
      chunks.push(c as Buffer)
    }
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: Buffer.concat(chunks) }))
    return bytes
  }
  async read(key: string, range?: { start: number; end: number }) {
    try {
      const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}) }))
      return out.Body as Readable
    } catch (err) {
      if (isStorageMiss(err)) throw new StorageError('Object not found', 'ENOENT')
      throw err
    }
  }
  async size(key: string) {
    try {
      return (await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))).ContentLength ?? null
    } catch (err) {
      if (isStorageMiss(err)) return null
      throw err
    }
  }
  async head(key: string, bytes: number) {
    try {
      const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }))
      return Buffer.from(await out.Body!.transformToByteArray())
    } catch (err) {
      if (isStorageMiss(err)) throw new StorageError('Object not found', 'ENOENT')
      throw err
    }
  }
  async remove(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}

let provider: StorageProvider | null = null

export function storage(): StorageProvider {
  if (provider) return provider
  if (process.env.STORAGE_PROVIDER === 'r2') {
    if (!process.env.R2_BUCKET) throw new Error('R2_BUCKET is required when STORAGE_PROVIDER=r2')
    provider = new R2Storage(process.env.R2_BUCKET)
  } else {
    // The API and worker are separate Railway services with separate disks: local storage there would
    // let the worker write variants the API can never read. Production must use R2.
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LOCAL_STORAGE !== 'true') {
      throw new Error('STORAGE_PROVIDER=local is not allowed in production; set STORAGE_PROVIDER=r2')
    }
    provider = new LocalStorage(process.env.STORAGE_DIR ?? resolve(__dirname, '../../../../uploads'))
  }
  return provider
}

/** Tests point storage at a temporary directory. */
export function setStorageRoot(root: string) {
  provider = new LocalStorage(root)
}
