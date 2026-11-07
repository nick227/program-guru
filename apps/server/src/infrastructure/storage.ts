// Object storage behind one interface (05-ARCHITECTURE.md §15). STORAGE_PROVIDER=local (default, a
// directory on disk) or r2 (Cloudflare R2 through the S3 API). Keys are never sent to clients.
import { createReadStream, createWriteStream } from 'fs'
import { mkdir, rm, stat, open } from 'fs/promises'
import { dirname, resolve } from 'path'
import { pipeline } from 'stream/promises'
import type { Readable } from 'stream'
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export interface StorageProvider {
  readonly kind: 'local' | 'r2'
  /** Where the browser PUTs bytes. Local returns null: the API's own upload route is used. */
  presignPut(key: string, mime: string, expiresSec: number): Promise<string | null>
  /** Short-lived URL to read an object directly, or null to stream through the API. */
  presignGet(key: string, expiresSec: number): Promise<string | null>
  write(key: string, body: Readable, maxBytes: number): Promise<number>
  read(key: string): Promise<Readable>
  size(key: string): Promise<number | null>
  head(key: string, bytes: number): Promise<Buffer>
  remove(key: string): Promise<void>
}

class LocalStorage implements StorageProvider {
  readonly kind = 'local' as const
  constructor(private root: string) {}
  private path(key: string) {
    const p = resolve(this.root, key)
    if (!p.startsWith(resolve(this.root) + '/')) throw new Error('Invalid storage key')
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
  async read(key: string) {
    return createReadStream(this.path(key))
  }
  async size(key: string) {
    try {
      return (await stat(this.path(key))).size
    } catch {
      return null
    }
  }
  async head(key: string, bytes: number) {
    const fh = await open(this.path(key), 'r')
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
  async read(key: string) {
    const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    return out.Body as Readable
  }
  async size(key: string) {
    try {
      return (await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))).ContentLength ?? null
    } catch {
      return null
    }
  }
  async head(key: string, bytes: number) {
    const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }))
    return Buffer.from(await out.Body!.transformToByteArray())
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
    provider = new LocalStorage(process.env.STORAGE_DIR ?? resolve(__dirname, '../../../../uploads'))
  }
  return provider
}

/** Tests point storage at a temporary directory. */
export function setStorageRoot(root: string) {
  provider = new LocalStorage(root)
}
